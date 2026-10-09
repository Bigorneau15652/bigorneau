import { EditorView } from "@codemirror/view";
import { t } from "./i18n";
import { setActiveRange, tempLineField } from "./active-chapter";
import { moveCursorOutOfHidden, setHideEnabled, setHideInactive, setHideMeta } from "./note-hide";
import { openBlankLine, releaseTempLine } from "./temp-line";
import { revealRange } from "./reveal";
import { Editor, ItemView, MarkdownView, Menu, Modal, Notice, Platform, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { addNode, arrowTarget, cleanTitle, countHeadings, deleteNodes, DeletionReport, describeDeletion, duplicateNodes, EditResult, extractBranches, insertBranches, moveNode, renameTitle } from "./edit";
import type MindmapWritingPlugin from "./main";
import { resolveFixed } from "./fixed";
import { branchToFloat, createFloat, floatToBranch, moveFloat } from "./float";
import { activeLines, applyLineEdits, flattenDoc, isFloatKey, isFloatRoot, isHiddenKey, LineEdit, MmDoc, nodeAtLine, nodeByKey, parseNote, serializeNote } from "./model";
import { insertLink, insertWebLink, linkHeading, MapLink, moveLinkTo, openableUrl, parseLinks, removeLink, removeWebLink, replaceLink, replaceWebLink, sameHeading, WebLink, webLinks } from "./links";
import type { DialogValues } from "./node-dialog";
import { appearanceDefaults, PanePosition } from "./settings";
import { MetaChange, metaEditsFor, planReset, planStyle } from "./style-edit";
import type { MmMeta, StylePatch } from "./style";
import { MapEdit, MapRenderer } from "./renderer";

// Fenetre de confirmation avant de supprimer des titres et leur contenu.
class ConfirmDeleteModal extends Modal {
  private confirmed = false;

  constructor(app: import("obsidian").App, private report: DeletionReport, private done: (ok: boolean) => void) {
    super(app);
  }

  onOpen() {
    const r = this.report;
    const what = r.nodes === 1 ? `« ${r.titles[0]} »` : t(`{0} titres`, r.nodes);
    this.titleEl.setText(t(`Supprimer {0} ?`, what));
    const parts: string[] = [];
    if (r.subtitles > 0) parts.push(r.subtitles > 1 ? t(`{0} sous-titres`, r.subtitles) : t(`1 sous-titre`));
    parts.push(r.words > 1 ? t(`environ {0} mots de texte`, r.words) : t(`environ 1 mot de texte`));
    this.contentEl.createEl(`p`, { text: t(`Cette suppression retire aussi {0}. Vous pourrez l'annuler avec l'historique de la note (Cmd ou Ctrl + Z).`, parts.join(t(` et `))) });
    let confirmButton: HTMLElement | null = null;
    new Setting(this.contentEl)
      .addButton((b) => {
        b.setButtonText(`Supprimer`).setWarning().onClick(() => {
          this.confirmed = true;
          this.close();
        });
        confirmButton = b.buttonEl;
      })
      .addButton((b) => b.setButtonText(`Annuler`).onClick(() => this.close()));
    (confirmButton as HTMLElement | null)?.focus();
  }

  onClose() {
    this.contentEl.empty();
    this.done(this.confirmed);
  }
}

export const VIEW_TYPE_MINDMAP = `mindmap-writing-view`;

export class MindmapView extends ItemView {
  private plugin: MindmapWritingPlugin;
  private renderer: MapRenderer | null = null;
  private mapHost!: HTMLElement;

  private doc: MmDoc | null = null;
  private renderToken = 0;
  private selectedKey: string | null = null;
  private noteLeaf: WorkspaceLeaf | null = null;
  private notePosition: PanePosition | null = null;
  private noteCursors = new Map<string, { line: number; ch: number }>();
  private lastNoteLine = -1;
  private lastNoteLines = -1;
  private currentFile: TFile | null = null;
  private mapKey = ``;
  // Cartes visitees par des liens vers d'autres notes, pour le bouton Retour.
  private history: { file: TFile; key: string | null }[] = [];
  private navigating = false;
  private editQueue: Promise<void> = Promise.resolve();

  constructor(leaf: WorkspaceLeaf, plugin: MindmapWritingPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return t(`Bigorneau`);
  }

  getIcon(): string {
    return `network`;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass(`mmw-view`);
    this.mapHost = this.contentEl.createDiv({ cls: `mmw-map-host` });
    // Revenir a la carte retire la ligne vierge ajoutee sous un titre si on n'y a rien ecrit.
    this.registerDomEvent(this.mapHost, `focusin`, () => this.releaseTemp());
    // Cmd ou Ctrl + D : enregistre aupres d'Obsidian pour cette vue, car un raccourci general peut l'intercepter
    // avant la carte. Il n'agit que si la carte a le focus.
    this.scope?.register([`Mod`], `d`, () => {
      const active = this.mapHost.ownerDocument.activeElement;
      if (!active || !this.mapHost.contains(active)) return true;
      this.duplicateSelection();
      return false;
    });

    this.renderer = new MapRenderer(this.mapHost, () => this.plugin.settings, {
      onChange: (patch) => void this.plugin.updateSettings(patch),
      onStyle: (patch, individual) => void this.applyStyle(patch, individual),
      onResetStyle: (individual) => void this.resetStyle(individual),
      onUndo: () => this.undoRedo(`undo`),
      onRedo: () => this.undoRedo(`redo`),
      onOpenSettings: () => this.plugin.openSettings(),
      onSaveProfile: () => this.plugin.openSaveProfile(),
      onLoadProfile: () => void this.plugin.openLoadProfile(),
      onSelect: (key) => void this.onSelect(key),
      // Apres les modifications en cours (un titre valide juste avant, par exemple).
      onEnter: () => {
        this.editQueue = this.editQueue.then(() => this.focusNote()).catch(() => undefined);
      },
      onEdit: (edit) => void this.onEdit(edit),
      onMessage: (text) => new Notice(text),
      onContextMenu: (key, event) => this.showContextMenu(key, event),
      onDetails: (key, values) => this.applyDetails(key, values),
      onToggleHidden: (key) => void this.toggleHidden(key),
      getFileName: () => this.plugin.lastFile?.name ?? `Note.md`,
      onLinkCreate: (from, to, replace) => this.queue(() => this.createLink(from, to, replace)),
      onLinkMove: (link, toLine) => this.queue(() => this.moveLinkLine(link, toLine)),
      onLinkExternal: (from, path, heading, replace) => this.queue(() => this.createExternalLink(from, path, heading, replace)),
      getVaultFiles: () => this.vaultFiles(),
      getHeadings: (path) => this.vaultHeadings(path),
      createNote: (name) => this.createNote(name),
      getNewNoteFolder: () => this.newNoteFolder(),
      onWebOpen: (links, event) => this.openWeb(links, event),
      onLinkDelete: (link) => this.queue(() => this.deleteLink(link)),
      onLinkOpen: (links, event) => this.openLinks(links, event),
      onInternalLinks: (links, event) => this.goToLinks(links, event),
      onBack: () => void this.goBack(),
      onAddFixed: () => void this.addFixedNote(),
    });
    await this.refresh();
  }

  async onClose() {
    this.clearActive();
    this.renderer?.destroy();
    this.renderer = null;
  }

  // ---------------------------------------------------------------- lecture du fichier

  async refresh() {
    const renderer = this.renderer;
    if (!renderer) return;
    const token = ++this.renderToken;
    const file = this.plugin.lastFile;

    if (!file) {
      this.doc = null;
      renderer.setDoc(null, ``, true);
      return;
    }
    if (file !== this.currentFile) {
      // Autre note : la selection et les positions memorisees ne s'appliquent plus.
      this.currentFile = file;
      if (!this.navigating) {
        this.history = [];
        renderer.setBackAvailable(false);
      }
      this.mapKey = file.path;
      this.selectedKey = null;
      this.noteCursors.clear();
      this.lastNoteLine = -1;
      this.lastNoteLines = -1;
    }
    const text = this.plugin.getOpenText(file) ?? (await this.app.vault.cachedRead(file));
    if (token !== this.renderToken || this.renderer !== renderer) return;
    const doc = parseNote(text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, this.mapKey, serializeNote(doc) === text);
  }

  // Redessine la carte apres un changement de reglage, sans relire le fichier.
  redraw() {
    this.renderer?.rebuild();
    const position = this.plugin.settings.panePosition;
    if (this.notePosition !== null && position !== this.notePosition) {
      // La position de la note a change : le volet est recree au bon endroit.
      const old = this.noteLeaf;
      this.noteLeaf = null;
      this.notePosition = null;
      old?.detach();
      if (this.selectedKey) void this.revealInNote(this.selectedKey, false);
      return;
    }
    this.updateActiveRange();
  }

  // ---------------------------------------------------------------- modifications de la structure

  // Creer, renommer ou supprimer depuis la carte : le nouveau texte est calcule puis ecrit dans l'editeur
  // de la note en une seule transaction, ce qui rend l'annulation d'Obsidian utilisable.
  // Les modifications se font l'une apres l'autre : des appuis rapproches sur les fleches ne se melangent pas.
  private onEdit(edit: MapEdit) {
    this.editQueue = this.editQueue.then(() => this.runEdit(edit)).catch(() => undefined);
  }

  private async runEdit(edit: MapEdit) {
    const file = this.plugin.lastFile;
    const renderer = this.renderer;
    if (!file || !renderer) return;
    const readText = async (): Promise<string> => {
      const editor = this.plugin.getOpenEditor(file);
      return editor ? editor.getValue() : await this.app.vault.read(file);
    };

    // Copier et couper : le presse-papiers recoit les titres en Markdown. Couper supprime ensuite, sans confirmation
    // (la note garde l'historique d'annulation).
    if (edit.kind === `copy` || edit.kind === `cut`) {
      const markdown = extractBranches(await readText(), file.name, edit.keys);
      if (markdown === null) {
        new Notice(t(`Le nom de la note ne se copie pas : sélectionnez un titre.`));
        return;
      }
      try {
        await navigator.clipboard.writeText(markdown);
      } catch {
        new Notice(t(`Impossible d'écrire dans le presse-papiers.`));
        return;
      }
      const count = countHeadings(markdown);
      new Notice(`${count} titre${count > 1 ? `s` : ``} ${edit.kind === `cut` ? `coupé` : `copié`}${count > 1 ? `s` : ``}.`, 1500);
      if (edit.kind === `copy`) return;
    }

    if (edit.kind === `delete`) {
      const report = describeDeletion(await readText(), file.name, edit.keys);
      if (report.nodes === 0) {
        new Notice(t(`La racine ne peut pas être supprimée.`));
        return;
      }
      const ok = await new Promise<boolean>((resolve) => new ConfirmDeleteModal(this.app, report, resolve).open());
      if (!ok) {
        renderer.focus();
        return;
      }
    }

    const before = await readText();
    // Une direction (fleches) s'applique a la case selectionnee au moment du traitement, pas a celle de l'appui.
    if (edit.kind === `move` && edit.dir) edit.key = renderer.getSelectedKey() ?? edit.key;
    if (edit.kind === `rename` && edit.key === `r`) {
      await this.renameFile(file, edit.title ?? ``);
      return;
    }
    let result: EditResult | null;
    if (edit.kind === `delete` || edit.kind === `cut`) result = deleteNodes(before, file.name, edit.keys);
    else if (edit.kind === `duplicate`) {
      result = duplicateNodes(before, file.name, edit.keys);
      if (!result) new Notice(t(`Le nom de la note ne se duplique pas : sélectionnez un titre.`));
    } else if (edit.kind === `paste` || edit.kind === `pasteAfter`) {
      let clip = ``;
      try {
        clip = await navigator.clipboard.readText();
      } catch {
        new Notice(t(`Impossible de lire le presse-papiers.`));
        return;
      }
      let parentKey = edit.key;
      let index = Number.MAX_SAFE_INTEGER;
      if (edit.kind === `pasteAfter` && !isFloatRoot(edit.key)) {
        const parts = edit.key.split(`.`);
        index = Number(parts.pop()) + 1;
        parentKey = parts.join(`.`);
      }
      result = edit.kind === `pasteAfter` && (edit.key === `r` || isFloatRoot(edit.key)) ? null : insertBranches(before, file.name, parentKey, index, clip);
      if (!result) new Notice(t(`Le presse-papiers ne contient pas de titres Markdown à coller ici (ou le niveau 6 serait dépassé).`));
    } else if (edit.kind === `createFloat`) {
      result = createFloat(before, file.name, this.plugin.settings.floatLevel, { x: edit.x, y: edit.y });
    } else if (edit.kind === `float`) {
      // Un titre de la carte tire a l'exterieur devient un sujet flottant ; un sujet flottant change de place.
      const pos = { x: edit.x, y: edit.y };
      result = isFloatRoot(edit.key) ? moveFloat(before, file.name, edit.key, pos) : branchToFloat(before, file.name, edit.key, pos);
      if (!result) new Notice(t(`Ce titre ne peut pas devenir un sujet flottant.`));
    } else if (edit.kind === `rename`) result = renameTitle(before, file.name, edit.key, edit.title ?? ``);
    else if (edit.kind === `move`) {
      if (isFloatRoot(edit.key) && !edit.dir) {
        // Un sujet flottant depose pres de la structure entre dans la carte : son niveau s'adapte a sa nouvelle place.
        result = floatToBranch(before, file.name, edit.key, edit.parentKey ?? `r`, edit.index ?? 0);
        if (!result) new Notice(t(`Déplacement impossible : le niveau de titre maximum (6) serait dépassé.`));
        if (!result) {
          renderer.resetPreview();
          return;
        }
        await this.writeText(file, before, result.text);
        const doc = parseNote(result.text, file.name);
        this.doc = doc;
        renderer.setDoc(doc, this.mapKey, serializeNote(doc) === result.text);
        if (result.key) {
          this.selectedKey = result.key;
          renderer.reveal(result.key);
          renderer.select(result.key, false);
          await this.revealInNote(result.key, false);
          this.updateActiveRange();
        }
        renderer.focus();
        return;
      }
      const target = edit.dir
        ? arrowTarget(parseNote(before, file.name), edit.key, edit.dir)
        : { parentKey: edit.parentKey ?? `r`, index: edit.index ?? 0 };
      result = target ? moveNode(before, file.name, edit.key, target.parentKey, target.index) : null;
      if (!target) new Notice(this.noMoveReason(edit.dir), 2500);
      else if (!result) new Notice(t(`Déplacement impossible : le niveau de titre maximum (6) serait dépassé.`));
      if (!result || result.text === before) {
        renderer.resetPreview();
        return;
      }
    } else if (edit.kind === `sibling` && isFloatRoot(edit.key)) {
      // Entree sur un sujet flottant : un autre sujet flottant, juste a cote.
      const node = nodeByKey(parseNote(before, file.name), edit.key);
      const at = node?.float;
      result = createFloat(before, file.name, this.plugin.settings.floatLevel, { x: (at?.x ?? 0) + 40, y: (at?.y ?? 0) + 50 });
    } else {
      result = addNode(before, file.name, edit.key, edit.kind === `sibling` ? `sibling` : `child`);
      if (!result) new Notice(t(`Le niveau de titre maximum (6) est atteint : impossible d'ajouter un sous-titre.`));
    }
    if (!result) {
      renderer.resetPreview();
      return;
    }

    await this.writeText(file, before, result.text);
    const doc = parseNote(result.text, file.name);
    this.doc = doc;
    renderer.setDoc(doc, this.mapKey, serializeNote(doc) === result.text);
    const key = result.key;
    if (edit.kind !== `rename` && key) {
      this.selectedKey = key;
      renderer.reveal(key);
      renderer.select(key, false);
      await this.revealInNote(key, false);
      this.updateActiveRange();
    }
    // Une case creee s'ouvre en saisie ; apres les autres operations, le clavier reste sur la carte.
    if (edit.kind === `child` || edit.kind === `sibling` || edit.kind === `createFloat`) {
      if (key) renderer.startRename(key);
    } else if (edit.kind !== `rename`) {
      renderer.focus();
    }
  }

  // Validation de la fenetre d'un titre : le titre s'ecrit dans la note ; le titre court, le commentaire et les
  // etiquettes vont dans le commentaire invisible sous le titre. Une seule modification de la note (une seule
  // etape d'annulation).
  private applyDetails(key: string, values: DialogValues) {
    this.editQueue = this.editQueue.then(() => this.runDetails(key, values)).catch(() => undefined);
  }

  private async runDetails(key: string, values: DialogValues) {
    const file = this.plugin.lastFile;
    const renderer = this.renderer;
    if (!file || !renderer) return;
    if (key === `r`) {
      await this.renameFile(file, values.title);
      renderer.focus();
      return;
    }
    const editor = this.plugin.getOpenEditor(file);
    const before = editor ? editor.getValue() : await this.app.vault.read(file);
    let text = before;
    const node = nodeByKey(parseNote(text, file.name), key);
    if (!node) return;
    if (cleanTitle(values.title) !== node.title) {
      const renamed = renameTitle(text, file.name, key, values.title);
      if (renamed) text = renamed.text;
    }
    const doc = parseNote(text, file.name);
    const current = nodeByKey(doc, key);
    if (!current) return;
    const meta: MmMeta = { ...(current.meta ?? {}) };
    const short = values.short.trim();
    const comment = values.comment.trim();
    if (short) meta.short = short;
    else delete meta.short;
    if (comment) meta.comment = comment;
    else delete meta.comment;
    if (values.tags.length > 0) meta.tags = values.tags;
    else delete meta.tags;
    const edits = metaEditsFor(doc, [{ key, meta }]);
    if (edits.length > 0) text = applyLineEdits(text, edits, doc.eol);
    if (text === before) {
      renderer.focus();
      return;
    }
    await this.writeText(file, before, text);
    const next = parseNote(text, file.name);
    this.doc = next;
    renderer.setDoc(next, this.mapKey, serializeNote(next) === text);
    this.updateActiveRange();
    renderer.focus();
  }

  // ---------------------------------------------------------------- liens entre titres

  private queue(job: () => Promise<void>) {
    this.editQueue = this.editQueue.then(job).catch(() => undefined);
  }

  private linkName(file: TFile): string {
    return file.name.replace(/\.md$/i, ``);
  }

  // Ecrit le nouveau texte de la note et met la carte a jour.
  private async commitText(file: TFile, before: string, after: string) {
    if (after === before) return;
    await this.writeText(file, before, after);
    const next = parseNote(after, file.name);
    this.doc = next;
    this.renderer?.setDoc(next, this.mapKey, serializeNote(next) === after);
    this.updateActiveRange();
  }

  private async currentText(file: TFile): Promise<string> {
    const editor = this.plugin.getOpenEditor(file);
    return editor ? editor.getValue() : await this.app.vault.read(file);
  }

  // Lien d'un titre a un autre de la meme note : une ligne [[Note#Titre|Lien vers Titre]] au debut du texte du titre de depart.
  private async createLink(from: string, to: string, replace?: MapLink) {
    const file = this.plugin.lastFile;
    if (!file) return;
    const before = await this.currentText(file);
    const doc = parseNote(before, file.name);
    const target = nodeByKey(doc, to);
    if (!target || !nodeByKey(doc, from)) return;
    if (linkHeading(target.title) === ``) {
      new Notice(t(`Le titre d'arrivée est vide : donnez-lui un nom avant de le relier.`));
      return;
    }
    let after: string | null;
    if (replace) {
      const current = this.findLink(doc, file, replace);
      after = current ? replaceLink(before, doc, current, this.linkName(file), target.title) : null;
    } else after = insertLink(before, doc, from, this.linkName(file), target.title);
    if (after) await this.commitText(file, before, after);
  }

  // Le lien tel qu'il est maintenant dans la note (ses lignes ont pu changer depuis qu'il a ete affiche).
  private findLink(doc: MmDoc, file: TFile, link: MapLink): MapLink | null {
    return parseLinks(doc, file.name).find((l) => l.from === link.from && l.line === link.line && l.note === link.note && l.heading === link.heading) ?? null;
  }

  private async moveLinkLine(link: MapLink, toLine: number) {
    const file = this.plugin.lastFile;
    if (!file) return;
    const before = await this.currentText(file);
    const doc = parseNote(before, file.name);
    const current = this.findLink(doc, file, link);
    const after = current ? moveLinkTo(before, doc, current, toLine) : null;
    if (after) await this.commitText(file, before, after);
  }

  private async deleteLink(link: MapLink) {
    const file = this.plugin.lastFile;
    if (!file) return;
    const before = await this.currentText(file);
    const doc = parseNote(before, file.name);
    const now = parseLinks(doc, file.name).find((l) => l.from === link.from && l.line === link.line && l.heading === link.heading);
    if (!now) return;
    await this.commitText(file, before, removeLink(before, doc, now));
  }

  // Notes proposees pour un lien vers une autre note : celles du coffre, sauf la note de la carte.
  private vaultFiles(): string[] {
    const current = this.plugin.lastFile;
    return this.app.vault
      .getMarkdownFiles()
      .map((f) => f.path)
      .filter((p) => !current || p !== current.path);
  }

  // Dossier des nouvelles notes, selon le reglage : dossier choisi, dossier de la note courante ou racine du coffre.
  private newNoteFolder(): string {
    const s = this.plugin.settings;
    if (s.newNoteMode === `fixed`) return s.newNoteFolder;
    if (s.newNoteMode === `current`) return this.plugin.lastFile?.parent?.path.replace(/^\/$/, ``) ?? ``;
    return ``;
  }

  // Cree une note vide dans le dossier prevu (cree au besoin) et renvoie son chemin ; null si la creation echoue.
  private async createNote(name: string): Promise<string | null> {
    const folder = this.newNoteFolder();
    try {
      let built = ``;
      for (const part of folder.split(`/`).filter((p) => p !== ``)) {
        built = built === `` ? part : `${built}/${part}`;
        if (!this.app.vault.getAbstractFileByPath(built)) await this.app.vault.createFolder(built);
      }
      const path = `${built === `` ? `` : `${built}/`}${name}.md`;
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) return existing.path;
      const file = await this.app.vault.create(path, ``);
      new Notice(t(`Note créée : {0}`, file.path));
      return file.path;
    } catch {
      new Notice(t(`La note n'a pas pu être créée.`));
      return null;
    }
  }

  private async vaultHeadings(path: string): Promise<{ title: string; level: number }[]> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return [];
    const text = await this.app.vault.cachedRead(file);
    return flattenDoc(parseNote(text, file.name))
      .filter((e) => e.key !== `r` && linkHeading(e.node.title) !== ``)
      .map((e) => ({ title: e.node.title, level: e.node.level }));
  }

  // Lien vers une autre note du coffre (et, si on l'a choisi, un de ses titres).
  private async createExternalLink(from: string, path: string, heading: string | null, replace?: MapLink) {
    const file = this.plugin.lastFile;
    const target = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(target instanceof TFile)) return;
    const before = await this.currentText(file);
    const doc = parseNote(before, file.name);
    const name = this.app.metadataCache.fileToLinktext(target, file.path, true);
    let after: string | null;
    if (replace) {
      const current = this.findLink(doc, file, replace);
      after = current ? replaceLink(before, doc, current, name, heading) : null;
    } else after = insertLink(before, doc, from, name, heading);
    if (after) await this.commitText(file, before, after);
  }

  // ---------------------------------------------------------------- liens web

  private newWebLink(key: string) {
    this.renderer?.openWebDialog({
      title: t(`Nouveau lien web`),
      url: ``,
      label: ``,
      embed: false,
      onSubmit: (v) => this.queue(() => this.changeWebLink(key, -1, v)),
    });
  }

  private editWebLink(key: string, index: number, w: WebLink) {
    this.renderer?.openWebDialog({
      title: t(`Modifier le lien web`),
      url: w.url,
      label: w.text,
      embed: w.embed,
      onSubmit: (v) => this.queue(() => this.changeWebLink(key, index, v)),
      onDelete: () => this.queue(() => this.changeWebLink(key, index, null)),
    });
  }

  // Ajoute (index -1), modifie ou retire (valeurs nulles) un lien web du paragraphe d'un titre.
  private async changeWebLink(key: string, index: number, v: { url: string; label: string; embed: boolean } | null) {
    const file = this.plugin.lastFile;
    if (!file) return;
    const before = await this.currentText(file);
    const doc = parseNote(before, file.name);
    let after: string | null;
    if (index < 0) after = v ? insertWebLink(before, doc, key, v.url, v.label, v.embed) : null;
    else if (v) after = replaceWebLink(before, doc, key, index, v.url, v.label, v.embed);
    else after = removeWebLink(before, doc, key, index);
    if (after) await this.commitText(file, before, after);
    else new Notice(t(`Ce lien n'a pas pu être modifié : vérifiez l'adresse.`));
  }

  // Clic droit > Modifier un lien : liens vers des notes ou des titres, et liens web, du titre clique.
  private chooseLinkToEdit(key: string, event: MouseEvent) {
    const renderer = this.renderer;
    const file = this.plugin.lastFile;
    if (!renderer || !file || !this.doc) return;
    const entries: { label: string; run: () => void }[] = [];
    for (const l of parseLinks(this.doc, file.name).filter((x) => x.from === key)) {
      const label = l.external ? t(`Note : {0}`, `${l.note}${l.heading ? ` › ${l.heading}` : ``}`) : t(`Flèche vers {0}`, l.heading ?? ``);
      entries.push({ label, run: () => renderer.editLink(l) });
    }
    webLinks(this.doc, key).forEach((w, i) => entries.push({ label: `Web : ${w.label}`, run: () => this.editWebLink(key, i, w) }));
    if (entries.length === 0) return;
    if (entries.length === 1) {
      entries[0].run();
      return;
    }
    const menu = new Menu();
    for (const e of entries) menu.addItem((item) => item.setTitle(e.label).setIcon(`pencil`).onClick(e.run));
    menu.showAtMouseEvent(event);
  }

  // Clic sur la mappemonde d'un titre : ouvre la page, ou propose le choix s'il y en a plusieurs.
  private openWeb(links: WebLink[], event: PointerEvent) {
    if (links.length === 0) return;
    // Une video integree s'ouvre sur la page de la video, pas sur son adresse d'integration.
    const open = (url: string) => window.open(openableUrl(url), `_blank`, `noopener`);
    if (links.length === 1) {
      open(links[0].url);
      return;
    }
    const menu = new Menu();
    for (const l of links) menu.addItem((item) => item.setTitle(l.label).setIcon(`globe`).onClick(() => open(l.url)));
    menu.showAtMouseEvent(event);
  }

  // Clic sur le repere d'un titre relie a d'autres notes : ouvre la carte de la note visee.
  private openLinks(links: MapLink[], event: PointerEvent) {
    if (links.length === 0) return;
    // Cmd ou Ctrl : la note s'ouvre dans un nouvel onglet ; sinon sa carte remplace celle-ci.
    const tab = event.metaKey || event.ctrlKey;
    if (links.length === 1) {
      void this.openLink(links[0], tab);
      return;
    }
    const menu = new Menu();
    for (const l of links) menu.addItem((item) => item.setTitle(l.heading ? `${l.note} › ${l.heading}` : l.note).setIcon(`link`).onClick(() => void this.openLink(l, tab)));
    menu.showAtMouseEvent(event);
  }

  // Repere d'un titre dont les fleches sont repliees : va au titre vise, ou propose le choix.
  private goToLinks(links: MapLink[], event: PointerEvent) {
    const renderer = this.renderer;
    if (!renderer || links.length === 0) return;
    const go = (l: MapLink) => {
      if (!l.to) return;
      renderer.reveal(l.to);
      renderer.select(l.to);
    };
    if (links.length === 1) {
      go(links[0]);
      return;
    }
    const menu = new Menu();
    for (const l of links) menu.addItem((item) => item.setTitle(l.heading ?? ``).setIcon(`corner-down-right`).onClick(() => go(l)));
    menu.showAtMouseEvent(event);
  }

  private async openLink(link: MapLink, newTab = false) {
    const current = this.plugin.lastFile;
    if (!current) return;
    const file = this.app.metadataCache.getFirstLinkpathDest(link.note, current.path);
    if (!file) {
      new Notice(t(`La note « {0} » est introuvable.`, link.note));
      return;
    }
    if (newTab) {
      await this.app.workspace.getLeaf(`tab`).openFile(file);
      return;
    }
    this.history.push({ file: current, key: link.from });
    await this.showMapOf(file, link.heading);
  }

  private async goBack() {
    const entry = this.history.pop();
    if (!entry) return;
    await this.showMapOf(entry.file, null, entry.key);
  }

  // Affiche la carte d'une autre note et y selectionne un titre (par son texte ou par sa cle).
  private async showMapOf(file: TFile, heading: string | null, key: string | null = null) {
    const renderer = this.renderer;
    if (!renderer) return;
    this.navigating = true;
    try {
      this.plugin.lastFile = file;
      await this.refresh();
    } finally {
      this.navigating = false;
    }
    renderer.setBackAvailable(this.history.length > 0);
    let target = key;
    if (heading !== null && this.doc) target = flattenDoc(this.doc).find((e) => e.key !== `r` && sameHeading(e.node.title, heading))?.key ?? null;
    if (target && this.doc && nodeByKey(this.doc, target)) {
      renderer.reveal(target);
      renderer.select(target);
    }
  }

  // Menu du clic droit sur une case : edition, presse-papiers et acces a l'apparence.
  private showContextMenu(key: string, event: MouseEvent) {
    const renderer = this.renderer;
    if (!renderer) return;
    const isRoot = key === `r`;
    const selection = renderer.getSelection();
    const keys = selection.includes(key) ? selection : [key];
    const mod = Platform.isMacOS ? `Cmd` : `Ctrl`;
    const menu = new Menu();
    const add = (title: string, icon: string, action: () => void, opts: { disabled?: boolean; warning?: boolean } = {}) => {
      menu.addItem((item) => {
        item.setTitle(title).setIcon(icon).onClick(action);
        if (opts.disabled) item.setDisabled(true);
        if (opts.warning) item.setWarning(true);
      });
    };
    const run = (kind: MapEdit[`kind`]) => () => this.onEdit({ kind, key, keys });

    add(isRoot ? t(`Renommer la note (F2)`) : t(`Titre, étiquettes et commentaire (F2)`), `pencil`, () => renderer.openDialog(key));
    add(t(`Ajouter un sous-titre (Tab)`), `corner-down-right`, run(`child`));
    add(t(`Ajouter un titre de même niveau (Entrée)`), `plus`, run(`sibling`), { disabled: isRoot });
    menu.addSeparator();
    add(t(`Dupliquer ({0} + D)`, mod), `files`, run(`duplicate`), { disabled: isRoot });
    add(t(`Copier ({0} + C)`, mod), `copy`, run(`copy`), { disabled: isRoot });
    add(t(`Couper ({0} + X)`, mod), `scissors`, run(`cut`), { disabled: isRoot });
    add(t(`Coller dedans ({0} + V)`, mod), `clipboard-paste`, run(`paste`));
    add(t(`Coller après`), `clipboard-list`, run(`pasteAfter`), { disabled: isRoot });
    menu.addSeparator();
    const hiddenNow = !!this.doc && !!nodeByKey(this.doc, key)?.meta?.hidden;
    add(hiddenNow ? t(`Afficher dans la note`) : t(`Masquer dans la note`), hiddenNow ? `eye` : `eye-off`, () => void this.toggleHidden(key), { disabled: isRoot });
    menu.addSeparator();
    const file = this.plugin.lastFile;
    const hasLinks = !isRoot && !!this.doc && !!file && (parseLinks(this.doc, file.name).some((l) => l.from === key) || webLinks(this.doc, key).length > 0);
    add(t(`Nouveau lien vers une note ou un titre…`), `link`, () => renderer.startLinking(key), { disabled: isRoot });
    add(t(`Nouveau lien web…`), `globe`, () => this.newWebLink(key), { disabled: isRoot });
    add(t(`Modifier un lien…`), `link-2`, () => this.chooseLinkToEdit(key, event), { disabled: !hasLinks });
    menu.addSeparator();
    add(t(`Apparence…`), `palette`, () => renderer.openStylePanel());
    menu.addSeparator();
    add(t(`Supprimer (Suppr)`), `trash-2`, run(`delete`), { disabled: isRoot, warning: true });
    menu.showAtMouseEvent(event);
  }

  private noMoveReason(dir?: `up` | `down` | `left` | `right`): string {
    if (dir === `up`) return t(`Ce titre est déjà le premier parmi les titres de même niveau.`);
    if (dir === `down`) return t(`Ce titre est déjà le dernier parmi les titres de même niveau.`);
    if (dir === `right`) return t(`Il n'y a pas de titre juste avant celui-ci au même niveau pour l'accueillir comme sous-titre.`);
    if (dir === `left`) return t(`Ce titre est déjà au premier niveau.`);
    return t(`Déplacement impossible à cet endroit.`);
  }

  // Le titre de la racine est le nom du fichier : le modifier renomme la note.
  private async renameFile(file: TFile, title: string) {
    const name = title.replace(/[\\/:*?"<>|#^[\]]/g, ` `).replace(/\s+/g, ` `).trim();
    if (name === ``) {
      new Notice(t(`Le nom de la note ne peut pas être vide.`));
      return;
    }
    const folder = file.parent && file.parent.path !== `/` ? `${file.parent.path}/` : ``;
    const path = `${folder}${name}.${file.extension}`;
    if (path === file.path) return;
    if (this.app.vault.getAbstractFileByPath(path)) {
      new Notice(t(`Une note porte déjà ce nom.`));
      return;
    }
    await this.app.fileManager.renameFile(file, path);
    await this.refresh();
    // Deuxieme lecture peu apres : si Obsidian met a jour le titre de la note avec un retard, la carte reste juste.
    window.setTimeout(() => void this.refresh(), 600);
  }

  // Remplace le texte de la note en ne touchant que la partie modifiee.
  private async writeText(file: TFile, before: string, after: string) {
    const editor = this.plugin.getOpenEditor(file);
    if (!editor) {
      await this.app.vault.process(file, (data) => (data === before ? after : data));
      return;
    }
    const limit = Math.min(before.length, after.length);
    let start = 0;
    while (start < limit && before[start] === after[start]) start++;
    let tail = 0;
    while (tail < limit - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
    editor.transaction({
      changes: [{ from: editor.offsetToPos(start), to: editor.offsetToPos(before.length - tail), text: after.slice(start, after.length - tail) }],
    });
  }

  // ---------------------------------------------------------------- styles

  // Modifie le style de la selection (voir planStyle pour les regles de portee). Les styles par niveau
  // et par case sont inscrits dans des commentaires invisibles de la note.
  private async applyStyle(patch: StylePatch, individual: boolean) {
    const renderer = this.renderer;
    if (!renderer || !this.doc) {
      await this.plugin.updateSettings(patch);
      return;
    }
    const plan = planStyle(this.doc, renderer.getSelection(), patch, individual);
    if (plan.settings) await this.plugin.updateSettings(plan.settings);
    await this.applyMetaChanges(plan.changes);
  }

  // Retire les styles de la selection (par niveau, ou de la case seule), ou reinitialise toute la carte.
  private async resetStyle(individual: boolean) {
    const renderer = this.renderer;
    if (!renderer || !this.doc) return;
    const plan = planReset(this.doc, renderer.getSelection(), individual);
    if (plan.resetSettings) await this.plugin.updateSettings(appearanceDefaults());
    await this.applyMetaChanges(plan.changes);
  }

  // Ecrit des commentaires de style dans la note : dans l'editeur d'Obsidian s'il est ouvert (l'annulation
  // de la note les couvre), sinon directement dans le fichier.
  private async applyMetaChanges(changes: MetaChange[]) {
    const file = this.plugin.lastFile;
    if (!file || changes.length === 0) return;
    const editor = this.plugin.getOpenEditor(file);
    if (editor) {
      const edits = metaEditsFor(parseNote(editor.getValue(), file.name), changes);
      if (edits.length > 0) this.applyEditsToEditor(editor, edits);
    } else {
      await this.app.vault.process(file, (data) => {
        const doc = parseNote(data, file.name);
        const edits = metaEditsFor(doc, changes);
        return edits.length > 0 ? applyLineEdits(data, edits, doc.eol) : data;
      });
    }
    await this.refresh();
  }

  private applyEditsToEditor(editor: Editor, edits: LineEdit[]) {
    const last = editor.lastLine();
    const changes = edits.map((e) => {
      if (e.kind === `replace`) {
        return { from: { line: e.line, ch: 0 }, to: { line: e.line, ch: editor.getLine(e.line).length }, text: e.text };
      }
      if (e.kind === `delete`) {
        if (e.line < last) return { from: { line: e.line, ch: 0 }, to: { line: e.line + 1, ch: 0 }, text: `` };
        return { from: { line: e.line - 1, ch: editor.getLine(e.line - 1).length }, to: { line: e.line, ch: editor.getLine(e.line).length }, text: `` };
      }
      if (e.line <= last) return { from: { line: e.line, ch: 0 }, text: `${e.text}\n` };
      return { from: { line: last, ch: editor.getLine(last).length }, text: `\n${e.text}` };
    });
    editor.transaction({ changes });
  }

  // ---------------------------------------------------------------- volet de note

  // Volet de note deja ouvert a cote de la carte (par exemple la note active au moment d'ouvrir la carte).
  adoptNoteLeaf(leaf: WorkspaceLeaf) {
    this.noteLeaf = leaf;
    this.notePosition = this.plugin.settings.panePosition;
  }

  // Volet de la note dynamique (celle qui suit la carte), s'il existe.
  getNoteLeaf(): WorkspaceLeaf | null {
    return this.noteLeaf;
  }

  // Note fixe : copie du chapitre selectionne, ouverte dans son propre volet au-dessus de la note dynamique. Elle ne suit
  // plus la carte et peut etre redimensionnee ou deplacee comme n'importe quel volet.
  async addFixedNote() {
    const file = this.plugin.lastFile;
    if (!file || !this.doc) {
      new Notice(t(`Sélectionnez d'abord un titre dans la carte.`));
      return;
    }
    const key = this.selectedKey && nodeByKey(this.doc, this.selectedKey) ? this.selectedKey : null;
    if (!key) {
      new Notice(t(`Sélectionnez d'abord un titre dans la carte.`));
      return;
    }
    if (isHiddenKey(this.doc, key)) {
      new Notice(t(`Ce titre est masqué dans la note. Cliquez sur l'œil de la carte pour l'afficher.`));
      return;
    }
    const node = nodeByKey(this.doc, key)!;
    const dynamic = await this.ensureNoteLeaf(file);
    const leaf = this.app.workspace.createLeafBySplit(dynamic, `horizontal`, true);
    await leaf.openFile(file, { active: false });
    const view = leaf.view;
    if (view instanceof MarkdownView && view.getMode() !== `source`) await view.setState({ ...view.getState(), mode: `source` }, { history: false });
    this.plugin.addFixed(leaf, { path: file.path, key, title: node.title });
  }

  // Note et chapitre que montre la note dynamique en ce moment (pour la figer en note fixe).
  currentChapter(): { path: string; key: string; title: string } | null {
    const file = this.currentFile;
    const key = this.selectedKey;
    if (!file || !key || !this.doc) return null;
    const node = nodeByKey(this.doc, key);
    if (!node || isHiddenKey(this.doc, key)) return null;
    return { path: file.path, key, title: node.title };
  }

  // Une note fixe devient la note dynamique : la carte reprend son chapitre et la suit de nouveau.
  async takeOver(leaf: WorkspaceLeaf, target: { path: string; key: string; title: string }) {
    const file = this.app.vault.getAbstractFileByPath(target.path);
    if (!(file instanceof TFile)) return;
    this.noteLeaf = leaf;
    this.notePosition = this.plugin.settings.panePosition;
    if (this.plugin.lastFile?.path !== file.path) this.plugin.lastFile = file;
    await this.refresh();
    const renderer = this.renderer;
    if (!renderer || !this.doc) return;
    const found = resolveFixed(this.doc, target, false);
    const key = found ? found.key : nodeByKey(this.doc, target.key) ? target.key : `r`;
    this.selectedKey = key;
    this.lastNoteLine = -1;
    renderer.reveal(key);
    renderer.select(key, false);
    this.updateActiveRange();
  }

  getNoteView(): MarkdownView | null {
    const view = this.noteLeaf?.view;
    return view instanceof MarkdownView ? view : null;
  }

  // Ouvre la note a cote de la carte, sans attendre un clic sur un titre.
  async showNote() {
    const renderer = this.renderer;
    if (!renderer || !this.doc || !this.plugin.lastFile) return;
    const key = this.selectedKey && nodeByKey(this.doc, this.selectedKey) ? this.selectedKey : `r`;
    this.selectedKey = key;
    renderer.select(key, false);
    await this.revealInNote(key, false);
  }

  // ---------------------------------------------------------------- chapitre actif

  // Vrai si l'editeur est celui du volet de note ouvert par cette carte.
  ownsEditor(cm: EditorView): boolean {
    const leaf = this.noteLeaf;
    return !!leaf && leaf.view.containerEl.contains(cm.dom);
  }

  private getNoteCm(): EditorView | null {
    for (const cm of this.plugin.editorViews) if (this.ownsEditor(cm)) return cm;
    return null;
  }

  // Le curseur de la note a change de ligne : la carte selectionne le chapitre correspondant.
  onNoteMoved(cm: EditorView) {
    const file = this.plugin.lastFile;
    const renderer = this.renderer;
    if (!file || !renderer) return;
    const state = cm.state;
    const head = state.selection.main.head;
    // Le curseur a quitte la ligne vierge ajoutee : elle est retiree si rien n'y a ete ecrit.
    const temp = state.field(tempLineField, false);
    if (temp !== undefined && temp !== null) {
      const tempLine = state.doc.lineAt(Math.min(temp, state.doc.length));
      if (head < tempLine.from || head > tempLine.to) {
        releaseTempLine(cm);
        return;
      }
    }
    const line = state.doc.lineAt(head);
    const line0 = line.number - 1;
    // Une frappe dans la meme ligne ne change pas de chapitre : le changement se fait a la validation par Entree.
    if (line0 === this.lastNoteLine && state.doc.lines === this.lastNoteLines) return;
    this.lastNoteLine = line0;
    this.lastNoteLines = state.doc.lines;

    const text = state.doc.toString();
    const doc = parseNote(text, file.name);
    const { key } = nodeAtLine(doc, line0);
    this.doc = doc;
    this.selectedKey = key;
    this.noteCursors.set(key, { line: line0, ch: head - line.from });
    renderer.setDoc(doc, this.mapKey, serializeNote(doc) === text);
    renderer.reveal(key);
    renderer.select(key, false);
    this.updateActiveRange();
  }

  // L'editeur de la note a ete recree ou son texte entierement remplace : la carte relit la note et remet le grisage ou
  // le masquage des chapitres inactifs, sans changer le titre selectionne.
  resyncNote(cm: EditorView) {
    const file = this.plugin.lastFile;
    if (!file || !this.ownsEditor(cm)) return;
    this.doc = parseNote(cm.state.doc.toString(), file.name);
    this.lastNoteLine = -1;
    // Un rechargement ramene le curseur en haut de la note : il revient dans le titre selectionne, pour que la carte ne
    // saute pas sur un autre titre.
    const key = this.selectedKey;
    const node = key ? nodeByKey(this.doc, key) : null;
    if (key && node && node.line !== undefined) {
      const d = cm.state.doc;
      const head = d.lineAt(cm.state.selection.main.head).number - 1;
      const end = Math.min((node.endLine ?? node.line + 1) - 1, d.lines - 1);
      if (head < node.line || head > end) {
        const remembered = this.noteCursors.get(key);
        const line = d.line(Math.max(node.line, Math.min(remembered?.line ?? end, end)) + 1);
        cm.dispatch({ selection: { anchor: Math.min(line.from + (remembered?.ch ?? line.length), line.to) }, scrollIntoView: true });
      }
    }
    this.updateActiveRange();
  }

  // Grise les chapitres inactifs dans la note reliee, selon le noeud selectionne.
  updateActiveRange() {
    const cm = this.getNoteCm();
    if (!cm) return;
    const s = this.plugin.settings;
    // Les titres masques disparaissent de la note ; le curseur ne reste pas dans une partie masquee.
    const hideOn = [setHideEnabled.of(true), setHideMeta.of(s.hideMetaLines)];
    // Titre masque selectionne : rien n'est actif dans la note, tout y est grise.
    const hiddenSelection = !!this.selectedKey && !!this.doc && isHiddenKey(this.doc, this.selectedKey);
    // Le chapitre actif sert au grisage et au masquage des chapitres inactifs.
    // Un sujet flottant n'apparait dans la note que lorsqu'il est actif : le reste de la note est alors masque.
    const inFloat = !!this.selectedKey && isFloatKey(this.selectedKey);
    const range = (s.contrastEnabled || s.hideInactive || inFloat) && this.selectedKey && this.doc && !hiddenSelection ? activeLines(this.doc, this.selectedKey, s.includeSubtitles) : null;
    if (hiddenSelection && s.contrastEnabled) {
      cm.dispatch({ effects: [...hideOn, setHideInactive.of(false), setActiveRange.of({ from: 0, to: 0 })] });
    } else if (!range) {
      cm.dispatch({ effects: [...hideOn, setHideInactive.of(false), setActiveRange.of(null)] });
    } else {
      const d = cm.state.doc;
      const from = d.line(Math.min(range.startLine, d.lines - 1) + 1).from;
      const to = range.endLine >= d.lines ? d.length : d.line(range.endLine + 1).from;
      cm.dispatch({ effects: [...hideOn, setHideInactive.of(s.hideInactive || inFloat), setActiveRange.of({ from, to })] });
    }
    moveCursorOutOfHidden(cm);
  }

  clearActive() {
    this.releaseTemp();
    const cm = this.getNoteCm();
    if (cm) cm.dispatch({ effects: [setActiveRange.of(null), setHideInactive.of(false), setHideEnabled.of(false)] });
  }

  // Masque ou affiche des titres (et leurs sous-titres) dans la note : le texte reste dans le fichier.
  private async toggleHidden(key: string) {
    const renderer = this.renderer;
    if (!renderer || !this.doc || key === `r`) return;
    const selection = renderer.getSelection();
    const keys = (selection.includes(key) ? selection : [key]).filter((k) => k !== `r`);
    const target = !nodeByKey(this.doc, key)?.meta?.hidden;
    const changes: MetaChange[] = [];
    for (const k of keys) {
      const node = nodeByKey(this.doc, k);
      if (!node || !!node.meta?.hidden === target) continue;
      const meta: MmMeta = { ...(node.meta ?? {}) };
      if (target) meta.hidden = true;
      else delete meta.hidden;
      changes.push({ key: k, meta });
    }
    await this.applyMetaChanges(changes);
    renderer.focus();
  }

  // Duplique les titres selectionnes (raccourci de la carte et commande d'Obsidian).
  duplicateSelection() {
    const renderer = this.renderer;
    const key = renderer?.getSelectedKey();
    if (!renderer || !key) {
      new Notice(t(`Sélectionnez d'abord un titre dans la carte.`));
      return;
    }
    const keys = renderer.getSelection();
    this.onEdit({ kind: `duplicate`, key, keys: keys.includes(key) ? keys : [key] });
  }

  // Clic dans la note, a droite du titre d'un chapitre sans texte : une ligne vierge est ouverte sous le titre pour y
  // ecrire. Un clic dans le texte du titre reste une simple edition du titre.
  onNoteClick(cm: EditorView, event: MouseEvent) {
    const file = this.plugin.lastFile;
    if (!file || event.button !== 0 || event.shiftKey || event.altKey) return;
    window.setTimeout(() => {
      const sel = cm.state.selection.main;
      const line = cm.state.doc.lineAt(sel.head);
      if (!sel.empty || sel.head !== line.to || !/^#{1,6}(\s|$)/.test(line.text)) return;
      const doc = parseNote(cm.state.doc.toString(), file.name);
      const line0 = line.number - 1;
      const { node } = nodeAtLine(doc, line0);
      if (node === doc.root || node.line !== line0) return;
      const start = (node.metaLine ?? line0) + 1;
      for (let i = start; i < (node.endLine ?? start); i++) if (cm.state.doc.line(i + 1).text.trim() !== ``) return;
      openBlankLine(cm, start);
    }, 0);
  }

  // Retire la ligne vierge temporaire de la note reliee, si elle est encore vide.
  private releaseTemp() {
    const cm = this.getNoteCm();
    if (cm) releaseTempLine(cm);
  }

  // Deplacement d'un chapitre a l'autre depuis la note, avec les touches configurees.
  async navigateFromNote(dir: `up` | `down` | `left` | `right`) {
    const renderer = this.renderer;
    if (!this.doc || !renderer) return;
    const flat = flattenDoc(this.doc);
    const current = this.selectedKey ?? `r`;
    const index = flat.findIndex((e) => e.key === current);
    let target: string | undefined;
    if (dir === `up`) target = flat[index - 1]?.key;
    else if (dir === `down`) target = flat[index + 1]?.key;
    else if (dir === `left`) target = current.includes(`.`) ? current.slice(0, current.lastIndexOf(`.`)) : undefined;
    else target = nodeByKey(this.doc, current)?.children.length ? `${current}.0` : undefined;
    if (!target) return;
    this.selectedKey = target;
    renderer.reveal(target);
    renderer.select(target, false);
    await this.revealInNote(target, true);
  }

  // ---------------------------------------------------------------- note Obsidian en vis-a-vis

  focusMap() {
    this.app.workspace.setActiveLeaf(this.leaf, { focus: true });
    this.renderer?.focus();
  }

  // Passe en saisie du paragraphe dans l'editeur d'Obsidian.
  focusNote() {
    if (!this.renderer) return;
    const key = this.renderer.getSelectedKey();
    if (!key) return;
    this.selectedKey = key;
    void this.revealInNote(key, true);
  }

  // Annuler et retablir agissent sur l'historique de l'editeur de la note.
  private undoRedo(action: `undo` | `redo`) {
    const view = this.noteLeaf?.view;
    if (!(view instanceof MarkdownView)) {
      new Notice(t(`Sélectionnez d'abord un titre : la note s'ouvre à côté de la carte.`));
      return;
    }
    if (action === `undo`) view.editor.undo();
    else view.editor.redo();
  }

  // Les selections sont traitees l'une apres l'autre : sans cela, un deuxieme clic arrive pendant l'ouverture de la note de la premiere
  // selection, ne retrouve pas encore la fenetre de note et en cree une autre a chaque clic.
  private selectQueue: Promise<void> = Promise.resolve();

  private onSelect(key: string | null): Promise<void> {
    this.rememberNoteCursor(this.selectedKey);
    this.selectedKey = key;
    this.selectQueue = this.selectQueue
      .then(async () => {
        // Seule la derniere selection compte : si elle a change pendant l'attente, celle-ci est sautee.
        if (key && this.selectedKey === key) await this.revealInNote(key, this.plugin.settings.focusNoteOnSelect);
      })
      .catch(() => undefined);
    return this.selectQueue;
  }

  private async ensureNoteLeaf(file: TFile): Promise<WorkspaceLeaf> {
    const ws = this.app.workspace;
    let leaf = this.noteLeaf;
    if (leaf && !ws.getLeavesOfType(`markdown`).includes(leaf)) leaf = null;
    if (!leaf) {
      const pos = this.plugin.settings.panePosition;
      const direction = pos === `right` || pos === `left` ? `vertical` : `horizontal`;
      leaf = ws.createLeafBySplit(this.leaf, direction, pos === `left` || pos === `top`);
      this.notePosition = pos;
    }
    this.noteLeaf = leaf;
    const v = leaf.view;
    if (!(v instanceof MarkdownView) || !v.file || v.file.path !== file.path) {
      await leaf.openFile(file, { active: false });
    }
    return leaf;
  }

  // Memorise la position du curseur dans la note si elle se trouve dans le texte du noeud quitte.
  private rememberNoteCursor(key: string | null) {
    if (!key || !this.doc || !this.noteLeaf) return;
    const view = this.noteLeaf.view;
    const node = nodeByKey(this.doc, key);
    if (!(view instanceof MarkdownView) || !node || node.line === undefined || node.endLine === undefined) return;
    const cursor = view.editor.getCursor();
    if (cursor.line > node.line && cursor.line < node.endLine) this.noteCursors.set(key, { line: cursor.line, ch: cursor.ch });
  }

  // Affiche le chapitre du noeud dans la note, curseur dans son texte pret a etre complete.
  // Avec focus, le clavier passe aussi dans la note.
  private async revealInNote(key: string, focus: boolean) {
    const file = this.plugin.lastFile;
    if (!file || !this.doc || !nodeByKey(this.doc, key)) return;
    if (isHiddenKey(this.doc, key)) {
      // Un titre masque n'apparait pas dans la note : rien a y montrer.
      if (focus) new Notice(t(`Ce titre est masqué dans la note. Cliquez sur l'œil de la carte pour l'afficher.`));
      this.updateActiveRange();
      return;
    }
    const leaf = await this.ensureNoteLeaf(file);
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const editor = view.editor;

    // Une ligne vierge ajoutee pour un titre precedent est retiree avant de relire la note.
    this.releaseTemp();
    const live = parseNote(editor.getValue(), file.name);
    const node = nodeByKey(live, key) ?? nodeByKey(this.doc, key)!;
    const last = editor.lastLine();
    const headLine = Math.min(node.line ?? 0, last);

    if (view.getMode() !== `source`) {
      if (focus) await view.setState({ ...view.getState(), mode: `source` }, { history: false });
      else {
        leaf.setEphemeralState({ line: headLine });
        return;
      }
    }

    // Premiere et derniere lignes du texte du noeud (sans les lignes vides finales).
    const first = Math.min((node.metaLine ?? headLine) + 1, last);
    let end = Math.min((node.endLine ?? first + 1) - 1, last);
    while (end > first && editor.getLine(end).trim() === ``) end--;
    end = Math.max(end, headLine);
    const hasText = end >= first && editor.getLine(end).trim() !== ``;
    let endLine = hasText ? end : headLine;

    const remembered = this.noteCursors.get(key);
    const mode = this.plugin.settings.cursorPosition;
    let cursor = { line: endLine, ch: editor.getLine(endLine).length };
    if (mode === `start`) cursor = { line: hasText ? first : headLine, ch: 0 };
    else if (mode === `last` && remembered && remembered.line >= first && remembered.line <= endLine) cursor = remembered;

    // Paragraphe vide et passage dans la note : une ligne vierge est ouverte sous le titre pour y ecrire.
    // Elle disparait si on la quitte sans rien ecrire.
    const noteCm = (editor as unknown as { cm?: EditorView }).cm;
    const target = (node.metaLine ?? node.line ?? 0) + 1;
    if (focus && !hasText && node !== live.root && noteCm) {
      openBlankLine(noteCm, target);
      cursor = { line: target, ch: 0 };
      endLine = target;
    }

    const cm = noteCm;
    if (cm) {
      revealRange(cm, { headLine, endLine, cursorLine: cursor.line, cursorCh: cursor.ch });
    } else {
      editor.setCursor(cursor);
      editor.scrollIntoView({ from: { line: headLine, ch: 0 }, to: { line: endLine, ch: 0 } }, true);
    }
    if (focus) {
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
      editor.focus();
    }
    // La note a pu changer (ligne vierge ajoutee ou retiree) : le chapitre actif est recalcule sur le texte actuel.
    this.doc = parseNote(editor.getValue(), file.name);
    this.updateActiveRange();
  }
}

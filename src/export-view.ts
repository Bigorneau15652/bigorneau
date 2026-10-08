// Apercu de l'export de haute qualite : volet qui montre la note ouverte telle que l'export la composera.
// Phase 2 : coupure de lignes de Knuth et Plass avec cesure ; la pagination definitive et le PDF arrivent aux phases suivantes.
import { record } from "./diagnostics";
import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import { composeNote } from "./export/compose";
import type { ImageAsset } from "./export/image";
import type { MathAsset } from "./export/math";
import type { DecorItem, DecorLeaf } from "./export/page-decor";
import { columnsOf, FOOTNOTE_RULE_HEIGHT } from "./export/paginate";
import type { LineRun } from "./export/paragraph";
import { A4_SETUP, PageSetup, Row } from "./export/typeset";
import { loadAssets, pageStyleOf } from "./export-context";
import { cssFamilyOf } from "./font-store";
import { warningLines } from "./export-report";
import { MATH_SERVICE, MathRenderer } from "./script-formulas";
import { loadExportFont } from "./export-font";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

export const VIEW_TYPE_EXPORT = `mindmap-writing-export-preview`;

const PX_PER_PT = 96 / 72;

export class ExportPreviewView extends ItemView {
  private token = 0;
  private sheets: HTMLElement[] = [];
  // Feuille de la note composee (dimensions et marges de sa mise en page).
  private setup: PageSetup = A4_SETUP;
  private sheetSetups: PageSetup[] = [];
  private observer: ResizeObserver | null = null;
  // Adresses des images de l'apercu, a liberer quand il est recompose ou ferme.
  private urls: string[] = [];
  private images = new Map<string, ImageAsset>();
  // Vrai quand la note a change pendant que l'apercu n'etait pas visible : il est recompose quand on revient dessus.
  private dirty = false;

  constructor(leaf: WorkspaceLeaf, private plugin: MindmapWritingPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXPORT;
  }

  getDisplayText(): string {
    return t(`Aperçu de l'export`);
  }

  getIcon(): string {
    return `file-text`;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass(`mmw-export`);
    this.observer = new ResizeObserver(() => this.applyScale());
    this.observer.observe(this.contentEl);
    await this.refresh();
  }

  async onClose() {
    this.observer?.disconnect();
    this.observer = null;
    this.releaseImages();
  }

  private releaseImages() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  // Les pages sont composees en points ; on les reduit pour qu'elles tiennent dans la largeur du volet.
  private applyScale() {
    const avail = this.contentEl.clientWidth - 32;
    if (avail <= 0) return;
    this.sheets.forEach((sheet, i) => {
      // Une page en paysage dans un document en portrait (ou l'inverse) a sa propre feuille.
      const own = this.sheetSetups[i] ?? this.setup;
      const scale = Math.min(1, avail / (own.width * PX_PER_PT));
      const page = sheet.firstElementChild as HTMLElement | null;
      if (!page) return;
      sheet.style.width = `${own.width * PX_PER_PT * scale}px`;
      sheet.style.height = `${own.height * PX_PER_PT * scale}px`;
      // La page est dimensionnee en points (donc deja en pixels CSS) : seule la reduction s'applique.
      page.style.transform = `scale(${scale})`;
    });
  }

  // Morceaux de ligne : chacun a sa police (gras, italique) ; les appels de notes de bas de page sont des numeros en exposant, a 70 %
  // du corps du texte comme dans le calcul ; les liens web s'ouvrent dans le navigateur, les renvois (adresse commencant par #)
  // menent a l'endroit visé de l'apercu.
  // Dessin d'une formule : le contour, a l'echelle du corps du texte, dont le bas est sous la ligne de base de la profondeur voulue.
  private appendMath(el: HTMLElement, asset: MathAsset, size: number, inline: boolean) {
    const k = size / 1000;
    const svg = el.createSvg(`svg`, { attr: { width: `${asset.width * k}pt`, height: `${(asset.ascent + asset.descent) * k}pt`, viewBox: `0 ${-asset.ascent} ${asset.width} ${asset.ascent + asset.descent}` } });
    svg.createSvg(`path`, { attr: { d: asset.d, fill: `currentColor` } });
    svg.addClass(`mmw-row-math`);
    if (inline) svg.style.verticalAlign = `${-asset.descent * k}pt`;
  }

  private appendRuns(el: HTMLElement, runs: LineRun[]) {
    for (const run of runs) {
      if (run.math) {
        this.appendMath(el, run.math, Number.parseFloat(el.style.fontSize) || 11, true);
        continue;
      }
      const span = el.createSpan({ text: run.text });
      if (run.sup) span.addClass(`mmw-sup`);
      if (run.style === `mono`) span.addClass(`mmw-run-mono`);
      if (run.style === `bold` || run.style === `boldItalic`) span.addClass(`mmw-run-bold`);
      if (run.style === `italic` || run.style === `boldItalic`) span.addClass(`mmw-run-italic`);
      // Police ajoutee au coffre : le fichier de la variante est deja gras ou italique, le navigateur n'a rien a y ajouter.
      const css = cssFamilyOf(run.style);
      if (css) {
        span.style.fontFamily = `"${css}"`;
        span.style.fontWeight = `normal`;
        span.style.fontStyle = `normal`;
      }
      if (run.link) {
        span.addClass(`mmw-export-link`);
        const url = run.link;
        if (url.startsWith(`#`)) span.addEventListener(`click`, () => this.goTo(url.slice(1)));
        else {
          span.title = url;
          span.addEventListener(`click`, () => window.open(url));
        }
      }
    }
  }

  // Fait defiler l'apercu jusqu'a un repere (titre, figure, tableau, bloc).
  private goTo(anchor: string) {
    const target = Array.from(this.contentEl.querySelectorAll<HTMLElement>(`[data-anchor], [data-alias]`)).find((e) => e.dataset.anchor === anchor || e.dataset.alias === anchor);
    target?.scrollIntoView({ block: `center`, behavior: `smooth` });
  }

  // Element de l'en-tete, du pied de page ou du numero (reglages de la note), place en points sur la page.
  private renderDecor(page: HTMLElement, item: DecorItem): void {
    if (item.kind === `group`) {
      // Bord exterieur : une boite tournee dont l'origine est posee sur la page, avec les elements dedans.
      const box = page.createDiv({ cls: `mmw-decor mmw-decor-group` });
      box.style.left = `${item.qx}pt`;
      box.style.top = `${item.qy}pt`;
      box.style.transform = `rotate(${item.rot}deg)`;
      for (const leaf of item.items) this.renderDecor(box, leaf);
      return;
    }
    this.renderLeaf(page, item);
  }

  private renderLeaf(page: HTMLElement, item: DecorLeaf): void {
    if (item.kind === `text`) {
      const el = page.createDiv({ cls: `mmw-decor mmw-decor-text`, text: item.text });
      el.style.left = `${item.x}pt`;
      el.style.top = `${item.baseline - item.size * 0.894}pt`;
      el.style.fontSize = `${item.size}pt`;
      el.style.lineHeight = `${item.size * 1.14}pt`;
      el.style.color = item.color;
      const css = cssFamilyOf(item.style);
      if (css) el.style.fontFamily = `"${css}"`;
      else if (!item.style.startsWith(`u:`)) {
        if (item.style.startsWith(`bold`)) el.style.fontWeight = `700`;
        if (item.style.endsWith(`talic`)) el.style.fontStyle = `italic`;
      }
    } else if (item.kind === `image`) {
      const url = this.images.get(item.target)?.previewUrl;
      if (!url) return;
      const img = page.createEl(`img`, { cls: `mmw-decor` });
      img.src = url;
      img.style.left = `${item.x}pt`;
      img.style.top = `${item.y}pt`;
      img.style.width = `${item.width}pt`;
      img.style.height = `${item.height}pt`;
    } else if (item.kind === `rule`) {
      const el = page.createDiv({ cls: `mmw-decor mmw-decor-rule` });
      el.style.left = `${item.x1}pt`;
      el.style.top = `${item.y}pt`;
      el.style.width = `${item.x2 - item.x1}pt`;
    } else {
      const el = page.createDiv({ cls: `mmw-decor mmw-decor-shape` });
      el.style.left = `${item.x}pt`;
      el.style.top = `${item.y}pt`;
      el.style.width = `${item.width}pt`;
      el.style.height = `${item.height}pt`;
      el.style.background = item.fill === `` ? `transparent` : item.fill;
      el.style.border = item.stroke === `` ? `none` : `0.8pt solid ${item.stroke}`;
      el.style.borderRadius = item.shape === `circle` ? `50%` : item.shape === `rounded` ? `22%` : `0`;
    }
  }

  private renderRow(parent: HTMLElement, row: Row) {
    const el = parent.createDiv({ cls: `mmw-row mmw-row-${row.kind}` });
    el.style.height = `${row.height}pt`;
    if (row.anchor !== undefined) el.dataset.anchor = row.anchor;
    if (row.alias !== undefined) el.dataset.alias = row.alias;
    if (row.shade) {
      // Fond de la ligne d'un tableau, sur toute sa largeur (en-tete fonce, alternance).
      el.style.position = `relative`;
      const fill = el.createDiv({ cls: `mmw-row-fill` });
      fill.style.left = `${row.x}pt`;
      fill.style.width = `${row.width}pt`;
      fill.style.background = `rgb(${Math.round(row.shade.fill * 255)}, ${Math.round(row.shade.fill * 255)}, ${Math.round(row.shade.fill * 255)})`;
      if (row.shade.text === `white`) el.style.color = `#fff`;
    }
    if (row.rules) {
      // Filets du tableau, sur toute sa largeur.
      el.style.position = `relative`;
      for (const side of [`top`, `bottom`] as const) {
        if (!row.rules[side]) continue;
        const rule = el.createDiv({ cls: `mmw-row-rule` });
        rule.style.left = `${row.x}pt`;
        rule.style.width = `${row.width}pt`;
        rule.style[side] = `0`;
      }
    }
    if (row.frame) {
      // Cadre d'un media : bords gauche et droit, et haut ou bas sur la premiere et la derniere ligne.
      el.style.position = `relative`;
      const frame = el.createDiv({ cls: `mmw-row-frame` });
      frame.style.width = `${row.frame.width}pt`;
      if (row.frame.top) frame.style.borderTopWidth = `0.5pt`;
      if (row.frame.bottom) frame.style.borderBottomWidth = `0.5pt`;
    }
    if (row.box) {
      // Cadre d'un titre : fond et trait sur la largeur du cadre, bords haut et bas sur la premiere et la derniere ligne.
      el.style.position = `relative`;
      const box = el.createDiv({ cls: `mmw-row-box` });
      box.style.left = `${row.box.x}pt`;
      box.style.width = `${row.box.width}pt`;
      if (row.box.fill !== ``) box.style.background = row.box.fill;
      box.style.borderColor = row.box.color;
      box.style.borderLeftWidth = `${row.box.line}pt`;
      box.style.borderRightWidth = `${row.box.line}pt`;
      if (row.box.top) box.style.borderTopWidth = `${row.box.line}pt`;
      if (row.box.bottom) box.style.borderBottomWidth = `${row.box.line}pt`;
    }
    if (row.kind === `space` || row.kind === `float`) return;
    el.style.fontSize = `${row.fontSize}pt`;
    if (row.inset && !row.cells) {
      // Air au-dessus ou au-dessous du texte (cadre d'un titre) : le texte reste centre dans l'espace restant.
      el.style.height = `${row.height - row.inset.top}pt`;
      el.style.paddingTop = `${row.inset.top}pt`;
      el.style.lineHeight = `${row.height - row.inset.top - row.inset.bottom}pt`;
    } else el.style.lineHeight = `${row.height}pt`;
    if (row.underline) el.style.textDecoration = `underline`;
    if (row.x >= 0) {
      el.style.paddingLeft = `${row.x}pt`;
      el.style.width = `${row.width + row.x}pt`;
    } else {
      // Signe qui depasse dans la marge gauche (protrusion) : la ligne commence avant le bord de la colonne.
      el.style.marginLeft = `${row.x}pt`;
      el.style.width = `${row.width}pt`;
    }
    if (row.align === `center`) el.style.textAlign = `center`;
    if (row.wordSpacing !== 0) el.style.wordSpacing = `${row.wordSpacing}pt`;
    if (row.math) {
      const k = row.math.size / 1000;
      const top = (row.height - (row.math.asset.ascent + row.math.asset.descent) * k) / 2;
      const holder = el.createDiv();
      holder.style.paddingTop = `${top}pt`;
      this.appendMath(holder, row.math.asset, row.math.size, false);
      return;
    }
    if (row.cells) {
      el.style.position = `relative`;
      const inner = row.height - (row.inset?.top ?? 0) - (row.inset?.bottom ?? 0);
      for (const c of row.cells) {
        const cell = el.createDiv({ cls: `mmw-row-cell` });
        cell.style.left = `${row.x + c.x}pt`;
        cell.style.top = `${row.inset?.top ?? 0}pt`;
        cell.style.lineHeight = `${inner}pt`;
        this.appendRuns(cell, c.runs);
      }
      return;
    }
    if (row.image) {
      const url = this.images.get(row.image.target)?.previewUrl;
      if (url) {
        const img = el.createEl(`img`, { cls: `mmw-row-image` });
        img.src = url;
        img.style.width = `${row.image.width}pt`;
        img.style.height = `${row.image.height}pt`;
      }
      return;
    }
    if (row.marker !== undefined) {
      const m = el.createSpan({ cls: row.kind === `footnote` ? `mmw-row-marker mmw-row-note-marker` : `mmw-row-marker`, text: row.marker });
      m.style.left = `${row.kind === `footnote` ? 0 : row.x - 16}pt`;
    }
    if (row.runs) this.appendRuns(el, row.runs);
    else el.appendChild(document.createTextNode(row.text));
    if (row.toc) {
      // Entree de la table des matieres : points de conduite et numero de page sur la derniere ligne du titre.
      const anchor = row.toc.anchor;
      el.addClass(`mmw-row-toc`);
      el.addEventListener(`click`, () => this.goTo(anchor));
      if (row.toc.page >= 0) {
        el.addClass(`mmw-row-toc-numbered`);
        el.createSpan({ cls: `mmw-row-leader` });
        el.createSpan({ text: String(row.toc.page) });
      }
    }
  }

  // Demande de recomposition apres une modification de la note : rien n'est calcule tant que l'apercu est cache (autre onglet).
  requestRefresh(): void {
    if (!this.contentEl.isShown()) {
      this.dirty = true;
      return;
    }
    void this.refresh();
  }

  // Au retour sur l'apercu : recomposition si la note a change entre-temps.
  refreshIfDirty(): void {
    if (this.dirty && this.contentEl.isShown()) void this.refresh();
  }

  async refresh() {
    const started = performance.now();
    await this.refreshNow();
    record(`Aperçu de l'export : composition`, performance.now() - started, `${this.sheets.length} pages`);
  }

  private async refreshNow() {
    this.dirty = false;
    const token = ++this.token;
    const root = this.contentEl;
    // L'export de haute qualite n'existe que sur ordinateur : ailleurs, le volet l'explique sans rien calculer.
    if (!Platform.isDesktop) {
      root.empty();
      root.createDiv({ cls: `mmw-export-message`, text: t(`L'export n'est disponible que sur ordinateur.`) });
      return;
    }
    const file = this.plugin.lastFile;
    if (!file) {
      root.empty();
      root.createDiv({ cls: `mmw-export-message`, text: t(`Ouvrez d'abord une note.`) });
      return;
    }
    const fontOk = await loadExportFont();
    await this.plugin.fonts.refresh();
    const text = this.plugin.getOpenText(file) ?? (await this.app.vault.read(file));
    if (token !== this.token) return;

    const loaded = await loadAssets(this.app, text, file.name, file.path, this.plugin.scripts.service<MathRenderer>(MATH_SERVICE));
    if (token !== this.token) {
      for (const u of loaded.urls) URL.revokeObjectURL(u);
      return;
    }
    this.releaseImages();
    this.urls = loaded.urls;
    this.images = loaded.images;
    const composed = composeNote(text, file.name, undefined, pageStyleOf(this.plugin.settings), { images: loaded.images, formulas: loaded.formulas, created: file.stat.ctime, modified: file.stat.mtime, defaultAuthor: this.plugin.settings.exportAuthor });
    const typeset = composed.typeset;
    const pages = composed.pages;
    const s = typeset.stats;
    root.empty();

    const head = root.createDiv({ cls: `mmw-export-head` });
    head.createDiv({ cls: `mmw-export-title`, text: t(`Aperçu de l'export : {0}`, file.basename) });
    const nPages = pages.length;
    const stats = [
      nPages === 1 ? t(`{0} page`, nPages) : t(`{0} pages`, nPages),
      s.wordCount === 1 ? t(`{0} mot`, s.wordCount) : t(`{0} mots`, s.wordCount),
      s.footnotes === 1 ? t(`{0} note de bas de page`, s.footnotes) : t(`{0} notes de bas de page`, s.footnotes),
    ];
    head.createDiv({ cls: `mmw-export-stats`, text: stats.join(`, `) });
    head.createDiv({
      cls: `mmw-export-stats`,
      text: t(`{0} lignes, dont {1} avec césure ({2} consécutives) ; {3} lâches, {4} serrées, {5} débordantes`, s.lines, s.hyphenatedLines, s.consecutiveHyphens, s.looseLines, s.tightLines, s.overfullLines),
    });
    for (const line of warningLines(typeset.warnings, { formulasEnabled: this.plugin.scripts.isEnabled(`formulas`) })) head.createDiv({ cls: `mmw-export-stats`, text: line });
    if (typeset.missing.length > 0) {
      head.createDiv({ cls: `mmw-export-stats`, text: t(`Caractères absents de la police : {0}`, typeset.missing.map((c) => `U+${c.toString(16).toUpperCase().padStart(4, `0`)}`).join(` `)) });
    }
    if (!fontOk) head.createDiv({ cls: `mmw-export-stats`, text: t(`Police de l'export indisponible : l'aperçu utilise une autre police.`) });
    head.createDiv({ cls: `mmw-export-hint`, text: t(`Aperçu de l'export : le PDF reprend exactement ces pages. Les titres masqués et les sujets flottants ne sont pas exportés.`) });
    const exportBtn = head.createEl(`button`, { cls: `mod-cta mmw-export-button`, text: t(`Exporter en PDF…`) });
    exportBtn.addEventListener(`click`, () => void this.plugin.exportPdf());

    const host = root.createDiv({ cls: `mmw-export-pages` });
    this.sheets = [];
    this.sheetSetups = [];
    this.setup = composed.setup;
    pages.forEach((pg) => {
      const setup = pg.setup ?? composed.setup;
      const sheet = host.createDiv({ cls: `mmw-export-sheet` });
      const page = sheet.createDiv({ cls: `mmw-export-page` });
      page.style.width = `${setup.width}pt`;
      page.style.height = `${setup.height}pt`;
      const textWidth = setup.width - setup.marginLeft - setup.marginRight;
      if (pg.header) {
        const h = page.createDiv({ cls: `mmw-export-header`, text: pg.header });
        h.style.left = `${setup.marginLeft}pt`;
        h.style.top = `${setup.marginTop - 34}pt`;
        h.style.width = `${textWidth}pt`;
      }
      // Chaque colonne : ses lignes depuis la marge haute, puis ses flottants du bas et ses notes en bas de la colonne.
      for (const col of columnsOf(pg, textWidth)) {
        const left = setup.marginLeft + col.x;
        const body = page.createDiv({ cls: `mmw-export-body` });
        body.style.left = `${left}pt`;
        body.style.top = `${setup.marginTop}pt`;
        body.style.width = `${col.width}pt`;
        for (const row of col.topFloats ?? []) this.renderRow(body, row);
        for (const row of col.rows) this.renderRow(body, row);
        if (col.footnotes.length > 0) {
          const notes = page.createDiv({ cls: `mmw-export-notes` });
          notes.style.left = `${left}pt`;
          notes.style.bottom = `${setup.marginBottom}pt`;
          notes.style.width = `${col.width}pt`;
          const rule = notes.createDiv({ cls: `mmw-export-rule` });
          rule.style.height = `${FOOTNOTE_RULE_HEIGHT}pt`;
          for (const row of col.footnotes) this.renderRow(notes, row);
        }
        if (col.bottomFloats && col.bottomFloats.length > 0) {
          // Flottants du bas : juste au-dessus des notes de bas de page.
          const noteArea = col.footnotes.length > 0 ? FOOTNOTE_RULE_HEIGHT + col.footnotes.reduce((a, r) => a + r.height, 0) : 0;
          const floats = page.createDiv({ cls: `mmw-export-notes` });
          floats.style.left = `${left}pt`;
          floats.style.bottom = `${setup.marginBottom + noteArea}pt`;
          floats.style.width = `${col.width}pt`;
          for (const row of col.bottomFloats) this.renderRow(floats, row);
        }
      }
      if (pg.footer) page.createDiv({ cls: `mmw-export-number`, text: pg.footer });
      for (const item of pg.decor ?? []) this.renderDecor(page, item);
      this.sheets.push(sheet);
      this.sheetSetups.push(setup);
    });
    this.applyScale();
  }
}

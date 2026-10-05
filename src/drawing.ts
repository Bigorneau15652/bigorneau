// Dessin : le bouton Dessiner s'appuie sur le plugin Excalidraw (il cree le dessin et l'integre a la note), et le bouton d'insertion
// d'image place dans la note une image ou un dessin du coffre. Dans les deux cas, le nom demande est ecrit dans le lien
// (![[dessin.excalidraw|Nom]]) : c'est la legende « Figure N : Nom » de l'export. Sans nom, la figure n'a ni legende ni numero.
import { App, Editor, Modal, Notice, Setting } from "obsidian";
import { addedDrawing, figureMarkup, isolateFigure, nameDrawing } from "./figure-insert";
import { t } from "./i18n";
import { ImagePicker } from "./image-picker";
import { insertBlock } from "./table-edit";

const EXCALIDRAW_PLUGIN = `obsidian-excalidraw-plugin`;

// Parties non documentees de l'application utilisees ici ; chaque appel est protege.
interface AppInternals {
  plugins?: { enabledPlugins?: Set<string> };
  commands?: { commands?: Record<string, unknown>; executeCommandById?: (id: string) => boolean };
  setting?: { open?: () => void; openTabById?: (id: string) => void };
}

const internals = (app: App): AppInternals => app as unknown as AppInternals;

export function excalidrawInstalled(app: App): boolean {
  return internals(app).plugins?.enabledPlugins?.has(EXCALIDRAW_PLUGIN) === true;
}

// Commande d'Excalidraw qui cree un dessin et l'integre a la note ouverte (la plus courte, a defaut d'autre critere).
export function excalidrawCreateCommand(app: App): string | null {
  const all = Object.keys(internals(app).commands?.commands ?? {});
  const ids = all.filter((id) => id.startsWith(`${EXCALIDRAW_PLUGIN}:`) && /autocreate-and-embed/.test(id)).sort((a, b) => a.length - b.length);
  return ids[0] ?? null;
}

// Demande le nom d'une figure ; `null` si on annule, chaine vide si la figure reste sans nom.
class NameModal extends Modal {
  private done = false;

  constructor(app: App, private heading: string, private onDone: (name: string | null) => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.heading);
    const { contentEl } = this;
    contentEl.empty();
    let value = ``;
    const submit = (): void => {
      this.done = true;
      this.close();
      this.onDone(value.trim());
    };
    new Setting(contentEl)
      .setName(t(`Nom de la figure`))
      .setDesc(t(`Il devient la légende « Figure N : nom » dans l'export. Laissez vide pour une figure sans nom, sans légende ni numéro.`))
      .addText((x) => {
        x.setPlaceholder(t(`Nom`)).onChange((v) => (value = v));
        x.inputEl.style.width = `100%`;
        x.inputEl.addEventListener(`keydown`, (e) => {
          if (e.key === `Enter`) submit();
        });
        window.setTimeout(() => x.inputEl.focus(), 0);
      });
    new Setting(contentEl).addButton((b) => b.setCta().setButtonText(t(`Valider`)).onClick(submit)).addButton((b) => b.setButtonText(t(`Annuler`)).onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.done) this.onDone(null);
  }
}

// Explique comment installer et regler Excalidraw quand le plugin manque.
class ExcalidrawHelpModal extends Modal {
  onOpen(): void {
    this.titleEl.setText(t(`Excalidraw n'est pas installé`));
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl(`p`, { text: t(`Pour dessiner, Bigorneau s'appuie sur le plugin Excalidraw. Pour l'installer :`) });
    const steps = contentEl.createEl(`ol`);
    for (const s of [
      t(`Ouvrez les paramètres d'Obsidian (roue dentée en bas à gauche).`),
      t(`Choisissez Modules communautaires, puis Parcourir.`),
      t(`Cherchez Excalidraw, cliquez sur Installer, puis sur Activer.`),
      t(`Dans les réglages d'Excalidraw, activez l'export automatique (Auto-export SVG ou PNG) : sans lui, le dessin n'a pas d'image pour le PDF.`),
      t(`Revenez ici et cliquez de nouveau sur Dessiner.`),
    ])
      steps.createEl(`li`, { text: s });
    contentEl.createEl(`p`, { text: t(`Vous pouvez aussi dessiner avec un autre programme, exporter une image (PNG ou SVG) dans le coffre, puis l'insérer avec le bouton d'insertion d'image.`) });
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText(t(`Ouvrir les modules communautaires`)).onClick(() => {
          this.close();
          try {
            const setting = internals(this.app).setting;
            setting?.open?.();
            setting?.openTabById?.(`community-plugins`);
          } catch {
            // Les paramètres s'ouvrent à la main.
          }
        })
      )
      .addButton((b) => b.setButtonText(t(`Fermer`)).onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Bouton Dessiner : demande le nom, fait creer le dessin par Excalidraw, puis ecrit le nom dans le lien que le plugin vient d'ajouter.
export function drawFigure(app: App, editor: Editor): void {
  if (!excalidrawInstalled(app)) {
    new ExcalidrawHelpModal(app).open();
    return;
  }
  const command = excalidrawCreateCommand(app);
  if (!command) {
    new Notice(t(`Excalidraw est installé, mais sa commande de création de dessin est introuvable : mettez le plugin à jour.`), 8000);
    return;
  }
  new NameModal(app, t(`Nouveau dessin`), (name) => {
    if (name === null) return;
    const before = editor.getValue();
    internals(app).commands?.executeCommandById?.(command);
    // Excalidraw ecrit son lien dans la note un peu apres la creation du dessin : on attend qu'il apparaisse.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries++;
      const text = editor.getValue();
      const added = addedDrawing(before, text);
      if (added) {
        window.clearInterval(timer);
        const edit = isolateFigure(text, nameDrawing(added, name));
        if (text.slice(edit.from, edit.to) !== edit.insert) editor.replaceRange(edit.insert, editor.offsetToPos(edit.from), editor.offsetToPos(edit.to));
        return;
      }
      if (tries >= 40) {
        window.clearInterval(timer);
        new Notice(t(`Le dessin est créé. Pour le nommer, écrivez son nom après une barre verticale dans le lien : ![[dessin.excalidraw|Nom]].`), 10000);
      }
    }, 300);
  }).open();
}

// Bouton d'insertion : image ou dessin du coffre, puis son nom, ecrits dans la note a la place du curseur.
export function insertNamedImage(app: App, editor: Editor): void {
  new ImagePicker(
    app,
    (target) => {
      new NameModal(app, t(`Nom de la figure`), (name) => {
        if (name === null) return;
        const markup = figureMarkup(target, name);
        const text = editor.getValue();
        const at = editor.posToOffset(editor.getCursor(`to`));
        const r = insertBlock(text, at, { text: markup, cursor: markup.length });
        editor.replaceRange(r.edit.insert, editor.offsetToPos(r.edit.from), editor.offsetToPos(r.edit.to));
        editor.setCursor(editor.offsetToPos(r.cursor));
        editor.focus();
      }).open();
    },
    t(`Insérer une image ou un dessin`)
  ).open();
}

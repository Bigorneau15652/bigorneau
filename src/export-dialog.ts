// Fenetre qui demande ou enregistrer le PDF : dossier et nom proposes par defaut, remplacement confirme.
import { App, Modal, Setting, TextComponent, TFile, TFolder } from "obsidian";
import { t } from "./i18n";

export interface ExportTarget {
  folder: string;
  name: string;
}

// Kind of file that the window saves.
export type ExportExtension = `pdf` | `html`;

// Path of the exported file in the vault, with the extension of its kind.
export function targetPath(target: ExportTarget, extension: ExportExtension = `pdf`): string {
  const folder = target.folder.replace(/^\/+|\/+$/g, ``);
  const name = target.name.trim().replace(/[\\/:*?"<>|]/g, `-`);
  return (folder === `` ? `` : `${folder}/`) + (new RegExp(`\\.${extension}$`, `i`).test(name) ? name : `${name}.${extension}`);
}

// Tab of the export window: PDF file, printing, or one self-contained HTML file.
export type ExportTab = `pdf` | `print` | `html`;

// What the maintainer chose in the export window: a file to write (with its place) or the printing.
export type ExportChoice = { kind: `pdf` | `html`; target: ExportTarget } | { kind: `print` };

// Export window with three tabs (PDF, Print, HTML). The PDF and HTML tabs ask where to save the file: folder and name proposed by
// default, replacement confirmed. A click on the Print tab closes the window and opens the printing box of the system.
export class ExportDialog extends Modal {
  private result: ExportChoice | null = null;
  private confirmed = false;
  private tab: ExportTab;
  private folder: string;
  // Name of the file for each kind, extension included.
  private names: Record<`pdf` | `html`, string>;

  constructor(app: App, initial: ExportTarget, private done: (choice: ExportChoice | null) => void, tab: ExportTab = `pdf`) {
    super(app);
    this.tab = tab === `print` ? `pdf` : tab;
    this.folder = this.nearestFolder(initial.folder);
    const base = initial.name.replace(/\.(pdf|html)$/i, ``);
    this.names = { pdf: `${base}.pdf`, html: `${base}.html` };
  }

  // Dossier du coffre le plus proche de `path` qui existe (la racine, a defaut).
  private nearestFolder(path: string): string {
    let p = path.replace(/^\/+|\/+$/g, ``);
    while (p !== `` && !(this.app.vault.getAbstractFileByPath(p) instanceof TFolder)) p = p.includes(`/`) ? p.slice(0, p.lastIndexOf(`/`)) : ``;
    return p;
  }

  // Row of three tabs at the top of the window.
  private renderTabs(): void {
    const tabs = this.contentEl.createDiv({ cls: `mmw-ptabs` });
    const labels: [ExportTab, string][] = [
      [`pdf`, t(`PDF`)],
      [`print`, t(`Impression`)],
      [`html`, t(`HTML`)],
    ];
    for (const [id, label] of labels) {
      const b = tabs.createEl(`button`, { text: label, cls: `mmw-ptab${this.tab === id ? ` is-active` : ``}` });
      b.type = `button`;
      b.addEventListener(`click`, () => {
        // The Print tab has no page of its own: it closes the window and opens the printing box of the system.
        if (id === `print`) {
          this.result = { kind: `print` };
          this.confirmed = true;
          this.close();
          return;
        }
        this.tab = id;
        this.onOpen();
      });
    }
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass(`mmw-xmodal`);
    this.titleEl.setText(t(`Export`));
    this.renderTabs();
    this.renderSave(this.tab === `html` ? `html` : `pdf`);
  }

  // PDF and HTML tabs: folder of the vault, name of the file, confirmation before replacing a file.
  private renderSave(kind: `pdf` | `html`): void {
    const { contentEl } = this;
    const target: ExportTarget = { folder: this.folder, name: this.names[kind] };
    let warning: HTMLElement;
    let button: HTMLButtonElement;
    let crumbs: HTMLElement;
    let list: HTMLElement;

    const check = (): void => {
      const replacing = this.app.vault.getAbstractFileByPath(targetPath(target, kind)) instanceof TFile;
      warning.setText(replacing ? t(`Ce fichier existe déjà : il sera remplacé si vous confirmez.`) : ``);
      button.setText(replacing ? t(`Remplacer`) : t(`Exporter`));
    };

    const go = (folder: string): void => {
      target.folder = folder;
      this.folder = folder;
      paint();
      check();
    };

    // Chemin du dossier choisi, un bouton par niveau, puis la liste de ses sous-dossiers et de ses PDF.
    const paint = (): void => {
      crumbs.empty();
      const parts = target.folder === `` ? [] : target.folder.split(`/`);
      const root = crumbs.createEl(`button`, { text: t(`Coffre`), cls: `mmw-xcrumb` });
      root.type = `button`;
      root.addEventListener(`click`, () => go(``));
      parts.forEach((part, i) => {
        crumbs.createSpan({ text: ` / `, cls: `mmw-xsep` });
        const b = crumbs.createEl(`button`, { text: part, cls: `mmw-xcrumb` });
        b.type = `button`;
        b.addEventListener(`click`, () => go(parts.slice(0, i + 1).join(`/`)));
      });
      list.empty();
      const row = (label: string, cls: string, onClick: () => void): void => {
        const r = list.createEl(`button`, { text: label, cls: `mmw-xrow ${cls}` });
        r.type = `button`;
        r.addEventListener(`click`, onClick);
      };
      if (target.folder !== ``) row(t(`Dossier parent`), `mmw-xup`, () => go(target.folder.includes(`/`) ? target.folder.slice(0, target.folder.lastIndexOf(`/`)) : ``));
      const here = target.folder === `` ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(target.folder);
      const children = here instanceof TFolder ? here.children : [];
      const folders = children.filter((c): c is TFolder => c instanceof TFolder).sort((x, y) => x.name.localeCompare(y.name));
      const pdfs = children.filter((c): c is TFile => c instanceof TFile && c.extension.toLowerCase() === kind).sort((x, y) => x.name.localeCompare(y.name));
      for (const f of folders) row(f.name, `mmw-xfolder`, () => go(f.path));
      for (const f of pdfs) {
        row(f.name, `mmw-xpdf`, () => {
          target.name = f.name;
          this.names[kind] = f.name;
          name.setValue(f.name);
          check();
        });
      }
      if (folders.length === 0 && pdfs.length === 0) list.createDiv({ cls: `mmw-pnote`, text: t(`Ce dossier est vide.`) });
    };

    if (kind === `html`) {
      contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Un seul fichier autonome : le texte, les images, les formules et les polices sont dans la page. Ouvrez-le dans un navigateur ou publiez-le sur un site web. Un lien public Nextcloud affiche le texte de la page, pas la page.`) });
    }
    contentEl.createDiv({ cls: `mmw-pzone-title`, text: t(`Dossier d'enregistrement`) });
    crumbs = contentEl.createDiv({ cls: `mmw-xcrumbs` });
    list = contentEl.createDiv({ cls: `mmw-xlist` });

    // Nouveau dossier : Entree dans la zone ou bouton Creer ; le dossier n'est cree qu'a l'export.
    let created: TextComponent | null = null;
    const addFolder = (): void => {
      const v = (created?.getValue() ?? ``).trim().replace(/[\\/:*?"<>|]/g, `-`);
      if (v === ``) return;
      created?.setValue(``);
      go(target.folder === `` ? v : `${target.folder}/${v}`);
    };
    new Setting(contentEl)
      .setName(t(`Nouveau dossier`))
      .setDesc(t(`Créé dans le dossier choisi au moment de l'export.`))
      .addText((x) => {
        created = x;
        x.setPlaceholder(t(`Nom du dossier`));
        x.inputEl.addEventListener(`keydown`, (e) => {
          if (e.key === `Enter`) addFolder();
        });
      })
      .addButton((b) => b.setButtonText(t(`Créer`)).onClick(addFolder));

    const name = new TextComponent(new Setting(contentEl).setName(t(`Nom du fichier`)).controlEl);
    name.setValue(target.name).onChange((v) => {
      target.name = v;
      this.names[kind] = v;
      check();
    });
    warning = contentEl.createDiv({ cls: `mmw-export-warning` });
    new Setting(contentEl)
      .addButton((b) => {
        button = b.buttonEl;
        b.setCta().onClick(() => {
          if (target.name.trim() === ``) return;
          this.result = { kind, target: { ...target } };
          this.confirmed = true;
          this.close();
        });
      })
      .addButton((b) => b.setButtonText(t(`Annuler`)).onClick(() => this.close()));
    paint();
    check();
    name.inputEl.focus();
    name.inputEl.select();
  }

  onClose() {
    this.contentEl.empty();
    this.done(this.confirmed ? this.result : null);
  }
}

// Compte rendu de l'export, affiche seulement quand il y a quelque chose a signaler.
export class ExportReportModal extends Modal {
  constructor(app: App, private path: string, private lines: string[], private extension: ExportExtension = `pdf`) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText(t(`Rapport d'export`));
    this.contentEl.createEl(`p`, { text: this.extension === `html` ? t(`HTML enregistré : {0}`, this.path) : t(`PDF enregistré : {0}`, this.path) });
    const list = this.contentEl.createEl(`ul`);
    for (const l of this.lines) list.createEl(`li`, { text: l });
  }

  onClose() {
    this.contentEl.empty();
  }
}

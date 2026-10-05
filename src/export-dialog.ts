// Fenetre qui demande ou enregistrer le PDF : dossier et nom proposes par defaut, remplacement confirme.
import { App, Modal, Setting, TextComponent, TFile, TFolder } from "obsidian";
import { t } from "./i18n";

export interface ExportTarget {
  folder: string;
  name: string;
}

// Chemin du fichier PDF dans le coffre.
export function targetPath(target: ExportTarget): string {
  const folder = target.folder.replace(/^\/+|\/+$/g, ``);
  const name = target.name.trim().replace(/[\\/:*?"<>|]/g, `-`);
  return (folder === `` ? `` : `${folder}/`) + (/\.pdf$/i.test(name) ? name : `${name}.pdf`);
}

export class ExportDialog extends Modal {
  private result: ExportTarget | null = null;
  private confirmed = false;

  constructor(app: App, private initial: ExportTarget, private done: (target: ExportTarget | null) => void) {
    super(app);
  }

  // Dossier du coffre le plus proche de `path` qui existe (la racine, a defaut).
  private nearestFolder(path: string): string {
    let p = path.replace(/^\/+|\/+$/g, ``);
    while (p !== `` && !(this.app.vault.getAbstractFileByPath(p) instanceof TFolder)) p = p.includes(`/`) ? p.slice(0, p.lastIndexOf(`/`)) : ``;
    return p;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass(`mmw-xmodal`);
    this.titleEl.setText(t(`Exporter en PDF`));
    const target: ExportTarget = { ...this.initial, folder: this.nearestFolder(this.initial.folder) };
    let warning: HTMLElement;
    let button: HTMLButtonElement;
    let crumbs: HTMLElement;
    let list: HTMLElement;

    const check = (): void => {
      const replacing = this.app.vault.getAbstractFileByPath(targetPath(target)) instanceof TFile;
      warning.setText(replacing ? t(`Ce fichier existe déjà : il sera remplacé si vous confirmez.`) : ``);
      button.setText(replacing ? t(`Remplacer`) : t(`Exporter`));
    };

    const go = (folder: string): void => {
      target.folder = folder;
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
      const pdfs = children.filter((c): c is TFile => c instanceof TFile && c.extension.toLowerCase() === `pdf`).sort((x, y) => x.name.localeCompare(y.name));
      for (const f of folders) row(f.name, `mmw-xfolder`, () => go(f.path));
      for (const f of pdfs) {
        row(f.name, `mmw-xpdf`, () => {
          target.name = f.name;
          name.setValue(f.name);
          check();
        });
      }
      if (folders.length === 0 && pdfs.length === 0) list.createDiv({ cls: `mmw-pnote`, text: t(`Ce dossier est vide.`) });
    };

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
      check();
    });
    warning = contentEl.createDiv({ cls: `mmw-export-warning` });
    new Setting(contentEl)
      .addButton((b) => {
        button = b.buttonEl;
        b.setCta().onClick(() => {
          if (target.name.trim() === ``) return;
          this.result = { ...target };
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
  constructor(app: App, private path: string, private lines: string[]) {
    super(app);
  }

  onOpen() {
    this.titleEl.setText(t(`Rapport d'export`));
    this.contentEl.createEl(`p`, { text: t(`PDF enregistré : {0}`, this.path) });
    const list = this.contentEl.createEl(`ul`);
    for (const l of this.lines) list.createEl(`li`, { text: l });
  }

  onClose() {
    this.contentEl.empty();
  }
}

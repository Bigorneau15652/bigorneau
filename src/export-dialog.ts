// Fenetre qui demande ou enregistrer le PDF : dossier et nom proposes par defaut, remplacement confirme.
import { AbstractInputSuggest, App, Modal, Setting, TFile, TFolder } from "obsidian";
import { t } from "./i18n";

// Proposition de dossiers du coffre pendant la saisie.
class FolderSuggest extends AbstractInputSuggest<TFolder> {
  constructor(app: App, private input: HTMLInputElement) {
    super(app, input);
  }

  getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase();
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && f.path !== `/` && f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.input.value = folder.path;
    this.input.dispatchEvent(new Event(`input`));
    this.close();
  }
}

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

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText(t(`Exporter en PDF`));
    const target: ExportTarget = { ...this.initial };
    let warning: HTMLElement;
    let button: HTMLButtonElement;
    let replacing = false;

    const check = (): void => {
      replacing = this.app.vault.getAbstractFileByPath(targetPath(target)) instanceof TFile;
      warning.setText(replacing ? t(`Ce fichier existe déjà : il sera remplacé si vous confirmez.`) : ``);
      button.setText(replacing ? t(`Remplacer`) : t(`Exporter`));
    };

    new Setting(contentEl)
      .setName(t(`Dossier`))
      .setDesc(t(`Dossier du coffre où enregistrer le PDF (créé s'il n'existe pas).`))
      .addText((x) => {
        x.setValue(target.folder).onChange((v) => {
          target.folder = v;
          check();
        });
        new FolderSuggest(this.app, x.inputEl);
      });
    new Setting(contentEl).setName(t(`Nom du fichier`)).addText((x) =>
      x.setValue(target.name).onChange((v) => {
        target.name = v;
        check();
      })
    );
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
    check();
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

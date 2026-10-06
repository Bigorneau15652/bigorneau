// Bouton Lorem ipsum : une petite fenetre demande la taille des paragraphes (6 : un paragraphe de 6 lignes ; 6,4,2 : trois paragraphes de
// 6, 4 et 2 lignes), puis le texte est ecrit dans la note a la place du curseur.
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";
import { CHARS_PER_LINE, generateLorem, parseSizes } from "./lorem";

export interface LoremChoice {
  spec: string;
  blankLine: boolean;
}

export class LoremModal extends Modal {
  private spec: string;
  private blankLine: boolean;

  constructor(app: App, initial: LoremChoice, private onChoose: (choice: LoremChoice, text: string) => void) {
    super(app);
    this.spec = initial.spec;
    this.blankLine = initial.blankLine;
  }

  onOpen(): void {
    this.titleEl.setText(t(`Texte Lorem ipsum`));
    const { contentEl } = this;
    contentEl.empty();
    const note = contentEl.createDiv({ cls: `mmw-pnote` });
    const preview = (): void => {
      const sizes = parseSizes(this.spec);
      note.setText(sizes.length === 0 ? t(`Saisissez au moins un nombre de lignes.`) : t(`{0} paragraphe(s) : {1} ligne(s) au total, d'environ {2} caractères par ligne.`, sizes.length, sizes.reduce((a, b) => a + b, 0), CHARS_PER_LINE));
    };
    const submit = (): void => {
      if (parseSizes(this.spec).length === 0) return;
      this.close();
      this.onChoose({ spec: this.spec, blankLine: this.blankLine }, generateLorem(this.spec, this.blankLine));
    };
    new Setting(contentEl)
      .setName(t(`Taille des paragraphes, en lignes`))
      .setDesc(t(`6 : un paragraphe de 6 lignes. 6,4,2 : trois paragraphes de 6, 4 et 2 lignes.`))
      .addText((x) => {
        x.setValue(this.spec).setPlaceholder(`6,4,2`);
        x.onChange((v) => {
          this.spec = v;
          preview();
        });
        x.inputEl.addEventListener(`keydown`, (e) => {
          if (e.key === `Enter`) submit();
        });
        window.setTimeout(() => {
          x.inputEl.focus();
          x.inputEl.select();
        }, 0);
      });
    new Setting(contentEl)
      .setName(t(`Ligne vide entre les paragraphes`))
      .setDesc(t(`Sans elle, les paragraphes se suivent à la ligne. Avec elle, ils restent distincts dans l'export PDF.`))
      .addToggle((x) => x.setValue(this.blankLine).onChange((v) => (this.blankLine = v)));
    contentEl.appendChild(note);
    preview();
    new Setting(contentEl).addButton((b) => b.setCta().setButtonText(t(`Insérer`)).onClick(submit)).addButton((b) => b.setButtonText(t(`Annuler`)).onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

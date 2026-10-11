// « Marks » window of the page layout module: one button of the panel opens it, and it gives access to the three actions that write a
// hidden mark into the note (exception for one paragraph, orientation of a block, lists of figures and tables).
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";

export interface MarkItem {
  name: string;
  description: string;
  // True when the note already holds this kind of mark at the cursor or anywhere.
  active: boolean;
  run: () => void;
}

export class MarksModal extends Modal {
  constructor(app: App, private items: MarkItem[]) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Repères`));
    this.contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Place le curseur à l'endroit voulu avant d'ouvrir un repère : il s'applique au paragraphe ou au bloc où se trouve le curseur.`) });
    for (const item of this.items) {
      new Setting(this.contentEl)
        .setName(item.name)
        .setDesc(item.active ? `${item.description} ${t(`Déjà présent dans la note.`)}` : item.description)
        .addButton((b) =>
          b.setButtonText(t(`Ouvrir`)).onClick(() => {
            this.close();
            item.run();
          })
        );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

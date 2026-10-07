// Fenetre « Listes des illustrations » : place, deplace ou retire la liste des figures et la liste des tableaux de la note. Chaque liste
// est une etiquette cachee ecrite avant le bloc ou se trouve le curseur (voir illustration-list.ts).
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";
import type { ListKind } from "./illustration-list";

export interface IllustrationListHost {
  // Listes actuellement demandees dans la note.
  present(): ListKind[];
  place(kind: ListKind): void;
  remove(kind: ListKind): void;
}

export class IllustrationListModal extends Modal {
  constructor(app: App, private host: IllustrationListHost) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Listes des illustrations`));
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Place le curseur à l'endroit voulu avant d'ouvrir cette fenêtre : la liste est insérée avant le bloc où il se trouve. Seuls les figures et les tableaux qui portent un nom y figurent.`) });
    const present = this.host.present();
    const row = (kind: ListKind, name: string): void => {
      const here = present.includes(kind);
      new Setting(contentEl)
        .setName(name)
        .setDesc(here ? t(`Présente dans la note.`) : t(`Absente de la note.`))
        .addButton((b) =>
          b.setButtonText(here ? t(`Placer ici`) : t(`Ajouter ici`)).onClick(() => {
            this.host.place(kind);
            this.render();
          })
        )
        .addButton((b) =>
          b.setButtonText(t(`Retirer`)).setDisabled(!here).onClick(() => {
            this.host.remove(kind);
            this.render();
          })
        );
    };
    row(`figures`, t(`Liste des figures`));
    row(`tables`, t(`Liste des tableaux`));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

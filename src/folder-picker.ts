// Choix d'un dossier du coffre dans une liste a recherche (dossier des polices).
import { App, FuzzySuggestModal, TFolder } from "obsidian";
import { t } from "./i18n";

export class FolderPicker extends FuzzySuggestModal<string> {
  constructor(app: App, private onPick: (path: string) => void) {
    super(app);
    this.setPlaceholder(t(`Choisir un dossier du coffre`));
  }

  getItems(): string[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && f.path !== `/` && f.path !== ``)
      .map((f) => f.path)
      .sort((a, b) => a.localeCompare(b));
  }

  getItemText(path: string): string {
    return path;
  }

  onChooseItem(path: string): void {
    this.onPick(path);
  }
}

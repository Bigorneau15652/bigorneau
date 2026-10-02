// Fenetre d'aide : une zone de recherche et les entrees d'aide du plugin (et, plus tard, de chaque script). Elle fonctionne hors
// connexion, en francais ou en anglais selon la langue du plugin.
import { App, Modal } from "obsidian";
import { HelpEntry, searchHelp } from "./help";
import { currentLang, t } from "./i18n";

export class HelpModal extends Modal {
  constructor(app: App, private entries: () => HelpEntry[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(`mmw-help`);
    this.titleEl.setText(t(`Aide de Bigorneau`));
    const input = contentEl.createEl(`input`, { cls: `mmw-help-search`, attr: { type: `search`, placeholder: t(`Rechercher dans l'aide`) } });
    const results = contentEl.createDiv({ cls: `mmw-help-results` });
    const draw = (): void => {
      results.empty();
      const lang = currentLang();
      const found = searchHelp(this.entries(), input.value, lang);
      if (found.length === 0) {
        results.createDiv({ cls: `mmw-help-empty`, text: t(`Aucun résultat.`) });
        return;
      }
      for (const entry of found) {
        const block = results.createDiv({ cls: `mmw-help-entry` });
        block.createEl(`h4`, { text: entry.title[lang] });
        for (const line of entry.text[lang].split(`\n`)) block.createEl(`p`, { text: line });
      }
    };
    input.addEventListener(`input`, draw);
    draw();
    input.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

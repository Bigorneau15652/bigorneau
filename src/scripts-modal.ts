// Modules window (Bigorneau button of the panel): list of the built-in modules with an on/off switch, panel buttons and diagnostic.
import { App, Modal, Notice, Setting } from "obsidian";
import { currentLang, t } from "./i18n";
import type MindmapWritingPlugin from "./main";
import { renderButtonList } from "./panel-buttons";
import { ScriptInfo } from "./scripts";

export class ScriptsModal extends Modal {
  constructor(app: App, private plugin: MindmapWritingPlugin) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Modules et boutons`));
    this.draw();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // Draws the whole window again (after a switch or a change of the buttons).
  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(`mmw-scripts`);
    contentEl.createEl(`p`, { cls: `mmw-scripts-intro`, text: t(`Les modules ajoutent des fonctions à Bigorneau : chacun apporte des boutons et des commandes. Désactiver un module le rend inactif tout de suite, mais son code ne se décharge qu'au redémarrage d'Obsidian.`) });
    const list = contentEl.createDiv({ cls: `mmw-scripts-list` });
    for (const info of this.plugin.scripts.info()) this.row(list, info);
    // Panel buttons: visible or not, order, separators (same settings as in the Obsidian settings).
    new Setting(contentEl).setName(t(`Boutons du panneau`)).setHeading();
    renderButtonList(contentEl.createDiv(), this.plugin);
    new Setting(contentEl)
      .setName(t(`Diagnostic`))
      .setDesc(t(`Affiche l'état du plugin, des modules et les temps mesurés, à envoyer avec la description d'un problème.`))
      .addButton((b) =>
        b.setButtonText(t(`Ouvrir le diagnostic`)).onClick(() => {
          this.close();
          this.plugin.openDiagnostic();
        })
      );
  }

  // One module: name, description, status and on/off switch.
  private row(list: HTMLElement, info: ScriptInfo): void {
    const lang = currentLang();
    const row = new Setting(list).setName(`${info.name[lang]} (${info.version})`);
    row.descEl.empty();
    row.descEl.createDiv({ text: info.description[lang] });
    row.descEl.createDiv({ cls: `mmw-scripts-status`, text: this.statusText(info) });
    row.addToggle((x) =>
      x.setValue(info.enabled).onChange(async (on) => {
        await this.plugin.scripts.setEnabled(info.id, on);
        if (!on && info.loaded) new Notice(t(`Le module « {0} » est désactivé. Il sera complètement déchargé au redémarrage d'Obsidian.`, info.name[lang]));
        this.plugin.panel.sync();
        this.draw();
      })
    );
  }

  private statusText(info: ScriptInfo): string {
    switch (info.status) {
      case `blocked`:
        return t(`Nécessite : {0}.`, info.detail ?? ``);
      case `error`:
        return t(`Erreur : {0}`, info.detail ?? ``);
      default:
        return info.enabled ? t(`Activé.`) : t(`Désactivé.`);
    }
  }
}

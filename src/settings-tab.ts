import { App, PluginSettingTab, Setting } from "obsidian";
import type MindmapWritingPlugin from "./main";
import type { BranchStyle, FrameStyle, LongTitles } from "./settings";

export class MmSettingTab extends PluginSettingTab {
  private plugin: MindmapWritingPlugin;

  constructor(app: App, plugin: MindmapWritingPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl).setName(`Apparence de la carte`).setHeading();

    new Setting(containerEl)
      .setName(`Titres longs`)
      .setDesc(`Comportement d'un titre plus large que la case : coupé avec des points de suspension (le titre complet s'affiche au survol) ou passage à la ligne.`)
      .addDropdown((d) =>
        d
          .addOption(`ellipsis`, `Couper avec des points de suspension`)
          .addOption(`wrap`, `Passer à la ligne`)
          .setValue(s.longTitles)
          .onChange(async (v) => {
            s.longTitles = v as LongTitles;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Largeur maximale des cases`)
      .setDesc(`En pixels.`)
      .addSlider((sl) =>
        sl
          .setLimits(120, 480, 10)
          .setValue(s.maxWidth)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.maxWidth = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Contour des cases`)
      .addDropdown((d) =>
        d
          .addOption(`sketch`, `Trait de crayon`)
          .addOption(`rounded`, `Angles arrondis`)
          .addOption(`straight`, `Rectangle`)
          .addOption(`none`, `Sans contour`)
          .setValue(s.frameStyle)
          .onChange(async (v) => {
            s.frameStyle = v as FrameStyle;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Style des branches`)
      .addDropdown((d) =>
        d
          .addOption(`sketch`, `Trait de crayon`)
          .addOption(`curve`, `Courbe`)
          .addOption(`elbow`, `En angle`)
          .addOption(`straight`, `Droit`)
          .setValue(s.branchStyle)
          .onChange(async (v) => {
            s.branchStyle = v as BranchStyle;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Afficher le préfixe Markdown`)
      .setDesc(`Affiche les dièses (#, ##, ###) devant chaque titre de la carte.`)
      .addToggle((t) =>
        t.setValue(s.showPrefix).onChange(async (v) => {
          s.showPrefix = v;
          await this.plugin.saveSettings();
        })
      );
  }
}

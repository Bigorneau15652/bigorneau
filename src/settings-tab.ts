import { App, PluginSettingTab, Setting } from "obsidian";
import type MindmapWritingPlugin from "./main";
import type { BranchStyle, CursorPosition, FrameStyle, LongTitles, PanePosition, ParagraphMode } from "./settings";

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

    new Setting(containerEl).setName(`Rédaction`).setHeading();

    new Setting(containerEl)
      .setName(`Mode de rédaction`)
      .setDesc(`Note Obsidian en vis-à-vis : la carte pilote l'éditeur réel d'Obsidian, ouvert à côté (aperçu en direct, images, tableaux, callouts, Excalidraw, Dataview). Éditeur intégré simple : zone de texte limitée à un seul nœud, sans aperçu en direct.`)
      .addDropdown((d) =>
        d
          .addOption(`native`, `Note Obsidian en vis-à-vis (recommandé)`)
          .addOption(`simple`, `Éditeur intégré simple (limité)`)
          .setValue(s.paragraphMode)
          .onChange(async (v) => {
            s.paragraphMode = v as ParagraphMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Position de la zone de rédaction`)
      .setDesc(`Emplacement par rapport à la carte. Avec l'éditeur intégré simple, la taille se règle en faisant glisser la barre de séparation.`)
      .addDropdown((d) =>
        d
          .addOption(`right`, `À droite de la carte`)
          .addOption(`left`, `À gauche de la carte`)
          .addOption(`top`, `Au-dessus de la carte`)
          .addOption(`bottom`, `En dessous de la carte`)
          .setValue(s.panePosition)
          .onChange(async (v) => {
            s.panePosition = v as PanePosition;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Position du curseur à l'ouverture d'un paragraphe`)
      .setDesc(`S'applique quand vous appuyez sur Entrée sur un titre sélectionné de la carte.`)
      .addDropdown((d) =>
        d
          .addOption(`last`, `Là où la saisie s'était arrêtée`)
          .addOption(`start`, `Au début du paragraphe`)
          .addOption(`end`, `À la fin du paragraphe`)
          .setValue(s.cursorPosition)
          .onChange(async (v) => {
            s.cursorPosition = v as CursorPosition;
            await this.plugin.saveSettings();
          })
      );
  }
}

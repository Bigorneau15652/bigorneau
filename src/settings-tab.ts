import { App, Platform, PluginSettingTab, Setting } from "obsidian";
import { comboLabel, eventToCombo } from "./keys";
import type MindmapWritingPlugin from "./main";
import { appearanceDefaults, CursorPosition, DEFAULT_SETTINGS, LongTitles, MmSettings, PanePosition } from "./settings";

type KeyField = `keyPrev` | `keyNext` | `keyParent` | `keyChild`;

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

    new Setting(containerEl).setName(`Rédaction`).setHeading();

    new Setting(containerEl)
      .setName(`Position de la note`)
      .setDesc(`Emplacement de la note, ouverte à côté de la carte, par rapport à la carte.`)
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
      .setName(`Passer directement à la saisie au clic sur un titre`)
      .setDesc(`Désactivé : un clic sur un titre de la carte amène la note au chapitre sans quitter la carte, et Entrée passe à la saisie. Activé : le clavier passe aussitôt dans la note.`)
      .addToggle((t) =>
        t.setValue(s.focusNoteOnSelect).onChange(async (v) => {
          s.focusNoteOnSelect = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(`Position du curseur à l'ouverture d'un paragraphe`)
      .setDesc(`S'applique à la sélection d'un titre dans la carte. Par défaut, le curseur est à la fin du texte du chapitre pour le compléter.`)
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

    new Setting(containerEl)
      .setName(`Masquer les commentaires de la carte dans la note`)
      .setDesc(`Les étiquettes, le titre court, le commentaire et les styles d'un titre sont conservés dans une ligne de commentaire sous le titre (%% mmw ... %%). Activé : cette ligne n'apparaît pas dans la note. Désactivé : elle reste visible.`)
      .addToggle((t) =>
        t.setValue(s.hideMetaLines).onChange(async (v) => {
          s.hideMetaLines = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName(`Carte`).setHeading();

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
      .setName(`Contraste de la case sélectionnée`)
      .setDesc(`Force de la mise en évidence du titre sélectionné : discrète quand vous écrivez dans la note, marquée avec un halo quand la carte a le focus.`)
      .addSlider((sl) =>
        sl
          .setLimits(0, 100, 5)
          .setValue(s.selectionContrast)
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.selectionContrast = v;
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

    new Setting(containerEl)
      .setName(`Apparence`)
      .setDesc(`Couleurs, traits, angles, police et taille du texte se règlent avec le bouton en forme de palette, en bas à gauche de la carte.`)
      .addButton((b) =>
        b.setButtonText(`Réinitialiser l'apparence`).onClick(async () => {
          await this.plugin.updateSettings(appearanceDefaults());
        })
      );

    new Setting(containerEl).setName(`Chapitre actif`).setHeading();

    new Setting(containerEl)
      .setName(`Griser les chapitres inactifs dans la note`)
      .setDesc(`Le chapitre qui contient le curseur reste en contraste normal, les autres sont grisés mais lisibles. S'applique à l'éditeur (modes Édition et Aperçu en direct) de la note reliée à la carte..`)
      .addToggle((t) =>
        t.setValue(s.contrastEnabled).onChange(async (v) => {
          s.contrastEnabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(`Masquer les chapitres inactifs dans la note`)
      .setDesc(`Activé : la note ne montre que le chapitre actif (son titre, son texte, et ses sous-titres si l'option ci-dessous est cochée). Les autres chapitres restent dans le fichier ; ils réapparaissent en sélectionnant leur titre dans la carte. Désactivé : ils sont seulement grisés. Une commande d'Obsidian permet aussi de basculer ce mode avec un raccourci.`)
      .addToggle((t) =>
        t.setValue(s.hideInactive).onChange(async (v) => {
          s.hideInactive = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName(`Contraste des chapitres inactifs`)
      .setDesc(`Plus la valeur est basse, plus le texte inactif est clair.`)
      .addSlider((sl) =>
        sl
          .setLimits(15, 90, 5)
          .setValue(Math.round(s.inactiveOpacity * 100))
          .setDynamicTooltip()
          .onChange(async (v) => {
            s.inactiveOpacity = v / 100;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(`Inclure les dépendances dans le chapitre actif`)
      .setDesc(`Désactivé (par défaut) : seul le titre où se trouve le curseur et son texte sont actifs. Activé : ses sous-titres le sont aussi.`)
      .addToggle((t) =>
        t.setValue(s.includeSubtitles).onChange(async (v) => {
          s.includeSubtitles = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl).setName(`Navigation entre chapitres depuis la note`).setHeading();
    this.addKeySetting(containerEl, `Chapitre précédent`, `keyPrev`);
    this.addKeySetting(containerEl, `Chapitre suivant`, `keyNext`);
    this.addKeySetting(containerEl, `Chapitre parent`, `keyParent`);
    this.addKeySetting(containerEl, `Premier sous-titre`, `keyChild`);
  }

  // Ligne de reglage d'une touche : un bouton qui attend la combinaison a enregistrer.
  private addKeySetting(containerEl: HTMLElement, name: string, field: KeyField) {
    const s = this.plugin.settings;
    const isMac = Platform.isMacOS;
    new Setting(containerEl)
      .setName(name)
      .setDesc(`Fonctionne dans la note reliée à la carte. Cliquez sur le bouton puis tapez la combinaison voulue (Échap pour annuler).`)
      .addButton((btn) => {
        btn.setButtonText(comboLabel(s[field], isMac));
        btn.onClick(() => {
          btn.setButtonText(`Tapez la combinaison...`);
          const listener = (e: KeyboardEvent) => {
            if ([`Control`, `Shift`, `Alt`, `Meta`].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            window.removeEventListener(`keydown`, listener, true);
            if (e.key !== `Escape`) {
              s[field] = eventToCombo(e, isMac);
              void this.plugin.saveSettings(false);
            }
            btn.setButtonText(comboLabel(s[field], isMac));
          };
          window.addEventListener(`keydown`, listener, true);
        });
      })
      .addExtraButton((b) =>
        b
          .setIcon(`reset`)
          .setTooltip(`Rétablir la valeur d'origine`)
          .onClick(async () => {
            s[field] = (DEFAULT_SETTINGS as MmSettings)[field];
            await this.plugin.saveSettings(false);
            this.display();
          })
      );
  }
}

import { App, Platform, PluginSettingTab, Setting, TFolder } from "obsidian";
import { DEFAULT_ICON, IconKind, ICONS, iconSvg } from "./icons";
import { setLanguage, t } from "./i18n";
import { comboLabel, eventToCombo } from "./keys";
import type MindmapWritingPlugin from "./main";
import {
  appearanceDefaults,
  BranchStyle,
  CursorPosition,
  DEFAULT_SETTINGS,
  FontFamily,
  LanguageSetting,
  LongTitles,
  MmSettings,
  NewNoteFolderMode,
  PanePosition,
  Roughness,
  ViewMode,
} from "./settings";
import { SHAPE_CHOICES, ShapeChoice, shapeChoice, shapePatch } from "./style";

type KeyField = `keyPrev` | `keyNext` | `keyParent` | `keyChild`;
type IconField = `iconExternal` | `iconInternal` | `iconWeb`;
type ColorField = `iconColorExternal` | `iconColorInternal` | `iconColorWeb`;
type Bool = {
  [K in keyof MmSettings]: MmSettings[K] extends boolean ? K : never;
}[keyof MmSettings];

// Page des reglages : une liste de chapitres, tous repliés au départ ; un triangle ouvre ou ferme chacun, et le choix est
// mémorisé d'une ouverture à l'autre.
export class MmSettingTab extends PluginSettingTab {
  private plugin: MindmapWritingPlugin;

  constructor(app: App, plugin: MindmapWritingPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass(`mmw-settings`);

    this.chapter(`general`, t(`Général`), t(`Langue et vue affichée à l'ouverture`), (el) => this.buildGeneral(el));
    this.chapter(`mindmap`, t(`Vue Mindmap`), t(`Cases, branches, traits, police et contraste de la carte mentale`), (el) => this.buildMindmap(el));
    this.chapter(`list`, t(`Vue Liste`), t(`Liste condensée : un titre par ligne`), (el) => this.buildList(el));
    this.chapter(`display`, t(`Éléments affichés`), t(`Ce que la carte montre par défaut (menu de l'œil)`), (el) => this.buildDisplay(el));
    this.chapter(`writing`, t(`Rédaction`), t(`Position de la note, curseur et commentaires du plugin`), (el) => this.buildWriting(el));
    this.chapter(`active`, t(`Chapitre actif`), t(`Grisage ou masquage des chapitres inactifs dans la note`), (el) => this.buildActive(el));
    this.chapter(`fixed`, t(`Notes fixes`), t(`Copies d'un chapitre dans leur propre volet`), (el) => this.buildFixed(el));
    this.chapter(`floats`, t(`Sujets flottants`), t(`Sujets de notes libres, hors de la carte : niveau, forme, couleurs`), (el) => this.buildFloats(el));
    this.chapter(`links`, t(`Liens et icônes`), t(`Icônes et couleurs des repères de liens`), (el) => this.buildLinks(el));
    this.chapter(`notes`, t(`Nouvelles notes`), t(`Dossier des notes créées depuis la carte`), (el) => this.buildNotes(el));
    this.chapter(`export`, t(`Export PDF`), t(`Métadonnées du PDF produit par l'export de haute qualité`), (el) => this.buildExport(el));
    this.chapter(`keys`, t(`Navigation au clavier`), t(`Raccourcis pour passer d'un chapitre à l'autre depuis la note`), (el) => this.buildKeys(el));
  }

  // Un chapitre repliable : titre, courte description et triangle.
  private chapter(id: string, title: string, desc: string, build: (el: HTMLElement) => void): void {
    const s = this.plugin.settings;
    const details = this.containerEl.createEl(`details`, { cls: `mmw-chapter` });
    details.open = s.openChapters.includes(id);
    const summary = details.createEl(`summary`, { cls: `mmw-chapter-summary` });
    summary.createEl(`span`, { cls: `mmw-chapter-title`, text: title });
    summary.createEl(`span`, { cls: `mmw-chapter-desc`, text: desc });
    const body = details.createEl(`div`, { cls: `mmw-chapter-body` });
    let built = false;
    const fill = (): void => {
      if (built) return;
      built = true;
      build(body);
    };
    if (details.open) fill();
    details.addEventListener(`toggle`, () => {
      if (details.open) fill();
      const set = new Set(s.openChapters);
      if (details.open) set.add(id);
      else set.delete(id);
      s.openChapters = [...set];
      void this.plugin.saveSettings(false);
    });
  }

  // ---------------------------------------------------------------- aides

  private toggle(el: HTMLElement, name: string, desc: string, field: Bool): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addToggle((tg) =>
        tg.setValue(s[field]).onChange(async (v) => {
          s[field] = v;
          await this.plugin.saveSettings();
        })
      );
  }

  private dropdown<K extends keyof MmSettings>(el: HTMLElement, name: string, desc: string, field: K, options: [string, string][], convert: (v: string) => MmSettings[K]): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addDropdown((d) => {
        for (const [value, label] of options) d.addOption(value, label);
        d.setValue(String(s[field])).onChange(async (v) => {
          s[field] = convert(v);
          await this.plugin.saveSettings();
        });
      });
  }

  private slider(el: HTMLElement, name: string, desc: string, field: `maxWidth` | `compactness` | `selectionContrast` | `strokeWidth` | `fontScale`, min: number, max: number, step: number): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addSlider((sl) =>
        sl
          .setLimits(min, max, step)
          .setValue(s[field])
          .setDynamicTooltip()
          .onChange(async (v) => {
            s[field] = v;
            await this.plugin.saveSettings();
          })
      );
  }

  // ---------------------------------------------------------------- chapitres

  private buildGeneral(el: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(t(`Langue du plugin`))
      .setDesc(t(`Automatique : la langue d'Obsidian est utilisée (français ou anglais, l'anglais pour toute autre langue).`))
      .addDropdown((d) =>
        d
          .addOption(`auto`, t(`Automatique`))
          .addOption(`fr`, `Français`)
          .addOption(`en`, `English`)
          .setValue(s.language)
          .onChange(async (v) => {
            s.language = v as LanguageSetting;
            setLanguage(s.language);
            await this.plugin.saveSettings();
            this.display();
          })
      );
    this.dropdown(el, t(`Vue à l'ouverture`), t(`Type de vue utilisé par la carte : carte mentale ou liste condensée. Le bouton de la barre de commandes permet d'en changer à tout moment.`), `viewMode`, [
      [`map`, t(`Mindmap`)],
      [`list`, t(`Liste`)],
    ], (v) => v as ViewMode);
  }

  private buildMindmap(el: HTMLElement): void {
    const s = this.plugin.settings;
    this.dropdown(el, t(`Titres longs`), t(`Comportement d'un titre plus large que la case : coupé avec des points de suspension (le titre complet s'affiche au survol) ou passage à la ligne.`), `longTitles`, [
      [`ellipsis`, t(`Couper avec des points de suspension`)],
      [`wrap`, t(`Passer à la ligne`)],
    ], (v) => v as LongTitles);
    this.slider(el, t(`Largeur maximale des cases`), t(`En pixels.`), `maxWidth`, 120, 480, 10);
    this.slider(el, t(`Compacité`), t(`Espace autour des titres : plus la valeur est basse, plus la carte est serrée.`), `compactness`, 0.3, 2, 0.1);
    this.slider(el, t(`Contraste de la case sélectionnée`), t(`Force de la mise en évidence du titre sélectionné : discrète quand vous écrivez dans la note, marquée avec un halo quand la carte a le focus.`), `selectionContrast`, 0, 100, 5);
    this.toggle(el, t(`Afficher le préfixe Markdown`), t(`Affiche les dièses (#, ##, ###) devant chaque titre de la carte.`), `showPrefix`);
    this.dropdown(el, t(`Branches`), t(`Forme des traits qui relient les cases.`), `branchStyle`, [
      [`elbow`, t(`En angle`)],
      [`curve`, t(`Courbes`)],
      [`straight`, t(`Droites`)],
    ], (v) => v as BranchStyle);
    this.toggle(el, t(`Contour des cases`), t(`Dessine un cadre autour de chaque titre.`), `showFrames`);
    new Setting(el)
      .setName(t(`Forme`))
      .setDesc(t(`Forme des cases de la carte. Chaque titre ou chaque niveau peut ensuite avoir sa propre forme depuis le bouton Apparence de la carte.`))
      .addDropdown((d) => {
        for (const c of SHAPE_CHOICES) d.addOption(c, this.shapeLabel(c));
        d.setValue(shapeChoice(s)).onChange(async (v) => {
          await this.plugin.updateSettings(shapePatch(v as ShapeChoice) as Partial<MmSettings>);
        });
      });
    this.colorSetting(el, t(`Couleur du trait`), t(`Contour et texte des cases. Vide : couleur du thème.`), `strokeColor`);
    this.colorSetting(el, t(`Couleur de fond`), t(`Fond des cases. Vide : transparent.`), `fillColor`);
    this.dropdown(el, t(`Type de ligne`), t(`Trait du contour des cases.`), `strokeDash`, [
      [`solid`, t(`Continu`)],
      [`dashed`, t(`Tirets`)],
      [`dotted`, t(`Pointillés`)],
    ], (v) => v as MmSettings[`strokeDash`]);
    this.dropdown(el, t(`Alignement du texte`), t(`Position du texte dans les cases.`), `textAlign`, [
      [`left`, t(`À gauche`)],
      [`center`, t(`Centré`)],
      [`right`, t(`À droite`)],
    ], (v) => v as MmSettings[`textAlign`]);
    this.dropdown(el, t(`Style de tracé`), t(`Netteté du trait.`), `roughness`, [
      [`0`, t(`Architecte : trait net`)],
      [`1`, t(`Artiste : trait de crayon`)],
      [`2`, t(`Caricaturiste : trait très irrégulier`)],
    ], (v) => Number(v) as Roughness);
    this.slider(el, t(`Largeur du contour`), t(`Épaisseur des traits, en pixels.`), `strokeWidth`, 0.5, 5, 0.1);
    this.dropdown(el, t(`Police`), t(`Police du texte des cases.`), `fontFamily`, [
      [`default`, t(`Police de l'interface`)],
      [`handwritten`, t(`Écriture manuscrite`)],
      [`mono`, t(`Code`)],
    ], (v) => v as FontFamily);
    this.slider(el, t(`Taille de la police`), t(`Multiplicateur appliqué à la taille du texte.`), `fontScale`, 0.6, 2, 0.05);
    new Setting(el)
      .setName(t(`Apparence`))
      .setDesc(t(`Les couleurs, les traits, les formes, la police et la taille du texte se règlent aussi avec le bouton en forme de palette de la carte.`))
      .addButton((b) =>
        b.setButtonText(t(`Réinitialiser l'apparence`)).onClick(async () => {
          await this.plugin.updateSettings(appearanceDefaults());
          this.display();
        })
      );
  }

  // Libelle d'une forme proposee.
  private shapeLabel(c: ShapeChoice): string {
    const names: Record<ShapeChoice, string> = {
      rect: t(`Rectangle`),
      rounded: t(`Rectangle arrondi`),
      oval: t(`Ovale`),
      underline: t(`Trait dessous`),
      parallelogram: t(`Losange`),
      diamond: t(`Diamant`),
    };
    return names[c];
  }

  private buildList(el: HTMLElement): void {
    this.toggle(el, t(`Une ligne sur deux plus foncée`), t(`Alterne deux teintes de fond pour suivre facilement les lignes.`), `listStripes`);
    this.toggle(el, t(`Police de la carte`), t(`Désactivé : la liste utilise la police normale de l'interface. Activé : elle reprend la police choisie pour la carte.`), `listMapFont`);
  }

  private buildDisplay(el: HTMLElement): void {
    this.toggle(el, t(`Étiquettes`), t(`Affiche les étiquettes à côté des titres.`), `showTags`);
    this.toggle(el, t(`Bulles de commentaire`), t(`Affiche un repère sur les titres qui ont un commentaire.`), `showComments`);
    this.toggle(el, t(`Liens web (mappemonde)`), t(`Affiche le repère des liens web et des vidéos intégrées.`), `showWebLinks`);
    this.toggle(el, t(`Liens vers d'autres notes`), t(`Affiche les cases des notes liées. Désactivé : un repère coloré les remplace.`), `showExternalLinks`);
    this.toggle(el, t(`Liens dans la note (flèches)`), t(`Affiche les flèches entre titres. Désactivé : un repère coloré les remplace.`), `showInternalLinks`);
    this.toggle(el, t(`Vue noir et blanc`), t(`Affiche la carte sans couleur.`), `blackWhite`);
    this.toggle(el, t(`Flèches toujours colorées`), t(`Les flèches de lien prennent la couleur des liens du thème en permanence. Sinon elles sont neutres et prennent la couleur quand on les sélectionne.`), `linkColored`);
  }

  private buildWriting(el: HTMLElement): void {
    this.dropdown(el, t(`Position de la note`), t(`Emplacement de la note, ouverte à côté de la carte, par rapport à la carte.`), `panePosition`, [
      [`right`, t(`À droite de la carte`)],
      [`left`, t(`À gauche de la carte`)],
      [`top`, t(`Au-dessus de la carte`)],
      [`bottom`, t(`En dessous de la carte`)],
    ], (v) => v as PanePosition);
    this.toggle(el, t(`Passer directement à la saisie au clic sur un titre`), t(`Désactivé : un clic sur un titre de la carte amène la note au chapitre sans quitter la carte, et Entrée passe à la saisie. Activé : le clavier passe aussitôt dans la note.`), `focusNoteOnSelect`);
    this.dropdown(el, t(`Position du curseur à l'ouverture d'un paragraphe`), t(`S'applique à la sélection d'un titre dans la carte. Par défaut, le curseur est à la fin du texte du chapitre pour le compléter.`), `cursorPosition`, [
      [`last`, t(`Là où la saisie s'était arrêtée`)],
      [`start`, t(`Au début du paragraphe`)],
      [`end`, t(`À la fin du paragraphe`)],
    ], (v) => v as CursorPosition);
    this.toggle(el, t(`Masquer les commentaires de la carte dans la note`), t(`Les étiquettes, le titre court, le commentaire et les styles d'un titre sont conservés dans une ligne de commentaire sous le titre (%% mmw ... %%). Activé : cette ligne n'apparaît pas dans la note. Désactivé : elle reste visible.`), `hideMetaLines`);
  }

  private buildActive(el: HTMLElement): void {
    const s = this.plugin.settings;
    this.toggle(el, t(`Griser les chapitres inactifs dans la note`), t(`Le chapitre qui contient le curseur reste en contraste normal, les autres sont grisés mais lisibles. S'applique à l'éditeur (modes Édition et Aperçu en direct) de la note reliée à la carte.`), `contrastEnabled`);
    this.toggle(el, t(`Masquer les chapitres inactifs dans la note`), t(`Activé : la note ne montre que le chapitre actif. Les autres chapitres restent dans le fichier et réapparaissent en sélectionnant leur titre dans la carte. Désactivé : ils sont seulement grisés.`), `hideInactive`);
    new Setting(el)
      .setName(t(`Contraste des chapitres inactifs`))
      .setDesc(t(`Plus la valeur est basse, plus le texte inactif est clair.`))
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
    this.toggle(el, t(`Inclure les dépendances dans le chapitre actif`), t(`Désactivé : seul le titre où se trouve le curseur et son texte sont actifs. Activé : ses sous-titres le sont aussi.`), `includeSubtitles`);
  }

  private buildFixed(el: HTMLElement): void {
    this.toggle(
      el,
      t(`Sous-titres dans les notes fixes`),
      t(`Désactivé : une note fixe ne montre que le paragraphe de son titre. Activé : elle se comporte comme la note dynamique, c'est-à-dire qu'elle montre aussi les sous-titres quand l'option Inclure les dépendances est active.`),
      `fixedLikeDynamic`
    );
  }

  private buildFloats(el: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(t(`Niveau du titre`))
      .setDesc(t(`Niveau de titre donné à un sujet flottant créé par double clic sur le fond de la carte. Il change de niveau quand on le fait entrer dans la carte.`))
      .addDropdown((d) => {
        for (let i = 1; i <= 6; i++) d.addOption(String(i), t(`Niveau {0}`, i));
        d.setValue(String(s.floatLevel)).onChange(async (v) => {
          s.floatLevel = Number(v);
          await this.plugin.saveSettings();
        });
      });
    this.dropdown(el, t(`Forme`), t(`Forme de la case d'un sujet flottant. Une fois dans la carte, il prend la forme des titres de son niveau.`), `floatShape`, [
      [`oval`, t(`Ovale`)],
      [`round`, t(`Rectangle arrondi`)],
      [`sharp`, t(`Rectangle`)],
      [`underline`, t(`Trait dessous`)],
      [`parallelogram`, t(`Losange`)],
      [`diamond`, t(`Diamant`)],
    ], (v) => v as MmSettings[`floatShape`]);
    this.colorSetting(el, t(`Couleur du trait`), t(`Contour et texte. Vide : comme la carte.`), `floatStrokeColor`);
    this.colorSetting(el, t(`Couleur de fond`), t(`Fond de la case. Vide : comme la carte.`), `floatFillColor`);
    this.dropdown(el, t(`Type de ligne`), t(`Trait du contour.`), `floatStrokeDash`, [
      [``, t(`Comme la carte`)],
      [`solid`, t(`Continu`)],
      [`dashed`, t(`Tirets`)],
      [`dotted`, t(`Pointillés`)],
    ], (v) => v as MmSettings[`floatStrokeDash`]);
    this.dropdown(el, t(`Écriture`), t(`Police du texte des sujets flottants.`), `floatFontFamily`, [
      [``, t(`Comme la carte`)],
      [`default`, t(`Police de l'interface`)],
      [`handwritten`, t(`Écriture manuscrite`)],
      [`mono`, t(`Code`)],
    ], (v) => v as MmSettings[`floatFontFamily`]);
  }

  private colorSetting(el: HTMLElement, name: string, desc: string, field: `strokeColor` | `fillColor` | `floatStrokeColor` | `floatFillColor`): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addColorPicker((c) =>
        c.setValue(s[field] || `#888888`).onChange(async (v) => {
          s[field] = v;
          await this.plugin.saveSettings();
        })
      )
      .addExtraButton((b) =>
        b
          .setIcon(`reset`)
          .setTooltip(field.startsWith(`float`) ? t(`Comme la carte`) : t(`Valeur d'origine`))
          .onClick(async () => {
            s[field] = ``;
            await this.plugin.saveSettings();
            this.display();
          })
      );
  }

  private buildLinks(el: HTMLElement): void {
    this.iconPicker(el, `external`, t(`Lien vers une autre note`), t(`Repère affiché quand les liens vers d'autres notes sont repliés.`), `iconExternal`, `iconColorExternal`);
    this.iconPicker(el, `internal`, t(`Lien dans la note`), t(`Repère affiché quand les flèches entre titres sont repliées.`), `iconInternal`, `iconColorInternal`);
    this.iconPicker(el, `web`, t(`Lien web`), t(`Repère affiché sur un titre qui contient un lien web ou une vidéo.`), `iconWeb`, `iconColorWeb`);
  }

  // Galerie d'icônes et choix de la couleur d'un type de lien.
  private iconPicker(el: HTMLElement, kind: IconKind, name: string, desc: string, field: IconField, colorField: ColorField): void {
    const s = this.plugin.settings;
    const setting = new Setting(el).setName(name).setDesc(desc);
    const gallery = setting.controlEl.createEl(`div`, { cls: `mmw-icon-gallery` });
    const paint = (): void => {
      gallery.empty();
      for (const def of ICONS[kind]) {
        const b = gallery.createEl(`button`, { cls: `mmw-icon-choice` + (s[field] === def.id ? ` mmw-icon-on` : ``) });
        b.type = `button`;
        b.title = t(def.name);
        b.innerHTML = iconSvg(kind, def.id, 18);
        if (s[colorField]) b.style.color = s[colorField];
        b.addEventListener(`click`, async () => {
          s[field] = def.id;
          await this.plugin.saveSettings();
          paint();
        });
      }
    };
    paint();
    setting.addColorPicker((c) =>
      c.setValue(s[colorField] || `#7b6cd9`).onChange(async (v) => {
        s[colorField] = v;
        await this.plugin.saveSettings();
        paint();
      })
    );
    setting.addExtraButton((b) =>
      b
        .setIcon(`reset`)
        .setTooltip(t(`Rétablir l'icône et la couleur d'origine`))
        .onClick(async () => {
          s[field] = DEFAULT_ICON[kind];
          s[colorField] = ``;
          await this.plugin.saveSettings();
          this.display();
        })
    );
  }

  private buildNotes(el: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(t(`Dossier des nouvelles notes`))
      .setDesc(t(`Quand vous créez un lien vers une note qui n'existe pas, la note est créée à cet endroit. Le dossier est créé s'il n'existe pas.`))
      .addDropdown((d) =>
        d
          .addOption(`current`, t(`Dossier de la note courante`))
          .addOption(`fixed`, t(`Dossier choisi`))
          .addOption(`root`, t(`Racine du coffre`))
          .setValue(s.newNoteMode)
          .onChange(async (v) => {
            s.newNoteMode = v as NewNoteFolderMode;
            await this.plugin.saveSettings(false);
            this.display();
          })
      );
    if (s.newNoteMode !== `fixed`) return;
    const folders = this.app.vault
      .getAllLoadedFiles()
      .filter((f): f is TFolder => f instanceof TFolder && f.path !== `/` && f.path !== ``)
      .map((f) => f.path)
      .sort((a, b) => a.localeCompare(b));
    new Setting(el)
      .setName(t(`Dossier choisi`))
      .setDesc(t(`Dossier du coffre où sont enregistrées les nouvelles notes.`))
      .addDropdown((d) => {
        d.addOption(``, t(`Racine du coffre`));
        for (const f of folders) d.addOption(f, f);
        // Un dossier mémorisé qui n'existe plus reste proposé : il sera recréé à la prochaine note.
        if (s.newNoteFolder !== `` && !folders.includes(s.newNoteFolder)) d.addOption(s.newNoteFolder, `${s.newNoteFolder} (${t(`à créer`)})`);
        d.setValue(s.newNoteFolder).onChange(async (v) => {
          s.newNoteFolder = v;
          await this.plugin.saveSettings(false);
        });
      });
  }

  private buildExport(el: HTMLElement): void {
    const s = this.plugin.settings;
    new Setting(el)
      .setName(t(`Auteur du PDF`))
      .setDesc(t(`Nom écrit dans les propriétés du PDF quand la note n'a pas de propriété author ou auteur.`))
      .addText((x) =>
        x.setValue(s.exportAuthor).onChange(async (v) => {
          s.exportAuthor = v.trim();
          await this.plugin.saveSettings(false);
        })
      );
    new Setting(el)
      .setName(t(`Figures et tableaux`))
      .setDesc(t(`Flottants : placés en haut ou en bas de la page où ils tiennent, comme en LaTeX. Sinon, placés à l'endroit où ils sont écrits dans la note.`))
      .addDropdown((d) => {
        d.addOption(`float`, t(`Flottants (en haut ou en bas de page)`));
        d.addOption(`inline`, t(`À l'endroit où ils sont écrits`));
        d.setValue(s.exportFloats).onChange(async (v) => {
          s.exportFloats = v === `inline` ? `inline` : `float`;
          await this.plugin.saveSettings(false);
        });
      });
    new Setting(el)
      .setName(t(`Renvois vers un titre, une figure ou un tableau`))
      .setDesc(t(`Les renvois [[#Titre]] et [[#^identifiant]] sont toujours cliquables dans le PDF. Cette option ajoute le numéro de page après le texte du renvoi.`))
      .addDropdown((d) => {
        d.addOption(`link`, t(`Cliquable seulement`));
        d.addOption(`page`, t(`Cliquable avec le numéro de page`));
        d.setValue(s.exportPageRefs ? `page` : `link`).onChange(async (v) => {
          s.exportPageRefs = v === `page`;
          await this.plugin.saveSettings(false);
        });
      });
  }

  private buildKeys(el: HTMLElement): void {
    this.addKeySetting(el, t(`Chapitre précédent`), `keyPrev`);
    this.addKeySetting(el, t(`Chapitre suivant`), `keyNext`);
    this.addKeySetting(el, t(`Chapitre parent`), `keyParent`);
    this.addKeySetting(el, t(`Premier sous-titre`), `keyChild`);
  }

  // Ligne de reglage d'une touche : un bouton qui attend la combinaison a enregistrer.
  private addKeySetting(containerEl: HTMLElement, name: string, field: KeyField) {
    const s = this.plugin.settings;
    const isMac = Platform.isMacOS;
    new Setting(containerEl)
      .setName(name)
      .setDesc(t(`Fonctionne dans la note reliée à la carte. Cliquez sur le bouton puis tapez la combinaison voulue (Échap pour annuler).`))
      .addButton((btn) => {
        btn.setButtonText(comboLabel(s[field], isMac));
        btn.onClick(() => {
          btn.setButtonText(t(`Tapez la combinaison...`));
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
          .setTooltip(t(`Rétablir la valeur d'origine`))
          .onClick(async () => {
            s[field] = (DEFAULT_SETTINGS as MmSettings)[field];
            await this.plugin.saveSettings(false);
            this.display();
          })
      );
  }
}

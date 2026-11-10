import { BULLET_IDS, BULLET_LEVELS, BulletId, isBulletId } from "./bullets";
import { FolderPicker } from "./folder-picker";
import { ConfirmModal, NameModal } from "./profile-modals";
import { App, normalizePath, Notice, Platform, PluginSettingTab, SettingDefinition, SettingDefinitionItem, SettingPage, TFolder } from "obsidian";
import { DEFAULT_ICON, IconKind, ICONS, iconSvg } from "./icons";
import { setLanguage, t } from "./i18n";
import { comboLabel, eventToCombo } from "./keys";
import type MindmapWritingPlugin from "./main";
import { appearanceDefaults, DEFAULT_SETTINGS, MmSettings } from "./settings";
import { SHAPE_CHOICES, ShapeChoice, shapeChoice, shapePatch } from "./style";
import { setSvg } from "./dom";
import { renderButtonList } from "./panel-buttons";
import { renderFontTools, TypographyModal } from "./typography-modal";

type KeyField = `keyPrev` | `keyNext` | `keyParent` | `keyChild`;
type IconField = `iconExternal` | `iconInternal` | `iconWeb`;
type ColorField = `iconColorExternal` | `iconColorInternal` | `iconColorWeb`;
type NumberField = {
  [K in keyof MmSettings]: MmSettings[K] extends number ? K : never;
}[keyof MmSettings];

// Settings that a dropdown shows as text but the plugin keeps as numbers.
const NUMBER_DROPDOWNS = new Set<string>([`roughness`, `floatLevel`, `exportTocDepth`, `exportChapterTocDepth`]);

// Settings whose change does not redraw the open views (the export, the button panel and the folder of the new notes).
const QUIET_KEYS = new Set<string>([`panelVisible`, `newNoteMode`, `newNoteFolder`]);

// Page of the settings screen drawn by a function: for the parts that are lists of buttons or free layouts, which no declarative
// definition can express. The function draws into the page and gets a function that draws it again; it may return a cleanup.
class FunctionPage extends SettingPage {
  private cleanup: (() => void) | null = null;

  constructor(title: string, private build: (el: HTMLElement, redraw: () => void) => void | (() => void)) {
    super();
    this.title = title;
  }

  display(): void {
    this.cleanup?.();
    this.containerEl.empty();
    this.cleanup = this.build(this.containerEl, () => this.display()) ?? null;
  }

  hide(): void {
    this.cleanup?.();
    this.cleanup = null;
    super.hide();
  }
}

// Settings screen of the plugin, declared with the settings interface of Obsidian 1.13: one page per chapter. The simple settings
// (switches, lists, sliders) are declared with a control, so that the search of Obsidian finds them; the others draw their row.
export class MmSettingTab extends PluginSettingTab {
  private plugin: MindmapWritingPlugin;

  constructor(app: App, plugin: MindmapWritingPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: t(`Réglages depuis la carte`),
        desc: t(`Les éléments affichés, le type de vue (Mindmap ou Liste), le chapitre actif et la position de la note se règlent depuis la carte : barre de commandes, menu de l'œil, menu burger et bouton Apparence.`),
      },
      { type: `page`, name: t(`Langue et ouverture`), desc: t(`Langue du plugin et vue affichée à l'ouverture`), items: this.general() },
      { type: `page`, name: t(`Vue Mindmap`), desc: t(`Cases, branches, traits, police et contraste de la carte mentale`), items: this.mindmap() },
      { type: `page`, name: t(`Rédaction`), desc: t(`Position de la note, curseur et commentaires du plugin`), items: this.writing() },
      { type: `page`, name: t(`Notes fixes`), desc: t(`Copies d'un chapitre dans leur propre volet`), items: this.fixed() },
      { type: `page`, name: t(`Mode Zen`), desc: t(`Plein écran, largeur de la liste, durée d'affichage et fenêtre d'explication`), items: this.zen() },
      { type: `page`, name: t(`Sujets flottants`), desc: t(`Sujets de notes libres, hors de la carte : niveau, forme, couleurs`), items: this.floats() },
      { type: `page`, name: t(`Liens et icônes`), desc: t(`Icônes et couleurs des repères de liens`), items: this.links() },
      { type: `page`, name: t(`Nouvelles notes`), desc: t(`Dossier des notes créées depuis la carte`), items: this.newNotes() },
      { type: `page`, name: t(`Export PDF`), desc: t(`Mise en page, tables des matières, figures et médias de l'export PDF de haute qualité`), items: this.exportSettings() },
      { type: `page`, name: t(`Panneau de boutons`), desc: t(`Boutons des fonctions, à droite de la zone de rédaction`), items: this.panel() },
      { type: `page`, name: t(`Profils`), desc: t(`Enregistrer, charger, renommer et supprimer des copies nommées de vos réglages`), page: () => new FunctionPage(t(`Profils`), (el, redraw) => this.buildProfiles(el, redraw)) },
      { type: `page`, name: t(`Navigation au clavier`), desc: t(`Raccourcis pour passer d'un chapitre à l'autre depuis la note`), items: this.keys() },
    ];
  }

  // Value of a setting for its control: a number kept by a dropdown is shown as text.
  getControlValue(key: string): unknown {
    const value = (this.plugin.settings as unknown as Record<string, unknown>)[key];
    return NUMBER_DROPDOWNS.has(key) ? String(value) : value;
  }

  // A setting changed by its control: it is stored, saved and applied as before (the views are redrawn except for the export).
  async setControlValue(key: string, value: unknown): Promise<void> {
    const s = this.plugin.settings as unknown as Record<string, unknown>;
    if (NUMBER_DROPDOWNS.has(key)) s[key] = Number(value);
    else if (key === `exportAuthor`) s[key] = typeof value === `string` ? value.trim() : ``;
    else s[key] = value;
    if (key === `language`) setLanguage(this.plugin.settings.language);
    await this.plugin.saveSettings(!(key.startsWith(`export`) || QUIET_KEYS.has(key)));
    // The names of the settings change with the language.
    if (key === `language`) this.update();
  }

  // ---------------------------------------------------------------- aides

  private toggle(name: string, desc: string, key: string): SettingDefinition {
    return { name, desc, control: { type: `toggle`, key } };
  }

  private dropdown(name: string, desc: string, key: string, options: [string, string][]): SettingDefinition {
    return { name, desc, control: { type: `dropdown`, key, options: Object.fromEntries(options) } };
  }

  private slider(name: string, desc: string, key: NumberField, min: number, max: number, step: number): SettingDefinition {
    return { name, desc, control: { type: `slider`, key, min, max, step } };
  }

  // Row with a dropdown whose value is not the stored one as it is (a switch kept as text, a value inside a list): it draws itself
  // and saves without redrawing the views.
  private choiceRow(name: string, desc: string, options: [string, string][], value: () => string, set: (v: string) => void): SettingDefinition {
    return {
      name,
      desc,
      render: (setting) =>
        void setting.addDropdown((d) => {
          for (const [v, label] of options) d.addOption(v, label);
          d.setValue(value()).onChange(async (v) => {
            set(v);
            await this.plugin.saveSettings(false);
          });
        }),
    };
  }

  // Row with a switch whose value is not the stored one as it is.
  private switchRow(name: string, desc: string, value: () => boolean, set: (v: boolean) => void): SettingDefinition {
    return {
      name,
      desc,
      render: (setting) =>
        void setting.addToggle((x) =>
          x.setValue(value()).onChange(async (v) => {
            set(v);
            await this.plugin.saveSettings(false);
          })
        ),
    };
  }

  // ---------------------------------------------------------------- chapitres

  private general(): SettingDefinitionItem[] {
    return [
      {
        name: t(`Langue du plugin`),
        desc: t(`Automatique : la langue d'Obsidian est utilisée (français ou anglais, l'anglais pour toute autre langue).`),
        control: { type: `dropdown`, key: `language`, options: { auto: t(`Automatique`), fr: `Français`, en: `English` } },
      },
    ];
  }

  private mindmap(): SettingDefinitionItem[] {
    const s = this.plugin.settings;
    return [
      this.dropdown(t(`Titres longs`), t(`Comportement d'un titre plus large que la case : coupé avec des points de suspension (le titre complet s'affiche au survol) ou passage à la ligne.`), `longTitles`, [
        [`ellipsis`, t(`Couper avec des points de suspension`)],
        [`wrap`, t(`Passer à la ligne`)],
      ]),
      this.slider(t(`Largeur maximale des cases`), t(`En pixels.`), `maxWidth`, 120, 480, 10),
      this.slider(t(`Compacité`), t(`Espace autour des titres : plus la valeur est basse, plus la carte est serrée.`), `compactness`, 0.3, 2, 0.1),
      this.slider(t(`Contraste de la case sélectionnée`), t(`Force de la mise en évidence du titre sélectionné : discrète quand vous écrivez dans la note, marquée avec un halo quand la carte a le focus.`), `selectionContrast`, 0, 100, 5),
      this.toggle(t(`Afficher le préfixe Markdown`), t(`Affiche les dièses (#, ##, ###) devant chaque titre de la carte.`), `showPrefix`),
      this.dropdown(t(`Branches`), t(`Forme des traits qui relient les cases.`), `branchStyle`, [
        [`elbow`, t(`En angle`)],
        [`curve`, t(`Courbes`)],
        [`straight`, t(`Droites`)],
      ]),
      this.toggle(t(`Contour des cases`), t(`Dessine un cadre autour de chaque titre.`), `showFrames`),
      {
        name: t(`Forme`),
        desc: t(`Forme des cases de la carte. Chaque titre ou chaque niveau peut ensuite avoir sa propre forme depuis le bouton Apparence de la carte.`),
        render: (setting) =>
          void setting.addDropdown((d) => {
            for (const c of SHAPE_CHOICES) d.addOption(c, this.shapeLabel(c));
            d.setValue(shapeChoice(s)).onChange(async (v) => {
              await this.plugin.updateSettings(shapePatch(v as ShapeChoice));
            });
          }),
      },
      this.colorRow(t(`Couleur du trait`), t(`Contour et texte des cases. Vide : couleur du thème.`), `strokeColor`),
      this.colorRow(t(`Couleur de fond`), t(`Fond des cases. Vide : transparent.`), `fillColor`),
      this.dropdown(t(`Type de ligne`), t(`Trait du contour des cases.`), `strokeDash`, [
        [`solid`, t(`Continu`)],
        [`dashed`, t(`Tirets`)],
        [`dotted`, t(`Pointillés`)],
      ]),
      this.dropdown(t(`Alignement du texte`), t(`Position du texte dans les cases.`), `textAlign`, [
        [`left`, t(`À gauche`)],
        [`center`, t(`Centré`)],
        [`right`, t(`À droite`)],
      ]),
      this.dropdown(t(`Style de tracé`), t(`Netteté du trait.`), `roughness`, [
        [`0`, t(`Architecte : trait net`)],
        [`1`, t(`Artiste : trait de crayon`)],
        [`2`, t(`Caricaturiste : trait très irrégulier`)],
      ]),
      this.slider(t(`Largeur du contour`), t(`Épaisseur des traits, en pixels.`), `strokeWidth`, 0.5, 5, 0.1),
      this.dropdown(t(`Police`), t(`Police du texte des cases.`), `fontFamily`, [
        [`default`, t(`Police de l'interface`)],
        [`handwritten`, t(`Écriture manuscrite`)],
        [`mono`, t(`Code`)],
      ]),
      this.slider(t(`Taille de la police`), t(`Multiplicateur appliqué à la taille du texte.`), `fontScale`, 0.6, 2, 0.05),
      {
        name: t(`Apparence`),
        desc: t(`Les couleurs, les traits, les formes, la police et la taille du texte se règlent aussi avec le bouton en forme de palette de la carte.`),
        render: (setting) =>
          void setting.addButton((b) =>
            b.setButtonText(t(`Réinitialiser l'apparence`)).onClick(async () => {
              await this.plugin.updateSettings(appearanceDefaults());
              this.update();
            })
          ),
      },
    ];
  }

  // Libelle d'une forme proposee.
  private shapeLabel(c: ShapeChoice): string {
    const names: Record<ShapeChoice, string> = {
      rect: t(`Rectangle`),
      rounded: t(`Rectangle arrondi`),
      oval: t(`Ovale`),
      underline: t(`Trait dessous`),
      parallelogram: t(`Parallélogramme`),
      diamond: t(`Diamant`),
    };
    return names[c];
  }

  private writing(): SettingDefinitionItem[] {
    return [
      this.toggle(t(`Passer directement à la saisie au clic sur un titre`), t(`Désactivé : un clic sur un titre de la carte amène la note au chapitre sans quitter la carte, et Entrée passe à la saisie. Activé : le clavier passe aussitôt dans la note.`), `focusNoteOnSelect`),
      this.dropdown(t(`Position du curseur à l'ouverture d'un paragraphe`), t(`S'applique à la sélection d'un titre dans la carte. Par défaut, le curseur est à la fin du texte du chapitre pour le compléter.`), `cursorPosition`, [
        [`last`, t(`Là où la saisie s'était arrêtée`)],
        [`start`, t(`Au début du paragraphe`)],
        [`end`, t(`À la fin du paragraphe`)],
      ]),
      this.toggle(t(`Masquer les commentaires de la carte dans la note`), t(`Les étiquettes, le titre court, le commentaire et les styles d'un titre sont conservés dans une ligne de commentaire sous le titre (%% mmw ... %%). Activé : cette ligne n'apparaît pas dans la note. Désactivé : elle reste visible.`), `hideMetaLines`),
    ];
  }

  private zen(): SettingDefinitionItem[] {
    return [
      this.toggle(t(`Expliquer le mode Zen à l'entrée`), t(`Affiche la fenêtre d'explication à chaque entrée dans le mode Zen.`), `zenIntro`),
      this.toggle(t(`Plein écran`), t(`Le mode Zen passe Obsidian en plein écran. Désactivé : la fenêtre garde sa taille et Échap sort du mode.`), `zenFullscreen`),
      this.toggle(t(`Liste en noir et blanc`), t(`La liste des titres s'affiche sans couleur dans le mode Zen. La vue d'avant est rétablie à la sortie.`), `zenBlackWhite`),
      this.slider(t(`Largeur de la liste`), t(`Part de la largeur occupée par la liste, en pourcentage.`), `zenListPercent`, 15, 50, 5),
      this.slider(t(`Durée d'affichage de la liste`), t(`Temps, en secondes, pendant lequel une liste masquée reste affichée après Cmd ou Ctrl + Maj + Entrée.`), `zenPeekSeconds`, 1, 10, 1),
    ];
  }

  private fixed(): SettingDefinitionItem[] {
    return [
      this.toggle(
        t(`Sous-titres dans les notes fixes`),
        t(`Désactivé : une note fixe ne montre que le paragraphe de son titre. Activé : elle se comporte comme la note dynamique, c'est-à-dire qu'elle montre aussi les sous-titres quand l'option Inclure les dépendances est active.`),
        `fixedLikeDynamic`
      ),
    ];
  }

  private floats(): SettingDefinitionItem[] {
    const levels: [string, string][] = [];
    for (let i = 1; i <= 6; i++) levels.push([String(i), t(`Niveau {0}`, i)]);
    return [
      this.dropdown(t(`Niveau du titre`), t(`Niveau de titre donné à un sujet flottant créé par double clic sur le fond de la carte. Il change de niveau quand on le fait entrer dans la carte.`), `floatLevel`, levels),
      this.dropdown(t(`Forme`), t(`Forme de la case d'un sujet flottant. Une fois dans la carte, il prend la forme des titres de son niveau.`), `floatShape`, [
        [`oval`, t(`Ovale`)],
        [`round`, t(`Rectangle arrondi`)],
        [`sharp`, t(`Rectangle`)],
        [`underline`, t(`Trait dessous`)],
        [`parallelogram`, t(`Parallélogramme`)],
        [`diamond`, t(`Diamant`)],
      ]),
      this.colorRow(t(`Couleur du trait`), t(`Contour et texte. Vide : comme la carte.`), `floatStrokeColor`),
      this.colorRow(t(`Couleur de fond`), t(`Fond de la case. Vide : comme la carte.`), `floatFillColor`),
      this.dropdown(t(`Type de ligne`), t(`Trait du contour.`), `floatStrokeDash`, [
        [``, t(`Comme la carte`)],
        [`solid`, t(`Continu`)],
        [`dashed`, t(`Tirets`)],
        [`dotted`, t(`Pointillés`)],
      ]),
      this.dropdown(t(`Écriture`), t(`Police du texte des sujets flottants.`), `floatFontFamily`, [
        [``, t(`Comme la carte`)],
        [`default`, t(`Police de l'interface`)],
        [`handwritten`, t(`Écriture manuscrite`)],
        [`mono`, t(`Code`)],
      ]),
    ];
  }

  // Row with a colour picker and a button that gives back the default colour.
  private colorRow(name: string, desc: string, field: `strokeColor` | `fillColor` | `floatStrokeColor` | `floatFillColor`): SettingDefinition {
    const s = this.plugin.settings;
    return {
      name,
      desc,
      render: (setting) =>
        void setting
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
                this.update();
              })
          ),
    };
  }

  private links(): SettingDefinitionItem[] {
    return [
      this.iconRow(`external`, t(`Lien vers une autre note`), t(`Repère affiché quand les liens vers d'autres notes sont repliés.`), `iconExternal`, `iconColorExternal`),
      this.iconRow(`internal`, t(`Lien dans la note`), t(`Repère affiché quand les flèches entre titres sont repliées.`), `iconInternal`, `iconColorInternal`),
      this.iconRow(`web`, t(`Lien web`), t(`Repère affiché sur un titre qui contient un lien web ou une vidéo.`), `iconWeb`, `iconColorWeb`),
    ];
  }

  // Galerie d'icônes et choix de la couleur d'un type de lien.
  private iconRow(kind: IconKind, name: string, desc: string, field: IconField, colorField: ColorField): SettingDefinition {
    const s = this.plugin.settings;
    return {
      name,
      desc,
      render: (setting) => {
        const gallery = setting.controlEl.createEl(`div`, { cls: `mmw-icon-gallery` });
        const paint = (): void => {
          gallery.empty();
          for (const def of ICONS[kind]) {
            const b = gallery.createEl(`button`, { cls: `mmw-icon-choice` + (s[field] === def.id ? ` mmw-icon-on` : ``) });
            b.type = `button`;
            b.title = t(def.name);
            setSvg(b, iconSvg(kind, def.id, 18));
            if (s[colorField]) b.style.color = s[colorField];
            b.addEventListener(`click`, () => {
              s[field] = def.id;
              void this.plugin.saveSettings().then(() => paint());
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
              this.update();
            })
        );
      },
    };
  }

  private newNotes(): SettingDefinitionItem[] {
    const s = this.plugin.settings;
    return [
      {
        name: t(`Dossier des nouvelles notes`),
        desc: t(`Quand vous créez un lien vers une note qui n'existe pas, la note est créée à cet endroit. Le dossier est créé s'il n'existe pas.`),
        control: { type: `dropdown`, key: `newNoteMode`, options: { current: t(`Dossier de la note courante`), fixed: t(`Dossier choisi`), root: t(`Racine du coffre`) } },
      },
      {
        name: t(`Dossier choisi`),
        desc: t(`Dossier du coffre où sont enregistrées les nouvelles notes.`),
        visible: () => s.newNoteMode === `fixed`,
        render: (setting) => {
          const folders = this.app.vault
            .getAllLoadedFiles()
            .filter((f): f is TFolder => f instanceof TFolder && f.path !== `/` && f.path !== ``)
            .map((f) => f.path)
            .sort((a, b) => a.localeCompare(b));
          setting.addDropdown((d) => {
            d.addOption(``, t(`Racine du coffre`));
            for (const f of folders) d.addOption(f, f);
            // Un dossier mémorisé qui n'existe plus reste proposé : il sera recréé à la prochaine note.
            if (s.newNoteFolder !== `` && !folders.includes(s.newNoteFolder)) d.addOption(s.newNoteFolder, `${s.newNoteFolder} (${t(`à créer`)})`);
            d.setValue(s.newNoteFolder).onChange(async (v) => {
              s.newNoteFolder = v;
              await this.plugin.saveSettings(false);
            });
          });
        },
      },
    ];
  }

  // Niveaux de titres d'une table des matieres : de 1 (niveau 1 seulement) a 6.
  private levelsRow(name: string, desc: string, key: `exportTocDepth` | `exportChapterTocDepth`): SettingDefinition {
    const options: [string, string][] = [[`1`, t(`Niveau 1 seulement`)]];
    for (let n = 2; n <= 6; n++) options.push([String(n), t(`Jusqu'au niveau {0}`, n)]);
    return this.dropdown(name, desc, key, options);
  }

  private exportSettings(): SettingDefinitionItem[] {
    const s = this.plugin.settings;
    const bulletLabels: Record<BulletId, string> = {
      disc: t(`● Disque plein`),
      circle: t(`○ Disque vide`),
      square: t(`■ Carré plein`),
      squareOpen: t(`□ Carré vide`),
      diamond: t(`◆ Losange plein`),
      diamondOpen: t(`◇ Losange vide`),
      hyphen: t(`- Trait d'union`),
      dash: t(`– Tiret long`),
      asterisk: t(`* Astérisque`),
      dot: t(`· Point médian`),
      chevron: t(`› Chevron`),
      arrow: t(`→ Flèche`),
      none: t(`Aucune puce`),
    };
    const bullets: SettingDefinition[] = [{ name: t(`Puces par niveau`), desc: t(`Puce de chaque niveau d'une liste à puces dans l'export (PDF et aperçu des pages). Au-delà du sixième niveau, la puce est le trait d'union. L'affichage des notes dans Obsidian ne change pas.`) }];
    for (let level = 0; level < BULLET_LEVELS; level++) {
      bullets.push(
        this.choiceRow(
          t(`Puce du niveau {0}`, level + 1),
          ``,
          BULLET_IDS.map((id): [string, string] => [id, bulletLabels[id]]),
          () => s.exportBullets[level],
          (v) => {
            if (isBulletId(v)) s.exportBullets = s.exportBullets.map((b, i) => (i === level ? v : b));
          }
        )
      );
    }
    return [
      {
        name: t(`Auteur du PDF`),
        desc: t(`Nom écrit dans les propriétés du PDF quand la note n'a pas de propriété author ou auteur.`),
        control: { type: `text`, key: `exportAuthor` },
      },
      {
        type: `group`,
        heading: t(`Mise en page`),
        items: [
          this.dropdown(t(`En-tête de page`), t(`Texte placé en haut de chaque page, sauf sur la première.`), `exportHeader`, [
            [`chapter`, t(`Titre du chapitre en cours`)],
            [`title`, t(`Titre de la note`)],
            [`none`, t(`Aucun`)],
          ]),
          this.dropdown(t(`Pied de page`), t(`Numéro de page centré en bas de chaque page.`), `exportFooter`, [
            [`number`, t(`Numéro de page`)],
            [`none`, t(`Aucun`)],
          ]),
          this.toggle(t(`Pages alignées en bas`), t(`Les espaces entre les blocs s'étirent pour que toutes les pages finissent à la même hauteur. Sinon, les pages peuvent finir à des hauteurs différentes.`), `exportFlushBottom`),
          this.switchRow(t(`Saut de page avant chaque chapitre`), t(`Chaque titre du plus haut niveau de la note commence sur une nouvelle page.`), () => s.exportChapterBreak === `level1`, (v) => (s.exportChapterBreak = v ? `level1` : `none`)),
          this.dropdown(t(`Numérotation des notes de bas de page`), t(`Les notes sont numérotées sur tout le document, ou à partir de 1 dans chaque chapitre.`), `exportFootnoteNumbering`, [
            [`continuous`, t(`Continue sur tout le document`)],
            [`perChapter`, t(`Recommence à 1 à chaque chapitre`)],
          ]),
          this.toggle(t(`Protrusion`), t(`La ponctuation et les tirets en bout de ligne dépassent légèrement dans la marge, ce qui rend le bord du texte plus net à l'œil.`), `exportProtrusion`),
          this.toggle(t(`Images à 360 degrés dans l'export HTML`), t(`Une image deux fois plus large que haute (au moins 1500 pixels de large) est lue comme un panorama que l'on fait tourner. Désactivez pour la garder comme une image ordinaire.`), `exportHtmlPanoramas`),
        ],
      },
      { type: `group`, heading: t(`Listes à puces`), items: bullets },
      {
        type: `group`,
        heading: t(`Table des matières`),
        items: [
          this.toggle(t(`Table des matières générale`), t(`Placée sous le titre de la note. La propriété toc: true ou toc: false de la note l'emporte sur ce réglage.`), `exportToc`),
          this.levelsRow(t(`Niveaux de la table générale`), t(`Niveaux de titres listés. La propriété toc-depth de la note l'emporte sur ce réglage.`), `exportTocDepth`),
          this.toggle(t(`Table des matières de chaque chapitre`), t(`Placée sous le titre de chaque chapitre de plus haut niveau, elle ne liste que les sous-titres de ce chapitre. La propriété chapter-toc de la note l'emporte sur ce réglage.`), `exportChapterToc`),
          this.levelsRow(t(`Niveaux de la table d'un chapitre`), t(`Niveaux de titres listés, titre du chapitre compris. La propriété chapter-toc-depth de la note l'emporte sur ce réglage.`), `exportChapterTocDepth`),
        ],
      },
      {
        type: `group`,
        heading: t(`Polices et titres`),
        items: [
          {
            name: t(`Police, taille, casse et numérotation des titres`),
            desc: t(`Réglage pour toutes les notes. Pour une seule note, utilisez le bouton Polices et titres du panneau.`),
            render: (setting) => void setting.addButton((b) => b.setButtonText(t(`Ouvrir`)).onClick(() => new TypographyModal(this.app, this.plugin.typographyHost()).open())),
          },
          {
            type: `page`,
            name: t(`Polices du coffre`),
            desc: t(`Ajouter une police, changer le dossier des polices, relire le dossier et voir les fichiers non utilisables.`),
            page: () => new FunctionPage(t(`Polices du coffre`), (el, redraw) => renderFontTools(el, this.app, this.plugin.typographyHost(), redraw)),
          },
        ],
      },
      {
        type: `group`,
        heading: t(`Figures, renvois et médias`),
        items: [
          this.dropdown(t(`Figures et tableaux`), t(`Flottants : placés en haut ou en bas de la page où ils tiennent, comme en LaTeX. Sinon, placés à l'endroit où ils sont écrits dans la note.`), `exportFloats`, [
            [`float`, t(`Flottants (en haut ou en bas de page)`)],
            [`inline`, t(`À l'endroit où ils sont écrits`)],
          ]),
          this.dropdown(t(`Légende des figures et des dessins`), t(`Un dessin ou une image écrit ![[dessin.excalidraw|Nom]] reçoit la légende « Figure 3 : Nom ». Sans nom, il n'a ni légende ni numéro.`), `exportFigureCaption`, [
            [`below`, t(`Sous la figure`)],
            [`above`, t(`Au-dessus de la figure`)],
          ]),
          this.toggle(t(`Nom des images collées`), t(`Après un collage d'image (Ctrl + V), une fenêtre demande le nom de la figure, qui devient sa légende dans l'export. Un nom vide laisse l'image sans légende.`), `namePastedImages`),
          this.choiceRow(
            t(`Renvois vers un titre, une figure ou un tableau`),
            t(`Les renvois [[#Titre]] et [[#^identifiant]] sont toujours cliquables dans le PDF. Cette option ajoute le numéro de page après le texte du renvoi.`),
            [
              [`link`, t(`Cliquable seulement`)],
              [`page`, t(`Cliquable avec le numéro de page`)],
            ],
            () => (s.exportPageRefs ? `page` : `link`),
            (v) => (s.exportPageRefs = v === `page`)
          ),
          this.dropdown(t(`Vidéos, sons et contenus intégrés`), t(`Un média ne se lit pas sur papier : il est remplacé par son titre et son adresse, cliquable dans le PDF.`), `exportMedia`, [
            [`frame`, t(`Dans un cadre`)],
            [`text`, t(`En simple texte`)],
          ]),
        ],
      },
    ];
  }

  private panel(): SettingDefinitionItem[] {
    return [
      this.toggle(t(`Afficher le panneau de boutons`), t(`Les boutons des fonctions apparaissent à droite de la zone de rédaction, au milieu de la hauteur. Un clic long sur un bouton, puis un glissement, le déplace.`), `panelVisible`),
      {
        type: `page`,
        name: t(`Boutons`),
        desc: t(`Choisir, ordonner et séparer les boutons du panneau.`),
        page: () => new FunctionPage(t(`Boutons`), (el) => renderButtonList(el, this.plugin)),
      },
    ];
  }

  // Profils : copies nommees de tous les reglages (carte, export, polices et titres, puces, panneau de boutons), gardees dans le coffre.
  private buildProfiles(el: HTMLElement, redraw: () => void): void {
    const plugin = this.plugin;
    el.createDiv({
      cls: `setting-item-description`,
      text: t(`Un profil garde tous les réglages du plugin : apparence de la carte, mise en forme et options de l'export, polices et titres, puces, panneau de boutons et position de la note. Il ne contient pas le nom de l'auteur, les dossiers, les scripts ni les notes fixes ouvertes. Les profils sont des fichiers du coffre : vous pouvez les copier sur un autre ordinateur.`),
    });
    const bar = el.createDiv({ cls: `mmw-typo-folderrow` });
    bar.createEl(`button`, { cls: `mod-cta`, text: t(`Sauvegarder un profil`) }).addEventListener(`click`, () => plugin.openSaveProfile(() => void fill()));
    bar.createSpan({ cls: `mmw-typo-folder`, text: t(`Dossier des profils : {0}`, plugin.settings.profileFolder) });
    bar.createEl(`button`, { text: t(`Changer de dossier`) }).addEventListener(`click`, () =>
      new FolderPicker(this.app, (path) => {
        plugin.settings.profileFolder = normalizePath(path);
        void plugin.saveSettings(false);
        redraw();
      }).open()
    );
    bar.createEl(`button`, { text: t(`Créer les dossiers`) }).addEventListener(`click`, () => void plugin.createFolders(true).then(() => void fill()));
    const list = el.createDiv({ cls: `mmw-profile-list` });
    const fill = async (): Promise<void> => {
      const names = await plugin.profiles.list();
      list.empty();
      if (names.length === 0) {
        list.createDiv({ cls: `mmw-pnote`, text: t(`Aucun profil pour l'instant. Réglez le plugin comme vous le souhaitez, puis cliquez sur Sauvegarder un profil.`) });
        return;
      }
      for (const name of names) {
        const row = list.createDiv({ cls: `mmw-profile-row` });
        row.createSpan({ cls: `mmw-profile-label`, text: name });
        row.createEl(`button`, { text: t(`Charger`) }).addEventListener(`click`, () => plugin.confirmLoadProfile(name, redraw));
        row.createEl(`button`, { text: t(`Renommer`) }).addEventListener(`click`, () =>
          new NameModal(this.app, {
            title: t(`Renommer le profil « {0} »`, name),
            value: name,
            confirm: t(`Renommer`),
            existing: () => plugin.profiles.list(),
            self: name,
            onSubmit: async (to, overwrite) => {
              const result = await plugin.profiles.rename(name, to, overwrite);
              if (result !== `renamed`) new Notice(t(`Le profil n'a pas pu être renommé.`));
              void fill();
            },
          }).open()
        );
        row.createEl(`button`, { cls: `mod-warning`, text: t(`Supprimer`) }).addEventListener(`click`, () =>
          new ConfirmModal(this.app, {
            title: t(`Supprimer le profil « {0} »`, name),
            text: t(`Le fichier du profil est supprimé du coffre. Cette action est définitive.`),
            confirm: t(`Supprimer`),
            danger: true,
            onConfirm: () => void plugin.profiles.remove(name).then(() => fill()),
          }).open()
        );
      }
    };
    void fill();
  }

  private keys(): SettingDefinitionItem[] {
    return [
      this.keyRow(t(`Chapitre précédent`), `keyPrev`),
      this.keyRow(t(`Chapitre suivant`), `keyNext`),
      this.keyRow(t(`Chapitre parent`), `keyParent`),
      this.keyRow(t(`Premier sous-titre`), `keyChild`),
    ];
  }

  // Ends the key capture in progress, if any: the listener on the window is removed and the button shows its combination again.
  private endCapture: (() => void) | null = null;

  private stopCapture(): void {
    const end = this.endCapture;
    this.endCapture = null;
    end?.();
  }

  // The settings page is closed: no capture may stay active and swallow the next key typed elsewhere.
  hide(): void {
    this.stopCapture();
    super.hide();
  }

  // Ligne de reglage d'une touche : un bouton qui attend la combinaison a enregistrer.
  private keyRow(name: string, field: KeyField): SettingDefinition {
    const s = this.plugin.settings;
    const isMac = Platform.isMacOS;
    return {
      name,
      desc: t(`Fonctionne dans la note reliée à la carte. Cliquez sur le bouton puis tapez la combinaison voulue (Échap pour annuler).`),
      render: (setting) => {
        setting.addButton((btn) => {
          btn.setButtonText(comboLabel(s[field], isMac));
          btn.onClick(() => {
            // A capture still waiting (another button clicked before typing) is ended first.
            this.stopCapture();
            btn.setButtonText(t(`Tapez la combinaison...`));
            const listener = (e: KeyboardEvent) => {
              if ([`Control`, `Shift`, `Alt`, `Meta`].includes(e.key)) return;
              e.preventDefault();
              e.stopPropagation();
              this.stopCapture();
              if (e.key !== `Escape`) {
                s[field] = eventToCombo(e, isMac);
                void this.plugin.saveSettings(false);
              }
              btn.setButtonText(comboLabel(s[field], isMac));
            };
            window.addEventListener(`keydown`, listener, true);
            this.endCapture = () => {
              window.removeEventListener(`keydown`, listener, true);
              btn.setButtonText(comboLabel(s[field], isMac));
            };
          });
        });
        setting.addExtraButton((b) =>
          b
            .setIcon(`reset`)
            .setTooltip(t(`Rétablir la valeur d'origine`))
            .onClick(async () => {
              s[field] = DEFAULT_SETTINGS[field];
              await this.plugin.saveSettings(false);
              this.update();
            })
        );
        // A page left while a capture waits must not keep the listener on the window.
        return () => this.stopCapture();
      },
    };
  }
}

// Window of the callout editor: type (with its pictogram and colour), title, text, folding and look of a callout, with a live preview.
// It is opened by the callout editor function of the plugin, which gives it the Obsidian module: this file imports Obsidian only for its types.
import type { App } from "obsidian";
import { CalloutForm, CalloutLookChoice, cleanType, overrideOfForm } from "./callout-edit";
import { CALLOUT_ICONS, ICON_STROKE } from "./export/callout-icons";
import { CalloutKind, calloutKindOf, CalloutLook, calloutPaint, defaultCalloutTitle } from "./export/callout";
import type { HelpLang } from "./help";

export interface CalloutEditorDeps {
  app: App;
  obsidian: typeof import("obsidian");
  lang: HelpLang;
  // Fields to start from, and whether they come from a callout that exists in the note (false: a new callout).
  form: CalloutForm;
  editing: boolean;
  // Look of the callouts chosen in the settings of the export, which the preview follows for a callout that chooses nothing.
  defaultLook: CalloutLook;
  onSubmit: (form: CalloutForm) => void;
}

const TEXTS = {
  titleNew: { fr: `Nouveau callout`, en: `New callout` },
  titleEdit: { fr: `Modifier le callout`, en: `Edit the callout` },
  type: { fr: `Type (pictogramme et couleur)`, en: `Type (pictogram and colour)` },
  other: { fr: `Autre type…`, en: `Other type…` },
  otherName: { fr: `Nom du type (lettres, chiffres, tiret)`, en: `Name of the type (letters, digits, hyphen)` },
  title: { fr: `Titre (facultatif : le type sert de titre)`, en: `Title (optional: the type is the title)` },
  text: { fr: `Texte`, en: `Text` },
  textHelp: { fr: `Chaque ligne est écrite avec > devant, comme dans Obsidian. Les listes et les citations s'écrivent comme d'habitude.`, en: `Each line is written with > in front, as in Obsidian. Lists and quotes are written as usual.` },
  fold: { fr: `Repliable`, en: `Foldable` },
  foldNone: { fr: `Non`, en: `No` },
  foldClosed: { fr: `Oui, replié au départ`, en: `Yes, folded at first` },
  foldOpen: { fr: `Oui, déplié au départ`, en: `Yes, open at first` },
  look: { fr: `Aspect à l'export`, en: `Look in the export` },
  lookDefault: { fr: `Selon le réglage de l'export`, en: `As the export setting says` },
  lookColor: { fr: `En couleur`, en: `In colour` },
  lookBw: { fr: `Noir et blanc`, en: `Black and white` },
  lookCustom: { fr: `Couleur libre`, en: `Free colour` },
  lookHelp: { fr: `Le choix est écrit dans une ligne de commentaire sous la première ligne, que Obsidian ne montre pas.`, en: `The choice is written in a line of comment under the first line, which Obsidian does not show.` },
  colour: { fr: `Couleur`, en: `Colour` },
  preview: { fr: `Aperçu`, en: `Preview` },
  insert: { fr: `Insérer`, en: `Insert` },
  replace: { fr: `Enregistrer les modifications`, en: `Save the changes` },
  cancel: { fr: `Annuler`, en: `Cancel` },
} as const;

type TextId = keyof typeof TEXTS;

// The kinds that the window offers, with their names (the first word of the type is the one written in the note).
const KINDS: { type: string; fr: string; en: string }[] = [
  { type: `note`, fr: `Note`, en: `Note` },
  { type: `abstract`, fr: `Résumé`, en: `Abstract` },
  { type: `info`, fr: `Information`, en: `Info` },
  { type: `todo`, fr: `À faire`, en: `To do` },
  { type: `tip`, fr: `Astuce`, en: `Tip` },
  { type: `success`, fr: `Succès`, en: `Success` },
  { type: `question`, fr: `Question`, en: `Question` },
  { type: `warning`, fr: `Avertissement`, en: `Warning` },
  { type: `failure`, fr: `Échec`, en: `Failure` },
  { type: `danger`, fr: `Danger`, en: `Danger` },
  { type: `bug`, fr: `Bogue`, en: `Bug` },
  { type: `example`, fr: `Exemple`, en: `Example` },
  { type: `quote`, fr: `Citation`, en: `Quote` },
];

const OTHER = `__other__`;

export function openCalloutEditor(deps: CalloutEditorDeps): void {
  const { Modal } = deps.obsidian;
  const lang = deps.lang;
  const tr = (id: TextId): string => TEXTS[id][lang];

  class CalloutModal extends Modal {
    private form: CalloutForm = { ...deps.form };
    private preview!: HTMLElement;
    private otherRow!: HTMLElement;
    private colorRow!: HTMLElement;

    onOpen(): void {
      this.titleEl.setText(deps.editing ? tr(`titleEdit`) : tr(`titleNew`));
      this.modalEl.addClass(`mmw-calloutmodal`);
      const body = this.contentEl.createDiv({ cls: `mmw-callout-layout` });
      const left = body.createDiv({ cls: `mmw-callout-left` });
      const right = body.createDiv({ cls: `mmw-callout-right` });
      right.createEl(`h4`, { text: tr(`preview`) });
      this.preview = right.createDiv({ cls: `mmw-callout-preview` });

      // Type: one of the kinds of Obsidian, or a name typed by the user (a type made with the Callout Manager plugin, for example).
      const known = KINDS.some((k) => k.type === this.form.type);
      const typeRow = left.createDiv({ cls: `mmw-chart-row` });
      typeRow.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`type`) });
      const typeSelect = typeRow.createEl(`select`, { cls: `dropdown mmw-chart-input` });
      for (const k of KINDS) typeSelect.createEl(`option`, { attr: { value: k.type }, text: k[lang] });
      typeSelect.createEl(`option`, { attr: { value: OTHER }, text: tr(`other`) });
      typeSelect.value = known ? this.form.type : OTHER;
      this.otherRow = left.createDiv({ cls: `mmw-chart-row` });
      this.otherRow.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`otherName`) });
      const otherInput = this.otherRow.createEl(`input`, { cls: `mmw-chart-input`, attr: { type: `text`, maxlength: `40` } });
      otherInput.value = known ? `` : this.form.type;
      const syncType = (): void => {
        this.otherRow.toggleClass(`mmw-hidden`, typeSelect.value !== OTHER);
        this.form.type = typeSelect.value === OTHER ? cleanType(otherInput.value) : typeSelect.value;
        this.refresh();
      };
      typeSelect.addEventListener(`change`, syncType);
      otherInput.addEventListener(`input`, syncType);

      this.textField(left, `title`, this.form.title, (v) => (this.form.title = v));

      // Text: several lines.
      const textRow = left.createDiv({ cls: `mmw-chart-row mmw-chart-rowtop` });
      textRow.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`text`) });
      const area = textRow.createEl(`textarea`, { cls: `mmw-chart-input`, attr: { rows: `7` } });
      area.value = this.form.text;
      area.addEventListener(`input`, () => {
        this.form.text = area.value;
        this.refresh();
      });
      left.createDiv({ cls: `mmw-chart-help`, text: tr(`textHelp`) });

      this.select(left, `fold`, [
        [``, tr(`foldNone`)],
        [`closed`, tr(`foldClosed`)],
        [`open`, tr(`foldOpen`)],
      ], this.form.fold, (v) => (this.form.fold = v as CalloutForm[`fold`]));

      this.select(left, `look`, [
        [`default`, tr(`lookDefault`)],
        [`color`, tr(`lookColor`)],
        [`bw`, tr(`lookBw`)],
        [`custom`, tr(`lookCustom`)],
      ], this.form.look, (v) => {
        this.form.look = v as CalloutLookChoice;
        this.colorRow.toggleClass(`mmw-hidden`, this.form.look !== `custom`);
      });
      this.colorRow = left.createDiv({ cls: `mmw-chart-row` });
      this.colorRow.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`colour`) });
      const color = this.colorRow.createEl(`input`, { cls: `mmw-chart-color`, attr: { type: `color`, title: tr(`colour`) } });
      color.value = /^#[0-9a-fA-F]{6}$/.test(this.form.color) ? this.form.color : `#448aff`;
      color.addEventListener(`input`, () => {
        this.form.color = color.value;
        this.refresh();
      });
      this.colorRow.toggleClass(`mmw-hidden`, this.form.look !== `custom`);
      left.createDiv({ cls: `mmw-chart-help`, text: tr(`lookHelp`) });
      this.otherRow.toggleClass(`mmw-hidden`, typeSelect.value !== OTHER);

      // Buttons.
      const actions = this.contentEl.createDiv({ cls: `mmw-dlg-actions` });
      const cancel = actions.createEl(`button`, { cls: `mmw-dlg-btn`, text: tr(`cancel`), attr: { type: `button` } });
      cancel.addEventListener(`click`, () => this.close());
      const ok = actions.createEl(`button`, { cls: `mmw-dlg-btn mod-cta`, text: deps.editing ? tr(`replace`) : tr(`insert`), attr: { type: `button` } });
      ok.addEventListener(`click`, () => {
        const form = { ...this.form, type: cleanType(this.form.type) };
        this.close();
        deps.onSubmit(form);
      });
      this.refresh();
    }

    private select(parent: HTMLElement, id: TextId, choices: [string, string][], value: string, set: (v: string) => void): void {
      const row = parent.createDiv({ cls: `mmw-chart-row` });
      row.createEl(`span`, { cls: `mmw-chart-label`, text: tr(id) });
      const select = row.createEl(`select`, { cls: `dropdown mmw-chart-input` });
      for (const [key, name] of choices) select.createEl(`option`, { attr: { value: key }, text: name });
      select.value = value;
      select.addEventListener(`change`, () => {
        set(select.value);
        this.refresh();
      });
    }

    private textField(parent: HTMLElement, id: TextId, value: string, set: (v: string) => void): void {
      const row = parent.createDiv({ cls: `mmw-chart-row` });
      row.createEl(`span`, { cls: `mmw-chart-label`, text: tr(id) });
      const input = row.createEl(`input`, { cls: `mmw-chart-input`, attr: { type: `text`, maxlength: `200` } });
      input.value = value;
      input.addEventListener(`input`, () => {
        set(input.value);
        this.refresh();
      });
    }

    // The preview: the box as the export prints it (bar, ground or frame, pictogram, title, text).
    private refresh(): void {
      const kind: CalloutKind = calloutKindOf(this.form.type);
      const paint = calloutPaint(kind, deps.defaultLook, overrideOfForm(this.form));
      const box = this.preview;
      box.empty();
      const card = box.createDiv({ cls: `mmw-callout-card` });
      card.style.background = paint.fill === `` ? `transparent` : paint.fill;
      card.style.borderLeft = paint.bar !== `` ? `3px solid ${paint.bar}` : paint.frame !== `` ? `1px solid ${paint.frame}` : `0 solid transparent`;
      if (paint.frame !== ``) {
        card.style.borderRight = `1px solid ${paint.frame}`;
        card.style.borderTop = `1px solid ${paint.frame}`;
        card.style.borderBottom = `1px solid ${paint.frame}`;
      }
      const head = card.createDiv({ cls: `mmw-callout-head` });
      head.style.color = paint.ink;
      const svg = head.createSvg(`svg`, { attr: { width: `18`, height: `18`, viewBox: `0 0 24 24`, fill: `none`, stroke: paint.ink, "stroke-width": String(ICON_STROKE), "stroke-linecap": `round`, "stroke-linejoin": `round` } });
      svg.createSvg(`path`, { attr: { d: CALLOUT_ICONS[kind] } });
      const title = this.form.title.trim() === `` ? defaultCalloutTitle(this.form.type) : this.form.title.trim();
      head.createSpan({ text: title });
      const text = this.form.text.trim();
      if (text !== ``) {
        const content = card.createDiv({ cls: `mmw-callout-text` });
        content.setText(text);
      }
    }
  }

  new CalloutModal(deps.app).open();
}

// Fenetre « Polices et titres » : police, taille (en points, comme Word), gras, italique, couleur et surlignage de chaque element du
// document (corps de texte, titre, titres de niveau 1 a 6, legendes, notes de bas de page, en-tete et pied de page), et pour les titres la
// casse, le soulignement, la numerotation et le cadre. Chaque element est une section repliable dont la ligne d'en-tete montre un exemple
// mis en forme ; un apercu de page reste visible en haut. Le reglage vaut pour toutes les notes (reglages du plugin) ou pour la note
// ouverte seulement, qui garde alors ce qui differe.
import { App, Modal, setIcon } from "obsidian";
import { AddFontModal } from "./add-font-modal";
import { EXPORT_FONT_FAMILY, loadExportFont } from "./export-font";
import { cssFamilyOf } from "./font-store";
import { FolderPicker } from "./folder-picker";
import type { ImportReport } from "./font-import";
import { t } from "./i18n";
import type { FontProblem, LoadedFamily } from "./font-library";
import { applyOverrides, BASE_POINTS, CaseMode, defaultTypography, FrameMode, getPath, HEADING_LEVELS, HeadingSpec, headingNumber, NumberScheme, Overrides, overridePaths, POINTS_MAX, POINTS_MIN, setPath, styleOf, TextSpec, TypographyStyle } from "./text-style";

export interface TypographyHost {
  // Style general (reglages du plugin) et son enregistrement.
  general(): TypographyStyle;
  setGeneral(style: TypographyStyle): void;
  // Reglages propres a la note ouverte ; absent quand aucune note n'est ouverte dans un editeur.
  note?: { read(): Overrides; write(overrides: Overrides): void };
  families(): LoadedFamily[];
  problems(): FontProblem[];
  folder(): string;
  // Choisit un autre dossier des polices et relit son contenu.
  setFolder(path: string): Promise<void>;
  // Cree le dossier des polices s'il n'existe pas.
  prepareFolder(): Promise<void>;
  refresh(): Promise<void>;
  // Copie des fichiers de polices choisis sur l'ordinateur dans le dossier des polices.
  importFiles(files: File[]): Promise<ImportReport>;
}

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 60, 72];
const LINE_WIDTHS = [0.5, 0.75, 1, 1.5, 2, 3];
// Hauteur maximale d'un exemple dans l'en-tete d'une section, en points : au-dela, l'exemple est coupe.
const SAMPLE_MAX_POINTS = 30;

interface Element {
  group: string;
  label: string;
  sample: string;
  heading: boolean;
  level: number;
}

function elements(): Element[] {
  const out: Element[] = [
    { group: `body`, label: t(`Corps de texte`), sample: t(`Exemple de texte courant`), heading: false, level: 0 },
    { group: `title`, label: t(`Titre du document`), sample: t(`Titre du document`), heading: true, level: 0 },
  ];
  for (let i = 1; i <= HEADING_LEVELS; i++) out.push({ group: `h${i}`, label: t(`Titre de niveau {0}`, i), sample: t(`Exemple de titre`), heading: true, level: i });
  out.push(
    { group: `caption`, label: t(`Légendes`), sample: t(`Figure 1 : exemple de légende`), heading: false, level: 0 },
    { group: `footnote`, label: t(`Notes de bas de page`), sample: t(`Exemple de note de bas de page`), heading: false, level: 0 },
    { group: `decor`, label: t(`En-tête, pied de page et bord extérieur`), sample: t(`Exemple d'en-tête`), heading: false, level: 0 }
  );
  return out;
}

export function problemText(p: FontProblem): string {
  switch (p.kind) {
    case `woff`:
      return t(`format WOFF non pris en charge : utilisez le fichier .ttf ou .otf`);
    case `collection`:
      return t(`collection de polices (.ttc) non prise en charge : utilisez un fichier par style`);
    case `restricted`:
      return t(`la licence de cette police interdit son incorporation dans un document`);
    case `variable`:
      return t(`police variable non prise en charge : utilisez les fichiers du dossier static`);
    case `duplicate`:
      return t(`style déjà fourni par un autre fichier de la même famille`);
    default:
      return t(`fichier illisible`);
  }
}

// Bouton Ajouter une police, dossier des polices et fichiers refuses. Partage avec les reglages du plugin.
export function renderFontTools(parent: HTMLElement, app: App, host: TypographyHost, redraw: () => void): void {
  const box = parent.createDiv({ cls: `mmw-typo-info` });
  const row = box.createDiv({ cls: `mmw-typo-folderrow` });
  const add = row.createEl(`button`, { cls: `mod-cta`, text: t(`Ajouter une police`) });
  add.addEventListener(`click`, () => new AddFontModal(app, host, redraw).open());
  row.createSpan({ cls: `mmw-typo-folder`, text: t(`Dossier des polices : {0}`, host.folder()) });
  const change = row.createEl(`button`, { text: t(`Changer de dossier`) });
  change.addEventListener(`click`, () => new FolderPicker(app, (path) => void host.setFolder(path).then(redraw)).open());
  const reload = row.createEl(`button`, { text: t(`Relire le dossier`) });
  reload.addEventListener(`click`, () => void host.refresh().then(redraw));
  const problems = host.problems();
  if (problems.length > 0) {
    box.createDiv({ cls: `mmw-typo-problems-title`, text: t(`Fichiers non utilisables`) });
    for (const p of problems) box.createDiv({ cls: `mmw-typo-problem`, text: `${p.path.split(`/`).pop()} : ${problemText(p)}` });
  }
}

const CASE_CSS: Record<CaseMode, string> = { none: `none`, upper: `uppercase`, lower: `lowercase`, capitalize: `capitalize` };

// Met en forme un texte d'exemple comme l'export le fera : police, taille, gras, italique, couleur, surlignage, casse, soulignement et cadre.
// `scale` reduit toutes les tailles (apercu de page) ; `number` est le numero du titre (vide : aucun).
function paintSample(host: HTMLElement, spec: TextSpec | HeadingSpec, base: number, text: string, opts: { scale?: number; number?: string; cap?: boolean } = {}): HTMLElement {
  const heading = `frame` in spec;
  const h = spec as HeadingSpec;
  let points = (spec.points > 0 ? spec.points : base) * (opts.scale ?? 1);
  if (opts.cap) points = Math.min(points, SAMPLE_MAX_POINTS);
  const outer = host.createDiv({ cls: `mmw-sample` });
  const inner = outer.createSpan({ text: `${opts.number ? `${opts.number} ` : ``}${text}` });
  outer.style.fontSize = `${points}pt`;
  outer.style.lineHeight = `1.25`;
  // Police du coffre : le fichier de la variante est deja gras ou italique ; police d'origine : le navigateur choisit la variante.
  const css = cssFamilyOf(styleOf(spec));
  if (css) {
    outer.style.fontFamily = `"${css}"`;
    outer.style.fontWeight = `normal`;
    outer.style.fontStyle = `normal`;
  } else {
    outer.style.fontFamily = `"${EXPORT_FONT_FAMILY}", serif`;
    outer.style.fontWeight = spec.bold ? `700` : `400`;
    outer.style.fontStyle = spec.italic ? `italic` : `normal`;
  }
  if (spec.color !== ``) outer.style.color = spec.color;
  if (spec.highlight !== ``) inner.style.backgroundColor = spec.highlight;
  if (heading) {
    outer.style.textTransform = CASE_CSS[h.case];
    if (h.underline) outer.style.textDecoration = `underline`;
    if (h.frame !== `none`) {
      outer.style.border = `${h.frameWidth}pt solid ${h.frameColor}`;
      outer.style.padding = `${3 * (opts.scale ?? 1)}pt ${5 * (opts.scale ?? 1)}pt`;
      if (h.frameFill !== ``) outer.style.backgroundColor = h.frameFill;
      outer.style.display = h.frame === `full` ? `block` : `inline-block`;
    }
  }
  return outer;
}

export class TypographyModal extends Modal {
  private target: `general` | `note`;
  // Sections ouvertes : elles le restent quand la fenetre est redessinee apres un changement.
  private opened = new Set<string>([`body`]);

  constructor(app: App, private host: TypographyHost) {
    super(app);
    this.target = host.note ? `note` : `general`;
  }

  onOpen(): void {
    this.titleEl.setText(t(`Polices et titres`));
    this.modalEl.addClass(`mmw-pmodal`, `mmw-typo`);
    this.render();
    // Les exemples attendent que la police d'origine soit chargee, puis que le dossier des polices soit lu.
    void loadExportFont().then(async () => {
      await this.host.prepareFolder();
      this.render();
    });
  }

  private overrides(): Overrides {
    return this.host.note?.read() ?? {};
  }

  // Style qui s'applique a l'echelle choisie.
  private effective(): TypographyStyle {
    const general = this.host.general();
    return this.target === `note` ? applyOverrides(general, this.overrides()) : general;
  }

  private change(path: string, value: string | number | boolean): void {
    if (this.target === `general`) this.host.setGeneral(setPath(this.host.general(), path, value));
    else if (this.host.note) {
      const next = { ...this.overrides(), [path]: value };
      // Une valeur egale au style general n'est pas gardee : la note suit alors le style general.
      if (getPath(this.host.general(), path) === getPath(setPath(this.host.general(), path, value), path)) delete next[path];
      this.host.note.write(next);
    }
    this.render();
  }

  private resetPaths(prefix: string): void {
    if (this.target !== `note` || !this.host.note) return;
    const next = { ...this.overrides() };
    for (const k of Object.keys(next)) if (k === prefix || k.startsWith(`${prefix}.`)) delete next[k];
    this.host.note.write(next);
    this.render();
  }

  private specOf(style: TypographyStyle, group: string): TextSpec | HeadingSpec {
    if (group === `body`) return style.body;
    if (group === `title`) return style.title;
    if (group === `caption`) return style.caption;
    if (group === `footnote`) return style.footnote;
    if (group === `decor`) return style.decor;
    return style.headings[Number(group.slice(1)) - 1];
  }

  // Numero d'un titre de niveau `level` en tete de document (1, 1.1, 1.1.1 ou I, A, 1...), selon les niveaux numerotes.
  private numberOf(style: TypographyStyle, level: number): string {
    if (style.numbering === `none` || level < 1 || !style.headings[level - 1].numbered) return ``;
    const path: number[] = [];
    for (let i = 1; i <= level; i++) if (style.headings[i - 1].numbered) path.push(1);
    return headingNumber(style.numbering, path);
  }

  private render(): void {
    const { contentEl } = this;
    const scroll = contentEl.scrollTop;
    contentEl.empty();
    const style = this.effective();
    const over = this.target === `note` ? this.overrides() : {};
    const head = contentEl.createDiv({ cls: `mmw-typo-head` });

    if (this.host.note) {
      const tabs = head.createDiv({ cls: `mmw-typo-scope` });
      for (const [which, label] of [[`general`, t(`Toutes les notes`)], [`note`, t(`Cette note`)]] as const) {
        const b = tabs.createEl(`button`, { text: label });
        if (this.target === which) b.addClass(`mod-cta`);
        b.addEventListener(`click`, () => {
          this.target = which;
          this.render();
        });
      }
      tabs.createSpan({ cls: `mmw-pnote`, text: this.target === `general` ? t(`Style appliqué à toutes les notes qui n'ont pas de réglage propre.`) : t(`Seuls les réglages que vous changez ici sont gardés dans la note. Les autres suivent le style de toutes les notes.`) });
    }
    renderFontTools(head, this.app, this.host, () => this.render());

    // Apercu de page : titres, texte, legende, note et en-tete tels que l'export les mettra en forme.
    this.renderPage(contentEl.createDiv({ cls: `mmw-typo-sticky` }), style);

    // Numerotation des titres.
    const numbering = contentEl.createDiv({ cls: `mmw-typo-top` });
    numbering.createSpan({ cls: `mmw-typo-label`, text: t(`Numérotation des titres`) });
    const select = numbering.createEl(`select`);
    const schemes: [NumberScheme, string][] = [[`none`, t(`Aucune`)], [`decimal`, t(`Décimale (1, 1.1, 1.1.1)`)], [`outline`, t(`Plan (I, A, 1, a)`)]];
    for (const [value, label] of schemes) select.createEl(`option`, { value, text: label });
    select.value = style.numbering;
    select.addEventListener(`change`, () => this.change(`numbering`, select.value));
    if (this.target === `note` && `numbering` in over) {
      numbering.addClass(`mmw-typo-over`);
      const b = numbering.createEl(`button`, { cls: `mmw-typo-reset`, attr: { "aria-label": t(`Suivre le style de toutes les notes`), title: t(`Suivre le style de toutes les notes`) } });
      setIcon(b, `rotate-ccw`);
      b.addEventListener(`click`, () => this.resetPaths(`numbering`));
    }

    // Tailles proposees comme dans Word (la saisie reste libre).
    const list = contentEl.createEl(`datalist`, { attr: { id: `mmw-typo-sizes` } });
    for (const v of SIZES) list.createEl(`option`, { value: String(v) });
    const families = this.host.families();
    for (const el of elements()) this.renderElement(contentEl, el, style, over, families);

    const foot = contentEl.createDiv({ cls: `mmw-typo-buttons` });
    const reset = foot.createEl(`button`, { text: this.target === `general` ? t(`Revenir au style d'origine`) : t(`Suivre le style de toutes les notes`) });
    reset.addEventListener(`click`, () => {
      if (this.target === `general`) this.host.setGeneral(defaultTypography());
      else this.host.note?.write({});
      this.render();
    });
    contentEl.scrollTop = scroll;
  }

  private renderPage(parent: HTMLElement, style: TypographyStyle): void {
    const page = parent.createDiv({ cls: `mmw-typo-page` });
    const scale = 0.8;
    const run = (spec: TextSpec | HeadingSpec, base: number, text: string, level = 0): void => {
      paintSample(page, spec, base, text, { scale, number: level > 0 ? this.numberOf(style, level) : `` });
    };
    const header = page.createDiv({ cls: `mmw-typo-page-band` });
    paintSample(header, style.decor, BASE_POINTS.decor, t(`En-tête du document`), { scale });
    run(style.title, BASE_POINTS.title, t(`Titre du document`));
    run(style.headings[0], BASE_POINTS.h1, t(`Premier chapitre`), 1);
    run(style.body, BASE_POINTS.body, t(`Un paragraphe de texte courant montre la police, la taille et la couleur du corps de texte, avec un mot en gras.`));
    run(style.headings[1], BASE_POINTS.h2, t(`Première partie`), 2);
    run(style.headings[2], BASE_POINTS.h3, t(`Détail`), 3);
    run(style.caption, BASE_POINTS.caption, t(`Figure 1 : exemple de légende`));
    run(style.footnote, BASE_POINTS.footnote, t(`1 Exemple de note de bas de page`));
  }

  private renderElement(parent: HTMLElement, el: Element, style: TypographyStyle, over: Overrides, families: LoadedFamily[]): void {
    const spec = this.specOf(style, el.group);
    const path = (field: string): string => `${el.group}.${field}`;
    const base = BASE_POINTS[el.group];
    const details = parent.createEl(`details`, { cls: `mmw-typo-section` });
    details.open = this.opened.has(el.group);
    details.addEventListener(`toggle`, () => {
      if (details.open) this.opened.add(el.group);
      else this.opened.delete(el.group);
    });
    const summary = details.createEl(`summary`);
    summary.createSpan({ cls: `mmw-typo-label`, text: el.label });
    const family = families.find((f) => f.id === spec.family)?.name ?? (spec.family === `` ? t(`Police d'origine`) : spec.family);
    summary.createSpan({ cls: `mmw-typo-recap`, text: `${family}, ${spec.points > 0 ? spec.points : base} pt` });
    const sample = summary.createDiv({ cls: `mmw-typo-sample` });
    paintSample(sample, spec, base, el.sample, { number: el.heading && el.level > 0 ? this.numberOf(style, el.level) : ``, cap: true });
    const overridden = overridePaths().some((p) => p.startsWith(`${el.group}.`) && p in over);
    if (overridden) summary.addClass(`mmw-typo-over`);

    // Tous les reglages de l'element sur une seule ligne qui passe a la suivante quand la largeur manque.
    const line = details.createDiv({ cls: `mmw-typo-line` });
    const field = (name: string): HTMLElement => {
      const wrap = line.createDiv({ cls: `mmw-typo-field` });
      wrap.createSpan({ cls: `mmw-typo-field-name`, text: name });
      return wrap;
    };
    const iconToggle = (parent: HTMLElement, name: `bold` | `italic` | `underline` | `numbered`, icon: string, title: string, value: boolean): void => {
      const b = parent.createEl(`button`, { cls: `mmw-typo-icon`, attr: { "aria-label": title, title } });
      setIcon(b, icon);
      if (value) b.addClass(`mod-cta`);
      b.addEventListener(`click`, () => this.change(path(name), !value));
    };
    const colorField = (name: string, prop: `color` | `highlight`, icon: string, current: string): void => {
      const wrap = field(name);
      const pair = wrap.createDiv({ cls: `mmw-typo-pair` });
      const input = pair.createEl(`input`, { type: `color`, attr: { title: name, "aria-label": name } });
      input.value = current !== `` ? current : prop === `color` ? `#000000` : `#ffff00`;
      if (current === ``) input.addClass(`is-unset`);
      input.addEventListener(`change`, () => this.change(path(prop), input.value));
      const clear = pair.createEl(`button`, { cls: `mmw-typo-icon`, attr: { "aria-label": t(`Sans couleur`), title: t(`Sans couleur`) } });
      setIcon(clear, current === `` ? icon : `x`);
      clear.addEventListener(`click`, () => {
        if (current !== ``) this.change(path(prop), ``);
        else input.click();
      });
    };

    const font = field(t(`Police`)).createEl(`select`);
    font.createEl(`option`, { value: ``, text: t(`Police d'origine`) });
    for (const f of families) font.createEl(`option`, { value: f.id, text: f.name });
    if (spec.family !== `` && !families.some((f) => f.id === spec.family)) font.createEl(`option`, { value: spec.family, text: t(`{0} (absente du dossier)`, spec.family) });
    font.value = spec.family;
    font.addEventListener(`change`, () => this.change(path(`family`), font.value));

    const size = field(t(`Taille (pt)`)).createEl(`input`, { type: `number`, cls: `mmw-typo-size`, attr: { min: String(POINTS_MIN), max: String(POINTS_MAX), step: `0.5`, list: `mmw-typo-sizes`, placeholder: String(base) } });
    if (spec.points > 0) size.value = String(spec.points);
    size.addEventListener(`change`, () => {
      const v = Number.parseFloat(size.value);
      this.change(path(`points`), Number.isFinite(v) && v > 0 ? v : 0);
    });

    const styles = field(t(`Style`)).createDiv({ cls: `mmw-typo-pair` });
    iconToggle(styles, `bold`, `bold`, t(`Gras`), spec.bold);
    iconToggle(styles, `italic`, `italic`, t(`Italique`), spec.italic);
    const h = el.heading ? (spec as HeadingSpec) : null;
    if (h) iconToggle(styles, `underline`, `underline`, t(`Souligné`), h.underline);

    colorField(t(`Couleur du texte`), `color`, `baseline`, spec.color);
    if (el.group !== `decor`) colorField(t(`Surlignage`), `highlight`, `highlighter`, spec.highlight);

    if (h) {
      const casing = field(t(`Casse`)).createEl(`select`);
      const cases: [CaseMode, string][] = [[`none`, t(`Casse d'origine`)], [`upper`, t(`MAJUSCULES`)], [`lower`, t(`minuscules`)], [`capitalize`, t(`Initiales en majuscules`)]];
      for (const [value, label] of cases) casing.createEl(`option`, { value, text: label });
      casing.value = h.case;
      casing.addEventListener(`change`, () => this.change(path(`case`), casing.value));
      if (el.group !== `title`) {
        const num = field(t(`Numéroté`)).createDiv({ cls: `mmw-typo-pair` });
        iconToggle(num, `numbered`, `list-ordered`, t(`Numéroté`), h.numbered);
      }

      const frame = field(t(`Cadre`)).createEl(`select`);
      const frames: [FrameMode, string][] = [[`none`, t(`Aucun`)], [`text`, t(`Ajusté au texte`)], [`full`, t(`Toute la largeur`)]];
      for (const [value, label] of frames) frame.createEl(`option`, { value, text: label });
      frame.value = h.frame;
      frame.addEventListener(`change`, () => this.change(path(`frame`), frame.value));
      if (h.frame !== `none`) {
        const widths = LINE_WIDTHS.includes(h.frameWidth) ? LINE_WIDTHS : [...LINE_WIDTHS, h.frameWidth].sort((a, b) => a - b);
        const thick = field(t(`Épaisseur du trait`)).createEl(`select`);
        for (const w of widths) thick.createEl(`option`, { value: String(w), text: `${w} pt` });
        thick.value = String(h.frameWidth);
        thick.addEventListener(`change`, () => this.change(path(`frameWidth`), Number.parseFloat(thick.value)));
        const stroke = field(t(`Couleur du trait`)).createEl(`input`, { type: `color` });
        stroke.value = h.frameColor;
        stroke.addEventListener(`change`, () => this.change(path(`frameColor`), stroke.value));
        const fillPair = field(t(`Fond du cadre`)).createDiv({ cls: `mmw-typo-pair` });
        const filled = fillPair.createEl(`input`, { type: `checkbox` });
        filled.checked = h.frameFill !== ``;
        const fill = fillPair.createEl(`input`, { type: `color` });
        fill.value = h.frameFill !== `` ? h.frameFill : `#f1f3f5`;
        fill.disabled = h.frameFill === ``;
        filled.addEventListener(`change`, () => this.change(path(`frameFill`), filled.checked ? fill.value : ``));
        fill.addEventListener(`change`, () => this.change(path(`frameFill`), fill.value));
      }
    }
    if (overridden) {
      const b = details.createEl(`button`, { cls: `mmw-typo-reset`, text: t(`Suivre le style de toutes les notes`) });
      b.addEventListener(`click`, () => this.resetPaths(el.group));
    }
  }
}

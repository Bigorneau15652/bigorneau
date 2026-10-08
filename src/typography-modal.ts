// Fenetre « Polices et titres » : police, taille (en points, comme Word), gras et italique de chaque element du document (corps de texte,
// titre, titres de niveau 1 a 6, legendes, notes de bas de page, en-tete et pied de page), et pour les titres la casse, le soulignement, la
// numerotation et le cadre. Chaque element est une section repliable de deux ou trois lignes de reglages. Le reglage vaut pour toutes les
// notes (reglages du plugin) ou pour la note ouverte seulement, qui garde alors ce qui differe.
import { App, Modal, setIcon } from "obsidian";
import { FolderPicker } from "./folder-picker";
import { t } from "./i18n";
import type { FontProblem, LoadedFamily } from "./font-library";
import { variantsOf } from "./font-library";
import { applyOverrides, BASE_POINTS, CaseMode, defaultTypography, FrameMode, getPath, HEADING_LEVELS, HeadingSpec, NumberScheme, Overrides, overridePaths, POINTS_MAX, POINTS_MIN, setPath, TextSpec, TypographyStyle } from "./text-style";

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
}

// Sites ou trouver des polices : ils s'ouvrent dans le navigateur (le plugin ne telecharge rien lui-meme).
const FONT_SITES: [string, string][] = [
  [`Google Fonts`, `https://fonts.google.com`],
  [`Font Squirrel`, `https://www.fontsquirrel.com`],
  [`Fontshare`, `https://www.fontshare.com`],
];

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 60, 72];
const LINE_WIDTHS = [0.5, 0.75, 1, 1.5, 2, 3];

interface Element {
  group: string;
  label: string;
  heading: boolean;
}

function elements(): Element[] {
  const out: Element[] = [
    { group: `body`, label: t(`Corps de texte`), heading: false },
    { group: `title`, label: t(`Titre du document`), heading: true },
  ];
  for (let i = 1; i <= HEADING_LEVELS; i++) out.push({ group: `h${i}`, label: t(`Titre de niveau {0}`, i), heading: true });
  out.push({ group: `caption`, label: t(`Légendes`), heading: false }, { group: `footnote`, label: t(`Notes de bas de page`), heading: false }, { group: `decor`, label: t(`En-tête, pied de page et bord extérieur`), heading: false });
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

// Dossier des polices, polices detectees, fichiers refuses et liens vers des sites de polices. Partage avec les reglages du plugin.
export function renderFontInfo(parent: HTMLElement, app: App, host: TypographyHost, redraw: () => void): void {
  const box = parent.createDiv({ cls: `mmw-typo-info` });
  const folder = box.createDiv({ cls: `mmw-typo-folderrow` });
  folder.createSpan({ cls: `mmw-typo-folder`, text: t(`Dossier des polices : {0}`, host.folder()) });
  const change = folder.createEl(`button`, { text: t(`Changer de dossier`) });
  change.addEventListener(`click`, () => new FolderPicker(app, (path) => void host.setFolder(path).then(redraw)).open());
  const reload = folder.createEl(`button`, { text: t(`Relire le dossier`) });
  reload.addEventListener(`click`, () => void host.refresh().then(redraw));

  const families = host.families();
  if (families.length === 0) box.createDiv({ cls: `mmw-pnote`, text: t(`Aucune police ajoutée. Déposez des fichiers .ttf ou .otf (un par style : normal, italique, gras, gras italique) dans ce dossier.`) });
  else {
    const names: Record<string, string> = { regular: t(`normal`), italic: t(`italique`), bold: t(`gras`), boldItalic: t(`gras italique`) };
    for (const f of families) box.createDiv({ cls: `mmw-typo-family`, text: `${f.name} (${variantsOf(f).map((v) => names[v]).join(`, `)})` });
  }
  const problems = host.problems();
  if (problems.length > 0) {
    box.createDiv({ cls: `mmw-typo-problems-title`, text: t(`Fichiers non utilisables`) });
    for (const p of problems) box.createDiv({ cls: `mmw-typo-problem`, text: `${p.path.split(`/`).pop()} : ${problemText(p)}` });
  }
  const sites = box.createDiv({ cls: `mmw-typo-sites` });
  sites.createSpan({ text: t(`Trouver des polices :`) });
  for (const [name, url] of FONT_SITES) sites.createEl(`a`, { text: name, href: url, attr: { target: `_blank`, rel: `noopener` } });
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
    void this.host.prepareFolder().then(() => this.render());
    this.render();
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

  private render(): void {
    const { contentEl } = this;
    const scroll = this.modalEl.scrollTop;
    contentEl.empty();
    const style = this.effective();
    const over = this.target === `note` ? this.overrides() : {};

    if (this.host.note) {
      const tabs = contentEl.createDiv({ cls: `mmw-typo-scope` });
      for (const [which, label] of [[`general`, t(`Toutes les notes`)], [`note`, t(`Cette note`)]] as const) {
        const b = tabs.createEl(`button`, { text: label });
        if (this.target === which) b.addClass(`mod-cta`);
        b.addEventListener(`click`, () => {
          this.target = which;
          this.render();
        });
      }
      contentEl.createDiv({ cls: `mmw-pnote`, text: this.target === `general` ? t(`Style appliqué à toutes les notes qui n'ont pas de réglage propre.`) : t(`Seuls les réglages que vous changez ici sont gardés dans la note. Les autres suivent le style de toutes les notes.`) });
    }

    // Numerotation des titres.
    const numbering = contentEl.createDiv({ cls: `mmw-typo-top` });
    numbering.createSpan({ cls: `mmw-typo-label`, text: t(`Numérotation des titres`) });
    const select = numbering.createEl(`select`);
    const schemes: [NumberScheme, string][] = [[`none`, t(`Aucune`)], [`decimal`, t(`Décimale (1, 1.1, 1.1.1)`)], [`outline`, t(`Plan (I, A, 1, a)`)]];
    for (const [value, label] of schemes) select.createEl(`option`, { value, text: label });
    select.value = style.numbering;
    select.addEventListener(`change`, () => this.change(`numbering`, select.value));
    this.markOver(numbering, `numbering` in over, () => this.resetPaths(`numbering`));

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
    renderFontInfo(contentEl, this.app, this.host, () => this.render());
    this.modalEl.scrollTop = scroll;
  }

  private specOf(style: TypographyStyle, group: string): TextSpec | HeadingSpec {
    if (group === `body`) return style.body;
    if (group === `title`) return style.title;
    if (group === `caption`) return style.caption;
    if (group === `footnote`) return style.footnote;
    if (group === `decor`) return style.decor;
    return style.headings[Number(group.slice(1)) - 1];
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
    summary.createSpan({ cls: `mmw-typo-recap`, text: `${family}, ${spec.points > 0 ? spec.points : base} pt${spec.bold ? `, ${t(`gras`)}` : ``}${spec.italic ? `, ${t(`italique`)}` : ``}` });
    const overridden = overridePaths().some((p) => p.startsWith(`${el.group}.`) && p in over);
    if (overridden) summary.addClass(`mmw-typo-over`);

    const body = details.createDiv({ cls: `mmw-typo-body` });
    const line = (): HTMLElement => body.createDiv({ cls: `mmw-typo-line` });
    const field = (parent: HTMLElement, label: string): HTMLElement => {
      const wrap = parent.createDiv({ cls: `mmw-typo-field` });
      wrap.createSpan({ cls: `mmw-typo-field-name`, text: label });
      return wrap;
    };
    const toggle = (parent: HTMLElement, name: `bold` | `italic` | `underline` | `numbered`, label: string, title: string, value: boolean): void => {
      const b = parent.createEl(`button`, { text: label, attr: { "aria-label": title, title } });
      if (value) b.addClass(`mod-cta`);
      b.addEventListener(`click`, () => this.change(path(name), !value));
    };

    // Ligne 1 : police, taille en points, gras et italique.
    const first = line();
    const font = field(first, t(`Police`)).createEl(`select`);
    font.createEl(`option`, { value: ``, text: t(`Police d'origine`) });
    for (const f of families) font.createEl(`option`, { value: f.id, text: f.name });
    if (spec.family !== `` && !families.some((f) => f.id === spec.family)) font.createEl(`option`, { value: spec.family, text: t(`{0} (absente du dossier)`, spec.family) });
    font.value = spec.family;
    font.addEventListener(`change`, () => this.change(path(`family`), font.value));
    const sizeWrap = field(first, t(`Taille (pt)`));
    const size = sizeWrap.createEl(`input`, { type: `number`, cls: `mmw-typo-size`, attr: { min: String(POINTS_MIN), max: String(POINTS_MAX), step: `0.5`, list: `mmw-typo-sizes`, placeholder: String(base) } });
    if (spec.points > 0) size.value = String(spec.points);
    size.addEventListener(`change`, () => {
      const v = Number.parseFloat(size.value);
      this.change(path(`points`), Number.isFinite(v) && v > 0 ? v : 0);
    });
    const styles = first.createDiv({ cls: `mmw-typo-styles` });
    toggle(styles, `bold`, `G`, t(`Gras`), spec.bold);
    toggle(styles, `italic`, `I`, t(`Italique`), spec.italic);

    if (el.heading) {
      const h = spec as HeadingSpec;
      // Ligne 2 : casse, soulignement et numerotation.
      const second = line();
      const casing = field(second, t(`Casse`)).createEl(`select`);
      const cases: [CaseMode, string][] = [[`none`, t(`Casse d'origine`)], [`upper`, t(`MAJUSCULES`)], [`lower`, t(`minuscules`)], [`capitalize`, t(`Initiales en majuscules`)]];
      for (const [value, label] of cases) casing.createEl(`option`, { value, text: label });
      casing.value = h.case;
      casing.addEventListener(`change`, () => this.change(path(`case`), casing.value));
      const marks = second.createDiv({ cls: `mmw-typo-styles` });
      toggle(marks, `underline`, `S`, t(`Souligné`), h.underline);
      if (el.group !== `title`) toggle(marks, `numbered`, `N°`, t(`Numéroté`), h.numbered);

      // Ligne 3 : cadre.
      const third = line();
      const frame = field(third, t(`Cadre`)).createEl(`select`);
      const frames: [FrameMode, string][] = [[`none`, t(`Aucun`)], [`text`, t(`Ajusté au texte`)], [`full`, t(`Toute la largeur`)]];
      for (const [value, label] of frames) frame.createEl(`option`, { value, text: label });
      frame.value = h.frame;
      frame.addEventListener(`change`, () => this.change(path(`frame`), frame.value));
      if (h.frame !== `none`) {
        const widths = LINE_WIDTHS.includes(h.frameWidth) ? LINE_WIDTHS : [...LINE_WIDTHS, h.frameWidth].sort((a, b) => a - b);
        const line1 = field(third, t(`Épaisseur du trait`)).createEl(`select`);
        for (const w of widths) line1.createEl(`option`, { value: String(w), text: `${w} pt` });
        line1.value = String(h.frameWidth);
        line1.addEventListener(`change`, () => this.change(path(`frameWidth`), Number.parseFloat(line1.value)));
        const stroke = field(third, t(`Couleur du trait`)).createEl(`input`, { type: `color` });
        stroke.value = h.frameColor;
        stroke.addEventListener(`change`, () => this.change(path(`frameColor`), stroke.value));
        const fillWrap = field(third, t(`Fond`));
        const filled = fillWrap.createEl(`input`, { type: `checkbox` });
        filled.checked = h.frameFill !== ``;
        const fill = fillWrap.createEl(`input`, { type: `color` });
        fill.value = h.frameFill !== `` ? h.frameFill : `#f1f3f5`;
        fill.disabled = h.frameFill === ``;
        filled.addEventListener(`change`, () => this.change(path(`frameFill`), filled.checked ? fill.value : ``));
        fill.addEventListener(`change`, () => this.change(path(`frameFill`), fill.value));
      }
    }
    if (overridden) {
      const b = body.createEl(`button`, { cls: `mmw-typo-reset`, text: t(`Suivre le style de toutes les notes`) });
      b.addEventListener(`click`, () => this.resetPaths(el.group));
    }
  }

  // Repere d'une ligne que la note change (par rapport au style de toutes les notes), avec le bouton qui la remet comme lui.
  private markOver(row: HTMLElement, overridden: boolean, reset: () => void): void {
    if (this.target !== `note` || !overridden) return;
    row.addClass(`mmw-typo-over`);
    const b = row.createEl(`button`, { cls: `mmw-typo-reset`, attr: { "aria-label": t(`Suivre le style de toutes les notes`), title: t(`Suivre le style de toutes les notes`) } });
    setIcon(b, `rotate-ccw`);
    b.addEventListener(`click`, reset);
  }
}

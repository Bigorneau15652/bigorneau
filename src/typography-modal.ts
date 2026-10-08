// Fenetre « Polices et titres » : police, taille, gras, italique de chaque element du document (corps de texte, titre, titres de niveau 1
// a 6, legendes, notes de bas de page, en-tete et pied de page), et pour les titres la casse, le soulignement et la numerotation.
// Le reglage vaut pour toutes les notes (reglages du plugin) ou pour la note ouverte seulement, qui garde alors ce qui differe.
import { App, Modal, setIcon } from "obsidian";
import { t } from "./i18n";
import type { FontProblem, LoadedFamily } from "./font-library";
import { variantsOf } from "./font-library";
import { applyOverrides, CaseMode, defaultTypography, getPath, HEADING_LEVELS, NumberScheme, Overrides, overridePaths, SIZE_MAX, SIZE_MIN, setPath, TypographyStyle } from "./text-style";

export interface TypographyHost {
  // Style general (reglages du plugin) et son enregistrement.
  general(): TypographyStyle;
  setGeneral(style: TypographyStyle): void;
  // Reglages propres a la note ouverte ; absent quand aucune note n'est ouverte dans un editeur.
  note?: { read(): Overrides; write(overrides: Overrides): void };
  families(): LoadedFamily[];
  problems(): FontProblem[];
  folder(): string;
  // Cree le dossier des polices s'il n'existe pas, puis relit son contenu.
  prepareFolder(): Promise<void>;
  refresh(): Promise<void>;
}

const STEP = 5;

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

// Liste des polices detectees et des fichiers refuses, sous un titre. Partagee avec les reglages du plugin.
export function renderFontInfo(parent: HTMLElement, host: TypographyHost, redraw: () => void): void {
  const box = parent.createDiv({ cls: `mmw-typo-info` });
  const families = host.families();
  box.createDiv({ cls: `mmw-typo-folder`, text: t(`Dossier des polices : {0}`, host.folder()) });
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
  const buttons = box.createDiv({ cls: `mmw-typo-buttons` });
  const create = buttons.createEl(`button`, { text: t(`Créer le dossier`) });
  create.addEventListener(`click`, () => void host.prepareFolder().then(redraw));
  const reload = buttons.createEl(`button`, { text: t(`Relire le dossier`) });
  reload.addEventListener(`click`, () => void host.refresh().then(redraw));
}

export class TypographyModal extends Modal {
  private target: `general` | `note`;

  constructor(app: App, private host: TypographyHost) {
    super(app);
    this.target = host.note ? `note` : `general`;
  }

  onOpen(): void {
    this.titleEl.setText(t(`Polices et titres`));
    this.modalEl.addClass(`mmw-pmodal`, `mmw-typo`);
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
    const numbering = contentEl.createDiv({ cls: `mmw-typo-row` });
    numbering.createDiv({ cls: `mmw-typo-label`, text: t(`Numérotation des titres`) });
    const select = numbering.createEl(`select`);
    const schemes: [NumberScheme, string][] = [[`none`, t(`Aucune`)], [`decimal`, t(`Décimale (1, 1.1, 1.1.1)`)], [`outline`, t(`Plan (I, A, 1, a)`)]];
    for (const [value, label] of schemes) select.createEl(`option`, { value, text: label });
    select.value = style.numbering;
    select.addEventListener(`change`, () => this.change(`numbering`, select.value));
    this.markOver(numbering, `numbering` in over, () => this.resetPaths(`numbering`));

    const families = this.host.families();
    for (const el of elements()) {
      const row = contentEl.createDiv({ cls: `mmw-typo-row` });
      row.createDiv({ cls: `mmw-typo-label`, text: el.label });
      const controls = row.createDiv({ cls: `mmw-typo-controls` });
      const spec = (el.group === `body` ? style.body : el.group === `title` ? style.title : el.group === `caption` ? style.caption : el.group === `footnote` ? style.footnote : el.group === `decor` ? style.decor : style.headings[Number(el.group.slice(1)) - 1]);
      const path = (field: string): string => `${el.group}.${field}`;

      // Police : la police d'origine ou une famille du dossier. Une famille retiree reste affichee tant qu'elle est choisie.
      const font = controls.createEl(`select`, { attr: { "aria-label": t(`Police`) } });
      font.createEl(`option`, { value: ``, text: t(`Police d'origine`) });
      for (const f of families) font.createEl(`option`, { value: f.id, text: f.name });
      if (spec.family !== `` && !families.some((f) => f.id === spec.family)) font.createEl(`option`, { value: spec.family, text: t(`{0} (absente du dossier)`, spec.family) });
      font.value = spec.family;
      font.addEventListener(`change`, () => this.change(path(`family`), font.value));

      // Taille : plus ou moins haut, en pourcentage de la taille d'origine.
      const size = controls.createDiv({ cls: `mmw-typo-size` });
      const minus = size.createEl(`button`, { text: `−`, attr: { "aria-label": t(`Moins haut`) } });
      size.createSpan({ cls: `mmw-typo-size-value`, text: `${spec.size > 0 ? `+` : ``}${spec.size} %` });
      const plus = size.createEl(`button`, { text: `+`, attr: { "aria-label": t(`Plus haut`) } });
      minus.addEventListener(`click`, () => this.change(path(`size`), Math.max(SIZE_MIN, spec.size - STEP)));
      plus.addEventListener(`click`, () => this.change(path(`size`), Math.min(SIZE_MAX, spec.size + STEP)));

      const toggle = (field: `bold` | `italic` | `underline` | `numbered`, label: string, title: string, value: boolean): void => {
        const b = controls.createEl(`button`, { text: label, attr: { "aria-label": title, title } });
        if (value) b.addClass(`mod-cta`);
        b.addEventListener(`click`, () => this.change(path(field), !value));
      };
      toggle(`bold`, `G`, t(`Gras`), spec.bold);
      toggle(`italic`, `I`, t(`Italique`), spec.italic);
      if (el.heading) {
        const h = spec as TypographyStyle[`title`];
        const casing = controls.createEl(`select`, { attr: { "aria-label": t(`Casse`) } });
        const cases: [CaseMode, string][] = [[`none`, t(`Casse d'origine`)], [`upper`, t(`MAJUSCULES`)], [`lower`, t(`minuscules`)], [`capitalize`, t(`Initiales en majuscules`)]];
        for (const [value, label] of cases) casing.createEl(`option`, { value, text: label });
        casing.value = h.case;
        casing.addEventListener(`change`, () => this.change(path(`case`), casing.value));
        toggle(`underline`, `S`, t(`Souligné`), h.underline);
        if (el.group !== `title`) toggle(`numbered`, `N°`, t(`Numéroté`), h.numbered);
      }
      this.markOver(row, overridePaths().some((p) => p.startsWith(`${el.group}.`) && p in over), () => this.resetPaths(el.group));
    }

    const foot = contentEl.createDiv({ cls: `mmw-typo-buttons` });
    const reset = foot.createEl(`button`, { text: this.target === `general` ? t(`Revenir au style d'origine`) : t(`Suivre le style de toutes les notes`) });
    reset.addEventListener(`click`, () => {
      if (this.target === `general`) this.host.setGeneral(defaultTypography());
      else this.host.note?.write({});
      this.render();
    });
    renderFontInfo(contentEl, this.host, () => this.render());
    this.modalEl.scrollTop = scroll;
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

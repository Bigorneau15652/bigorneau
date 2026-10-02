// Affichage illustre du cours de l'editeur de formules : chaque bouton de structure est montre avec son dessin, les palettes de
// symboles avec leurs boutons, et des exemples pas a pas dont chaque etape est une formule dessinee par le meme moteur que l'editeur.
// Il sert dans l'editeur (bouton d'aide) et dans la fenetre d'aide du plugin.
import { appendSvgDocument } from "./dom";
import { CourseSection, EXAMPLES, KEYS } from "./formula-course";
import { PALETTE, sampleOf } from "./formula-palette";
import { previewTex, texModel } from "./formula-units";
import type { HelpLang } from "./help";
import type { MathSvgRenderer } from "./script-formulas";

// Couleur d'essai des parties choisies dans un exemple ; la feuille de style la remplace par la couleur d'accent du theme.
const MARK = `red`;

// Dessine une formule dans `parent` ; `mark` est la partie a montrer comme choisie.
export async function drawFormula(parent: HTMLElement, tex: string, renderSvg: MathSvgRenderer | undefined, mark?: string): Promise<void> {
  if (!renderSvg) {
    parent.setText(tex);
    return;
  }
  const model = texModel(tex);
  const at = mark === undefined ? -1 : tex.indexOf(mark);
  const probe = at >= 0 && mark !== undefined ? { color: MARK, unit: { start: at, end: at + mark.length } } : undefined;
  const svg = await renderSvg(previewTex(tex, model.slots, probe), false);
  const drawn = svg ? appendSvgDocument(parent, svg) : null;
  if (!drawn) {
    parent.setText(tex);
    return;
  }
  drawn.removeAttribute(`style`);
  drawn.classList.add(`mmw-course-svg`);
}

// Contenu illustre d'une section du cours.
// `withText` : ajoute aussi les paragraphes du texte (la fenetre d'aide les affiche deja elle-meme).
export function renderSection(host: HTMLElement, section: CourseSection, lang: HelpLang, renderSvg: MathSvgRenderer | undefined, withText = true): void {
  if (section.id === `structures`) {
    const rows = host.createDiv({ cls: `mmw-course-rows` });
    for (const item of PALETTE.find((g) => g.id === `structures`)?.items ?? []) {
      const row = rows.createDiv({ cls: `mmw-course-row` });
      const pic = row.createDiv({ cls: `mmw-course-key` });
      void drawFormula(pic, sampleOf(item), renderSvg);
      const body = row.createDiv();
      body.createEl(`strong`, { text: item.tip[lang] });
      body.createDiv({ text: item.how?.[lang] ?? `` });
    }
    return;
  }
  if (withText) for (const line of section.text[lang].split(`\n`)) host.createEl(`p`, { text: line });
  if (section.id === `symbols`) {
    for (const group of PALETTE.filter((g) => g.id !== `structures`)) {
      host.createEl(`h5`, { text: group.name[lang] });
      const chips = host.createDiv({ cls: `mmw-course-chips` });
      for (const item of group.items) {
        const chip = chips.createDiv({ cls: `mmw-course-chip` });
        chip.createDiv({ cls: `mmw-course-key`, text: item.label });
        chip.createEl(`code`, { text: item.tex });
      }
    }
  }
  if (section.id === `keyboard`) {
    const table = host.createDiv({ cls: `mmw-course-keys` });
    for (const k of KEYS) {
      const row = table.createDiv({ cls: `mmw-course-row` });
      const keys = row.createDiv({ cls: `mmw-course-kbd` });
      for (const key of k.keys) keys.createEl(`kbd`, { text: key });
      row.createDiv({ text: k.text[lang] });
    }
  }
  for (const example of EXAMPLES.filter((e) => e.section === section.id)) {
    host.createEl(`h5`, { text: example.title[lang] });
    const steps = host.createDiv({ cls: `mmw-course-steps` });
    example.steps.forEach((st, i) => {
      const card = steps.createDiv({ cls: `mmw-course-step` });
      card.createDiv({ cls: `mmw-course-number`, text: String(i + 1) });
      const pic = card.createDiv({ cls: `mmw-course-pic` });
      void drawFormula(pic, st.tex, renderSvg, st.mark);
      card.createDiv({ cls: `mmw-course-caption`, text: st.caption[lang] });
    });
  }
}

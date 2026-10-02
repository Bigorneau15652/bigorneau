// Script officiel « Formules » : dessine les formules mathematiques ($formule$ et $$formule$$) de l'apercu et du PDF, avec la
// bibliotheque MathJax, et ajoute l'editeur de formules (bouton) et les commandes pour inserer une formule. Desactive, il ne charge rien : les formules restent
// ecrites telles quelles dans l'export. MathJax n'est charge qu'a la premiere formule dessinee.
import type { MathAsset } from "./export/math";
import type { Editor } from "obsidian";
import { courseSections } from "./formula-course";
import { openFormulaEditor } from "./formula-modal";
import type { OfficialScript } from "./scripts";

// Service fourni aux autres scripts et a l'export : dessin d'une formule TeX, ou rien si MathJax la refuse.
export type MathRenderer = (tex: string, display: boolean) => Promise<MathAsset | null>;
export const MATH_SERVICE = `math.render`;

// Dessin SVG complet d'une formule (avec ses glyphes), pour l'apercu cliquable de l'editeur de formules.
export type MathSvgRenderer = (tex: string, display: boolean) => Promise<string | null>;
export const MATH_SVG_SERVICE = `math.svg`;

export const FORMULAS_SCRIPT: OfficialScript = {
  origin: `builtin`,
  id: `formulas`,
  name: { fr: `Formules`, en: `Formulas` },
  description: {
    fr: `Dessine les formules mathématiques ($formule$ et $$formule$$) dans l'aperçu et le PDF de l'export, et ajoute un éditeur de formules avec palettes de symboles et aperçu en direct.`,
    en: `Draws mathematical formulas ($formula$ and $$formula$$) in the export preview and PDF, and adds a formula editor with symbol palettes and a live preview.`,
  },
  version: `1.0.0`,
  api: 1,
  requires: [],
  defaultEnabled: false,
  load(api) {
    const render: MathRenderer = async (tex, display) => {
      // MathJax est evalue ici, a la premiere formule.
      const { renderTex } = await import(`./export/mathjax`);
      return renderTex(tex, display);
    };
    api.provide(MATH_SERVICE, render);
    api.provide(MATH_SVG_SERVICE, (async (tex, display) => (await import(`./export/mathjax`)).renderTexSvg(tex, display)) as MathSvgRenderer);
    api.addHelp(
      courseSections().map((c) => ({ id: `course-${c.id}`, title: c.title, text: c.text, keywords: { fr: `formule formules editeur palette cours aide tex`, en: `formula formulas editor palette course help tex` } }))
    );
    // Une seule fonction a bouton : l'editeur de formules. Les deux commandes d'avant gardent leur identifiant (les raccourcis
    // restent valables) et ouvrent l'editeur dans le mode correspondant, sans bouton.
    const open = (editor: Editor | undefined, display?: boolean): void => {
      if (!editor) return;
      openFormulaEditor({ app: api.app, obsidian: api.obsidian as typeof import("obsidian"), lang: api.language(), editor, renderSvg: api.service<MathSvgRenderer>(MATH_SVG_SERVICE) }, display);
    };
    api.addFunction({
      id: `edit-formula`,
      name: { fr: `Éditeur de formules`, en: `Formula editor` },
      icon: [`square-function`, `function-square`, `sigma`, `pi`],
      needsEditor: true,
      run: ({ editor }) => open(editor),
    });
    api.addFunction({
      id: `insert-inline-math`,
      name: { fr: `Insérer une formule en ligne`, en: `Insert an inline formula` },
      needsEditor: true,
      button: false,
      run: ({ editor }) => open(editor, false),
    });
    api.addFunction({
      id: `insert-block-math`,
      name: { fr: `Insérer une formule en bloc`, en: `Insert a block formula` },
      needsEditor: true,
      button: false,
      run: ({ editor }) => open(editor, true),
    });
  },
};

// Script officiel « Formules » : dessine les formules mathematiques ($formule$ et $$formule$$) de l'apercu et du PDF, avec la
// bibliotheque MathJax, et ajoute les commandes (et boutons) pour en inserer. Desactive, il ne charge rien : les formules restent
// ecrites telles quelles dans l'export. MathJax n'est charge qu'a la premiere formule dessinee.
import type { MathAsset } from "./export/math";
import { insertBlockMath, insertInlineMath } from "./export/insert";
import { applyInsert } from "./insert-apply";
import type { OfficialScript } from "./scripts";

// Service fourni aux autres scripts et a l'export : dessin d'une formule TeX, ou rien si MathJax la refuse.
export type MathRenderer = (tex: string, display: boolean) => Promise<MathAsset | null>;
export const MATH_SERVICE = `math.render`;

export const FORMULAS_SCRIPT: OfficialScript = {
  origin: `builtin`,
  id: `formulas`,
  name: { fr: `Formules`, en: `Formulas` },
  description: {
    fr: `Dessine les formules mathématiques ($formule$ et $$formule$$) dans l'aperçu et le PDF de l'export, et ajoute les commandes pour insérer une formule en ligne ou en bloc.`,
    en: `Draws mathematical formulas ($formula$ and $$formula$$) in the export preview and PDF, and adds the commands to insert an inline or a block formula.`,
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
    api.addFunction({
      id: `insert-inline-math`,
      name: { fr: `Insérer une formule en ligne`, en: `Insert an inline formula` },
      icon: [`sigma`, `pi`],
      needsEditor: true,
      run: ({ editor }) => {
        if (editor) applyInsert(editor, (text, from, to) => insertInlineMath(text, from, to));
      },
    });
    api.addFunction({
      id: `insert-block-math`,
      name: { fr: `Insérer une formule en bloc`, en: `Insert a block formula` },
      icon: [`square-function`, `function-square`, `pi`, `sigma`],
      needsEditor: true,
      run: ({ editor }) => {
        if (editor) applyInsert(editor, (text, from, to) => insertBlockMath(text, from, to));
      },
    });
  },
};

import { test } from "node:test";
import assert from "node:assert/strict";
import { addedDrawing, cleanFigureName, drawingEmbeds, figureMarkup, isolateFigure, nameDrawing } from "../src/figure-insert";
import { composeNote } from "../src/export/compose";
import { DEFAULT_PAGE_STYLE } from "../src/export/typeset";
import { imageCandidates, isExcalidrawTarget, isImageTarget } from "../src/export/image";
import { warningLines } from "../src/export-report";

test(`le nom d'une figure s'ecrit apres la barre verticale, nettoye de ce qui casserait le lien`, () => {
  assert.equal(figureMarkup(`plan.png`, `Plan du site`), `![[plan.png|Plan du site]]`);
  assert.equal(figureMarkup(`plan.png`, `  `), `![[plan.png]]`);
  assert.equal(cleanFigureName(`A|B [x]\nsuite`), `A-B -x- suite`);
});

test(`un dessin Excalidraw ajoute dans la note est retrouve, et recoit son nom en gardant sa taille`, () => {
  const before = `# T\n\n![[Ancien.excalidraw]]\n\nTexte`;
  const after = `# T\n\n![[Ancien.excalidraw]]\n\n![[Dessin 2026-10-05.excalidraw|300]]\n\nTexte`;
  assert.equal(drawingEmbeds(after).length, 2);
  const added = addedDrawing(before, after);
  assert.equal(added?.target, `Dessin 2026-10-05.excalidraw`);
  assert.equal(addedDrawing(before, before), null);
  const edit = nameDrawing(added!, `Schéma de principe`);
  const result = after.slice(0, edit.from) + edit.insert + after.slice(edit.to);
  assert.ok(result.includes(`![[Dessin 2026-10-05.excalidraw|Schéma de principe|300]]`));
  assert.equal(nameDrawing(added!, ``).insert, `![[Dessin 2026-10-05.excalidraw|300]]`);
});

test(`un dessin Excalidraw se lit par son export image`, () => {
  assert.ok(isExcalidrawTarget(`Dessin.excalidraw`) && isExcalidrawTarget(`Dessin.excalidraw.md`) && !isExcalidrawTarget(`plan.png`));
  assert.ok(isImageTarget(`Dessin.excalidraw`));
  assert.deepEqual(imageCandidates(`Dessin.excalidraw`), [`Dessin.excalidraw.svg`, `Dessin.excalidraw.png`]);
  assert.deepEqual(imageCandidates(`Dessin.excalidraw.md`), [`Dessin.excalidraw.svg`, `Dessin.excalidraw.png`]);
  assert.deepEqual(imageCandidates(`plan.png`), [`plan.png`]);
});

const inline = { ...DEFAULT_PAGE_STYLE, floats: `inline` as const };

test(`une figure sans nom n'a ni legende ni numero, une figure nommee est numerotee`, () => {
  const c = composeNote(`# T\n\n![[a.excalidraw]]\n\n![[b.excalidraw|Schéma B]]\n\n![[c.png|Plan C]]`, `N.md`, undefined, inline);
  const captions = c.typeset.rows.filter((r) => r.kind === `caption`).map((r) => r.text.replace(/[\u00a0\u202f]/g, ` `));
  assert.deepEqual(captions, [`Figure 1 : Schéma B`, `Figure 2 : Plan C`]);
});

test(`la legende peut se placer au-dessus de la figure`, () => {
  const kinds = (position: `below` | `above`): string[] => composeNote(`# T\n\n![[b.excalidraw|Schéma B]]`, `N.md`, undefined, { ...inline, figureCaption: position }).typeset.rows.map((r) => r.kind);
  const below = kinds(`below`);
  const above = kinds(`above`);
  assert.ok(below.indexOf(`caption`) > below.indexOf(`figure`));
  assert.ok(above.indexOf(`caption`) < above.indexOf(`figure`));
});

test(`le compte rendu explique comment obtenir l'export image d'un dessin Excalidraw`, () => {
  const lines = warningLines([`image:Schema.excalidraw`, `image:plan.png`]);
  assert.ok(lines[0].includes(`Excalidraw`) && lines[0].includes(`Schema.excalidraw`));
  assert.ok(lines[1].includes(`plan.png`) && !lines[1].includes(`Excalidraw`));
});

test(`un dessin insere au milieu d'une ligne est mis seul sur sa ligne`, () => {
  const text = `Voir le schéma ![[Dessin.excalidraw]] ci-dessous.\nSuite`;
  const e = drawingEmbeds(text)[0];
  const edit = isolateFigure(text, nameDrawing(e, `Schéma`));
  const result = text.slice(0, edit.from) + edit.insert + text.slice(edit.to);
  assert.equal(result, `Voir le schéma\n\n![[Dessin.excalidraw|Schéma]]\n\nci-dessous.\nSuite`);
  const alone = `Avant\n\n![[Dessin.excalidraw]]\n\nAprès`;
  const e2 = drawingEmbeds(alone)[0];
  const edit2 = isolateFigure(alone, nameDrawing(e2, `Nom`));
  assert.equal(alone.slice(0, edit2.from) + edit2.insert + alone.slice(edit2.to), `Avant\n\n![[Dessin.excalidraw|Nom]]\n\nAprès`);
});

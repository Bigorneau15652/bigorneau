// Sujets flottants : sujets de notes libres, ecrits en fin de note dans une zone repérée que la note masque. Ils ne sont
// rattaches a aucun chapitre. Chaque fonction prend le texte de la note et renvoie le nouveau texte.
import { applyLineEdits, branchEnd, flattenDoc, isFloatRoot, MmDoc, nodeByKey, parseNote, renderHeading, splitLines } from "./model";
import { extractBranches, EditResult, insertBranches, deleteNodes } from "./edit";

export interface FloatPos {
  x?: number;
  y?: number;
}

const round = (v: number): number => Math.round(v * 10) / 10;

// Ligne de repere d'un sujet flottant.
export function formatMarker(pos: FloatPos): string {
  const body: Record<string, number> = {};
  if (pos.x !== undefined) body.x = round(pos.x);
  if (pos.y !== undefined) body.y = round(pos.y);
  return Object.keys(body).length > 0 ? `%% mmw-float ${JSON.stringify(body)} %%` : `%% mmw-float %%`;
}

// Ajoute un bloc a la fin de la zone flottante (ou ouvre la zone) et renvoie le nouveau texte.
function appendBlock(text: string, eol: string, marker: string, body: string): string {
  const base = text === `` || /[\r\n]$/.test(text) ? text : text + eol;
  const block = body.replace(/\r?\n?$/, ``);
  return `${base}${marker}${eol}${block}${eol}`;
}

// Cree un sujet flottant vide (titre de niveau `level`), place en (x, y). Renvoie la cle du nouveau sujet.
export function createFloat(text: string, fileName: string, level: number, pos: FloatPos, title = ``): EditResult | null {
  const eol = parseNote(text, fileName).eol;
  const lvl = Math.max(1, Math.min(6, Math.round(level)));
  const next = appendBlock(text, eol, formatMarker(pos), renderHeading(lvl, title, ``));
  const doc = parseNote(next, fileName);
  const key = `f${doc.floats.length - 1}`;
  return doc.floats.length > 0 ? { text: next, key } : null;
}

// Deplace un sujet flottant : seul son repere change.
export function moveFloat(text: string, fileName: string, key: string, pos: FloatPos): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  if (!node || !node.float || !isFloatRoot(key)) return null;
  return { text: applyLineEdits(text, [{ kind: `replace`, line: node.float.markerLine, text: formatMarker(pos) }], doc.eol), key };
}

// Supprime un sujet flottant complet : repere, titre, texte et sous-titres. La cle renvoyee est celle de la racine.
export function deleteFloat(text: string, fileName: string, key: string): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  if (!node || !node.float || !isFloatRoot(key)) return null;
  const lines = splitLines(text);
  lines.splice(node.float.markerLine, node.float.end - node.float.markerLine);
  return { text: lines.join(``), key: `r` };
}

// Transforme un titre de la carte (avec sa descendance) en sujet flottant, place en (x, y).
export function branchToFloat(text: string, fileName: string, key: string, pos: FloatPos): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  if (!node || key === `r` || isFloatKey2(key)) return null;
  const md = extractBranches(text, fileName, [key]);
  if (md === null) return null;
  const removed = deleteNodes(text, fileName, [key]);
  if (!removed) return null;
  const next = appendBlock(removed.text, doc.eol, formatMarker(pos), md.replace(/\n/g, doc.eol));
  const after = parseNote(next, fileName);
  if (after.floats.length !== doc.floats.length + 1 || flattenDoc(after).length !== flattenDoc(doc).length) return null;
  return { text: next, key: `f${after.floats.length - 1}` };
}

const isFloatKey2 = (key: string): boolean => /^f\d/.test(key);

// Fait entrer un sujet flottant dans la carte, sous `parentKey` au rang `index` : son niveau de titre (et celui de ses
// sous-titres) s'adapte a l'endroit ou il est depose. Renvoie null si le niveau 6 serait depasse.
export function floatToBranch(text: string, fileName: string, key: string, parentKey: string, index: number): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  if (!node || !node.float || !isFloatRoot(key) || isFloatKey2(parentKey)) return null;
  const lines = splitLines(text);
  const md = lines.slice(node.float.markerLine + 1, node.float.end).join(``).replace(/\r\n?/g, `\n`);
  const kept = [...lines];
  kept.splice(node.float.markerLine, node.float.end - node.float.markerLine);
  const without = kept.join(``);
  const done = insertBranches(without, fileName, parentKey, index, md);
  if (!done) return null;
  const after = parseNote(done.text, fileName);
  if (flattenDoc(after).length !== flattenDoc(doc).length) return null;
  return done;
}

// Dernier ligne exclue de la branche d'un sujet flottant (pour afficher son contenu dans la note).
export function floatEnd(doc: MmDoc, key: string): number | null {
  const node = nodeByKey(doc, key);
  return node ? branchEnd(node) : null;
}

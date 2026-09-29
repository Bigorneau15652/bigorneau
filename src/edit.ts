// Modifications de la structure faites depuis la carte : creer, renommer, supprimer.
// Chaque operation prend le texte de la note et renvoie le nouveau texte, sans rien ecrire elle-meme :
// la vue applique le resultat dans l'editeur d'Obsidian (une seule transaction, donc annulable).
import { applyLineEdits, branchEnd, flattenDoc, MmDoc, MmNode, nodeAtLine, nodeByKey, parseNote, renderHeading, splitLines } from "./model";

export interface EditResult {
  text: string;
  // Cle du noeud a selectionner apres la modification (null : aucun).
  key: string | null;
}

// Petit rapport sur ce qu'une suppression retire, montre dans la fenetre de confirmation.
export interface DeletionReport {
  nodes: number;
  subtitles: number;
  words: number;
  titles: string[];
}

export const MAX_LEVEL = 6;

// Titre nettoye : une seule ligne, sans espaces autour.
export function cleanTitle(title: string): string {
  return title.replace(/[\r\n]+/g, ` `).trim();
}

// Niveau du titre a creer pour un enfant ou un frere du noeud.
export function newLevel(doc: MmDoc, key: string, where: `child` | `sibling`): number | null {
  const node = nodeByKey(doc, key);
  if (!node) return null;
  const isRoot = node === doc.root;
  let level: number;
  if (where === `sibling` && !isRoot) level = node.level;
  else if (node.children.length > 0) level = node.children[0].level;
  else level = isRoot ? (doc.hasGeneralTitle ? 2 : 1) : node.level + 1;
  return level > MAX_LEVEL ? null : level;
}

// Ajoute un titre vide a la fin de la branche du noeud : comme dernier enfant, ou comme frere juste apres.
// La racine n'a pas de frere : un frere de la racine devient son dernier enfant.
export function addNode(text: string, fileName: string, key: string, where: `child` | `sibling`): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  const level = newLevel(doc, key, where);
  if (!node || level === null || node.endLine === undefined) return null;
  const at = branchEnd(node);
  const next = applyLineEdits(text, [{ kind: `insert`, line: at, text: renderHeading(level, ``, ``) }], doc.eol);
  const created = flattenDoc(parseNote(next, fileName)).find((e) => e.node.line === at);
  return { text: next, key: created ? created.key : null };
}

// Change le titre d'un noeud. Le titre de la racine sans titre general est le nom du fichier : refuse.
export function renameTitle(text: string, fileName: string, key: string, title: string): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  if (!node || node.line === undefined || node.level === 0) return null;
  const next = applyLineEdits(text, [{ kind: `replace`, line: node.line, text: renderHeading(node.level, cleanTitle(title), ``) }], doc.eol);
  return { text: next, key };
}

// Noeuds a supprimer : la racine est exclue, ainsi que les noeuds dont un ancetre est deja dans la liste.
function topLevelTargets(doc: MmDoc, keys: string[]): { key: string; node: MmNode }[] {
  const wanted = new Set(keys.filter((k) => k !== `r`));
  return flattenDoc(doc).filter((e) => {
    if (!wanted.has(e.key)) return false;
    const parts = e.key.split(`.`);
    for (let i = 1; i < parts.length; i++) if (wanted.has(parts.slice(0, i).join(`.`))) return false;
    return true;
  });
}

function countWords(lines: string[]): number {
  let words = 0;
  for (const line of lines) {
    const t = line.replace(/^#{1,6}(\s|$)/, ``).trim();
    if (t !== `` && !/^%%.*%%$/.test(t)) words += t.split(/\s+/).length;
  }
  return words;
}

export function describeDeletion(text: string, fileName: string, keys: string[]): DeletionReport {
  const doc = parseNote(text, fileName);
  const lines = splitLines(text);
  const targets = topLevelTargets(doc, keys);
  let subtitles = 0;
  let words = 0;
  for (const t of targets) {
    const count = (n: MmNode): number => n.children.reduce((sum, c) => sum + 1 + count(c), 0);
    subtitles += count(t.node);
    words += countWords(lines.slice(t.node.line ?? 0, branchEnd(t.node)));
  }
  return { nodes: targets.length, subtitles, words, titles: targets.map((t) => t.node.title || `(sans titre)`) };
}

// Supprime les noeuds avec toute leur descendance. La selection passe au frere precedent, sinon au parent.
export function deleteNodes(text: string, fileName: string, keys: string[]): EditResult | null {
  const doc = parseNote(text, fileName);
  const targets = topLevelTargets(doc, keys);
  if (targets.length === 0) return null;
  const ranges = targets.map((t) => ({ from: t.node.line ?? 0, to: branchEnd(t.node) }));

  // Noeud a retenir : voisin du premier noeud supprime, repere par sa ligne avant la suppression.
  const first = targets[0];
  const parts = first.key.split(`.`);
  const index = Number(parts[parts.length - 1]);
  const parentKey = parts.slice(0, -1).join(`.`);
  const removed = new Set(targets.map((t) => t.key));
  const previousKey = index > 0 ? `${parentKey}.${index - 1}` : ``;
  const keep = nodeByKey(doc, previousKey && !removed.has(previousKey) ? previousKey : parentKey);
  const keepLine = keep?.line ?? 0;
  const shift = ranges.filter((r) => r.to <= keepLine).reduce((sum, r) => sum + (r.to - r.from), 0);

  const lines = splitLines(text);
  for (const r of [...ranges].sort((a, b) => b.from - a.from)) lines.splice(r.from, r.to - r.from);
  const next = lines.join(``);
  const kept = parseNote(next, fileName);
  return { text: next, key: nodeAtLine(kept, keepLine - shift).key };
}

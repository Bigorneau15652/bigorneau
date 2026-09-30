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
  else level = node.level + 1;
  return level > MAX_LEVEL ? null : level;
}

// Ajoute un titre vide a la fin de la branche du noeud : comme dernier enfant, ou comme frere juste apres.
// La racine (le nom de la note) n'a pas de frere : depuis elle, le nouveau titre est cree au debut de la note, juste
// apres le texte d'introduction, et devient le premier titre de premier niveau.
export function addNode(text: string, fileName: string, key: string, where: `child` | `sibling`): EditResult | null {
  const doc = parseNote(text, fileName);
  const node = nodeByKey(doc, key);
  const level = newLevel(doc, key, where);
  if (!node || level === null || node.endLine === undefined) return null;
  const at = node === doc.root ? node.endLine : branchEnd(node);
  const next = applyLineEdits(text, [{ kind: `insert`, line: at, text: renderHeading(level, ``, ``) }], doc.eol);
  const created = flattenDoc(parseNote(next, fileName)).find((e) => e.key !== `r` && e.node.line === at);
  return { text: next, key: created ? created.key : null };
}

// Change le titre d'un noeud. Le titre de la racine est le nom du fichier : refuse.
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

// ---------------------------------------------------------------- deplacement

export type MoveDir = `up` | `down` | `left` | `right`;

export interface MoveTarget {
  // Cle du nouveau parent dans le document d'origine, et rang parmi ses enfants (la case deplacee non comprise).
  parentKey: string;
  index: number;
}

function isInside(key: string, ancestor: string): boolean {
  return key === ancestor || key.startsWith(`${ancestor}.`);
}

// Niveau de titre que prend la case deplacee sous ce parent, au rang voulu. Les enfants d'un meme parent ont des
// niveaux qui ne montent jamais d'un enfant au suivant : la case prend le niveau de l'enfant qui la precede (elle
// reste ainsi son frere), sinon celui de l'enfant qui la suit, sinon un de plus que le parent. Cela reste juste
// meme quand la note saute des niveaux (un titre 3 suivi d'un titre 5).
function levelAt(parent: MmNode, moved: MmNode, rank: number): number {
  const others = parent.children.filter((c) => c !== moved);
  const r = Math.max(0, Math.min(rank, others.length));
  if (r > 0) return others[r - 1].level;
  if (others.length > 0) return others[0].level;
  return parent.level + 1;
}

function branchMaxLevel(n: MmNode): number {
  return Math.max(n.level, ...n.children.map(branchMaxLevel));
}

function branchNodes(n: MmNode): MmNode[] {
  return [n, ...n.children.flatMap(branchNodes)];
}

// Destination d'un deplacement au clavier (fleches) : monter ou descendre parmi les freres, entrer dans le
// frere precedent, ou sortir apres le parent.
export function arrowTarget(doc: MmDoc, key: string, dir: MoveDir): MoveTarget | null {
  if (key === `r`) return null;
  const parts = key.split(`.`);
  const index = Number(parts.pop());
  const parentKey = parts.join(`.`);
  const parent = nodeByKey(doc, parentKey);
  if (!parent) return null;
  if (dir === `up`) return index > 0 ? { parentKey, index: index - 1 } : null;
  if (dir === `down`) return index < parent.children.length - 1 ? { parentKey, index: index + 1 } : null;
  if (dir === `right`) {
    return index > 0 ? { parentKey: `${parentKey}.${index - 1}`, index: parent.children[index - 1].children.length } : null;
  }
  if (parentKey === `r`) return null;
  const up = parentKey.split(`.`);
  const parentIndex = Number(up.pop());
  return { parentKey: up.join(`.`), index: parentIndex + 1 };
}

// Traduit une position de depot (juste apres la case affichee `afterKey`, a la profondeur voulue) en parent et rang.
// La profondeur va de 1 a la profondeur de la case plus un ; `afterCollapsed` : la case est repliee, le depot
// comme sous-titre se fait alors apres ses enfants caches.
export function dropToParentIndex(doc: MmDoc, movedKey: string, afterKey: string, depth: number, afterCollapsed: boolean): MoveTarget | null {
  const after = nodeByKey(doc, afterKey);
  const moved = nodeByKey(doc, movedKey);
  if (!after) return null;
  const parts = afterKey.split(`.`);
  const afterDepth = parts.length - 1;
  if (depth < 1 || depth > afterDepth + 1) return null;
  if (depth === afterDepth + 1) {
    const others = after.children.filter((c) => c !== moved).length;
    return { parentKey: afterKey, index: afterCollapsed ? others : 0 };
  }
  const parentKey = parts.slice(0, depth).join(`.`);
  const parent = nodeByKey(doc, parentKey);
  if (!parent) return null;
  const carrier = Number(parts[depth]);
  let index = 0;
  for (let i = 0; i <= carrier; i++) if (parent.children[i] !== moved) index++;
  return { parentKey, index };
}

function countNodes(n: MmNode): number {
  return branchNodes(n).length;
}

// Deplace un titre avec toute sa descendance sous un nouveau parent, en ajustant les niveaux de titre de la branche.
// Renvoie null si le deplacement est impossible (niveau 6 depasse, destination dans la branche elle-meme).
export function moveNode(text: string, fileName: string, key: string, parentKey: string, index: number): EditResult | null {
  if (key === `r` || isInside(parentKey, key)) return null;
  const doc = parseNote(text, fileName);
  const moved = nodeByKey(doc, key);
  const parent = nodeByKey(doc, parentKey);
  if (!moved || !parent || moved.line === undefined || parent.endLine === undefined) return null;

  const others = parent.children.filter((c) => c !== moved);
  const rank = Math.max(0, Math.min(index, others.length));
  const level = levelAt(parent, moved, index);
  const delta = level - moved.level;
  if (level < 1 || branchMaxLevel(moved) + delta > MAX_LEVEL) return null;

  const from = moved.line;
  const to = branchEnd(moved);
  const length = to - from;
  let at: number;
  if (rank < others.length) at = others[rank].line ?? parent.endLine;
  else if (others.length > 0) at = branchEnd(others[others.length - 1]);
  else at = parent.endLine;

  const lines = splitLines(text);
  const block = lines.slice(from, to);
  if (delta !== 0) {
    for (const n of branchNodes(moved)) {
      const i = (n.line ?? from) - from;
      block[i] = block[i].replace(/^#{1,6}/, `#`.repeat(n.level + delta));
    }
  }
  if (block.length > 0 && !/[\r\n]$/.test(block[block.length - 1])) block[block.length - 1] += doc.eol;
  lines.splice(from, length);
  const insertAt = at >= to ? at - length : at;
  if (insertAt >= lines.length && lines.length > 0 && !/[\r\n]$/.test(lines[lines.length - 1])) lines[lines.length - 1] += doc.eol;
  lines.splice(insertAt, 0, ...block);
  const next = lines.join(``);

  // Controle : la case doit se retrouver sous le bon parent, au bon rang, avec la meme descendance.
  const after = parseNote(next, fileName);
  const flat = flattenDoc(after);
  const entry = flat.find((e) => e.key !== `r` && e.node.line === insertAt);
  if (!entry || flat.length !== flattenDoc(doc).length || countNodes(entry.node) !== countNodes(moved)) return null;
  const parts = entry.key.split(`.`);
  const newParent = nodeByKey(after, parts.slice(0, -1).join(`.`));
  if (!newParent || newParent.children.indexOf(entry.node) !== rank) return null;
  const expectedLine = parent.line !== undefined && parent.line > from ? parent.line - length : parent.line;
  if (parent === doc.root ? newParent !== after.root : newParent.line !== expectedLine) return null;
  return { text: next, key: entry.key };
}

export interface MovePreview {
  doc: MmDoc;
  // Noeud du document d'apercu -> noeud du document d'origine.
  origin: Map<MmNode, MmNode>;
  // Cle de la case deplacee dans le document d'apercu.
  key: string;
}

function cloneTree(n: MmNode, origin: Map<MmNode, MmNode>, skip: MmNode | null): MmNode {
  const copy: MmNode = { ...n, children: [] };
  origin.set(copy, n);
  for (const c of n.children) if (c !== skip) copy.children.push(cloneTree(c, origin, skip));
  return copy;
}

// Document tel qu'il serait apres le deplacement, pour l'afficher pendant le glisser. Ne modifie pas l'original.
export function previewMove(doc: MmDoc, key: string, parentKey: string, index: number): MovePreview | null {
  if (key === `r` || isInside(parentKey, key)) return null;
  const moved = nodeByKey(doc, key);
  const parent = nodeByKey(doc, parentKey);
  if (!moved || !parent) return null;
  const level = levelAt(parent, moved, index);
  const delta = level - moved.level;
  if (level < 1 || branchMaxLevel(moved) + delta > MAX_LEVEL) return null;

  const origin = new Map<MmNode, MmNode>();
  const root = cloneTree(doc.root, origin, moved);
  let parentCopy: MmNode | undefined;
  for (const [copy, orig] of origin) if (orig === parent) parentCopy = copy;
  if (!parentCopy) return null;
  const movedCopy = cloneTree(moved, origin, null);
  for (const n of branchNodes(movedCopy)) n.level += delta;
  parentCopy.children.splice(Math.max(0, Math.min(index, parentCopy.children.length)), 0, movedCopy);
  const preview: MmDoc = { ...doc, root };
  const found = flattenDoc(preview).find((e) => e.node === movedCopy);
  return found ? { doc: preview, origin, key: found.key } : null;
}

// ---------------------------------------------------------------- copier, coller, dupliquer

// Texte Markdown des titres (avec leurs sous-titres, leurs textes et leurs commentaires de style), dans l'ordre de la note.
// La racine n'en fait pas partie. Renvoie null s'il n'y a rien a copier.
export function extractBranches(text: string, fileName: string, keys: string[]): string | null {
  const doc = parseNote(text, fileName);
  const targets = topLevelTargets(doc, keys);
  if (targets.length === 0) return null;
  const lines = splitLines(text);
  return targets
    .map((t) => {
      const chunk = lines.slice(t.node.line ?? 0, branchEnd(t.node)).join(``);
      return /[\r\n]$/.test(chunk) ? chunk : `${chunk}${doc.eol}`;
    })
    .join(``)
    .replace(/\r\n?/g, `\n`);
}

// Nombre de titres contenus dans un texte Markdown (pour le message apres une copie).
export function countHeadings(markdown: string): number {
  return flattenDoc(parseNote(markdown, `x.md`, { frontmatter: false })).length - 1;
}

// Insere des titres Markdown (copies avec extractBranches ou venus d'ailleurs) comme enfants du parent, au rang voulu.
// Les niveaux de titre sont ajustes : chaque titre colle prend le niveau de ses nouveaux freres, avec sa descendance.
// Renvoie null si le texte ne commence pas par un titre ou si le niveau 6 serait depasse.
export function insertBranches(text: string, fileName: string, parentKey: string, index: number, markdown: string): EditResult | null {
  const doc = parseNote(text, fileName);
  const parent = nodeByKey(doc, parentKey);
  if (!parent || parent.endLine === undefined) return null;
  const md = markdown.replace(/\r\n?/g, `\n`);
  const pasted = parseNote(md, `x.md`, { frontmatter: false });
  if (pasted.root.children.length === 0 || pasted.root.body.trim() !== ``) return null;

  const siblings = parent.children;
  const rank = Math.max(0, Math.min(index, siblings.length));
  const level = levelAt(parent, {} as MmNode, rank);
  const source = splitLines(md);
  const block: string[] = [];
  let total = 0;
  for (const top of pasted.root.children) {
    const delta = level - top.level;
    if (level < 1 || branchMaxLevel(top) + delta > MAX_LEVEL) return null;
    const part = source.slice(top.line ?? 0, branchEnd(top));
    for (const n of branchNodes(top)) {
      const i = (n.line ?? 0) - (top.line ?? 0);
      part[i] = part[i].replace(/^#{1,6}/, `#`.repeat(n.level + delta));
    }
    block.push(...part);
    total += branchNodes(top).length;
  }
  const inserted = block.map((l) => l.replace(/\r?\n$/, ``) + doc.eol);

  let at: number;
  if (rank < siblings.length) at = siblings[rank].line ?? parent.endLine;
  else if (siblings.length > 0) at = branchEnd(siblings[siblings.length - 1]);
  else at = parent.endLine;

  const lines = splitLines(text);
  if (at >= lines.length && lines.length > 0 && !/[\r\n]$/.test(lines[lines.length - 1])) lines[lines.length - 1] += doc.eol;
  lines.splice(at, 0, ...inserted);
  const next = lines.join(``);

  // Controle : les titres collés sont freres, au bon rang, sous le bon parent.
  const after = parseNote(next, fileName);
  const flat = flattenDoc(after);
  const entry = flat.find((e) => e.key !== `r` && e.node.line === at);
  if (!entry || flat.length !== flattenDoc(doc).length + total) return null;
  const newParent = nodeByKey(after, entry.key.split(`.`).slice(0, -1).join(`.`));
  if (!newParent || newParent.children.indexOf(entry.node) !== rank) return null;
  if (newParent.children.length !== siblings.length + pasted.root.children.length) return null;
  if (parent === doc.root ? newParent !== after.root : newParent.line !== parent.line) return null;
  return { text: next, key: entry.key };
}

// Duplique les titres avec leur descendance, chacun juste apres l'original. La selection passe au double du premier.
export function duplicateNodes(text: string, fileName: string, keys: string[]): EditResult | null {
  const targets = topLevelTargets(parseNote(text, fileName), keys);
  if (targets.length === 0) return null;
  let current = text;
  let firstKey: string | null = null;
  // Du dernier au premier : une insertion ne change pas les cles des titres qui la precedent.
  for (let i = targets.length - 1; i >= 0; i--) {
    const parts = targets[i].key.split(`.`);
    const index = Number(parts.pop());
    const markdown = extractBranches(current, fileName, [targets[i].key]);
    const done = markdown === null ? null : insertBranches(current, fileName, parts.join(`.`), index + 1, markdown);
    if (!done) return null;
    current = done.text;
    if (i === 0) firstKey = done.key;
  }
  return { text: current, key: firstKey };
}

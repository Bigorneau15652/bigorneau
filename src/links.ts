// Liens entre titres : un lien Obsidian vers un titre, ecrit au debut du paragraphe d'un titre, devient une fleche sur la carte.
//   [[Nom de la note#Titre cible|Lien vers Titre cible]]
// Un lien vers un titre de la meme note relie deux cases ; un lien vers une autre note ouvre la carte de cette note.
import { applyLineEdits, flattenDoc, LineEdit, MmDoc, nodeByKey } from "./model";

export interface MapLink {
  // Cle du titre de depart et numero de la ligne du lien dans le fichier (a partir de 0).
  from: string;
  line: number;
  // Nom de la note visee (vide : la note elle-meme) et titre vise.
  note: string;
  heading: string;
  // Vrai si le lien vise une autre note.
  external: boolean;
  // Cle du titre vise dans cette carte (liens internes) ; null si le titre n'existe pas ou pour une autre note.
  to: string | null;
}

// Ligne qui ne contient qu'un lien vers un titre (les liens vers un bloc, [[Note#^id]], sont ecartes).
const LINK_LINE = /^\s*\[\[([^\]|#]*)#([^\]|^#][^\]|]*?)(?:\|[^\]]*)?\]\]\s*$/;

// Un titre ne peut pas contenir [ ] # | ^ dans un lien : Obsidian les remplace par des espaces.
export function linkHeading(title: string): string {
  return title.replace(/[[\]#|^]/g, ` `).replace(/\s+/g, ` `).trim();
}

export function sameHeading(a: string, b: string): boolean {
  return linkHeading(a).toLowerCase() === linkHeading(b).toLowerCase();
}

function baseName(fileName: string): string {
  return fileName.replace(/^.*\//, ``).replace(/\.md$/i, ``);
}

export function formatLink(noteName: string, heading: string): string {
  const h = linkHeading(heading);
  return `[[${noteName}#${h}|Lien vers ${h}]]`;
}

// Lignes de lien situees au debut du texte d'un titre, juste apres le titre et son commentaire de style.
function leadingLinkLines(doc: MmDoc, key: string): { line: number; match: RegExpExecArray }[] {
  const node = nodeByKey(doc, key);
  if (!node || node.line === undefined || key === `r`) return [];
  const body = node.body.split(/\r\n|\n|\r/);
  const out: { line: number; match: RegExpExecArray }[] = [];
  let k = 0;
  // La premiere ligne du texte peut etre le commentaire de style du plugin.
  if (node.metaLine !== undefined) k = 1;
  for (; k < body.length; k++) {
    const m = LINK_LINE.exec(body[k]);
    if (!m) break;
    out.push({ line: node.line + 1 + k, match: m });
  }
  return out;
}

// Tous les liens de la carte, dans l'ordre des titres.
export function parseLinks(doc: MmDoc, fileName: string): MapLink[] {
  const self = baseName(fileName).toLowerCase();
  const flat = flattenDoc(doc).filter((e) => e.key !== `r`);
  const out: MapLink[] = [];
  for (const { key } of flat) {
    for (const { line, match } of leadingLinkLines(doc, key)) {
      const note = match[1].trim();
      const heading = match[2].trim();
      const external = note !== `` && note.toLowerCase() !== self;
      const target = external ? null : flat.find((e) => e.key !== key && sameHeading(e.node.title, heading));
      out.push({ from: key, line, note, heading, external, to: target ? target.key : null });
    }
  }
  return out;
}

// Ecrit un lien sous le titre de depart, apres ceux qui s'y trouvent deja. Renvoie null si le titre n'existe pas.
export function insertLink(text: string, doc: MmDoc, fromKey: string, noteName: string, heading: string): string | null {
  const node = nodeByKey(doc, fromKey);
  if (!node || node.line === undefined || fromKey === `r` || linkHeading(heading) === ``) return null;
  const existing = leadingLinkLines(doc, fromKey);
  const at = existing.length > 0 ? existing[existing.length - 1].line + 1 : (node.metaLine ?? node.line) + 1;
  const edit: LineEdit = { kind: `insert`, line: at, text: formatLink(noteName, heading) };
  return applyLineEdits(text, [edit], doc.eol);
}

// Retire la ligne d'un lien.
export function removeLink(text: string, doc: MmDoc, link: MapLink): string {
  return applyLineEdits(text, [{ kind: `delete`, line: link.line, text: `` }], doc.eol);
}

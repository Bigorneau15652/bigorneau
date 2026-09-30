// Liens entre titres : un lien Obsidian vers un titre, ecrit au debut du paragraphe d'un titre, devient une fleche sur la carte.
//   [[Nom de la note#Titre cible|Lien vers Titre cible]]
// Un lien vers un titre de la meme note relie deux cases ; un lien vers une autre note ouvre la carte de cette note.
import { applyLineEdits, flattenDoc, LineEdit, MmDoc, nodeByKey } from "./model";

export interface MapLink {
  // Cle du titre de depart et numero de la ligne du lien dans le fichier (a partir de 0).
  from: string;
  line: number;
  // Nom de la note visee (vide : la note elle-meme) et titre vise (null : la note entiere).
  note: string;
  heading: string | null;
  // Vrai si le lien vise une autre note.
  external: boolean;
  // Cle du titre vise dans cette carte (liens internes) ; null si le titre n'existe pas ou pour une autre note.
  to: string | null;
}

// Ligne qui ne contient qu'un lien vers une note ou vers un de ses titres (les liens vers un bloc, [[Note#^id]], sont ecartes).
const LINK_LINE = /^\s*\[\[([^\]|#]*)(?:#([^\]|^#][^\]|]*?))?(?:\|[^\]]*)?\]\]\s*$/;

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

export function formatLink(noteName: string, heading: string | null): string {
  if (heading === null) return `[[${noteName}|Lien vers ${noteName.replace(/^.*\//, ``)}]]`;
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
    // Un lien sans note ni titre ([[]], [[|texte]]) n'est pas un lien.
    if (!m || (m[1].trim() === `` && m[2] === undefined)) break;
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
      const heading = match[2] === undefined ? null : match[2].trim();
      const external = note !== `` && note.toLowerCase() !== self;
      // Un lien vers la note elle-meme, sans titre, ne relie aucun titre.
      if (!external && heading === null) continue;
      const target = external || heading === null ? null : flat.find((e) => e.key !== key && sameHeading(e.node.title, heading));
      out.push({ from: key, line, note, heading, external, to: target ? target.key : null });
    }
  }
  return out;
}

// Ecrit un lien sous le titre de depart, apres ceux qui s'y trouvent deja. Renvoie null si le titre n'existe pas.
export function insertLink(text: string, doc: MmDoc, fromKey: string, noteName: string, heading: string | null): string | null {
  const node = nodeByKey(doc, fromKey);
  if (!node || node.line === undefined || fromKey === `r`) return null;
  if (heading === null ? noteName.trim() === `` : linkHeading(heading) === ``) return null;
  const existing = leadingLinkLines(doc, fromKey);
  const at = existing.length > 0 ? existing[existing.length - 1].line + 1 : (node.metaLine ?? node.line) + 1;
  const edit: LineEdit = { kind: `insert`, line: at, text: formatLink(noteName, heading) };
  return applyLineEdits(text, [edit], doc.eol);
}

// Retire la ligne d'un lien.
export function removeLink(text: string, doc: MmDoc, link: MapLink): string {
  return applyLineEdits(text, [{ kind: `delete`, line: link.line, text: `` }], doc.eol);
}

// Lien web ou video integree trouve dans le texte d'un titre.
export interface WebLink {
  url: string;
  label: string;
}

function hostLabel(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === `/` ? `` : u.pathname;
    const text = u.hostname.replace(/^www\./, ``) + path;
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
  } catch {
    return url;
  }
}

// Adresses http et https du texte d'un titre : liens [texte](adresse), integrations ![](adresse) ou iframe, adresses entre
// chevrons ou ecrites telles quelles. Le commentaire du plugin et le code sont ignores.
export function webLinks(doc: MmDoc, key: string): WebLink[] {
  const node = nodeByKey(doc, key);
  if (!node || key === `r`) return [];
  const lines = node.body.split(/\r\n|\n|\r/);
  const out: WebLink[] = [];
  const seen = new Set<string>();
  const add = (url: string, label: string): void => {
    const clean = url.replace(/[.,;:!?]+$/, ``);
    if (!/^https?:\/\/[^\s]+$/i.test(clean) || seen.has(clean)) return;
    seen.add(clean);
    out.push({ url: clean, label: label.trim() || hostLabel(clean) });
  };
  let fence: string | null = null;
  lines.forEach((raw, i) => {
    if (i === 0 && node.metaLine !== undefined) return;
    const f = /^\s*(```+|~~~+)/.exec(raw);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    // Le code entre accents graves n'est pas un lien.
    let line = raw.replace(/`[^`]*`/g, (m) => ` `.repeat(m.length));
    const found: { at: number; url: string; label: string }[] = [];
    const take = (re: RegExp, pick: (m: string[]) => [string, string]): void => {
      line = line.replace(re, (...args) => {
        const m = args.slice(0, args.length - 2) as string[];
        const at = args[args.length - 2] as number;
        const [url, label] = pick(m);
        found.push({ at, url, label });
        return ` `.repeat(m[0].length);
      });
    };
    take(/!?\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/gi, (m) => [m[2], m[1]]);
    take(/\bsrc\s*=\s*["'](https?:\/\/[^"']+)["']/gi, (m) => [m[1], ``]);
    take(/<(https?:\/\/[^>\s]+)>/gi, (m) => [m[1], ``]);
    take(/https?:\/\/[^\s<>()[\]"']+/gi, (m) => [m[0], ``]);
    for (const f of found.sort((x, y) => x.at - y.at)) add(f.url, f.label);
  });
  return out;
}

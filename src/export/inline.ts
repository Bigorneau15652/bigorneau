// Export de haute qualite, etage 1 : mise en forme du texte a l'interieur d'un paragraphe (gras, italique, liens).
// Le Markdown en ligne est transforme en un texte ou chaque debut et fin de style est un repere (un caractere d'usage prive) ;
// la composition lit ces reperes pour choisir la police de chaque morceau de mot. Les liens web gardent leur adresse dans
// une table, referencee par un numero.
// Ce module ne depend pas d'Obsidian : il se teste avec node --test.
import { INLINE_MATH_RE, MathAsset } from "./math";

export const BOLD_ON = ``;
export const BOLD_OFF = ``;
export const ITALIC_ON = ``;
export const ITALIC_OFF = ``;
// Debut de lien : repere, numero du lien dans la table, repere de fin du numero.
export const LINK_ON = ``;
export const LINK_NUM_END = ``;
export const LINK_OFF = ``;

// Formule en ligne : repere, numero de la formule dans la table, repere de fin du numero.
export const MATH_ON = `\uE017`;
export const MATH_END = `\uE018`;

// Texte a mettre en forme : le texte repere, et les adresses des liens. Une adresse qui commence par # est un renvoi a un
// endroit du document (#hid:3 : titre numero 3, #b:plan : bloc d'identifiant plan).
export interface InlineText {
  text: string;
  links: string[];
  // Formules en ligne, dans l'ordre des reperes MATH_ON du texte.
  maths?: MathAsset[];
}

// Ce que la mise en forme doit savoir du document pour traiter les renvois internes ([[#Titre]], [[#^bloc]]).
export interface InlineContext {
  // Nom de la note (ses renvois s'ecrivent aussi [[Nom#Titre]]).
  noteName: string;
  // Ancre du titre dont le texte est `title`, si la note le contient parmi les titres exportes.
  headingAnchor(title: string): string | undefined;
  // Ancre et etiquette (Figure 1, Tableau 2) du bloc d'identifiant `id`.
  block(id: string): { anchor: string; label?: string } | undefined;
  // Numero de la page ou se trouve une ancre (connu apres une premiere mise en page).
  pageOf?(anchor: string): number | undefined;
  // Ajoute « (page N) » apres le texte des renvois.
  pageRefs: boolean;
  // Signale un renvoi qui ne mene nulle part.
  warn?(message: string): void;
  // Dessin de la formule en ligne ecrite $tex$, s'il est connu.
  math?(tex: string): MathAsset | undefined;
}

// Forme normalisee du texte d'un titre pour retrouver le titre vise par un renvoi (casse, signes et espaces ignores).
export function normalizeHeading(title: string): string {
  return plainOf(parseInline(title).text)
    .toLowerCase()
    .replace(/[#^\[\]|\\]/g, ` `)
    .replace(/\s+/g, ` `)
    .trim();
}

const CODE_ON = ``;
const CODE_OFF = ``;

// Les adresses du texte sont nettoyees de la ponctuation qui les termine.
const URL_TAIL = /[.,;:!?)\]'”»]+$/;

// Transforme le Markdown en ligne : liens [texte](adresse) et adresses nues, gras (** ou __), italique (* ou _), gras italique
// (***), code en ligne (garde son texte), images (retirees), liens internes [[note|texte]] (garde le texte), et laisse
// tels quels le barre ~~ et le surlignage ==, dont les signes disparaissent.
export function parseInline(source: string, ctx?: InlineContext): InlineText {
  const links: string[] = [];
  const codes: string[] = [];
  let s = source;

  // Le code en ligne est protege : son texte ne subit aucune autre transformation.
  s = s.replace(/`([^`]*)`/g, (_m, c: string) => {
    codes.push(c);
    return `${CODE_ON}${codes.length - 1}${CODE_OFF}`;
  });
  // Formules : le dessin est remplace par un repere ; sans dessin, le texte source est garde tel quel (et signale).
  const maths: MathAsset[] = [];
  s = s.replace(INLINE_MATH_RE, (m: string, display: string | undefined, inline: string | undefined) => {
    const tex = (display ?? inline ?? ``).trim();
    const asset = ctx?.math?.(tex);
    if (!asset) {
      if (ctx?.math) ctx.warn?.(`formule:${tex}`);
      codes.push(m);
      return `${CODE_ON}${codes.length - 1}${CODE_OFF}`;
    }
    maths.push(asset);
    return `${MATH_ON}${maths.length - 1}${MATH_END}`;
  });
  // Images integrees ![[fichier]] et ![texte](adresse).
  s = s.replace(/!\[\[[^\]]*\]\]/g, ``).replace(/!\[([^\]]*)\]\([^)]*\)/g, `$1`);
  // Liens internes : renvois a un titre ou a un bloc de la note (cliquables), sinon le texte seul (alias, titre vise ou nom
  // de la note).
  s = s.replace(/\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (_m, file: string, heading: string | undefined, alias: string | undefined) => {
    const fallback = alias || (heading ?? ``).replace(/^\^/, ``) || (file.split(`/`).pop() ?? file);
    const sameNote = file === `` || (file.split(`/`).pop() ?? file).replace(/\.md$/i, ``).toLowerCase() === ctx?.noteName.toLowerCase();
    if (!ctx || !sameNote || (heading === undefined && file === ``)) return fallback;
    let anchor: string | undefined;
    let label: string | undefined;
    const block = heading !== undefined ? /\^([A-Za-z0-9-]+)$/.exec(heading) : null;
    if (block) {
      const b = ctx.block(block[1]);
      anchor = b?.anchor;
      label = b?.label;
    } else if (heading !== undefined) {
      anchor = ctx.headingAnchor(heading);
    }
    if (!anchor) {
      ctx.warn?.(`renvoi:${heading ?? file}`);
      return fallback;
    }
    let text = alias || label || (block ? block[1] : (heading as string));
    if (ctx.pageRefs) text += ` (page ${ctx.pageOf?.(anchor) ?? 0})`;
    links.push(`#${anchor}`);
    return `${LINK_ON}${links.length - 1}${LINK_NUM_END}${text}${LINK_OFF}`;
  });
  // Liens web : [texte](adresse "titre") ou adresse nue.
  s = s.replace(/\[([^\]]*)\]\(<?([^)\s>]*)>?(?:\s+"[^"]*")?\)|https?:\/\/[^\s<> -]+/g, (m: string, text: string | undefined, url: string | undefined) => {
    if (text !== undefined) {
      if (url === undefined || url === ``) return text;
      links.push(url);
      return `${LINK_ON}${links.length - 1}${LINK_NUM_END}${text}${LINK_OFF}`;
    }
    const tail = URL_TAIL.exec(m)?.[0] ?? ``;
    const clean = tail ? m.slice(0, m.length - tail.length) : m;
    links.push(clean);
    return `${LINK_ON}${links.length - 1}${LINK_NUM_END}${clean}${LINK_OFF}${tail}`;
  });
  // Emphase : gras italique, gras, italique. Le souligne n'ouvre ni ne ferme un style au milieu d'un mot.
  s = s
    .replace(/\*\*\*(?=\S)([^*]+?)(?<=\S)\*\*\*/g, `${BOLD_ON}${ITALIC_ON}$1${ITALIC_OFF}${BOLD_OFF}`)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, `${BOLD_ON}$1${BOLD_OFF}`)
    .replace(/(?<![\p{L}\d])__(?=\S)(.+?)(?<=\S)__(?![\p{L}\d])/gu, `${BOLD_ON}$1${BOLD_OFF}`)
    .replace(/\*(?=[^\s*])([^*]+?)(?<=[^\s*])\*/g, `${ITALIC_ON}$1${ITALIC_OFF}`)
    .replace(/(?<![\p{L}\d_])_(?=[^\s_])([^_]+?)(?<=[^\s_])_(?![\p{L}\d_])/gu, `${ITALIC_ON}$1${ITALIC_OFF}`)
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, `$1`)
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, `$1`);
  s = s.replace(new RegExp(`${CODE_ON}(\\d+)${CODE_OFF}`, `g`), (_m, i: string) => codes[Number(i)]);
  return { text: s, links, ...(maths.length > 0 ? { maths } : {}) };
}

// Texte brut d'un texte repere, pour les endroits qui n'affichent pas de mise en forme (signets, tableaux).
export function plainOf(text: string): string {
  return text
    .replace(new RegExp(`${LINK_ON}\\d+${LINK_NUM_END}|${MATH_ON}\\d+${MATH_END}`, `g`), ``)
    .replace(/[\uE010-\uE016]/g, ``);
}

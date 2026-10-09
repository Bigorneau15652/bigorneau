// Export de haute qualite, etage 1 : mise en forme du texte a l'interieur d'un paragraphe (gras, italique, liens).
// Le Markdown en ligne est transforme en un texte ou chaque debut et fin de style est un repere (un caractere d'usage prive) ;
// la composition lit ces reperes pour choisir la police de chaque morceau de mot. Les liens web gardent leur adresse dans
// une table, referencee par un numero.
// Ce module ne depend pas d'Obsidian : il se teste avec node --test.
import { findMath, MathAsset } from "./math";

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
    .replace(/[#^[\]|\\]/g, ` `)
    .replace(/\s+/g, ` `)
    .trim();
}

const CODE_ON = ``;
const CODE_OFF = ``;

// Les adresses du texte sont nettoyees de la ponctuation qui les termine.
const URL_TAIL = /[.,;:!?)\]'”»]+$/;

// Remplace, de gauche a droite, les passages qui commencent par `open` et que reconnait l'expression collante `re`, quand le
// caractere qui precede l'ouverture verifie `okBefore`. Les anciennes expressions a « lookbehind » faisaient cette verification
// elles-memes ; elle est faite ici a la main parce que les anciens iPhone et iPad ne savent pas les lire.
function replaceAfter(text: string, open: string, re: RegExp, okBefore: (prev: string) => boolean, make: (m: RegExpExecArray) => string): string {
  let out = ``;
  let last = 0;
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf(open, i);
    if (at < 0) break;
    const prev = at > 0 ? (Array.from(text.slice(Math.max(0, at - 2), at)).pop() as string) : ``;
    re.lastIndex = at;
    const m = okBefore(prev) ? re.exec(text) : null;
    if (m) {
      out += text.slice(last, at) + make(m);
      last = at + m[0].length;
      i = last;
    } else {
      i = at + 1;
    }
  }
  return out + text.slice(last);
}

const NOT_WORD = (prev: string): boolean => prev === `` || !/[\p{L}\d]/u.test(prev);
const NOT_WORD_OR_UNDERSCORE = (prev: string): boolean => prev === `` || !/[\p{L}\d_]/u.test(prev);

// Emphase : gras italique, gras, italique, barre et surlignage. Le souligne n'ouvre ni ne ferme un style au milieu d'un mot. Le
// contenu d'un passage commence et finit par un caractere qui n'est pas une espace.
export function emphasize(text: string): string {
  let s = text;
  s = s.replace(/\*\*\*([^*\s](?:[^*]*[^*\s])?)\*\*\*/g, `${BOLD_ON}${ITALIC_ON}$1${ITALIC_OFF}${BOLD_OFF}`);
  s = s.replace(/\*\*(\S(?:.*?\S)??)\*\*/g, `${BOLD_ON}$1${BOLD_OFF}`);
  s = replaceAfter(s, `__`, /__(\S(?:.*?\S)??)__(?![\p{L}\d])/uy, NOT_WORD, (m) => `${BOLD_ON}${m[1]}${BOLD_OFF}`);
  s = s.replace(/\*([^\s*](?:[^*]*[^\s*])?)\*/g, `${ITALIC_ON}$1${ITALIC_OFF}`);
  s = replaceAfter(s, `_`, /_([^\s_](?:[^_]*[^\s_])?)_(?![\p{L}\d_])/uy, NOT_WORD_OR_UNDERSCORE, (m) => `${ITALIC_ON}${m[1]}${ITALIC_OFF}`);
  s = s.replace(/~~(\S(?:.*?\S)??)~~/g, `$1`);
  s = s.replace(/==(\S(?:.*?\S)??)==/g, `$1`);
  return s;
}

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
  {
    let out = ``;
    let last = 0;
    for (const m of findMath(s)) {
      out += s.slice(last, m.start);
      const tex = m.tex.trim();
      const asset = ctx?.math?.(tex);
      if (!asset) {
        if (ctx?.math) ctx.warn?.(`formule:${tex}`);
        codes.push(s.slice(m.start, m.end));
        out += `${CODE_ON}${codes.length - 1}${CODE_OFF}`;
      } else {
        maths.push(asset);
        out += `${MATH_ON}${maths.length - 1}${MATH_END}`;
      }
      last = m.end;
    }
    s = out + s.slice(last);
  }
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
    let text = alias || label || (block ? block[1] : heading);
    if (ctx.pageRefs) text += ` (page ${ctx.pageOf?.(anchor) ?? 0})`;
    links.push(`#${anchor}`);
    return `${LINK_ON}${links.length - 1}${LINK_NUM_END}${text}${LINK_OFF}`;
  });
  // Liens web : [texte](adresse "titre") ou adresse nue.
  s = s.replace(/\[([^\]]*)\]\(<?([^)\s>]*)>?(?:\s+"[^"]*")?\)|https?:\/\/[^\s<>\u00A0-]+/g, (m: string, text: string | undefined, url: string | undefined) => {
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
  s = emphasize(s);
  s = s.replace(new RegExp(`${CODE_ON}(\\d+)${CODE_OFF}`, `g`), (_m, i: string) => codes[Number(i)]);
  return { text: s, links, ...(maths.length > 0 ? { maths } : {}) };
}

// Texte brut d'un texte repere, pour les endroits qui n'affichent pas de mise en forme (signets, tableaux).
export function plainOf(text: string): string {
  return text
    .replace(new RegExp(`${LINK_ON}\\d+${LINK_NUM_END}|${MATH_ON}\\d+${MATH_END}`, `g`), ``)
    .replace(/[\uE010-\uE016]/g, ``);
}

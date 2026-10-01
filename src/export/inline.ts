// Export de haute qualite, etage 1 : mise en forme du texte a l'interieur d'un paragraphe (gras, italique, liens).
// Le Markdown en ligne est transforme en un texte ou chaque debut et fin de style est un repere (un caractere d'usage prive) ;
// la composition lit ces reperes pour choisir la police de chaque morceau de mot. Les liens web gardent leur adresse dans
// une table, referencee par un numero.
// Ce module ne depend pas d'Obsidian : il se teste avec node --test.

export const BOLD_ON = ``;
export const BOLD_OFF = ``;
export const ITALIC_ON = ``;
export const ITALIC_OFF = ``;
// Debut de lien : repere, numero du lien dans la table, repere de fin du numero.
export const LINK_ON = ``;
export const LINK_NUM_END = ``;
export const LINK_OFF = ``;

// Texte a mettre en forme : le texte repere, et les adresses des liens.
export interface InlineText {
  text: string;
  links: string[];
}

const CODE_ON = ``;
const CODE_OFF = ``;

// Les adresses du texte sont nettoyees de la ponctuation qui les termine.
const URL_TAIL = /[.,;:!?)\]'”»]+$/;

// Transforme le Markdown en ligne : liens [texte](adresse) et adresses nues, gras (** ou __), italique (* ou _), gras italique
// (***), code en ligne (garde son texte), images (retirees), liens internes [[note|texte]] (garde le texte), et laisse
// tels quels le barre ~~ et le surlignage ==, dont les signes disparaissent.
export function parseInline(source: string): InlineText {
  const links: string[] = [];
  const codes: string[] = [];
  let s = source;

  // Le code en ligne est protege : son texte ne subit aucune autre transformation.
  s = s.replace(/`([^`]*)`/g, (_m, c: string) => {
    codes.push(c);
    return `${CODE_ON}${codes.length - 1}${CODE_OFF}`;
  });
  // Images integrees ![[fichier]] et ![texte](adresse).
  s = s.replace(/!\[\[[^\]]*\]\]/g, ``).replace(/!\[([^\]]*)\]\([^)]*\)/g, `$1`);
  // Liens internes : le texte de remplacement, sinon le titre vise, sinon le nom de la note.
  s = s.replace(/\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g, (_m, file: string, heading: string | undefined, alias: string | undefined) => alias || heading || (file.split(`/`).pop() ?? file));
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
  return { text: s, links };
}

// Texte brut d'un texte repere, pour les endroits qui n'affichent pas de mise en forme (signets, tableaux).
export function plainOf(text: string): string {
  return text.replace(new RegExp(`${LINK_ON}\\d+${LINK_NUM_END}`, `g`), ``).replace(/[-]/g, ``);
}

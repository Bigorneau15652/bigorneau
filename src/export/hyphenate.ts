// Export de haute qualite, etage 4 : cesure des mots par les motifs de Liang (These « Word Hy-phen-a-tion by Com-pu-ter »,
// Stanford, 1983). Un motif est une suite de lettres entrecoupee de chiffres : un chiffre impair autorise une coupure a cet
// endroit, un chiffre pair l'interdit, et le chiffre le plus eleve parmi tous les motifs applicables l'emporte.
// Les motifs francais et anglais viennent du projet hyph-utf8 (licence MIT, voir licences/).
import { EXCEPTIONS_EN_GB, PATTERNS_EN_GB } from "./patterns-en-gb";
import { EXCEPTIONS_FR, PATTERNS_FR } from "./patterns-fr";

interface TrieNode {
  next: Map<string, TrieNode>;
  // Chiffres du motif qui se termine ici : un de plus que de lettres.
  digits?: number[];
}

export interface HyphenationLanguage {
  root: TrieNode;
  exceptions: Map<string, number[]>;
}

const newNode = (): TrieNode => ({ next: new Map() });

// Unifie les apostrophes : les motifs francais utilisent l'apostrophe droite.
const normalize = (s: string): string => s.replace(/[’ʼ]/g, `'`);

function addPattern(root: TrieNode, pattern: string): void {
  const letters: string[] = [];
  const digits: number[] = [0];
  for (const ch of pattern) {
    if (ch >= `0` && ch <= `9`) {
      digits[letters.length] = Number(ch);
    } else {
      letters.push(ch);
      digits.push(0);
    }
  }
  let node = root;
  for (const l of letters) {
    let child = node.next.get(l);
    if (!child) {
      child = newNode();
      node.next.set(l, child);
    }
    node = child;
  }
  node.digits = digits;
}

// Exception : mot ecrit avec des tirets aux endroits de coupure permis. Renvoie le mot nu et les indices de coupure.
function parseException(entry: string): { word: string; points: number[] } {
  const points: number[] = [];
  let word = ``;
  for (const ch of normalize(entry.toLowerCase())) {
    if (ch === `-`) points.push(word.length);
    else word += ch;
  }
  return { word, points };
}

export function buildLanguage(patterns: string, exceptions: string): HyphenationLanguage {
  const root = newNode();
  for (const p of patterns.split(/\s+/)) if (p !== ``) addPattern(root, normalize(p));
  const lang: HyphenationLanguage = { root, exceptions: new Map() };
  addExceptions(lang, exceptions);
  return lang;
}

// Ajoute des mots dont on impose la cesure (par exemple ceux que l'utilisateur enrichit), separes par des espaces.
export function addExceptions(lang: HyphenationLanguage, text: string): void {
  for (const e of text.split(/\s+/)) {
    if (e === ``) continue;
    const { word, points } = parseException(e);
    lang.exceptions.set(word, points);
  }
}

export interface HyphenMins {
  left: number;
  right: number;
}

// Indices de coupure d'un mot : une coupure a l'indice i est permise entre la lettre i - 1 et la lettre i.
export function hyphenPoints(word: string, lang: HyphenationLanguage, mins: HyphenMins): number[] {
  const lower = normalize(word.toLowerCase());
  const len = lower.length;
  if (len !== word.length || len < mins.left + mins.right) return [];
  const known = lang.exceptions.get(lower);
  const raw = known ?? computePoints(lower, lang);
  return raw.filter((i) => i >= mins.left && i <= len - mins.right);
}

function computePoints(lower: string, lang: HyphenationLanguage): number[] {
  const w = `.` + lower + `.`;
  const values = new Array<number>(w.length + 1).fill(0);
  for (let i = 0; i < w.length; i++) {
    let node: TrieNode | undefined = lang.root;
    for (let j = i; j < w.length && node; j++) {
      node = node.next.get(w[j]);
      if (node && node.digits) {
        const d = node.digits;
        for (let k = 0; k < d.length; k++) if (d[k] > values[i + k]) values[i + k] = d[k];
      }
    }
  }
  // values[p] est la valeur situee avant w[p] ; la lettre d'indice j de `lower` est w[j + 1].
  const out: number[] = [];
  for (let j = 1; j < lower.length; j++) if (values[j + 1] % 2 === 1) out.push(j);
  return out;
}

// Langues disponibles, construites a la premiere demande.
export type LanguageCode = `fr` | `en`;
const cache = new Map<LanguageCode, HyphenationLanguage>();

export function getLanguage(code: LanguageCode): HyphenationLanguage {
  let lang = cache.get(code);
  if (!lang) {
    lang = code === `fr` ? buildLanguage(PATTERNS_FR, EXCEPTIONS_FR) : buildLanguage(PATTERNS_EN_GB, EXCEPTIONS_EN_GB);
    cache.set(code, lang);
  }
  return lang;
}

// Coupe un mot en syllabes de cesure (pour les tests et l'affichage).
export function hyphenate(word: string, lang: HyphenationLanguage, mins: HyphenMins): string {
  const cuts = new Set(hyphenPoints(word, lang, mins));
  let out = ``;
  for (let i = 0; i < word.length; i++) out += (cuts.has(i) ? `-` : ``) + word[i];
  return out;
}

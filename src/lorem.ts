// Texte Lorem ipsum : des paragraphes de latin de remplissage dont la taille se donne en lignes (environ 90 caracteres par ligne de
// texte courant dans l'export PDF). Le texte vient du fameux passage de Ciceron, comme sur lipsum.com. Ce module ne depend pas d'Obsidian.

export const CHARS_PER_LINE = 90;
export const MAX_LINES = 200;
export const MAX_PARAGRAPHS = 30;

const OPENING = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.`;

const WORDS = (
  `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud ` +
  `exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur ` +
  `excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc gravida ` +
  `justo vestibulum rhoncus ante ultrices posuere cubilia curae donec sagittis euismod purus mauris blandit aliquet tortor faucibus orci luctus`
).split(` `);

// Petit generateur pseudo-aleatoire : le meme graine donne toujours le meme texte.
function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Tailles demandees : « 6 » donne un paragraphe, « 6,4,2 » trois. Les separateurs sont la virgule, le point-virgule et l'espace ; ce qui
// n'est pas un nombre positif est ignore. Chaque taille est bornee a MAX_LINES, et le nombre de paragraphes a MAX_PARAGRAPHS.
export function parseSizes(spec: string): number[] {
  return spec
    .split(/[\s,;]+/)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n >= 1)
    .map((n) => Math.min(MAX_LINES, Math.round(n)))
    .slice(0, MAX_PARAGRAPHS);
}

// Un paragraphe d'environ `lines` lignes : des phrases de latin, coupees sur la fin d'un mot et terminees par un point. Le premier
// paragraphe commence toujours par la phrase d'ouverture habituelle.
export function loremParagraph(lines: number, index: number, charsPerLine = CHARS_PER_LINE): string {
  const target = Math.max(20, Math.round(lines * charsPerLine));
  const rand = random(7919 * (index + 1));
  let text = index === 0 ? OPENING : ``;
  while (text.length < target) {
    const count = 6 + Math.floor(rand() * 9);
    const words: string[] = [];
    for (let i = 0; i < count; i++) words.push(WORDS[Math.floor(rand() * WORDS.length)]);
    if (rand() < 0.6 && count > 7) words[Math.floor(count / 2)] += `,`;
    const sentence = words.join(` `).replace(/,\s*$/, ``);
    text += `${text === `` ? `` : ` `}${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
  }
  if (text.length > target) {
    // Coupe au dernier mot qui tient, puis termine proprement.
    const cut = text.lastIndexOf(` `, target);
    text = `${text.slice(0, cut > 20 ? cut : target).replace(/[,;:.]+$/, ``)}.`;
  }
  return text;
}

// Texte complet : un paragraphe par taille, separes par un simple retour a la ligne ou par une ligne vide.
export function generateLorem(spec: string, blankLine: boolean, eol = `\n`): string {
  const sizes = parseSizes(spec);
  return sizes.map((n, i) => loremParagraph(n, i)).join(blankLine ? eol + eol : eol);
}

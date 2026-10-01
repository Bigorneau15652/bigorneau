// Export de haute qualite, etage 3 : mesure du texte avec la police du premier gabarit (Libertinus Serif, graisse normale).
// Les largeurs viennent du fichier genere font-libertinus.ts. Le crenage et les ligatures ne sont pas encore appliques :
// l'apercu les desactive pour que l'affichage corresponde exactement aux largeurs calculees.
import { FONT_ASCENDER, FONT_DESCENDER, FONT_UNITS_PER_EM, FONT_WIDTHS } from "./font-libertinus";

const WIDTHS = new Map<number, number>(FONT_WIDTHS);

// Caracteres que la police du sous-ensemble ne contient pas et que l'on mesure et affiche avec un equivalent.
const ALIASES = new Map<number, number>([
  [0x202f, 0x2009], // espace insecable fine -> espace fine
  [0x2010, 0x2d], // trait d'union typographique -> trait d'union
  [0x2011, 0x2d], // trait d'union insecable -> trait d'union
]);

export const FINE_SPACE = ` `;
export const NO_BREAK_SPACE = ` `;

// Caractere de remplacement quand la police n'a pas le caractere demande.
const FALLBACK = 0x3f;

export interface TextMeasure {
  // Largeur en points.
  width: number;
  // Caracteres absents de la police, a signaler dans le rapport d'export.
  missing: number[];
}

// Caractere reellement affiche : les alias sont remplaces, les caracteres de controle supprimes.
export function displayChar(ch: string): string {
  const cp = ch.codePointAt(0)!;
  const alias = ALIASES.get(cp);
  return alias ? String.fromCodePoint(alias) : ch;
}

export function charUnits(cp: number): number {
  const known = WIDTHS.get(ALIASES.get(cp) ?? cp);
  return known ?? WIDTHS.get(FALLBACK) ?? 500;
}

export function hasGlyph(cp: number): boolean {
  return WIDTHS.has(ALIASES.get(cp) ?? cp);
}

// Largeur d'un texte, en points, a la taille `size` (en points).
export function measureText(text: string, size: number): TextMeasure {
  let units = 0;
  const missing: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!hasGlyph(cp)) missing.push(cp);
    units += charUnits(cp);
  }
  return { width: (units * size) / FONT_UNITS_PER_EM, missing };
}

export const fontAscender = (size: number): number => (FONT_ASCENDER * size) / FONT_UNITS_PER_EM;
export const fontDescender = (size: number): number => (FONT_DESCENDER * size) / FONT_UNITS_PER_EM;

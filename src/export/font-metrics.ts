// Export de haute qualite, etage 3 : mesure du texte avec les polices du premier gabarit (Libertinus Serif : normal, italique,
// gras, gras italique ; Libertinus Mono pour le code). Les largeurs viennent de la mise en forme reelle (ligatures et crenage compris, voir font.ts) : elles
// correspondent a celles que calcule le navigateur pour afficher le meme texte.
import { OpenTypeFont } from "./font";
import { FONT_FILES } from "./fonts-libertinus";

// Les quatre styles de Libertinus Serif et Libertinus Mono (chasse fixe pour le code et les tableaux).
export type FontStyle = `regular` | `italic` | `bold` | `boldItalic` | `mono`;
export const FONT_STYLES: FontStyle[] = [`regular`, `italic`, `bold`, `boldItalic`, `mono`];

export const FINE_SPACE = ` `;
export const NO_BREAK_SPACE = ` `;

// Caractere de remplacement quand la police n'a pas le caractere demande.
const FALLBACK = 0x3f;

const fonts = new Map<FontStyle, OpenTypeFont>();
const bytes = new Map<FontStyle, Uint8Array>();

// Octets du fichier de police d'un style (decodes une seule fois).
export function fontBytes(style: FontStyle): Uint8Array {
  let b = bytes.get(style);
  if (!b) {
    const binary = atob(FONT_FILES[style]);
    b = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) b[i] = binary.charCodeAt(i);
    bytes.set(style, b);
  }
  return b;
}

export function fontFor(style: FontStyle = `regular`): OpenTypeFont {
  let f = fonts.get(style);
  if (!f) {
    f = new OpenTypeFont(fontBytes(style));
    fonts.set(style, f);
  }
  return f;
}

export interface TextMeasure {
  // Largeur en points.
  width: number;
  // Caracteres absents de la police, a signaler dans le rapport d'export.
  missing: number[];
}

export function hasGlyph(cp: number, style: FontStyle = `regular`): boolean {
  return fontFor(style).hasChar(cp);
}

// Largeur d'un caractere seul, en unites de la police.
export function charUnits(cp: number, style: FontStyle = `regular`): number {
  const f = fontFor(style);
  return f.advance(f.cmap.get(cp) ?? f.cmap.get(FALLBACK) ?? 0);
}

// Largeur d'un texte, en points, a la taille `size` (en points).
export function measureText(text: string, size: number, style: FontStyle = `regular`): TextMeasure {
  const f = fontFor(style);
  const missing: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!f.hasChar(cp)) missing.push(cp);
  }
  return { width: (f.width(text) * size) / f.unitsPerEm, missing };
}

// Hauteurs de la police (au-dessus et au-dessous de la ligne de base), en points.
export const fontAscender = (size: number): number => (fontFor().ascender * size) / fontFor().unitsPerEm;
export const fontDescender = (size: number): number => (fontFor().descender * size) / fontFor().unitsPerEm;

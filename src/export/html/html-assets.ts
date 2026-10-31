// HTML export: small helpers that turn bytes into the text of a page (data: addresses, font rules, panorama viewer). Pure functions,
// tested with node --test.
import { FONT_FILES } from "../fonts-libertinus";
import type { Variant } from "../font-metrics";
import type { OpenTypeFont } from "../font";
import type { TypographyStyle } from "../../text-style";

// Base 64 text of some bytes (the browser function btoa works on strings, so the bytes are cut in blocks).
export function toBase64(bytes: Uint8Array): string {
  let binary = ``;
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// data: address of some bytes.
export const dataUri = (mime: string, bytes: Uint8Array): string => `data:${mime};base64,${toBase64(bytes)}`;

// A picture is read as a 360 degree panorama when it is twice as wide as high and wide enough to look around in.
export function isPanorama(width: number, height: number): boolean {
  return height > 0 && width >= 1500 && Math.abs(width / height - 2) < 0.03;
}

// @font-face rules of the font of the export (Libertinus Serif), written into every page so that it reads the same on any machine.
export function builtinFontCss(): string {
  const faces: [string, string, string][] = [
    [`regular`, `normal`, `400`],
    [`italic`, `italic`, `400`],
    [`bold`, `normal`, `700`],
    [`boldItalic`, `italic`, `700`],
  ];
  return faces.map(([key, style, weight]) => `@font-face{font-family:"MMW Libertinus Serif";font-style:${style};font-weight:${weight};src:url(data:font/otf;base64,${FONT_FILES[key]}) format("opentype")}`).join(``);
}

// A family of fonts added to the vault, as the page needs it.
export interface FamilyFonts {
  id: string;
  fonts: Partial<Record<Variant, OpenTypeFont>>;
}

// @font-face rules of the fonts added to the vault that the typography of the note uses.
export function userFontCss(ty: TypographyStyle, families: FamilyFonts[]): string {
  const used = new Set([ty.body.family, ty.title.family, ty.caption.family, ty.footnote.family, ...ty.headings.map((h) => h.family)]);
  const variants: [Variant, string, string][] = [
    [`regular`, `normal`, `400`],
    [`italic`, `italic`, `400`],
    [`bold`, `normal`, `700`],
    [`boldItalic`, `italic`, `700`],
  ];
  let css = ``;
  for (const family of families) {
    if (!used.has(family.id)) continue;
    for (const [variant, style, weight] of variants) {
      const font = family.fonts[variant];
      if (!font) continue;
      const truetype = font.flavor === `truetype`;
      css += `@font-face{font-family:"mmwu-${family.id}";font-style:${style};font-weight:${weight};src:url(data:font/${truetype ? `ttf` : `otf`};base64,${toBase64(font.data)}) format("${truetype ? `truetype` : `opentype`}")}`;
    }
  }
  return css;
}

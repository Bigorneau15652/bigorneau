// Puces des listes a puces dans l'export : un symbole par niveau d'imbrication (six niveaux), puis le trait d'union au-dela.
// Les formes (disque, carre, losange) sont dessinees par l'export lui-meme, car la police de composition ne les contient pas ;
// les autres symboles sont des caracteres de la police. Ce module ne depend pas d'Obsidian.
export const BULLET_IDS = [`disc`, `circle`, `square`, `squareOpen`, `diamond`, `diamondOpen`, `hyphen`, `dash`, `asterisk`, `dot`, `chevron`, `arrow`, `none`] as const;
export type BulletId = (typeof BULLET_IDS)[number];

export const BULLET_LEVELS = 6;
export const DEFAULT_BULLETS: BulletId[] = [`disc`, `circle`, `square`, `hyphen`, `hyphen`, `hyphen`];
// Symbole des niveaux au-dela du dernier niveau reglable.
export const DEEP_BULLET: BulletId = `hyphen`;

export type BulletShape = `disc` | `circle` | `square` | `squareOpen` | `diamond` | `diamondOpen`;

const SHAPES: BulletShape[] = [`disc`, `circle`, `square`, `squareOpen`, `diamond`, `diamondOpen`];
const GLYPHS: Partial<Record<BulletId, string>> = { hyphen: `-`, dash: `–`, asterisk: `*`, dot: `·`, chevron: `›`, arrow: `→` };

export const isBulletId = (v: unknown): v is BulletId => typeof v === `string` && (BULLET_IDS as readonly string[]).includes(v);

// Reglage lu depuis les donnees du plugin : toujours six symboles valides.
export function sanitizeBullets(v: unknown): BulletId[] {
  const list = Array.isArray(v) ? v : [];
  return DEFAULT_BULLETS.map((fallback, i) => (isBulletId(list[i]) ? list[i] : fallback));
}

export const bulletAt = (bullets: readonly BulletId[], depth: number): BulletId => bullets[depth] ?? DEEP_BULLET;

// Ce que l'export place dans la marge : un caractere de la police, une forme dessinee, ou rien.
export type BulletMark = { glyph: string } | { shape: BulletShape } | null;

export function bulletMark(id: BulletId): BulletMark {
  const shape = SHAPES.find((s) => s === id);
  if (shape) return { shape };
  const glyph = GLYPHS[id];
  return glyph ? { glyph } : null;
}

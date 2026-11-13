// Callouts of Obsidian (a quote whose first line is `[!type] Title`) for the export: reading of the first line, the kind that a type
// belongs to (with its aliases) and the colours used to print it. This module does not depend on Obsidian.

// The kinds of callouts that Obsidian knows by default. A type that is not in the list is printed as a note.
export type CalloutKind = `note` | `abstract` | `info` | `todo` | `tip` | `success` | `question` | `warning` | `failure` | `danger` | `bug` | `example` | `quote`;

const ALIASES: Record<string, CalloutKind> = {
  note: `note`,
  abstract: `abstract`,
  summary: `abstract`,
  tldr: `abstract`,
  info: `info`,
  todo: `todo`,
  tip: `tip`,
  hint: `tip`,
  important: `tip`,
  success: `success`,
  check: `success`,
  done: `success`,
  question: `question`,
  help: `question`,
  faq: `question`,
  warning: `warning`,
  caution: `warning`,
  attention: `warning`,
  failure: `failure`,
  fail: `failure`,
  missing: `failure`,
  danger: `danger`,
  error: `danger`,
  bug: `bug`,
  example: `example`,
  quote: `quote`,
  cite: `quote`,
};

// Colours of the default theme of Obsidian (red, green, blue).
const RGB: Record<CalloutKind, [number, number, number]> = {
  note: [68, 138, 255],
  abstract: [0, 176, 255],
  info: [68, 138, 255],
  todo: [68, 138, 255],
  tip: [0, 191, 188],
  success: [68, 207, 91],
  question: [233, 151, 63],
  warning: [233, 151, 63],
  failure: [251, 70, 76],
  danger: [251, 70, 76],
  bug: [251, 70, 76],
  example: [168, 130, 255],
  quote: [158, 158, 158],
};

export interface CalloutHead {
  // Type as written, in lower case (`tip`, `my-type`).
  type: string;
  kind: CalloutKind;
  title: string;
  // `+` (open) or `-` (folded) written after the type: the callout can be folded in Obsidian. The export always prints the content.
  fold?: `open` | `closed`;
}

const HEAD_RE = /^\[!([A-Za-z0-9_-]+)\]([+-]?)[ \t]*(.*)$/;

// The kind that a type of callout belongs to; an unknown type is a note.
export function calloutKindOf(type: string): CalloutKind {
  return ALIASES[type.trim().toLowerCase()] ?? `note`;
}

// Title shown when the first line gives none: the type with a capital, as Obsidian does (`tip` gives `Tip`).
export function defaultCalloutTitle(type: string): string {
  const words = type.replace(/[-_]+/g, ` `).trim();
  return words === `` ? `Note` : words.charAt(0).toUpperCase() + words.slice(1);
}

// The first line of a quote read as the head of a callout, or null when the quote is a plain one.
export function parseCalloutHead(line: string): CalloutHead | null {
  const m = HEAD_RE.exec(line.trim());
  if (!m) return null;
  const type = m[1].toLowerCase();
  const title = m[3].trim();
  return { type, kind: calloutKindOf(type), title: title === `` ? defaultCalloutTitle(type) : title, ...(m[2] === `+` ? { fold: `open` as const } : m[2] === `-` ? { fold: `closed` as const } : {}) };
}

const hex = (n: number): string => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, `0`);
const toHex = (c: [number, number, number]): string => `#${hex(c[0])}${hex(c[1])}${hex(c[2])}`;

export interface CalloutColors {
  // Colour of the vertical bar (`#rrggbb`).
  bar: string;
  // Light tint of the ground.
  fill: string;
  // Darker colour of the title, readable on the ground.
  ink: string;
  // The colour as `r, g, b`, for the style of the HTML page.
  rgb: string;
}

// Colours of a kind: the bar in the colour of the kind, a ground that is the same colour at ten per cent over white, and a title in a
// darker shade of it.
export function calloutColors(kind: CalloutKind): CalloutColors {
  const c = RGB[kind];
  return {
    bar: toHex(c),
    fill: toHex([c[0] * 0.1 + 255 * 0.9, c[1] * 0.1 + 255 * 0.9, c[2] * 0.1 + 255 * 0.9]),
    ink: toHex([c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]),
    rgb: `${c[0]}, ${c[1]}, ${c[2]}`,
  };
}

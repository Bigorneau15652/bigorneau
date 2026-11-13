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

// The first line of a quote split as it is written: the type (in lower case), the sign of folding and the title as typed (possibly empty).
// Null when the line is not the head of a callout.
export function splitCalloutHead(line: string): { type: string; fold?: `open` | `closed`; title: string } | null {
  const m = HEAD_RE.exec(line.trim());
  if (!m) return null;
  return { type: m[1].toLowerCase(), title: m[3].trim(), ...(m[2] === `+` ? { fold: `open` as const } : m[2] === `-` ? { fold: `closed` as const } : {}) };
}

// The first line of a quote read as the head of a callout, or null when the quote is a plain one.
export function parseCalloutHead(line: string): CalloutHead | null {
  const h = splitCalloutHead(line);
  if (!h) return null;
  return { type: h.type, kind: calloutKindOf(h.type), title: h.title === `` ? defaultCalloutTitle(h.type) : h.title, ...(h.fold ? { fold: h.fold } : {}) };
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

// How the callouts are printed: in colour (the colour of the type), or in black and white (greys) with a bar and a light grey ground, a
// black frame with an empty inside, or a black bar alone. The look is a choice of the export; a callout can ask for another one (see below).
export type CalloutLook = `color` | `gray` | `frame` | `bar`;

export const CALLOUT_LOOKS: CalloutLook[] = [`color`, `gray`, `frame`, `bar`];

export function isCalloutLook(value: unknown): value is CalloutLook {
  return typeof value === `string` && (CALLOUT_LOOKS as string[]).includes(value);
}

// What one callout asks for in its note, with a line of comment placed under its first line: `> %% callout: bw %%` (black and white, in the
// look chosen for the export, or the grey look when the export is in colour), `> %% callout: color %%` (in colour whatever the export
// says), or `> %% callout: #336699 %%` (in colour, with this colour). Obsidian hides the comment.
export interface CalloutOverride {
  mode?: `bw` | `color`;
  // Colour of the bar (`#rrggbb`), the ground and the title being derived from it.
  color?: string;
}

const norm = (s: string): string => s.normalize(`NFD`).replace(/[̀-ͯ]/g, ``).toLowerCase().trim();

// The text between `callout:` and `%%`, read as an override; null when it says nothing usable.
export function parseCalloutOverride(spec: string): CalloutOverride | null {
  const w = norm(spec);
  if (w === ``) return null;
  if (/^#[0-9a-f]{6}$/.test(w)) return { mode: `color`, color: w };
  if (/^#[0-9a-f]{3}$/.test(w)) return { mode: `color`, color: `#${w[1]}${w[1]}${w[2]}${w[2]}${w[3]}${w[3]}` };
  if (w === `bw` || w === `nb` || w === `gris` || w === `gray` || w === `grey` || w === `noir et blanc` || w === `black and white`) return { mode: `bw` };
  if (w === `color` || w === `couleur` || w === `colour`) return { mode: `color` };
  return null;
}

// The comment that writes an override (without the `> `).
export function formatCalloutOverride(o: CalloutOverride): string {
  if (o.color) return `%% callout: ${o.color} %%`;
  return o.mode === `bw` ? `%% callout: bw %%` : o.mode === `color` ? `%% callout: color %%` : ``;
}

// The line of comment of an override, written under the first line of a callout (one or several `>`, then the comment).
const MARK_LINE_RE = /^([ \t]*(?:>[ \t]?)+)%%[ \t]*callout[ \t]*:([^%\n]*)%%[ \t]*$/;

// Sentinels that replace the comment before the text is read (the comments are removed from the text first).
export const CALLOUT_MARK = `\u0002k `;
export const CALLOUT_MARK_END = `\u0003`;

// The text with each line of override written as a sentinel that the reading of the quote finds again. Blocks of code are not touched.
export function markCalloutOverrides(text: string): string {
  if (!/%%[ \t]*callout[ \t]*:/.test(text)) return text;
  let fence: string | null = null;
  return text
    .split(`\n`)
    .map((line) => {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (f) {
        if (fence === null) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
        return line;
      }
      if (fence !== null) return line;
      const m = MARK_LINE_RE.exec(line.replace(/\r$/, ``));
      return m ? `${m[1]}${CALLOUT_MARK}${m[2].trim()}${CALLOUT_MARK_END}` : line;
    })
    .join(`\n`);
}

// The override written in a line of a quote (after its `>`), when it is a sentinel: null for another line, `{}` for an unusable override.
export function overrideOfMarkedLine(line: string): CalloutOverride | null {
  if (!line.startsWith(CALLOUT_MARK)) return null;
  const end = line.indexOf(CALLOUT_MARK_END);
  if (end < 0) return null;
  return parseCalloutOverride(line.slice(CALLOUT_MARK.length, end)) ?? {};
}

export interface CalloutPaint {
  // The look really used.
  look: CalloutLook;
  // Colours as `#rrggbb`; an empty text means that the part is not drawn (bar, ground, frame).
  bar: string;
  fill: string;
  frame: string;
  // Colour of the title and of the pictogram.
  ink: string;
  // The colour as `r, g, b` for the style of the HTML page (colour looks only).
  rgb: string;
}

function hexToRgb(color: string): [number, number, number] {
  return [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
}

// The look and the colours of a callout, from the look chosen for the export and what the callout asks for itself.
export function calloutPaint(kind: CalloutKind, look: CalloutLook, override?: CalloutOverride): CalloutPaint {
  let used = look;
  if (override?.mode === `color` || override?.color) used = `color`;
  else if (override?.mode === `bw` && look === `color`) used = `gray`;
  if (used === `color`) {
    const rgb = override?.color ? hexToRgb(override.color) : RGB[kind];
    return {
      look: used,
      bar: toHex(rgb),
      fill: toHex([rgb[0] * 0.1 + 255 * 0.9, rgb[1] * 0.1 + 255 * 0.9, rgb[2] * 0.1 + 255 * 0.9]),
      frame: ``,
      ink: toHex([rgb[0] * 0.6, rgb[1] * 0.6, rgb[2] * 0.6]),
      rgb: `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`,
    };
  }
  const black = `#000000`;
  if (used === `gray`) return { look: used, bar: black, fill: `#ececec`, frame: ``, ink: black, rgb: `0, 0, 0` };
  if (used === `frame`) return { look: used, bar: ``, fill: ``, frame: black, ink: black, rgb: `0, 0, 0` };
  return { look: used, bar: black, fill: ``, frame: ``, ink: black, rgb: `0, 0, 0` };
}

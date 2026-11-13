// Reading and writing of a callout in the text of a note, for the callout editor: where the callout under the cursor starts and ends, the
// fields of the window (type, title, text, folding, look) read from its lines, and the lines written back exactly as Obsidian and the
// Callout Manager plugin write them. This module does not depend on Obsidian: it is tested with node --test.
import { CalloutOverride, formatCalloutOverride, parseCalloutOverride, splitCalloutHead } from "./export/callout";

// How the callout is painted: as the setting of the export says, in colour, in black and white, or in a colour chosen for this callout.
export type CalloutLookChoice = `default` | `color` | `bw` | `custom`;

// The fields of the window.
export interface CalloutForm {
  // Name of the type as written between `[!` and `]` (`note`, `tip`, `my-type`).
  type: string;
  title: string;
  // Folding sign of Obsidian: none, folded (`-`) or open (`+`).
  fold: `` | `open` | `closed`;
  // Content, as the lines of the callout without their `> `. Nested quotes and lists keep their own signs.
  text: string;
  look: CalloutLookChoice;
  // Colour (`#rrggbb`) of the look `custom`.
  color: string;
}

export function emptyForm(): CalloutForm {
  return { type: `note`, title: ``, fold: ``, text: ``, look: `default`, color: `#448aff` };
}

// A type name as Obsidian accepts it: letters, digits, hyphens and underscores, in lower case (a space becomes a hyphen).
export function cleanType(value: string): string {
  const t = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, `-`)
    .replace(/[^a-z0-9_-]/g, ``);
  return t === `` ? `note` : t;
}

// A line of a quote: its sign `>` (with one space after it) is removed. Null when the line is not part of a quote.
function unquote(line: string): string | null {
  const m = /^[ \t]*>[ \t]?(.*)$/.exec(line);
  return m ? m[1] : null;
}

export interface CalloutRange {
  // First and last line (0-based, both included) of the quote that holds the callout.
  start: number;
  end: number;
}

// The callout that contains the line `at`: the run of lines of the quote around it, when its first line is the head of a callout.
export function findCalloutRange(lines: string[], at: number): CalloutRange | null {
  if (at < 0 || at >= lines.length || unquote(lines[at]) === null) return null;
  let start = at;
  while (start > 0 && unquote(lines[start - 1]) !== null) start--;
  let end = at;
  while (end + 1 < lines.length && unquote(lines[end + 1]) !== null) end++;
  const head = unquote(lines[start]);
  return head !== null && splitCalloutHead(head) !== null ? { start, end } : null;
}

// The fields of the window read from the lines of a callout (the first line is its head). A line of comment that chooses the look is
// read apart and does not belong to the text.
export function formFromLines(lines: string[]): CalloutForm | null {
  const head = splitCalloutHead(unquote(lines[0] ?? ``) ?? ``);
  if (!head) return null;
  const form = emptyForm();
  form.type = head.type;
  form.title = head.title;
  form.fold = head.fold ?? ``;
  const body: string[] = [];
  let seen = false;
  for (const raw of lines.slice(1)) {
    const line = unquote(raw) ?? ``;
    const marked = readMarkLine(line);
    if (marked !== null && !seen) {
      seen = true;
      applyOverride(form, marked);
      continue;
    }
    body.push(line);
  }
  while (body.length > 0 && body[body.length - 1].trim() === ``) body.pop();
  form.text = body.join(`\n`);
  return form;
}

// A line `%% callout: ... %%` as it is in the note (the text is not yet marked), read as an override; null for any other line.
function readMarkLine(line: string): CalloutOverride | null {
  const m = /^%%[ \t]*callout[ \t]*:([^%\n]*)%%[ \t]*$/.exec(line);
  return m ? (parseCalloutOverride(m[1]) ?? {}) : null;
}

function applyOverride(form: CalloutForm, o: CalloutOverride): void {
  if (o.color) {
    form.look = `custom`;
    form.color = o.color;
  } else if (o.mode === `bw`) form.look = `bw`;
  else if (o.mode === `color`) form.look = `color`;
}

// The override that the look of the form writes (none for the look of the export).
export function overrideOfForm(form: CalloutForm): CalloutOverride | undefined {
  if (form.look === `bw`) return { mode: `bw` };
  if (form.look === `color`) return { mode: `color` };
  if (form.look === `custom` && /^#[0-9a-fA-F]{6}$/.test(form.color)) return { mode: `color`, color: form.color.toLowerCase() };
  return undefined;
}

// The lines of the callout, written as Obsidian writes them: `> [!type]- Title`, a line of comment if the look is chosen, then the
// content with `> ` in front of each line (`>` alone for an empty line).
export function linesFromForm(form: CalloutForm): string[] {
  const title = form.title.replace(/[\r\n]+/g, ` `).trim();
  const fold = form.fold === `closed` ? `-` : form.fold === `open` ? `+` : ``;
  const out = [`> [!${cleanType(form.type)}]${fold}${title === `` ? `` : ` ${title}`}`];
  const o = overrideOfForm(form);
  if (o) out.push(`> ${formatCalloutOverride(o)}`);
  const text = form.text.replace(/\r\n?/g, `\n`).replace(/\s+$/, ``);
  if (text !== ``) for (const line of text.split(`\n`)) out.push(line === `` ? `>` : `> ${line}`);
  return out;
}

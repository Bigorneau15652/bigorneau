// Paragraphes : reglage de tout le document (retrait ou espace entre paragraphes, alignement) et exception pour un seul paragraphe,
// ecrite au debut de sa ligne : %% p: droite %% ou %% p: centre, espace m %%. Le commentaire est invisible en lecture. Ce module ne
// depend pas d'Obsidian : il sert a la composition de l'export et a la fenetre des paragraphes.
import { lineStartAt } from "./text-lines";

export type ParaAlign = `justify` | `left` | `right` | `center`;
export type ParaMode = `indent` | `space`;
export type ParaSize = `s` | `m` | `l`;

export interface ParagraphSettings {
  // Un retrait de la premiere ligne, ou un espace entre les paragraphes (sans retrait).
  mode: ParaMode;
  // Taille de l'espace entre paragraphes.
  size: ParaSize;
  // Taille du retrait de la premiere ligne.
  indentSize: ParaSize;
  align: ParaAlign;
  // Vrai quand la note a choisi ces reglages elle-meme : ils l'emportent alors sur ceux de toutes les notes, meme s'ils sont identiques
  // aux reglages d'origine.
  set?: boolean;
}

// Espace entre deux paragraphes, en points.
export const PARAGRAPH_SPACE_POINTS: Record<ParaSize, number> = { s: 4, m: 8, l: 14 };
// Retrait de la premiere ligne, en points : 0,5 cm, 1 cm et 1,5 cm.
export const INDENT_POINTS: Record<ParaSize, number> = { s: 14.17, m: 28.35, l: 42.52 };
// Decalage de tout un paragraphe par niveau de tabulation (4 espaces) ecrit dans la note, en points : 1 cm.
export const SHIFT_POINTS = 28.35;
export const SHIFT_MAX_LEVELS = 8;

export const defaultParagraphSettings = (): ParagraphSettings => ({ mode: `indent`, size: `m`, indentSize: `s`, align: `justify` });

// Ces reglages different-ils des reglages d'origine, ou la note les a-t-elle choisis elle-meme ?
export function isParagraphSet(p: ParagraphSettings): boolean {
  const d = defaultParagraphSettings();
  return p.set === true || p.mode !== d.mode || p.size !== d.size || p.indentSize !== d.indentSize || p.align !== d.align;
}

// Reglages qui s'appliquent a une note : les siens quand elle en a choisi, sinon ceux de toutes les notes.
export const effectiveParagraphs = (general: ParagraphSettings, note: ParagraphSettings | undefined): ParagraphSettings => (note && isParagraphSet(note) ? note : general);

const ALIGNS: ParaAlign[] = [`justify`, `left`, `right`, `center`];

export function sanitizeParagraphSettings(raw: unknown): ParagraphSettings {
  const r = typeof raw === `object` && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = defaultParagraphSettings();
  const size = (v: unknown, fallback: ParaSize): ParaSize => (v === `s` || v === `m` || v === `l` ? v : fallback);
  return {
    mode: r.mode === `space` ? `space` : d.mode,
    size: size(r.size, d.size),
    indentSize: size(r.indentSize, d.indentSize),
    align: typeof r.align === `string` && (ALIGNS as string[]).includes(r.align) ? (r.align as ParaAlign) : d.align,
    ...(r.set === true ? { set: true } : {}),
  };
}

// Exception pour un paragraphe : ce qui n'est pas indique suit le reglage du document. `none` : ni retrait ni espace.
export interface ParagraphFormat {
  align?: ParaAlign;
  mode?: ParaMode | `none`;
  // Taille de l'espace (mode `space`).
  size?: ParaSize;
  // Taille du retrait (mode `indent`).
  indentSize?: ParaSize;
}

const ALIGN_WORDS: Record<string, ParaAlign> = {
  gauche: `left`,
  left: `left`,
  droite: `right`,
  right: `right`,
  centre: `center`,
  centré: `center`,
  center: `center`,
  justifie: `justify`,
  justifié: `justify`,
  justify: `justify`,
};

// Lit « droite, espace m » : alignement, puis retrait, espace (avec sa taille s, m ou l) ou aucun, dans n'importe quel ordre.
export function parseParagraphFormat(spec: string): ParagraphFormat {
  const out: ParagraphFormat = {};
  for (const raw of spec.split(/[,;]/)) {
    const word = raw.trim().toLowerCase().replace(/\s+/g, ` `);
    if (word === ``) continue;
    if (ALIGN_WORDS[word]) out.align = ALIGN_WORDS[word];
    else if (/^(?:retrait|indent)(?: [sml])?$/.test(word)) {
      out.mode = `indent`;
      const sz = / ([sml])$/.exec(word);
      if (sz) out.indentSize = sz[1] as ParaSize;
    } else if (word === `aucun` || word === `none` || word === `compact`) out.mode = `none`;
    else {
      const m = /^(?:espace|space)(?: ([sml]))?$/.exec(word);
      if (m) {
        out.mode = `space`;
        if (m[1]) out.size = m[1] as ParaSize;
      }
    }
  }
  return out;
}

const ALIGN_FR: Record<ParaAlign, string> = { justify: `justifié`, left: `gauche`, right: `droite`, center: `centré` };

// Texte de l'etiquette d'un paragraphe, ou chaine vide quand il n'y a pas d'exception.
export function formatParagraphMarker(f: ParagraphFormat): string {
  const parts: string[] = [];
  if (f.align) parts.push(ALIGN_FR[f.align]);
  if (f.mode === `indent`) parts.push(f.indentSize ? `retrait ${f.indentSize}` : `retrait`);
  else if (f.mode === `none`) parts.push(`aucun`);
  else if (f.mode === `space`) parts.push(f.size ? `espace ${f.size}` : `espace`);
  return parts.length === 0 ? `` : `%% p: ${parts.join(`, `)} %%`;
}

// Etiquette au debut d'une ligne : %% p: ... %% (espaces autour permis).
export const PARAGRAPH_MARKER_RE = /^([ \t]*)%%[ \t]*p[ \t]*:[ \t]*([^%\n]*?)[ \t]*%%[ \t]?/;

export function readParagraphMarker(line: string): { format: ParagraphFormat; length: number } | null {
  const m = PARAGRAPH_MARKER_RE.exec(line);
  return m ? { format: parseParagraphFormat(m[2]), length: m[0].length } : null;
}

// Modification du texte qui pose (ou retire, avec `null`) l'exception du paragraphe dont la ligne contient `offset`.
export function setParagraphMarker(text: string, offset: number, format: ParagraphFormat | null): { from: number; to: number; insert: string } {
  const start = lineStartAt(text, offset);
  const nl = text.indexOf(`\n`, offset);
  const end = nl === -1 ? text.length : nl;
  const line = text.slice(start, end).replace(/\r$/, ``);
  const existing = readParagraphMarker(line);
  const marker = format ? formatParagraphMarker(format) : ``;
  const insert = marker === `` ? `` : `${marker} `;
  return { from: start, to: start + (existing ? existing.length : 0), insert };
}

// Exception du paragraphe dont la ligne contient `offset`, ou null.
export function paragraphMarkerAt(text: string, offset: number): ParagraphFormat | null {
  const start = lineStartAt(text, offset);
  const nl = text.indexOf(`\n`, offset);
  return readParagraphMarker(text.slice(start, nl === -1 ? text.length : nl))?.format ?? null;
}

// Repere pose avant l'analyse du texte (les commentaires sont alors retires) : l'etiquette du debut d'une ligne devient un repere que
// l'analyse retrouve au debut du paragraphe. Les blocs de code ne sont pas touches.
export const PARAGRAPH_SENTINEL = `\u0002p `;
export const PARAGRAPH_SENTINEL_END = `\u0003`;

export function markParagraphMarkers(text: string): string {
  if (!/%%[ \t]*p[ \t]*:/.test(text)) return text;
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
      const m = readParagraphMarker(line);
      if (!m) return line;
      return `${PARAGRAPH_SENTINEL}${JSON.stringify(m.format)}${PARAGRAPH_SENTINEL_END}${line.slice(m.length)}`;
    })
    .join(`\n`);
}

// Separe un texte de paragraphe de son repere : format lu et texte restant. Sans repere, le texte est rendu tel quel.
export function splitParagraphSentinel(text: string): { format: ParagraphFormat | null; text: string } {
  if (!text.startsWith(PARAGRAPH_SENTINEL)) return { format: null, text };
  const end = text.indexOf(PARAGRAPH_SENTINEL_END);
  if (end < 0) return { format: null, text };
  let format: ParagraphFormat = {};
  try {
    format = JSON.parse(text.slice(PARAGRAPH_SENTINEL.length, end)) as ParagraphFormat;
  } catch {
    format = {};
  }
  return { format, text: text.slice(end + PARAGRAPH_SENTINEL_END.length).trim() };
}

// Paragraphes : reglage de tout le document (retrait ou espace entre paragraphes, alignement) et exception pour un seul paragraphe,
// ecrite au debut de sa ligne : %% p: droite %% ou %% p: centre, espace m %%. Le commentaire est invisible en lecture. Ce module ne
// depend pas d'Obsidian : il sert a la composition de l'export et a la fenetre des paragraphes.

export type ParaAlign = `justify` | `left` | `right` | `center`;
export type ParaMode = `indent` | `space`;
export type ParaSize = `s` | `m` | `l`;

export interface ParagraphSettings {
  // Un retrait de la premiere ligne, ou un espace entre les paragraphes (sans retrait).
  mode: ParaMode;
  // Taille de l'espace entre paragraphes.
  size: ParaSize;
  align: ParaAlign;
}

// Espace entre deux paragraphes, en points.
export const PARAGRAPH_SPACE_POINTS: Record<ParaSize, number> = { s: 4, m: 8, l: 14 };

export const defaultParagraphSettings = (): ParagraphSettings => ({ mode: `indent`, size: `m`, align: `justify` });

const ALIGNS: ParaAlign[] = [`justify`, `left`, `right`, `center`];

export function sanitizeParagraphSettings(raw: unknown): ParagraphSettings {
  const r = typeof raw === `object` && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = defaultParagraphSettings();
  return {
    mode: r.mode === `space` ? `space` : d.mode,
    size: r.size === `s` || r.size === `l` ? r.size : d.size,
    align: typeof r.align === `string` && (ALIGNS as string[]).includes(r.align) ? (r.align as ParaAlign) : d.align,
  };
}

// Exception pour un paragraphe : ce qui n'est pas indique suit le reglage du document. `none` : ni retrait ni espace.
export interface ParagraphFormat {
  align?: ParaAlign;
  mode?: ParaMode | `none`;
  size?: ParaSize;
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
    else if (word === `retrait` || word === `indent`) out.mode = `indent`;
    else if (word === `aucun` || word === `none` || word === `compact`) out.mode = `none`;
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
  if (f.mode === `indent`) parts.push(`retrait`);
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
  const start = text.lastIndexOf(`\n`, offset - 1) + 1;
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
  const start = text.lastIndexOf(`\n`, offset - 1) + 1;
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

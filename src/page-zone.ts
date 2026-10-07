// Zones de la note qui changent l'orientation de la feuille (par exemple un grand tableau en paysage dans un document en portrait).
// Une ligne de commentaire seule, placee avant le bloc voulu, ouvre la zone : `%% page: paysage %%`, `%% page: portrait, 2 colonnes %%`,
// `%% page: paysage, seulement %%` (seul le bloc qui suit est concerne, puis la feuille reprend son orientation). La zone dure jusqu'a
// la prochaine etiquette. Ce module ne depend pas d'Obsidian.
import type { Orientation } from "./page-layout";

export interface PageZone {
  orientation: Orientation;
  // Nombre de colonnes de la zone ; absent : celui de la note.
  columns?: number;
  // Vrai : la zone ne vaut que pour le bloc qui suit.
  once?: boolean;
}

// Ligne d'etiquette seule (zone de page ou liste d'illustrations) : elle ne fait pas partie du bloc qui la suit.
const LABEL_LINE_RE = /^[ \t]*%%[ \t]*(?:liste|list)[ \t]*:[^%\n]*%%[ \t]*$/;

export const PAGE_ZONE_RE = /^[ \t]*%%[ \t]*page[ \t]*:[ \t]*([^%\n]*?)[ \t]*%%[ \t]*$/;

const norm = (s: string): string => s.normalize(`NFD`).replace(/[̀-ͯ]/g, ``).toLowerCase().trim();

// « paysage », « portrait, 2 colonnes, seulement » (ou en anglais). Renvoie null si l'orientation manque.
export function parsePageZone(spec: string): PageZone | null {
  let orientation: Orientation | null = null;
  let columns: number | undefined;
  let once = false;
  for (const raw of spec.split(`,`)) {
    const w = norm(raw);
    if (w === ``) continue;
    if (w === `paysage` || w === `landscape`) orientation = `landscape`;
    else if (w === `portrait`) orientation = `portrait`;
    else if (w === `seulement` || w === `seul` || w === `only`) once = true;
    else {
      const m = /^(\d+)\s*(colonnes?|columns?|col)?$/.exec(w);
      if (m) columns = Math.max(1, Math.min(8, Number(m[1])));
    }
  }
  return orientation ? { orientation, ...(columns !== undefined ? { columns } : {}), ...(once ? { once: true } : {}) } : null;
}

export function formatPageZone(zone: PageZone): string {
  const parts: string[] = [zone.orientation === `landscape` ? `paysage` : `portrait`];
  if (zone.columns !== undefined) parts.push(`${zone.columns} colonne${zone.columns > 1 ? `s` : ``}`);
  if (zone.once) parts.push(`seulement`);
  return `%% page: ${parts.join(`, `)} %%`;
}

// Zone ecrite sur cette ligne, ou null.
export function readPageZone(line: string): PageZone | null {
  const m = PAGE_ZONE_RE.exec(line.replace(/\r$/, ``));
  return m ? parsePageZone(m[1]) : null;
}

// Repere pose avant l'analyse du texte (les commentaires sont alors retires) : la ligne d'une zone devient une ligne que l'analyse
// retrouve. Les blocs de code ne sont pas touches.
export const ZONE_SENTINEL = `\u0002z `;
export const ZONE_SENTINEL_END = `\u0003`;

export function markPageZones(text: string): string {
  if (!/%%[ \t]*page[ \t]*:/.test(text)) return text;
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
      const zone = readPageZone(line);
      return zone ? `${ZONE_SENTINEL}${JSON.stringify(zone)}${ZONE_SENTINEL_END}` : line;
    })
    .join(`\n`);
}

// Zone d'une ligne marquee, ou null.
export function zoneFromSentinel(line: string): PageZone | null {
  if (!line.startsWith(ZONE_SENTINEL)) return null;
  const end = line.indexOf(ZONE_SENTINEL_END);
  if (end < 0) return null;
  try {
    const z = JSON.parse(line.slice(ZONE_SENTINEL.length, end)) as PageZone;
    return z.orientation === `landscape` || z.orientation === `portrait` ? z : null;
  } catch {
    return null;
  }
}

// Debut du bloc qui contient `offset` : on remonte tant que la ligne precedente n'est pas vide.
export function blockStart(text: string, offset: number): number {
  let start = text.lastIndexOf(`\n`, offset - 1) + 1;
  while (start > 0) {
    const prevStart = text.lastIndexOf(`\n`, start - 2) + 1;
    const prev = text.slice(prevStart, start - 1);
    if (prev.trim() === `` || readPageZone(prev) || LABEL_LINE_RE.test(prev)) break;
    start = prevStart;
  }
  return start;
}

const lineEndAt = (text: string, p: number): number => {
  const nl = text.indexOf(`\n`, p);
  return nl === -1 ? text.length : nl;
};

// Etiquette de zone du bloc qui contient `offset` : celle de la ligne du curseur, ou celle qui precede le bloc (apres des lignes vides
// eventuelles). `from`..`lineTo` est la ligne de l'etiquette ; `from`..`to` comprend aussi les lignes vides qui la suivent.
export function pageZoneAt(text: string, offset: number): { zone: PageZone; from: number; lineTo: number; to: number } | null {
  const start = blockStart(text, offset);
  const own = readPageZone(text.slice(start, lineEndAt(text, start)));
  if (own) {
    const lineTo = lineEndAt(text, start);
    return { zone: own, from: start, lineTo, to: Math.min(text.length, lineTo + 1) };
  }
  let probe = start;
  while (probe > 0) {
    const prevStart = text.lastIndexOf(`\n`, probe - 2) + 1;
    const prev = text.slice(prevStart, probe - 1);
    if (prev.trim() === ``) {
      probe = prevStart;
      continue;
    }
    const zone = readPageZone(prev);
    return zone ? { zone, from: prevStart, lineTo: probe - 1, to: start } : null;
  }
  return null;
}

// Pose, remplace ou retire (zone null) l'etiquette du bloc qui contient `offset`.
export function setPageZone(text: string, offset: number, zone: PageZone | null): { from: number; to: number; insert: string } {
  const existing = pageZoneAt(text, offset);
  if (existing) return zone === null ? { from: existing.from, to: existing.to, insert: `` } : { from: existing.from, to: existing.lineTo, insert: formatPageZone(zone) };
  const start = blockStart(text, offset);
  if (zone === null) return { from: start, to: start, insert: `` };
  const before = start > 0 && text.slice(Math.max(0, start - 2), start) !== `\n\n` ? `\n` : ``;
  return { from: start, to: start, insert: `${before}${formatPageZone(zone)}\n\n` };
}

// Style d'un tableau, memorise dans une ligne de commentaire Obsidian placee au-dessus du tableau (au-dessus de sa legende, s'il en a
// une) : %% mmw-table {"header":true,"stripes":true,"equal":true} %%. Un tableau Markdown ne peut pas contenir ces choix lui-meme ;
// le commentaire est invisible en lecture. Ce module ne depend pas d'Obsidian : il sert a l'export et a l'editeur.

export interface TableStyle {
  // Ligne d'en-tete foncee, ecriture blanche.
  header?: boolean;
  // Une ligne sur deux legerement contrastee.
  stripes?: boolean;
  // Colonnes de meme largeur.
  equal?: boolean;
}

const MARKER_RE = /^%%[ \t]*mmw-table(?:[ \t]+(\{.*\}))?[ \t]*%%[ \t]*$/;

// Lit une ligne de repere de style de tableau. Renvoie null si la ligne n'en est pas un.
export function parseTableMarker(line: string): TableStyle | null {
  const m = MARKER_RE.exec(line.replace(/(\r\n|\n|\r)$/, ``).trim());
  if (!m) return null;
  const out: TableStyle = {};
  if (m[1]) {
    try {
      const raw: unknown = JSON.parse(m[1]);
      if (typeof raw === `object` && raw !== null) {
        const r = raw as Record<string, unknown>;
        if (r.header === true) out.header = true;
        if (r.stripes === true) out.stripes = true;
        if (r.equal === true) out.equal = true;
      }
    } catch {
      // Un repere abime compte comme un repere sans choix.
    }
  }
  return out;
}

// Ecrit le repere sur une seule ligne ; null quand aucun choix n'est actif (la ligne est alors retiree de la note).
export function formatTableMarker(style: TableStyle): string | null {
  const body: TableStyle = {};
  if (style.header) body.header = true;
  if (style.stripes) body.stripes = true;
  if (style.equal) body.equal = true;
  return Object.keys(body).length === 0 ? null : `%% mmw-table ${JSON.stringify(body)} %%`;
}

// Ligne qui remplace le repere dans le texte transmis a l'analyse de l'export (le commentaire serait retire avant elle).
export const TABLE_MARKER_SENTINEL = `\u0001mmw-table `;

export function markTableMarkers(text: string): string {
  if (!text.includes(`mmw-table`)) return text;
  return text
    .split(`\n`)
    .map((line) => {
      const style = parseTableMarker(line);
      return style ? `${TABLE_MARKER_SENTINEL}${JSON.stringify(style)}` : line;
    })
    .join(`\n`);
}

export function styleFromSentinel(text: string): TableStyle | null {
  if (!text.startsWith(TABLE_MARKER_SENTINEL)) return null;
  try {
    return JSON.parse(text.slice(TABLE_MARKER_SENTINEL.length)) as TableStyle;
  } catch {
    return {};
  }
}

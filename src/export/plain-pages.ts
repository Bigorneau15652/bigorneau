// Export de haute qualite, phase 1 : mise en pages grossiere en texte brut, pour verifier la structure du document.
// Les lignes sont coupees au plus court (algorithme glouton) et les pages au nombre de lignes : la vraie composition
// (coupure de lignes de Knuth et Plass, pagination, polices) arrive aux phases suivantes.
import { DocBlock, DocSection, ExportDoc, inlineToPlain } from "./doc-tree";

export interface PlainPageOptions {
  // Largeur d'une ligne en caracteres et nombre de lignes par page.
  columns: number;
  linesPerPage: number;
}

export const DEFAULT_PLAIN_PAGE: PlainPageOptions = { columns: 72, linesPerPage: 46 };

export interface PlainPage {
  number: number;
  lines: string[];
}

export interface PlainResult {
  pages: PlainPage[];
  wordCount: number;
}

// Ligne composee : `keep` interdit de couper la page juste apres elle (un titre ne reste pas seul en bas de page).
interface Line {
  text: string;
  keep: boolean;
}

const words = (s: string): string[] => s.split(/\s+/).filter((w) => w !== ``);

// Coupe un texte en lignes d'au plus `width` caracteres (un mot plus long reste entier sur sa ligne).
export function wrapText(text: string, width: number, firstIndent = ``, nextIndent = ``): string[] {
  const out: string[] = [];
  let current = firstIndent;
  let empty = true;
  for (const w of words(text)) {
    if (!empty && current.length + 1 + w.length > width) {
      out.push(current);
      current = nextIndent + w;
    } else {
      current += (empty ? `` : ` `) + w;
    }
    empty = false;
  }
  if (!empty) out.push(current);
  return out;
}

function renderBlock(block: DocBlock, width: number): string[] {
  switch (block.type) {
    case `paragraph`:
      // Retrait de premiere ligne, comme en typographie francaise.
      return wrapText(inlineToPlain(block.text), width, `  `, ``);
    case `list`: {
      const out: string[] = [];
      const counters: number[] = [];
      for (const item of block.items) {
        // Chaque niveau a son compteur : une sous-liste repart de 1.
        counters.length = item.depth + 1;
        counters[item.depth] = (counters[item.depth] ?? 0) + 1;
        const pad = `  `.repeat(item.depth);
        const marker = block.ordered ? `${counters[item.depth]}. ` : `- `;
        out.push(...wrapText(inlineToPlain(item.text), width, pad + marker, pad + ` `.repeat(marker.length)));
      }
      return out;
    }
    case `quote`: {
      const out: string[] = [];
      for (const para of block.text.split(/\n{2,}/)) {
        if (out.length > 0) out.push(`|`);
        out.push(...wrapText(inlineToPlain(para), width - 2, `| `, `| `));
      }
      return out;
    }
    case `code`:
      return block.text.split(`\n`).map((l) => `    ` + l);
    case `table`:
      return block.rows.map((r) => r.map(inlineToPlain).join(` | `));
    case `figure`: {
      const label = block.caption ? inlineToPlain(block.caption) : block.target;
      return wrapText(`[Figure : ${label}]`, width, `  `, `  `);
    }
  }
}

function pushBlocks(lines: Line[], blocks: DocBlock[], width: number): void {
  for (const b of blocks) {
    const rendered = renderBlock(b, width);
    if (rendered.length === 0) continue;
    for (const text of rendered) lines.push({ text, keep: false });
    lines.push({ text: ``, keep: false });
  }
}

function pushHeading(lines: Line[], section: DocSection, width: number): void {
  const title = inlineToPlain(section.title) || `(sans titre)`;
  if (section.level <= 1) {
    const text = title.toUpperCase();
    lines.push({ text, keep: true }, { text: `=`.repeat(Math.min(width, text.length)), keep: true });
  } else if (section.level === 2) {
    lines.push({ text: title, keep: true }, { text: `-`.repeat(Math.min(width, title.length)), keep: true });
  } else {
    lines.push({ text: title, keep: true });
  }
  lines.push({ text: ``, keep: true });
}

function pushSection(lines: Line[], section: DocSection, width: number): void {
  pushHeading(lines, section, width);
  pushBlocks(lines, section.blocks, width);
  for (const s of section.sections) pushSection(lines, s, width);
}

function countWords(blocks: DocBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    if (b.type === `paragraph` || b.type === `quote`) n += words(inlineToPlain(b.text)).length;
    else if (b.type === `list`) for (const it of b.items) n += words(inlineToPlain(it.text)).length;
    else if (b.type === `table`) for (const r of b.rows) for (const c of r) n += words(inlineToPlain(c)).length;
  }
  return n;
}

function countSectionWords(s: DocSection): number {
  return countWords(s.blocks) + s.sections.reduce((a, c) => a + countSectionWords(c), 0);
}

// Compose le document en pages de texte brut.
export function paginatePlain(doc: ExportDoc, options: PlainPageOptions = DEFAULT_PLAIN_PAGE): PlainResult {
  const width = Math.max(20, Math.floor(options.columns));
  const max = Math.max(5, Math.floor(options.linesPerPage));
  const lines: Line[] = [];
  const title = inlineToPlain(doc.title).toUpperCase();
  lines.push({ text: title, keep: true }, { text: `=`.repeat(Math.min(width, title.length)), keep: true }, { text: ``, keep: true });
  pushBlocks(lines, doc.blocks, width);
  for (const s of doc.sections) pushSection(lines, s, width);

  const pages: PlainPage[] = [];
  let page: Line[] = [];
  const close = (carry: Line[]): void => {
    // Les lignes de fin de page qui exigent d'etre suivies passent sur la page suivante, sauf si la page entiere en est faite.
    let cut = page.length;
    while (cut > 0 && page[cut - 1].keep) cut--;
    if (cut === 0) cut = page.length;
    carry.push(...page.slice(cut));
    pages.push({ number: pages.length + 1, lines: page.slice(0, cut).map((l) => l.text) });
    page = [];
  };
  for (const line of lines) {
    if (page.length >= max) {
      const carry: Line[] = [];
      close(carry);
      page.push(...carry);
    }
    // Pas de ligne vide en haut d'une page.
    if (page.length === 0 && line.text === ``) continue;
    page.push(line);
  }
  // Retire les lignes vides de fin de document.
  while (page.length > 0 && page[page.length - 1].text === ``) page.pop();
  if (page.length > 0) pages.push({ number: pages.length + 1, lines: page.map((l) => l.text) });

  return { pages, wordCount: countWords(doc.blocks) + doc.sections.reduce((a, s) => a + countSectionWords(s), 0) };
}

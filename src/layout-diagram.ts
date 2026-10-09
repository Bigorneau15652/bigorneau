// Schema de la fenetre « Format de la page » : la feuille a l'echelle (format et orientation choisis), la zone de texte limitee par
// les marges et les colonnes. Les donnees sont calculees ici, sans Obsidian ; le dessin est un SVG construit avec le DOM.
import { gapOf, marginOf, PageLayout, size } from "./page-layout";

export interface DiagramData {
  // Taille du dessin en unites du schema (la plus grande dimension de la feuille vaut `box`).
  width: number;
  height: number;
  // Zone de texte et colonnes, dans les memes unites.
  text: { x: number; y: number; width: number; height: number };
  columns: { x: number; width: number }[];
  // Mesures reelles, en millimetres.
  sheetMm: { width: number; height: number };
  marginMm: number;
  gapMm: number;
  // Espaces entre colonnes, dans les unites du schema.
  gaps: { x: number; width: number }[];
}

const PT_TO_MM = 25.4 / 72;
const round = (n: number): number => Math.round(n * 10) / 10;

export function layoutDiagram(layout: PageLayout, box = 150): DiagramData {
  const s = size(layout);
  const k = box / Math.max(s.width, s.height);
  const margin = marginOf(layout);
  const textWidth = s.width - 2 * margin;
  const colWidth = (textWidth - (layout.columns - 1) * gapOf(layout)) / layout.columns;
  const columns = Array.from({ length: layout.columns }, (_, i) => ({ x: (margin + i * (colWidth + gapOf(layout))) * k, width: colWidth * k }));
  return {
    width: s.width * k,
    height: s.height * k,
    text: { x: margin * k, y: margin * k, width: textWidth * k, height: (s.height - 2 * margin) * k },
    columns,
    sheetMm: { width: round(s.width * PT_TO_MM), height: round(s.height * PT_TO_MM) },
    marginMm: round(margin * PT_TO_MM),
    gapMm: round(gapOf(layout) * PT_TO_MM),
    gaps: columns.slice(1).map((c) => ({ x: c.x - gapOf(layout) * k, width: gapOf(layout) * k })),
  };
}

const NS = `http://www.w3.org/2000/svg`;

function el(parent: Element, name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(parent: Element, x: number, y: number, text: string, anchor = `middle`): void {
  const node = el(parent, `text`, { x, y, "text-anchor": anchor, "font-size": 8, fill: `currentColor`, class: `mmw-diagram-text` });
  node.textContent = text;
}

// Dessine le schema dans `host` (remplace son contenu).
export function drawLayoutDiagram(host: HTMLElement, data: DiagramData, labels: { margin: string; sheet: string; gap: string }): void {
  host.empty();
  const pad = 22;
  const svg = el(host, `svg`, { viewBox: `0 0 ${data.width + 2 * pad} ${data.height + 2 * pad}`, width: Math.round(data.width + 2 * pad), height: Math.round(data.height + 2 * pad), role: `img`, "aria-label": labels.sheet }) as unknown as SVGSVGElement;
  const g = el(svg, `g`, { transform: `translate(${pad} ${pad})` });
  el(g, `rect`, { x: 0, y: 0, width: data.width, height: data.height, fill: `var(--background-primary)`, stroke: `currentColor`, "stroke-width": 1 });
  el(g, `rect`, { x: data.text.x, y: data.text.y, width: data.text.width, height: data.text.height, fill: `none`, stroke: `var(--text-accent)`, "stroke-dasharray": `3 2`, "stroke-width": 0.8 });
  for (const c of data.columns) {
    // Quelques traits pour figurer le texte de la colonne.
    const step = 7;
    for (let y = data.text.y + 4; y < data.text.y + data.text.height - 2; y += step) el(g, `line`, { x1: c.x + 2, x2: c.x + c.width - 2, y1: y, y2: y, stroke: `var(--text-faint)`, "stroke-width": 1.5 });
  }
  // Espace entre colonnes : bande coloree.
  for (const gp of data.gaps) el(g, `rect`, { x: gp.x, y: data.text.y, width: gp.width, height: data.text.height, fill: `var(--text-accent)`, opacity: 0.25 });
  // Cotes : largeur et hauteur de la feuille, largeur de la marge.
  label(g, data.width / 2, -8, `${data.sheetMm.width} mm`);
  const side = el(g, `text`, { x: -8, y: data.height / 2, "text-anchor": `middle`, "font-size": 8, fill: `currentColor`, class: `mmw-diagram-text`, transform: `rotate(-90 -8 ${data.height / 2})` });
  side.textContent = `${data.sheetMm.height} mm`;
  el(g, `line`, { x1: 0, x2: data.text.x, y1: data.text.y + 10, y2: data.text.y + 10, stroke: `var(--text-accent)`, "stroke-width": 1 });
  label(g, data.width / 2, data.height + 14, `${labels.margin} : ${data.marginMm} mm${data.gaps.length ? `  |  ${labels.gap} : ${data.gapMm} mm` : ``}`);
}

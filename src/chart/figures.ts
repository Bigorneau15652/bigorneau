// Charts of a note as pictures for the export: one SVG text per chart block, by the target that stands for the chart in the document tree.
import { renderChart } from "./render";
import { chartTarget, findCharts, parseChart } from "./spec";

export function chartSvgs(text: string, decimal: `,` | `.`): Map<string, string> {
  const out = new Map<string, string>();
  for (const found of findCharts(text)) {
    const target = chartTarget(found.source);
    if (!out.has(target)) out.set(target, renderChart(parseChart(found.source), { decimal }));
  }
  return out;
}

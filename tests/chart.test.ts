import { test } from "node:test";
import assert from "node:assert/strict";
import { chartBlock, chartTarget, cleanColor, defaultChart, findCharts, parseChart, parseNumber, parseTable, replaceChart, serializeChart } from "../src/chart/spec";
import { buildExportDoc } from "../src/export/doc-tree";
import { isImageTarget } from "../src/export/image";
import { formatNumber, niceScale, renderChart } from "../src/chart/render";

// Light check that the SVG is well formed: every opening tag is closed (no XML parser needed).
function wellFormed(svg: string): void {
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g)) {
    if (m[4] === `/`) continue;
    if (m[1] === `/`) assert.equal(stack.pop(), m[2]);
    else stack.push(m[2]);
  }
  assert.equal(stack.length, 0);
}

test(`graphique : lecture et ecriture du bloc`, () => {
  const spec = parseChart([`type: line`, `title: Ventes de l'annee`, `x-title: Mois`, `legend: oui`, `values: true`, `colors: #f00, zzz, #00ff00`, `data:`, `;Serie A;Serie B;Serie C`, `Jan;1,5;2;`, `Fev;3;x;4`].join(`\n`));
  assert.equal(spec.type, `line`);
  assert.equal(spec.title, `Ventes de l'annee`);
  assert.equal(spec.showValues, true);
  assert.deepEqual(spec.categories, [`Jan`, `Fev`]);
  assert.deepEqual(spec.series.map((s) => s.name), [`Serie A`, `Serie B`, `Serie C`]);
  assert.deepEqual(spec.series[0].values, [1.5, 3]);
  assert.deepEqual(spec.series[1].values, [2, null]);
  assert.deepEqual(spec.series[2].values, [null, 4]);
  assert.deepEqual(spec.colors, [`#ff0000`, ``, `#00ff00`]);
  // Writing then reading gives the same chart.
  assert.deepEqual(parseChart(serializeChart(spec)), spec);
  assert.ok(chartBlock(spec).startsWith("```bigorneau-chart\n"));
});

test(`graphique : valeurs invalides, couleurs et blocs trouves dans une note`, () => {
  assert.equal(parseNumber(`1 234,5`), 1234.5);
  assert.equal(parseNumber(``), null);
  assert.ok(Number.isNaN(parseNumber(`abc`)));
  assert.equal(cleanColor(`#ABC`), `#aabbcc`);
  assert.equal(cleanColor(`red`), null);
  assert.equal(cleanColor(`#12345`), null);
  // An empty block gives the default chart; unknown lines are ignored.
  assert.deepEqual(parseChart(``), defaultChart());
  assert.equal(parseChart(`type: radar\nfoo: bar`).type, `bar`);
  const note = [`# T`, ``, "```bigorneau-chart", `type: pie`, `data:`, `;V`, `A;1`, "```", ``, "```js", `x`, "```", "```bigorneau-chart", `type: bar`].join(`\n`);
  const found = findCharts(note);
  assert.equal(found.length, 1);
  assert.deepEqual([found[0].startLine, found[0].endLine], [2, 7]);
  assert.equal(chartTarget(found[0].source), chartTarget(`${found[0].source}\n`));
  assert.notEqual(chartTarget(`type: pie`), chartTarget(`type: bar`));
});

test(`graphique : echelle lisible et dessin des trois types`, () => {
  const s = niceScale(0, 47);
  assert.deepEqual([s.min, s.max, s.step], [0, 50, 10]);
  assert.deepEqual(niceScale(-3, 8).ticks, [-5, 0, 5, 10]);
  assert.ok(niceScale(5, 5).max > niceScale(5, 5).min);
  assert.equal(formatNumber(1.234, `,`), `1,23`);
  const base = parseChart([`type: bar`, `values: true`, `data:`, `;A;B`, `x;1;2`, `y;3;-4`, `z;;5`].join(`\n`));
  for (const type of [`bar`, `line`, `pie`] as const) {
    for (const extra of [{}, { horizontal: true }, { stacked: true }]) {
      const svg = renderChart({ ...base, type, ...extra, xTitle: `Axe <x>`, yTitle: `Y` }, { decimal: `,` });
      assert.ok(svg.startsWith(`<svg `) && svg.endsWith(`</svg>`), type);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${type} ${JSON.stringify(extra)}`);
      wellFormed(svg);
    }
  }
  // The text is escaped.
  assert.ok(renderChart({ ...base, xTitle: `a<b&c` }).includes(`a&lt;b&amp;c`));
  // Empty and one-slice charts do not fail.
  assert.ok(renderChart({ ...defaultChart(), type: `pie`, series: [{ name: ``, values: [0, 0, 0] }] }).includes(`—`));
  assert.ok(renderChart({ ...defaultChart(), type: `pie`, series: [{ name: ``, values: [4, 0, 0] }] }).includes(`<circle`));
});

test(`graphique : cellules collees, remplacement du bloc et figure de l'export`, () => {
  const table = parseTable(`\tA\tB\nx\t1,5\t2\ny\t3\t`);
  assert.deepEqual(table?.categories, [`x`, `y`]);
  assert.deepEqual(table?.series.map((s) => s.values), [[1.5, 3], [2, null]]);
  assert.equal(parseTable(`seulement une ligne`), null);
  const note = [`avant`, "```bigorneau-chart", `type: pie`, "```", `apres`].join(`\n`);
  const found = findCharts(note)[0];
  const next = replaceChart(note, found, chartBlock({ ...defaultChart(), type: `line`, title: `T` }));
  assert.ok(next.startsWith(`avant\n`) && next.endsWith(`\napres`));
  assert.equal(findCharts(next)[0].source.includes(`type: line`), true);
  // In the export, the chart is a figure whose caption is its title and whose target stands for the chart.
  const doc = buildExportDoc([`# N`, ``, "```bigorneau-chart", `type: bar`, `title: Ventes`, `data:`, `;A`, `x;1`, "```", ``, `texte`].join(`\n`), `N.md`);
  const fig = doc.sections[0].blocks.find((b) => b.type === `figure`) ?? doc.blocks.find((b) => b.type === `figure`);
  assert.ok(fig && fig.type === `figure`);
  if (fig && fig.type === `figure`) {
    assert.equal(fig.caption, `Ventes`);
    assert.equal(isImageTarget(fig.target), true);
    assert.ok(fig.target.startsWith(`bigorneau-chart:`));
  }
});

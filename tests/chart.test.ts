import { test } from "node:test";
import assert from "node:assert/strict";
import { chartBlock, chartTarget, cleanColor, defaultChart, findCharts, parseChart, parseNumber, parseTable, replaceChart, serializeChart } from "../src/chart/spec";
import { buildExportDoc } from "../src/export/doc-tree";
import { isImageTarget } from "../src/export/image";
import { formatNumber, niceScale, renderChart, valueText } from "../src/chart/render";
import { paletteColor } from "../src/chart/spec";

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
  assert.equal(spec.valueMode, `value`);
  assert.equal(spec.legend, `bottom`);
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
  assert.equal(parseChart(`type: camembert\nfoo: bar`).type, `bar`);
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
  // Without a row of names, the first row is data (it holds numbers): nothing is lost.
  const days = parseTable(`Lundi\t35\t14\nMardi\t25\t53\nMercredi\t15\t86`);
  assert.deepEqual(days?.categories, [`Lundi`, `Mardi`, `Mercredi`]);
  assert.deepEqual(days?.series.map((x) => [x.name, x.values]), [[``, [35, 25, 15]], [``, [14, 53, 86]]]);
  // A row of names stays a row of names; the choice can be forced.
  assert.deepEqual(parseTable(`\tT1\tT2\nMardi\t25\t53`)?.series.map((x) => x.name), [`T1`, `T2`]);
  assert.deepEqual(parseTable(`2020\t2021\nx\t1`, { header: true })?.series.map((x) => x.name), [`2021`]);
  assert.equal(parseTable(`Lundi\t35\t14`)?.categories.length, 1);
  assert.deepEqual(parseTable(`A\tB\nx\t1`, { header: false })?.categories, [`A`, `x`]);
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

test(`graphique : styles de couleurs, legende placee, valeurs et pourcentages`, () => {
  // Old files: `values: true` and `legend: false` keep their meaning, the new words are read.
  assert.equal(parseChart(`values: false`).valueMode, `none`);
  assert.equal(parseChart(`values: pourcentages`).valueMode, `percent`);
  assert.equal(parseChart(`values: both`).valueMode, `both`);
  assert.equal(parseChart(`legend: false`).legend, `none`);
  assert.equal(parseChart(`legend: gauche`).legend, `left`);
  assert.equal(parseChart(`legend: dessus`).legend, `top`);
  assert.equal(parseChart(`palette: pastel`).palette, `pastel`);
  assert.equal(parseChart(`palette: inconnu`).palette, `default`);
  const spec = parseChart(`type: bar\nvalues: both\nlegend: right\npalette: gray\ndata:\n;A;B\nx;1;3\ny;2;2`);
  assert.deepEqual(parseChart(serializeChart(spec)), spec);
  // The ramps spread their colours from dark to light over the series.
  assert.notEqual(paletteColor(`blue`, 0, 4), paletteColor(`blue`, 3, 4));
  assert.equal(paletteColor(`acid`, 0, 3), paletteColor(`acid`, 12, 3));
  // Values: nothing, data, percentage of the total, or both.
  assert.equal(valueText(`none`, 5, 20, `,`), ``);
  assert.equal(valueText(`value`, 5, 20, `,`), `5`);
  assert.equal(valueText(`percent`, 5, 20, `,`), `25 %`);
  assert.equal(valueText(`both`, 1.5, 6, `,`), `1,5 (25 %)`);
  assert.equal(valueText(`percent`, 1, 0, `.`), `0 %`);
  // Every legend place, every style and every value mode give a clean picture; the grey style is hatched.
  for (const type of [`bar`, `line`, `pie`] as const) {
    for (const legend of [`top`, `bottom`, `left`, `right`, `none`] as const) {
      for (const palette of [`default`, `acid`, `pastel`, `blue`, `red`, `green`, `gray`] as const) {
        const svg = renderChart({ ...spec, type, legend, palette, valueMode: `both` }, { decimal: `,` });
        assert.ok(!/NaN|undefined|Infinity/.test(svg), `${type} ${legend} ${palette}`);
        wellFormed(svg);
        if (palette === `gray`) assert.ok(svg.includes(`<pattern`) && (type === `line` || svg.includes(`url(#mmw-hatch-0)`)));
        else assert.ok(!svg.includes(`<pattern`));
      }
    }
  }
  // No legend: the names of the series are not drawn.
  assert.ok(!renderChart({ ...spec, legend: `none`, palette: `default`, series: spec.series.map((x, i) => ({ ...x, name: `Zorglub${i}` })) }).includes(`Zorglub`));
  assert.ok(renderChart({ ...spec, legend: `left`, palette: `default`, series: spec.series.map((x, i) => ({ ...x, name: `Zorglub${i}` })) }).includes(`Zorglub0`));
});

test(`graphique : aires, anneau, nuage de points et radar`, () => {
  const base = parseChart([`type: area`, `stacked: true`, `values: both`, `legend: top`, `data:`, `;A;B`, `x;1;3`, `y;2;`, `z;4;2`, `w;3;1`].join(`\n`));
  assert.equal(base.type, `area`);
  assert.equal(base.stacked, true);
  for (const type of [`bar`, `line`, `area`, `pie`, `donut`, `scatter`, `radar`] as const) {
    // The type is written and read back; the grid and the stacking are written only where they mean something.
    const spec = { ...base, type };
    assert.deepEqual(parseChart(serializeChart(spec)).type, type);
    assert.equal(serializeChart(spec).includes(`stacked:`), type === `bar` || type === `area`, type);
    assert.equal(serializeChart(spec).includes(`grid:`), type !== `pie` && type !== `donut`, type);
    for (const legend of [`top`, `bottom`, `left`, `right`, `none`] as const) {
      for (const palette of [`default`, `gray`, `pastel`] as const) {
        for (const stacked of [false, true]) {
          const svg = renderChart({ ...spec, legend, palette, stacked }, { decimal: `,` });
          assert.ok(!/NaN|undefined|Infinity/.test(svg), `${type} ${legend} ${palette}`);
          wellFormed(svg);
        }
      }
    }
  }
  // Areas are filled surfaces; the grey style hatches them; a donut has its total in the hole; a radar needs three axes.
  assert.ok(renderChart({ ...base, type: `area`, stacked: false, palette: `default` }).includes(`fill-opacity="0.55"`));
  assert.ok(renderChart({ ...base, type: `area`, palette: `gray` }).includes(`url(#mmw-hatch-0)`));
  assert.ok(renderChart({ ...base, type: `donut`, series: [{ name: ``, values: [1, 2, 3, 4] }] }).includes(`>10</text>`));
  assert.ok(renderChart({ ...defaultChart(), type: `donut`, series: [{ name: ``, values: [4, 0, 0] }] }).includes(`fill-rule="evenodd"`));
  assert.ok(renderChart({ ...base, type: `radar`, categories: [`a`, `b`], series: [{ name: `s`, values: [1, 2] }] }).includes(`—`));
  // Scatter: the first column gives X, a text that is not a number is replaced by the rank of the row, a series can have empty cells.
  const scatter = renderChart({ ...base, type: `scatter`, categories: [`1,5`, `abc`, `4`, `10`], showGrid: true });
  assert.ok(scatter.includes(`<circle`) && !/NaN/.test(scatter));
  assert.ok(renderChart({ ...base, type: `scatter`, palette: `gray`, series: [0, 1, 2, 3].map((i) => ({ name: `s${i}`, values: [1, 2, 3, 4] })) }).includes(`<rect x=`));
  // Empty data does not fail.
  for (const type of [`area`, `donut`, `scatter`, `radar`] as const) assert.ok(renderChart({ ...defaultChart(), type, categories: [``], series: [{ name: ``, values: [null] }] }).startsWith(`<svg`));
});

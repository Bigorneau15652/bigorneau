// Official module "Charts": draws the charts written in a note (fenced blocks named bigorneau-chart) as pictures in live preview and in
// reading mode, and adds the chart editor (button and command): type of chart, numbers typed or pasted, style and live preview. The
// export (PDF and HTML) draws the same charts whether the module is on or not.
import type { Editor, TFile } from "obsidian";
import { openChartEditor } from "./chart-modal";
import { renderChart } from "./chart/render";
import { CHART_LANG, chartBlock, ChartSpec, defaultChart, findCharts, FoundChart, parseChart, replaceChart } from "./chart/spec";
import { ICON_CHART } from "./custom-icons";
import { appendSvgDocument } from "./dom";
import type { OfficialScript } from "./scripts";

export const CHARTS_SCRIPT: OfficialScript = {
  id: `charts`,
  name: { fr: `Graphiques`, en: `Charts` },
  description: {
    fr: `Crée des graphiques (barres, courbes, secteurs) à partir de nombres saisis ou collés, avec un éditeur à aperçu en direct. Le graphique est écrit dans la note et dessiné dans l'aperçu et dans l'export.`,
    en: `Creates charts (bars, lines, pie) from numbers typed or pasted, with an editor that has a live preview. The chart is written in the note and drawn in the preview and in the export.`,
  },
  version: `1.0.0`,
  requires: [],
  defaultEnabled: false,
  load(api) {
    const obsidian = api.obsidian as typeof import("obsidian");
    const decimal = (): `,` | `.` => (api.language() === `fr` ? `,` : `.`);
    const editorName = (): string => (api.language() === `fr` ? `Éditeur de graphiques` : `Chart editor`);

    // Opens the editor on a chart, and gives the result back.
    const edit = (spec: ChartSpec, editing: boolean, onSubmit: (spec: ChartSpec) => void): void => {
      openChartEditor({ app: api.app, obsidian, lang: api.language(), spec, editing, onSubmit });
    };

    // From the editor of the open note: the chart under the cursor is edited, otherwise a new chart is inserted at the cursor.
    const openForEditor = (editor: Editor): void => {
      const text = editor.getValue();
      const cursor = editor.getCursor();
      const found = findCharts(text).find((c) => cursor.line >= c.startLine && cursor.line <= c.endLine) ?? null;
      edit(found ? parseChart(found.source) : defaultChart(), found !== null, (spec) => {
        const block = chartBlock(spec);
        // The note may have changed while the window was open: the chart is searched again by its text.
        const again = found ? findCharts(editor.getValue()).find((c) => c.source === found.source) : undefined;
        if (again) {
          editor.replaceRange(block, { line: again.startLine, ch: 0 }, { line: again.endLine, ch: editor.getLine(again.endLine).length });
          return;
        }
        // New chart: on its own lines, with an empty line before and after.
        const line = editor.getLine(cursor.line);
        if (line.trim() === ``) editor.replaceRange(`${block}\n`, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
        else editor.replaceRange(`\n\n${block}\n`, { line: cursor.line, ch: line.length });
      });
    };

    // From the picture shown in the note: the block that starts at this line of the file is edited.
    const openForBlock = async (sourcePath: string, startLine: number | undefined): Promise<void> => {
      const file = api.app.vault.getAbstractFileByPath(sourcePath);
      if (!file || !(file instanceof obsidian.TFile)) return;
      const text = await api.app.vault.cachedRead(file as TFile);
      const charts = findCharts(text);
      const found: FoundChart | undefined = charts.find((c) => c.startLine === startLine) ?? (charts.length === 1 ? charts[0] : undefined);
      if (!found) return;
      edit(parseChart(found.source), true, (spec) => {
        void api.app.vault.process(file as TFile, (data) => {
          const same = findCharts(data).find((c) => c.startLine === found.startLine && c.source === found.source) ?? findCharts(data).find((c) => c.source === found.source);
          return same ? replaceChart(data, same, chartBlock(spec)) : data;
        });
      });
    };

    api.registerCodeBlock(CHART_LANG, (source, el, ctx) => {
      el.empty();
      el.addClass(`mmw-chart-block`);
      const spec = parseChart(source);
      appendSvgDocument(el, renderChart(spec, { decimal: decimal() }));
      if (spec.title !== ``) el.createDiv({ cls: `mmw-chart-caption`, text: spec.title });
      const button = el.createEl(`button`, { cls: `mmw-chart-edit clickable-icon`, attr: { type: `button`, "aria-label": editorName() } });
      obsidian.setIcon(button, ICON_CHART);
      button.addEventListener(`click`, () => void openForBlock(ctx.sourcePath, ctx.getSectionInfo(el)?.lineStart));
    });

    api.addFunction({
      id: `edit-chart`,
      name: { fr: `Éditeur de graphiques`, en: `Chart editor` },
      icon: [ICON_CHART, `bar-chart-3`, `chart-column`],
      needsEditor: true,
      run: ({ editor }) => {
        if (editor) openForEditor(editor);
      },
    });

    api.addHelp([
      {
        id: `editor`,
        title: { fr: `Graphiques`, en: `Charts` },
        text: {
          fr: `Le module Graphiques, désactivé par défaut (bouton bigorneau du panneau), ajoute un bouton Éditeur de graphiques. La fenêtre propose trois types (barres, courbes, secteurs), un titre qui devient la légende de la figure dans l'export, un tableau de nombres à saisir ou à coller depuis un tableur (Excel, LibreOffice, CSV), le style (couleurs de chaque série ou de chaque part, valeurs affichées, légende, grille, titres des axes, barres horizontales ou empilées) et un aperçu en direct. Le graphique est écrit dans la note sous la forme d'un bloc de texte nommé bigorneau-chart : l'aperçu en direct et la lecture le dessinent, l'export PDF et HTML le dessinent aussi, avec le titre comme légende. Pour le modifier, placez le curseur dans le graphique puis cliquez sur le bouton Éditeur de graphiques, ou cliquez sur l'icône de graphique en haut à droite du dessin.`,
          en: `The Charts module, off by default (bigorneau button of the panel), adds a Chart editor button. The window offers three types (bars, lines, pie), a title that becomes the caption of the figure in the export, a table of numbers to type or to paste from a spreadsheet (Excel, LibreOffice, CSV), the style (colour of each series or each slice, values shown, legend, grid, titles of the axes, horizontal or stacked bars) and a live preview. The chart is written in the note as a block of text named bigorneau-chart: live preview and reading mode draw it, and the PDF and HTML export draw it too, with the title as caption. To change it, put the cursor in the chart and click the Chart editor button, or click the chart icon at the top right of the drawing.`,
        },
        keywords: { fr: `graphique graphiques courbe barres secteurs camembert histogramme tableau donnees excel csv`, en: `chart charts graph bars lines pie histogram data table excel csv` },
      },
    ]);
  },
};

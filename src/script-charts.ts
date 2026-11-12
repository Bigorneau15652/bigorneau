// Official module "Charts": draws the charts written in a note (fenced blocks named bigorneau-chart) as pictures in live preview and in
// reading mode, and adds the chart editor (button and command): type of chart, numbers typed or pasted, style and live preview. The
// export (PDF and HTML) draws the same charts whether the module is on or not.
import type { Editor, TFile } from "obsidian";
import { openChartEditor } from "./chart-modal";
import { renderChart } from "./chart/render";
import { CHART_LANG, chartBlock, ChartSpec, clampSize, defaultChart, findCharts, FoundChart, MAX_HEIGHT, MAX_WIDTH, MIN_HEIGHT, MIN_WIDTH, parseChart, replaceChart } from "./chart/spec";
import { SPREADSHEET_EXT } from "./chart/spreadsheet";
import { ICON_CHART } from "./custom-icons";
import { inflate } from "./font-import";
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

    // Spreadsheet files of the vault, for the import of the chart editor.
    const files = {
      list: (): string[] =>
        api.app.vault
          .getFiles()
          .filter((f) => SPREADSHEET_EXT.test(f.name))
          .map((f) => f.path)
          .sort((a, b) => a.localeCompare(b)),
      read: async (path: string): Promise<Uint8Array> => {
        const file = api.app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof obsidian.TFile)) throw new Error(`file not found`);
        return new Uint8Array(await api.app.vault.readBinary(file as TFile));
      },
    };

    // Opens the editor on a chart, and gives the result back.
    const edit = (spec: ChartSpec, editing: boolean, onSubmit: (spec: ChartSpec) => void): void => {
      openChartEditor({ app: api.app, obsidian, lang: api.language(), spec, editing, onSubmit, files, inflate });
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

    // Writes a new size of the drawing in the block that starts at this line of the file.
    const saveSize = async (sourcePath: string, startLine: number | undefined, width: number, height: number): Promise<void> => {
      const file = api.app.vault.getAbstractFileByPath(sourcePath);
      if (!file || !(file instanceof obsidian.TFile)) return;
      await api.app.vault.process(file as TFile, (data) => {
        const charts = findCharts(data);
        const found = charts.find((c) => c.startLine === startLine) ?? (charts.length === 1 ? charts[0] : undefined);
        if (!found) return data;
        const next = parseChart(found.source);
        next.width = width;
        next.height = height;
        return replaceChart(data, found, chartBlock(next));
      });
    };

    api.registerCodeBlock(CHART_LANG, (source, el, ctx) => {
      el.empty();
      el.addClass(`mmw-chart-block`);
      const spec = parseChart(source);
      // The drawing sits in a frame with a handle on each corner: dragging a handle draws the chart again at the new size, and the text keeps its size.
      const frame = el.createDiv({ cls: `mmw-chart-frame` });
      const host = frame.createDiv({ cls: `mmw-chart-host` });
      const draw = (): void => {
        host.empty();
        appendSvgDocument(host, renderChart(spec, { decimal: decimal() }));
        frame.style.maxWidth = `${spec.width}px`;
      };
      draw();
      for (const corner of [`nw`, `ne`, `sw`, `se`]) {
        const handle = frame.createDiv({ cls: `mmw-chart-handle mmw-chart-handle-${corner}`, attr: { "aria-label": api.language() === `fr` ? `Tirer pour redimensionner` : `Drag to resize` } });
        const sx = corner.endsWith(`w`) ? -1 : 1;
        const sy = corner.startsWith(`n`) ? -1 : 1;
        handle.addEventListener(`pointerdown`, (down: PointerEvent) => {
          down.preventDefault();
          down.stopPropagation();
          handle.setPointerCapture(down.pointerId);
          const startW = spec.width;
          const startH = spec.height;
          const shown = host.getBoundingClientRect().width;
          const scale = shown > 0 ? shown / startW : 1;
          const move = (event: PointerEvent): void => {
            spec.width = clampSize(startW + (sx * (event.clientX - down.clientX)) / scale, MIN_WIDTH, MAX_WIDTH, startW);
            spec.height = clampSize(startH + (sy * (event.clientY - down.clientY)) / scale, MIN_HEIGHT, MAX_HEIGHT, startH);
            draw();
          };
          const end = (): void => {
            handle.removeEventListener(`pointermove`, move);
            handle.removeEventListener(`pointerup`, end);
            handle.removeEventListener(`pointercancel`, end);
            if (spec.width !== startW || spec.height !== startH) void saveSize(ctx.sourcePath, ctx.getSectionInfo(el)?.lineStart, spec.width, spec.height);
          };
          handle.addEventListener(`pointermove`, move);
          handle.addEventListener(`pointerup`, end);
          handle.addEventListener(`pointercancel`, end);
        });
        // A double click on a handle must not open the editor.
        handle.addEventListener(`dblclick`, (event) => event.stopPropagation());
      }
      if (spec.title !== ``) el.createDiv({ cls: `mmw-chart-caption`, text: spec.title });
      const button = el.createEl(`button`, { cls: `mmw-chart-edit clickable-icon`, attr: { type: `button`, "aria-label": editorName() } });
      obsidian.setIcon(button, ICON_CHART);
      const open = (): void => void openForBlock(ctx.sourcePath, ctx.getSectionInfo(el)?.lineStart);
      button.addEventListener(`click`, open);
      // A double click on the picture opens the editor too (the code of the block is not shown).
      el.addEventListener(`dblclick`, (event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      });
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
          fr: `Le module Graphiques, désactivé par défaut (bouton bigorneau du panneau), ajoute un bouton Éditeur de graphiques. La fenêtre propose sept types (barres, courbes, aires, secteurs, anneau, nuage de points, radar), un titre qui devient la légende de la figure dans l'export, un tableau de nombres à saisir, à coller depuis un tableur ou à importer d'un fichier CSV, Excel (xlsx) ou LibreOffice (ods) du coffre ou de l'ordinateur (feuille, plage et inversion des lignes et des colonnes au choix, bouton Actualiser pour relire un fichier du coffre ; les nombres sont copiés dans le graphique), un style de couleurs (défaut, acide, pastel, camaïeux de bleus, de rouges ou de verts, noir et blanc avec des hachures) puis, au choix, la couleur de chaque série ou de chaque part, les valeurs affichées (aucune, données, pourcentages ou les deux), la légende (dessus, dessous, à gauche, à droite ou aucune), la grille, les titres des axes, les barres horizontales ou empilées, une unité et un nombre de décimales pour les nombres affichés, des lignes de seuil ou de moyenne, la taille du dessin, et un aperçu en direct. Le graphique est écrit dans la note sous la forme d'un bloc de texte nommé bigorneau-chart : l'aperçu en direct et la lecture le dessinent, l'export PDF et HTML le dessinent aussi, avec le titre comme légende. Pour changer la taille, tirez les poignées des coins du dessin dans la note : l'écriture ne se déforme pas. Pour le modifier, double-cliquez sur le dessin, ou cliquez sur l'icône de graphique en haut à droite, ou placez le curseur dans le graphique puis cliquez sur le bouton Éditeur de graphiques.`,
          en: `The Charts module, off by default (bigorneau button of the panel), adds a Chart editor button. The window offers seven types (bars, lines, areas, pie, donut, scatter, radar), a title that becomes the caption of the figure in the export, a table of numbers to type, to paste from a spreadsheet or to import from a CSV, Excel (xlsx) or LibreOffice (ods) file of the vault or of the computer (sheet, range and swap of rows and columns at will, an Update button to read a file of the vault again; the numbers are copied into the chart), a colour style (default, acid, pastel, shades of blue, red or green, black and white with hatching) then, as you wish, the colour of each series or slice, the values shown (none, data, percentages or both), the legend (above, below, left, right or none), the grid, the titles of the axes, horizontal or stacked bars (areas too), a unit and a number of decimals for the numbers shown, threshold or mean lines, the size of the drawing, and a live preview. For a scatter chart, the first column of the table gives the X values and each series gives the Y values; for a radar, each category is an axis (at least three are needed). The chart is written in the note as a block of text named bigorneau-chart: live preview and reading mode draw it, and the PDF and HTML export draw it too, with the title as caption. To change the size, drag the handles at the corners of the drawing in the note: the text is not distorted. To edit it, double-click the drawing, or click the chart icon at its top right, or put the cursor in the chart and click the Chart editor button.`,
        },
        keywords: { fr: `graphique graphiques courbe barres secteurs camembert histogramme tableau donnees excel csv`, en: `chart charts graph bars lines pie histogram data table excel csv` },
      },
    ]);
  },
};

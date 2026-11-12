// Window of the chart editor: type of chart, title, numbers typed or pasted, style (colours, labels, legend, axes), and a live preview. It
// is opened by the Charts module, which gives it the Obsidian module: this file imports Obsidian only for its types.
import type { App } from "obsidian";
import { renderChart } from "./chart/render";
import { CHART_PALETTES, ChartPalette, ChartSpec, ChartType, cleanColor, LEGEND_POSITIONS, LegendPosition, MAX_CATEGORIES, MAX_SERIES, parseNumber, parseTable, seriesColor, ValueMode, VALUE_MODES } from "./chart/spec";
import { appendSvgDocument } from "./dom";
import type { HelpLang } from "./help";

export interface ChartEditorDeps {
  app: App;
  obsidian: typeof import("obsidian");
  lang: HelpLang;
  // Chart to start from (the default chart for a new one), and whether it is the chart of a block that already exists.
  spec: ChartSpec;
  editing: boolean;
  onSubmit: (spec: ChartSpec) => void;
}

const TEXTS = {
  title: { fr: `Éditeur de graphiques`, en: `Chart editor` },
  type: { fr: `Type de graphique`, en: `Type of chart` },
  bar: { fr: `Barres`, en: `Bars` },
  line: { fr: `Courbes`, en: `Lines` },
  pie: { fr: `Secteurs`, en: `Pie` },
  palette: { fr: `Style de couleurs`, en: `Colour style` },
  chartTitle: { fr: `Titre du graphique (légende de la figure)`, en: `Title of the chart (caption of the figure)` },
  xTitle: { fr: `Titre de l'axe horizontal`, en: `Title of the horizontal axis` },
  yTitle: { fr: `Titre de l'axe vertical`, en: `Title of the vertical axis` },
  valueMode: { fr: `Valeurs affichées`, en: `Values shown` },
  legend: { fr: `Légende`, en: `Legend` },
  grid: { fr: `Afficher la grille`, en: `Show the grid` },
  horizontal: { fr: `Barres horizontales`, en: `Horizontal bars` },
  stacked: { fr: `Barres empilées`, en: `Stacked bars` },
  data: { fr: `Données`, en: `Data` },
  category: { fr: `Catégorie`, en: `Category` },
  sliceHead: { fr: `Secteur`, en: `Slice` },
  valueHead: { fr: `Valeur`, en: `Value` },
  categoryName: { fr: `Nom de la catégorie`, en: `Name of the category` },
  sliceName: { fr: `Nom du secteur`, en: `Name of the slice` },
  seriesName: { fr: `Nom de la série`, en: `Name of the series` },
  datum: { fr: `Donnée`, en: `Data` },
  addRow: { fr: `Ajouter une catégorie`, en: `Add a category` },
  addSlice: { fr: `Ajouter un secteur`, en: `Add a slice` },
  addSeries: { fr: `Ajouter une série`, en: `Add a series` },
  removeRow: { fr: `Retirer cette ligne`, en: `Remove this row` },
  removeSeries: { fr: `Retirer cette série`, en: `Remove this series` },
  colour: { fr: `Couleur`, en: `Colour` },
  paste: { fr: `Coller des cellules (Excel, LibreOffice, CSV)`, en: `Paste cells (Excel, LibreOffice, CSV)` },
  pasteHelp: { fr: `Copiez des cellules dans votre tableur, collez-les ici : la première ligne donne les noms des séries, la première colonne les catégories.`, en: `Copy cells in your spreadsheet and paste them here: the first row gives the names of the series, the first column the categories.` },
  pasteUse: { fr: `Utiliser ces cellules`, en: `Use these cells` },
  pasteBad: { fr: `Ces cellules ne contiennent pas de tableau lisible (il faut au moins une ligne de noms et une ligne de nombres).`, en: `These cells do not hold a readable table (a row of names and a row of numbers are needed).` },
  badNumber: { fr: `Ce n'est pas un nombre`, en: `Not a number` },
  insert: { fr: `Insérer`, en: `Insert` },
  replace: { fr: `Enregistrer les modifications`, en: `Save the changes` },
  cancel: { fr: `Annuler`, en: `Cancel` },
  preview: { fr: `Aperçu`, en: `Preview` },
} as const;

type TextId = keyof typeof TEXTS;

const PALETTE_NAMES: Record<ChartPalette, { fr: string; en: string }> = {
  default: { fr: `Défaut`, en: `Default` },
  acid: { fr: `Acide`, en: `Acid` },
  pastel: { fr: `Pastel`, en: `Pastel` },
  blue: { fr: `Camaïeu de bleus`, en: `Shades of blue` },
  red: { fr: `Camaïeu de rouges`, en: `Shades of red` },
  green: { fr: `Camaïeu de verts`, en: `Shades of green` },
  gray: { fr: `Noir et blanc (gris et hachures)`, en: `Black and white (greys and hatching)` },
};

const VALUE_NAMES: Record<ValueMode, { fr: string; en: string }> = {
  none: { fr: `Aucune`, en: `None` },
  value: { fr: `Données`, en: `Data` },
  percent: { fr: `Pourcentages`, en: `Percentages` },
  both: { fr: `Données et pourcentages`, en: `Data and percentages` },
};

const LEGEND_NAMES: Record<LegendPosition, { fr: string; en: string }> = {
  top: { fr: `Dessus`, en: `Above` },
  bottom: { fr: `Dessous`, en: `Below` },
  left: { fr: `À gauche`, en: `At the left` },
  right: { fr: `À droite`, en: `At the right` },
  none: { fr: `Pas de légende`, en: `No legend` },
};

interface State {
  type: ChartType;
  title: string;
  xTitle: string;
  yTitle: string;
  horizontal: boolean;
  stacked: boolean;
  valueMode: ValueMode;
  legend: LegendPosition;
  palette: ChartPalette;
  showGrid: boolean;
  categories: string[];
  names: string[];
  // Text of the cells, row by row (what has been typed, so that a number being typed is never rewritten).
  cells: string[][];
  colors: string[];
}

function fromSpec(spec: ChartSpec): State {
  return {
    type: spec.type,
    title: spec.title,
    xTitle: spec.xTitle,
    yTitle: spec.yTitle,
    horizontal: spec.horizontal,
    stacked: spec.stacked,
    valueMode: spec.valueMode,
    legend: spec.legend,
    palette: spec.palette,
    showGrid: spec.showGrid,
    categories: [...spec.categories],
    names: spec.series.map((s) => s.name),
    cells: spec.categories.map((_c, i) => spec.series.map((s) => (s.values[i] === null || s.values[i] === undefined ? `` : String(s.values[i])))),
    colors: [...spec.colors],
  };
}

function toSpec(st: State): ChartSpec {
  return {
    type: st.type,
    title: st.title,
    xTitle: st.xTitle,
    yTitle: st.yTitle,
    horizontal: st.horizontal,
    stacked: st.stacked,
    valueMode: st.valueMode,
    legend: st.legend,
    palette: st.palette,
    showGrid: st.showGrid,
    categories: [...st.categories],
    series: st.names.map((name, s) => ({
      name,
      values: st.categories.map((_c, i) => {
        const n = parseNumber(st.cells[i]?.[s] ?? ``);
        return n === null || Number.isNaN(n) ? null : n;
      }),
    })),
    colors: [...st.colors],
  };
}

export function openChartEditor(deps: ChartEditorDeps): void {
  const { Modal } = deps.obsidian;
  const lang = deps.lang;
  const tr = (id: TextId): string => TEXTS[id][lang];
  const decimal: `,` | `.` = lang === `fr` ? `,` : `.`;

  class ChartModal extends Modal {
    private st: State = fromSpec(deps.spec);
    private preview!: HTMLElement;
    private tableBox!: HTMLElement;
    private optionsBox!: HTMLElement;
    private timer = 0;

    onOpen(): void {
      this.titleEl.setText(tr(`title`));
      this.modalEl.addClass(`mmw-chartmodal`);
      const body = this.contentEl.createDiv({ cls: `mmw-chart-layout` });
      const left = body.createDiv({ cls: `mmw-chart-left` });
      const right = body.createDiv({ cls: `mmw-chart-right` });
      right.createEl(`h4`, { text: tr(`preview`) });
      this.preview = right.createDiv({ cls: `mmw-chart-preview` });

      // Type of chart.
      const typeRow = left.createDiv({ cls: `mmw-chart-row` });
      typeRow.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`type`) });
      const types: ChartType[] = [`bar`, `line`, `pie`];
      const typeButtons = typeRow.createDiv({ cls: `mmw-chart-types` });
      for (const type of types) {
        const b = typeButtons.createEl(`button`, { cls: `mmw-dlg-btn`, text: tr(type), attr: { type: `button` } });
        b.toggleClass(`mod-cta`, this.st.type === type);
        b.addEventListener(`click`, () => {
          this.st.type = type;
          for (const sibling of Array.from(typeButtons.children)) sibling.removeClass(`mod-cta`);
          b.addClass(`mod-cta`);
          this.renderOptions();
          this.renderTable();
          this.refresh();
        });
      }

      // Colour style: choosing one gives its colours back to every series or slice.
      this.select(left, `palette`, CHART_PALETTES.map((id) => [id, PALETTE_NAMES[id][lang]]), this.st.palette, (v) => {
        this.st.palette = v as ChartPalette;
        this.st.colors = [];
        this.renderTable();
      });

      // Titles.
      this.textField(left, `chartTitle`, this.st.title, (v) => (this.st.title = v));
      this.optionsBox = left.createDiv({ cls: `mmw-chart-options` });
      this.renderOptions();

      // Numbers.
      left.createEl(`h4`, { text: tr(`data`) });
      this.tableBox = left.createDiv({ cls: `mmw-chart-table` });
      this.renderTable();
      this.pasteBox(left);

      // Buttons.
      const actions = this.contentEl.createDiv({ cls: `mmw-dlg-actions` });
      const cancel = actions.createEl(`button`, { cls: `mmw-dlg-btn`, text: tr(`cancel`), attr: { type: `button` } });
      cancel.addEventListener(`click`, () => this.close());
      const ok = actions.createEl(`button`, { cls: `mmw-dlg-btn mod-cta`, text: deps.editing ? tr(`replace`) : tr(`insert`), attr: { type: `button` } });
      ok.addEventListener(`click`, () => {
        const spec = toSpec(this.st);
        this.close();
        deps.onSubmit(spec);
      });
      this.refresh();
    }

    private select(parent: HTMLElement, id: TextId, choices: [string, string][], value: string, set: (v: string) => void): void {
      const row = parent.createDiv({ cls: `mmw-chart-row` });
      row.createEl(`span`, { cls: `mmw-chart-label`, text: tr(id) });
      const select = row.createEl(`select`, { cls: `dropdown mmw-chart-input` });
      for (const [key, name] of choices) select.createEl(`option`, { attr: { value: key }, text: name });
      select.value = value;
      select.addEventListener(`change`, () => {
        set(select.value);
        this.refresh();
      });
    }

    private textField(parent: HTMLElement, id: TextId, value: string, set: (v: string) => void): HTMLInputElement {
      const row = parent.createDiv({ cls: `mmw-chart-row` });
      row.createEl(`span`, { cls: `mmw-chart-label`, text: tr(id) });
      const input = row.createEl(`input`, { cls: `mmw-chart-input`, attr: { type: `text`, maxlength: `120` } });
      input.value = value;
      input.addEventListener(`input`, () => {
        set(input.value);
        this.refresh();
      });
      return input;
    }

    private check(parent: HTMLElement, id: TextId, value: boolean, set: (v: boolean) => void): void {
      const label = parent.createEl(`label`, { cls: `mmw-chart-check` });
      const box = label.createEl(`input`, { attr: { type: `checkbox` } });
      box.checked = value;
      label.createEl(`span`, { text: tr(id) });
      box.addEventListener(`change`, () => {
        set(box.checked);
        this.refresh();
      });
    }

    // Options that depend on the type of chart.
    private renderOptions(): void {
      const box = this.optionsBox;
      box.empty();
      if (this.st.type !== `pie`) {
        this.textField(box, `xTitle`, this.st.xTitle, (v) => (this.st.xTitle = v));
        this.textField(box, `yTitle`, this.st.yTitle, (v) => (this.st.yTitle = v));
      }
      this.select(box, `valueMode`, VALUE_MODES.map((id) => [id, VALUE_NAMES[id][lang]]), this.st.valueMode, (v) => (this.st.valueMode = v as ValueMode));
      this.select(box, `legend`, LEGEND_POSITIONS.map((id) => [id, LEGEND_NAMES[id][lang]]), this.st.legend, (v) => (this.st.legend = v as LegendPosition));
      const checks = box.createDiv({ cls: `mmw-chart-checks` });
      if (this.st.type !== `pie`) this.check(checks, `grid`, this.st.showGrid, (v) => (this.st.showGrid = v));
      if (this.st.type === `bar`) {
        this.check(checks, `horizontal`, this.st.horizontal, (v) => (this.st.horizontal = v));
        this.check(checks, `stacked`, this.st.stacked, (v) => (this.st.stacked = v));
      }
    }

    // Round colour button of a series or a slice. The black and white style has hatched fills: no colour to choose.
    private colorInput(parent: HTMLElement, index: number, count: number): void {
      if (this.st.palette === `gray`) return;
      const input = parent.createEl(`input`, { cls: `mmw-chart-color`, attr: { type: `color`, title: tr(`colour`) } });
      input.value = seriesColor(toSpec(this.st), index, count);
      input.addEventListener(`input`, () => {
        const c = cleanColor(input.value);
        while (this.st.colors.length <= index) this.st.colors.push(``);
        this.st.colors[index] = c ?? ``;
        this.refresh();
      });
    }

    // The table of numbers: names of the series in the first row (with their colours), one row per category.
    private renderTable(): void {
      const box = this.tableBox;
      box.empty();
      const pie = this.st.type === `pie`;
      const seriesShown = pie ? 1 : this.st.names.length;
      const colorCount = pie ? this.st.categories.length : this.st.names.length;
      const table = box.createEl(`table`, { cls: `mmw-chart-grid` });
      const head = table.createEl(`thead`).createEl(`tr`);
      head.createEl(`th`, { text: tr(pie ? `sliceHead` : `category`) });
      if (pie) head.createEl(`th`, { text: tr(`valueHead`) });
      else {
        for (let s = 0; s < seriesShown; s++) {
          const th = head.createEl(`th`);
          const line = th.createDiv({ cls: `mmw-chart-cell` });
          this.colorInput(line, s, colorCount);
          const name = line.createEl(`input`, { cls: `mmw-chart-input`, attr: { type: `text`, placeholder: tr(`seriesName`), maxlength: `120` } });
          name.value = this.st.names[s] ?? ``;
          name.addEventListener(`input`, () => {
            this.st.names[s] = name.value;
            this.refresh();
          });
          if (this.st.names.length > 1) {
            const x = line.createEl(`button`, { cls: `mmw-chart-x`, text: `×`, attr: { type: `button`, title: tr(`removeSeries`) } });
            x.addEventListener(`click`, () => {
              this.st.names.splice(s, 1);
              this.st.colors.splice(s, 1);
              for (const row of this.st.cells) row.splice(s, 1);
              this.renderTable();
              this.refresh();
            });
          }
        }
        // A plus sign at the end of the header adds a series.
        const plusCell = head.createEl(`th`);
        if (this.st.names.length < MAX_SERIES) {
          const plus = plusCell.createEl(`button`, { cls: `mmw-chart-plus`, text: `+`, attr: { type: `button`, title: tr(`addSeries`) } });
          plus.addEventListener(`click`, () => {
            this.st.names.push(``);
            for (const row of this.st.cells) row.push(``);
            this.renderTable();
            this.refresh();
          });
        }
      }
      if (pie) head.createEl(`th`);
      const bodyEl = table.createEl(`tbody`);
      this.st.categories.forEach((cat, i) => {
        const tr1 = bodyEl.createEl(`tr`);
        const first = tr1.createEl(`td`).createDiv({ cls: `mmw-chart-cell` });
        if (pie) this.colorInput(first, i, colorCount);
        const catInput = first.createEl(`input`, { cls: `mmw-chart-input`, attr: { type: `text`, placeholder: tr(pie ? `sliceName` : `categoryName`), maxlength: `120` } });
        catInput.value = cat;
        catInput.addEventListener(`input`, () => {
          this.st.categories[i] = catInput.value;
          this.refresh();
        });
        for (let s = 0; s < seriesShown; s++) {
          const cell = tr1.createEl(`td`).createEl(`input`, { cls: `mmw-chart-input mmw-chart-number`, attr: { type: `text`, inputmode: `decimal`, placeholder: tr(`datum`) } });
          cell.value = this.st.cells[i]?.[s] ?? ``;
          const check = (): void => {
            const n = parseNumber(cell.value);
            cell.toggleClass(`mmw-chart-bad`, n !== null && Number.isNaN(n));
            cell.title = n !== null && Number.isNaN(n) ? tr(`badNumber`) : ``;
          };
          check();
          cell.addEventListener(`input`, () => {
            if (!this.st.cells[i]) this.st.cells[i] = [];
            this.st.cells[i][s] = cell.value;
            check();
            this.refresh();
          });
        }
        const del = tr1.createEl(`td`);
        if (this.st.categories.length > 1) {
          const x = del.createEl(`button`, { cls: `mmw-chart-x`, text: `×`, attr: { type: `button`, title: tr(`removeRow`) } });
          x.addEventListener(`click`, () => {
            this.st.categories.splice(i, 1);
            this.st.cells.splice(i, 1);
            this.st.colors = this.st.colors.filter((_c, k) => !pie || k !== i);
            this.renderTable();
            this.refresh();
          });
        }
      });
      // A plus sign under the rows adds a category (a slice for a pie chart).
      if (this.st.categories.length < MAX_CATEGORIES) {
        const plus = box.createEl(`button`, { cls: `mmw-chart-plus`, text: `+`, attr: { type: `button`, title: tr(pie ? `addSlice` : `addRow`) } });
        plus.addEventListener(`click`, () => {
          this.st.categories.push(``);
          this.st.cells.push(this.st.names.map(() => ``));
          this.renderTable();
          this.refresh();
        });
      }
    }

    // Cells copied from a spreadsheet replace the numbers.
    private pasteBox(parent: HTMLElement): void {
      const details = parent.createEl(`details`, { cls: `mmw-chart-paste` });
      details.createEl(`summary`, { text: tr(`paste`) });
      details.createEl(`p`, { cls: `mmw-chart-hint`, text: tr(`pasteHelp`) });
      const area = details.createEl(`textarea`, { cls: `mmw-chart-area`, attr: { rows: `5` } });
      const message = details.createEl(`p`, { cls: `mmw-chart-hint` });
      const use = details.createEl(`button`, { cls: `mmw-dlg-btn`, text: tr(`pasteUse`), attr: { type: `button` } });
      use.addEventListener(`click`, () => {
        const table = parseTable(area.value);
        if (!table) {
          message.setText(tr(`pasteBad`));
          return;
        }
        message.setText(``);
        this.st.categories = table.categories;
        this.st.names = table.series.map((s) => s.name);
        this.st.cells = table.categories.map((_c, i) => table.series.map((s) => (s.values[i] === null || s.values[i] === undefined ? `` : String(s.values[i]).replace(`.`, decimal))));
        this.st.colors = [];
        this.renderTable();
        this.refresh();
      });
    }

    // Redraws the preview a moment after the last change.
    private refresh(): void {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        this.preview.empty();
        appendSvgDocument(this.preview, renderChart(toSpec(this.st), { decimal }));
      }, 60);
    }

    onClose(): void {
      window.clearTimeout(this.timer);
      this.contentEl.empty();
    }
  }

  new ChartModal(deps.app).open();
}

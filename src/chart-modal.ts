// Window of the chart editor: type of chart, title, numbers typed or pasted, style (colours, labels, legend, axes), and a live preview. It
// is opened by the Charts module, which gives it the Obsidian module: this file imports Obsidian only for its types.
import type { App } from "obsidian";
import { renderChart } from "./chart/render";
import { CHART_PALETTES, ChartPalette, ChartSource, ChartSpec, ChartType, cleanColor, LEGEND_POSITIONS, LegendPosition, MAX_CATEGORIES, MAX_SERIES, parseNumber, parseTable, seriesColor, ValueMode, VALUE_MODES } from "./chart/spec";
import { readSpreadsheet, Sheet, SpreadsheetError, SPREADSHEET_EXT, tableOfSheet } from "./chart/spreadsheet";
import { appendSvgDocument } from "./dom";
import type { HelpLang } from "./help";
import type { Inflate } from "./zip";

export interface ChartEditorDeps {
  app: App;
  obsidian: typeof import("obsidian");
  lang: HelpLang;
  // Chart to start from (the default chart for a new one), and whether it is the chart of a block that already exists.
  spec: ChartSpec;
  editing: boolean;
  onSubmit: (spec: ChartSpec) => void;
  // Spreadsheet files of the vault (paths), reading of one of them, and the decompression that xlsx and ods files need.
  files: { list(): string[]; read(path: string): Promise<Uint8Array> };
  inflate: Inflate;
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
  importTitle: { fr: `Importer un fichier (CSV, Excel, LibreOffice)`, en: `Import a file (CSV, Excel, LibreOffice)` },
  importHelp: { fr: `Les nombres du fichier sont copiés dans le graphique : le fichier n'est plus nécessaire ensuite. Pour un fichier du coffre, le bouton Actualiser relit le fichier. La première ligne donne les noms des séries, la première colonne les catégories. Les fichiers Excel anciens (xls) ne sont pas lus : enregistrez-les en xlsx ou en CSV.`, en: `The numbers of the file are copied into the chart: the file is not needed afterwards. For a file of the vault, the Update button reads the file again. The first row gives the names of the series, the first column the categories. Old Excel files (xls) are not read: save them as xlsx or CSV.` },
  importVault: { fr: `Fichier du coffre…`, en: `File of the vault…` },
  importComputer: { fr: `Fichier de l'ordinateur…`, en: `File of the computer…` },
  importSource: { fr: `Fichier lié : `, en: `Linked file: ` },
  importNone: { fr: `Aucun fichier lié (copie des nombres).`, en: `No linked file (numbers copied).` },
  importSheet: { fr: `Feuille`, en: `Sheet` },
  importRange: { fr: `Plage (facultatif, exemple A1:D10)`, en: `Range (optional, for example A1:D10)` },
  importTranspose: { fr: `Inverser les lignes et les colonnes`, en: `Swap rows and columns` },
  importUpdate: { fr: `Actualiser`, en: `Update` },
  importPick: { fr: `Choisir un fichier du coffre`, en: `Choose a file of the vault` },
  importDone: { fr: `Nombres importés.`, en: `Numbers imported.` },
  importCut: { fr: `Nombres importés. Le graphique garde au plus 200 lignes et 12 séries : le reste a été laissé de côté.`, en: `Numbers imported. A chart keeps at most 200 rows and 12 series: the rest was left out.` },
  importNoTable: { fr: `Aucun tableau lisible dans cette feuille ou cette plage (il faut une ligne de noms et au moins une ligne de nombres).`, en: `No readable table in this sheet or range (a row of names and at least one row of numbers are needed).` },
  importOld: { fr: `Ce format n'est pas lu. Enregistrez le fichier en xlsx, ods ou CSV.`, en: `This format is not read. Save the file as xlsx, ods or CSV.` },
  importEmpty: { fr: `Le fichier est vide.`, en: `The file is empty.` },
  importBad: { fr: `Le fichier n'a pas pu être lu.`, en: `The file could not be read.` },
  importMissing: { fr: `Fichier introuvable dans le coffre.`, en: `File not found in the vault.` },
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
  source: ChartSource | null;
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
    source: spec.source ? { ...spec.source } : null,
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
    ...(st.source ? { source: { ...st.source } } : {}),
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
    // Sheets of the file read last (to change the sheet, the range or the swap without reading the file again).
    private sheets: Sheet[] = [];
    private importBox!: HTMLDetailsElement;

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
      this.importBox = left.createEl(`details`, { cls: `mmw-chart-paste` }) as HTMLDetailsElement;
      this.importBox.open = this.st.source !== null;
      this.renderImport();
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

    // Import of a spreadsheet file: choice of the file, sheet, range, swap, and the Update button for a linked file of the vault.
    private renderImport(): void {
      const box = this.importBox;
      box.empty();
      box.createEl(`summary`, { text: tr(`importTitle`) });
      box.createEl(`p`, { cls: `mmw-chart-hint`, text: tr(`importHelp`) });
      const buttons = box.createDiv({ cls: `mmw-chart-tableactions` });
      const vault = buttons.createEl(`button`, { cls: `mmw-dlg-btn`, text: tr(`importVault`), attr: { type: `button` } });
      vault.addEventListener(`click`, () => this.pickVaultFile());
      const computer = buttons.createEl(`button`, { cls: `mmw-dlg-btn`, text: tr(`importComputer`), attr: { type: `button` } });
      computer.addEventListener(`click`, () => this.pickComputerFile());
      const source = this.st.source;
      box.createEl(`p`, { cls: `mmw-chart-hint`, text: source ? `${tr(`importSource`)}${source.path}` : tr(`importNone`) });
      if (source) {
        if (this.sheets.length > 1) {
          const row = box.createDiv({ cls: `mmw-chart-row` });
          row.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`importSheet`) });
          const select = row.createEl(`select`, { cls: `dropdown mmw-chart-input` });
          for (const sheet of this.sheets) select.createEl(`option`, { attr: { value: sheet.name }, text: sheet.name });
          select.value = this.sheets.some((x) => x.name === source.sheet) ? source.sheet : this.sheets[0].name;
          select.addEventListener(`change`, () => {
            source.sheet = select.value;
            this.applySheets();
          });
        }
        const range = box.createDiv({ cls: `mmw-chart-row` });
        range.createEl(`span`, { cls: `mmw-chart-label`, text: tr(`importRange`) });
        const rangeInput = range.createEl(`input`, { cls: `mmw-chart-input`, attr: { type: `text`, placeholder: `A1:D10` } });
        rangeInput.value = source.range;
        rangeInput.addEventListener(`change`, () => {
          source.range = rangeInput.value.trim();
          this.applySheets();
        });
        const checks = box.createDiv({ cls: `mmw-chart-checks` });
        this.check(checks, `importTranspose`, source.transpose, (v) => {
          source.transpose = v;
          this.applySheets();
        });
        const update = box.createEl(`button`, { cls: `mmw-dlg-btn mod-cta`, text: tr(`importUpdate`), attr: { type: `button` } });
        update.addEventListener(`click`, () => void this.updateFromVault());
      }
      this.importMessage = box.createEl(`p`, { cls: `mmw-chart-hint` });
    }

    private importMessage: HTMLElement | null = null;

    private say(text: string): void {
      this.importMessage?.setText(text);
    }

    private pickVaultFile(): void {
      const { FuzzySuggestModal } = deps.obsidian;
      const paths = deps.files.list();
      const choose = (item: string): void => void this.importVaultFile(item);
      class Picker extends FuzzySuggestModal<string> {
        getItems(): string[] {
          return paths;
        }
        getItemText(item: string): string {
          return item;
        }
        onChooseItem(item: string): void {
          choose(item);
        }
      }
      const picker = new Picker(deps.app);
      picker.setPlaceholder(tr(`importPick`));
      picker.open();
    }

    private pickComputerFile(): void {
      const input = createEl(`input`, { attr: { type: `file`, accept: `.csv,.tsv,.txt,.xlsx,.ods` } });
      input.addEventListener(`change`, () => {
        const file = input.files?.[0];
        if (file && SPREADSHEET_EXT.test(file.name)) void file.arrayBuffer().then((buffer) => this.importBytes(file.name, new Uint8Array(buffer), null));
      });
      input.click();
    }

    private async importVaultFile(path: string): Promise<void> {
      let bytes: Uint8Array;
      try {
        bytes = await deps.files.read(path);
      } catch {
        this.say(tr(`importMissing`));
        return;
      }
      await this.importBytes(path, bytes, path);
    }

    // Reads the file of the link again and replaces the numbers.
    private async updateFromVault(): Promise<void> {
      if (this.st.source) await this.importVaultFile(this.st.source.path);
    }

    // Reads a file and puts its numbers in the chart. A file of the vault stays linked (path, sheet, range) to be read again.
    private async importBytes(name: string, bytes: Uint8Array, vaultPath: string | null): Promise<void> {
      try {
        this.sheets = await readSpreadsheet(name, bytes, deps.inflate);
      } catch (e) {
        const code = e instanceof SpreadsheetError ? e.code : `unreadable`;
        this.say(tr(code === `unsupported` ? `importOld` : code === `empty` ? `importEmpty` : `importBad`));
        return;
      }
      const previous = this.st.source;
      this.st.source = vaultPath ? { path: vaultPath, sheet: previous && previous.path === vaultPath ? previous.sheet : this.sheets[0].name, range: previous && previous.path === vaultPath ? previous.range : ``, transpose: previous && previous.path === vaultPath ? previous.transpose : false } : null;
      this.renderImport();
      this.applySheets();
    }

    // The numbers of the chosen sheet and range replace the table of the chart.
    private applySheets(): void {
      const source = this.st.source;
      const sheet = this.sheets.find((x) => x.name === source?.sheet) ?? this.sheets[0];
      if (!sheet) return;
      const table = tableOfSheet(sheet.rows, { range: source?.range ?? ``, transpose: source?.transpose ?? false });
      if (!table) {
        this.say(tr(`importNoTable`));
        return;
      }
      this.st.categories = table.categories;
      this.st.names = table.series.map((x) => x.name);
      this.st.cells = table.categories.map((_c, i) => table.series.map((x) => (x.values[i] === null || x.values[i] === undefined ? `` : String(x.values[i]).replace(`.`, decimal))));
      this.renderTable();
      this.refresh();
      this.say(table.truncated ? tr(`importCut`) : tr(`importDone`));
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

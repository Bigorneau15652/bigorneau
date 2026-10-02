// Fenetre de creation d'un tableau : une grille de 9 sur 9 cases, dont on survole ou on choisit, depuis la case en haut a gauche, le
// nombre de lignes et de colonnes ; trois choix (en-tete fonce, alternance de lignes, nom du tableau) gardes d'une fois a l'autre.
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";

export const GRID_SIZE = 9;

export interface TableChoice {
  rows: number;
  cols: number;
  header: boolean;
  stripes: boolean;
  caption: boolean;
}

export class TableModal extends Modal {
  private rows = 3;
  private cols = 3;
  private cells: HTMLElement[][] = [];
  private label!: HTMLElement;

  constructor(app: App, private values: { header: boolean; stripes: boolean; caption: boolean }, private onChoose: (choice: TableChoice) => void, private onOptions: (v: { header: boolean; stripes: boolean; caption: boolean }) => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Insérer un tableau`));
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(`mmw-tmodal`);

    const options = contentEl.createDiv({ cls: `mmw-tmodal-options` });
    const toggle = (name: string, key: `header` | `stripes` | `caption`): void => {
      new Setting(options).setName(name).addToggle((x) =>
        x.setValue(this.values[key]).onChange((v) => {
          this.values[key] = v;
          this.onOptions({ ...this.values });
        })
      );
    };
    toggle(t(`Ligne d'en-tête foncée, écriture blanche`), `header`);
    toggle(t(`Alternance de lignes légèrement contrastée`), `stripes`);
    toggle(t(`Nom du tableau, à renseigner au-dessus du tableau`), `caption`);

    this.label = contentEl.createDiv({ cls: `mmw-tmodal-label` });
    const grid = contentEl.createDiv({ cls: `mmw-tgrid` });
    grid.tabIndex = 0;
    for (let r = 0; r < GRID_SIZE; r++) {
      const line: HTMLElement[] = [];
      for (let c = 0; c < GRID_SIZE; c++) {
        const cell = grid.createDiv({ cls: `mmw-tcell` });
        cell.addEventListener(`pointerenter`, () => this.select(r + 1, c + 1));
        cell.addEventListener(`click`, () => this.choose(r + 1, c + 1));
        line.push(cell);
      }
      this.cells.push(line);
    }
    // Clavier : les fleches changent la taille, Entree insere.
    grid.addEventListener(`keydown`, (e) => {
      if (e.key === `ArrowRight`) this.select(this.rows, Math.min(GRID_SIZE, this.cols + 1));
      else if (e.key === `ArrowLeft`) this.select(this.rows, Math.max(1, this.cols - 1));
      else if (e.key === `ArrowDown`) this.select(Math.min(GRID_SIZE, this.rows + 1), this.cols);
      else if (e.key === `ArrowUp`) this.select(Math.max(1, this.rows - 1), this.cols);
      else if (e.key === `Enter`) this.choose(this.rows, this.cols);
      else return;
      e.preventDefault();
    });
    contentEl.createDiv({ cls: `mmw-tmodal-hint`, text: t(`Survolez la grille depuis la case en haut à gauche, puis cliquez pour insérer le tableau. Les lignes et colonnes supplémentaires s'ajoutent ensuite avec les triangles au bord du tableau ou le clic droit.`) });
    this.select(this.rows, this.cols);
    grid.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private select(rows: number, cols: number): void {
    this.rows = rows;
    this.cols = cols;
    this.cells.forEach((line, r) => line.forEach((cell, c) => cell.toggleClass(`is-on`, r < rows && c < cols)));
    this.label.setText(t(`{0} lignes × {1} colonnes`, rows, cols));
  }

  private choose(rows: number, cols: number): void {
    this.close();
    this.onChoose({ rows, cols, ...this.values });
  }
}

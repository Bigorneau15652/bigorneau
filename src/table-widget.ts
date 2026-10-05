// Tableaux de l'apercu en direct d'Obsidian : le style choisi (en-tete fonce, alternance, colonnes egales) y est applique, un petit
// triangle apparait au survol a droite et en bas du tableau pour ajouter une colonne ou une ligne, et le clic droit sur une cellule
// ouvre le menu du tableau. Obsidian dessine ces tableaux lui-meme ; l'extension les reconnait dans le DOM de l'editeur, sans s'appuyer
// sur autre chose que leur element table, et ne fait rien quand elle n'en trouve pas.
import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { addColumn, addRow, findTable, renderTable, tableContext } from "./table-edit";
import { MenuSpec, tableMenu } from "./table-menu";

export interface TableWidgetHost {
  // Affiche le menu a l'endroit du clic ; `access` donne le texte actuel de la note et en ecrit le nouveau texte d'une entree choisie.
  showMenu(event: MouseEvent, items: MenuSpec[], access: { text(): string; apply(text: string): void }): void;
}

// Plus petit changement qui transforme l'ancien texte en le nouveau (le debut et la fin communs sont gardes).
export function diffChange(oldText: string, newText: string): { from: number; to: number; insert: string } | null {
  if (oldText === newText) return null;
  let start = 0;
  const max = Math.min(oldText.length, newText.length);
  while (start < max && oldText[start] === newText[start]) start++;
  let endOld = oldText.length;
  let endNew = newText.length;
  while (endOld > start && endNew > start && oldText[endOld - 1] === newText[endNew - 1]) {
    endOld--;
    endNew--;
  }
  return { from: start, to: endOld, insert: newText.slice(start, endNew) };
}

class TableWidgets {
  private scheduled = false;
  private observer: MutationObserver;

  constructor(private view: EditorView, private host: TableWidgetHost) {
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(view.contentDOM, { childList: true, subtree: true });
    this.schedule();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged || u.viewportChanged) this.schedule();
  }

  destroy(): void {
    this.observer.disconnect();
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    window.requestAnimationFrame(() => {
      this.scheduled = false;
      this.scan();
    });
  }

  private applyText(newText: string): void {
    const change = diffChange(this.view.state.doc.toString(), newText);
    if (change) this.view.dispatch({ changes: change });
  }

  // Position, dans la note, du debut du tableau dessine dans l'element donne.
  private posOf(el: HTMLElement): number | null {
    try {
      return this.view.posAtDOM(el);
    } catch {
      return null;
    }
  }

  private scan(): void {
    const text = this.view.state.doc.toString();
    for (const table of Array.from(this.view.contentDOM.querySelectorAll<HTMLTableElement>(`table`))) {
      const host = (table.closest(`.cm-table-widget, .cm-embed-block`) as HTMLElement | null) ?? table.parentElement;
      if (!host) continue;
      const pos = this.posOf(host);
      if (pos === null) continue;
      const span = findTable(text, pos);
      if (!span) continue;
      host.classList.add(`mmw-t-host`);
      const style = tableContext(text, span).style;
      host.classList.toggle(`mmw-t-header`, style.header === true);
      host.classList.toggle(`mmw-t-stripes`, style.stripes === true);
      host.classList.toggle(`mmw-t-equal`, style.equal === true);
      if (host.dataset.mmwBound !== `1`) {
        host.dataset.mmwBound = `1`;
        this.bind(host, table);
      }
    }
  }

  private bind(host: HTMLElement, table: HTMLTableElement): void {
    const arrows = host.createDiv({ cls: `mmw-t-arrows` });
    arrows.contentEditable = `false`;
    const make = (cls: string, label: string, run: () => void): HTMLElement => {
      const a = arrows.createDiv({ cls: `mmw-t-arrow ${cls}` });
      a.setAttribute(`aria-label`, label);
      a.addEventListener(`mousedown`, (e) => e.preventDefault());
      a.addEventListener(`click`, (e) => {
        e.preventDefault();
        e.stopPropagation();
        run();
      });
      return a;
    };
    const current = (): { text: string; span: NonNullable<ReturnType<typeof findTable>> } | null => {
      const pos = this.posOf(host);
      const text = this.view.state.doc.toString();
      const span = pos === null ? null : findTable(text, pos);
      return span ? { text, span } : null;
    };
    const place = (): void => {
      const t = host.querySelector<HTMLElement>(`table`) ?? table;
      const hr = host.getBoundingClientRect();
      const tr = t.getBoundingClientRect();
      const colArrow = arrows.querySelector<HTMLElement>(`.mmw-t-arrow-col`);
      const rowArrow = arrows.querySelector<HTMLElement>(`.mmw-t-arrow-row`);
      colArrow?.style.setProperty(`left`, `${Math.min(tr.right - hr.left + 2, hr.width - 18)}px`);
      colArrow?.style.setProperty(`top`, `${tr.top - hr.top + tr.height / 2 - 9}px`);
      rowArrow?.style.setProperty(`left`, `${tr.left - hr.left + tr.width / 2 - 9}px`);
      rowArrow?.style.setProperty(`top`, `${Math.min(tr.bottom - hr.top + 2, hr.height - 18)}px`);
    };
    make(`mmw-t-arrow-col`, `+`, () => {
      const c = current();
      if (c) this.applyText(c.text.slice(0, c.span.from) + renderTable(addColumn({ rows: c.span.rows, align: c.span.align }, c.span.align.length - 1, `right`), c.text.includes(`\r\n`) ? `\r\n` : `\n`) + c.text.slice(c.span.to));
    });
    make(`mmw-t-arrow-row`, `+`, () => {
      const c = current();
      if (c) this.applyText(c.text.slice(0, c.span.from) + renderTable(addRow({ rows: c.span.rows, align: c.span.align }, c.span.rows.length - 1, `below`), c.text.includes(`\r\n`) ? `\r\n` : `\n`) + c.text.slice(c.span.to));
    });
    host.addEventListener(`mouseenter`, place);
    host.addEventListener(
      `contextmenu`,
      (e) => {
        const cell = (e.target as Element | null)?.closest(`td, th`) as HTMLTableCellElement | null;
        const row = cell?.closest(`tr`) as HTMLTableRowElement | null;
        if (!cell || !row) return;
        const c = current();
        if (!c) return;
        const items = tableMenu(c.text, c.span.from, { row: row.rowIndex, col: cell.cellIndex });
        if (!items) return;
        e.preventDefault();
        e.stopPropagation();
        this.host.showMenu(e, items, { text: () => this.view.state.doc.toString(), apply: (text) => this.applyText(text) });
      },
      true
    );
  }
}

export function tableWidgetExtension(host: TableWidgetHost): Extension {
  return ViewPlugin.define((view) => new TableWidgets(view, host));
}

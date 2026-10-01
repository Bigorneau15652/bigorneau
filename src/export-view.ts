// Apercu de l'export de haute qualite : volet qui montre la note ouverte telle que l'export la composera.
// Phase 2 : coupure de lignes de Knuth et Plass avec cesure ; la pagination definitive et le PDF arrivent aux phases suivantes.
import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import { composeNote } from "./export/compose";
import { FOOTNOTE_RULE_HEIGHT } from "./export/paginate";
import { A4_SETUP, Row } from "./export/typeset";
import { EXPORT_FONT_FAMILY, EXPORT_MONO_FAMILY, loadExportFont } from "./export-font";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

export const VIEW_TYPE_EXPORT = `mindmap-writing-export-preview`;

const PX_PER_PT = 96 / 72;

export class ExportPreviewView extends ItemView {
  private token = 0;
  private sheets: HTMLElement[] = [];
  private observer: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: MindmapWritingPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_EXPORT;
  }

  getDisplayText(): string {
    return t(`Aperçu de l'export`);
  }

  getIcon(): string {
    return `file-text`;
  }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.addClass(`mmw-export`);
    this.observer = new ResizeObserver(() => this.applyScale());
    this.observer.observe(this.contentEl);
    await this.refresh();
  }

  async onClose() {
    this.observer?.disconnect();
    this.observer = null;
  }

  // Les pages sont composees en points ; on les reduit pour qu'elles tiennent dans la largeur du volet.
  private applyScale() {
    const avail = this.contentEl.clientWidth - 32;
    if (avail <= 0) return;
    const scale = Math.min(1, avail / (A4_SETUP.width * PX_PER_PT));
    for (const sheet of this.sheets) {
      const page = sheet.firstElementChild as HTMLElement | null;
      if (!page) continue;
      sheet.style.width = `${A4_SETUP.width * PX_PER_PT * scale}px`;
      sheet.style.height = `${A4_SETUP.height * PX_PER_PT * scale}px`;
      // La page est dimensionnee en points (donc deja en pixels CSS) : seule la reduction s'applique.
      page.style.transform = `scale(${scale})`;
    }
  }

  private renderRow(parent: HTMLElement, row: Row) {
    const el = parent.createDiv({ cls: `mmw-row mmw-row-${row.kind}` });
    el.style.height = `${row.height}pt`;
    if (row.kind === `space`) return;
    el.style.fontSize = `${row.fontSize}pt`;
    el.style.lineHeight = `${row.height}pt`;
    el.style.paddingLeft = `${row.x}pt`;
    el.style.width = `${row.width + row.x}pt`;
    if (row.align === `center`) el.style.textAlign = `center`;
    if (row.wordSpacing !== 0) el.style.wordSpacing = `${row.wordSpacing}pt`;
    if (row.marker !== undefined) {
      const m = el.createSpan({ cls: row.kind === `footnote` ? `mmw-row-marker mmw-row-note-marker` : `mmw-row-marker`, text: row.marker });
      m.style.left = `${row.kind === `footnote` ? 0 : row.x - 16}pt`;
    }
    if (row.runs) {
      // Chaque morceau a sa police (gras, italique) ; les appels de notes de bas de page sont des numeros en exposant, a 70 %
      // du corps du texte comme dans le calcul ; les liens web s'ouvrent dans le navigateur.
      for (const run of row.runs) {
        const span = el.createSpan({ text: run.text });
        if (run.sup) span.addClass(`mmw-sup`);
        if (run.style === `mono`) span.style.fontFamily = `"${EXPORT_MONO_FAMILY}", monospace`;
        if (run.style === `bold` || run.style === `boldItalic`) span.style.fontWeight = `700`;
        if (run.style === `italic` || run.style === `boldItalic`) span.style.fontStyle = `italic`;
        if (run.link) {
          span.addClass(`mmw-export-link`);
          span.title = run.link;
          const url = run.link;
          span.addEventListener(`click`, () => window.open(url));
        }
      }
    } else {
      el.appendChild(document.createTextNode(row.text));
    }
  }

  async refresh() {
    const token = ++this.token;
    const root = this.contentEl;
    // L'export de haute qualite n'existe que sur ordinateur : ailleurs, le volet l'explique sans rien calculer.
    if (!Platform.isDesktop) {
      root.empty();
      root.createDiv({ cls: `mmw-export-message`, text: t(`L'export n'est disponible que sur ordinateur.`) });
      return;
    }
    const file = this.plugin.lastFile;
    if (!file) {
      root.empty();
      root.createDiv({ cls: `mmw-export-message`, text: t(`Ouvrez d'abord une note.`) });
      return;
    }
    const fontOk = await loadExportFont();
    const text = this.plugin.getOpenText(file) ?? (await this.app.vault.read(file));
    if (token !== this.token) return;

    const composed = composeNote(text, file.name);
    const typeset = composed.typeset;
    const pages = composed.pages;
    const s = typeset.stats;
    root.empty();

    const head = root.createDiv({ cls: `mmw-export-head` });
    head.createDiv({ cls: `mmw-export-title`, text: t(`Aperçu de l'export : {0}`, file.basename) });
    const nPages = pages.length;
    const stats = [
      nPages === 1 ? t(`{0} page`, nPages) : t(`{0} pages`, nPages),
      s.wordCount === 1 ? t(`{0} mot`, s.wordCount) : t(`{0} mots`, s.wordCount),
      s.footnotes === 1 ? t(`{0} note de bas de page`, s.footnotes) : t(`{0} notes de bas de page`, s.footnotes),
    ];
    head.createDiv({ cls: `mmw-export-stats`, text: stats.join(`, `) });
    head.createDiv({
      cls: `mmw-export-stats`,
      text: t(`{0} lignes, dont {1} avec césure ({2} consécutives) ; {3} lâches, {4} serrées, {5} débordantes`, s.lines, s.hyphenatedLines, s.consecutiveHyphens, s.looseLines, s.tightLines, s.overfullLines),
    });
    for (const w of typeset.warnings) {
      if (w.startsWith(`note:`)) head.createDiv({ cls: `mmw-export-stats`, text: t(`Note de bas de page sans définition : {0}`, w.slice(5)) });
    }
    if (typeset.missing.length > 0) {
      head.createDiv({ cls: `mmw-export-stats`, text: t(`Caractères absents de la police : {0}`, typeset.missing.map((c) => `U+${c.toString(16).toUpperCase().padStart(4, `0`)}`).join(` `)) });
    }
    if (!fontOk) head.createDiv({ cls: `mmw-export-stats`, text: t(`Police de l'export indisponible : l'aperçu utilise une autre police.`) });
    head.createDiv({ cls: `mmw-export-hint`, text: t(`Aperçu de l'export : le PDF reprend exactement ces pages. Les titres masqués et les sujets flottants ne sont pas exportés.`) });
    const exportBtn = head.createEl(`button`, { cls: `mod-cta mmw-export-button`, text: t(`Exporter en PDF…`) });
    exportBtn.addEventListener(`click`, () => void this.plugin.exportPdf());

    const host = root.createDiv({ cls: `mmw-export-pages` });
    this.sheets = [];
    pages.forEach((pg) => {
      const sheet = host.createDiv({ cls: `mmw-export-sheet` });
      const page = sheet.createDiv({ cls: `mmw-export-page` });
      page.style.width = `${A4_SETUP.width}pt`;
      page.style.height = `${A4_SETUP.height}pt`;
      page.style.fontFamily = `"${EXPORT_FONT_FAMILY}", serif`;
      const textWidth = A4_SETUP.width - A4_SETUP.marginLeft - A4_SETUP.marginRight;
      if (pg.header) {
        const h = page.createDiv({ cls: `mmw-export-header`, text: pg.header });
        h.style.left = `${A4_SETUP.marginLeft}pt`;
        h.style.top = `${A4_SETUP.marginTop - 34}pt`;
        h.style.width = `${textWidth}pt`;
      }
      const body = page.createDiv({ cls: `mmw-export-body` });
      body.style.left = `${A4_SETUP.marginLeft}pt`;
      body.style.top = `${A4_SETUP.marginTop}pt`;
      body.style.width = `${textWidth}pt`;
      for (const row of pg.rows) this.renderRow(body, row);
      if (pg.footnotes.length > 0) {
        const notes = page.createDiv({ cls: `mmw-export-notes` });
        notes.style.left = `${A4_SETUP.marginLeft}pt`;
        notes.style.bottom = `${A4_SETUP.marginBottom}pt`;
        notes.style.width = `${textWidth}pt`;
        const rule = notes.createDiv({ cls: `mmw-export-rule` });
        rule.style.height = `${FOOTNOTE_RULE_HEIGHT}pt`;
        for (const row of pg.footnotes) this.renderRow(notes, row);
      }
      if (pg.footer) page.createDiv({ cls: `mmw-export-number`, text: pg.footer });
      this.sheets.push(sheet);
    });
    this.applyScale();
  }
}

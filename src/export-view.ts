// Apercu de l'export de haute qualite : volet qui montre la note ouverte telle que l'export la composera.
// Phase 2 : coupure de lignes de Knuth et Plass avec cesure ; la pagination definitive et le PDF arrivent aux phases suivantes.
import { ItemView, Platform, WorkspaceLeaf } from "obsidian";
import { composeNote } from "./export/compose";
import type { ImageAsset } from "./export/image";
import type { MathAsset } from "./export/math";
import { FOOTNOTE_RULE_HEIGHT } from "./export/paginate";
import type { LineRun } from "./export/paragraph";
import { A4_SETUP, Row } from "./export/typeset";
import { loadAssets, pageStyleOf, warningLines } from "./export-context";
import { loadExportFont } from "./export-font";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

export const VIEW_TYPE_EXPORT = `mindmap-writing-export-preview`;

const PX_PER_PT = 96 / 72;

export class ExportPreviewView extends ItemView {
  private token = 0;
  private sheets: HTMLElement[] = [];
  private observer: ResizeObserver | null = null;
  // Adresses des images de l'apercu, a liberer quand il est recompose ou ferme.
  private urls: string[] = [];
  private images = new Map<string, ImageAsset>();

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
    this.releaseImages();
  }

  private releaseImages() {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
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

  // Morceaux de ligne : chacun a sa police (gras, italique) ; les appels de notes de bas de page sont des numeros en exposant, a 70 %
  // du corps du texte comme dans le calcul ; les liens web s'ouvrent dans le navigateur, les renvois (adresse commencant par #)
  // menent a l'endroit visé de l'apercu.
  // Dessin d'une formule : le contour, a l'echelle du corps du texte, dont le bas est sous la ligne de base de la profondeur voulue.
  private appendMath(el: HTMLElement, asset: MathAsset, size: number, inline: boolean) {
    const k = size / 1000;
    const svg = el.createSvg(`svg`, { attr: { width: `${asset.width * k}pt`, height: `${(asset.ascent + asset.descent) * k}pt`, viewBox: `0 ${-asset.ascent} ${asset.width} ${asset.ascent + asset.descent}` } });
    svg.createSvg(`path`, { attr: { d: asset.d, fill: `currentColor` } });
    svg.addClass(`mmw-row-math`);
    if (inline) svg.style.verticalAlign = `${-asset.descent * k}pt`;
  }

  private appendRuns(el: HTMLElement, runs: LineRun[]) {
    for (const run of runs) {
      if (run.math) {
        this.appendMath(el, run.math, Number.parseFloat(el.style.fontSize) || 11, true);
        continue;
      }
      const span = el.createSpan({ text: run.text });
      if (run.sup) span.addClass(`mmw-sup`);
      if (run.style === `mono`) span.addClass(`mmw-run-mono`);
      if (run.style === `bold` || run.style === `boldItalic`) span.addClass(`mmw-run-bold`);
      if (run.style === `italic` || run.style === `boldItalic`) span.addClass(`mmw-run-italic`);
      if (run.link) {
        span.addClass(`mmw-export-link`);
        const url = run.link;
        if (url.startsWith(`#`)) span.addEventListener(`click`, () => this.goTo(url.slice(1)));
        else {
          span.title = url;
          span.addEventListener(`click`, () => window.open(url));
        }
      }
    }
  }

  // Fait defiler l'apercu jusqu'a un repere (titre, figure, tableau, bloc).
  private goTo(anchor: string) {
    const target = Array.from(this.contentEl.querySelectorAll<HTMLElement>(`[data-anchor]`)).find((e) => e.dataset.anchor === anchor);
    target?.scrollIntoView({ block: `center`, behavior: `smooth` });
  }

  private renderRow(parent: HTMLElement, row: Row) {
    const el = parent.createDiv({ cls: `mmw-row mmw-row-${row.kind}` });
    el.style.height = `${row.height}pt`;
    if (row.anchor !== undefined) el.dataset.anchor = row.anchor;
    if (row.rules) {
      // Filets du tableau, sur toute sa largeur.
      el.style.position = `relative`;
      for (const side of [`top`, `bottom`] as const) {
        if (!row.rules[side]) continue;
        const rule = el.createDiv({ cls: `mmw-row-rule` });
        rule.style.left = `${row.x}pt`;
        rule.style.width = `${row.width}pt`;
        rule.style[side] = `0`;
      }
    }
    if (row.frame) {
      // Cadre d'un media : bords gauche et droit, et haut ou bas sur la premiere et la derniere ligne.
      el.style.position = `relative`;
      const frame = el.createDiv({ cls: `mmw-row-frame` });
      frame.style.width = `${row.frame.width}pt`;
      if (row.frame.top) frame.style.borderTopWidth = `0.5pt`;
      if (row.frame.bottom) frame.style.borderBottomWidth = `0.5pt`;
    }
    if (row.kind === `space` || row.kind === `float`) return;
    el.style.fontSize = `${row.fontSize}pt`;
    el.style.lineHeight = `${row.height}pt`;
    if (row.x >= 0) {
      el.style.paddingLeft = `${row.x}pt`;
      el.style.width = `${row.width + row.x}pt`;
    } else {
      // Signe qui depasse dans la marge gauche (protrusion) : la ligne commence avant le bord de la colonne.
      el.style.marginLeft = `${row.x}pt`;
      el.style.width = `${row.width}pt`;
    }
    if (row.align === `center`) el.style.textAlign = `center`;
    if (row.wordSpacing !== 0) el.style.wordSpacing = `${row.wordSpacing}pt`;
    if (row.math) {
      const k = row.math.size / 1000;
      const top = (row.height - (row.math.asset.ascent + row.math.asset.descent) * k) / 2;
      const holder = el.createDiv();
      holder.style.paddingTop = `${top}pt`;
      this.appendMath(holder, row.math.asset, row.math.size, false);
      return;
    }
    if (row.cells) {
      el.style.position = `relative`;
      const inner = row.height - (row.inset?.top ?? 0) - (row.inset?.bottom ?? 0);
      for (const c of row.cells) {
        const cell = el.createDiv({ cls: `mmw-row-cell` });
        cell.style.left = `${row.x + c.x}pt`;
        cell.style.top = `${row.inset?.top ?? 0}pt`;
        cell.style.lineHeight = `${inner}pt`;
        this.appendRuns(cell, c.runs);
      }
      return;
    }
    if (row.image) {
      const url = this.images.get(row.image.target)?.previewUrl;
      if (url) {
        const img = el.createEl(`img`, { cls: `mmw-row-image` });
        img.src = url;
        img.style.width = `${row.image.width}pt`;
        img.style.height = `${row.image.height}pt`;
      }
      return;
    }
    if (row.marker !== undefined) {
      const m = el.createSpan({ cls: row.kind === `footnote` ? `mmw-row-marker mmw-row-note-marker` : `mmw-row-marker`, text: row.marker });
      m.style.left = `${row.kind === `footnote` ? 0 : row.x - 16}pt`;
    }
    if (row.runs) this.appendRuns(el, row.runs);
    else el.appendChild(document.createTextNode(row.text));
    if (row.toc) {
      // Entree de la table des matieres : points de conduite et numero de page sur la derniere ligne du titre.
      const anchor = row.toc.anchor;
      el.addClass(`mmw-row-toc`);
      el.addEventListener(`click`, () => this.goTo(anchor));
      if (row.toc.page >= 0) {
        el.addClass(`mmw-row-toc-numbered`);
        el.createSpan({ cls: `mmw-row-leader` });
        el.createSpan({ text: String(row.toc.page) });
      }
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

    const loaded = await loadAssets(this.app, text, file.name, file.path);
    if (token !== this.token) {
      for (const u of loaded.urls) URL.revokeObjectURL(u);
      return;
    }
    this.releaseImages();
    this.urls = loaded.urls;
    this.images = loaded.images;
    const composed = composeNote(text, file.name, undefined, pageStyleOf(this.plugin.settings), { images: loaded.images, formulas: loaded.formulas });
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
    for (const line of warningLines(typeset.warnings)) head.createDiv({ cls: `mmw-export-stats`, text: line });
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
      for (const row of pg.topFloats ?? []) this.renderRow(body, row);
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
      if (pg.bottomFloats && pg.bottomFloats.length > 0) {
        // Flottants du bas : juste au-dessus des notes de bas de page.
        const noteArea = pg.footnotes.length > 0 ? FOOTNOTE_RULE_HEIGHT + pg.footnotes.reduce((a, r) => a + r.height, 0) : 0;
        const floats = page.createDiv({ cls: `mmw-export-notes` });
        floats.style.left = `${A4_SETUP.marginLeft}pt`;
        floats.style.bottom = `${A4_SETUP.marginBottom + noteArea}pt`;
        floats.style.width = `${textWidth}pt`;
        for (const row of pg.bottomFloats) this.renderRow(floats, row);
      }
      if (pg.footer) page.createDiv({ cls: `mmw-export-number`, text: pg.footer });
      this.sheets.push(sheet);
    });
    this.applyScale();
  }
}

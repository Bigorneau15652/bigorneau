// Fenetre de l'editeur de formules : palettes de symboles par onglets, zone de saisie du TeX, apercu dessine en direct sur lequel on
// clique pour choisir la partie de la formule a corriger, et cours d'utilisation. Elle est ouverte par le script Formules, qui lui
// passe le module Obsidian et le dessin des formules : ce fichier n'importe donc Obsidian que pour ses types.
import type { App, Editor } from "obsidian";
import { appendSvgDocument } from "./dom";
import { courseSections } from "./formula-course";
import { findFormula, insertTemplate, nextSlot, writeFormula } from "./formula-edit";
import { PALETTE, sampleOf } from "./formula-palette";
import { colorUnit, deleteUnit, svgLeaves, TexUnit, texUnits, unitsAt } from "./formula-units";
import type { HelpLang } from "./help";
import { applyInsert } from "./insert-apply";
import type { MathSvgRenderer } from "./script-formulas";

export interface FormulaEditorDeps {
  app: App;
  obsidian: typeof import("obsidian");
  lang: HelpLang;
  editor: Editor;
  renderSvg: MathSvgRenderer | undefined;
}

const TEXTS = {
  title: { fr: `Éditeur de formules`, en: `Formula editor` },
  inline: { fr: `En ligne (dans le texte)`, en: `Inline (in the text)` },
  block: { fr: `En bloc (sur ses lignes)`, en: `Block (on its own lines)` },
  placeholder: { fr: `Écrivez la formule en TeX, ou utilisez les palettes. Tab passe à l'emplacement vide suivant.`, en: `Write the formula in TeX, or use the palettes. Tab moves to the next empty slot.` },
  empty: { fr: `L'aperçu apparaît ici. Cliquez sur un de ses éléments pour le corriger.`, en: `The preview appears here. Click one of its elements to correct it.` },
  invalid: { fr: `Formule non reconnue : vérifiez les accolades et les commandes.`, en: `Formula not recognised: check the braces and the commands.` },
  disabled: { fr: `Aperçu indisponible.`, en: `Preview unavailable.` },
  insert: { fr: `Insérer`, en: `Insert` },
  replace: { fr: `Remplacer la formule`, en: `Replace the formula` },
  cancel: { fr: `Annuler`, en: `Cancel` },
  help: { fr: `Aide et cours`, en: `Help and course` },
  back: { fr: `Retour à l'éditeur`, en: `Back to the editor` },
} as const;

// Couleur d'essai des unites : elle ne sert qu'a reperer leurs elements dans un dessin redessine.
const PROBE = `red`;
// Distance maximale, en pixels, entre un clic et l'element dessine qu'il designe.
const HIT_DISTANCE = 14;

interface Analysis {
  key: string;
  units: TexUnit[];
  sets: number[][];
}

// Elements dessines (glyphes et traits) d'un dessin affiche, dans le meme ordre que svgLeaves.
function leafElements(svg: Element): Element[] {
  return Array.from(svg.querySelectorAll(`use, rect`)).filter((e) => e.closest(`defs`) === null);
}

// Indice de l'element dessine designe par un clic : celui qui contient le point, sinon le plus proche dans la limite de distance.
function hitLeaf(leaves: Element[], x: number, y: number): number {
  let best = -1;
  let bestDistance = HIT_DISTANCE;
  leaves.forEach((el, k) => {
    const r = el.getBoundingClientRect();
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const d = Math.hypot(dx, dy);
    if (d < bestDistance || (d === bestDistance && best < 0)) {
      best = k;
      bestDistance = d;
    }
  });
  return best;
}

export function openFormulaEditor(deps: FormulaEditorDeps, forceDisplay?: boolean): void {
  const { Modal } = deps.obsidian;
  const lang = deps.lang;

  // Formule sous le curseur (elle sera remplacee), sinon le texte selectionne devient le debut de la formule.
  const text = deps.editor.getValue();
  const selFrom = deps.editor.posToOffset(deps.editor.getCursor(`from`));
  const selTo = deps.editor.posToOffset(deps.editor.getCursor(`to`));
  const found = findFormula(text, selFrom);
  const editing = found !== null && selTo <= found.to;
  const range = editing && found ? { from: found.from, to: found.to } : { from: selFrom, to: selTo };
  const initialTex = editing ? (found?.tex ?? ``) : text.slice(selFrom, selTo);
  let display = forceDisplay ?? (editing ? (found?.display ?? false) : false);

  // Dessins des boutons de la palette, gardes pour ne pas les recalculer a chaque changement d'onglet.
  const thumbnails = new Map<string, string | null>();

  class FormulaModal extends Modal {
    private area!: HTMLTextAreaElement;
    private previewBox!: HTMLElement;
    private editorView!: HTMLElement;
    private guideView!: HTMLElement;
    private token = 0;
    private timer = 0;
    // Dessin affiche : formule, texte SVG et element dans la page.
    private shown: { tex: string; display: boolean; svgText: string; svg: SVGElement } | null = null;
    private analysis: Analysis | null = null;
    // Dernier choix fait par un clic dans l'apercu : il permet le clic suivant a agrandir le choix et la touche Suppr a effacer l'unite.
    private last: { tex: string; leaf: number; unit: TexUnit } | null = null;

    onOpen(): void {
      this.modalEl.addClass(`mmw-formula-modal`);
      this.titleEl.setText(TEXTS.title[lang]);
      const { contentEl } = this;
      contentEl.empty();
      this.editorView = contentEl.createDiv();
      this.guideView = contentEl.createDiv({ cls: `mmw-formula-guide mmw-formula-hidden` });
      this.buildEditor(this.editorView);
      this.buildGuide(this.guideView);
    }

    onClose(): void {
      window.clearTimeout(this.timer);
      this.contentEl.empty();
    }

    private buildEditor(root: HTMLElement): void {
      const top = root.createDiv({ cls: `mmw-formula-top` });
      const mode = top.createEl(`select`, { cls: `dropdown mmw-formula-mode` });
      mode.createEl(`option`, { value: `inline`, text: TEXTS.inline[lang] });
      mode.createEl(`option`, { value: `block`, text: TEXTS.block[lang] });
      mode.value = display ? `block` : `inline`;
      mode.addEventListener(`change`, () => {
        display = mode.value === `block`;
        this.refresh();
      });
      const help = top.createEl(`button`, { text: TEXTS.help[lang] });
      help.type = `button`;
      help.addEventListener(`click`, () => this.showGuide(true));

      const tabs = root.createDiv({ cls: `mmw-formula-tabs` });
      const grid = root.createDiv({ cls: `mmw-formula-grid` });
      const tabButtons: HTMLElement[] = [];
      const show = (index: number): void => {
        tabButtons.forEach((b, i) => b.toggleClass(`is-active`, i === index));
        grid.empty();
        const isStructures = PALETTE[index].id === `structures`;
        for (const item of PALETTE[index].items) {
          const b = grid.createEl(`button`, { cls: `mmw-formula-key`, text: item.label });
          b.type = `button`;
          // L'infobulle est celle d'Obsidian (aria-label) : un attribut title y ajouterait celle du navigateur, en double.
          b.setAttr(`aria-label`, item.tip[lang]);
          // mousedown : la zone de saisie garde le focus et sa selection.
          b.addEventListener(`mousedown`, (e) => e.preventDefault());
          b.addEventListener(`click`, () => this.put(item.tex));
          if (isStructures) void this.thumbnail(b, sampleOf(item));
        }
      };
      PALETTE.forEach((g, i) => {
        const b = tabs.createEl(`button`, { cls: `mmw-formula-tab`, text: g.name[lang] });
        b.type = `button`;
        b.addEventListener(`click`, () => show(i));
        tabButtons.push(b);
      });
      show(0);

      this.area = root.createEl(`textarea`, { cls: `mmw-formula-input` });
      this.area.rows = 4;
      this.area.spellcheck = false;
      this.area.placeholder = TEXTS.placeholder[lang];
      this.area.value = initialTex;
      this.area.addEventListener(`input`, () => {
        this.last = null;
        this.refresh();
      });
      this.area.addEventListener(`keydown`, (e) => this.onKey(e));

      this.previewBox = root.createDiv({ cls: `mmw-formula-preview` });
      this.previewBox.addEventListener(`click`, (e) => void this.onPreviewClick(e));

      const buttons = root.createDiv({ cls: `modal-button-container` });
      const cancel = buttons.createEl(`button`, { text: TEXTS.cancel[lang] });
      cancel.addEventListener(`click`, () => this.close());
      const ok = buttons.createEl(`button`, { cls: `mod-cta`, text: editing ? TEXTS.replace[lang] : TEXTS.insert[lang] });
      ok.addEventListener(`click`, () => this.commit());

      this.refresh();
      this.area.focus();
      this.area.setSelectionRange(this.area.value.length, this.area.value.length);
    }

    // Cours d'utilisation de l'editeur (memes textes que la fenetre d'aide du plugin).
    private buildGuide(root: HTMLElement): void {
      const back = root.createEl(`button`, { text: TEXTS.back[lang] });
      back.type = `button`;
      back.addEventListener(`click`, () => this.showGuide(false));
      const body = root.createDiv({ cls: `mmw-formula-guide-body` });
      for (const section of courseSections()) {
        body.createEl(`h4`, { text: section.title[lang] });
        for (const line of section.text[lang].split(`\n`)) body.createEl(`p`, { text: line });
      }
    }

    private showGuide(on: boolean): void {
      this.editorView.toggleClass(`mmw-formula-hidden`, on);
      this.guideView.toggleClass(`mmw-formula-hidden`, !on);
      if (!on) this.area.focus();
    }

    // Dessin d'un bouton de structure : la formule d'exemple, ou le texte du bouton si le dessin est indisponible.
    private async thumbnail(button: HTMLElement, sample: string): Promise<void> {
      if (!deps.renderSvg) return;
      let svg = thumbnails.get(sample);
      if (svg === undefined) {
        svg = await deps.renderSvg(sample, false);
        thumbnails.set(sample, svg);
      }
      if (!svg || !button.isConnected) return;
      const drawn = appendSvgDocument(button, svg);
      if (!drawn) return;
      drawn.removeAttribute(`style`);
      button.setText(``);
      button.appendChild(drawn);
    }

    private onKey(e: KeyboardEvent): void {
      if (e.key === `Tab` && !e.shiftKey) {
        const at = nextSlot(this.area.value, this.area.selectionEnd);
        if (at >= 0) {
          e.preventDefault();
          this.area.setSelectionRange(at, at);
        }
      } else if (e.key === `Enter` && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.commit();
      } else if ((e.key === `Delete` || e.key === `Backspace`) && this.last) {
        // Une partie choisie dans l'apercu s'efface en entier, avec son signe d'exposant ou d'indice.
        const { tex, unit } = this.last;
        if (tex === this.area.value && this.area.selectionStart === unit.start && this.area.selectionEnd === unit.end) {
          e.preventDefault();
          const r = deleteUnit(tex, unit);
          this.area.value = r.text;
          this.area.setSelectionRange(r.caret, r.caret);
          this.last = null;
          this.refresh();
        }
      }
    }

    // Insere un modele de la palette a la place de la selection de la zone de saisie.
    private put(template: string): void {
      const next = insertTemplate({ text: this.area.value, start: this.area.selectionStart, end: this.area.selectionEnd }, template);
      this.area.value = next.text;
      this.area.focus();
      this.area.setSelectionRange(next.start, next.end);
      this.last = null;
      this.refresh();
    }

    // Apercu : redessine peu de temps apres la derniere frappe.
    private refresh(): void {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.draw(), 150);
    }

    private async draw(): Promise<void> {
      const tex = this.area.value.trim();
      const mine = ++this.token;
      this.shown = null;
      this.analysis = null;
      this.previewBox.empty();
      if (tex === ``) {
        this.previewBox.createDiv({ cls: `mmw-formula-note`, text: TEXTS.empty[lang] });
        return;
      }
      if (!deps.renderSvg) {
        this.previewBox.createDiv({ cls: `mmw-formula-note`, text: TEXTS.disabled[lang] });
        return;
      }
      const svgText = await deps.renderSvg(tex, display);
      if (mine !== this.token) return;
      this.previewBox.empty();
      const svg = svgText ? appendSvgDocument(this.previewBox, svgText) : null;
      if (!svgText || !svg) {
        this.previewBox.createDiv({ cls: `mmw-formula-note mmw-formula-error`, text: TEXTS.invalid[lang] });
        return;
      }
      svg.removeAttribute(`style`);
      svg.classList.add(`mmw-formula-svg`);
      if (display) svg.classList.add(`mmw-formula-svg-block`);
      this.shown = { tex, display, svgText, svg };
    }

    // Pour chaque unite de la formule, indices des elements dessines qui lui appartiennent : la formule est redessinee avec l'unite en
    // couleur. Le calcul se fait au premier clic suivant chaque modification.
    private async analyse(): Promise<Analysis | null> {
      const shown = this.shown;
      if (!shown || !deps.renderSvg) return null;
      const key = `${shown.display ? `b` : `i`}:${shown.tex}`;
      if (this.analysis?.key === key) return this.analysis;
      const count = svgLeaves(shown.svgText).length;
      const units = texUnits(shown.tex);
      const sets: number[][] = [];
      for (const unit of units) {
        const variant = await deps.renderSvg(colorUnit(shown.tex, unit, PROBE), shown.display);
        const leaves = variant ? svgLeaves(variant) : [];
        sets.push(leaves.length === count ? leaves.flatMap((l, k) => (l.color === PROBE ? [k] : [])) : []);
      }
      if (this.shown !== shown) return null;
      this.analysis = { key, units, sets };
      return this.analysis;
    }

    // Clic dans l'apercu : la partie correspondante du TeX est selectionnee et colorée ; un clic de plus au meme endroit agrandit le choix.
    private async onPreviewClick(e: MouseEvent): Promise<void> {
      const shown = this.shown;
      if (!shown) return;
      const leaves = leafElements(shown.svg);
      const leaf = hitLeaf(leaves, e.clientX, e.clientY);
      if (leaf < 0) return;
      const a = await this.analyse();
      if (!a || this.shown !== shown) return;
      const candidates = unitsAt(a.units, a.sets, leaf);
      if (candidates.length === 0) return;
      let pick = candidates[0];
      const last = this.last;
      if (last && last.leaf === leaf && last.tex === shown.tex) {
        const at = candidates.findIndex((u) => u.start === last.unit.start && u.end === last.unit.end);
        pick = candidates[Math.min(at + 1, candidates.length - 1)];
      }
      this.area.focus();
      this.area.setSelectionRange(pick.start, pick.end);
      this.last = { tex: shown.tex, leaf, unit: pick };
      for (const el of leaves) el.classList.remove(`mmw-formula-hl`);
      for (const k of a.sets[a.units.indexOf(pick)] ?? []) leaves[k]?.classList.add(`mmw-formula-hl`);
    }

    private commit(): void {
      const tex = this.area.value.trim();
      if (tex === ``) {
        this.close();
        return;
      }
      applyInsert(deps.editor, (current) => writeFormula(current, range.from, range.to, tex, display));
      this.close();
    }
  }

  new FormulaModal(deps.app).open();
}

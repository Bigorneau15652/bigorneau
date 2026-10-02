// Fenetre de l'editeur de formules : palettes de symboles par onglets, zone de saisie du TeX, apercu dessine en direct sur lequel on
// clique pour choisir la partie de la formule a corriger, et cours d'utilisation. Elle est ouverte par le script Formules, qui lui
// passe le module Obsidian et le dessin des formules : ce fichier n'importe donc Obsidian que pour ses types.
import type { App, Editor } from "obsidian";
import { appendSvgDocument } from "./dom";
import { courseSections } from "./formula-course";
import { renderSection } from "./formula-course-view";
import { findFormula, insertTemplate, nextSlot, writeFormula } from "./formula-edit";
import { PALETTE, sampleOf } from "./formula-palette";
import { CaretSpot, deleteUnit, eraseAt, pickVertical, previewTex, stepPoint, svgLeaves, TexModel, TexUnit, texModel, typeKey, unitEndingAt, unitStartingAt, unitsAt } from "./formula-units";
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
// Distance maximale pour qu'un clic compte comme un clic sur le carre d'un emplacement vide.
const SLOT_DISTANCE = 6;

// Elements dessines (glyphes et traits) d'un dessin affiche, dans le meme ordre que svgLeaves.
function leafElements(svg: Element): Element[] {
  return Array.from(svg.querySelectorAll(`use, rect`)).filter((e) => e.closest(`defs`) === null);
}

// Indice de l'element dessine designe par un clic : celui qui contient le point, sinon le plus proche dans la limite de distance.
function hitLeaf(leaves: Element[], x: number, y: number, maxDistance = HIT_DISTANCE): number {
  let best = -1;
  let bestDistance = maxDistance;
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
    // Dessin affiche : texte de la formule (tel que saisi, pour que les positions soient celles de la zone de saisie), texte SVG, element
    // dans la page, decoupage en unites et points de curseur.
    private shown: { tex: string; display: boolean; svgText: string; svg: SVGElement; model: TexModel; count: number } | null = null;
    // Elements dessines de chaque partie (unite ou emplacement) du dessin affiche, calcules a la demande.
    private sets = new Map<string, number[]>();
    private caretEl: HTMLElement | null = null;
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
      this.previewBox.tabIndex = 0;
      this.previewBox.addEventListener(`click`, (e) => void this.onPreviewClick(e));
      this.previewBox.addEventListener(`keydown`, (e) => void this.onPreviewKey(e));
      this.previewBox.addEventListener(`focus`, () => void this.syncView());

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
        renderSection(body, section, lang, deps.renderSvg);
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
    private refresh(delay = 150): void {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.draw(), delay);
    }

    private async draw(): Promise<void> {
      window.clearTimeout(this.timer);
      const tex = this.area.value;
      const mine = ++this.token;
      this.shown = null;
      this.sets = new Map();
      this.caretEl = null;
      this.previewBox.empty();
      if (tex.trim() === ``) {
        this.previewBox.createDiv({ cls: `mmw-formula-note`, text: TEXTS.empty[lang] });
        return;
      }
      if (!deps.renderSvg) {
        this.previewBox.createDiv({ cls: `mmw-formula-note`, text: TEXTS.disabled[lang] });
        return;
      }
      const model = texModel(tex);
      const svgText = await deps.renderSvg(previewTex(tex, model.slots), display);
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
      this.shown = { tex, display, svgText, svg, model, count: svgLeaves(svgText).length };
      this.caretEl = this.previewBox.createDiv({ cls: `mmw-formula-caret` });
      await this.markSlots();
      await this.syncView();
    }

    // Elements dessines (indices) d'une partie du dessin : une unite ou un emplacement vide, repere en la redessinant en couleur.
    private async setOf(part: { unit: TexUnit } | { slot: number }): Promise<number[]> {
      const shown = this.shown;
      if (!shown || !deps.renderSvg) return [];
      const key = `unit` in part ? `u${part.unit.start}:${part.unit.end}` : `s${part.slot}`;
      const cached = this.sets.get(key);
      if (cached) return cached;
      const probe = `unit` in part ? { color: PROBE, unit: part.unit } : { color: PROBE, slot: part.slot };
      const variant = await deps.renderSvg(previewTex(shown.tex, shown.model.slots, probe), shown.display);
      const leaves = variant ? svgLeaves(variant) : [];
      const set = leaves.length === shown.count ? leaves.flatMap((l, k) => (l.color === PROBE ? [k] : [])) : [];
      if (this.shown === shown) this.sets.set(key, set);
      return set;
    }

    private leaves(): Element[] {
      return this.shown ? leafElements(this.shown.svg) : [];
    }

    // Les carres des emplacements vides s'affichent en discret.
    private async markSlots(): Promise<void> {
      const shown = this.shown;
      if (!shown) return;
      for (const slot of shown.model.slots) {
        const set = await this.setOf({ slot });
        if (this.shown !== shown) return;
        const leaves = this.leaves();
        for (const k of set) leaves[k]?.classList.add(`mmw-formula-slot`);
      }
    }

    // Rectangle (dans l'apercu) qui entoure des elements dessines.
    private boxOf(set: number[]): { left: number; right: number; top: number; bottom: number } | null {
      const leaves = this.leaves();
      const origin = this.previewBox.getBoundingClientRect();
      let box: { left: number; right: number; top: number; bottom: number } | null = null;
      for (const k of set) {
        const el = leaves[k];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const b = { left: r.left - origin.left + this.previewBox.scrollLeft, right: r.right - origin.left + this.previewBox.scrollLeft, top: r.top - origin.top, bottom: r.bottom - origin.top };
        box = box ? { left: Math.min(box.left, b.left), right: Math.max(box.right, b.right), top: Math.min(box.top, b.top), bottom: Math.max(box.bottom, b.bottom) } : b;
      }
      return box;
    }

    // Position du curseur a un decalage du texte TeX : au bord de l'element voisin, ou sur le carre d'un emplacement vide.
    private async spotOf(offset: number): Promise<(CaretSpot & { slot: boolean; set: number[] }) | null> {
      const shown = this.shown;
      if (!shown) return null;
      if (shown.model.slots.includes(offset)) {
        const set = await this.setOf({ slot: offset });
        const box = this.boxOf(set);
        return box ? { offset, x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2, slot: true, set } : null;
      }
      const prev = unitEndingAt(shown.model.units, offset);
      const next = prev ? null : unitStartingAt(shown.model.units, offset);
      const unit = prev ?? next;
      if (!unit) return null;
      const set = await this.setOf({ unit });
      const box = this.boxOf(set);
      return box ? { offset, x: prev ? box.right : box.left, y: (box.top + box.bottom) / 2, slot: false, set: [] } : null;
    }

    private fontPx(): number {
      const svg = this.shown?.svg;
      return svg ? parseFloat(getComputedStyle(svg).fontSize) || 24 : 24;
    }

    // Met a jour ce que la vue montre de la selection : une partie choisie est coloree ; un curseur sans selection clignote a sa place,
    // sur le carre de l'emplacement vide quand il y en a un.
    private async syncView(): Promise<void> {
      const shown = this.shown;
      if (!shown) return;
      const leaves = this.leaves();
      for (const el of leaves) el.classList.remove(`mmw-formula-hl`, `mmw-formula-slot-active`);
      this.caretEl?.classList.remove(`is-visible`);
      const start = this.area.selectionStart;
      const end = this.area.selectionEnd;
      if (end > start) {
        const unit = shown.model.units.find((u) => u.start === start && u.end === end);
        if (!unit) return;
        const set = await this.setOf({ unit });
        if (this.shown !== shown) return;
        for (const k of set) leaves[k]?.classList.add(`mmw-formula-hl`);
        return;
      }
      const spot = await this.spotOf(end);
      if (!spot || this.shown !== shown) return;
      if (spot.slot) {
        for (const k of spot.set) leaves[k]?.classList.add(`mmw-formula-slot-active`);
        return;
      }
      const h = this.fontPx();
      const caret = this.caretEl;
      if (!caret) return;
      caret.style.setProperty(`left`, `${spot.x}px`);
      caret.style.setProperty(`top`, `${spot.y - h / 2}px`);
      caret.style.setProperty(`height`, `${h}px`);
      caret.classList.add(`is-visible`);
    }

    // Le dessin est a jour par rapport a la zone de saisie (sinon il est redessine tout de suite).
    private async fresh(): Promise<boolean> {
      if (this.shown?.tex !== this.area.value) await this.draw();
      return this.shown?.tex === this.area.value;
    }

    private place(start: number, end = start): void {
      this.area.setSelectionRange(start, end);
      this.last = null;
      void this.syncView();
    }

    private edited(r: { text: string; start: number; end: number }): void {
      this.area.value = r.text;
      this.area.setSelectionRange(r.start, r.end);
      this.last = null;
      void this.draw();
    }

    // Touches pressees dans l'apercu : fleches pour se deplacer dans la formule, Tab pour l'emplacement vide suivant, frappe directe,
    // Retour arriere et Suppr.
    private async onPreviewKey(e: KeyboardEvent): Promise<void> {
      if (e.key === `Enter` && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.commit();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const printable = e.key.length === 1 && e.key !== ` `;
      const known = printable || [`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Backspace`, `Delete`, `Tab`, ` `].includes(e.key);
      if (!known) return;
      if (e.key === `Tab` && e.shiftKey) return;
      e.preventDefault();
      if (!(await this.fresh())) return;
      const shown = this.shown;
      if (!shown) return;
      const { model } = shown;
      const start = this.area.selectionStart;
      const end = this.area.selectionEnd;
      switch (e.key) {
        case `ArrowRight`:
        case `ArrowLeft`: {
          const p = stepPoint(model.points, start, end, e.key === `ArrowRight` ? 1 : -1);
          if (p !== null) this.place(p);
          return;
        }
        case `ArrowUp`:
        case `ArrowDown`: {
          const from = await this.spotOf(e.key === `ArrowDown` ? end : start);
          if (!from) return;
          const spots: CaretSpot[] = [];
          for (const p of model.points) {
            const spot = await this.spotOf(p);
            if (spot && p !== from.offset) spots.push(spot);
          }
          if (this.shown !== shown) return;
          const pick = pickVertical(spots, from, e.key === `ArrowUp` ? `up` : `down`, this.fontPx() * 0.5);
          if (pick) this.place(pick.offset);
          return;
        }
        case `Tab`: {
          const at = nextSlot(this.area.value, end);
          if (at >= 0) this.place(at);
          return;
        }
        case `Backspace`:
        case `Delete`: {
          const r = eraseAt(this.area.value, start, end, e.key === `Backspace` ? -1 : 1, model.units);
          if (r) this.edited(r);
          return;
        }
        default: {
          if (e.key === ` `) return;
          const r = typeKey(this.area.value, start, end, e.key, model.units);
          if (r) this.edited(r);
        }
      }
    }

    // Clic dans l'apercu : le curseur se place au point le plus proche (le bord d'un symbole, ou le carre d'un emplacement vide), sans rien
    // colorer, pour continuer a ecrire. Un double clic choisit l'element touche (partie correspondante du TeX, en couleur) ; un clic
    // de plus au meme endroit agrandit le choix. Le focus passe a l'apercu, ou les fleches deplacent le curseur dans la formule.
    private async onPreviewClick(e: MouseEvent): Promise<void> {
      const shown = this.shown;
      if (!shown) return;
      this.previewBox.focus();
      const leaves = leafElements(shown.svg);
      if (e.detail >= 2) {
        const leaf = hitLeaf(leaves, e.clientX, e.clientY);
        if (leaf >= 0) await this.chooseAt(shown, leaves, leaf);
        return;
      }
      // Un clic sur le carre d'un emplacement vide place le curseur dedans (c'est ainsi que l'on ecrit sous une barre de fraction).
      const near = hitLeaf(leaves, e.clientX, e.clientY, SLOT_DISTANCE);
      if (near >= 0) {
        for (const slot of shown.model.slots) {
          if ((await this.setOf({ slot })).includes(near)) {
            this.place(slot);
            return;
          }
        }
      }
      const origin = this.previewBox.getBoundingClientRect();
      const x = e.clientX - origin.left + this.previewBox.scrollLeft;
      const y = e.clientY - origin.top;
      let best: { offset: number; d: number } | null = null;
      for (const p of shown.model.points) {
        const spot = await this.spotOf(p);
        if (!spot) continue;
        const d = Math.hypot(spot.x - x, (spot.y - y) * 1.5);
        if (!best || d < best.d) best = { offset: spot.offset, d };
      }
      if (this.shown !== shown) return;
      if (best) this.place(best.offset);
    }

    // Choisit l'element dessine d'indice `leaf` : la plus petite partie du TeX qui le contient, puis des parties de plus en plus grandes.
    private async chooseAt(shown: NonNullable<FormulaModal[`shown`]>, leaves: Element[], leaf: number): Promise<void> {
      const sets: number[][] = [];
      for (const unit of shown.model.units) sets.push(await this.setOf({ unit }));
      if (this.shown !== shown) return;
      const candidates = unitsAt(shown.model.units, sets, leaf);
      if (candidates.length === 0) return;
      let pick = candidates[0];
      const last = this.last;
      if (last && last.leaf === leaf && last.tex === shown.tex) {
        const at = candidates.findIndex((u) => u.start === last.unit.start && u.end === last.unit.end);
        pick = candidates[Math.min(at + 1, candidates.length - 1)];
      }
      this.area.setSelectionRange(pick.start, pick.end);
      this.last = { tex: shown.tex, leaf, unit: pick };
      await this.syncView();
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

// Fenetre de l'editeur de formules : palettes de symboles par onglets, zone de saisie du TeX et apercu dessine en direct.
// Elle est ouverte par le script Formules, qui lui passe le module Obsidian et le dessin des formules : ce fichier n'importe donc
// Obsidian que pour ses types.
import type { App, Editor } from "obsidian";
import { setSvg } from "./dom";
import { findFormula, insertTemplate, nextSlot, writeFormula } from "./formula-edit";
import { PALETTE } from "./formula-palette";
import type { HelpLang } from "./help";
import { applyInsert } from "./insert-apply";
import type { MathRenderer } from "./script-formulas";

export interface FormulaEditorDeps {
  app: App;
  obsidian: typeof import("obsidian");
  lang: HelpLang;
  editor: Editor;
  render: MathRenderer | undefined;
}

const TEXTS = {
  title: { fr: `Éditeur de formules`, en: `Formula editor` },
  inline: { fr: `En ligne (dans le texte)`, en: `Inline (in the text)` },
  block: { fr: `En bloc (sur ses lignes)`, en: `Block (on its own lines)` },
  placeholder: { fr: `Écrivez la formule en TeX, ou utilisez les palettes. Tab passe à l'emplacement vide suivant.`, en: `Write the formula in TeX, or use the palettes. Tab moves to the next empty slot.` },
  empty: { fr: `L'aperçu apparaît ici.`, en: `The preview appears here.` },
  invalid: { fr: `Formule non reconnue : vérifiez les accolades et les commandes.`, en: `Formula not recognised: check the braces and the commands.` },
  disabled: { fr: `Aperçu indisponible.`, en: `Preview unavailable.` },
  insert: { fr: `Insérer`, en: `Insert` },
  replace: { fr: `Remplacer la formule`, en: `Replace the formula` },
  cancel: { fr: `Annuler`, en: `Cancel` },
} as const;

// Hauteur de l'aperçu pour 1000 unites de la police de MathJax, en pixels.
const PX_PER_UNIT = 0.028;

export function openFormulaEditor(deps: FormulaEditorDeps, forceDisplay?: boolean): void {
  const { Modal } = deps.obsidian;
  const lang = deps.lang;

  // Formule sous le curseur (elle sera remplacee), sinon le texte selectionne devient le debut de la formule.
  const text = deps.editor.getValue();
  const selFrom = deps.editor.posToOffset(deps.editor.getCursor(`from`));
  const selTo = deps.editor.posToOffset(deps.editor.getCursor(`to`));
  const found = findFormula(text, selFrom);
  const range = found && selTo <= found.to ? { from: found.from, to: found.to } : { from: selFrom, to: selTo };
  const editing = found !== null && selTo <= found.to;
  const initialTex = editing ? (found?.tex ?? ``) : text.slice(selFrom, selTo);
  let display = forceDisplay ?? (editing ? (found?.display ?? false) : false);

  class FormulaModal extends Modal {
    private area!: HTMLTextAreaElement;
    private preview!: HTMLElement;
    private token = 0;
    private timer = 0;

    onOpen(): void {
      this.modalEl.addClass(`mmw-formula-modal`);
      this.titleEl.setText(TEXTS.title[lang]);
      const { contentEl } = this;
      contentEl.empty();

      const mode = contentEl.createEl(`select`, { cls: `dropdown mmw-formula-mode` });
      mode.createEl(`option`, { value: `inline`, text: TEXTS.inline[lang] });
      mode.createEl(`option`, { value: `block`, text: TEXTS.block[lang] });
      mode.value = display ? `block` : `inline`;
      mode.addEventListener(`change`, () => {
        display = mode.value === `block`;
        this.refresh();
      });

      const tabs = contentEl.createDiv({ cls: `mmw-formula-tabs` });
      const grid = contentEl.createDiv({ cls: `mmw-formula-grid` });
      const tabButtons: HTMLElement[] = [];
      const show = (index: number): void => {
        tabButtons.forEach((b, i) => b.toggleClass(`is-active`, i === index));
        grid.empty();
        for (const item of PALETTE[index].items) {
          const b = grid.createEl(`button`, { cls: `mmw-formula-key`, text: item.label });
          b.type = `button`;
          b.setAttr(`aria-label`, item.tip[lang]);
          b.setAttr(`title`, item.tip[lang]);
          // mousedown : la zone de saisie garde le focus et sa selection.
          b.addEventListener(`mousedown`, (e) => e.preventDefault());
          b.addEventListener(`click`, () => this.put(item.tex));
        }
      };
      PALETTE.forEach((g, i) => {
        const b = tabs.createEl(`button`, { cls: `mmw-formula-tab`, text: g.name[lang] });
        b.type = `button`;
        b.addEventListener(`click`, () => show(i));
        tabButtons.push(b);
      });
      show(0);

      this.area = contentEl.createEl(`textarea`, { cls: `mmw-formula-input` });
      this.area.rows = 4;
      this.area.spellcheck = false;
      this.area.placeholder = TEXTS.placeholder[lang];
      this.area.value = initialTex;
      this.area.addEventListener(`input`, () => this.refresh());
      this.area.addEventListener(`keydown`, (e) => {
        if (e.key === `Tab` && !e.shiftKey) {
          const at = nextSlot(this.area.value, this.area.selectionEnd);
          if (at >= 0) {
            e.preventDefault();
            this.area.setSelectionRange(at, at);
          }
        } else if (e.key === `Enter` && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.commit();
        }
      });

      this.preview = contentEl.createDiv({ cls: `mmw-formula-preview` });

      const buttons = contentEl.createDiv({ cls: `modal-button-container` });
      const cancel = buttons.createEl(`button`, { text: TEXTS.cancel[lang] });
      cancel.addEventListener(`click`, () => this.close());
      const ok = buttons.createEl(`button`, { cls: `mod-cta`, text: editing ? TEXTS.replace[lang] : TEXTS.insert[lang] });
      ok.addEventListener(`click`, () => this.commit());

      this.refresh();
      this.area.focus();
      this.area.setSelectionRange(this.area.value.length, this.area.value.length);
    }

    onClose(): void {
      window.clearTimeout(this.timer);
      this.contentEl.empty();
    }

    // Insere un modele de la palette a la place de la selection de la zone de saisie.
    private put(template: string): void {
      const next = insertTemplate({ text: this.area.value, start: this.area.selectionStart, end: this.area.selectionEnd }, template);
      this.area.value = next.text;
      this.area.focus();
      this.area.setSelectionRange(next.start, next.end);
      this.refresh();
    }

    // Aperçu : redessine peu de temps apres la derniere frappe.
    private refresh(): void {
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.draw(), 150);
    }

    private async draw(): Promise<void> {
      const tex = this.area.value.trim();
      const mine = ++this.token;
      this.preview.empty();
      if (tex === ``) {
        this.preview.createDiv({ cls: `mmw-formula-note`, text: TEXTS.empty[lang] });
        return;
      }
      if (!deps.render) {
        this.preview.createDiv({ cls: `mmw-formula-note`, text: TEXTS.disabled[lang] });
        return;
      }
      const asset = await deps.render(tex, display);
      if (mine !== this.token) return;
      this.preview.empty();
      if (!asset) {
        this.preview.createDiv({ cls: `mmw-formula-note mmw-formula-error`, text: TEXTS.invalid[lang] });
        return;
      }
      const height = asset.ascent + asset.descent;
      const svg = this.preview.createSvg(`svg`, { cls: `mmw-formula-svg` });
      svg.setAttribute(`viewBox`, `0 ${-asset.ascent} ${asset.width} ${height}`);
      svg.setAttribute(`width`, String(Math.max(1, asset.width * PX_PER_UNIT * (display ? 1.3 : 1))));
      svg.setAttribute(`height`, String(Math.max(1, height * PX_PER_UNIT * (display ? 1.3 : 1))));
      setSvg(svg, `<path fill="currentColor" d="${asset.d}"/>`);
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

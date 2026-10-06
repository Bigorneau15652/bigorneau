// Panneau de boutons a droite de la zone de redaction : un bouton d'aide, puis un bouton par fonction du registre, dans l'ordre
// choisi par l'utilisateur (clic long sur un bouton, puis glissement, pour le deplacer). Chaque fonction a aussi sa commande de
// la palette. Le panneau est pose dans chaque editeur Markdown ouvert.
import { App, Editor, getIconIds, MarkdownView, Notice, Platform, setIcon, setTooltip } from "obsidian";
import { CUSTOM_ICON_IDS } from "./custom-icons";
import { FunctionRegistry, moveId, panelOrder, PanelFunction, reorderVisible, visibleIds } from "./functions";
import { currentLang, t } from "./i18n";
import { SNAIL_ICON } from "./snail-icon";
import type { MmSettings } from "./settings";

// Ce qu'une fonction recoit quand on l'appelle : l'application, et l'editeur de la note quand la fonction ecrit dans la note.
export interface FunctionContext {
  app: App;
  editor?: Editor;
  view?: MarkdownView;
}

export interface PanelHost {
  app: App;
  settings: MmSettings;
  functions: FunctionRegistry<FunctionContext>;
  // Enregistre le nouvel ordre complet des boutons.
  saveOrder(order: string[]): Promise<void>;
  openHelp(): void;
  openScripts(): void;
}

// Duree d'appui, en millisecondes, avant que le bouton puisse etre deplace ; au-dela de ce deplacement en pixels avant la fin de
// l'attente, c'est un defilement et non un appui long.
const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE = 6;

let knownIcons: Set<string> | null = null;

// Premiere icone de la liste qui existe dans la serie d'Obsidian ; sinon une icone neutre.
export function pickIcon(candidates: string[]): string {
  // Une icone dessinee pour Bigorneau n'est pas dans la serie d'Obsidian : elle est prise telle quelle.
  if (candidates.length > 0 && CUSTOM_ICON_IDS.has(candidates[0])) return candidates[0];
  if (!knownIcons) {
    try {
      knownIcons = new Set(getIconIds());
    } catch {
      knownIcons = new Set();
    }
  }
  if (knownIcons.size === 0) return candidates[0] ?? `file-text`;
  for (const c of candidates) if (knownIcons.has(`lucide-${c}`) || knownIcons.has(c)) return c;
  return `file-text`;
}

export class ButtonPanel {
  // Vrai juste apres un deplacement : le clic qui suit le relachement ne doit pas lancer la fonction.
  private suppressClick = false;

  constructor(private host: PanelHost) {}

  private shouldShow(): boolean {
    const s = this.host.settings;
    return s.panelVisible && (!Platform.isMobile || s.panelOnMobile);
  }

  // Fonctions disponibles sur cet appareil, dans l'ordre complet enregistre.
  private available(): PanelFunction<FunctionContext>[] {
    const all = this.host.functions.all().filter((f) => f.button !== false && (!f.available || f.available()));
    const order = panelOrder(all.map((f) => f.id), this.host.settings.panelOrder);
    return order.map((id) => all.find((f) => f.id === id) as PanelFunction<FunctionContext>);
  }

  // Pose, met a jour ou retire le panneau de chaque editeur Markdown ouvert.
  sync(): void {
    const show = this.shouldShow();
    for (const leaf of this.host.app.workspace.getLeavesOfType(`markdown`)) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const existing = view.contentEl.querySelector<HTMLElement>(`:scope > .mmw-panel`);
      if (!show) {
        existing?.remove();
        view.contentEl.removeClass(`mmw-has-panel`);
        continue;
      }
      view.contentEl.addClass(`mmw-has-panel`);
      this.render(existing ?? view.contentEl.createDiv({ cls: `mmw-panel` }), view);
    }
  }

  detachAll(): void {
    for (const leaf of this.host.app.workspace.getLeavesOfType(`markdown`)) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      view.contentEl.querySelector(`:scope > .mmw-panel`)?.remove();
      view.contentEl.removeClass(`mmw-has-panel`);
    }
  }

  private render(panel: HTMLElement, view: MarkdownView): void {
    const s = this.host.settings;
    const functions = this.available();
    const shown = visibleIds(functions.map((f) => f.id), s.panelOrder, s.panelHidden);
    // Rien n'est reconstruit tant que ni les boutons, ni leur ordre, ni la langue n'ont change.
    const states = shown.map((id) => {
      const fn = functions.find((f) => f.id === id) as PanelFunction<FunctionContext>;
      return fn.active ? fn.active({ app: this.host.app, view, editor: view.editor }) : null;
    });
    const signature = JSON.stringify([shown, currentLang(), states]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    panel.empty();

    const scripts = panel.createEl(`button`, { cls: `mmw-panel-button clickable-icon` });
    scripts.type = `button`;
    scripts.createEl(`img`, { cls: `mmw-panel-snail`, attr: { src: SNAIL_ICON, alt: `` } });
    scripts.setAttr(`aria-label`, t(`Scripts de Bigorneau`));
    setTooltip(scripts, t(`Scripts de Bigorneau`), { placement: `left` });
    scripts.addEventListener(`click`, () => this.host.openScripts());

    const help = panel.createEl(`button`, { cls: `mmw-panel-button clickable-icon` });
    help.type = `button`;
    setIcon(help, pickIcon([`circle-help`, `help-circle`, `info`]));
    help.setAttr(`aria-label`, t(`Aide de Bigorneau`));
    setTooltip(help, t(`Aide de Bigorneau`), { placement: `left` });
    help.addEventListener(`click`, () => this.host.openHelp());

    const list = panel.createDiv({ cls: `mmw-panel-functions` });
    for (const id of shown) {
      const fn = functions.find((f) => f.id === id) as PanelFunction<FunctionContext>;
      const btn = list.createEl(`button`, { cls: `mmw-panel-button clickable-icon` });
      btn.type = `button`;
      btn.dataset.id = fn.id;
      if (fn.active && fn.active({ app: this.host.app, view, editor: view.editor })) btn.addClass(`mmw-panel-active`);
      setIcon(btn, pickIcon(fn.icons));
      btn.setAttr(`aria-label`, fn.name());
      setTooltip(btn, fn.name(), { placement: `left` });
      btn.addEventListener(`click`, () => {
        if (this.suppressClick) return;
        this.run(fn, view);
      });
      this.makeDraggable(btn, list, functions.map((f) => f.id), shown);
    }
  }

  private run(fn: PanelFunction<FunctionContext>, view: MarkdownView): void {
    if (fn.needsEditor && view.getMode() !== `source`) {
      new Notice(t(`Passez la note en mode édition pour utiliser cette fonction.`));
      return;
    }
    const ctx = { app: this.host.app, view, ...(fn.needsEditor ? { editor: view.editor } : {}) };
    void Promise.resolve(fn.run(ctx)).then(() => window.setTimeout(() => this.sync(), 0));
  }

  // Clic long puis glissement : le bouton suit le pointeur, un trait montre ou il sera depose, et le nouvel ordre est enregistre au
  // relachement. Le bouton n'est pas deplace dans la page pendant le glissement (le deplacer ferait perdre la capture du pointeur).
  private makeDraggable(btn: HTMLElement, list: HTMLElement, allIds: string[], shown: string[]): void {
    let timer = 0;
    let startY = 0;
    let pointerId = -1;
    let dragging = false;
    let target = 0;
    let origin = 0;
    const others = (): HTMLElement[] => Array.from(list.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c !== btn);
    const clearMarks = (): void => {
      for (const el of Array.from(list.children)) el.removeClasses([`mmw-panel-drop-before`, `mmw-panel-drop-after`]);
    };
    // Le trait de depot n'apparait que lorsque le bouton a quitte sa place : au debut du geste, c'est le bouton entier qui est entoure.
    const mark = (): void => {
      clearMarks();
      const rest = others();
      if (rest.length === 0 || target === origin) return;
      if (target < rest.length) rest[target].addClass(`mmw-panel-drop-before`);
      else rest[rest.length - 1].addClass(`mmw-panel-drop-after`);
    };
    const finish = (commit: boolean): void => {
      window.clearTimeout(timer);
      if (!dragging) return;
      dragging = false;
      clearMarks();
      btn.removeClass(`mmw-panel-dragging`);
      btn.style.removeProperty(`transform`);
      try {
        btn.releasePointerCapture(pointerId);
      } catch {
        // Capture deja liberee.
      }
      this.suppressClick = true;
      window.setTimeout(() => (this.suppressClick = false), 0);
      if (!commit) return;
      const id = btn.dataset.id as string;
      const reordered = moveId(shown, id, target);
      if (reordered.join() === shown.join()) return;
      const full = panelOrder(allIds, this.host.settings.panelOrder);
      void this.host.saveOrder(reorderVisible(full, shown, reordered));
    };
    btn.addEventListener(`pointerdown`, (e) => {
      if (e.button !== 0) return;
      startY = e.clientY;
      pointerId = e.pointerId;
      timer = window.setTimeout(() => {
        dragging = true;
        origin = shown.indexOf(btn.dataset.id as string);
        target = origin;
        btn.setPointerCapture(pointerId);
        btn.addClass(`mmw-panel-dragging`);
        mark();
      }, LONG_PRESS_MS);
    });
    btn.addEventListener(`pointermove`, (e) => {
      if (!dragging) {
        if (Math.abs(e.clientY - startY) > MOVE_TOLERANCE) window.clearTimeout(timer);
        return;
      }
      btn.style.transform = `translateY(${e.clientY - startY}px)`;
      // Position de depot : nombre de autres boutons dont le centre est au-dessus du pointeur.
      target = others().filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2 < e.clientY;
      }).length;
      mark();
    });
    btn.addEventListener(`pointerup`, () => finish(true));
    btn.addEventListener(`pointercancel`, () => finish(false));
  }
}

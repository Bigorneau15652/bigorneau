// Zen mode: the window goes full screen, the list of titles (black and white) takes a quarter of the width on the left and the note
// the rest. Everything else of Obsidian is hidden by a style that depends on the class `mmw-zen` of the page.
// The list can be hidden: a button appears when the mouse goes to the top left corner and disappears after a few seconds, and a
// shortcut shows or hides the list. Escape (or the end of the full screen) leaves the mode.
import { Modal, Platform, setIcon } from "obsidian";
import type MindmapWritingPlugin from "./main";
import { t } from "./i18n";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";

// Share of the width given to the list, in percent.
const ZEN_LIST_PERCENT = 25;
// Time during which the corner button, or a list shown on request, stays visible, in milliseconds.
const SHOW_MS = 4000;
// Side of the square of the top left corner in which the mouse makes the button appear, in pixels.
const CORNER_SIZE = 64;

// Explanation shown when the mode starts: what it is, how to leave it and the two shortcuts.
class ZenIntroModal extends Modal {
  onOpen(): void {
    const mod = Platform.isMacOS ? `Cmd` : `Ctrl`;
    this.titleEl.setText(t(`Mode Zen`));
    this.contentEl.createEl(`p`, { text: t(`Le mode Zen affiche la note en plein écran, avec la liste des titres en noir et blanc à gauche. Tout le reste disparaît. Échap permet d'en sortir.`) });
    const keys = this.contentEl.createEl(`ul`);
    keys.createEl(`li`, { text: t(`{0} + Maj + Entrée : passer de la liste au texte, et inversement.`, mod) });
    keys.createEl(`li`, { text: t(`{0} + Maj + L : ouvrir ou fermer la liste.`, mod) });
    this.contentEl.createEl(`p`, { cls: `mmw-zen-hint`, text: t(`Un bouton apparaît en haut à gauche de l'écran quand la souris s'en approche.`) });
    const ok = this.contentEl.createEl(`button`, { text: t(`Compris`), cls: `mod-cta` });
    ok.addEventListener(`click`, () => this.close());
    ok.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class ZenMode {
  private active = false;
  private view: MindmapView | null = null;
  private previous: { viewMode: `map` | `list`; blackWhite: boolean } | null = null;
  private listHidden = false;
  private cornerEl: HTMLElement | null = null;
  private cornerButton: HTMLButtonElement | null = null;
  private cornerTimer: number | null = null;
  private peekTimer: number | null = null;
  private cleanups: (() => void)[] = [];

  constructor(private plugin: MindmapWritingPlugin) {}

  isActive(): boolean {
    return this.active;
  }

  async toggle(): Promise<void> {
    if (this.active) this.exit();
    else await this.enter();
  }

  async enter(): Promise<void> {
    if (this.active) return;
    const plugin = this.plugin;
    const ws = plugin.app.workspace;
    // The list is wanted from the start so that a map opened now is laid out with the note on its right.
    this.previous = { viewMode: plugin.settings.viewMode, blackWhite: plugin.settings.blackWhite };
    await plugin.updateSettings({ viewMode: `list`, blackWhite: true });
    if (!ws.getLeavesOfType(VIEW_TYPE_MINDMAP)[0]) await plugin.activateView();
    const leaf = ws.getLeavesOfType(VIEW_TYPE_MINDMAP)[0];
    const view = leaf?.view;
    if (!(view instanceof MindmapView)) {
      await this.restoreSettings();
      return;
    }
    this.view = view;
    await view.showNote();
    const noteLeaf = view.getNoteLeaf();
    if (noteLeaf) plugin.narrowPane(leaf, noteLeaf, ZEN_LIST_PERCENT);

    this.active = true;
    this.listHidden = false;
    const doc = view.containerEl.ownerDocument;
    doc.body.addClass(`mmw-zen`);
    this.buildCorner(doc);

    const onKey = (e: KeyboardEvent): void => this.onKey(e);
    const onMove = (e: MouseEvent): void => this.onMove(e);
    const onFullscreen = (): void => {
      if (!doc.fullscreenElement) this.exit();
    };
    doc.addEventListener(`keydown`, onKey, true);
    doc.addEventListener(`mousemove`, onMove, true);
    doc.addEventListener(`fullscreenchange`, onFullscreen);
    this.cleanups.push(() => {
      doc.removeEventListener(`keydown`, onKey, true);
      doc.removeEventListener(`mousemove`, onMove, true);
      doc.removeEventListener(`fullscreenchange`, onFullscreen);
    });

    // Full screen: without it, Escape is handled by the mode itself (see onKey).
    try {
      await doc.documentElement.requestFullscreen();
    } catch {
      // The window stays as it is: the mode works all the same.
    }
    new ZenIntroModal(plugin.app).open();
  }

  // Leaves the mode: the page, the view and the settings come back to what they were.
  exit(): void {
    if (!this.active) return;
    this.active = false;
    for (const clean of this.cleanups.splice(0)) clean();
    if (this.cornerTimer !== null) window.clearTimeout(this.cornerTimer);
    if (this.peekTimer !== null) window.clearTimeout(this.peekTimer);
    this.cornerTimer = this.peekTimer = null;
    const doc = this.view?.containerEl.ownerDocument ?? document;
    this.listTabs()?.removeClass(`mmw-zen-list-hidden`);
    this.cornerEl?.remove();
    this.cornerEl = null;
    this.cornerButton = null;
    doc.body.removeClass(`mmw-zen`);
    if (doc.fullscreenElement) void doc.exitFullscreen().catch(() => undefined);
    this.view = null;
    void this.restoreSettings();
  }

  private async restoreSettings(): Promise<void> {
    const before = this.previous;
    this.previous = null;
    if (before) await this.plugin.updateSettings({ viewMode: before.viewMode, blackWhite: before.blackWhite });
  }

  // Container of the tabs that holds the list: hiding it gives its place to the note.
  private listTabs(): HTMLElement | null {
    return this.view?.containerEl.closest<HTMLElement>(`.workspace-tabs`) ?? null;
  }

  // Shows or hides the list for good.
  toggleList(): void {
    this.setListHidden(!this.listHidden);
  }

  private setListHidden(hidden: boolean): void {
    this.listHidden = hidden;
    this.listTabs()?.toggleClass(`mmw-zen-list-hidden`, hidden);
    if (this.cornerButton) setIcon(this.cornerButton, hidden ? `panel-left-open` : `panel-left-close`);
  }

  // The list that was hidden shows for a few seconds (to move through the titles), then hides again.
  private peekList(): void {
    if (!this.listHidden) return;
    this.listTabs()?.removeClass(`mmw-zen-list-hidden`);
    if (this.peekTimer !== null) window.clearTimeout(this.peekTimer);
    this.peekTimer = window.setTimeout(() => {
      this.peekTimer = null;
      if (this.active && this.listHidden) this.listTabs()?.addClass(`mmw-zen-list-hidden`);
    }, SHOW_MS);
  }

  // Single button at the top left: it is only shown when the mouse comes near.
  private buildCorner(doc: Document): void {
    const corner = doc.body.createDiv({ cls: `mmw-zen-corner` });
    const button = corner.createEl(`button`, { cls: `mmw-zen-corner-button clickable-icon`, attr: { "aria-label": t(`Afficher ou masquer la liste`) } });
    setIcon(button, `panel-left-close`);
    button.addEventListener(`click`, () => {
      if (this.peekTimer !== null) {
        window.clearTimeout(this.peekTimer);
        this.peekTimer = null;
      }
      this.toggleList();
    });
    this.cornerEl = corner;
    this.cornerButton = button;
  }

  private onMove(e: MouseEvent): void {
    if (!this.cornerEl || e.clientX > CORNER_SIZE || e.clientY > CORNER_SIZE) return;
    this.cornerEl.addClass(`mmw-zen-corner-show`);
    if (this.cornerTimer !== null) window.clearTimeout(this.cornerTimer);
    this.cornerTimer = window.setTimeout(() => {
      this.cornerTimer = null;
      this.cornerEl?.removeClass(`mmw-zen-corner-show`);
    }, SHOW_MS);
  }

  private onKey(e: KeyboardEvent): void {
    const mod = Platform.isMacOS ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === `l`) {
      e.preventDefault();
      e.stopPropagation();
      this.toggleList();
      return;
    }
    // The shortcut that moves between the list and the text keeps its own action: the list only shows for a moment if it is hidden.
    if (mod && e.shiftKey && !e.altKey && e.key === `Enter`) {
      this.peekList();
      return;
    }
    // In full screen, Escape ends the full screen, which ends the mode; without it, Escape ends the mode.
    const doc = this.view?.containerEl.ownerDocument;
    if (e.key === `Escape` && doc && !doc.fullscreenElement) this.exit();
  }
}

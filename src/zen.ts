// Zen mode: the window goes full screen, the list of titles (black and white) takes a quarter of the width on the left and the note
// the rest. Everything else of Obsidian is hidden by a style that depends on the class `mmw-zen` of the page.
// The list can be hidden: a button appears when the mouse goes to the top left corner and disappears after a few seconds, and a
// shortcut shows or hides the list. Escape (or the end of the full screen) leaves the mode.
import { App, Modal, Platform, setIcon } from "obsidian";
import { comboLabel } from "./keys";
import type MindmapWritingPlugin from "./main";
import { t } from "./i18n";
import { MindmapView, VIEW_TYPE_MINDMAP } from "./view";

// Time during which the corner button stays visible, in milliseconds.
const SHOW_MS = 4000;
// Side of the square of the top left corner in which the mouse makes the button appear, in pixels.
const CORNER_SIZE = 64;

// Explanation shown when the mode starts: what it is, how to leave it and the two shortcuts.
class ZenIntroModal extends Modal {
  constructor(app: App, private plugin: MindmapWritingPlugin) {
    super(app);
  }

  onOpen(): void {
    const mod = Platform.isMacOS ? `Cmd` : `Ctrl`;
    this.titleEl.setText(t(`Mode Zen`));
    this.contentEl.createEl(`p`, { text: t(`Le mode Zen affiche la note en plein écran, avec la liste des titres en noir et blanc à gauche. Tout le reste disparaît. Échap permet d'en sortir.`) });
    const keys = this.contentEl.createEl(`ul`);
    keys.createEl(`li`, { text: t(`{0} + Maj + Entrée : passer de la liste au texte, et inversement.`, mod) });
    keys.createEl(`li`, { text: t(`{0} + Maj + L : ouvrir ou fermer la liste.`, mod) });
    this.contentEl.createEl(`p`, { cls: `mmw-zen-hint`, text: t(`Un bouton apparaît en haut à gauche de l'écran quand la souris s'en approche.`) });
    const row = this.contentEl.createEl(`label`, { cls: `mmw-zen-never` });
    const never = row.createEl(`input`, { attr: { type: `checkbox` } });
    row.createSpan({ text: t(`Ne plus afficher cette fenêtre au démarrage du mode Zen`) });
    never.addEventListener(`change`, () => {
      this.plugin.settings.zenIntro = !never.checked;
      void this.plugin.saveSettings(false);
    });
    const ok = this.contentEl.createEl(`button`, { text: t(`Compris`), cls: `mod-cta` });
    ok.addEventListener(`click`, () => this.close());
    ok.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Id of the command that shows or hides the list (the user can give it any shortcut in the settings of Obsidian).
export const ZEN_LIST_COMMAND = `zen-toggle-list`;
// Shortcut handled by the mode itself when the user has not chosen another one.
const DEFAULT_LIST_KEY = `Mod-Shift-L`;

type Hotkey = { modifiers: string[]; key: string };
type HotkeyManager = { getHotkeys?: (id: string) => Hotkey[] | undefined; getDefaultHotkeys?: (id: string) => Hotkey[] | undefined };

// Shortcuts the user gave to the command that shows or hides the list (or its default ones), empty when there is none.
function chosenHotkeys(plugin: MindmapWritingPlugin): Hotkey[] {
  const manager = (plugin.app as unknown as { hotkeyManager?: HotkeyManager }).hotkeyManager;
  const id = `${plugin.manifest.id}:${ZEN_LIST_COMMAND}`;
  return manager?.getHotkeys?.(id) ?? manager?.getDefaultHotkeys?.(id) ?? [];
}

// Shortcut of that command as the user chose it (or the one of the mode), for the label of the button.
function listShortcut(plugin: MindmapWritingPlugin): string {
  const first = chosenHotkeys(plugin)[0];
  const combo = first ? [...first.modifiers, first.key.length === 1 ? first.key.toUpperCase() : first.key].join(`-`) : DEFAULT_LIST_KEY;
  return comboLabel(combo, Platform.isMacOS);
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
    await plugin.updateSettings({ viewMode: `list`, blackWhite: plugin.settings.zenBlackWhite ? true : plugin.settings.blackWhite });
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
    if (noteLeaf) plugin.narrowPane(leaf, noteLeaf, plugin.settings.zenListPercent);

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
    if (plugin.settings.zenFullscreen) {
      try {
        await doc.documentElement.requestFullscreen();
      } catch {
        // The window stays as it is: the mode works all the same.
      }
    }
    if (plugin.settings.zenIntro) new ZenIntroModal(plugin.app, plugin).open();
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
    // The keyboard goes where the user can see: the list when it is shown, the note when it is hidden.
    if (this.listHidden) this.view?.focusNote();
    else this.view?.focusMap();
  }

  // Command of the palette: shows or hides the list when the mode is active.
  toggleListCommand(): void {
    if (this.active) this.toggleList();
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
    this.armPeek();
  }

  // The list that was shown for a moment hides again after a few seconds without any key; the keyboard goes back to the note.
  private armPeek(): void {
    if (this.peekTimer !== null) window.clearTimeout(this.peekTimer);
    this.peekTimer = window.setTimeout(() => {
      this.peekTimer = null;
      if (!this.active || !this.listHidden) return;
      this.listTabs()?.addClass(`mmw-zen-list-hidden`);
      this.view?.focusNote();
    }, this.plugin.settings.zenPeekSeconds * 1000);
  }

  // Single button at the top left: it is only shown when the mouse comes near.
  private buildCorner(doc: Document): void {
    const corner = doc.body.createDiv({ cls: `mmw-zen-corner` });
    const button = corner.createEl(`button`, { cls: `mmw-zen-corner-button clickable-icon`, attr: { tabindex: `-1` } });
    setIcon(button, `panel-left-close`);
    // The button never keeps the keyboard focus: the arrows must keep moving in the list or in the note.
    button.addEventListener(`mousedown`, (e) => e.preventDefault());
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
    this.cornerButton?.setAttribute(`aria-label`, `${t(`Afficher ou masquer la liste`)} (${listShortcut(this.plugin)})`);
    this.cornerEl.addClass(`mmw-zen-corner-show`);
    if (this.cornerTimer !== null) window.clearTimeout(this.cornerTimer);
    this.cornerTimer = window.setTimeout(() => {
      this.cornerTimer = null;
      this.cornerEl?.removeClass(`mmw-zen-corner-show`);
    }, SHOW_MS);
  }

  private onKey(e: KeyboardEvent): void {
    // While the list is only shown for a moment, each key typed (the arrows, for example) keeps it shown a few seconds more.
    if (this.peekTimer !== null) this.armPeek();
    const mod = Platform.isMacOS ? e.metaKey : e.ctrlKey;
    // The shortcut of the mode only works while the user has not chosen another one for the command (Obsidian handles that one).
    if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === `l` && chosenHotkeys(this.plugin).length === 0) {
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

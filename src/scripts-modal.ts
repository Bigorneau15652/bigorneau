// Modules window (Bigorneau button of the panel): list of the built-in modules with an on/off switch, panel buttons and diagnostic.
import { App, Modal, Notice, Scope, setIcon, Setting } from "obsidian";
import { currentLang, t } from "./i18n";
import type MindmapWritingPlugin from "./main";
import { renderButtonList } from "./panel-buttons";
import { pickIcon } from "./panel";
import { ScriptInfo } from "./scripts";

export class ScriptsModal extends Modal {
  constructor(app: App, private plugin: MindmapWritingPlugin) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Modules et boutons`));
    this.draw();
  }

  onClose(): void {
    this.closeHelp();
    this.contentEl.empty();
  }

  // Small window with the description of a module, shown by its question mark: it is closed by the Escape key (which then does not close
  // the whole window) or by a click outside of it.
  private help: { pop: HTMLElement; off: () => void } | null = null;

  private closeHelp(): void {
    this.help?.off();
    this.help?.pop.remove();
    this.help = null;
  }

  private openHelp(button: HTMLElement, text: string): void {
    const same = this.help?.pop.dataset.for === button.dataset.module;
    this.closeHelp();
    if (same) return;
    const pop = document.body.createDiv({ cls: `mmw-scripts-pop` });
    pop.dataset.for = button.dataset.module ?? ``;
    pop.setText(text);
    // Placed under the question mark, kept inside the screen.
    const rect = button.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
    pop.style.top = `${rect.bottom + 6}px`;
    // While the small window is open, the Escape key belongs to it: a scope pushed on the keyboard of Obsidian takes the key before the window
    // of the modules, which then stays open. The listener of the page is a second guard.
    const scope = new Scope(this.app.scope);
    scope.register([], `Escape`, () => {
      this.closeHelp();
      return false;
    });
    this.app.keymap.pushScope(scope);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== `Escape`) return;
      e.preventDefault();
      e.stopPropagation();
      this.closeHelp();
    };
    const onPointer = (e: Event): void => {
      if (e.target instanceof Node && (pop.contains(e.target) || button.contains(e.target))) return;
      this.closeHelp();
    };
    document.addEventListener(`keydown`, onKey, true);
    document.addEventListener(`pointerdown`, onPointer, true);
    this.help = {
      pop,
      off: () => {
        document.removeEventListener(`keydown`, onKey, true);
        document.removeEventListener(`pointerdown`, onPointer, true);
        this.app.keymap.popScope(scope);
      },
    };
  }

  // Draws the whole window again (after a switch or a change of the buttons).
  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(`mmw-scripts`);
    contentEl.createEl(`p`, { cls: `mmw-scripts-intro`, text: t(`Les modules ajoutent des fonctions à Bigorneau : chacun apporte des boutons et des commandes. Désactiver un module le rend inactif tout de suite, mais son code ne se décharge qu'au redémarrage d'Obsidian.`) });
    const list = contentEl.createDiv({ cls: `mmw-scripts-list` });
    for (const info of this.plugin.scripts.info()) this.row(list, info);
    // Panel buttons: visible or not, order, separators (same settings as in the Obsidian settings).
    new Setting(contentEl).setName(t(`Boutons du panneau`)).setHeading();
    renderButtonList(contentEl.createDiv(), this.plugin);
    new Setting(contentEl)
      .setName(t(`Diagnostic`))
      .setDesc(t(`Affiche l'état du plugin, des modules et les temps mesurés, à envoyer avec la description d'un problème.`))
      .addButton((b) =>
        b.setButtonText(t(`Ouvrir le diagnostic`)).onClick(() => {
          this.close();
          this.plugin.openDiagnostic();
        })
      );
  }

  // One module: name, description, status and on/off switch.
  private row(list: HTMLElement, info: ScriptInfo): void {
    const lang = currentLang();
    const row = new Setting(list).setName(`${info.name[lang]} (${info.version})`);
    // The description is behind a question mark next to the name; only a problem (a module that needs another one, an error) is written.
    const help = row.nameEl.createEl(`button`, { cls: `mmw-scripts-help clickable-icon`, attr: { type: `button`, "aria-label": t(`Description du module`) } });
    help.dataset.module = info.id;
    setIcon(help, pickIcon([`circle-help`, `help-circle`, `info`]));
    help.addEventListener(`click`, () => this.openHelp(help, info.description[lang]));
    row.descEl.empty();
    if (info.status !== `ok`) row.descEl.createDiv({ cls: `mmw-scripts-status`, text: this.statusText(info) });
    row.addToggle((x) =>
      x.setValue(info.enabled).onChange(async (on) => {
        await this.plugin.scripts.setEnabled(info.id, on);
        if (!on && info.loaded) new Notice(t(`Le module « {0} » est désactivé. Il sera complètement déchargé au redémarrage d'Obsidian.`, info.name[lang]));
        this.plugin.panel.sync();
        this.draw();
      })
    );
  }

  private statusText(info: ScriptInfo): string {
    switch (info.status) {
      case `blocked`:
        return t(`Nécessite : {0}.`, info.detail ?? ``);
      case `error`:
        return t(`Erreur : {0}`, info.detail ?? ``);
      default:
        return info.enabled ? t(`Activé.`) : t(`Désactivé.`);
    }
  }
}

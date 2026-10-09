// Modules: features that add functions to the plugin (buttons, commands, help texts, services). The modules are built into the
// plugin and can be turned on or off; the plugin never loads code from a file. Each module receives an interface object
// (BigorneauApi) that lets it add a function, add help texts, provide or use a service, show a message and reach the Obsidian
// application. This file does not depend on Obsidian (except for types), so it can be tested with node --test.
import type { App } from "obsidian";
import type { HelpEntry, HelpLang } from "./help";
import type { FunctionContext } from "./panel";

export type Localized = Record<HelpLang, string>;

// A function added by a module: a name (or one name per language), an icon and an action.
export interface ScriptFunction {
  id: string;
  name: string | Localized;
  // Name of an icon of the Lucide series used by Obsidian, or a list of candidate names.
  icon?: string | string[];
  // The function writes into the note: it receives the editor and only acts in editing mode.
  needsEditor?: boolean;
  // False: the function is a command palette entry without a button in the panel.
  button?: boolean;
  // Absent: available everywhere.
  available?: () => boolean;
  // Stateful function: true when it is active for the open note (the button is then more contrasted).
  active?: (ctx: FunctionContext) => boolean;
  run: (ctx: FunctionContext) => void | Promise<void>;
}

export interface ScriptHelpEntry {
  // Content added under the text (see HelpEntry.render).
  render?: (el: HTMLElement, lang: HelpLang) => void;
  renderReplacesText?: boolean;
  id: string;
  title: string | Localized;
  text: string | Localized;
  keywords?: string | Localized;
}

// What a module sees.
export interface BigorneauApi {
  readonly app: App;
  // The Obsidian module (Notice, Modal, Setting...).
  readonly obsidian: unknown;
  language(): HelpLang;
  notice(message: string): void;
  addFunction(fn: ScriptFunction): void;
  addHelp(entries: ScriptHelpEntry[]): void;
  // A module can provide a service that others use (for example the drawing of formulas); the service stops being available as
  // soon as the module is turned off.
  provide(name: string, impl: unknown): void;
  service<T = unknown>(name: string): T | undefined;
}

export interface OfficialScript {
  id: string;
  name: Localized;
  description: Localized;
  version: string;
  // Identifiers of the modules that must be on for this one to work.
  requires: string[];
  defaultEnabled: boolean;
  load(api: BigorneauApi): void | Promise<void>;
}

export type ScriptStatus = `ok` | `blocked` | `error`;

export interface ScriptInfo {
  id: string;
  name: Localized;
  description: Localized;
  version: string;
  enabled: boolean;
  loaded: boolean;
  status: ScriptStatus;
  // Complement of the status: missing modules (blocked) or error message (error).
  detail?: string;
}

// State saved in the settings: modules turned on or off (absent: the default of the module).
export interface ScriptState {
  enabled: Record<string, boolean>;
}

// What the manager asks of the plugin.
export interface ScriptHost {
  app: App;
  obsidian: unknown;
  language(): HelpLang;
  notice(message: string): void;
  registerFunction(fn: { id: string; button?: boolean; name: () => string; icons: string[]; needsEditor: boolean; available: () => boolean; run: (ctx: FunctionContext) => void | Promise<void> }): void;
  addHelp(entries: HelpEntry[]): void;
  // Saves the state in the settings and refreshes the panel.
  saveState(): void;
}

// ---------------------------------------------------------------- manager

export class ScriptManager {
  private loaded = new Set<string>();
  private errors = new Map<string, string>();
  private services = new Map<string, { owner: string; impl: unknown }>();

  constructor(private host: ScriptHost, private state: ScriptState, private official: OfficialScript[]) {}

  // Replaces the state by the one of the saved settings (read after the manager is built, or after a profile is loaded).
  bindState(state: ScriptState): void {
    this.state = state;
  }

  private find(id: string): OfficialScript | undefined {
    return this.official.find((s) => s.id === id);
  }

  // A module is on when the user turned it on, or when it is on by default and the user did not choose.
  isEnabled(id: string): boolean {
    const s = this.find(id);
    return s ? (this.state.enabled[id] ?? s.defaultEnabled) : false;
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  // Service provided by a module, or nothing when that module is off or was not loaded.
  service<T = unknown>(name: string): T | undefined {
    const s = this.services.get(name);
    return s && this.isEnabled(s.owner) ? (s.impl as T) : undefined;
  }

  private missing(s: OfficialScript): string[] {
    return s.requires.filter((r) => !(this.isEnabled(r) && this.loaded.has(r)));
  }

  info(): ScriptInfo[] {
    return this.official.map((s) => {
      const enabled = this.isEnabled(s.id);
      let status: ScriptStatus = `ok`;
      let detail: string | undefined;
      if (this.errors.has(s.id)) {
        status = `error`;
        detail = this.errors.get(s.id);
      } else if (enabled && !this.loaded.has(s.id) && this.missing(s).length > 0) {
        status = `blocked`;
        detail = this.missing(s).map((r) => this.find(r)?.name[this.host.language()] ?? r).join(`, `);
      }
      return { id: s.id, name: s.name, description: s.description, version: s.version, enabled, loaded: this.loaded.has(s.id), status, ...(detail ? { detail } : {}) };
    });
  }

  // Loads the modules that are on. A module whose requirement is off is not loaded; a module that fails is reported without
  // stopping the others.
  async loadEnabled(): Promise<void> {
    // Several passes: a module can depend on another one that comes later in the list.
    for (let pass = 0; pass < this.official.length; pass++) {
      let progress = false;
      for (const s of this.official) {
        if (this.loaded.has(s.id) || !this.isEnabled(s.id) || this.errors.has(s.id)) continue;
        if (this.missing(s).length > 0) continue;
        if (await this.load(s)) progress = true;
      }
      if (!progress) break;
    }
  }

  private async load(s: OfficialScript): Promise<boolean> {
    try {
      await s.load(this.makeApi(s.id));
      this.loaded.add(s.id);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.errors.set(s.id, message);
      this.host.notice(`${s.name[this.host.language()]} : ${message}`);
      return false;
    }
  }

  // Turns a module on or off. When turned on it is loaded right away; when turned off its functions and services disappear at
  // once, but its code is only unloaded when Obsidian restarts.
  async setEnabled(id: string, on: boolean): Promise<void> {
    if (!this.find(id)) return;
    this.state.enabled[id] = on;
    this.errors.delete(id);
    this.host.saveState();
    if (on) await this.loadEnabled();
    this.host.saveState();
  }

  private makeApi(owner: string): BigorneauApi {
    const host = this.host;
    const lang = (): HelpLang => host.language();
    const pick = (v: string | Localized): string => (typeof v === `string` ? v : v[lang()]);
    const localized = (v: string | Localized): Localized => (typeof v === `string` ? { fr: v, en: v } : v);
    return {
      app: host.app,
      obsidian: host.obsidian,
      language: lang,
      notice: (message) => host.notice(message),
      addFunction: (fn) => {
        host.registerFunction({
          id: fn.id,
          name: () => pick(fn.name),
          icons: fn.icon === undefined ? [`file-text`] : Array.isArray(fn.icon) ? fn.icon : [fn.icon],
          needsEditor: fn.needsEditor === true,
          ...(fn.button === false ? { button: false } : {}),
          available: () => this.isEnabled(owner) && (fn.available ? fn.available() : true),
          ...(fn.active ? { active: (ctx: FunctionContext) => fn.active!(ctx) } : {}),
          run: (ctx) => fn.run(ctx),
        });
      },
      addHelp: (entries) =>
        host.addHelp(
          entries.map((e) => ({
            id: `${owner}:${e.id}`,
            title: localized(e.title),
            text: localized(e.text),
            ...(e.keywords !== undefined ? { keywords: localized(e.keywords) } : {}),
            ...(e.render !== undefined ? { render: e.render } : {}),
            ...(e.renderReplacesText === true ? { renderReplacesText: true } : {}),
          }))
        ),
      provide: (name, impl) => {
        this.services.set(name, { owner, impl });
      },
      service: <T>(name: string): T | undefined => this.service<T>(name),
    };
  }
}

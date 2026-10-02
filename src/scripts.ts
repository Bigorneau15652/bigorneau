// Scripts : modules qui ajoutent des fonctions au plugin. Les scripts officiels sont integres au plugin et s'activent ou se
// desactivent ; les scripts personnels ou de tiers sont des fichiers JavaScript ajoutes a la main, confirmes par l'utilisateur au
// premier lancement (et de nouveau s'ils changent). Chaque script recoit un objet d'interface (BigorneauApi) qui lui permet d'ajouter
// une fonction (bouton du panneau et commande), des textes d'aide, de fournir ou d'utiliser un service, d'ecrire un message et
// d'acceder a l'application Obsidian. Ce module ne depend pas d'Obsidian (sauf pour des types) : il se teste avec node --test.
import type { App } from "obsidian";
import type { HelpEntry, HelpLang } from "./help";
import type { FunctionContext } from "./panel";

// Version de l'interface fournie aux scripts. Un script declare celle pour laquelle il est ecrit ; une autre est refusee.
export const API_VERSION = 1;

export type Localized = Record<HelpLang, string>;

// Fonction ajoutee par un script : un nom (ou un nom par langue), une icone, une action.
export interface ScriptFunction {
  id: string;
  name: string | Localized;
  // Nom d'icone de la serie Lucide d'Obsidian, ou liste de noms candidats.
  icon?: string | string[];
  // La fonction ecrit dans la note : elle recoit l'editeur, et n'agit qu'en mode edition.
  needsEditor?: boolean;
  // Faux : la fonction est une commande de la palette sans bouton dans le panneau.
  button?: boolean;
  // Absente : disponible partout.
  available?: () => boolean;
  run: (ctx: FunctionContext) => void | Promise<void>;
}

export interface ScriptHelpEntry {
  // Contenu ajoute sous le texte (voir HelpEntry.render).
  render?: (el: HTMLElement, lang: HelpLang) => void;
  renderReplacesText?: boolean;
  id: string;
  title: string | Localized;
  text: string | Localized;
  keywords?: string | Localized;
}

// Ce que voit un script.
export interface BigorneauApi {
  readonly version: number;
  readonly app: App;
  // Le module d'Obsidian (Notice, Modal, Setting...).
  readonly obsidian: unknown;
  language(): HelpLang;
  notice(message: string): void;
  addFunction(fn: ScriptFunction): void;
  addHelp(entries: ScriptHelpEntry[]): void;
  // Un script peut fournir un service que d'autres utilisent (par exemple le dessin des formules) ; le service n'existe plus des
  // que le script est desactive.
  provide(name: string, impl: unknown): void;
  service<T = unknown>(name: string): T | undefined;
}

export interface ScriptMeta {
  id: string;
  name: Localized;
  description: Localized;
  version: string;
  api: number;
  // Identifiants des scripts qui doivent etre actifs pour que celui-ci le soit.
  requires: string[];
}

export interface OfficialScript extends ScriptMeta {
  origin: `builtin`;
  defaultEnabled: boolean;
  load(api: BigorneauApi): void | Promise<void>;
}

export interface ExternalScript extends ScriptMeta {
  origin: `external`;
  // Nom du fichier dans le dossier des scripts, texte du script et empreinte (SHA-256) de ce texte.
  file: string;
  code: string;
  fingerprint: string;
}

export type ScriptStatus = `ok` | `needs-confirmation` | `modified` | `blocked` | `incompatible` | `error`;

export interface ScriptInfo {
  id: string;
  origin: `builtin` | `external`;
  name: Localized;
  description: Localized;
  version: string;
  enabled: boolean;
  loaded: boolean;
  status: ScriptStatus;
  // Complement du statut : scripts manquants (blocked), message d'erreur (error).
  detail?: string;
  file?: string;
  fingerprint?: string;
}

// Etat enregistre dans les reglages : scripts actives ou non (absent : valeur par defaut du script), et empreinte confirmee de
// chaque script ajoute a la main.
export interface ScriptState {
  enabled: Record<string, boolean>;
  approved: Record<string, string>;
}

// Ce que le gestionnaire demande au plugin.
export interface ScriptHost {
  app: App;
  obsidian: unknown;
  language(): HelpLang;
  notice(message: string): void;
  registerFunction(fn: { id: string; button?: boolean; name: () => string; icons: string[]; needsEditor: boolean; available: () => boolean; run: (ctx: FunctionContext) => void | Promise<void> }): void;
  addHelp(entries: HelpEntry[]): void;
  // Execute le texte d'un script ajoute a la main.
  runExternal(code: string, api: BigorneauApi, id: string): void | Promise<void>;
  // Enregistre l'etat dans les reglages et met a jour le panneau.
  saveState(): void;
}

// ---------------------------------------------------------------- en-tete et empreinte

export type HeaderError = `header` | `name` | `api`;

// En-tete d'un script ajoute a la main : un commentaire /* bigorneau-script ... */ en tete du fichier, avec une ligne « cle: valeur »
// par information (name, name-en, description, description-en, version, api, requires).
export function parseScriptHeader(code: string, file: string): { ok: true; meta: ScriptMeta } | { ok: false; error: HeaderError } {
  const block = /^\s*\/\*\s*bigorneau-script\b([\s\S]*?)\*\//.exec(code);
  if (!block) return { ok: false, error: `header` };
  const fields = new Map<string, string>();
  for (const raw of block[1].split(/\r?\n/)) {
    const m = /^[\s*]*([A-Za-z-]+)\s*:\s*(.*?)\s*$/.exec(raw);
    if (m) fields.set(m[1].toLowerCase(), m[2]);
  }
  const name = fields.get(`name`);
  if (!name) return { ok: false, error: `name` };
  const api = Number(fields.get(`api`));
  if (!Number.isInteger(api) || api < 1) return { ok: false, error: `api` };
  const description = fields.get(`description`) ?? ``;
  return {
    ok: true,
    meta: {
      id: externalId(file),
      name: { fr: name, en: fields.get(`name-en`) || name },
      description: { fr: description, en: fields.get(`description-en`) || description },
      version: fields.get(`version`) || `0.0.0`,
      api,
      requires: (fields.get(`requires`) ?? ``).split(`,`).map((s) => s.trim()).filter((s) => s !== ``),
    },
  };
}

// Identifiant d'un script ajoute a la main, tire du nom de son fichier : ext: suivi du nom sans extension, en minuscules.
export function externalId(file: string): string {
  const base = (file.split(/[\\/]/).pop() ?? file).replace(/\.js$/i, ``);
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, `-`).replace(/^-+|-+$/g, ``);
  return `ext:${slug || `script`}`;
}

// Empreinte SHA-256 du texte d'un script, en hexadecimal.
export async function fingerprint(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(`SHA-256`, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, `0`)).join(``);
}

// Script ajoute a la main construit a partir du nom et du texte d'un fichier : en-tete lu, empreinte calculee.
export async function buildExternal(file: string, code: string): Promise<{ ok: true; script: ExternalScript } | { ok: false; error: HeaderError }> {
  const header = parseScriptHeader(code, file);
  if (!header.ok) return header;
  return { ok: true, script: { ...header.meta, origin: `external`, file, code, fingerprint: await fingerprint(code) } };
}

// Nom de fichier sur : sans dossier, caracteres simples, extension .js.
export function safeFileName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? name).replace(/\.js$/i, ``).replace(/[^A-Za-z0-9._-]+/g, `-`).replace(/^-+|-+$/g, ``);
  return `${base || `script`}.js`;
}

// ---------------------------------------------------------------- gestionnaire

export class ScriptManager {
  private external: ExternalScript[] = [];
  private loaded = new Set<string>();
  private errors = new Map<string, string>();
  private services = new Map<string, { owner: string; impl: unknown }>();

  constructor(private host: ScriptHost, private state: ScriptState, private official: OfficialScript[]) {}

  // Remplace l'etat par celui des reglages enregistres (lu apres la construction du gestionnaire).
  bindState(state: ScriptState): void {
    this.state = state;
  }

  // Scripts ajoutes a la main presents dans le dossier des scripts.
  setExternal(list: ExternalScript[]): void {
    this.external = [...list];
  }

  private find(id: string): OfficialScript | ExternalScript | undefined {
    return this.official.find((s) => s.id === id) ?? this.external.find((s) => s.id === id);
  }

  // Un script ajoute a la main n'est actif que si l'utilisateur l'a active et que le texte du fichier est celui qu'il a confirme.
  isEnabled(id: string): boolean {
    const s = this.find(id);
    if (!s) return false;
    if (s.origin === `builtin`) return this.state.enabled[id] ?? s.defaultEnabled;
    return this.state.enabled[id] === true && this.state.approved[id] === s.fingerprint;
  }

  externalScript(id: string): ExternalScript | undefined {
    return this.external.find((s) => s.id === id);
  }

  isLoaded(id: string): boolean {
    return this.loaded.has(id);
  }

  // Service fourni par un script, ou rien si ce script est desactive ou n'a pas ete charge.
  service<T = unknown>(name: string): T | undefined {
    const s = this.services.get(name);
    return s && this.isEnabled(s.owner) ? (s.impl as T) : undefined;
  }

  private missing(s: OfficialScript | ExternalScript): string[] {
    return s.requires.filter((r) => !(this.isEnabled(r) && this.loaded.has(r)));
  }

  info(): ScriptInfo[] {
    const all: (OfficialScript | ExternalScript)[] = [...this.official, ...this.external];
    return all.map((s) => {
      const enabled = this.isEnabled(s.id);
      let status: ScriptStatus = `ok`;
      let detail: string | undefined;
      if (s.api !== API_VERSION) status = `incompatible`;
      else if (s.origin === `external` && this.state.approved[s.id] === undefined) status = `needs-confirmation`;
      else if (s.origin === `external` && this.state.approved[s.id] !== s.fingerprint) status = `modified`;
      else if (this.errors.has(s.id)) {
        status = `error`;
        detail = this.errors.get(s.id);
      } else if (enabled && !this.loaded.has(s.id) && this.missing(s).length > 0) {
        status = `blocked`;
        detail = this.missing(s).map((r) => this.find(r)?.name[this.host.language()] ?? r).join(`, `);
      }
      return { id: s.id, origin: s.origin, name: s.name, description: s.description, version: s.version, enabled, loaded: this.loaded.has(s.id), status, ...(detail ? { detail } : {}), ...(s.origin === `external` ? { file: s.file, fingerprint: s.fingerprint } : {}) };
    });
  }

  // Charge les scripts actifs : les scripts officiels d'abord, puis ceux ajoutes a la main. Un script dont un prerequis n'est pas
  // actif n'est pas charge ; un script qui echoue est signale sans empecher les autres.
  async loadEnabled(): Promise<void> {
    const order = [...this.official, ...this.external];
    // Plusieurs passes : un script peut dependre d'un autre qui vient plus loin dans la liste.
    for (let pass = 0; pass < order.length; pass++) {
      let progress = false;
      for (const s of order) {
        if (this.loaded.has(s.id) || !this.isEnabled(s.id) || this.errors.has(s.id)) continue;
        if (this.missing(s).length > 0) continue;
        if (await this.load(s)) progress = true;
      }
      if (!progress) break;
    }
  }

  private async load(s: OfficialScript | ExternalScript): Promise<boolean> {
    if (s.api !== API_VERSION) return false;
    try {
      const api = this.makeApi(s.id);
      if (s.origin === `builtin`) await s.load(api);
      else await this.host.runExternal(s.code, api, s.id);
      this.loaded.add(s.id);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.errors.set(s.id, message);
      this.host.notice(`${s.name[this.host.language()]} : ${message}`);
      return false;
    }
  }

  // Active ou desactive un script. Active, il est charge tout de suite ; desactive, ses fonctions et ses services disparaissent
  // aussitot, mais son code ne se decharge qu'au redemarrage d'Obsidian.
  async setEnabled(id: string, on: boolean): Promise<void> {
    const s = this.find(id);
    if (!s) return;
    this.state.enabled[id] = on;
    this.errors.delete(id);
    this.host.saveState();
    if (on) await this.loadEnabled();
    this.host.saveState();
  }

  // Confirmation d'un script ajoute a la main : son empreinte est memorisee, il est active et charge.
  async approve(script: ExternalScript): Promise<void> {
    this.external = [...this.external.filter((s) => s.id !== script.id), script];
    this.state.approved[script.id] = script.fingerprint;
    this.state.enabled[script.id] = true;
    this.errors.delete(script.id);
    await this.loadEnabled();
    this.host.saveState();
  }

  // Retire un script ajoute a la main (le fichier est supprime par l'appelant).
  remove(id: string): void {
    this.external = this.external.filter((s) => s.id !== id);
    delete this.state.enabled[id];
    delete this.state.approved[id];
    this.host.saveState();
  }

  private makeApi(owner: string): BigorneauApi {
    const host = this.host;
    const lang = (): HelpLang => host.language();
    const pick = (v: string | Localized): string => (typeof v === `string` ? v : v[lang()]);
    const localized = (v: string | Localized): Localized => (typeof v === `string` ? { fr: v, en: v } : v);
    return {
      version: API_VERSION,
      app: host.app,
      obsidian: host.obsidian,
      language: lang,
      notice: (message) => host.notice(message),
      addFunction: (fn) => {
        // Les fonctions d'un script ajoute a la main portent le nom du script dans leur identifiant, pour ne jamais entrer en conflit
        // avec celles du plugin ; celles des scripts officiels gardent leur identifiant (les raccourcis restent valables).
        const id = owner.startsWith(`ext:`) ? `${owner.slice(4)}-${fn.id}` : fn.id;
        host.registerFunction({
          id,
          name: () => pick(fn.name),
          icons: fn.icon === undefined ? [`file-text`] : Array.isArray(fn.icon) ? fn.icon : [fn.icon],
          needsEditor: fn.needsEditor === true,
          ...(fn.button === false ? { button: false } : {}),
          available: () => this.isEnabled(owner) && (fn.available ? fn.available() : true),
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

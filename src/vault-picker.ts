// Panneau de choix d'une note du coffre pour un lien : ligne de recherche, puis dossiers et fichiers que l'on parcourt au
// clavier (haut et bas, droite pour entrer dans un dossier, gauche pour remonter), puis titre facultatif de la note.
// N'utilise que le DOM standard, pour pouvoir etre verifie hors d'Obsidian.

import { t } from "./i18n";

export interface HeadingItem {
  title: string;
  level: number;
}

export interface PickerOptions {
  // Chemins de toutes les notes proposees (par exemple « Dossier/Note.md »).
  files: string[];
  // Titres d'une note, lus au moment du choix.
  headings: (path: string) => Promise<HeadingItem[]>;
  // Note choisie, avec le titre choisi (null : la note entiere).
  onPick: (path: string, heading: string | null) => void;
  onClose: () => void;
  // Creation d'une note qui n'existe pas encore : renvoie le chemin de la note creee (null en cas d'echec).
  onCreate?: (name: string) => Promise<string | null>;
  // Dossier ou la note sera creee, indique dans la question posee a l'utilisateur.
  createFolder?: () => string;
}

interface Entry {
  kind: `folder` | `file` | `whole` | `heading` | `create`;
  label: string;
  detail?: string;
  path?: string;
  heading?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = createEl(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const baseOf = (path: string): string => path.replace(/^.*\//, ``).replace(/\.md$/i, ``);

// Nom de fichier valable : sans les caracteres que le coffre ou les liens n'acceptent pas.
export function cleanNoteName(raw: string): string {
  return raw
    .replace(/[\\/:*?"<>|#^[\]]/g, ` `)
    .replace(/\s+/g, ` `)
    .replace(/^[. ]+|[. ]+$/g, ``)
    .slice(0, 120);
}

export class VaultPicker {
  readonly root: HTMLElement;
  private titleEl: HTMLElement;
  private input: HTMLInputElement;
  private listEl: HTMLElement;
  private hintEl: HTMLElement;
  private folder: string[] = [];
  private chosen: string | null = null;
  private headingItems: HeadingItem[] = [];
  private entries: Entry[] = [];
  private index = 0;
  private done = false;
  // Nom de la note a creer, pendant la question Oui ou Non.
  private creating: string | null = null;

  constructor(host: HTMLElement, private opts: PickerOptions) {
    this.root = el(`div`, `mmw-picker`);
    this.root.setAttribute(`role`, `dialog`);
    this.root.setAttribute(`aria-label`, t(`Choisir une note du coffre`));
    this.titleEl = el(`div`, `mmw-picker-title`);
    this.input = el(`input`, `mmw-picker-input`);
    this.input.type = `text`;
    this.input.placeholder = t(`Chercher une note du coffre…`);
    this.input.spellcheck = false;
    this.listEl = el(`div`, `mmw-picker-list`);
    this.hintEl = el(`div`, `mmw-picker-hint`);
    this.root.append(this.titleEl, this.input, this.listEl, this.hintEl);
    this.input.addEventListener(`input`, () => {
      this.index = 0;
      this.render();
    });
    this.root.addEventListener(`keydown`, (e) => this.onKey(e));
    host.appendChild(this.root);
    this.render();
  }

  focus(): void {
    this.input.focus();
  }

  isOpen(): boolean {
    return !this.done;
  }

  close(): void {
    if (this.done) return;
    this.done = true;
    this.root.remove();
  }

  // ---------------------------------------------------------------- contenu

  private query(): string {
    return this.input.value.trim().toLowerCase();
  }

  private compute(): Entry[] {
    const q = this.query();
    if (this.chosen !== null) {
      const out: Entry[] = [{ kind: `whole`, label: t(`Note entière`), path: this.chosen }];
      for (const h of this.headingItems) {
        if (q !== `` && !h.title.toLowerCase().includes(q)) continue;
        out.push({ kind: `heading`, label: `${`  `.repeat(Math.max(0, h.level - 1))}${h.title}`, path: this.chosen, heading: h.title });
      }
      return out;
    }
    if (q !== ``) {
      const words = q.split(/\s+/);
      const found: Entry[] = this.opts.files
        .filter((p) => {
          const low = p.toLowerCase();
          return words.every((w) => low.includes(w));
        })
        .sort((a, b) => baseOf(a).toLowerCase().indexOf(words[0]) - baseOf(b).toLowerCase().indexOf(words[0]) || a.localeCompare(b))
        .slice(0, 60)
        .map((p) => ({ kind: `file` as const, label: baseOf(p), detail: p.includes(`/`) ? p.replace(/\/[^/]*$/, ``) : ``, path: p }));
      // Un nom qui n'existe pas dans le coffre peut devenir une nouvelle note.
      const wanted = cleanNoteName(this.input.value);
      if (this.opts.onCreate && wanted !== `` && !this.opts.files.some((p) => baseOf(p).toLowerCase() === wanted.toLowerCase())) {
        found.push({ kind: `create`, label: t(`Créer la note « {0} »`, wanted), path: wanted });
      }
      return found;
    }
    const prefix = this.folder.length > 0 ? `${this.folder.join(`/`)}/` : ``;
    const folders = new Set<string>();
    const files: string[] = [];
    for (const p of this.opts.files) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const slash = rest.indexOf(`/`);
      if (slash >= 0) folders.add(rest.slice(0, slash));
      else files.push(p);
    }
    return [
      ...[...folders].sort((a, b) => a.localeCompare(b)).map((f) => ({ kind: `folder` as const, label: f, path: prefix + f })),
      ...files.sort((a, b) => baseOf(a).localeCompare(baseOf(b))).map((p) => ({ kind: `file` as const, label: baseOf(p), path: p })),
    ];
  }

  private render(): void {
    if (this.creating !== null) {
      this.renderCreate();
      return;
    }
    this.entries = this.compute();
    this.index = Math.max(0, Math.min(this.index, this.entries.length - 1));
    if (this.chosen !== null) {
      this.titleEl.textContent = t(`{0} : choisir un titre`, baseOf(this.chosen));
      this.input.placeholder = t(`Chercher un titre…`);
      this.hintEl.textContent = t(`Entrée : choisir. Première ligne : note entière. Flèche gauche : retour aux notes. Échap : annuler.`);
    } else {
      this.titleEl.textContent = this.folder.length > 0 ? t(`Coffre`) + ` / ${this.folder.join(` / `)}` : t(`Coffre`);
      this.input.placeholder = t(`Chercher une note du coffre…`);
      this.hintEl.textContent = t(`Haut et bas : choisir. Droite : ouvrir le dossier ou voir les titres. Gauche : remonter. Entrée : ouvrir. Maj + Entrée : note entière. Échap : annuler.`);
    }
    this.listEl.replaceChildren();
    if (this.entries.length === 0) this.listEl.append(el(`div`, `mmw-picker-empty`, t(`Aucune note.`)));
    this.entries.forEach((entry, i) => {
      const row = el(`button`, `mmw-picker-row` + (i === this.index ? ` mmw-picker-on` : ``));
      row.type = `button`;
      row.tabIndex = -1;
      row.append(el(`span`, `mmw-picker-label` + (entry.kind === `folder` ? ` mmw-picker-folder` : ``), entry.label));
      if (entry.detail) row.append(el(`span`, `mmw-picker-detail`, entry.detail));
      if (entry.kind === `folder`) row.append(el(`span`, `mmw-picker-arrow`, `›`));
      row.addEventListener(`click`, () => {
        this.index = i;
        this.activate(false);
      });
      this.listEl.append(row);
    });
    (this.listEl.children[this.index] as HTMLElement | undefined)?.scrollIntoView?.({ block: `nearest` });
  }

  // Question posee avant de creer une note : Oui (Entree) ou Non (Echap).
  private renderCreate(): void {
    const name = this.creating!;
    const folder = this.opts.createFolder?.() ?? ``;
    this.titleEl.textContent = t(`La note « {0} » n'existe pas.`, name);
    this.input.style.display = `none`;
    this.listEl.replaceChildren();
    const where = folder === `` ? t(`à la racine du coffre`) : t(`dans le dossier {0}`, folder);
    this.listEl.append(el(`div`, `mmw-picker-empty`, t(`La créer {0} ?`, where)));
    const bar = el(`div`, `mmw-picker-confirm`);
    const yes = el(`button`, `mmw-dlg-btn mod-cta mmw-picker-yes`, t(`Oui`));
    yes.type = `button`;
    yes.addEventListener(`click`, () => void this.confirmCreate());
    const no = el(`button`, `mmw-dlg-btn mmw-picker-no`, t(`Non`));
    no.type = `button`;
    no.addEventListener(`click`, () => this.cancelCreate());
    bar.append(yes, no);
    this.listEl.append(bar);
    this.hintEl.textContent = t(`Entrée : créer la note. Échap : revenir à la recherche.`);
    this.root.tabIndex = -1;
    this.root.focus();
  }

  private cancelCreate(): void {
    this.creating = null;
    this.input.style.display = ``;
    this.render();
    this.input.focus();
  }

  private async confirmCreate(): Promise<void> {
    const name = this.creating;
    if (name === null || !this.opts.onCreate) return;
    const path = await this.opts.onCreate(name);
    if (this.done) return;
    if (path === null) {
      this.cancelCreate();
      return;
    }
    this.pick(path, null);
  }

  private move(delta: number): void {
    if (this.entries.length === 0) return;
    this.index = Math.max(0, Math.min(this.entries.length - 1, this.index + delta));
    Array.from(this.listEl.children).forEach((row, i) => row.classList.toggle(`mmw-picker-on`, i === this.index));
    (this.listEl.children[this.index] as HTMLElement | undefined)?.scrollIntoView?.({ block: `nearest` });
  }

  private enterFolder(path: string): void {
    this.folder = path.split(`/`);
    this.input.value = ``;
    this.index = 0;
    this.render();
  }

  private goUp(): boolean {
    if (this.chosen !== null) {
      this.chosen = null;
      this.headingItems = [];
      this.input.value = ``;
      this.index = 0;
      this.render();
      return true;
    }
    if (this.query() === `` && this.folder.length > 0) {
      this.folder.pop();
      this.index = 0;
      this.render();
      return true;
    }
    return false;
  }

  private async chooseFile(path: string): Promise<void> {
    let items: HeadingItem[] = [];
    try {
      items = await this.opts.headings(path);
    } catch {
      items = [];
    }
    if (this.done) return;
    this.chosen = path;
    this.headingItems = items;
    this.input.value = ``;
    this.index = 0;
    this.render();
  }

  private pick(path: string, heading: string | null): void {
    if (this.done) return;
    this.close();
    this.opts.onPick(path, heading);
  }

  // Choisit l'entree surlignee : un dossier s'ouvre, une note mene a ses titres (ou a la note entiere avec Maj).
  private activate(whole: boolean): void {
    const entry = this.entries[this.index];
    if (!entry) return;
    if (entry.kind === `folder`) this.enterFolder(entry.path!);
    else if (entry.kind === `file`) {
      if (whole) this.pick(entry.path!, null);
      else void this.chooseFile(entry.path!);
    } else if (entry.kind === `create`) {
      this.creating = entry.path!;
      this.render();
    } else if (entry.kind === `whole`) this.pick(entry.path!, null);
    else this.pick(entry.path!, entry.heading ?? null);
  }

  private onKey(e: KeyboardEvent): void {
    // Les touches du panneau ne doivent pas agir sur la carte.
    e.stopPropagation();
    if (this.creating !== null) {
      if (e.key === `Enter`) {
        e.preventDefault();
        void this.confirmCreate();
      } else if (e.key === `Escape`) {
        e.preventDefault();
        this.cancelCreate();
      } else if (e.key === `Tab`) e.preventDefault();
      return;
    }
    const atStart = this.input.selectionStart === 0 && this.input.selectionEnd === 0;
    const atEnd = this.input.selectionStart === this.input.value.length && this.input.selectionEnd === this.input.value.length;
    if (e.key === `Escape`) {
      e.preventDefault();
      this.close();
      this.opts.onClose();
    } else if (e.key === `ArrowDown`) {
      e.preventDefault();
      this.move(1);
    } else if (e.key === `ArrowUp`) {
      e.preventDefault();
      this.move(-1);
    } else if (e.key === `ArrowRight` && atEnd) {
      const entry = this.entries[this.index];
      if (entry && (entry.kind === `folder` || entry.kind === `file`)) {
        e.preventDefault();
        this.activate(false);
      }
    } else if (e.key === `ArrowLeft` && atStart) {
      if (this.goUp()) e.preventDefault();
    } else if (e.key === `Enter`) {
      e.preventDefault();
      this.activate(e.shiftKey);
    } else if (e.key === `Tab`) {
      // Le focus reste dans la ligne de recherche.
      e.preventDefault();
    }
  }
}

// Petite fenetre de modification d'un titre : titre, titre court (carte seulement), commentaire et etiquettes.
// N'utilise que le DOM standard, pour pouvoir etre verifiee hors d'Obsidian.
import type { TagDef } from "./settings";
import { t } from "./i18n";

export interface DialogValues {
  title: string;
  short: string;
  comment: string;
  tags: string[];
}

export interface DialogOptions {
  values: DialogValues;
  // Etiquettes disponibles (menu de la carte).
  defs: TagDef[];
  // Racine : seul le nom de la note se modifie.
  isRoot: boolean;
  // Position de la case dans le conteneur, en pixels.
  anchor: { left: number; top: number; bottom: number };
  // Ajoute une etiquette a la liste du plugin (couleurs proposees) et la renvoie.
  onCreateTag: (name: string) => TagDef | null;
  onSubmit: (values: DialogValues) => void;
  onCancel: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Fenetre placee pres de la case. Tab passe d'une zone a l'autre ; Entree valide (sauf dans le commentaire, ou Cmd ou
// Ctrl + Entree valide) ; Echap annule ; un clic en dehors valide.
export class NodeDialog {
  readonly root: HTMLElement;
  private done = false;
  private selected: Set<string>;
  private cleanups: (() => void)[] = [];
  private titleInput: HTMLInputElement;
  private shortInput: HTMLInputElement | null = null;
  private commentInput: HTMLTextAreaElement | null = null;
  private filterInput: HTMLInputElement | null = null;
  private chips: { def: TagDef; button: HTMLButtonElement }[] = [];
  private chipList: HTMLElement | null = null;
  private emptyNote: HTMLElement | null = null;
  private confirmBar: HTMLElement | null = null;
  private pendingName = ``;

  constructor(private host: HTMLElement, private opts: DialogOptions) {
    // Copie de la liste : les etiquettes creees ici passent par onCreateTag, pas par cette liste.
    this.opts = { ...opts, defs: [...opts.defs] };
    this.selected = new Set(opts.values.tags);
    this.root = el(`div`, `mmw-dialog`);
    this.root.setAttribute(`role`, `dialog`);
    this.root.setAttribute(`aria-label`, opts.isRoot ? t(`Nom de la note`) : t(`Modifier le titre`));

    this.titleInput = this.field(opts.isRoot ? t(`Nom de la note`) : t(`Titre`), () => {
      const input = el(`input`, `mmw-dlg-input mmw-dlg-title`);
      input.type = `text`;
      input.value = opts.values.title;
      input.spellcheck = false;
      return input;
    });

    if (!opts.isRoot) {
      this.shortInput = this.field(t(`Titre court (affiché sur la carte seulement)`), () => {
        const input = el(`input`, `mmw-dlg-input mmw-dlg-short`);
        input.type = `text`;
        input.value = opts.values.short;
        input.placeholder = t(`Facultatif`);
        return input;
      });
      this.commentInput = this.field(t(`Commentaire`), () => {
        const area = el(`textarea`, `mmw-dlg-input mmw-dlg-comment`);
        area.rows = 3;
        area.value = opts.values.comment;
        area.placeholder = t(`Facultatif`);
        return area;
      });
      this.buildTags();
    }

    const actions = el(`div`, `mmw-dlg-actions`);
    const cancel = el(`button`, `mmw-dlg-btn`, t(`Annuler`));
    cancel.type = `button`;
    cancel.addEventListener(`click`, () => this.close(false));
    const ok = el(`button`, `mmw-dlg-btn mod-cta`, t(`Valider`));
    ok.type = `button`;
    ok.addEventListener(`click`, () => this.close(true));
    actions.append(cancel, ok);
    this.root.append(actions);

    this.root.addEventListener(`keydown`, (e) => this.onKey(e));
    host.appendChild(this.root);
    this.place();

    // Un clic en dehors de la fenetre valide les modifications.
    const doc = host.ownerDocument;
    const outside = (e: Event): void => {
      if (!this.root.contains(e.target as Node)) this.close(true);
    };
    doc.addEventListener(`pointerdown`, outside, true);
    this.cleanups.push(() => doc.removeEventListener(`pointerdown`, outside, true));

    this.titleInput.focus();
    const end = this.titleInput.value.length;
    this.titleInput.setSelectionRange(end, end);
  }

  private field<T extends HTMLElement>(label: string, make: () => T): T {
    const wrap = el(`label`, `mmw-dlg-field`);
    wrap.append(el(`span`, `mmw-dlg-label`, label));
    const control = make();
    wrap.append(control);
    this.root.append(wrap);
    return control;
  }

  private buildTags(): void {
    const wrap = el(`div`, `mmw-dlg-field`);
    wrap.append(el(`span`, `mmw-dlg-label`, t(`Étiquettes`)));
    const box = el(`div`, `mmw-dlg-tagbox`);
    const filter = el(`input`, `mmw-dlg-input mmw-dlg-filter`);
    filter.type = `text`;
    filter.placeholder = t(`Écrire pour chercher ou créer, Entrée pour choisir`);
    filter.addEventListener(`input`, () => {
      this.dismissConfirm(false);
      this.applyFilter();
    });
    this.filterInput = filter;
    const list = el(`div`, `mmw-dlg-chips`);
    this.chipList = list;
    this.emptyNote = el(`p`, `mmw-dlg-empty`, t(`Aucune étiquette n'existe encore. Écrivez un nom ci-dessus pour en créer une.`));
    for (const def of this.opts.defs) this.addChip(def);
    this.confirmBar = el(`div`, `mmw-dlg-confirm`);
    this.confirmBar.hidden = true;
    box.append(filter, this.confirmBar, this.emptyNote, list);
    this.emptyNote.hidden = this.opts.defs.length > 0;
    this.refreshChips();
    wrap.append(box);
    this.root.append(wrap);
  }

  private addChip(def: TagDef): void {
    const button = el(`button`, `mmw-dlg-chip`, def.name === `` ? `(sans nom)` : def.name);
    button.type = `button`;
    button.style.background = def.bg;
    button.style.color = def.fg;
    button.addEventListener(`click`, () => this.toggle(def.id));
    this.chips.push({ def, button });
    this.chipList?.append(button);
  }

  // Le nom saisi n'existe pas : propose de l'ajouter (Oui ou Non) sans quitter la fenetre.
  private askCreate(name: string): void {
    const bar = this.confirmBar;
    if (!bar) return;
    this.pendingName = name;
    bar.replaceChildren();
    bar.append(el(`span`, `mmw-dlg-confirm-text`, t(`Ajouter l'étiquette « {0} » ?`, name)));
    const yes = el(`button`, `mmw-dlg-btn mod-cta mmw-dlg-yes`, t(`Oui`));
    yes.type = `button`;
    yes.addEventListener(`click`, () => this.confirmCreate());
    const no = el(`button`, `mmw-dlg-btn mmw-dlg-no`, t(`Non`));
    no.type = `button`;
    no.addEventListener(`click`, () => this.dismissConfirm(true));
    bar.append(yes, no);
    bar.hidden = false;
    yes.focus();
    this.place();
  }

  private confirmCreate(): void {
    const name = this.pendingName;
    const def = name === `` ? null : this.opts.onCreateTag(name);
    this.dismissConfirm(false);
    if (def) {
      this.opts.defs.push(def);
      this.addChip(def);
      this.selected.add(def.id);
      if (this.emptyNote) this.emptyNote.hidden = true;
      this.refreshChips();
    }
    if (this.filterInput) this.filterInput.value = ``;
    this.applyFilter();
    this.filterInput?.focus();
  }

  private dismissConfirm(refocus: boolean): void {
    if (!this.confirmBar || this.confirmBar.hidden) return;
    this.confirmBar.hidden = true;
    this.confirmBar.replaceChildren();
    this.pendingName = ``;
    if (refocus) this.filterInput?.focus();
    this.place();
  }

  private toggle(id: string): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.refreshChips();
  }

  private refreshChips(): void {
    for (const c of this.chips) {
      const on = this.selected.has(c.def.id);
      c.button.classList.toggle(`mmw-on`, on);
      c.button.setAttribute(`aria-pressed`, String(on));
    }
  }

  private visibleChips(): { def: TagDef; button: HTMLButtonElement }[] {
    return this.chips.filter((c) => !c.button.hidden);
  }

  private applyFilter(): void {
    const q = (this.filterInput?.value ?? ``).trim().toLowerCase();
    for (const c of this.chips) c.button.hidden = q !== `` && !c.def.name.toLowerCase().includes(q);
    this.place();
  }

  private onKey(e: KeyboardEvent): void {
    // Les touches de la fenetre ne doivent pas agir sur la carte.
    e.stopPropagation();
    if (e.key === `Escape`) {
      e.preventDefault();
      // Echap ferme d'abord la question Oui ou Non, puis la fenetre.
      if (this.confirmBar && !this.confirmBar.hidden) this.dismissConfirm(true);
      else this.close(false);
      return;
    }
    if (e.key !== `Enter`) return;
    const mod = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement;
    if (target === this.filterInput && !mod) {
      // Entree dans la recherche : choisit la premiere etiquette correspondante.
      e.preventDefault();
      const text = this.filterInput?.value.trim() ?? ``;
      const exact = this.chips.find((c) => c.def.name.toLowerCase() === text.toLowerCase());
      const first = exact ?? this.visibleChips()[0];
      if (first) {
        this.toggle(first.def.id);
        if (this.filterInput) this.filterInput.value = ``;
        this.applyFilter();
      } else if (text !== ``) this.askCreate(text);
      return;
    }
    if (target.tagName === `TEXTAREA` && !mod) return;
    if (target.tagName === `BUTTON` && !mod) return;
    e.preventDefault();
    this.close(true);
  }

  // Place la fenetre sous la case, ou au-dessus s'il n'y a pas la place, sans depasser du conteneur.
  private place(): void {
    const w = this.root.offsetWidth;
    const h = this.root.offsetHeight;
    const hostW = this.host.clientWidth;
    const hostH = this.host.clientHeight;
    const left = Math.max(8, Math.min(this.opts.anchor.left, hostW - w - 8));
    let top = this.opts.anchor.bottom + 8;
    if (top + h > hostH - 8) top = Math.max(8, this.opts.anchor.top - h - 8);
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
  }

  values(): DialogValues {
    return {
      title: this.titleInput.value,
      short: this.shortInput ? this.shortInput.value : this.opts.values.short,
      comment: this.commentInput ? this.commentInput.value : this.opts.values.comment,
      tags: this.opts.defs.filter((d) => this.selected.has(d.id)).map((d) => d.id).concat([...this.selected].filter((id) => !this.opts.defs.some((d) => d.id === id))),
    };
  }

  close(save: boolean): void {
    if (this.done) return;
    this.done = true;
    const values = this.values();
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.root.remove();
    if (save) this.opts.onSubmit(values);
    else this.opts.onCancel();
  }

  isOpen(): boolean {
    return !this.done;
  }
}

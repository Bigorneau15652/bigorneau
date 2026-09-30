// Commandes de la carte, inspirees d'Excalidraw : en bas a gauche, le menu burger (reglages), la palette
// (apparence de la carte, des niveaux de titre ou d'une case), puis le zoom, l'annulation et la compacite.
// N'utilise que le DOM standard.
import { MmSettings, makeTag, PanePosition, TagDef } from "./settings";
import type { NodeStyle, StylePatch } from "./style";

export interface ControlActions {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  undo: () => void;
  redo: () => void;
  openSettings: () => void;
  // Applique et enregistre des reglages qui ne sont pas des styles de case.
  change: (patch: Partial<MmSettings>) => void;
  // Modifie le style de la selection (par niveau de titre, ou de la case seule si `individual`).
  style: (patch: StylePatch, individual: boolean) => void;
  resetStyle: (individual: boolean) => void;
  // Style montre dans le panneau et libelle de la portee de la modification.
  currentStyle: () => NodeStyle;
  scopeLabel: (individual: boolean) => string;
  // Bouton Lien (relier deux titres) et bouton Retour (revenir a la carte precedente).
  toggleLink: () => void;
  back: () => void;
}

type PopupKind = `menu` | `style` | `tags` | null;

const svg = (inner: string, size = 18, extra = ``): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

const ICONS: Record<string, string> = {
  menu: svg(`<path d="M4 6h16M4 12h16M4 18h16"/>`),
  palette: svg(
    `<path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3c2.2 0 4-1.8 4-4 0-4.4-4.5-7.4-9.3-7.4z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>`
  ),
  minus: svg(`<path d="M5 12h14"/>`),
  plus: svg(`<path d="M5 12h14M12 5v14"/>`),
  undo: svg(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
  redo: svg(`<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>`),
  locate: svg(`<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>`),
  collapse: svg(`<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>`),
  expand: svg(`<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>`),
  settings: svg(
    `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>`
  ),
  compact: svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>`),
  check: svg(`<path d="m5 12 5 5 9-10"/>`, 14),
  tag: svg(`<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="8.5" r="1.2"/>`),
  link: svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  back: svg(`<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>`),
  trash: svg(`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`, 16),
};

// Icones des options du panneau d'apparence.
const OPT = {
  width: (w: number): string => svg(`<path d="M4 12h16" stroke-width="${w * 1.6}"/>`, 20),
  solid: svg(`<path d="M4 12h16"/>`, 20),
  dashed: svg(`<path d="M3 12h4M10 12h4M17 12h4"/>`, 20),
  dotted: svg(`<path d="M4 12h.01M9 12h.01M14 12h.01M19 12h.01" stroke-width="3"/>`, 20),
  rough0: svg(`<path d="M3 13h18"/>`, 20),
  rough1: svg(`<path d="M3 14c4-3 6 3 9 0s6-3 9 0"/>`, 20),
  rough2: svg(`<path d="M3 15c2-9 4 7 6-2s4 7 6-2 4 5 6-1"/>`, 20),
  sharp: svg(`<rect x="5" y="5" width="14" height="14" rx="0" stroke-dasharray="3 3"/>`, 20),
  round: svg(`<rect x="5" y="5" width="14" height="14" rx="5" stroke-dasharray="3 3"/>`, 20),
  elbow: svg(`<path d="M6 4v10a4 4 0 0 0 4 4h8"/>`, 20),
  curve: svg(`<path d="M6 4c0 11 4 14 12 14"/>`, 20),
  straight: svg(`<path d="M6 5 18 17"/>`, 20),
  alignLeft: svg(`<path d="M4 6h16M4 12h10M4 18h14"/>`, 20),
  alignCenter: svg(`<path d="M4 6h16M7 12h10M5 18h14"/>`, 20),
  alignRight: svg(`<path d="M4 6h16M10 12h10M6 18h14"/>`, 20),
};

const STROKE_COLORS = [
  { value: ``, label: `Couleur du thème` },
  { value: `#e03131`, label: `Rouge` },
  { value: `#2f9e44`, label: `Vert` },
  { value: `#1971c2`, label: `Bleu` },
  { value: `#f08c00`, label: `Orange` },
];

const FILL_COLORS = [
  { value: ``, label: `Transparent` },
  { value: `#ffc9c9`, label: `Rose` },
  { value: `#b2f2bb`, label: `Vert clair` },
  { value: `#a5d8ff`, label: `Bleu clair` },
  { value: `#ffec99`, label: `Jaune` },
];

const WIDTHS = [1, 1.8, 2.6, 3.6, 5];
const FONT_SCALES = [
  { value: 0.8, label: `XS` },
  { value: 0.9, label: `S` },
  { value: 1, label: `M` },
  { value: 1.15, label: `L` },
  { value: 1.3, label: `XL` },
];

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Etiquette affichee quand la souris survole l'element, et lue par les lecteurs d'ecran.
function tip(el: HTMLElement, text: string): void {
  el.dataset.tip = text;
  el.setAttribute(`aria-label`, text);
}

function iconButton(icon: string, label: string, onClick: () => void, cls = `mmw-btn`): HTMLButtonElement {
  const b = h(`button`, cls);
  b.type = `button`;
  b.innerHTML = icon;
  tip(b, label);
  b.addEventListener(`click`, onClick);
  return b;
}

const isMac = (): boolean => typeof navigator !== `undefined` && /Mac/.test(navigator.platform);

export class MapControls {
  private root: HTMLElement;
  private popup: HTMLElement;
  private tipEl: HTMLElement;
  private menuBtn: HTMLButtonElement;
  private styleBtn: HTMLButtonElement;
  private linkBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private zoomLabel: HTMLElement;
  private slider: HTMLInputElement;
  private scopeEl: HTMLElement | null = null;
  private open: PopupKind = null;
  // Champ du nom a activer apres l'ajout d'une etiquette.
  private focusTagIndex: number | null = null;
  private tipTimer: number | null = null;
  // Vrai quand Cmd (ou Ctrl) est maintenu : la modification ne concerne que la case selectionnee.
  private mod = false;
  private cleanups: (() => void)[] = [];

  constructor(host: HTMLElement, private getSettings: () => MmSettings, private actions: ControlActions) {
    this.root = h(`div`, `mmw-controls`);
    this.popup = h(`div`, `mmw-popup`);
    this.popup.style.display = `none`;
    this.tipEl = h(`div`, `mmw-tip`);
    this.tipEl.style.display = `none`;

    const dock = h(`div`, `mmw-dock`);
    this.menuBtn = iconButton(ICONS.menu, `Menu et réglages`, () => this.toggle(`menu`));
    this.styleBtn = iconButton(ICONS.palette, `Apparence de la carte`, () => this.toggle(`style`));
    this.linkBtn = iconButton(ICONS.link, `Relier deux titres par un lien`, () => this.actions.toggleLink());
    this.backBtn = iconButton(ICONS.back, `Revenir à la carte précédente`, () => this.actions.back());
    this.backBtn.style.display = `none`;
    dock.append(this.menuBtn, this.styleBtn, this.linkBtn, this.backBtn);

    const zoom = h(`div`, `mmw-dock mmw-zoom`);
    this.zoomLabel = h(`span`, `mmw-zoom-label`, `100 %`);
    this.slider = h(`input`, `mmw-compact-slider`);
    this.slider.type = `range`;
    this.slider.min = `0.2`;
    this.slider.max = `1.6`;
    this.slider.step = `0.05`;
    tip(this.slider, `Compacité de l'affichage`);
    this.slider.addEventListener(`input`, () => this.actions.change({ compactness: Number(this.slider.value) }));
    zoom.append(
      iconButton(ICONS.minus, `Dézoomer`, () => this.actions.zoomOut()),
      this.zoomLabel,
      iconButton(ICONS.plus, `Zoomer`, () => this.actions.zoomIn()),
      iconButton(ICONS.locate, `Recentrer la carte`, () => this.actions.recenter()),
      h(`span`, `mmw-sep`),
      iconButton(ICONS.undo, `Annuler (dans la note)`, () => this.actions.undo()),
      iconButton(ICONS.redo, `Rétablir (dans la note)`, () => this.actions.redo()),
      h(`span`, `mmw-sep`)
    );
    const compactIcon = h(`span`, `mmw-compact-icon`);
    compactIcon.innerHTML = ICONS.compact;
    tip(compactIcon, `Compacité de l'affichage`);
    zoom.append(compactIcon, this.slider);

    this.root.append(this.popup, dock, zoom, this.tipEl);
    host.appendChild(this.root);

    // Etiquettes au survol, avec un court delai.
    this.listen(this.root, `mouseover`, (e) => {
      const el = (e.target as HTMLElement).closest(`[data-tip]`) as HTMLElement | null;
      if (el && this.root.contains(el)) this.scheduleTip(el);
    });
    this.listen(this.root, `mouseout`, (e) => {
      if ((e.target as HTMLElement).closest(`[data-tip]`)) this.hideTip();
    });
    // Cmd (ou Ctrl) maintenu au moment d'un clic : la modification ne concerne que la case selectionnee.
    this.listen(this.root, `pointerdown`, (e) => {
      this.mod = (e as PointerEvent).metaKey || (e as PointerEvent).ctrlKey;
      this.hideTip();
    }, true);

    // Un clic en dehors des commandes, ou Echap, ferme le panneau ouvert.
    const doc = host.ownerDocument;
    const outside = (e: Event) => {
      if (this.open !== null && !this.isOnPanel(e.target)) this.closePopup();
    };
    this.listen(doc, `pointerdown`, outside, true);
    this.listen(doc, `mousedown`, outside, true);
    this.listen(doc.defaultView ?? window, `blur`, () => this.closePopup());
    this.listen(doc, `keydown`, (e) => {
      const k = e as KeyboardEvent;
      this.setModifier(k.metaKey || k.ctrlKey);
      if (k.key === `Escape` && this.open !== null) {
        k.stopPropagation();
        this.closePopup();
      }
    }, true);
    this.listen(doc, `keyup`, (e) => this.setModifier((e as KeyboardEvent).metaKey || (e as KeyboardEvent).ctrlKey), true);

    this.refresh();
  }

  // Le bouton Lien est enfonce tant qu'un lien est en cours de creation.
  setLinking(on: boolean): void {
    this.linkBtn.classList.toggle(`mmw-active`, on);
    this.linkBtn.setAttribute(`aria-pressed`, String(on));
  }

  // Le bouton Retour n'apparait qu'apres l'ouverture de la carte d'une autre note par un lien.
  setBack(visible: boolean): void {
    this.backBtn.style.display = visible ? `` : `none`;
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void, capture = false): void {
    target.addEventListener(type, fn, capture);
    this.cleanups.push(() => target.removeEventListener(type, fn, capture));
  }

  // Vrai si la cible est le panneau ouvert ou une barre de boutons (et non la zone vide du conteneur).
  private isOnPanel(target: EventTarget | null): boolean {
    return target instanceof Element && this.root.contains(target) && target.closest(`.mmw-popup, .mmw-dock`) !== null;
  }

  contains(target: EventTarget | null): boolean {
    return target instanceof Node && this.root.contains(target);
  }

  setZoom(scale: number): void {
    this.zoomLabel.textContent = `${Math.round(scale * 100)} %`;
  }

  closePopup(): void {
    if (this.open === null) return;
    this.open = null;
    this.hideTip();
    this.refresh();
  }

  isOpen(): boolean {
    return this.open !== null;
  }

  // Ouvre le panneau d'apparence (raccourci du menu contextuel d'une case).
  openStyle(): void {
    this.open = `style`;
    this.refresh();
  }

  private toggle(kind: Exclude<PopupKind, null>): void {
    this.open = this.open === kind ? null : kind;
    this.refresh();
  }

  private setModifier(value: boolean): void {
    if (this.mod === value) return;
    this.mod = value;
    this.updateScope();
  }

  private updateScope(): void {
    if (this.scopeEl) this.scopeEl.textContent = this.actions.scopeLabel(this.mod);
  }

  // ---------------------------------------------------------------- etiquettes

  private scheduleTip(el: HTMLElement): void {
    if (this.tipTimer !== null) window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => this.showTip(el), 300);
  }

  private showTip(el: HTMLElement): void {
    this.tipTimer = null;
    if (!el.isConnected || !el.dataset.tip) return;
    const t = this.tipEl;
    t.textContent = el.dataset.tip;
    t.style.display = `block`;
    const r = el.getBoundingClientRect();
    const view = el.ownerDocument.defaultView ?? window;
    const left = Math.min(Math.max(r.left + r.width / 2 - t.offsetWidth / 2, 8), view.innerWidth - t.offsetWidth - 8);
    let top = r.top - t.offsetHeight - 8;
    if (top < 8) top = r.bottom + 8;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
  }

  private hideTip(): void {
    if (this.tipTimer !== null) window.clearTimeout(this.tipTimer);
    this.tipTimer = null;
    this.tipEl.style.display = `none`;
  }

  // Met a jour l'affichage des commandes et du panneau ouvert d'apres les reglages.
  refresh(): void {
    this.slider.value = String(this.getSettings().compactness);
    this.menuBtn.classList.toggle(`mmw-active`, this.open === `menu` || this.open === `tags`);
    this.styleBtn.classList.toggle(`mmw-active`, this.open === `style`);
    this.scopeEl = null;
    if (this.open === null) {
      this.popup.style.display = `none`;
      this.popup.replaceChildren();
      return;
    }
    const scroll = this.popup.scrollTop;
    this.popup.classList.toggle(`mmw-popup-wide`, this.open === `tags`);
    this.popup.replaceChildren(this.open === `menu` ? this.buildMenu() : this.open === `tags` ? this.buildTagsPanel() : this.buildStylePanel());
    this.popup.style.display = ``;
    this.popup.scrollTop = scroll;
    if (this.focusTagIndex !== null) {
      (this.popup.querySelectorAll(`.mmw-tag-name`)[this.focusTagIndex] as HTMLInputElement | undefined)?.focus();
      this.focusTagIndex = null;
    }
  }

  // ---------------------------------------------------------------- etiquettes

  // Liste des etiquettes : nom, couleur de fond et couleur du texte. Les etiquettes se donnent aux titres par la
  // fenetre du double clic.
  private buildTagsPanel(): HTMLElement {
    const a = this.actions;
    const tags = this.getSettings().tags;
    const panel = h(`div`, `mmw-tagpanel`);

    const back = h(`button`, `mmw-menu-item mmw-back`);
    back.type = `button`;
    back.append(h(`span`, `mmw-menu-label`, `Retour au menu`));
    back.addEventListener(`click`, () => {
      this.open = `menu`;
      this.refresh();
    });
    panel.append(back);
    panel.append(h(`div`, `mmw-menu-title`, `Étiquettes de la carte`));
    panel.append(h(`div`, `mmw-scope-hint`, `Une étiquette a un nom, une couleur de fond et une couleur de texte. Elle apparaît en petit à côté du titre, sur la carte seulement. Pour la donner à un titre, faites un double clic sur ce titre.`));

    const save = (next: TagDef[]): void => a.change({ tags: next });
    const patched = (i: number, patch: Partial<TagDef>): TagDef[] => tags.map((t, j) => (j === i ? { ...t, ...patch } : t));

    const list = h(`div`, `mmw-taglist`);
    if (tags.length === 0) list.append(h(`div`, `mmw-menu-help`, `Aucune étiquette pour l'instant.`));
    tags.forEach((t, i) => {
      const row = h(`div`, `mmw-tagrow`);
      const preview = h(`span`, `mmw-tag mmw-tag-preview`, t.name === `` ? `?` : t.name);
      preview.style.background = t.bg;
      preview.style.color = t.fg;

      const name = h(`input`, `mmw-tag-name`);
      name.type = `text`;
      name.value = t.name;
      name.placeholder = `Nom`;
      name.maxLength = 40;
      name.addEventListener(`input`, () => {
        preview.textContent = name.value === `` ? `?` : name.value;
      });
      name.addEventListener(`change`, () => save(patched(i, { name: name.value.trim() })));
      name.addEventListener(`keydown`, (e) => {
        if (e.key === `Enter`) name.blur();
      });

      const color = (value: string, label: string, apply: (v: string) => void, live: (v: string) => void): HTMLInputElement => {
        const input = h(`input`, `mmw-tagcolor`);
        input.type = `color`;
        input.value = /^#[0-9a-fA-F]{6}$/.test(value) ? value : `#ffffff`;
        tip(input, label);
        input.addEventListener(`input`, () => live(input.value));
        input.addEventListener(`change`, () => apply(input.value));
        return input;
      };
      const bg = color(t.bg, `Couleur de fond`, (v) => save(patched(i, { bg: v })), (v) => (preview.style.background = v));
      const fg = color(t.fg, `Couleur du texte`, (v) => save(patched(i, { fg: v })), (v) => (preview.style.color = v));
      const del = iconButton(ICONS.trash, `Supprimer cette étiquette`, () => save(tags.filter((_, j) => j !== i)), `mmw-btn mmw-btn-small`);
      row.append(preview, name, bg, fg, del);
      list.append(row);
    });
    panel.append(list);

    const legend = h(`div`, `mmw-tag-legend`);
    legend.append(h(`span`, ``, `Nom`), h(`span`, ``, `Fond`), h(`span`, ``, `Texte`));
    if (tags.length > 0) panel.insertBefore(legend, list);

    const add = h(`button`, `mmw-option mmw-reset`, `Ajouter une étiquette`);
    add.type = `button`;
    add.addEventListener(`click`, () => {
      this.focusTagIndex = tags.length;
      save([...tags, makeTag(tags, ``)]);
    });
    panel.append(add);
    return panel;
  }

  // ---------------------------------------------------------------- menu

  private buildMenu(): HTMLElement {
    const s = this.getSettings();
    const a = this.actions;
    const menu = h(`div`, `mmw-menu`);

    const item = (icon: string, label: string, fn: () => void): HTMLElement => {
      const b = h(`button`, `mmw-menu-item`);
      b.type = `button`;
      const i = h(`span`, `mmw-menu-icon`);
      i.innerHTML = icon;
      b.append(i, h(`span`, `mmw-menu-label`, label));
      b.addEventListener(`click`, fn);
      return b;
    };
    const toggle = (label: string, value: boolean, fn: (v: boolean) => void): HTMLElement => {
      const b = h(`button`, `mmw-menu-item`);
      b.type = `button`;
      const box = h(`span`, `mmw-check` + (value ? ` mmw-checked` : ``));
      box.innerHTML = value ? ICONS.check : ``;
      b.append(box, h(`span`, `mmw-menu-label`, label));
      b.addEventListener(`click`, () => fn(!value));
      return b;
    };

    menu.append(
      item(ICONS.locate, `Recentrer la carte`, () => a.recenter()),
      item(ICONS.collapse, `Tout replier`, () => a.collapseAll()),
      item(ICONS.expand, `Tout déplier`, () => a.expandAll()),
      h(`div`, `mmw-menu-sep`),
      toggle(`Afficher le préfixe Markdown (#)`, s.showPrefix, (v) => a.change({ showPrefix: v })),
      toggle(`Titres longs : passer à la ligne`, s.longTitles === `wrap`, (v) => a.change({ longTitles: v ? `wrap` : `ellipsis` })),
      toggle(`Griser les chapitres inactifs`, s.contrastEnabled, (v) => a.change({ contrastEnabled: v })),
      toggle(`Inclure les sous-titres dans le chapitre actif`, s.includeSubtitles, (v) => a.change({ includeSubtitles: v })),
      toggle(`Flèches de lien toujours en bleu`, s.linkColored, (v) => a.change({ linkColored: v }))
    );

    const contrast = h(`div`, `mmw-menu-row`);
    contrast.append(h(`div`, `mmw-menu-title`, `Contraste des chapitres inactifs`));
    const range = h(`input`, `mmw-range`);
    range.type = `range`;
    range.min = `15`;
    range.max = `90`;
    range.step = `5`;
    range.value = String(Math.round(s.inactiveOpacity * 100));
    range.addEventListener(`change`, () => a.change({ inactiveOpacity: Number(range.value) / 100 }));
    contrast.append(range);
    menu.append(contrast);

    const positions: { value: PanePosition; label: string }[] = [
      { value: `right`, label: `Droite` },
      { value: `left`, label: `Gauche` },
      { value: `top`, label: `Dessus` },
      { value: `bottom`, label: `Dessous` },
    ];
    const pos = h(`div`, `mmw-menu-row`);
    pos.append(h(`div`, `mmw-menu-title`, `Position de la note`));
    pos.append(this.options(positions.map((p) => ({ value: p.value, text: p.label })), s.panePosition, (v) => a.change({ panePosition: v as PanePosition }), true));
    menu.append(pos);

    menu.append(
      h(`div`, `mmw-menu-sep`),
      item(ICONS.tag, `Étiquettes…`, () => {
        this.open = `tags`;
        this.refresh();
      }),
      item(ICONS.settings, `Tous les paramètres`, () => a.openSettings()),
      h(`div`, `mmw-menu-help`, `Flèches : se déplacer. Entrée : nouveau titre. Tab : sous-titre. F2 ou double clic : modifier le titre, l'étiquette et le commentaire. Cmd ou Ctrl + Maj + Entrée : passer dans la note et revenir. Espace : plier ou déplier. Cmd ou Ctrl + A : tout sélectionner. Maj + clic ou Maj + glisser : sélection multiple. Molette avec Cmd ou Ctrl : zoomer.`)
    );
    return menu;
  }

  // ---------------------------------------------------------------- panneau d'apparence

  private buildStylePanel(): HTMLElement {
    const a = this.actions;
    const st = a.currentStyle();
    const apply = (patch: StylePatch): void => a.style(patch, this.mod);
    const panel = h(`div`, `mmw-style`);

    // Portee de la modification : toute la carte, un niveau de titre ou une case.
    const scope = h(`div`, `mmw-scope`);
    scope.append(h(`span`, `mmw-scope-label`, `Appliqué à : `));
    this.scopeEl = h(`strong`, `mmw-scope-value`, a.scopeLabel(this.mod));
    scope.append(this.scopeEl);
    panel.append(scope);
    if (a.scopeLabel(false) !== `toute la carte`) {
      panel.append(h(`div`, `mmw-scope-hint`, `Maintenez ${isMac() ? `Cmd` : `Ctrl`} en cliquant pour ne modifier que la case sélectionnée.`));
    }

    const section = (title: string, ...content: HTMLElement[]): void => {
      const sec = h(`div`, `mmw-section`);
      sec.append(h(`div`, `mmw-section-title`, title), ...content);
      panel.append(sec);
    };

    section(`Trait`, this.swatches(STROKE_COLORS, st.strokeColor, (v) => apply({ strokeColor: v }), `#1e1e1e`));
    section(`Arrière-plan`, this.swatches(FILL_COLORS, st.fillColor, (v) => apply({ fillColor: v }), `#ffffff`));
    section(
      `Largeur du contour`,
      this.options(
        WIDTHS.map((w) => ({ value: String(w), html: OPT.width(w), title: `Largeur ${w}` })),
        String(st.strokeWidth),
        (v) => apply({ strokeWidth: Number(v) })
      )
    );
    section(
      `Style du trait`,
      this.options(
        [
          { value: `solid`, html: OPT.solid, title: `Continu` },
          { value: `dashed`, html: OPT.dashed, title: `Tirets` },
          { value: `dotted`, html: OPT.dotted, title: `Pointillés` },
        ],
        st.strokeDash,
        (v) => apply({ strokeDash: v as NodeStyle[`strokeDash`] })
      )
    );
    section(
      `Style de tracé`,
      this.options(
        [
          { value: `0`, html: OPT.rough0, title: `Architecte : trait net` },
          { value: `1`, html: OPT.rough1, title: `Artiste : trait de crayon` },
          { value: `2`, html: OPT.rough2, title: `Caricaturiste : trait très irrégulier` },
        ],
        String(st.roughness),
        (v) => apply({ roughness: Number(v) as NodeStyle[`roughness`] })
      )
    );
    section(
      `Angles`,
      this.options(
        [
          { value: `sharp`, html: OPT.sharp, title: `Angles aigus` },
          { value: `round`, html: OPT.round, title: `Angles arrondis` },
        ],
        st.corners,
        (v) => apply({ corners: v as NodeStyle[`corners`] })
      )
    );
    section(
      `Contour des cases`,
      this.options(
        [
          { value: `yes`, text: `Avec contour` },
          { value: `no`, text: `Sans contour` },
        ],
        st.showFrames ? `yes` : `no`,
        (v) => apply({ showFrames: v === `yes` }),
        true
      )
    );
    section(
      `Branches`,
      this.options(
        [
          { value: `elbow`, html: OPT.elbow, title: `En angle` },
          { value: `curve`, html: OPT.curve, title: `Courbes` },
          { value: `straight`, html: OPT.straight, title: `Droites` },
        ],
        this.getSettings().branchStyle,
        (v) => a.change({ branchStyle: v as MmSettings[`branchStyle`] })
      )
    );
    section(
      `Police`,
      this.options(
        [
          { value: `default`, text: `Aa`, title: `Police de l'interface` },
          { value: `handwritten`, text: `Aa`, title: `Écriture manuscrite`, font: `"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive` },
          { value: `mono`, text: `</>`, title: `Code`, font: `var(--font-monospace, monospace)` },
        ],
        st.fontFamily,
        (v) => apply({ fontFamily: v as NodeStyle[`fontFamily`] })
      )
    );
    section(
      `Taille de la police`,
      this.options(
        FONT_SCALES.map((f) => ({ value: String(f.value), text: f.label, title: `Taille ${f.label}` })),
        String(st.fontScale),
        (v) => apply({ fontScale: Number(v) })
      )
    );
    section(
      `Alignement du texte`,
      this.options(
        [
          { value: `left`, html: OPT.alignLeft, title: `À gauche` },
          { value: `center`, html: OPT.alignCenter, title: `Centré` },
          { value: `right`, html: OPT.alignRight, title: `À droite` },
        ],
        st.textAlign,
        (v) => apply({ textAlign: v as NodeStyle[`textAlign`] })
      )
    );

    const hasSelection = a.scopeLabel(false) !== `toute la carte`;
    const reset = h(`button`, `mmw-reset`, hasSelection ? `Rétablir le style de la sélection` : `Réinitialiser l'apparence`);
    reset.type = `button`;
    reset.addEventListener(`click`, () => a.resetStyle(this.mod));
    panel.append(reset);
    return panel;
  }

  // Rangee d'options exclusives.
  private options(
    items: { value: string; html?: string; text?: string; title?: string; font?: string }[],
    current: string,
    onPick: (value: string) => void,
    wide = false
  ): HTMLElement {
    const row = h(`div`, `mmw-options` + (wide ? ` mmw-options-wide` : ``));
    for (const it of items) {
      const b = h(`button`, `mmw-option` + (it.value === current ? ` mmw-selected-option` : ``));
      b.type = `button`;
      if (it.html) b.innerHTML = it.html;
      else b.textContent = it.text ?? ``;
      if (it.font) b.style.fontFamily = it.font;
      if (it.title) tip(b, it.title);
      b.addEventListener(`click`, () => onPick(it.value));
      row.appendChild(b);
    }
    return row;
  }

  // Pastilles de couleur : les couleurs proposees et une couleur libre.
  private swatches(colors: { value: string; label: string }[], current: string, onPick: (value: string) => void, fallback: string): HTMLElement {
    const row = h(`div`, `mmw-swatches`);
    for (const c of colors) {
      const b = h(`button`, `mmw-swatch` + (c.value === current ? ` mmw-selected-swatch` : ``));
      b.type = `button`;
      tip(b, c.label);
      if (c.value === ``) b.classList.add(colors === STROKE_COLORS ? `mmw-swatch-theme` : `mmw-swatch-none`);
      else b.style.background = c.value;
      b.addEventListener(`click`, () => onPick(c.value));
      row.appendChild(b);
    }
    const isCustom = current !== `` && !colors.some((c) => c.value === current);
    const custom = h(`label`, `mmw-swatch mmw-swatch-custom` + (isCustom ? ` mmw-selected-swatch` : ``));
    tip(custom, `Couleur personnalisée`);
    const input = h(`input`);
    input.type = `color`;
    input.value = isCustom ? current : fallback;
    input.addEventListener(`change`, () => onPick(input.value));
    if (isCustom) custom.style.background = current;
    custom.appendChild(input);
    row.append(h(`span`, `mmw-sep-vertical`), custom);
    return row;
  }

  destroy(): void {
    this.hideTip();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.root.remove();
  }
}

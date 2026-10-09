// Commandes de la carte, inspirees d'Excalidraw : en bas a gauche, le menu burger (reglages), la palette
// (apparence de la carte, des niveaux de titre ou d'une case), puis le zoom, l'annulation et la compacite.
// Utilise le DOM standard et l'objet Platform d'Obsidian (detection de macOS).
import { MmSettings, makeTag, PanePosition, TagDef } from "./settings";
import { t } from "./i18n";
import { NodeStyle, ShapeChoice, shapeChoice, shapePatch, StylePatch } from "./style";
import { setSvg } from "./dom";
import { Platform } from "obsidian";

export interface ControlActions {
  zoomIn: () => void;
  zoomOut: () => void;
  recenter: () => void;
  expandAll: () => void;
  collapseAll: () => void;
  undo: () => void;
  redo: () => void;
  openSettings: () => void;
  // Profils : sauvegarde des reglages sous un nom, et chargement d'un profil.
  saveProfile: () => void;
  loadProfile: () => void;
  // Applique et enregistre des reglages qui ne sont pas des styles de case.
  change: (patch: Partial<MmSettings>) => void;
  // Modifie le style de la selection (par niveau de titre, ou de la case seule si `individual`).
  style: (patch: StylePatch, individual: boolean) => void;
  resetStyle: (individual: boolean) => void;
  // Style montre dans le panneau et libelle de la portee de la modification.
  currentStyle: () => NodeStyle;
  scopeLabel: (individual: boolean) => string;
  // Nature de la selection : toute la carte (ou rien), des titres, ou des sujets flottants.
  selectionKind: () => `all` | `nodes` | `floats`;
  // Bouton Lien (relier deux titres) et bouton Retour (revenir a la carte precedente).
  toggleLink: () => void;
  back: () => void;
  // Bascule entre la vue Mindmap et la vue Liste.
  toggleView: () => void;
  // Ouvre une note fixe : copie du chapitre selectionne dans son propre volet.
  addFixed: () => void;
}

type PopupKind = `menu` | `style` | `view` | `tags` | null;

const svg = (inner: string, size = 18, extra = ``): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;

const ICONS: Record<string, string> = {
  menu: svg(`<path d="M4 6h16M4 12h16M4 18h16"/>`),
  pin: svg(`<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>`),
  file: svg(`<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>`),
  help: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>`),
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
  saveProfile: svg(`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>`),
  loadProfile: svg(`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>`),
  compact: svg(`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>`),
  check: svg(`<path d="m5 12 5 5 9-10"/>`, 14),
  tag: svg(`<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4h9l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="8.5" r="1.2"/>`),
  link: svg(`<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>`),
  back: svg(`<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>`),
  list: svg(`<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>`),
  network: svg(`<rect x="3" y="3" width="7" height="5" rx="1"/><rect x="14" y="10" width="7" height="5" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/><path d="M6 8v10a1 1 0 0 0 1 1h7M6 12h8"/>`),
  eye: svg(`<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`),
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
  shapeRect: svg(`<rect x="3" y="6" width="18" height="12" rx="0"/>`, 20),
  shapeRounded: svg(`<rect x="3" y="6" width="18" height="12" rx="4"/>`, 20),
  shapeOval: svg(`<rect x="3" y="6" width="18" height="12" rx="6"/>`, 20),
  shapeUnderline: svg(`<path d="M4 17h16"/><path d="M8 11h8" stroke-width="1" stroke-dasharray="1 2"/>`, 20),
  shapeParallelogram: svg(`<path d="M7 6h14l-4 12H3z"/>`, 20),
  shapeDiamond: svg(`<path d="M12 4l9 8-9 8-9-8z"/>`, 20),
  elbow: svg(`<path d="M6 4v10a4 4 0 0 0 4 4h8"/>`, 20),
  curve: svg(`<path d="M6 4c0 11 4 14 12 14"/>`, 20),
  straight: svg(`<path d="M6 5 18 17"/>`, 20),
  alignLeft: svg(`<path d="M4 6h16M4 12h10M4 18h14"/>`, 20),
  alignCenter: svg(`<path d="M4 6h16M7 12h10M5 18h14"/>`, 20),
  alignRight: svg(`<path d="M4 6h16M10 12h10M6 18h14"/>`, 20),
};

const STROKE_COLORS = [
  { value: ``, label: t(`Couleur du thème`) },
  { value: `#e03131`, label: t(`Rouge`) },
  { value: `#2f9e44`, label: t(`Vert`) },
  { value: `#1971c2`, label: t(`Bleu`) },
  { value: `#f08c00`, label: t(`Orange`) },
];

const FILL_COLORS = [
  { value: ``, label: t(`Transparent`) },
  { value: `#ffc9c9`, label: t(`Rose`) },
  { value: `#b2f2bb`, label: t(`Vert clair`) },
  { value: `#a5d8ff`, label: t(`Bleu clair`) },
  { value: `#ffec99`, label: t(`Jaune`) },
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
function tip(el: HTMLElement, text: string, desc?: string): void {
  el.dataset.tip = text;
  if (desc) el.dataset.tipDesc = desc;
  else delete el.dataset.tipDesc;
  el.setAttribute(`aria-label`, text);
  if (desc) el.setAttribute(`aria-description`, desc);
  else el.removeAttribute(`aria-description`);
}

function iconButton(icon: string, label: string, onClick: () => void, cls = `mmw-btn`, desc?: string): HTMLButtonElement {
  const b = h(`button`, cls);
  b.type = `button`;
  setSvg(b, icon);
  tip(b, label, desc);
  b.addEventListener(`click`, onClick);
  return b;
}

const isMac = (): boolean => Platform.isMacOS;

export class MapControls {
  private root: HTMLElement;
  private popup: HTMLElement;
  private tipEl: HTMLElement;
  private menuBtn: HTMLButtonElement;
  private styleBtn: HTMLButtonElement;
  private viewBtn: HTMLButtonElement;
  private modeBtn: HTMLButtonElement;
  private linkBtn: HTMLButtonElement;
  private backBtn: HTMLButtonElement;
  private zoomLabel: HTMLElement;
  private slider: HTMLInputElement;
  private compactIcon!: HTMLElement;
  private compactSep!: HTMLElement;
  private scopeEl: HTMLElement | null = null;
  private open: PopupKind = null;
  // Champ du nom a activer apres l'ajout d'une etiquette.
  private focusTagIndex: number | null = null;
  private tipTimer: number | null = null;
  // Portee choisie dans le panneau d'apparence (null : automatique, qui depend de la selection).
  private scopeMode: `level` | `single` | null = null;
  private helpRoot!: HTMLElement;
  private helpPanel!: HTMLElement;
  private helpBtn!: HTMLButtonElement;
  private helpOpen = false;
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
    this.menuBtn = iconButton(ICONS.menu, t(`Menu et réglages`), () => this.toggle(`menu`), `mmw-btn`, t(`Position de la note, étiquettes, réglages du plugin.`));
    this.styleBtn = iconButton(ICONS.palette, t(`Apparence de la carte`), () => this.toggle(`style`), `mmw-btn`, t(`Couleurs, traits, angles, branches, police et taille du texte, pour toute la carte, un niveau ou une case.`));
    this.linkBtn = iconButton(ICONS.link, t(`Relier deux titres par un lien`), () => this.actions.toggleLink(), `mmw-btn`, t(`Relie le titre sélectionné à un autre titre ou à une note du coffre. Taper le nom d'une note qui n'existe pas propose de la créer.`));
    this.backBtn = iconButton(ICONS.back, t(`Revenir à la carte précédente`), () => this.actions.back(), `mmw-btn`, t(`Retour à la note dont vous venez d'ouvrir la carte par un lien.`));
    this.backBtn.style.display = `none`;
    this.viewBtn = iconButton(ICONS.eye, t(`Affichage : éléments visibles et vue`), () => this.toggle(`view`), `mmw-btn`, t(`Étiquettes, commentaires, liens, vue noir et blanc, grisage ou masquage des chapitres inactifs de la note.`));
    this.modeBtn = iconButton(ICONS.list, t(`Passer à la vue Liste`), () => this.actions.toggleView(), `mmw-btn`, t(`Bascule entre la carte mentale et la liste condensée.`));
    dock.append(this.menuBtn, this.styleBtn, this.viewBtn, this.linkBtn, this.modeBtn, this.backBtn);

    const zoom = h(`div`, `mmw-dock mmw-zoom`);
    this.zoomLabel = h(`span`, `mmw-zoom-label`, `100 %`);
    this.slider = h(`input`, `mmw-compact-slider`);
    this.slider.type = `range`;
    this.slider.min = `0.2`;
    this.slider.max = `1.6`;
    this.slider.step = `0.05`;
    tip(this.slider, t(`Compacité de l'affichage`), t(`Resserre ou écarte les cases de la carte.`));
    this.slider.addEventListener(`input`, () => this.actions.change({ compactness: Number(this.slider.value) }));
    zoom.append(
      iconButton(ICONS.minus, t(`Dézoomer`), () => this.actions.zoomOut(), `mmw-btn`, t(`Réduit la carte (touche -).`)),
      this.zoomLabel,
      iconButton(ICONS.plus, t(`Zoomer`), () => this.actions.zoomIn(), `mmw-btn`, t(`Agrandit la carte (touche +).`)),
      iconButton(ICONS.locate, t(`Recentrer la carte`), () => this.actions.recenter(), `mmw-btn`, t(`Ajuste le zoom pour voir toute la carte (touche 0).`)),
      h(`span`, `mmw-sep`),
      iconButton(ICONS.undo, t(`Annuler (dans la note)`), () => this.actions.undo(), `mmw-btn`, t(`Annule la dernière modification de la note.`)),
      iconButton(ICONS.redo, t(`Rétablir (dans la note)`), () => this.actions.redo(), `mmw-btn`, t(`Rétablit la modification annulée.`)),
      (this.compactSep = h(`span`, `mmw-sep`))
    );
    const compactIcon = (this.compactIcon = h(`span`, `mmw-compact-icon`));
    setSvg(compactIcon, ICONS.compact);
    tip(compactIcon, t(`Compacité de l'affichage`), t(`Resserre ou écarte les cases de la carte.`));
    zoom.append(compactIcon, this.slider);

    this.root.append(this.popup, dock, zoom, this.tipEl);
    host.appendChild(this.root);

    // Quand la zone est etroite, les boutons qui ne tiennent plus a cote du bouton d'aide disparaissent, en commencant par la fin :
    // le bouton d'aide reste toujours libre.
    const fit = (): void => {
      for (const bar of [dock, zoom]) {
        const kids = Array.from(bar.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
        for (const k of kids) k.removeClass(`mmw-fit-hidden`);
        for (let i = kids.length - 1; i > 0 && bar.scrollWidth > bar.clientWidth + 1; i--) kids[i].addClass(`mmw-fit-hidden`);
      }
    };
    if (typeof ResizeObserver !== `undefined`) {
      const observer = new ResizeObserver(() => fit());
      observer.observe(host);
      this.cleanups.push(() => observer.disconnect());
    }
    fit();

    // Bouton d'aide en bas a droite : raccourcis et conseils de la carte.
    this.helpRoot = h(`div`, `mmw-help`);
    this.helpPanel = this.buildHelp();
    this.helpPanel.style.display = `none`;
    this.helpBtn = iconButton(ICONS.help, t(`Aide de la carte`), () => this.toggleHelp(), `mmw-btn mmw-help-btn`, t(`Raccourcis clavier et conseils de déplacement de la carte.`));
    this.helpRoot.append(this.helpPanel, this.helpBtn);
    host.appendChild(this.helpRoot);
    this.cleanups.push(() => this.helpRoot.remove());
    this.listen(this.helpRoot, `mouseover`, (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(`[data-tip]`);
      if (el && this.helpRoot.contains(el)) this.scheduleTip(el, this.helpRoot);
    });
    this.listen(this.helpRoot, `mouseout`, (e) => {
      if ((e.target as HTMLElement).closest(`[data-tip]`)) this.hideTip();
    });

    // Etiquettes au survol, avec un court delai.
    this.listen(this.root, `mouseover`, (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(`[data-tip]`);
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
      if (this.helpOpen && !(e.target instanceof Node && this.helpRoot.contains(e.target))) this.toggleHelp(false);
    };
    this.listen(doc, `pointerdown`, outside, true);
    this.listen(doc, `mousedown`, outside, true);
    this.listen(doc.defaultView ?? window, `blur`, () => this.closePopup());
    this.listen(doc, `keydown`, (e) => {
      const k = e as KeyboardEvent;
      this.setModifier(k.metaKey || k.ctrlKey);
      if (k.key === `Escape` && this.helpOpen) {
        k.stopPropagation();
        this.toggleHelp(false);
        return;
      }
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
    return target instanceof Node && (this.root.contains(target) || this.helpRoot.contains(target));
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
    this.toggleHelp(false);
    this.open = this.open === kind ? null : kind;
    this.refresh();
  }

  // Vrai si la modification ne concerne que la case selectionnee : Cmd (ou Ctrl) maintenu, ou portee choisie. Par defaut,
  // un sujet flottant se regle seul (un vert, un rouge), un titre ordinaire se regle avec tout son niveau.
  private single(): boolean {
    if (this.mod) return true;
    if (this.scopeMode !== null) return this.scopeMode === `single`;
    return this.actions.selectionKind() === `floats`;
  }

  private setModifier(value: boolean): void {
    if (this.mod === value) return;
    this.mod = value;
    this.updateScope();
  }

  private updateScope(): void {
    if (this.scopeEl) this.scopeEl.textContent = this.actions.scopeLabel(this.single());
  }

  // ---------------------------------------------------------------- etiquettes

  private scheduleTip(el: HTMLElement, owner: HTMLElement = this.root): void {
    if (this.tipTimer !== null) window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => this.showTip(el, owner), 300);
  }

  // Fenetre d'aide : raccourcis et conseils de la carte, en texte condense.
  private buildHelp(): HTMLElement {
    const mod = isMac() ? `Cmd` : `Ctrl`;
    const panel = h(`div`, `mmw-help-panel`);
    panel.setAttribute(`role`, `dialog`);
    panel.setAttribute(`aria-label`, t(`Aide de la carte`));
    panel.append(h(`div`, `mmw-menu-title`, t(`Aide de la carte`)));
    const section = (title: string, rows: [string, string][]): void => {
      panel.append(h(`div`, `mmw-help-title`, title));
      for (const [keys, what] of rows) {
        const row = h(`div`, `mmw-help-row`);
        row.append(h(`span`, `mmw-help-keys`, keys), h(`span`, `mmw-help-what`, what));
        panel.append(row);
      }
    };
    section(t(`Se déplacer`), [
      [t(`Flèches`), t(`Titre voisin, parent ou premier sous-titre`)],
      [t(`Espace`), t(`Replier ou déplier la branche`)],
      [t(`Molette`), t(`Déplacer la carte`)],
      [t(`{0} + molette`, mod), t(`Zoomer`)],
      [`+  -  0`, t(`Zoomer, dézoomer, tout afficher`)],
    ]);
    section(t(`Écrire`), [
      [`Tab`, t(`Nouveau sous-titre`)],
      [t(`Entrée`), t(`Nouveau titre de même niveau`)],
      [`F2`, t(`Modifier le titre (double clic, ou taper une lettre)`)],
      [t(`Suppr`), t(`Supprimer avec confirmation`)],
      [`${mod} + C  X  V  D`, t(`Copier, couper, coller, dupliquer`)],
      [`${mod} + ${t(`Maj`)} + ${t(`Entrée`)}`, t(`Aller de la carte à la note, et inversement`)],
    ]);
    section(t(`Organiser`), [
      [t(`Glisser`), t(`Déplacer un titre avec sa branche`)],
      [t(`{0} + Maj + flèches`, mod), t(`Déplacer au clavier`)],
      [t(`Maj + glisser`), t(`Sélectionner plusieurs titres`)],
      [t(`Clic droit`), t(`Menu du titre`)],
      [t(`Double clic sur le fond`), t(`Nouveau sujet flottant`)],
      [t(`Glisser hors de la carte`), t(`Titre transformé en sujet flottant`)],
    ]);
    section(t(`Liens`), [
      [t(`Bouton lien`), t(`Relier deux titres ou une note du coffre`)],
      [t(`Nom inconnu`), t(`Proposition de créer la note`)],
      [t(`Flèche, puis Suppr`), t(`Retirer un lien`)],
      [t(`Double clic`), t(`Modifier un lien`)],
    ]);
    return panel;
  }

  private toggleHelp(force?: boolean): void {
    this.helpOpen = force ?? !this.helpOpen;
    this.helpPanel.style.display = this.helpOpen ? `block` : `none`;
    this.helpBtn.classList.toggle(`mmw-active`, this.helpOpen);
    this.hideTip();
    if (this.helpOpen) this.closePopup();
  }

  private showTip(el: HTMLElement, owner: HTMLElement = this.root): void {
    this.tipTimer = null;
    if (!el.isConnected || !el.dataset.tip) return;
    const t = this.tipEl;
    if (t.parentElement !== owner) owner.append(t);
    t.replaceChildren(h(`div`, `mmw-tip-name`, el.dataset.tip));
    if (el.dataset.tipDesc) t.append(h(`div`, `mmw-tip-desc`, el.dataset.tipDesc));
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
    // La liste est toujours compacte : la reglette ne concerne que la carte.
    const inList = this.getSettings().viewMode === `list`;
    this.slider.style.display = inList ? `none` : ``;
    this.compactIcon.style.display = inList ? `none` : ``;
    this.compactSep.style.display = inList ? `none` : ``;
    this.menuBtn.classList.toggle(`mmw-active`, this.open === `menu` || this.open === `tags`);
    this.styleBtn.classList.toggle(`mmw-active`, this.open === `style`);
    this.viewBtn.classList.toggle(`mmw-active`, this.open === `view`);
    // Le bouton montre la vue vers laquelle il bascule.
    const toList = this.getSettings().viewMode !== `list`;
    setSvg(this.modeBtn, toList ? ICONS.list : ICONS.network);
    tip(this.modeBtn, toList ? t(`Passer à la vue Liste`) : t(`Passer à la vue Mindmap`), t(`Bascule entre la carte mentale et la liste condensée.`));
    this.scopeEl = null;
    if (this.open === null) {
      this.popup.style.display = `none`;
      this.popup.replaceChildren();
      return;
    }
    const scroll = this.popup.scrollTop;
    this.popup.classList.toggle(`mmw-popup-wide`, this.open === `tags`);
    this.popup.replaceChildren(this.open === `menu` ? this.buildMenu() : this.open === `tags` ? this.buildTagsPanel() : this.open === `view` ? this.buildViewMenu() : this.buildStylePanel());
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
    back.append(h(`span`, `mmw-menu-label`, t(`Retour au menu`)));
    back.addEventListener(`click`, () => {
      this.open = `menu`;
      this.refresh();
    });
    panel.append(back);
    panel.append(h(`div`, `mmw-menu-title`, t(`Étiquettes de la carte`)));
    panel.append(h(`div`, `mmw-scope-hint`, t(`Une étiquette a un nom, une couleur de fond et une couleur de texte. Elle apparaît en petit à côté du titre, sur la carte seulement. Pour la donner à un titre, faites un double clic sur ce titre.`)));

    const save = (next: TagDef[]): void => a.change({ tags: next });
    const patched = (i: number, patch: Partial<TagDef>): TagDef[] => tags.map((t, j) => (j === i ? { ...t, ...patch } : t));

    const list = h(`div`, `mmw-taglist`);
    if (tags.length === 0) list.append(h(`div`, `mmw-menu-help`, t(`Aucune étiquette pour l'instant.`)));
    tags.forEach((tg, i) => {
      const row = h(`div`, `mmw-tagrow`);
      const preview = h(`span`, `mmw-tag mmw-tag-preview`, tg.name === `` ? `?` : tg.name);
      preview.style.background = tg.bg;
      preview.style.color = tg.fg;

      const name = h(`input`, `mmw-tag-name`);
      name.type = `text`;
      name.value = tg.name;
      name.placeholder = t(`Nom`);
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
      const bg = color(tg.bg, t(`Couleur de fond`), (v) => save(patched(i, { bg: v })), (v) => (preview.style.background = v));
      const fg = color(tg.fg, t(`Couleur du texte`), (v) => save(patched(i, { fg: v })), (v) => (preview.style.color = v));
      const del = iconButton(ICONS.trash, t(`Supprimer cette étiquette`), () => save(tags.filter((_, j) => j !== i)), `mmw-btn mmw-btn-small`);
      row.append(preview, name, bg, fg, del);
      list.append(row);
    });
    panel.append(list);

    const legend = h(`div`, `mmw-tag-legend`);
    legend.append(h(`span`, ``, t(`Nom`)), h(`span`, ``, t(`Fond`)), h(`span`, ``, t(`Texte`)));
    if (tags.length > 0) panel.insertBefore(legend, list);

    const add = h(`button`, `mmw-option mmw-reset`, t(`Ajouter une étiquette`));
    add.type = `button`;
    add.addEventListener(`click`, () => {
      this.focusTagIndex = tags.length;
      save([...tags, makeTag(tags, ``)]);
    });
    panel.append(add);
    return panel;
  }

  // ---------------------------------------------------------------- menu

  // Elements de menu communs au menu burger et au menu de l'oeil.
  private menuItem(icon: string, label: string, fn: () => void): HTMLElement {
    const b = h(`button`, `mmw-menu-item`);
    b.type = `button`;
    const i = h(`span`, `mmw-menu-icon`);
    setSvg(i, icon);
    b.append(i, h(`span`, `mmw-menu-label`, label));
    b.addEventListener(`click`, fn);
    return b;
  }

  private menuToggle(label: string, value: boolean, fn: (v: boolean) => void): HTMLElement {
    const b = h(`button`, `mmw-menu-item`);
    b.type = `button`;
    const box = h(`span`, `mmw-check` + (value ? ` mmw-checked` : ``));
    setSvg(box, value ? ICONS.check : ``);
    b.append(box, h(`span`, `mmw-menu-label`, label));
    b.addEventListener(`click`, () => fn(!value));
    return b;
  }

  // Menu burger : deplacements dans la carte, titres et position de la note.
  private buildMenu(): HTMLElement {
    const s = this.getSettings();
    const a = this.actions;
    const menu = h(`div`, `mmw-menu`);
    menu.append(
      ...(s.viewMode === `list` ? [] : [this.menuItem(ICONS.locate, t(`Recentrer la carte`), () => a.recenter())]),
      this.menuItem(ICONS.collapse, t(`Tout replier`), () => a.collapseAll()),
      this.menuItem(ICONS.expand, t(`Tout déplier`), () => a.expandAll()),
      h(`div`, `mmw-menu-sep`),
      this.menuToggle(t(`Afficher le préfixe (#)`), s.showPrefix, (v) => a.change({ showPrefix: v })),
      this.menuToggle(t(`Titres longs à la ligne`), s.longTitles === `wrap`, (v) => a.change({ longTitles: v ? `wrap` : `ellipsis` }))
    );

    const positions: { value: PanePosition; label: string }[] = [
      { value: `right`, label: t(`Droite`) },
      { value: `left`, label: t(`Gauche`) },
      { value: `top`, label: t(`Dessus`) },
      { value: `bottom`, label: t(`Dessous`) },
    ];
    const pos = h(`div`, `mmw-menu-row`);
    pos.append(h(`div`, `mmw-menu-title`, t(`Position de la note`)));
    pos.append(this.options(positions.map((p) => ({ value: p.value, text: p.label })), s.panePosition, (v) => a.change({ panePosition: v as PanePosition }), true));
    menu.append(pos);

    menu.append(
      h(`div`, `mmw-menu-sep`),
      this.menuItem(ICONS.pin, t(`Ajouter une note fixe`), () => {
        this.closePopup();
        a.addFixed();
      }),
      this.menuItem(ICONS.tag, t(`Étiquettes…`), () => {
        this.open = `tags`;
        this.refresh();
      }),
      this.menuItem(ICONS.saveProfile, t(`Sauvegarder un profil`), () => {
        this.closePopup();
        a.saveProfile();
      }),
      this.menuItem(ICONS.loadProfile, t(`Charger un profil`), () => {
        this.closePopup();
        a.loadProfile();
      }),
      this.menuItem(ICONS.settings, t(`Tous les paramètres`), () => a.openSettings())
    );
    return menu;
  }

  // Menu de l'oeil : ce qui est visible sur la carte, la vue en noir et blanc, et l'affichage de la note.
  private buildViewMenu(): HTMLElement {
    const s = this.getSettings();
    const a = this.actions;
    const menu = h(`div`, `mmw-menu`);
    const heading = (text: string): HTMLElement => h(`div`, `mmw-menu-title mmw-menu-heading`, text);

    menu.append(
      heading(t(`Visible sur la carte`)),
      this.menuToggle(t(`Étiquettes`), s.showTags, (v) => a.change({ showTags: v })),
      this.menuToggle(t(`Bulles de commentaire`), s.showComments, (v) => a.change({ showComments: v })),
      this.menuToggle(t(`Liens web (mappemonde)`), s.showWebLinks, (v) => a.change({ showWebLinks: v })),
      this.menuToggle(s.viewMode === `list` ? t(`Repère : autres notes`) : t(`Liens vers d'autres notes`), s.showExternalLinks, (v) => a.change({ showExternalLinks: v })),
      this.menuToggle(s.viewMode === `list` ? t(`Repère : liens dans la note`) : t(`Liens dans la note (flèches)`), s.showInternalLinks, (v) => a.change({ showInternalLinks: v })),
      h(`div`, `mmw-menu-sep`),
      heading(t(`Couleurs`)),
      this.menuToggle(t(`Vue noir et blanc`), s.blackWhite, (v) => a.change({ blackWhite: v })),
      ...(s.viewMode === `list` ? [] : [this.menuToggle(t(`Flèches toujours colorées`), s.linkColored, (v) => a.change({ linkColored: v }))]),
      h(`div`, `mmw-menu-sep`),
      heading(t(`Chapitres inactifs de la note`))
    );
    // Griser et inclure les dependances cote a cote, puis masquer.
    const pair = h(`div`, `mmw-menu-pair`);
    pair.append(
      this.menuToggle(t(`Griser`), s.contrastEnabled, (v) => a.change({ contrastEnabled: v })),
      this.menuToggle(t(`Dépendances`), s.includeSubtitles, (v) => a.change({ includeSubtitles: v }))
    );
    pair.title = t(`Dépendances : le chapitre actif comprend aussi ses sous-titres, qui ne sont alors ni grisés ni masqués.`);
    menu.append(pair, this.menuToggle(t(`Masquer les chapitres inactifs`), s.hideInactive, (v) => a.change({ hideInactive: v })));

    const contrast = h(`div`, `mmw-menu-row`);
    contrast.append(h(`div`, `mmw-menu-title`, t(`Contraste des chapitres grisés`)));
    const range = h(`input`, `mmw-range`);
    range.type = `range`;
    range.min = `15`;
    range.max = `90`;
    range.step = `5`;
    range.value = String(Math.round(s.inactiveOpacity * 100));
    range.addEventListener(`change`, () => a.change({ inactiveOpacity: Number(range.value) / 100 }));
    contrast.append(range);
    menu.append(contrast);
    return menu;
  }

  // ---------------------------------------------------------------- panneau d'apparence

  private buildStylePanel(): HTMLElement {
    const a = this.actions;
    const st = a.currentStyle();
    const kind = a.selectionKind();
    const apply = (patch: StylePatch): void => a.style(patch, this.single());
    const panel = h(`div`, `mmw-style`);

    // Portee de la modification : toute la carte, un niveau de titre ou une case.
    const scope = h(`div`, `mmw-scope`);
    scope.append(h(`span`, `mmw-scope-label`, t(`Appliqué à : `)));
    this.scopeEl = h(`strong`, `mmw-scope-value`, a.scopeLabel(this.single()));
    scope.append(this.scopeEl);
    panel.append(scope);
    if (kind !== `all`) {
      // Choix visible entre tout le niveau et le titre seul (Cmd ou Ctrl maintenu pendant un clic fait de meme).
      const floats = kind === `floats`;
      panel.append(
        this.options(
          [
            { value: `level`, text: floats ? t(`Tous les sujets flottants`) : t(`Tout le niveau`) },
            { value: `single`, text: floats ? t(`Ce sujet seulement`) : t(`Ce titre seulement`) },
          ],
          this.single() ? `single` : `level`,
          (v) => {
            this.scopeMode = v as `level` | `single`;
            this.refresh();
          },
          true
        )
      );
    }

    const section = (title: string, ...content: HTMLElement[]): void => {
      const sec = h(`div`, `mmw-section`);
      sec.append(h(`div`, `mmw-section-title`, title), ...content);
      panel.append(sec);
    };

    if (this.getSettings().viewMode === `list`) {
      // Vue Liste : seuls la couleur du texte, la police et la taille ont un sens, plus les options propres a la liste.
      const s = this.getSettings();
      section(t(`Couleur du texte`), this.swatches(STROKE_COLORS, st.strokeColor, (v) => apply({ strokeColor: v }), `#1e1e1e`));
      section(
        t(`Police`),
        this.options(
          [
            { value: `default`, text: `Aa`, title: t(`Police de l'interface`) },
            { value: `handwritten`, text: `Aa`, title: t(`Écriture manuscrite`), font: `"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive` },
            { value: `mono`, text: `</>`, title: t(`Code`), font: `var(--font-monospace, monospace)` },
          ],
          s.listMapFont ? st.fontFamily : `default`,
          (v) => {
            apply({ fontFamily: v as NodeStyle[`fontFamily`] });
            a.change({ listMapFont: v !== `default` });
          }
        )
      );
      section(
        t(`Taille de la police`),
        this.options(
          FONT_SCALES.map((f) => ({ value: String(f.value), text: f.label, title: t(`Taille {0}`, f.label) })),
          String(st.fontScale),
          (v) => apply({ fontScale: Number(v) })
        )
      );
      section(
        t(`Lignes`),
        this.options(
          [
            { value: `plain`, text: t(`Unies`) },
            { value: `striped`, text: t(`Une sur deux foncée`) },
          ],
          s.listStripes ? `striped` : `plain`,
          (v) => a.change({ listStripes: v === `striped` }),
          true
        )
      );
      const resetList = h(`button`, `mmw-reset`, t(`Réinitialiser l'apparence`));
      resetList.type = `button`;
      resetList.addEventListener(`click`, () => a.resetStyle(this.single()));
      panel.append(h(`div`, `mmw-scope-hint`, t(`Vue Liste : les formes, cadres et fonds se règlent en vue Mindmap.`)));
      panel.append(resetList);
      return panel;
    }

    section(t(`Trait`), this.swatches(STROKE_COLORS, st.strokeColor, (v) => apply({ strokeColor: v }), `#1e1e1e`));
    section(t(`Arrière-plan`), this.swatches(FILL_COLORS, st.fillColor, (v) => apply({ fillColor: v }), `#ffffff`));
    section(
      t(`Largeur du contour`),
      this.options(
        WIDTHS.map((w) => ({ value: String(w), html: OPT.width(w), title: t(`Largeur {0}`, w) })),
        String(st.strokeWidth),
        (v) => apply({ strokeWidth: Number(v) })
      )
    );
    section(
      t(`Style du trait`),
      this.options(
        [
          { value: `solid`, html: OPT.solid, title: t(`Continu`) },
          { value: `dashed`, html: OPT.dashed, title: t(`Tirets`) },
          { value: `dotted`, html: OPT.dotted, title: t(`Pointillés`) },
        ],
        st.strokeDash,
        (v) => apply({ strokeDash: v as NodeStyle[`strokeDash`] })
      )
    );
    section(
      t(`Style de tracé`),
      this.options(
        [
          { value: `0`, html: OPT.rough0, title: t(`Architecte : trait net`) },
          { value: `1`, html: OPT.rough1, title: t(`Artiste : trait de crayon`) },
          { value: `2`, html: OPT.rough2, title: t(`Caricaturiste : trait très irrégulier`) },
        ],
        String(st.roughness),
        (v) => apply({ roughness: Number(v) as NodeStyle[`roughness`] })
      )
    );
    section(
      t(`Forme`),
      this.options(
        [
          { value: `rect`, html: OPT.shapeRect, title: t(`Rectangle`) },
          { value: `rounded`, html: OPT.shapeRounded, title: t(`Rectangle arrondi`) },
          { value: `oval`, html: OPT.shapeOval, title: t(`Ovale`) },
          { value: `underline`, html: OPT.shapeUnderline, title: t(`Trait dessous`) },
          { value: `parallelogram`, html: OPT.shapeParallelogram, title: t(`Parallélogramme`) },
          { value: `diamond`, html: OPT.shapeDiamond, title: t(`Diamant`) },
        ],
        shapeChoice(st),
        (v) => apply(shapePatch(v as ShapeChoice))
      )
    );
    section(
      t(`Contour des cases`),
      this.options(
        [
          { value: `yes`, text: t(`Avec contour`) },
          { value: `no`, text: t(`Sans contour`) },
        ],
        st.showFrames ? `yes` : `no`,
        (v) => apply({ showFrames: v === `yes` }),
        true
      )
    );
    section(
      t(`Branches`),
      this.options(
        [
          { value: `elbow`, html: OPT.elbow, title: t(`En angle`) },
          { value: `curve`, html: OPT.curve, title: t(`Courbes`) },
          { value: `straight`, html: OPT.straight, title: t(`Droites`) },
        ],
        this.getSettings().branchStyle,
        (v) => a.change({ branchStyle: v as MmSettings[`branchStyle`] })
      )
    );
    section(
      t(`Police`),
      this.options(
        [
          { value: `default`, text: `Aa`, title: t(`Police de l'interface`) },
          { value: `handwritten`, text: `Aa`, title: t(`Écriture manuscrite`), font: `"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive` },
          { value: `mono`, text: `</>`, title: t(`Code`), font: `var(--font-monospace, monospace)` },
        ],
        st.fontFamily,
        (v) => apply({ fontFamily: v as NodeStyle[`fontFamily`] })
      )
    );
    section(
      t(`Taille de la police`),
      this.options(
        FONT_SCALES.map((f) => ({ value: String(f.value), text: f.label, title: t(`Taille {0}`, f.label) })),
        String(st.fontScale),
        (v) => apply({ fontScale: Number(v) })
      )
    );
    section(
      t(`Alignement du texte`),
      this.options(
        [
          { value: `left`, html: OPT.alignLeft, title: t(`À gauche`) },
          { value: `center`, html: OPT.alignCenter, title: t(`Centré`) },
          { value: `right`, html: OPT.alignRight, title: t(`À droite`) },
        ],
        st.textAlign,
        (v) => apply({ textAlign: v as NodeStyle[`textAlign`] })
      )
    );

    const hasSelection = kind !== `all`;
    const reset = h(`button`, `mmw-reset`, hasSelection ? t(`Rétablir le style de la sélection`) : t(`Réinitialiser l'apparence`));
    reset.type = `button`;
    reset.addEventListener(`click`, () => a.resetStyle(this.single()));
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
      if (it.html) setSvg(b, it.html);
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
    tip(custom, t(`Couleur personnalisée`));
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

// Affichage de la carte : cases, branches, zoom, deplacement, pliage et selection.
// N'utilise que le DOM standard, pour pouvoir etre verifie hors d'Obsidian.
import { computeStats, flattenDoc, isFloatKey, isFloatRoot, MmDoc, MmNode, nodeByKey, pathTitles } from "./model";
import { t } from "./i18n";
import { dropToParentIndex, MoveDir, MoveTarget, previewMove } from "./edit";
import { buildLayoutTree, Bounds, childIndent, computeLayout, computeListLayout, flatten, listIndent, LNode, sequential, trunkX } from "./layout";
import { framePath, hasTrunk, polygonFrame, trunkBranch, trunkLine, trunkRadius, underlinePath } from "./sketch";
import { MapControls } from "./controls";
import { DialogValues, NodeDialog } from "./node-dialog";
import { iconSvg } from "./icons";
import { makeTag, MmSettings, ViewMode } from "./settings";
import { linkPath, loopPath, sidePath } from "./link-geom";
import { MapLink, parseLinks, WebLink, webLinks } from "./links";
import { HeadingItem, VaultPicker } from "./vault-picker";
import { WebDialog, WebDialogOptions } from "./web-dialog";
import { describeScope, globalStyle, NodeStyle, resolveStyle, shapeChoice, ShapeChoice, shapePatch, StylePatch } from "./style";
import { record } from "./diagnostics";
import { setSvg } from "./dom";

// Modification de la structure demandee depuis la carte ; la vue l'applique dans la note.
export interface MapEdit {
  kind: `child` | `sibling` | `rename` | `delete` | `move` | `copy` | `cut` | `paste` | `pasteAfter` | `duplicate` | `createFloat` | `float`;
  key: string;
  keys: string[];
  title?: string;
  // Deplacement : nouveau parent et rang (glisser), ou direction (fleches).
  parentKey?: string;
  index?: number;
  dir?: MoveDir;
  // Sujets flottants : position sur la carte (absente dans la vue Liste).
  x?: number;
  y?: number;
}

export interface MapCallbacks {
  // Applique et enregistre des reglages qui ne sont pas des styles de case.
  onChange: (patch: Partial<MmSettings>) => void;
  // Modifie le style de la selection : par niveau de titre, ou de la case seule si `individual`.
  onStyle: (patch: StylePatch, individual: boolean) => void;
  onResetStyle: (individual: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSettings: () => void;
  onSaveProfile: () => void;
  onLoadProfile: () => void;
  // Appele quand l'utilisateur change de noeud principal selectionne (null : plus aucun noeud).
  onSelect?: (key: string | null) => void;
  // Appele a chaque changement de la selection (une ou plusieurs cases).
  onSelectionChange?: (keys: string[]) => void;
  // Appele quand l'utilisateur appuie sur Entree avec un noeud selectionne.
  onEnter?: () => void;
  onEdit?: (edit: MapEdit) => void;
  onMessage?: (text: string) => void;
  // Clic droit sur une case (la case fait partie de la selection).
  onContextMenu?: (key: string, event: MouseEvent) => void;
  // Validation de la fenetre de modification d'un titre (titre, titre court, commentaire, etiquettes).
  onDetails?: (key: string, values: DialogValues) => void;
  // Clic sur l'oeil d'un titre : masquer ou afficher ce titre (et ses sous-titres) dans la note.
  onToggleHidden?: (key: string) => void;
  // Nom du fichier de la carte (pour reconnaitre les liens vers la note elle-meme).
  getFileName?: () => string;
  // Un lien vient d'etre trace d'un titre a un autre de la carte ; ou vers un titre d'une autre note (a choisir).
  // `replace` : lien existant que le nouveau remplace (modification d'un lien).
  onLinkCreate?: (from: string, to: string, replace?: MapLink) => void;
  onLinkExternal?: (from: string, path: string, heading: string | null, replace?: MapLink) => void;
  // Un lien change de place parmi ceux de son titre : il prend la place de celui de la ligne `toLine`.
  onLinkMove?: (link: MapLink, toLine: number) => void;
  // Notes du coffre proposees pour un lien (chemins) et titres d'une note.
  // Cree une note fixe avec le titre selectionne.
  onAddFixed?: () => void;
  getVaultFiles?: () => string[];
  getHeadings?: (path: string) => Promise<HeadingItem[]>;
  // Creation d'une note qui n'existe pas encore (renvoie son chemin) et dossier prevu pour elle.
  createNote?: (name: string) => Promise<string | null>;
  getNewNoteFolder?: () => string;
  // Clic sur la mappemonde d'un titre qui contient des liens web ou des videos integrees.
  onWebOpen?: (links: WebLink[], event: PointerEvent) => void;
  // Suppression d'un lien selectionne, et clic sur le repere d'un titre qui a des liens vers d'autres notes.
  onLinkDelete?: (link: MapLink) => void;
  onLinkOpen?: (links: MapLink[], event: PointerEvent) => void;
  // Clic sur le repere d'un titre dont les fleches internes sont repliees : aller au titre vise (liste s'il y en a plusieurs).
  onInternalLinks?: (links: MapLink[], event: PointerEvent) => void;
  // Le bouton Retour de la carte.
  onBack?: () => void;
}

// Repere affiche a cote d'un titre qui a un commentaire.
const COMMENT_ICON = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 3h11v7.5h-6L4.5 13.5v-3h-2z"/></svg>`;

// Oeil affiche au survol d'un titre (masquer dans la note) et oeil barre sur un titre masque.
const EYE_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8s-2.3 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/></svg>`;
const EYE_OFF_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8s-2.3 4.5-6.5 4.5S1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/></svg>`;

// Symbole d'ouverture d'un lien vers une autre note (fleche qui sort d'un cadre).
const OPEN_ICON = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5"/></svg>`;


// Triangle de repli de la vue Liste.
const FOLD_ICON = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>`;


const SVG_NS = `http://www.w3.org/2000/svg`;
// Vue Liste : marge interieure du cadre a gauche (le cadre n'a pas de marge en haut : le titre y reste colle), largeurs minimale et
// maximale d'une ligne (un titre plus long est coupe par des points de suspension), et place reservee a la glissiere.
// Distance (en pixels) a partir de laquelle un appui suivi d'un mouvement devient un glisser : en dessous, c'est un simple clic.
const NODE_DRAG_THRESHOLD = 10;
const LIST_PAD_X = 8;
const LIST_MIN_WIDTH = 260;
const LIST_MAX_WIDTH = 480;
const LIST_GUTTER = 16;
// Nombre de lignes vides gardees sous le dernier sujet flottant de la liste.
const LIST_FLOAT_ROWS = 3;
// Ecart entre deux lignes de la liste.
const LIST_ROW_GAP = 1;

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

// Taille du texte selon le niveau : racine, premier niveau, autres niveaux.
const BASE_EM = [1.5, 1.15, 1];

export const FONT_CSS: Record<string, string> = {
  default: `inherit`,
  handwritten: `"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`,
  mono: `var(--font-monospace, monospace)`,
};

// Espace autour du texte d'une case : plus la carte est compacte, plus il diminue,
// et davantage encore quand la case n'a pas de contour.
// Espace autour des lignes de la vue Liste : fixe, la liste est toujours compacte.
const LIST_PAD = 0.6;

export function padFactor(compactness: number, frames: boolean): number {
  return Math.min(1, Math.max(frames ? 0.55 : 0.08, compactness));
}

function dashValue(d: NodeStyle[`strokeDash`]): string {
  return d === `dashed` ? `9 6` : d === `dotted` ? `0.1 6` : `none`;
}

function strokeCss(st: NodeStyle, widthFactor = 1): string {
  return `stroke:${st.strokeColor || `var(--text-normal)`};stroke-width:${st.strokeWidth * widthFactor}px;stroke-dasharray:${dashValue(st.strokeDash)};`;
}

export class MapRenderer {
  private mapEl: HTMLElement;
  private worldEl: HTMLElement;
  // Cadre qui contient le monde : transparent et de la taille de la carte en vue Carte ; en vue Liste, cadre defilant qui epouse la liste.
  private frameEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private messageEl: HTMLElement;
  private statusEl: HTMLElement;
  private marqueeEl: HTMLElement;
  private controls: MapControls;

  private doc: MmDoc | null = null;
  private identical = true;
  private fileKey = ``;
  private collapsed = new Set<string>();
  // Noeud principal selectionne (celui que la note suit) et ensemble des noeuds selectionnes.
  private selected: string | null = null;
  private selectedKeys = new Set<string>();
  private root: LNode | null = null;
  private floatRoots: LNode[] = [];
  // Cadre de la carte principale (sans les sujets flottants) et, en vue Liste, ordonnee du trait qui ouvre la zone flottante.
  private mainBounds: Bounds | null = null;
  private floatZoneY = 0;
  private lastBg: { time: number; x: number; y: number } | null = null;
  private list: LNode[] = [];
  private els = new Map<string, HTMLElement>();
  private bounds: Bounds | null = null;

  private tx = 0;
  private ty = 0;
  private scale = 1;
  private fitPending = true;
  private needsRebuild = false;
  private drag: { sx: number; sy: number; tx0: number; ty0: number; moved: boolean } | null = null;
  private marquee: { sx: number; sy: number; moved: boolean } | null = null;
  private cleanups: (() => void)[] = [];
  // Saisie en cours du titre d'une case.
  private renaming: { key: string; input: HTMLInputElement; original: string; stop: () => void } | null = null;
  private suspendBlur = false;
  // Fenetre de modification du titre (titre court, commentaire, etiquettes), ouverte par double clic ou F2.
  private dialog: NodeDialog | null = null;
  private eyes = new Map<string, HTMLElement>();
  private links: MapLink[] = [];
  private selectedLink: string | null = null;
  // Creation d'un lien : titre de depart (null tant qu'il n'est pas choisi) et position de la souris.
  private linking: { from: string | null; pressed: boolean; pending: { path: string; heading: string | null } | null; replace: MapLink | null } | null = null;
  // Lien a garder selectionne apres un deplacement (sa ligne change).
  private pendingLink: string | null = null;
  private linkDrag: { link: MapLink; box: { link: MapLink; el: HTMLElement; x: number; y: number; w: number; h: number }; sy: number; started: boolean; dy: number } | null = null;
  private webDialog: WebDialog | null = null;
  private picker: VaultPicker | null = null;
  // Vue Liste : largeur d'une ligne, derniere vue affichee (pour recadrer au changement), trait de depot d'un glisser.
  private listWidth = 0;
  private lastView: ViewMode | null = null;
  private dropLineEl: HTMLElement | null = null;
  private dropLine: { x: number; y: number } | null = null;
  private webByKey = new Map<string, WebLink[]>();
  private linksFrom = new Map<string, MapLink[]>();
  private extBoxes: { link: MapLink; el: HTMLElement; x: number; y: number; w: number; h: number }[] = [];
  private linkHint: HTMLElement | null = null;
  private eyeHover: string | null = null;
  // Detection du double clic : la carte peut etre redessinee entre les deux clics (ouverture de la note),
  // l'evenement dblclick du navigateur n'est alors plus fiable.
  private lastDown: { key: string; time: number } | null = null;
  private dblKey: string | null = null;
  // Glisser d'une case : apercu en direct de la carte apres le deplacement.
  private nodeDrag: {
    key: string;
    pointerId: number;
    sx: number;
    sy: number;
    started: boolean;
    grabX: number;
    grabY: number;
    ghost: HTMLElement | null;
    keyOf: Map<MmNode, string>;
    targetId: string;
    target: MoveTarget | null;
    // Depot libre (hors de la structure) : le titre devient un sujet flottant, ou le sujet flottant change de place.
    free: { x: number; y: number } | null;
  } | null = null;
  private previewDoc: MmDoc | null = null;
  private previewCollapsed: Set<string> | null = null;
  private previewOrigin: Map<MmNode, MmNode> | null = null;
  private previewDragKey: string | null = null;
  private settleTimer: number | null = null;

  constructor(container: HTMLElement, private getSettings: () => MmSettings, private callbacks: MapCallbacks) {
    this.mapEl = container;
    this.mapEl.classList.add(`mmw-map`);
    this.mapEl.tabIndex = 0;

    this.frameEl = document.createElement(`div`);
    this.frameEl.className = `mmw-frame`;
    this.worldEl = document.createElement(`div`);
    this.worldEl.className = `mmw-world`;
    this.frameEl.appendChild(this.worldEl);
    this.svgEl = document.createElementNS(SVG_NS, `svg`);
    this.svgEl.setAttribute(`class`, `mmw-svg`);
    this.messageEl = document.createElement(`div`);
    this.messageEl.className = `mmw-message`;
    this.marqueeEl = document.createElement(`div`);
    this.marqueeEl.className = `mmw-marquee`;
    this.marqueeEl.style.display = `none`;
    this.mapEl.append(this.frameEl, this.messageEl, this.marqueeEl);

    this.controls = new MapControls(this.mapEl, this.getSettings, {
      zoomIn: () => this.zoomBy(1.2),
      zoomOut: () => this.zoomBy(1 / 1.2),
      recenter: () => this.fit(),
      expandAll: () => this.expandAll(),
      collapseAll: () => this.collapseAll(),
      undo: () => this.callbacks.onUndo(),
      redo: () => this.callbacks.onRedo(),
      openSettings: () => this.callbacks.onOpenSettings(),
      saveProfile: () => this.callbacks.onSaveProfile(),
      loadProfile: () => this.callbacks.onLoadProfile(),
      change: (patch) => this.callbacks.onChange(patch),
      style: (patch, individual) => this.callbacks.onStyle(patch, individual),
      resetStyle: (individual) => this.callbacks.onResetStyle(individual),
      currentStyle: () => this.currentStyle(),
      scopeLabel: (individual) => this.scopeLabel(individual),
      selectionKind: () => this.selectionKind(),
      toggleLink: () => (this.linking ? this.stopLinking() : this.startLinking()),
      back: () => this.callbacks.onBack?.(),
      toggleView: () => this.callbacks.onChange({ viewMode: this.isList() ? `map` : `list` }),
      addFixed: () => this.callbacks.onAddFixed?.(),
    });

    this.statusEl = document.createElement(`div`);
    this.statusEl.className = `mmw-status`;
    this.mapEl.appendChild(this.statusEl);

    this.on(this.frameEl, `scroll`, () => this.onListScroll());
    this.on(this.mapEl, `pointerdown`, (e) => this.onPointerDown(e as PointerEvent));
    this.on(this.mapEl, `pointermove`, (e) => this.onPointerMove(e as PointerEvent));
    this.on(this.mapEl, `pointerup`, (e) => this.onPointerUp(e as PointerEvent));
    // Quand le systeme annule le geste ou reprend la capture de la souris, aucun relachement n'arrive : sans cela, le fantome du
    // glisser resterait affiche et le suivant s'ajouterait au premier.
    this.on(this.mapEl, `pointercancel`, () => this.abandonDrag());
    this.on(this.mapEl, `lostpointercapture`, () => this.abandonDrag());
    this.on(this.mapEl, `wheel`, (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(this.mapEl, `keydown`, (e) => this.onKey(e as KeyboardEvent));
    this.on(this.mapEl, `contextmenu`, (e) => {
      const node = (e.target as HTMLElement).closest<HTMLElement>(`.mmw-node`);
      if (!node || (e.target as HTMLElement).closest(`.mmw-rename`)) return;
      e.preventDefault();
      const key = node.dataset.key!;
      if (!this.selectedKeys.has(key)) this.select(key);
      this.callbacks.onContextMenu?.(key, e as MouseEvent);
    });
    // L'oeil de masquage n'apparait qu'au survol du titre.
    this.on(this.mapEl, `mouseover`, (e) => {
      const t = e.target as HTMLElement;
      const key = t.closest<HTMLElement>(`.mmw-node`)?.dataset.key ?? t.closest<HTMLElement>(`.mmw-eye`)?.dataset.eye ?? null;
      this.setEyeHover(key);
    });
    this.on(this.mapEl, `mouseleave`, () => this.setEyeHover(null));
    this.on(this.mapEl, `dblclick`, (e) => {
      const t = e.target as HTMLElement;
      if (this.linking) return;
      // Double clic sur un lien (case d'une note ou fleche) : modification du lien.
      const linkEl = t.closest<HTMLElement>(`.mmw-ext-box`)?.dataset.ext ?? t.closest(`[data-link]`)?.getAttribute(`data-link`);
      if (linkEl) {
        if (t.closest(`.mmw-ext-open`)) return;
        const link = this.links.find((l) => this.linkId(l) === linkEl);
        if (link) this.editLink(link);
        return;
      }
      const node = t.closest<HTMLElement>(`.mmw-node`);
      if (node) this.openDialog(node.dataset.key!);
    });

    const ro = new ResizeObserver(() => {
      if (this.mapEl.clientWidth === 0) return;
      if (this.needsRebuild || this.isList()) this.rebuild();
      else this.fit();
    });
    ro.observe(this.mapEl);
    this.cleanups.push(() => ro.disconnect());
  }

  destroy(): void {
    this.closeDialog(false);
    this.webDialog?.cancel();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.controls.destroy();
    this.mapEl.replaceChildren();
    this.mapEl.classList.remove(`mmw-map`);
  }

  private on(target: HTMLElement, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  setDoc(doc: MmDoc | null, fileKey: string, identical: boolean): void {
    // Un glisser en cours ne survit pas a une nouvelle version de la note ; un apercu en attente est abandonne.
    if (this.nodeDrag?.started) this.finishNodeDrag(true);
    this.clearPreviewState();
    if (fileKey === this.fileKey && this.doc && doc) this.remapFolds(this.doc, doc);
    if (fileKey !== this.fileKey) {
      this.collapsed.clear();
      this.selected = null;
      this.selectedKeys.clear();
      this.fitPending = true;
      this.fileKey = fileKey;
    }
    this.doc = doc;
    this.identical = identical;
    this.rebuild();
  }

  // Les branches repliees suivent leur titre quand la structure de la note change (ajout, suppression,
  // deplacement, frappe dans la note). Un simple changement de titre garde les memes cles.
  private remapFolds(before: MmDoc, after: MmDoc): void {
    if (this.collapsed.size === 0) return;
    const a = flattenDoc(before);
    const b = flattenDoc(after);
    if (a.length === b.length && a.every((e, i) => e.key === b[i].key && e.node.level === b[i].node.level)) {
      const renamed = a.filter((e, i) => e.node.title !== b[i].node.title).length;
      if (renamed <= 1) return;
    }
    const signatures = (doc: MmDoc): { key: string; sig: string }[] => {
      const seen = new Map<string, number>();
      return flattenDoc(doc).map((e) => {
        const path = pathTitles(doc, e.key).join(`\u0001`);
        const n = seen.get(path) ?? 0;
        seen.set(path, n + 1);
        return { key: e.key, sig: `${path}\u0002${n}` };
      });
    };
    const wanted = new Set(signatures(before).filter((x) => this.collapsed.has(x.key)).map((x) => x.sig));
    this.collapsed = new Set(signatures(after).filter((x) => wanted.has(x.sig)).map((x) => x.key));
  }

  // ---------------------------------------------------------------- styles

  // Style effectif d'une case : reglages de la carte, style de son niveau, style de la case.
  private styleOf(n: LNode): NodeStyle {
    const s = this.getSettings();
    const level = n.depth === 0 ? 0 : n.node.level;
    if (isFloatRoot(n.key)) {
      // Un sujet flottant a ses propres reglages par defaut, que le style de la case peut encore modifier.
      const own: StylePatch = {};
      if (s.floatStrokeColor) own.strokeColor = s.floatStrokeColor;
      if (s.floatFillColor) own.fillColor = s.floatFillColor;
      if (s.floatStrokeDash) own.strokeDash = s.floatStrokeDash;
      if (s.floatFontFamily) own.fontFamily = s.floatFontFamily;
      Object.assign(own, shapePatch(s.floatShape === `round` ? `rounded` : s.floatShape === `sharp` ? `rect` : (s.floatShape as ShapeChoice)));
      // Les reglages de tous les sujets flottants (niveau `f`) puis ceux du sujet lui-meme passent avant ces valeurs par defaut.
      return resolveStyle({ ...globalStyle(s), ...own }, this.doc?.root.meta?.levels, `f`, n.node.meta?.style);
    }
    return resolveStyle(globalStyle(s), this.doc?.root.meta?.levels, level, n.node.meta?.style);
  }

  // Style montre par le panneau d'apparence : celui du noeud principal selectionne, sinon celui de la carte.
  private currentStyle(): NodeStyle {
    const s = this.getSettings();
    const n = this.selected ? this.list.find((x) => x.key === this.selected) : undefined;
    return n ? this.styleOf(n) : globalStyle(s);
  }

  // Nature de la selection pour le panneau d'apparence : toute la carte (ou rien), des titres, ou des sujets flottants seuls.
  private selectionKind(): `all` | `nodes` | `floats` {
    const keys = this.getSelection();
    if (!this.doc || keys.length === 0 || keys.length >= flattenDoc(this.doc).length) return `all`;
    return keys.every((k) => isFloatRoot(k)) ? `floats` : `nodes`;
  }

  private scopeLabel(individual: boolean): string {
    const keys = this.getSelection();
    if (!this.doc || keys.length === 0) return `toute la carte`;
    const flat = flattenDoc(this.doc);
    const byKey = new Map<string, MmNode>(flat.map((e) => [e.key, e.node]));
    const levels = keys.map((k) => (k === `r` ? 0 : isFloatRoot(k) ? -1 : byKey.get(k)?.level ?? 0));
    return describeScope(levels, keys.length, keys.length >= flat.length, individual);
  }

  // ---------------------------------------------------------------- construction

  private isList(): boolean {
    return this.getSettings().viewMode === `list`;
  }

  rebuild(): void {
    const started = performance.now();
    this.rebuildNow();
    record(`Carte : reconstruction`, performance.now() - started, `${this.list.length} cases, vue ${this.getSettings().viewMode}`);
  }

  private rebuildNow(): void {
    const s = this.getSettings();
    const list = s.viewMode === `list`;
    this.mapEl.classList.toggle(`mmw-list`, list);
    this.mapEl.classList.toggle(`mmw-stripes`, list && s.listStripes);
    // Au changement de vue, la carte ou la liste est recadree.
    if (this.lastView !== null && this.lastView !== s.viewMode) this.fitPending = true;
    this.lastView = s.viewMode;
    this.mapEl.style.setProperty(`--mmw-max-w`, `${s.maxWidth}px`);
    this.mapEl.classList.toggle(`mmw-wrap`, s.longTitles === `wrap`);
    // Menu de l'oeil : elements masques et vue en noir et blanc.
    this.mapEl.classList.toggle(`mmw-hide-tags`, !s.showTags);
    this.mapEl.classList.toggle(`mmw-hide-comments`, !s.showComments);
    this.mapEl.classList.toggle(`mmw-hide-web`, !s.showWebLinks);
    this.mapEl.classList.toggle(`mmw-bw`, s.blackWhite);
    // Contraste de la case selectionnee : 0 (discret) a 100 (tres marque).
    const c = Math.max(0, Math.min(100, s.selectionContrast ?? 50));
    this.mapEl.style.setProperty(`--mmw-sel-bg`, `${Math.round(8 + c * 0.42)}%`);
    this.mapEl.style.setProperty(`--mmw-sel-ring`, `${Math.round(25 + c * 0.7)}%`);
    this.mapEl.style.setProperty(`--mmw-sel-halo`, `${(1 + c * 0.05).toFixed(1)}px`);

    if (!this.doc) {
      this.worldEl.replaceChildren();
      this.root = null;
      this.list = [];
      this.messageEl.textContent = t(`Ouvrez une note du coffre pour afficher sa carte.`);
      this.messageEl.style.display = `block`;
      this.statusEl.textContent = ``;
      this.controls.refresh();
      return;
    }
    this.messageEl.style.display = `none`;
    if (this.mapEl.clientWidth === 0) {
      this.needsRebuild = true;
      return;
    }
    this.needsRebuild = false;

    // La saisie en cours survit a la reconstruction (la note peut etre relue pendant la frappe).
    const typing = this.renaming;
    const typingFocused = !!typing && typing.input.ownerDocument.activeElement === typing.input;
    this.suspendBlur = true;
    this.worldEl.replaceChildren(this.svgEl);
    this.root = buildLayoutTree((this.previewDoc ?? this.doc).root, `r`, 0, this.previewCollapsed ?? this.collapsed);
    this.list = flatten(this.root);
    const collapsedSet = this.previewCollapsed ?? this.collapsed;
    this.floatRoots = (this.previewDoc ?? this.doc).floats.map((f, i) => buildLayoutTree(f, `f${i}`, 1, collapsedSet));
    for (const fr of this.floatRoots) this.list.push(...flatten(fr));
    this.links = parseLinks(this.previewDoc ?? this.doc, this.callbacks.getFileName?.() ?? `Note.md`);
    if (this.pendingLink && this.links.some((l) => this.linkId(l) === this.pendingLink)) {
      this.selectedLink = this.pendingLink;
      this.pendingLink = null;
    }
    if (this.selectedLink && this.selectedLink !== this.pendingLink && !this.links.some((l) => this.linkId(l) === this.selectedLink)) this.selectedLink = null;
    if (this.selectedLink && this.links.some((l) => this.linkId(l) === this.selectedLink && (l.external ? !s.showExternalLinks : !s.showInternalLinks))) this.selectedLink = null;
    // Liens de chaque case, indexes une fois pour toutes (et non recherches dans toute la liste pour chaque case).
    this.linksFrom.clear();
    for (const l of this.links) this.linksFrom.set(l.from, [...(this.linksFrom.get(l.from) ?? []), l]);
    this.webByKey.clear();
    for (const n of this.list) {
      if (n.depth < 1) continue;
      const w = webLinks(this.previewDoc ?? this.doc, n.key);
      if (w.length > 0) this.webByKey.set(n.key, w);
    }
    this.els.clear();
    this.eyes.clear();
    this.dropLineEl = null;
    // Vue Liste : chaque niveau est decale de `indent` ; le cadre epouse le titre le plus long, sans depasser une largeur maximale
    // ni celle de la fenetre (un titre plus long est coupe par des points de suspension, le titre complet s'affiche au survol).
    const indent = listIndent(1);
    if (list) this.scale = 1;
    this.list.forEach((n, i) => {
      const el = this.createNodeEl(n, s);
      if (list && i % 2 === 1) el.classList.add(`mmw-odd`);
      this.worldEl.appendChild(el);
      this.els.set(n.key, el);
    });
    if (list) {
      const levelX = (n: LNode): number => (isFloatKey(n.key) ? n.depth - 1 : n.depth) * indent;
      let wanted = LIST_MIN_WIDTH;
      for (const n of this.list) wanted = Math.max(wanted, levelX(n) + this.els.get(n.key)!.offsetWidth);
      const pane = this.mapEl.clientWidth - 16 - 2 * LIST_PAD_X - LIST_GUTTER;
      this.listWidth = Math.max(LIST_MIN_WIDTH, Math.min(wanted, LIST_MAX_WIDTH, pane));
      for (const n of this.list) this.els.get(n.key)!.style.width = `${Math.max(40, this.listWidth - levelX(n))}px`;
    } else {
      this.listWidth = 0;
    }
    for (const n of this.list) {
      const el = this.els.get(n.key)!;
      n.w = el.offsetWidth;
      n.h = el.offsetHeight;
      // Les formes a pointes et l'ovale ont besoin de plus de place que le texte pour qu'il reste dans le contour.
      if (!list) {
        const st = this.styleOf(n);
        if (st.showFrames) this.inflate(el, n, st);
      }
    }
    this.bounds = list ? computeListLayout(this.root, indent, this.listWidth, LIST_ROW_GAP) : computeLayout(this.root, s.compactness);
    this.mainBounds = { ...this.bounds };
    this.layoutFloats(s, list, indent);
    if (list) {
      // Le monde a la taille de la liste : le cadre l'epouse, et defile quand il y a plus de lignes que de place.
      this.worldEl.style.width = `${this.listWidth}px`;
      this.worldEl.style.height = `${this.bounds.maxY + 6}px`;
    } else {
      this.worldEl.style.width = ``;
      this.worldEl.style.height = ``;
    }
    if (list) {
      // Trait qui ouvre la zone des sujets flottants.
      const sep = document.createElement(`div`);
      sep.className = `mmw-float-sep`;
      sep.title = t(`Sujets flottants : glissez un titre ici pour le sortir de la carte`);
      sep.style.top = `${this.floatZoneY}px`;
      sep.style.width = `${this.listWidth}px`;
      this.worldEl.appendChild(sep);
    }
    for (const n of this.list) {
      const el = this.els.get(n.key)!;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      if (n.hasChildren && n.depth >= 1) this.worldEl.appendChild(list ? this.createListFold(n) : this.createFold(n));
      const eye = this.createEye(n);
      if (eye) {
        this.worldEl.appendChild(eye);
        this.eyes.set(n.key, eye);
      }
    }
    if (this.eyeHover) this.eyes.get(this.eyeHover)?.classList.add(`mmw-eye-show`);
    this.layoutExternals();
    this.stickRoot();
    this.draw(s);
    if (typing) {
      if (this.els.has(typing.key)) {
        this.worldEl.appendChild(typing.input);
        this.placeRename();
        if (typingFocused) typing.input.focus();
      } else this.renaming = null;
    }
    this.suspendBlur = false;

    if (this.previewDoc) {
      // Apercu d'un deplacement : seule la case deplacee est mise en avant.
      this.els.get(this.previewDragKey ?? ``)?.classList.add(`mmw-drop-target`);
    } else {
      // Les noeuds qui n'existent plus sont retires de la selection.
      const valid = new Set(flattenDoc(this.doc).map((e) => e.key));
      for (const k of [...this.selectedKeys]) if (!valid.has(k)) this.selectedKeys.delete(k);
      if (this.selected && !this.els.has(this.selected)) this.selected = null;
      this.applySelection();
    }

    const stats = computeStats(this.doc);
    this.statusEl.textContent = `${stats.nodeCount > 1 ? t(`{0} nœuds`, stats.nodeCount) : t(`{0} nœud`, stats.nodeCount)}. ${
      this.identical ? t(`Reconstruction de la note identique au fichier.`) : t(`ATTENTION : reconstruction différente du fichier, ne rien modifier.`)
    }`;
    this.statusEl.classList.toggle(`mmw-ko`, !this.identical);

    this.controls.refresh();
    if (this.fitPending) this.fit();
    else this.applyTransform();
  }

  // Agrandit la case d'une forme qui entoure mal son texte : le losange (diamant), le parallelogramme et l'ovale.
  private inflate(el: HTMLElement, n: LNode, st: NodeStyle): void {
    let w = n.w;
    let h = n.h;
    if (st.shape === `diamond`) {
      w = Math.round(n.w * 1.8);
      h = Math.round(n.h * 1.9);
    } else if (st.shape === `parallelogram`) {
      w = n.w + Math.round(n.h * 0.7);
      el.style.setProperty(`--mmw-skew`, `${Math.min(n.h * 0.35, w / 3)}px`);
    } else if (st.shape === `oval`) {
      w = n.w + Math.round(n.h * 0.35);
    }
    if (w !== n.w || h !== n.h) {
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      n.w = w;
      n.h = h;
    }
  }

  // Sujets flottants. Carte : chaque sujet est pose a sa position (ceux qui n'en ont pas encore sont ranges a droite de la
  // carte). Liste : ils sont empiles sous un trait, dans une zone qui reste visible meme vide.
  private layoutFloats(s: MmSettings, list: boolean, indent: number): void {
    const b = this.bounds!;
    this.floatZoneY = 0;
    if (list) {
      const top = b.maxY + 16;
      this.floatZoneY = top;
      let y = top + 12;
      let row = 0;
      for (const fr of this.floatRoots) {
        for (const n of flatten(fr)) {
          n.x = (n.depth - 1) * indent;
          n.y = y;
          n.w = Math.max(40, this.listWidth - n.x);
          y += n.h + LIST_ROW_GAP;
          row = n.h + LIST_ROW_GAP;
        }
      }
      // Sous le dernier sujet flottant (ou sous le trait, quand il n'y en a pas), environ trois lignes vides restent disponibles pour y
      // deposer un titre.
      if (row === 0) row = (this.list[0]?.h ?? 24) + LIST_ROW_GAP;
      b.maxY = y + LIST_FLOAT_ROWS * row;
      return;
    }
    let autoY = b.minY;
    const autoX = b.maxX + 90;
    this.floatRoots.forEach((fr) => {
      const rel = computeLayout(fr, s.compactness);
      const pos = fr.node.float;
      const hasPos = pos?.x !== undefined && pos?.y !== undefined;
      const dx = hasPos ? pos.x! : autoX;
      const dy = hasPos ? pos.y! : autoY;
      for (const n of flatten(fr)) {
        n.x += dx;
        n.y += dy;
      }
      if (!hasPos) autoY += rel.maxY - rel.minY + 30;
      for (const n of flatten(fr)) {
        b.minX = Math.min(b.minX, n.x);
        b.minY = Math.min(b.minY, n.y);
        b.maxX = Math.max(b.maxX, n.x + n.w);
        b.maxY = Math.max(b.maxY, n.y + n.h);
      }
    });
  }

  private createNodeEl(n: LNode, s: MmSettings): HTMLElement {
    const el = document.createElement(`div`);
    el.className = `mmw-node mmw-depth-${Math.min(n.depth, 3)}`;
    el.dataset.key = n.key;
    if (this.isHidden(n)) el.classList.add(`mmw-hidden`);
    if (isFloatRoot(n.key)) el.classList.add(`mmw-float-root`);
    const st = this.styleOf(n);
    if (s.viewMode !== `list` && st.showFrames) el.classList.add(`mmw-shape-${shapeChoice(st)}`);
    el.style.setProperty(`--mmw-node-color`, st.strokeColor || `var(--text-normal)`);
    const list = s.viewMode === `list`;
    // Vue Liste : police du theme (ou celle de la carte si on le demande), taille uniforme, texte a gauche.
    el.style.setProperty(`--mmw-node-font`, list && !s.listMapFont ? `inherit` : FONT_CSS[st.fontFamily] ?? `inherit`);
    el.style.setProperty(`--mmw-node-size`, list ? `${(n.depth === 0 ? 1.1 : 1) * st.fontScale}em` : `${BASE_EM[Math.min(n.depth, 2)] * st.fontScale}em`);
    el.style.setProperty(`--mmw-node-align`, list ? `left` : st.textAlign);
    el.style.setProperty(`--mmw-pad`, list ? String(LIST_PAD) : String(padFactor(s.compactness, st.showFrames)));
    el.style.setProperty(`--mmw-node-justify`, list || st.textAlign === `left` ? `flex-start` : st.textAlign === `right` ? `flex-end` : `center`);
    const meta = n.node.meta;
    const title = n.node.title;
    // Le titre court remplace le titre sur la carte ; la note garde le titre complet.
    const shown = meta?.short || title;
    const prefix = s.showPrefix && n.depth > 0 ? `${`#`.repeat(n.node.level)} ` : ``;
    const label = document.createElement(`span`);
    label.className = `mmw-title`;
    if (shown === `` && prefix === ``) {
      el.classList.add(`mmw-empty-title`);
      label.textContent = ` `;
    } else {
      label.textContent = prefix + shown;
    }
    el.appendChild(label);

    // Mappemonde si le paragraphe du titre contient des liens web ou des videos integrees (avant les etiquettes).
    const web = this.webByKey.get(n.key);
    if (web) {
      const mark = document.createElement(`span`);
      mark.className = `mmw-web-mark`;
      setSvg(mark, iconSvg(`web`, s.iconWeb));
      if (s.iconColorWeb) mark.style.color = s.iconColorWeb;
      mark.title = web.map((w) => `${w.label} (${w.url})`).join(`\n`);
      el.appendChild(mark);
    }

    // Liens replies (menu de l'oeil) : un repere colore par sorte de lien, a la place des cases et des fleches.
    // Carte : repere seulement si les cases sont repliees ; liste : repere si les liens sont affiches.
    if (list ? s.showExternalLinks : !s.showExternalLinks) {
      const ext = (this.linksFrom.get(n.key) ?? []).filter((l) => l.external);
      if (ext.length > 0) {
        const mark = document.createElement(`span`);
        mark.className = `mmw-link-mark`;
        setSvg(mark, iconSvg(`external`, s.iconExternal));
        if (s.iconColorExternal) mark.style.color = s.iconColorExternal;
        mark.title = ext.map((l) => (l.heading ? `${l.note} › ${l.heading}` : l.note)).join(`\n`);
        el.appendChild(mark);
      }
    }
    if (list ? s.showInternalLinks : !s.showInternalLinks) {
      const inner = (this.linksFrom.get(n.key) ?? []).filter((l) => !l.external && l.to);
      if (inner.length > 0) {
        const mark = document.createElement(`span`);
        mark.className = `mmw-int-mark`;
        setSvg(mark, iconSvg(`internal`, s.iconInternal));
        if (s.iconColorInternal) mark.style.color = s.iconColorInternal;
        mark.title = inner.map((l) => t(`Aller à : {0}`, l.heading ?? ``)).join(`\n`);
        el.appendChild(mark);
      }
    }

    // Etiquettes : en petit, a droite du titre, en ecriture normale. Une etiquette supprimee des reglages n'est pas affichee.
    const defs = new Map(s.tags.map((t) => [t.id, t]));
    const tags = (meta?.tags ?? []).flatMap((id) => (defs.has(id) ? [defs.get(id)!] : []));
    if (tags.length > 0) {
      const box = document.createElement(`span`);
      box.className = `mmw-tags`;
      for (const t of tags) {
        const chip = document.createElement(`span`);
        chip.className = `mmw-tag`;
        chip.textContent = t.name === `` ? `?` : t.name;
        chip.style.background = t.bg;
        chip.style.color = t.fg;
        box.appendChild(chip);
      }
      el.appendChild(box);
    }

    const tip: string[] = [];
    if (title !== `` || prefix !== ``) tip.push(prefix + title);
    if (meta?.comment) {
      const mark = document.createElement(`span`);
      mark.className = `mmw-comment-mark`;
      setSvg(mark, COMMENT_ICON);
      el.appendChild(mark);
      tip.push(meta.comment);
    }
    if (tip.length > 0) el.title = tip.join(`\n\n`);
    return el;
  }

  // Titre masque : lui-meme ou par l'un de ses parents. Ses sous-titres le sont avec lui.
  private isHidden(n: LNode): boolean {
    for (let p: LNode | null = n; p; p = p.parent) if (p.depth >= 1 && p.node.meta?.hidden) return true;
    return false;
  }

  // Oeil de masquage, en haut a droite de la case. Pas d'oeil sur la racine ni sur un sous-titre masque par son parent.
  private createEye(n: LNode): HTMLElement | null {
    if (n.depth < 1 || isFloatRoot(n.key)) return null;
    const own = !!n.node.meta?.hidden;
    if (!own && n.parent && this.isHidden(n.parent)) return null;
    const el = document.createElement(`div`);
    el.className = `mmw-eye` + (own ? ` mmw-eye-on` : ``);
    el.dataset.eye = n.key;
    setSvg(el, own ? EYE_OFF_ICON : EYE_ICON);
    el.title = own ? t(`Afficher ce titre dans la note`) : t(`Masquer ce titre dans la note`);
    if (this.isList()) {
      // Vue Liste : l'oeil est a l'extremite droite de la ligne.
      el.style.left = `${n.x + n.w - 28}px`;
      el.style.top = `${n.y + n.h / 2 - 10}px`;
    } else {
      el.style.left = `${n.x + n.w - 10}px`;
      el.style.top = `${n.y - 9}px`;
    }
    return el;
  }

  private setEyeHover(key: string | null): void {
    if (key === this.eyeHover) return;
    if (this.eyeHover) this.eyes.get(this.eyeHover)?.classList.remove(`mmw-eye-show`);
    this.eyeHover = key;
    if (key) this.eyes.get(key)?.classList.add(`mmw-eye-show`);
  }

  // Vue Liste : petit triangle a gauche du titre, qui replie ou deplie ses enfants.
  private createListFold(n: LNode): HTMLElement {
    const el = document.createElement(`div`);
    el.className = `mmw-lfold` + (n.collapsed ? ` mmw-lfold-collapsed` : ``);
    el.dataset.fold = n.key;
    setSvg(el, FOLD_ICON);
    el.title = n.collapsed ? t(`Déplier`) : t(`Replier`);
    el.style.left = `${n.x + 6}px`;
    el.style.top = `${n.y + n.h / 2 - 9}px`;
    return el;
  }

  private createFold(n: LNode): HTMLElement {
    const el = document.createElement(`div`);
    el.className = `mmw-fold` + (n.collapsed ? ` mmw-fold-collapsed` : ``);
    el.dataset.fold = n.key;
    el.textContent = n.collapsed ? String(countDescendants(n)) : `−`;
    el.title = n.collapsed ? t(`Déplier la branche`) : t(`Replier la branche`);
    el.style.left = `${n.x + n.w + 4}px`;
    el.style.top = `${n.y + n.h / 2 - 9}px`;
    return el;
  }

  private path(d: string, cls: string, css: string): void {
    const p = document.createElementNS(SVG_NS, `path`);
    p.setAttribute(`d`, d);
    p.setAttribute(`class`, cls);
    p.setAttribute(`style`, css);
    this.svgEl.appendChild(p);
  }

  private draw(s: MmSettings): void {
    this.svgEl.replaceChildren();
    if (!this.root) return;
    if (s.viewMode === `list`) {
      // Vue Liste : ni cadre, ni trait, ni fleche ; seules les pointes de fleche du trait de creation de lien existent.
      this.svgEl.appendChild(this.markerDefs());
      this.updateLinkPreview(null);
      return;
    }
    const styles = new Map<string, NodeStyle>(this.list.map((n) => [n.key, this.styleOf(n)]));
    const styleOf = (n: LNode): NodeStyle => styles.get(n.key)!;

    for (const n of this.list) {
      const st = styleOf(n);
      if (!st.showFrames) continue;
      const shape =
        st.shape === `diamond` || st.shape === `parallelogram`
          ? polygonFrame(st.shape, n.x, n.y, n.w, n.h, n.key, st.roughness)
          : st.shape === `underline`
            ? underlinePath(n.x, n.y, n.w, n.h, n.key, st.roughness)
            : framePath(n.x, n.y, n.w, n.h, n.key, n.depth === 0, st.corners, st.roughness, st.shape === `oval`);
      const cls = `mmw-frame` + (this.isHidden(n) ? ` mmw-frame-hidden` : ``);
      const css = strokeCss(st, n.depth === 0 ? 1.45 : 1) + `fill:${st.shape === `underline` ? `none` : st.fillColor || `transparent`};`;
      if (shape.kind === `path`) this.path(shape.d, cls, css);
      else {
        const r = document.createElementNS(SVG_NS, `rect`);
        r.setAttribute(`x`, String(n.x));
        r.setAttribute(`y`, String(n.y));
        r.setAttribute(`width`, String(n.w));
        r.setAttribute(`height`, String(n.h));
        r.setAttribute(`rx`, String(shape.rx));
        r.setAttribute(`class`, cls);
        r.setAttribute(`style`, css);
        this.svgEl.appendChild(r);
      }
    }

    const root = this.root;
    const chain = (x: number, y1: number, y2: number, seed: string, st: NodeStyle): void => {
      if (y2 - y1 < 1) return;
      this.path(trunkLine(s.branchStyle, x, y1, y2, seed, st.roughness) ?? `M ${x} ${y1} L ${x} ${y2}`, `mmw-line`, strokeCss(st));
    };
    // Lien entre la racine et le premier noeud de premier niveau.
    if (root.children.length > 0) {
      const first = root.children[0];
      chain(trunkX(first), root.y + root.h, first.y, `root>${first.key}`, styleOf(root));
    }
    for (const n of this.list) {
      if (n.depth === 0) continue;
      const st = styleOf(n);
      const y0 = n.y + n.h;
      const tx = trunkX(n);
      let trunkEnd = y0;
      for (const c of n.children) {
        const cs = styleOf(c);
        const cy = c.y + c.h / 2;
        // Sans ligne verticale (styles courbe et droit), rien ne descend le long des branches.
        if (hasTrunk(s.branchStyle)) trunkEnd = Math.max(trunkEnd, cy - trunkRadius(y0, cy, tx, c.x, cs.corners));
        this.path(trunkBranch(s.branchStyle, tx, y0, c.x, cy, `${n.key}>${c.key}`, cs.corners, cs.roughness), `mmw-line`, strokeCss(cs));
      }
      // Les noeuds de premier niveau sont relies entre eux par la meme ligne verticale.
      if (n.depth === 1 && n.parent) {
        const siblings = n.parent.children;
        const next = siblings[siblings.indexOf(n) + 1];
        if (next) trunkEnd = Math.max(trunkEnd, next.y);
      }
      chain(tx, y0, trunkEnd, `trunk${n.key}`, st);
    }
    this.drawLinks(s);
  }

  private linkId(l: MapLink): string {
    return `${l.from}:${l.line}`;
  }

  // Case visible d'un titre : le titre lui-meme, ou son plus proche parent visible s'il est replie.
  private visibleNode(key: string): LNode | null {
    for (let k = key; k.includes(`.`); k = k.slice(0, k.lastIndexOf(`.`))) {
      const n = this.list.find((x) => x.key === k);
      if (n) return n;
    }
    return null;
  }

  // Cases des notes exterieures, a gauche de la carte : une par lien, a la hauteur du titre de depart.
  private layoutExternals(): void {
    for (const b of this.extBoxes) b.el.remove();
    this.extBoxes = [];
    // Vue Liste : pas de cases a gauche, les liens vers d'autres notes sont des reperes sur la ligne.
    if (!this.bounds || this.isList()) return;
    const made: { link: MapLink; el: HTMLElement }[] = [];
    const showExternal = this.getSettings().showExternalLinks;
    for (const l of this.links) {
      if (!showExternal || !l.external || !this.els.has(l.from)) continue;
      const el = document.createElement(`div`);
      el.className = `mmw-ext-box`;
      el.dataset.ext = this.linkId(l);
      const name = l.note.replace(/^.*\//, ``);
      const label = document.createElement(`span`);
      label.className = `mmw-ext-label`;
      label.textContent = l.heading ? `${name} › ${l.heading}` : name;
      const open = document.createElement(`span`);
      open.className = `mmw-ext-open`;
      setSvg(open, OPEN_ICON);
      open.title = t(`Ouvrir la carte de cette note (Cmd ou Ctrl : ouvrir la note dans un nouvel onglet)`);
      el.append(label, open);
      el.title = t(`Cliquer pour sélectionner (glisser pour changer l'ordre, Suppr pour retirer), double clic pour modifier`);
      el.classList.toggle(`mmw-ext-on`, this.linkId(l) === this.selectedLink);
      this.worldEl.appendChild(el);
      made.push({ link: l, el });
    }
    const right = this.bounds.minX - 44;
    const rows = new Map<string, number>();
    let minX = this.bounds.minX;
    for (const { link, el } of made) {
      const src = this.list.find((n) => n.key === link.from);
      if (!src) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const i = rows.get(link.from) ?? 0;
      rows.set(link.from, i + 1);
      const x = right - w;
      const y = src.y + src.h / 2 - h / 2 + i * (h + 8);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      this.extBoxes.push({ link, el, x, y, w, h });
      minX = Math.min(minX, x - 8);
    }
    this.bounds.minX = minX;
  }

  // Fleches en pointille entre les titres relies, du bord droit au bord droit ; vers une note exterieure, du bord gauche
  // a sa case. Elles sont neutres, ou colorees (couleur des liens du theme) selon le reglage ; toujours colorees quand elles
  // sont selectionnees, et pour les notes exterieures.
  // Pointes de fleche, neutre et coloree.
  private markerDefs(): SVGElement {
    const defs = document.createElementNS(SVG_NS, `defs`);
    const marker = (id: string, cls: string): string =>
      `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1 L9 5 L0 9 z" class="${cls}"/></marker>`;
    setSvg(defs, marker(`mmw-arrow`, `mmw-link-head`) + marker(`mmw-arrow-blue`, `mmw-link-head mmw-link-head-blue`));
    return defs;
  }

  private drawLinks(s: MmSettings): void {
    this.svgEl.appendChild(this.markerDefs());
    const curved = s.branchStyle === `curve`;
    const add = (l: MapLink, d: string, blue: boolean): void => {
      const id = this.linkId(l);
      const on = id === this.selectedLink;
      const path = document.createElementNS(SVG_NS, `path`);
      path.setAttribute(`d`, d);
      path.setAttribute(`class`, `mmw-link` + (blue ? ` mmw-link-blue` : ``) + (on ? ` mmw-link-on` : ``));
      path.setAttribute(`marker-end`, `url(#${blue || on ? `mmw-arrow-blue` : `mmw-arrow`})`);
      path.setAttribute(`data-linkpath`, id);
      if (blue) path.setAttribute(`data-blue`, `1`);
      this.svgEl.appendChild(path);
      const hit = document.createElementNS(SVG_NS, `path`);
      hit.setAttribute(`d`, d);
      hit.setAttribute(`class`, `mmw-link-hit`);
      hit.setAttribute(`data-link`, id);
      const tip = document.createElementNS(SVG_NS, `title`);
      tip.textContent = t(`Lien vers {0} (cliquer puis Suppr pour le retirer)`, l.heading ?? l.note);
      hit.appendChild(tip);
      this.svgEl.appendChild(hit);
    };
    // Le rond de repli, a droite d'un titre qui a des sous-titres, reste degage.
    const rightX = (n: LNode): number => n.x + n.w + (n.hasChildren && n.depth >= 1 ? 26 : 3);
    for (const l of this.links) {
      if (l.external || !l.to || !s.showInternalLinks) continue;
      const a = this.visibleNode(l.from);
      const b = this.visibleNode(l.to);
      if (!a || !b || a === b) continue;
      // Le trait passe a droite des cases situees entre les deux titres.
      const top = Math.min(a.y, b.y);
      const bottom = Math.max(a.y + a.h, b.y + b.h);
      const clear = Math.max(0, ...this.list.filter((n) => n.y + n.h >= top && n.y <= bottom).map((n) => rightX(n)));
      add(l, loopPath(rightX(a), a.y + a.h / 2, rightX(b), b.y + b.h / 2, curved, clear), s.linkColored);
    }
    for (const box of this.extBoxes) {
      const a = this.list.find((n) => n.key === box.link.from);
      if (!a) continue;
      add(box.link, sidePath(a.x - 3, a.y + a.h / 2, box.x + box.w + 3, box.y + box.h / 2, curved), true);
    }
    this.updateLinkPreview(null);
  }

  // Met la fleche en evidence sans refaire le dessin (l'element clique doit rester en place pour garder le focus).
  private selectLink(id: string | null): void {
    this.selectedLink = id;
    for (const p of Array.from(this.svgEl.querySelectorAll(`[data-linkpath]`))) {
      const on = p.getAttribute(`data-linkpath`) === id;
      p.classList.toggle(`mmw-link-on`, on);
      p.setAttribute(`marker-end`, `url(#${on || p.hasAttribute(`data-blue`) ? `mmw-arrow-blue` : `mmw-arrow`})`);
    }
    for (const b of this.extBoxes) b.el.classList.toggle(`mmw-ext-on`, this.linkId(b.link) === id);
  }

  // Modification d'un lien : la fenetre du coffre s'ouvre, ou on clique sur un autre titre de la note ; le nouveau lien
  // prend la place de l'ancien.
  editLink(link: MapLink): void {
    if (this.linking) this.stopLinking();
    this.startLinking(undefined, link);
  }

  // Fenetre de saisie d'un lien web (ajout ou modification).
  openWebDialog(opts: WebDialogOptions): void {
    this.webDialog?.cancel();
    const done = (): void => {
      this.webDialog = null;
      this.mapEl.focus();
    };
    this.webDialog = new WebDialog(this.mapEl, {
      ...opts,
      onSubmit: (v) => {
        done();
        opts.onSubmit(v);
      },
      onDelete: opts.onDelete
        ? () => {
            done();
            opts.onDelete!();
          }
        : undefined,
      onCancel: () => {
        done();
        opts.onCancel?.();
      },
    });
  }

  // ---------------------------------------------------------------- creation d'un lien

  // `from` : titre de depart impose (clic droit) ; `replace` : lien existant a remplacer.
  startLinking(from?: string, replace?: MapLink): void {
    if (!this.doc || this.linking) return;
    this.commitRename(true, false);
    this.closeDialog(true);
    // Un titre deja selectionne sert de depart.
    const start = replace ? replace.from : from ?? (this.selected && this.selected !== `r` ? this.selected : null);
    this.linking = { from: start, pressed: false, pending: null, replace: replace ?? null };
    this.mapEl.classList.add(`mmw-linking`);
    this.controls.setLinking(true);
    this.showLinkHint();
    this.openPicker();
  }

  stopLinking(): void {
    if (!this.linking) return;
    this.linking = null;
    this.picker?.close();
    this.picker = null;
    this.mapEl.classList.remove(`mmw-linking`);
    this.controls.setLinking(false);
    this.linkHint?.remove();
    this.linkHint = null;
    this.updateLinkPreview(null);
  }

  private showLinkHint(): void {
    const L = this.linking;
    if (!L) return;
    if (!this.linkHint) {
      this.linkHint = document.createElement(`div`);
      this.linkHint.className = `mmw-link-hint`;
      this.mapEl.appendChild(this.linkHint);
    }
    const from = L.from !== null ? this.list.find((n) => n.key === L.from) : null;
    let text: string;
    if (L.replace) text = t(`Modification du lien : cliquez sur le nouveau titre d'arrivée, ou choisissez une note dans la fenêtre (Tab). Échap pour annuler.`);
    else if (L.pending) text = t(`Note choisie : {0}. Cliquez sur le titre de départ. Échap pour annuler.`, L.pending.path.replace(/^.*\//, ``).replace(/\.md$/i, ``));
    else if (from) text = t(`Départ : « {0} ». Cliquez sur le titre d'arrivée, ou choisissez une note dans la fenêtre (Tab). Échap pour annuler.`, from.node.title || t(`sans titre`));
    else text = t(`Lien : cliquez sur le titre de départ, ou choisissez une note dans la fenêtre (Tab). Échap pour annuler.`);
    this.linkHint.textContent = text;
  }

  // Fenetre de choix d'une note du coffre, au-dessus des menus. Elle ne prend pas le focus : on peut tracer une fleche sur
  // la carte ; Tab ou un clic dans la fenetre permet de chercher ou de parcourir le coffre.
  private openPicker(): void {
    if (!this.callbacks.getVaultFiles) return;
    this.picker?.close();
    this.picker = new VaultPicker(this.mapEl, {
      files: this.callbacks.getVaultFiles(),
      headings: (path) => this.callbacks.getHeadings?.(path) ?? Promise.resolve([]),
      onPick: (path, heading) => this.pickExternal(path, heading),
      onClose: () => this.stopLinking(),
      onCreate: this.callbacks.createNote,
      createFolder: this.callbacks.getNewNoteFolder,
    });
  }

  private pickExternal(path: string, heading: string | null): void {
    const L = this.linking;
    this.picker = null;
    if (!L) return;
    if (L.from !== null) {
      const from = L.from;
      const replace = L.replace ?? undefined;
      this.stopLinking();
      this.callbacks.onLinkExternal?.(from, path, heading, replace);
      return;
    }
    // Le titre de depart reste a choisir : on garde la note choisie.
    L.pending = { path, heading };
    this.showLinkHint();
    this.mapEl.focus();
  }

  // Trait qui suit la souris entre le titre de depart et le pointeur.
  private updateLinkPreview(e: PointerEvent | null): void {
    this.svgEl.querySelector(`.mmw-link-temp`)?.remove();
    const L = this.linking;
    if (!L || L.from === null || !e) return;
    const a = this.list.find((n) => n.key === L.from);
    if (!a) return;
    const box = this.coordRect();
    const x = (e.clientX - box.left - this.tx) / this.scale;
    const y = (e.clientY - box.top - this.ty) / this.scale;
    const path = document.createElementNS(SVG_NS, `path`);
    path.setAttribute(`d`, linkPath(a, { x, y, w: 0, h: 0 }, false));
    path.setAttribute(`class`, `mmw-link mmw-link-temp`);
    path.setAttribute(`marker-end`, `url(#mmw-arrow)`);
    this.svgEl.appendChild(path);
  }

  private nodeAt(e: PointerEvent): string | null {
    const el = this.mapEl.ownerDocument.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    return (el?.closest(`.mmw-node`) as HTMLElement | null)?.dataset.key ?? null;
  }

  private onLinkPointerDown(e: PointerEvent): void {
    const L = this.linking!;
    const key = this.nodeAt(e);
    if (!key) {
      this.stopLinking();
      return;
    }
    if (L.from === null) {
      if (key === `r`) {
        this.callbacks.onMessage?.(t(`Le nom de la note ne peut pas être le départ d'un lien.`));
        return;
      }
      if (L.pending) {
        const p = L.pending;
        this.stopLinking();
        this.callbacks.onLinkExternal?.(key, p.path, p.heading);
        return;
      }
      L.from = key;
      L.pressed = true;
      this.showLinkHint();
      this.updateLinkPreview(e);
    } else if (key !== L.from) this.finishLink(key);
  }

  private onLinkPointerUp(e: PointerEvent): void {
    const L = this.linking;
    if (!L || !L.pressed) return;
    L.pressed = false;
    const key = this.nodeAt(e);
    // Glisser-deposer d'un titre a l'autre.
    if (key && L.from !== null && key !== L.from) this.finishLink(key);
  }

  private finishLink(to: string): void {
    const from = this.linking?.from;
    const replace = this.linking?.replace ?? undefined;
    this.stopLinking();
    if (!from) return;
    if (to === `r`) {
      this.callbacks.onMessage?.(t(`Le lien doit viser un titre de la note, pas son nom.`));
      return;
    }
    this.callbacks.onLinkCreate?.(from, to, replace);
  }

  // Le bouton Retour n'est visible que si une carte precedente est memorisee.
  setBackAvailable(available: boolean): void {
    this.controls.setBack(available);
  }

  // ---------------------------------------------------------------- pliage, selection

  private toggleFold(key: string): void {
    if (this.collapsed.has(key)) this.collapsed.delete(key);
    else this.collapsed.add(key);
    this.rebuild();
  }

  expandAll(): void {
    this.collapsed.clear();
    this.rebuild();
  }

  collapseAll(): void {
    if (!this.doc) return;
    const walk = (node: MmNode, key: string, depth: number): void => {
      if (depth >= 1 && node.children.length > 0) this.collapsed.add(key);
      node.children.forEach((c, i) => walk(c, `${key}.${i}`, depth + 1));
    };
    walk(this.doc.root, `r`, 0);
    if (this.selected) {
      const visible = this.selected.split(`.`).length <= 2;
      if (!visible) this.selected = null;
    }
    this.rebuild();
  }

  private applySelection(): void {
    for (const [key, el] of this.els) el.classList.toggle(`mmw-selected`, this.selectedKeys.has(key));
  }

  private selectionChanged(): void {
    this.applySelection();
    this.callbacks.onSelectionChange?.(this.getSelection());
    this.controls.refresh();
  }

  // notify : faux quand la selection est modifiee par le programme et non par l'utilisateur.
  select(key: string | null, notify = true): void {
    const previous = this.selected;
    const before = this.selectedKeys.size;
    if (this.selectedLink) this.selectLink(null);
    this.selected = key && this.els.has(key) ? key : null;
    this.selectedKeys = this.selected ? new Set([this.selected]) : new Set();
    if (this.selected) {
      const n = this.list.find((x) => x.key === this.selected);
      if (n) this.ensureVisible(n);
    }
    this.selectionChanged();
    if (notify && (this.selected !== previous || before > 1)) this.callbacks.onSelect?.(this.selected);
  }

  // Ajoute ou retire un noeud de la selection (Maj + clic).
  private toggleSelect(key: string): void {
    if (this.selectedKeys.has(key)) {
      this.selectedKeys.delete(key);
      if (this.selected === key) this.selected = [...this.selectedKeys][0] ?? null;
    } else {
      this.selectedKeys.add(key);
      this.selected = key;
    }
    this.selectionChanged();
    this.callbacks.onSelect?.(this.selected);
  }

  // Selectionne tous les noeuds de la carte, y compris ceux qui sont replies.
  selectAll(): void {
    if (!this.doc) return;
    this.selectedKeys = new Set(flattenDoc(this.doc).map((e) => e.key));
    this.selectionChanged();
  }

  getSelectedKey(): string | null {
    return this.selected;
  }

  getSelection(): string[] {
    return [...this.selectedKeys];
  }

  focus(): void {
    this.mapEl.focus();
  }

  // Deplie les branches qui cachent un noeud, pour qu'il soit visible.
  reveal(key: string): void {
    const parts = key.split(`.`);
    let changed = false;
    for (let i = 2; i < parts.length; i++) {
      if (this.collapsed.delete(parts.slice(0, i).join(`.`))) changed = true;
    }
    if (changed) this.rebuild();
  }

  private ensureVisible(n: LNode): void {
    if (this.isList()) {
      // Vue Liste : le cadre defile pour montrer la ligne, sous le titre de la note qui reste en haut.
      const f = this.frameEl;
      const rootH = n.depth === 0 ? 0 : (this.els.get(`r`)?.offsetHeight ?? 0);
      if (n.y < f.scrollTop + rootH) f.scrollTop = Math.max(0, n.y - rootH);
      else if (n.y + n.h > f.scrollTop + f.clientHeight) f.scrollTop = n.y + n.h - f.clientHeight + 4;
      return;
    }
    const margin = 30;
    const vw = this.mapEl.clientWidth;
    const vh = this.mapEl.clientHeight - 60;
    const left = n.x * this.scale + this.tx;
    const right = (n.x + n.w) * this.scale + this.tx;
    const top = n.y * this.scale + this.ty;
    const bottom = (n.y + n.h) * this.scale + this.ty;
    if (left < margin) this.tx += margin - left;
    else if (right > vw - margin) this.tx -= right - (vw - margin);
    if (top < margin) this.ty += margin - top;
    else if (bottom > vh - margin) this.ty -= bottom - (vh - margin);
    this.applyTransform();
  }

  // ---------------------------------------------------------------- zoom et deplacement

  // Rectangle dont l'origine sert aux coordonnees du monde : le cadre (qui, en vue Carte, a la taille de la carte).
  private coordRect(): DOMRect {
    return this.frameEl.getBoundingClientRect();
  }

  private applyTransform(): void {
    if (this.isList()) {
      // Vue Liste : le monde ne bouge pas, c'est le cadre qui defile.
      this.scale = 1;
      this.tx = LIST_PAD_X;
      this.ty = -this.frameEl.scrollTop;
      this.worldEl.style.transform = ``;
    } else {
      this.worldEl.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    }
    this.controls.setZoom(this.scale);
  }

  // Le cadre de la liste defile : le titre de la note reste en haut, et les coordonnees suivent le defilement.
  private onListScroll(): void {
    if (!this.isList()) return;
    this.ty = -this.frameEl.scrollTop;
    this.stickRoot();
  }

  private stickRoot(): void {
    const list = this.isList();
    const offset = list ? `0 ${this.frameEl.scrollTop}px` : ``;
    this.els.get(`r`)?.style.setProperty(`translate`, offset);
    // Un filet sous le titre n'apparait que lorsque des lignes passent derriere lui.
    this.els.get(`r`)?.classList.toggle(`mmw-stuck`, list && this.frameEl.scrollTop > 0);
    this.eyes.get(`r`)?.style.setProperty(`translate`, offset);
  }

  fit(): void {
    if (!this.bounds || this.mapEl.clientWidth === 0) return;
    const b = this.bounds;
    if (this.isList()) {
      // Vue Liste : taille normale, en haut ; la liste se parcourt en la faisant defiler.
      this.frameEl.scrollTop = 0;
      this.fitPending = false;
      this.applyTransform();
      return;
    }
    const vw = this.mapEl.clientWidth;
    const vh = this.mapEl.clientHeight - 60;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    // La carte est etroite et haute : on ajuste la largeur, sans reduire la hauteur sous 50 %.
    const sc = Math.min(1, (vw - 80) / w, Math.max(0.5, (vh - 60) / h));
    this.scale = Math.max(MIN_SCALE, sc);
    this.tx = (vw - w * this.scale) / 2 - b.minX * this.scale;
    // Le titre reste en haut : la carte grandit vers le bas quand on ajoute des titres.
    this.ty = 30 - b.minY * this.scale;
    this.fitPending = false;
    this.applyTransform();
  }

  zoomBy(factor: number, cx?: number, cy?: number): void {
    // La vue Liste est fixe : ni zoom ni deplacement, seulement le defilement du cadre.
    if (this.isList()) return;
    const rect = this.mapEl.getBoundingClientRect();
    const px = (cx ?? rect.left + rect.width / 2) - rect.left;
    const py = (cy ?? rect.top + (rect.height - 60) / 2) - rect.top;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * factor));
    const ratio = next / this.scale;
    this.tx = px - (px - this.tx) * ratio;
    this.ty = py - (py - this.ty) * ratio;
    this.scale = next;
    this.fitPending = false;
    this.applyTransform();
  }

  private onWheel(e: WheelEvent): void {
    if (this.controls.contains(e.target)) return;
    // Vue Liste : la molette fait defiler le cadre (comportement du navigateur) ; le zoom du navigateur est refuse.
    if (this.isList()) {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
      return;
    }
    // Le defilement du commentaire ou de la liste des etiquettes ne deplace pas la carte.
    if ((e.target as HTMLElement).closest(`.mmw-dialog`)) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      this.zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    } else {
      this.tx -= e.deltaX;
      this.ty -= e.deltaY;
      this.fitPending = false;
      this.applyTransform();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (this.controls.contains(target)) return;
    if (target.closest(`.mmw-rename, .mmw-dialog`)) return;
    if (target.closest(`.mmw-link-hint, .mmw-picker`)) return;
    this.controls.closePopup();
    this.abandonDrag();
    this.mapEl.focus();
    const linkMark = target.closest<HTMLElement>(`.mmw-link-mark, .mmw-int-mark`);
    if (linkMark && !this.linking) {
      e.preventDefault();
      const key = (linkMark.closest(`.mmw-node`) as HTMLElement).dataset.key!;
      const inner = linkMark.classList.contains(`mmw-int-mark`);
      const mine = this.links.filter((l) => l.from === key && (inner ? !l.external && !!l.to : l.external));
      if (inner) this.callbacks.onInternalLinks?.(mine, e);
      else this.callbacks.onLinkOpen?.(mine, e);
      return;
    }
    const webMark = target.closest<HTMLElement>(`.mmw-web-mark`);
    if (webMark && !this.linking) {
      e.preventDefault();
      const key = (webMark.closest(`.mmw-node`) as HTMLElement).dataset.key!;
      this.callbacks.onWebOpen?.(this.webByKey.get(key) ?? [], e);
      return;
    }
    const extBox = target.closest<HTMLElement>(`.mmw-ext-box`);
    if (extBox && !this.linking) {
      e.preventDefault();
      const link = this.links.find((l) => this.linkId(l) === extBox.dataset.ext);
      if (!link) return;
      // Le symbole ouvre la note ; le reste de la case la selectionne (et permet de la glisser).
      if (target.closest(`.mmw-ext-open`)) this.callbacks.onLinkOpen?.([link], e);
      else {
        this.selectLink(this.linkId(link));
        const box = this.extBoxes.find((b) => b.el === extBox);
        if (box) this.linkDrag = { link, box, sy: e.clientY, started: false, dy: 0 };
      }
      return;
    }
    const hit = target.closest(`[data-link]`);
    if (hit && !this.linking) {
      this.selectLink(hit.getAttribute(`data-link`));
      return;
    }
    if (this.linking) {
      e.preventDefault();
      this.onLinkPointerDown(e);
      return;
    }
    const eye = target.closest<HTMLElement>(`.mmw-eye`);
    if (eye) {
      e.preventDefault();
      this.callbacks.onToggleHidden?.(eye.dataset.eye!);
      return;
    }
    const fold = target.closest<HTMLElement>(`.mmw-fold, .mmw-lfold`);
    if (fold) {
      this.toggleFold(fold.dataset.fold!);
      return;
    }
    const node = target.closest<HTMLElement>(`.mmw-node`);
    if (node) {
      const key = node.dataset.key!;
      if (e.shiftKey) this.toggleSelect(key);
      else {
        {
          const box = node.getBoundingClientRect();
          this.nodeDrag = {
            key,
            pointerId: e.pointerId,
            sx: e.clientX,
            sy: e.clientY,
            started: false,
            grabX: e.clientX - box.left,
            grabY: e.clientY - box.top,
            ghost: null,
            keyOf: new Map(),
            targetId: ``,
            target: null,
            free: null,
          };
        }
        const now = Date.now();
        if (this.lastDown && this.lastDown.key === key && now - this.lastDown.time < 450) {
          this.dblKey = key;
          this.lastDown = null;
        } else {
          this.lastDown = { key, time: now };
          this.dblKey = null;
        }
        this.select(key);
      }
      return;
    }
    this.lastDown = null;
    if (e.shiftKey) {
      // Maj + glisser sur le fond : selection au rectangle.
      this.marquee = { sx: e.clientX, sy: e.clientY, moved: false };
    } else {
      this.drag = { sx: e.clientX, sy: e.clientY, tx0: this.tx, ty0: this.ty, moved: false };
      this.mapEl.classList.add(`mmw-panning`);
    }
    this.mapEl.setPointerCapture(e.pointerId);
  }

  // Glisser d'un lien vers le haut ou le bas pour changer son ordre parmi les liens de son titre.
  private moveLinkDrag(e: PointerEvent): void {
    const d = this.linkDrag!;
    const dy = e.clientY - d.sy;
    if (!d.started && Math.abs(dy) > 5) {
      d.started = true;
      d.box.el.classList.add(`mmw-ext-drag`);
    }
    if (!d.started) return;
    d.dy = dy / this.scale;
    d.box.el.style.transform = `translateY(${d.dy}px)`;
  }

  private endLinkDrag(): void {
    const d = this.linkDrag;
    this.linkDrag = null;
    if (!d || !d.started) return;
    d.box.el.classList.remove(`mmw-ext-drag`);
    d.box.el.style.transform = ``;
    const centre = d.box.y + d.box.h / 2 + d.dy;
    const others = this.extBoxes.filter((b) => b !== d.box && b.link.from === d.link.from);
    let target: (typeof others)[number] | null = null;
    for (const b of others) {
      if (!target || Math.abs(b.y + b.h / 2 - centre) < Math.abs(target.y + target.h / 2 - centre)) target = b;
    }
    if (target) this.moveLink(d.link, target.link);
  }

  private moveLink(link: MapLink, target: MapLink): void {
    this.pendingLink = this.linkId({ ...link, line: target.line });
    this.selectedLink = this.pendingLink;
    this.callbacks.onLinkMove?.(link, target.line);
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.linkDrag) {
      this.moveLinkDrag(e);
      return;
    }
    if (this.linking) {
      this.updateLinkPreview(e);
      return;
    }
    if (this.nodeDrag) {
      this.updateNodeDrag(e);
      return;
    }
    if (this.marquee) {
      this.updateMarquee(e);
      return;
    }
    if (!this.drag) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
    if (this.isList()) return;
    this.tx = this.drag.tx0 + dx;
    this.ty = this.drag.ty0 + dy;
    this.fitPending = false;
    this.applyTransform();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.linkDrag) {
      this.endLinkDrag();
      return;
    }
    if (this.linking) {
      this.onLinkPointerUp(e);
      return;
    }
    if (this.nodeDrag) {
      const { started } = this.nodeDrag;
      this.finishNodeDrag(false);
      if (started) return;
    }
    if (this.dblKey) {
      // Double clic : ouvre la fenetre du titre, apres le relachement pour que le focus donne par le navigateur ne la ferme pas.
      const key = this.dblKey;
      this.dblKey = null;
      window.setTimeout(() => this.openDialog(key), 0);
      return;
    }
    if (this.marquee) {
      this.marquee = null;
      this.marqueeEl.style.display = `none`;
      if (this.mapEl.hasPointerCapture(e.pointerId)) this.mapEl.releasePointerCapture(e.pointerId);
      return;
    }
    if (!this.drag) return;
    if (!this.drag.moved) {
      // Double clic sur le fond : nouveau sujet flottant a cet endroit (detection maison, comme pour les cases).
      const now = Date.now();
      const last = this.lastBg;
      if (last && now - last.time < 450 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 8) {
        this.lastBg = null;
        const rect = this.coordRect();
        const wx = (e.clientX - rect.left - this.tx) / this.scale;
        const wy = (e.clientY - rect.top - this.ty) / this.scale;
        this.callbacks.onEdit?.({ kind: `createFloat`, key: `r`, keys: [], ...(this.isList() ? {} : { x: wx, y: wy }) });
      } else {
        this.lastBg = { time: now, x: e.clientX, y: e.clientY };
        this.select(null);
      }
    }
    this.drag = null;
    this.mapEl.classList.remove(`mmw-panning`);
    if (this.mapEl.hasPointerCapture(e.pointerId)) this.mapEl.releasePointerCapture(e.pointerId);
  }

  // Dessine le rectangle de selection et selectionne les cases qu'il touche.
  private updateMarquee(e: PointerEvent): void {
    const m = this.marquee!;
    if (Math.abs(e.clientX - m.sx) + Math.abs(e.clientY - m.sy) > 4) m.moved = true;
    if (!m.moved) return;
    const rect = this.mapEl.getBoundingClientRect();
    const x1 = Math.min(m.sx, e.clientX) - rect.left;
    const y1 = Math.min(m.sy, e.clientY) - rect.top;
    const x2 = Math.max(m.sx, e.clientX) - rect.left;
    const y2 = Math.max(m.sy, e.clientY) - rect.top;
    const st = this.marqueeEl.style;
    st.display = `block`;
    st.left = `${x1}px`;
    st.top = `${y1}px`;
    st.width = `${x2 - x1}px`;
    st.height = `${y2 - y1}px`;
    const origin = this.coordRect();
    const ox = origin.left - rect.left;
    const oy = origin.top - rect.top;
    const hit = this.list.filter((n) => {
      const nx1 = n.x * this.scale + this.tx + ox;
      const ny1 = n.y * this.scale + this.ty + oy;
      return nx1 < x2 && nx1 + n.w * this.scale > x1 && ny1 < y2 && ny1 + n.h * this.scale > y1;
    });
    this.selectedKeys = new Set(hit.map((n) => n.key));
    this.selected = hit.length > 0 ? hit[0].key : null;
    this.selectionChanged();
  }

  // ---------------------------------------------------------------- clavier

  private onKey(e: KeyboardEvent): void {
    // Dans un champ de saisie (nom d'une etiquette, etc.), les touches appartiennent au champ.
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === `INPUT` || t.tagName === `TEXTAREA`)) return;
    // Une touche entre deux clics : ce n'est pas un double clic.
    this.lastDown = null;
    if (e.key === `Tab` && this.linking && this.picker?.isOpen()) {
      e.preventDefault();
      this.picker.focus();
      return;
    }
    if (e.key === `Escape` && this.linking) {
      e.preventDefault();
      this.stopLinking();
      return;
    }
    if ((e.key === `Delete` || e.key === `Backspace`) && this.selectedLink && !this.linking) {
      const link = this.links.find((l) => this.linkId(l) === this.selectedLink);
      e.preventDefault();
      this.selectLink(null);
      if (link) this.callbacks.onLinkDelete?.(link);
      return;
    }
    if (this.selectedLink && !this.linking && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === `ArrowUp` || e.key === `ArrowDown`)) {
      const link = this.links.find((l) => this.linkId(l) === this.selectedLink);
      e.preventDefault();
      if (!link) return;
      // Parmi les liens du meme titre et de meme sorte (vers une autre note, ou vers un titre de la note).
      const same = this.links.filter((l) => l.from === link.from && l.external === link.external);
      const neighbour = same[same.indexOf(link) + (e.key === `ArrowUp` ? -1 : 1)];
      if (neighbour) this.moveLink(link, neighbour);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === `a`) {
      e.preventDefault();
      this.selectAll();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && `cxvd`.includes(e.key.toLowerCase()) && e.key.length === 1) {
      // Copier, couper, coller et dupliquer. Coller vise la case selectionnee, ou la racine s'il n'y en a pas.
      const kinds: Record<string, MapEdit[`kind`]> = { c: `copy`, x: `cut`, v: `paste`, d: `duplicate` };
      const kind = kinds[e.key.toLowerCase()];
      const key = this.selected ?? (kind === `paste` ? `r` : null);
      if (key) {
        e.preventDefault();
        this.emitEdit(kind, key);
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === `Enter`) {
      if (this.selected) {
        e.preventDefault();
        this.callbacks.onEnter?.();
      }
      return;
    }
    if (e.key === `Escape` && this.nodeDrag?.started) {
      e.preventDefault();
      this.finishNodeDrag(true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.startsWith(`Arrow`)) {
      // Cmd ou Ctrl + Maj + fleche : deplacer la case avec sa branche.
      const dirs: Record<string, MoveDir> = { ArrowUp: `up`, ArrowDown: `down`, ArrowLeft: `left`, ArrowRight: `right` };
      if (this.selected && dirs[e.key]) {
        e.preventDefault();
        this.callbacks.onEdit?.({ kind: `move`, key: this.selected, keys: [this.selected], dir: dirs[e.key] });
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cur = this.selected ? this.list.find((n) => n.key === this.selected) ?? null : null;
    const go = (n: LNode | null): void => {
      if (n) this.select(n.key);
    };
    switch (e.key) {
      case `ArrowDown`:
        e.preventDefault();
        go(cur ? sequential(this.list, cur, `down`) : this.list[0] ?? null);
        break;
      case `ArrowUp`:
        e.preventDefault();
        if (cur) go(sequential(this.list, cur, `up`));
        break;
      case `ArrowLeft`:
        e.preventDefault();
        if (cur && cur.parent) go(cur.parent);
        break;
      case `ArrowRight`:
        e.preventDefault();
        if (!cur) go(this.list[0] ?? null);
        else if (cur.children.length > 0) go(cur.children[0]);
        else if (cur.collapsed) {
          this.collapsed.delete(cur.key);
          this.rebuild();
        }
        break;
      case `Enter`:
        if (cur) {
          e.preventDefault();
          this.emitEdit(`sibling`, cur.key);
        }
        break;
      case `Tab`:
        if (cur && !e.shiftKey) {
          e.preventDefault();
          this.emitEdit(`child`, cur.key);
        }
        break;
      case `F2`:
        if (cur) {
          e.preventDefault();
          this.openDialog(cur.key);
        }
        break;
      case `Delete`:
      case `Backspace`:
        if (cur) {
          e.preventDefault();
          this.emitEdit(`delete`, cur.key);
        }
        break;
      case ` `:
        e.preventDefault();
        if (cur && cur.hasChildren && cur.depth >= 1) this.toggleFold(cur.key);
        break;
      case `Escape`:
        if (this.controls.isOpen()) this.controls.closePopup();
        else this.select(null);
        break;
      case `+`:
      case `=`:
        e.preventDefault();
        this.zoomBy(1.2);
        break;
      case `-`:
        e.preventDefault();
        this.zoomBy(1 / 1.2);
        break;
      case `0`:
        e.preventDefault();
        this.fit();
        break;
      default:
        // Une lettre tapee sur une case selectionnee ouvre la saisie du titre avec cette lettre.
        if (cur && e.key.length === 1) {
          e.preventDefault();
          this.startRename(cur.key, e.key);
        }
    }
  }

  // ---------------------------------------------------------------- glisser une case

  private startNodeDrag(): void {
    const d = this.nodeDrag!;
    if (!this.doc) return;
    d.started = true;
    this.dblKey = null;
    this.lastDown = null;
    d.keyOf = new Map(flattenDoc(this.doc).map((x) => [x.node, x.key]));
    const src = this.els.get(d.key);
    if (src) {
      const ghost = src.cloneNode(true) as HTMLElement;
      ghost.classList.remove(`mmw-selected`);
      ghost.classList.add(`mmw-ghost`);
      ghost.style.left = ``;
      ghost.style.top = ``;
      ghost.style.visibility = ``;
      ghost.style.transformOrigin = `0 0`;
      ghost.style.transform = `scale(${this.scale})`;
      this.mapEl.appendChild(ghost);
      d.ghost = ghost;
    }
    this.mapEl.setPointerCapture(d.pointerId);
    this.mapEl.classList.add(`mmw-dragging`);
  }

  private updateNodeDrag(e: PointerEvent): void {
    const d = this.nodeDrag!;
    if (!d.started) {
      // La racine ne se deplace pas : seul le clic (saisie du titre) lui est utile.
      if (d.key === `r` || (isFloatKey(d.key) && !isFloatRoot(d.key)) || Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) <= NODE_DRAG_THRESHOLD) return;
      this.startNodeDrag();
      if (!d.started) return;
    }
    // Le fantome est pose dans la carte ; les coordonnees du monde partent du cadre.
    const host = this.mapEl.getBoundingClientRect();
    const rect = this.coordRect();
    const left = e.clientX - d.grabX;
    if (d.ghost) {
      d.ghost.style.left = `${left - host.left}px`;
      d.ghost.style.top = `${e.clientY - d.grabY - host.top}px`;
    }
    // Hors de la structure : depot libre. Pres d'elle : la case s'y integre a l'endroit montre.
    const wx = (e.clientX - rect.left - this.tx) / this.scale;
    const wy = (e.clientY - rect.top - this.ty) / this.scale;
    const outside = this.isList() ? wy > this.floatZoneY : this.mainBounds ? !(wx >= this.mainBounds.minX - 70 && wx <= this.mainBounds.maxX + 70 && wy >= this.mainBounds.minY - 50 && wy <= this.mainBounds.maxY + 50) : false;
    if (outside) {
      // Dans la zone flottante de la liste, un sujet flottant ne se deplace pas : il n'y a pas d'ordre a choisir.
      d.free = this.isList() ? (isFloatKey(d.key) ? null : { x: 0, y: 0 }) : { x: (left - rect.left - this.tx) / this.scale, y: (e.clientY - d.grabY - rect.top - this.ty) / this.scale };
      d.ghost?.classList.toggle(`mmw-ghost-float`, d.free !== null);
      d.ghost?.classList.toggle(`mmw-ghost-invalid`, d.free === null);
      if (d.targetId !== `free`) {
        d.targetId = `free`;
        this.showPreview(null);
      }
      return;
    }
    d.free = null;
    d.ghost?.classList.remove(`mmw-ghost-float`);
    const target = this.isList() ? this.dropTargetList(e.clientY, left, rect) : this.dropTarget(e.clientY, left, rect);
    const id = target ? `${target.parentKey}|${target.index}` : `none`;
    if (id === d.targetId) return;
    d.targetId = id;
    this.showPreview(target);
    d.ghost?.classList.toggle(`mmw-ghost-invalid`, d.target === null);
  }

  // Emplacement vise par la souris : la hauteur choisit l'intervalle entre deux cases, la position horizontale de la
  // case glissee choisit la profondeur (vers la droite : sous-titre de la case du dessus).
  private dropTarget(clientY: number, leftScreen: number, rect: DOMRect): MoveTarget | null {
    const d = this.nodeDrag!;
    if (!this.doc || !this.root) return null;
    const shown = this.previewDragKey ?? d.key;
    const rows = this.list.filter((n) => !isFloatKey(n.key) && n.key !== shown && !n.key.startsWith(`${shown}.`));
    if (rows.length === 0) return null;
    const wy = (clientY - rect.top - this.ty) / this.scale;
    let index = 0;
    rows.forEach((n, i) => {
      if (n.y + n.h / 2 <= wy) index = i;
    });
    const above = rows[index];
    const below = rows[index + 1];
    const minDepth = below ? below.depth : 1;
    const maxDepth = above.depth + 1;
    const indent = childIndent(this.getSettings().compactness);
    const wx = (leftScreen - rect.left - this.tx) / this.scale;
    let depth = maxDepth;
    let best = Infinity;
    for (let dd = minDepth; dd <= maxDepth; dd++) {
      let x = this.root.x;
      if (dd > 1) {
        let q = above;
        while (q.depth > dd - 1 && q.parent) q = q.parent;
        x = trunkX(q) + indent;
      }
      if (Math.abs(x - wx) < best) {
        best = Math.abs(x - wx);
        depth = dd;
      }
    }
    const realNode = this.previewOrigin ? this.previewOrigin.get(above.node) : above.node;
    const afterKey = realNode ? d.keyOf.get(realNode) : undefined;
    if (!afterKey) return null;
    return dropToParentIndex(this.doc, d.key, afterKey, depth, above.collapsed);
  }

  // Vue Liste : meme choix que pour la carte (la hauteur donne l'intervalle entre deux lignes, la position horizontale de
  // la ligne glissee donne le niveau), avec un trait pour montrer ou le titre sera depose.
  private dropTargetList(clientY: number, leftScreen: number, rect: DOMRect): MoveTarget | null {
    const d = this.nodeDrag!;
    this.dropLine = null;
    if (!this.doc || !this.root) return null;
    const rows = this.list.filter((n) => !isFloatKey(n.key) && n.key !== d.key && !n.key.startsWith(`${d.key}.`));
    if (rows.length === 0) return null;
    const wy = (clientY - rect.top - this.ty) / this.scale;
    let index = 0;
    rows.forEach((n, i) => {
      if (n.y + n.h / 2 <= wy) index = i;
    });
    const above = rows[index];
    const below = rows[index + 1];
    const minDepth = Math.min(below ? below.depth : 1, above.depth + 1);
    const maxDepth = above.depth + 1;
    const indent = listIndent(1);
    const wx = (leftScreen - rect.left - this.tx) / this.scale;
    let depth = maxDepth;
    let best = Infinity;
    for (let dd = minDepth; dd <= maxDepth; dd++) {
      if (Math.abs(dd * indent - wx) < best) {
        best = Math.abs(dd * indent - wx);
        depth = dd;
      }
    }
    const afterKey = d.keyOf.get(above.node);
    if (!afterKey) return null;
    const target = dropToParentIndex(this.doc, d.key, afterKey, depth, above.collapsed);
    if (target) this.dropLine = { x: depth * indent, y: above.y + above.h };
    return target;
  }

  // Trait de depot de la vue Liste (null : aucun).
  private showDropLine(): void {
    this.dropLineEl?.remove();
    this.dropLineEl = null;
    if (!this.dropLine) return;
    const el = document.createElement(`div`);
    el.className = `mmw-drop-line`;
    el.style.left = `${this.dropLine.x}px`;
    el.style.top = `${this.dropLine.y}px`;
    el.style.width = `${Math.max(40, this.listWidth - this.dropLine.x)}px`;
    this.worldEl.appendChild(el);
    this.dropLineEl = el;
  }

  // Affiche la carte telle qu'elle serait apres le deplacement (les autres cases s'ecartent), ou la carte normale.
  private showPreview(target: MoveTarget | null): void {
    const d = this.nodeDrag!;
    if (this.isList()) {
      d.target = target;
      this.showDropLine();
      return;
    }
    const moved = target && this.doc ? previewMove(this.doc, d.key, target.parentKey, target.index) : null;
    if (!target || !moved || !this.doc) {
      d.target = null;
      if (this.previewDoc) {
        this.clearPreviewState();
        this.rebuild();
      }
      return;
    }
    d.target = target;
    const realCollapsed = new Set<MmNode>();
    for (const k of this.collapsed) {
      const n = nodeByKey(this.doc, k);
      if (n) realCollapsed.add(n);
    }
    const keys = new Set<string>();
    for (const e of flattenDoc(moved.doc)) {
      const origin = moved.origin.get(e.node);
      if (origin && realCollapsed.has(origin)) keys.add(e.key);
    }
    // La branche qui recoit la case est depliee pour la montrer.
    const parts = moved.key.split(`.`);
    for (let i = 1; i < parts.length; i++) keys.delete(parts.slice(0, i).join(`.`));
    this.previewDoc = moved.doc;
    this.previewCollapsed = keys;
    this.previewOrigin = moved.origin;
    this.previewDragKey = moved.key;
    this.rebuild();
  }

  // Abandonne un glisser de case reste en suspens et retire tout fantome oublie dans la carte.
  private abandonDrag(): void {
    if (this.nodeDrag) this.finishNodeDrag(true);
    for (const ghost of Array.from(this.mapEl.querySelectorAll(`.mmw-ghost`))) ghost.remove();
    this.mapEl.classList.remove(`mmw-dragging`);
  }

  // Fin du glisser : depose la case a l'emplacement montre, ou annule.
  private finishNodeDrag(cancel: boolean): void {
    const d = this.nodeDrag;
    if (!d) return;
    this.nodeDrag = null;
    if (this.mapEl.hasPointerCapture(d.pointerId)) this.mapEl.releasePointerCapture(d.pointerId);
    d.ghost?.remove();
    this.mapEl.classList.remove(`mmw-dragging`);
    this.dropLine = null;
    this.dropLineEl?.remove();
    this.dropLineEl = null;
    if (!d.started) return;
    const target = cancel ? null : d.target;
    if (!cancel && d.free) {
      this.resetPreview();
      this.callbacks.onEdit?.({ kind: `float`, key: d.key, keys: [d.key], ...(this.isList() ? {} : d.free) });
    } else if (target && this.isList()) {
      this.callbacks.onEdit?.({ kind: `move`, key: d.key, keys: [d.key], parentKey: target.parentKey, index: target.index });
    } else if (target && this.previewDoc) {
      // L'apercu reste affiche jusqu'a ce que la note ait ete modifiee et la carte relue.
      if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
      this.settleTimer = window.setTimeout(() => this.resetPreview(), 2500);
      this.callbacks.onEdit?.({ kind: `move`, key: d.key, keys: [d.key], parentKey: target.parentKey, index: target.index });
    } else {
      this.resetPreview();
    }
  }

  private clearPreviewState(): void {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.previewDoc = null;
    this.previewCollapsed = null;
    this.previewOrigin = null;
    this.previewDragKey = null;
  }

  // Revient a la carte reelle (deplacement annule ou impossible).
  resetPreview(): void {
    const had = this.previewDoc !== null;
    this.clearPreviewState();
    if (had) this.rebuild();
  }

  // ---------------------------------------------------------------- modification depuis la carte

  // Ouvre le panneau d'apparence pour la selection (menu contextuel).
  openStylePanel(): void {
    this.controls.openStyle();
  }

  private emitEdit(kind: MapEdit[`kind`], key: string): void {
    const keys = this.getSelection();
    this.callbacks.onEdit?.({ kind, key, keys: keys.includes(key) ? keys : [key] });
  }

  // Ouvre la fenetre de modification du titre (double clic ou F2) : titre, titre court, commentaire et etiquettes.
  // Pour la racine, seul le nom de la note se modifie.
  openDialog(key: string): void {
    if (!this.doc) return;
    const n = this.list.find((x) => x.key === key);
    const el = this.els.get(key);
    if (!n || !el) return;
    this.commitRename(true, false);
    this.closeDialog(true);
    if (this.selected !== key) this.select(key);
    const box = el.getBoundingClientRect();
    const host = this.mapEl.getBoundingClientRect();
    const meta = n.node.meta;
    this.dialog = new NodeDialog(this.mapEl, {
      values: { title: n.node.title, short: meta?.short ?? ``, comment: meta?.comment ?? ``, tags: meta?.tags ?? [] },
      defs: this.getSettings().tags,
      isRoot: n.node.level === 0,
      anchor: { left: box.left - host.left, top: box.top - host.top, bottom: box.bottom - host.top },
      onCreateTag: (name) => {
        const tags = this.getSettings().tags;
        const def = makeTag(tags, name);
        this.callbacks.onChange?.({ tags: [...tags, def] });
        return def;
      },
      onSubmit: (values) => {
        this.dialog = null;
        this.mapEl.focus();
        const before = { title: n.node.title, short: meta?.short ?? ``, comment: meta?.comment ?? ``, tags: meta?.tags ?? [] };
        const same =
          values.title === before.title &&
          values.short.trim() === before.short &&
          values.comment.trim() === before.comment &&
          values.tags.join(`,`) === before.tags.join(`,`);
        if (!same) this.callbacks.onDetails?.(key, values);
      },
      onCancel: () => {
        this.dialog = null;
        this.mapEl.focus();
      },
    });
  }

  // Ferme la fenetre de modification (en validant ou en annulant).
  closeDialog(save: boolean): void {
    this.dialog?.close(save);
    this.dialog = null;
  }

  // Ouvre la saisie du titre sur la case. `initial` remplace le titre actuel (lettre tapee sur la case).
  startRename(key: string, initial?: string): void {
    if (!this.doc) return;
    const n = this.list.find((x) => x.key === key);
    if (!n) return;
    if (this.renaming && this.renaming.key === key) return;
    this.commitRename(true, false);
    if (this.selected !== key) this.select(key);
    const input = document.createElement(`input`);
    input.type = `text`;
    input.className = `mmw-rename`;
    input.spellcheck = false;
    input.value = initial ?? n.node.title;
    // La saisie se valide par Entree, Echap ou un clic ailleurs. Une perte de focus provoquee par
    // Obsidian (ouverture de la note, changement de volet) ne la ferme pas : le focus est redonne.
    const doc = this.mapEl.ownerDocument;
    const outside = (ev: Event): void => {
      if (!(ev.target as Element).closest(`.mmw-rename`)) this.commitRename(true, false);
    };
    doc.addEventListener(`pointerdown`, outside, true);
    this.renaming = { key, input, original: n.node.title, stop: () => doc.removeEventListener(`pointerdown`, outside, true) };
    input.addEventListener(`keydown`, (e) => {
      e.stopPropagation();
      if (e.key === `Enter`) {
        e.preventDefault();
        this.commitRename(true, true);
        // Cmd ou Ctrl + Entree : valide le titre puis passe dans la note.
        if (e.ctrlKey || e.metaKey) this.callbacks.onEnter?.();
      } else if (e.key === `Escape`) {
        e.preventDefault();
        this.commitRename(false, true);
      }
    });
    input.addEventListener(`input`, () => this.placeRename());
    input.addEventListener(`blur`, () => {
      if (this.suspendBlur) return;
      window.setTimeout(() => {
        if (this.renaming && this.renaming.input === input && input.isConnected) input.focus();
      }, 0);
    });
    this.worldEl.appendChild(input);
    this.placeRename();
    input.focus();
    if (initial === undefined) input.select();
  }

  // Place la saisie sur la case, avec la meme police, et l'elargit si le titre est long.
  private placeRename(): void {
    const r = this.renaming;
    if (!r) return;
    const n = this.list.find((x) => x.key === r.key);
    const el = this.els.get(r.key);
    if (!n || !el) return;
    const cs = getComputedStyle(el);
    const st = r.input.style;
    st.left = `${n.x}px`;
    st.top = `${n.y}px`;
    st.height = `${n.h}px`;
    st.minWidth = `${n.w}px`;
    st.width = `calc(${Math.max(4, r.input.value.length + 2)}ch + 24px)`;
    st.fontFamily = cs.fontFamily;
    st.fontSize = cs.fontSize;
    st.fontWeight = cs.fontWeight;
    st.textAlign = cs.textAlign;
    el.style.visibility = `hidden`;
  }

  // Termine la saisie : valide (Entree, clic ailleurs) ou annule (Echap).
  private commitRename(save: boolean, refocus: boolean): void {
    const r = this.renaming;
    if (!r) return;
    this.renaming = null;
    r.stop();
    const value = r.input.value;
    r.input.remove();
    const el = this.els.get(r.key);
    if (el) el.style.visibility = ``;
    if (refocus) this.mapEl.focus();
    if (save && value.trim() !== r.original) this.callbacks.onEdit?.({ kind: `rename`, key: r.key, keys: [r.key], title: value });
  }
}

function countDescendants(n: LNode): number {
  const walk = (m: MmNode): number => m.children.reduce((sum, c) => sum + 1 + walk(c), 0);
  return walk(n.node);
}

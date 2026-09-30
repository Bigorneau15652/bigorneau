// Affichage de la carte : cases, branches, zoom, deplacement, pliage et selection.
// N'utilise que le DOM standard, pour pouvoir etre verifie hors d'Obsidian.
import { computeStats, flattenDoc, MmDoc, MmNode, nodeByKey, pathTitles } from "./model";
import { dropToParentIndex, MoveDir, MoveTarget, previewMove } from "./edit";
import { buildLayoutTree, Bounds, computeLayout, flatten, LNode, sequential, trunkX } from "./layout";
import { framePath, trunkBranch, trunkLine, trunkRadius } from "./sketch";
import { MapControls } from "./controls";
import type { MmSettings } from "./settings";
import { describeScope, globalStyle, NodeStyle, resolveStyle, StylePatch } from "./style";

// Modification de la structure demandee depuis la carte ; la vue l'applique dans la note.
export interface MapEdit {
  kind: `child` | `sibling` | `rename` | `delete` | `move`;
  key: string;
  keys: string[];
  title?: string;
  // Deplacement : nouveau parent et rang (glisser), ou direction (fleches).
  parentKey?: string;
  index?: number;
  dir?: MoveDir;
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
  // Appele quand l'utilisateur change de noeud principal selectionne (null : plus aucun noeud).
  onSelect?: (key: string | null) => void;
  // Appele a chaque changement de la selection (une ou plusieurs cases).
  onSelectionChange?: (keys: string[]) => void;
  // Appele quand l'utilisateur appuie sur Entree avec un noeud selectionne.
  onEnter?: () => void;
  onEdit?: (edit: MapEdit) => void;
  onMessage?: (text: string) => void;
}

const SVG_NS = `http://www.w3.org/2000/svg`;
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
  } | null = null;
  private previewDoc: MmDoc | null = null;
  private previewCollapsed: Set<string> | null = null;
  private previewOrigin: Map<MmNode, MmNode> | null = null;
  private previewDragKey: string | null = null;
  private settleTimer: number | null = null;

  constructor(private container: HTMLElement, private getSettings: () => MmSettings, private callbacks: MapCallbacks) {
    this.mapEl = container;
    this.mapEl.classList.add(`mmw-map`);
    this.mapEl.tabIndex = 0;

    this.worldEl = document.createElement(`div`);
    this.worldEl.className = `mmw-world`;
    this.svgEl = document.createElementNS(SVG_NS, `svg`);
    this.svgEl.setAttribute(`class`, `mmw-svg`);
    this.messageEl = document.createElement(`div`);
    this.messageEl.className = `mmw-message`;
    this.marqueeEl = document.createElement(`div`);
    this.marqueeEl.className = `mmw-marquee`;
    this.marqueeEl.style.display = `none`;
    this.mapEl.append(this.worldEl, this.messageEl, this.marqueeEl);

    this.controls = new MapControls(this.mapEl, this.getSettings, {
      zoomIn: () => this.zoomBy(1.2),
      zoomOut: () => this.zoomBy(1 / 1.2),
      recenter: () => this.fit(),
      expandAll: () => this.expandAll(),
      collapseAll: () => this.collapseAll(),
      undo: () => this.callbacks.onUndo(),
      redo: () => this.callbacks.onRedo(),
      openSettings: () => this.callbacks.onOpenSettings(),
      change: (patch) => this.callbacks.onChange(patch),
      style: (patch, individual) => this.callbacks.onStyle(patch, individual),
      resetStyle: (individual) => this.callbacks.onResetStyle(individual),
      currentStyle: () => this.currentStyle(),
      scopeLabel: (individual) => this.scopeLabel(individual),
    });

    this.statusEl = document.createElement(`div`);
    this.statusEl.className = `mmw-status`;
    this.mapEl.appendChild(this.statusEl);

    this.on(this.mapEl, `pointerdown`, (e) => this.onPointerDown(e as PointerEvent));
    this.on(this.mapEl, `pointermove`, (e) => this.onPointerMove(e as PointerEvent));
    this.on(this.mapEl, `pointerup`, (e) => this.onPointerUp(e as PointerEvent));
    this.on(this.mapEl, `wheel`, (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(this.mapEl, `keydown`, (e) => this.onKey(e as KeyboardEvent));
    this.on(this.mapEl, `dblclick`, (e) => {
      const node = (e.target as HTMLElement).closest(`.mmw-node`) as HTMLElement | null;
      if (node) this.startRename(node.dataset.key!);
    });

    const ro = new ResizeObserver(() => {
      if (this.mapEl.clientWidth === 0) return;
      if (this.needsRebuild) this.rebuild();
      else if (this.fitPending) this.fit();
    });
    ro.observe(this.mapEl);
    this.cleanups.push(() => ro.disconnect());
  }

  destroy(): void {
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
    return resolveStyle(globalStyle(s), this.doc?.root.meta?.levels, level, n.node.meta?.style);
  }

  // Style montre par le panneau d'apparence : celui du noeud principal selectionne, sinon celui de la carte.
  private currentStyle(): NodeStyle {
    const s = this.getSettings();
    const n = this.selected ? this.list.find((x) => x.key === this.selected) : undefined;
    return n ? this.styleOf(n) : globalStyle(s);
  }

  private scopeLabel(individual: boolean): string {
    const keys = this.getSelection();
    if (!this.doc || keys.length === 0) return `toute la carte`;
    const flat = flattenDoc(this.doc);
    const byKey = new Map<string, MmNode>(flat.map((e) => [e.key, e.node]));
    const levels = keys.map((k) => (k === `r` ? 0 : byKey.get(k)?.level ?? 0));
    return describeScope(levels, keys.length, keys.length >= flat.length, individual);
  }

  // ---------------------------------------------------------------- construction

  rebuild(): void {
    const s = this.getSettings();
    this.mapEl.style.setProperty(`--mmw-max-w`, `${s.maxWidth}px`);
    this.mapEl.classList.toggle(`mmw-wrap`, s.longTitles === `wrap`);

    if (!this.doc) {
      this.worldEl.replaceChildren();
      this.root = null;
      this.list = [];
      this.messageEl.textContent = `Ouvrez une note du coffre pour afficher sa carte.`;
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
    this.els.clear();
    for (const n of this.list) {
      const el = this.createNodeEl(n, s);
      this.worldEl.appendChild(el);
      this.els.set(n.key, el);
    }
    for (const n of this.list) {
      const el = this.els.get(n.key)!;
      n.w = el.offsetWidth;
      n.h = el.offsetHeight;
    }
    this.bounds = computeLayout(this.root, s.compactness);
    for (const n of this.list) {
      const el = this.els.get(n.key)!;
      el.style.left = `${n.x}px`;
      el.style.top = `${n.y}px`;
      if (n.hasChildren && n.depth >= 1) this.worldEl.appendChild(this.createFold(n));
    }
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
    this.statusEl.textContent = `${stats.nodeCount} nœud${stats.nodeCount > 1 ? `s` : ``}. ${
      this.identical ? `Reconstruction de la note identique au fichier.` : `ATTENTION : reconstruction différente du fichier, ne rien modifier.`
    }`;
    this.statusEl.classList.toggle(`mmw-ko`, !this.identical);

    this.controls.refresh();
    if (this.fitPending) this.fit();
    else this.applyTransform();
  }

  private createNodeEl(n: LNode, s: MmSettings): HTMLElement {
    const el = document.createElement(`div`);
    el.className = `mmw-node mmw-depth-${Math.min(n.depth, 3)}`;
    el.dataset.key = n.key;
    const st = this.styleOf(n);
    el.style.setProperty(`--mmw-node-color`, st.strokeColor || `var(--text-normal)`);
    el.style.setProperty(`--mmw-node-font`, FONT_CSS[st.fontFamily] ?? `inherit`);
    el.style.setProperty(`--mmw-node-size`, `${BASE_EM[Math.min(n.depth, 2)] * st.fontScale}em`);
    el.style.setProperty(`--mmw-node-align`, st.textAlign);
    el.style.setProperty(`--mmw-pad`, String(padFactor(s.compactness, st.showFrames)));
    const title = n.node.title;
    const prefix = s.showPrefix && n.depth > 0 ? `${`#`.repeat(n.node.level)} ` : ``;
    if (title === `` && prefix === ``) {
      el.classList.add(`mmw-empty-title`);
      el.textContent = ` `;
    } else {
      el.textContent = prefix + title;
      el.title = prefix + title;
    }
    return el;
  }

  private createFold(n: LNode): HTMLElement {
    const el = document.createElement(`div`);
    el.className = `mmw-fold` + (n.collapsed ? ` mmw-fold-collapsed` : ``);
    el.dataset.fold = n.key;
    el.textContent = n.collapsed ? String(countDescendants(n)) : `−`;
    el.title = n.collapsed ? `Déplier la branche` : `Replier la branche`;
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
    const styles = new Map<string, NodeStyle>(this.list.map((n) => [n.key, this.styleOf(n)]));
    const styleOf = (n: LNode): NodeStyle => styles.get(n.key)!;

    for (const n of this.list) {
      const st = styleOf(n);
      if (!st.showFrames) continue;
      const shape = framePath(n.x, n.y, n.w, n.h, n.key, n.depth === 0, st.corners, st.roughness);
      const cls = `mmw-frame`;
      const css = strokeCss(st, n.depth === 0 ? 1.45 : 1) + `fill:${st.fillColor || `transparent`};`;
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
        trunkEnd = Math.max(trunkEnd, cy - trunkRadius(y0, cy, tx, c.x, cs.corners));
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

  private applyTransform(): void {
    this.worldEl.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`;
    this.controls.setZoom(this.scale);
  }

  fit(): void {
    if (!this.bounds || this.mapEl.clientWidth === 0) return;
    const b = this.bounds;
    const vw = this.mapEl.clientWidth;
    const vh = this.mapEl.clientHeight - 60;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    // La carte est etroite et haute : on ajuste la largeur, sans reduire la hauteur sous 50 %.
    const sc = Math.min(1, (vw - 80) / w, Math.max(0.5, (vh - 60) / h));
    this.scale = Math.max(MIN_SCALE, sc);
    this.tx = (vw - w * this.scale) / 2 - b.minX * this.scale;
    this.ty = Math.max(30, (vh - h * this.scale) / 2) - b.minY * this.scale;
    this.fitPending = false;
    this.applyTransform();
  }

  zoomBy(factor: number, cx?: number, cy?: number): void {
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
    if (target.closest(`.mmw-rename`)) return;
    this.controls.closePopup();
    this.mapEl.focus();
    const fold = target.closest(`.mmw-fold`) as HTMLElement | null;
    if (fold) {
      this.toggleFold(fold.dataset.fold!);
      return;
    }
    const node = target.closest(`.mmw-node`) as HTMLElement | null;
    if (node) {
      const key = node.dataset.key!;
      if (e.shiftKey) this.toggleSelect(key);
      else {
        if (key !== `r`) {
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

  private onPointerMove(e: PointerEvent): void {
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
    this.tx = this.drag.tx0 + dx;
    this.ty = this.drag.ty0 + dy;
    this.fitPending = false;
    this.applyTransform();
  }

  private onPointerUp(e: PointerEvent): void {
    if (this.nodeDrag) {
      const started = this.nodeDrag.started;
      this.finishNodeDrag(false);
      if (started) return;
    }
    if (this.dblKey) {
      // Apres le relachement, pour que le focus donne par le navigateur ne retire pas la saisie.
      const key = this.dblKey;
      this.dblKey = null;
      window.setTimeout(() => this.startRename(key), 0);
      return;
    }
    if (this.marquee) {
      this.marquee = null;
      this.marqueeEl.style.display = `none`;
      if (this.mapEl.hasPointerCapture(e.pointerId)) this.mapEl.releasePointerCapture(e.pointerId);
      return;
    }
    if (!this.drag) return;
    if (!this.drag.moved) this.select(null);
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
    const hit = this.list.filter((n) => {
      const nx1 = n.x * this.scale + this.tx;
      const ny1 = n.y * this.scale + this.ty;
      return nx1 < x2 && nx1 + n.w * this.scale > x1 && ny1 < y2 && ny1 + n.h * this.scale > y1;
    });
    this.selectedKeys = new Set(hit.map((n) => n.key));
    this.selected = hit.length > 0 ? hit[0].key : null;
    this.selectionChanged();
  }

  // ---------------------------------------------------------------- clavier

  private onKey(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === `a`) {
      e.preventDefault();
      this.selectAll();
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
          this.startRename(cur.key);
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
      if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) <= 5) return;
      this.startNodeDrag();
      if (!d.started) return;
    }
    const rect = this.mapEl.getBoundingClientRect();
    const left = e.clientX - d.grabX;
    if (d.ghost) {
      d.ghost.style.left = `${left - rect.left}px`;
      d.ghost.style.top = `${e.clientY - d.grabY - rect.top}px`;
    }
    const target = this.dropTarget(e.clientY, left, rect);
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
    const rows = this.list.filter((n) => n.key !== shown && !n.key.startsWith(`${shown}.`));
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
    const indent = 36 * this.getSettings().compactness;
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

  // Affiche la carte telle qu'elle serait apres le deplacement (les autres cases s'ecartent), ou la carte normale.
  private showPreview(target: MoveTarget | null): void {
    const d = this.nodeDrag!;
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

  // Fin du glisser : depose la case a l'emplacement montre, ou annule.
  private finishNodeDrag(cancel: boolean): void {
    const d = this.nodeDrag;
    if (!d) return;
    this.nodeDrag = null;
    if (this.mapEl.hasPointerCapture(d.pointerId)) this.mapEl.releasePointerCapture(d.pointerId);
    d.ghost?.remove();
    this.mapEl.classList.remove(`mmw-dragging`);
    if (!d.started) return;
    const target = cancel ? null : d.target;
    if (target && this.previewDoc) {
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

  private emitEdit(kind: MapEdit[`kind`], key: string): void {
    const keys = this.getSelection();
    this.callbacks.onEdit?.({ kind, key, keys: keys.includes(key) ? keys : [key] });
  }

  // Ouvre la saisie du titre sur la case. `initial` remplace le titre actuel (lettre tapee sur la case).
  startRename(key: string, initial?: string): void {
    if (!this.doc) return;
    const n = this.list.find((x) => x.key === key);
    if (!n) return;
    if (n.node.level === 0) {
      this.callbacks.onMessage?.(`Le titre de la racine est le nom du fichier : renommez la note pour le changer.`);
      return;
    }
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

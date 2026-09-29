// Affichage de la carte : cases, branches, zoom, deplacement, pliage et selection.
// N'utilise que le DOM standard, pour pouvoir etre verifie hors d'Obsidian.
import { computeStats, MmDoc } from "./model";
import { buildLayoutTree, Bounds, computeLayout, flatten, LNode, sequential, trunkX } from "./layout";
import { framePath, trunkBranch, trunkLine, trunkRadius } from "./sketch";
import type { MmSettings } from "./settings";

export interface MapCallbacks {
  onCompactChange: (v: number) => void;
  // Appele quand l'utilisateur change de noeud selectionne (null : plus aucun noeud).
  onSelect?: (key: string | null) => void;
  // Appele quand l'utilisateur appuie sur Entree avec un noeud selectionne.
  onEnter?: () => void;
}

const SVG_NS = `http://www.w3.org/2000/svg`;
const MIN_SCALE = 0.15;
const MAX_SCALE = 3;

export class MapRenderer {
  private mapEl: HTMLElement;
  private worldEl: HTMLElement;
  private svgEl: SVGSVGElement;
  private messageEl: HTMLElement;
  private statusEl: HTMLElement;
  private zoomLabel: HTMLElement;
  private slider: HTMLInputElement;

  private doc: MmDoc | null = null;
  private identical = true;
  private fileKey = ``;
  private collapsed = new Set<string>();
  private selected: string | null = null;
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
  private cleanups: (() => void)[] = [];

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
    this.mapEl.append(this.worldEl, this.messageEl);

    const bar = document.createElement(`div`);
    bar.className = `mmw-toolbar`;
    const button = (label: string, title: string, fn: () => void): HTMLButtonElement => {
      const b = document.createElement(`button`);
      b.textContent = label;
      b.title = title;
      b.setAttribute(`aria-label`, title);
      b.addEventListener(`click`, fn);
      bar.appendChild(b);
      return b;
    };
    button(`−`, `Dézoomer`, () => this.zoomBy(1 / 1.2));
    this.zoomLabel = document.createElement(`span`);
    this.zoomLabel.className = `mmw-zoom-label`;
    bar.appendChild(this.zoomLabel);
    button(`+`, `Zoomer`, () => this.zoomBy(1.2));
    button(`Recentrer`, `Recentrer la carte`, () => this.fit());
    button(`Replier`, `Replier toutes les branches`, () => this.collapseAll());
    button(`Déplier`, `Déplier toutes les branches`, () => this.expandAll());
    const compactLabel = document.createElement(`span`);
    compactLabel.textContent = `Compacité`;
    compactLabel.className = `mmw-compact-label`;
    bar.appendChild(compactLabel);
    this.slider = document.createElement(`input`);
    this.slider.type = `range`;
    this.slider.min = `0.5`;
    this.slider.max = `1.6`;
    this.slider.step = `0.05`;
    this.slider.title = `Compacité de l'affichage`;
    this.slider.addEventListener(`input`, () => {
      this.callbacks.onCompactChange(Number(this.slider.value));
      this.rebuild();
    });
    bar.appendChild(this.slider);
    this.mapEl.appendChild(bar);

    this.statusEl = document.createElement(`div`);
    this.statusEl.className = `mmw-status`;
    this.mapEl.appendChild(this.statusEl);

    this.on(this.mapEl, `pointerdown`, (e) => this.onPointerDown(e as PointerEvent));
    this.on(this.mapEl, `pointermove`, (e) => this.onPointerMove(e as PointerEvent));
    this.on(this.mapEl, `pointerup`, (e) => this.onPointerUp(e as PointerEvent));
    this.on(this.mapEl, `wheel`, (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.on(this.mapEl, `keydown`, (e) => this.onKey(e as KeyboardEvent));

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
    this.mapEl.replaceChildren();
    this.mapEl.classList.remove(`mmw-map`);
  }

  private on(target: HTMLElement, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.cleanups.push(() => target.removeEventListener(type, fn, opts));
  }

  setDoc(doc: MmDoc | null, fileKey: string, identical: boolean): void {
    if (fileKey !== this.fileKey) {
      this.collapsed.clear();
      this.selected = null;
      this.fitPending = true;
      this.fileKey = fileKey;
    }
    this.doc = doc;
    this.identical = identical;
    this.rebuild();
  }

  // ---------------------------------------------------------------- construction

  rebuild(): void {
    const s = this.getSettings();
    this.slider.value = String(s.compactness);
    this.mapEl.style.setProperty(`--mmw-max-w`, `${s.maxWidth}px`);
    this.mapEl.classList.toggle(`mmw-wrap`, s.longTitles === `wrap`);

    if (!this.doc) {
      this.worldEl.replaceChildren();
      this.root = null;
      this.list = [];
      this.messageEl.textContent = `Ouvrez une note du coffre pour afficher sa carte.`;
      this.messageEl.style.display = `block`;
      this.statusEl.textContent = ``;
      return;
    }
    this.messageEl.style.display = `none`;
    if (this.mapEl.clientWidth === 0) {
      this.needsRebuild = true;
      return;
    }
    this.needsRebuild = false;

    this.worldEl.replaceChildren(this.svgEl);
    this.root = buildLayoutTree(this.doc.root, `r`, 0, this.collapsed);
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

    if (this.selected && !this.els.has(this.selected)) this.selected = null;
    if (this.selected) this.els.get(this.selected)!.classList.add(`mmw-selected`);

    const stats = computeStats(this.doc);
    this.statusEl.textContent = `${stats.nodeCount} nœud${stats.nodeCount > 1 ? `s` : ``}. ${
      this.identical ? `Reconstruction de la note identique au fichier.` : `ATTENTION : reconstruction différente du fichier, ne rien modifier.`
    }`;
    this.statusEl.classList.toggle(`mmw-ko`, !this.identical);

    if (this.fitPending) this.fit();
    else this.applyTransform();
  }

  private createNodeEl(n: LNode, s: MmSettings): HTMLElement {
    const el = document.createElement(`div`);
    el.className = `mmw-node mmw-depth-${Math.min(n.depth, 3)}`;
    el.dataset.key = n.key;
    const title = n.node.title;
    const prefix = s.showPrefix && n.depth > 0 ? `${`#`.repeat(n.node.level)} ` : ``;
    if (title === `` && prefix === ``) {
      el.classList.add(`mmw-empty-title`);
      el.textContent = ` `;
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

  private path(d: string, cls: string): void {
    const p = document.createElementNS(SVG_NS, `path`);
    p.setAttribute(`d`, d);
    p.setAttribute(`class`, cls);
    this.svgEl.appendChild(p);
  }

  private draw(s: MmSettings): void {
    this.svgEl.replaceChildren();
    if (!this.root) return;
    for (const n of this.list) {
      const shape = framePath(s.frameStyle, n.x, n.y, n.w, n.h, n.key, n.depth === 0);
      const cls = n.depth === 0 ? `mmw-frame mmw-frame-root` : `mmw-frame`;
      if (shape && shape.kind === `path`) this.path(shape.d, cls);
      else if (shape && shape.kind === `rect`) {
        const r = document.createElementNS(SVG_NS, `rect`);
        r.setAttribute(`x`, String(n.x));
        r.setAttribute(`y`, String(n.y));
        r.setAttribute(`width`, String(n.w));
        r.setAttribute(`height`, String(n.h));
        r.setAttribute(`rx`, String(shape.rx));
        r.setAttribute(`class`, cls);
        this.svgEl.appendChild(r);
      }
    }
    const root = this.root;
    const chain = (x: number, y1: number, y2: number, seed: string): void => {
      if (y2 - y1 < 1) return;
      this.path(trunkLine(s.branchStyle, x, y1, y2, seed) ?? `M ${x} ${y1} L ${x} ${y2}`, `mmw-line`);
    };
    // Lien entre la racine et le premier noeud de premier niveau.
    if (root.children.length > 0) {
      const first = root.children[0];
      chain(trunkX(first), root.y + root.h, first.y, `root>${first.key}`);
    }
    for (const n of this.list) {
      if (n.depth === 0) continue;
      const y0 = n.y + n.h;
      const tx = trunkX(n);
      let trunkEnd = y0;
      for (const c of n.children) {
        const cy = c.y + c.h / 2;
        trunkEnd = Math.max(trunkEnd, cy - trunkRadius(y0, cy, tx, c.x));
        this.path(trunkBranch(s.branchStyle, tx, y0, c.x, cy, `${n.key}>${c.key}`), `mmw-line`);
      }
      // Les noeuds de premier niveau sont relies entre eux par la meme ligne verticale.
      if (n.depth === 1 && n.parent) {
        const siblings = n.parent.children;
        const next = siblings[siblings.indexOf(n) + 1];
        if (next) trunkEnd = Math.max(trunkEnd, next.y);
      }
      chain(tx, y0, trunkEnd, `trunk${n.key}`);
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
    const walk = (node: MmDoc[`root`], key: string, depth: number): void => {
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

  // notify : faux quand la selection est modifiee par le programme et non par l'utilisateur.
  select(key: string | null, notify = true): void {
    const previous = this.selected;
    if (previous) this.els.get(previous)?.classList.remove(`mmw-selected`);
    this.selected = key && this.els.has(key) ? key : null;
    if (this.selected) {
      this.els.get(this.selected)!.classList.add(`mmw-selected`);
      const n = this.list.find((x) => x.key === this.selected);
      if (n) this.ensureVisible(n);
    }
    if (notify && this.selected !== previous) this.callbacks.onSelect?.(this.selected);
  }

  getSelectedKey(): string | null {
    return this.selected;
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
    this.zoomLabel.textContent = `${Math.round(this.scale * 100)} %`;
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
    if (target.closest(`.mmw-toolbar`)) return;
    this.mapEl.focus();
    const fold = target.closest(`.mmw-fold`) as HTMLElement | null;
    if (fold) {
      this.toggleFold(fold.dataset.fold!);
      return;
    }
    const node = target.closest(`.mmw-node`) as HTMLElement | null;
    if (node) {
      this.select(node.dataset.key!);
      return;
    }
    this.drag = { sx: e.clientX, sy: e.clientY, tx0: this.tx, ty0: this.ty, moved: false };
    this.mapEl.setPointerCapture(e.pointerId);
    this.mapEl.classList.add(`mmw-panning`);
  }

  private onPointerMove(e: PointerEvent): void {
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
    if (!this.drag) return;
    if (!this.drag.moved) this.select(null);
    this.drag = null;
    this.mapEl.classList.remove(`mmw-panning`);
    if (this.mapEl.hasPointerCapture(e.pointerId)) this.mapEl.releasePointerCapture(e.pointerId);
  }

  // ---------------------------------------------------------------- clavier

  private onKey(e: KeyboardEvent): void {
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
          this.callbacks.onEnter?.();
        }
        break;
      case ` `:
        e.preventDefault();
        if (cur && cur.hasChildren && cur.depth >= 1) this.toggleFold(cur.key);
        break;
      case `Escape`:
        this.select(null);
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
    }
  }
}

function countDescendants(n: LNode): number {
  const walk = (m: MmDoc[`root`]): number => m.children.reduce((sum, c) => sum + 1 + walk(c), 0);
  return walk(n.node);
}

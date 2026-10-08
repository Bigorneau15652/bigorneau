// Legende des figures dans l'apercu en direct d'Obsidian : sous une image ou un dessin dont le lien porte un nom (![[dessin.excalidraw|Nom]]),
// la legende « Figure 3 : Nom » est affichee, comme a l'export. Obsidian dessine ces figures lui-meme (et le plugin Excalidraw les
// siennes) : l'extension les reconnait dans le DOM de l'editeur, retrouve leur ligne dans la note et y ajoute la legende. Elle ne fait
// rien quand elle ne trouve pas de figure. Utilise uniquement CodeMirror.
import { Extension, RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { record } from "./diagnostics";
import { figureLines, tableCaptionLines } from "./figure-insert";

const CAPTION_CLASS = `mmw-figure-caption`;
// Delai avant le passage qui cherche les figures dans l'editeur.
const SCAN_DELAY_MS = 120;
// Element qui contient la figure et sa legende : mis en colonne pour que la legende ne soit jamais cachee par le dessin.
const HOST_CLASS = `mmw-figure-host`;

class FigureCaptions {
  private scheduled = false;
  private observer: MutationObserver;

  constructor(private view: EditorView) {
    this.observer = new MutationObserver((records) => {
      // Les changements faits par l'extension elle-meme ne relancent rien.
      if (records.every((r) => Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).every((n) => n instanceof HTMLElement && n.classList.contains(CAPTION_CLASS)))) return;
      this.schedule();
    });
    this.observer.observe(view.contentDOM, { childList: true, subtree: true });
    this.schedule();
  }

  update(u: ViewUpdate): void {
    if (u.docChanged || u.viewportChanged) this.schedule();
  }

  destroy(): void {
    this.observer.disconnect();
    this.view.contentDOM.querySelectorAll(`.${CAPTION_CLASS}`).forEach((e) => {
      e.parentElement?.classList.remove(HOST_CLASS);
      e.remove();
    });
  }

  // Un seul passage pour une rafale de changements (un dessin Excalidraw qui s'affiche en provoque beaucoup).
  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    window.setTimeout(() => {
      this.scheduled = false;
      this.scan();
    }, SCAN_DELAY_MS);
  }

  // Figures de la note : recalculees seulement quand le texte a change.
  private doc: unknown = null;
  private byLine = new Map<number, ReturnType<typeof figureLines>[number]>();

  private figuresByLine(): Map<number, ReturnType<typeof figureLines>[number]> {
    const doc = this.view.state.doc;
    if (doc !== this.doc) {
      this.doc = doc;
      const text = doc.toString();
      this.byLine = new Map((text.includes(`![`) ? figureLines(text) : []).map((f) => [f.line, f]));
    }
    return this.byLine;
  }

  private scan(): void {
    const started = performance.now();
    this.scanNow();
    record(`Éditeur : repérage des légendes de figures`, performance.now() - started);
  }

  private scanNow(): void {
    const dom = this.view.contentDOM;
    // Rien a faire (et rien a lire dans la note) quand l'editeur n'affiche ni figure ni legende.
    if (!dom.querySelector(`.internal-embed, .image-embed, .excalidraw-embed, .${CAPTION_CLASS}`)) return;
    const byLine = this.figuresByLine();
    // Elements qui contiennent une figure dessinee (image integree ou dessin), un par ligne de la note.
    const hosts = new Map<number, HTMLElement>();
    dom.querySelectorAll<HTMLElement>(`.internal-embed, .image-embed, .excalidraw-embed`).forEach((embed) => {
      const host = embed.closest<HTMLElement>(`.cm-embed-block`) ?? embed;
      if (host.classList.contains(CAPTION_CLASS) || host.closest(`.${CAPTION_CLASS}`)) return;
      let line: number;
      try {
        line = this.view.state.doc.lineAt(this.view.posAtDOM(host)).number - 1;
      } catch {
        return;
      }
      // La figure peut s'afficher sur la ligne du lien ou juste apres : on cherche la ligne de figure la plus proche en amont.
      for (const l of [line, line - 1]) {
        if (byLine.has(l) && !hosts.has(l)) {
          hosts.set(l, host);
          break;
        }
      }
    });
    // Retire les legendes qui ne correspondent plus a une figure nommee, puis ajoute ou met a jour les autres.
    dom.querySelectorAll<HTMLElement>(`.${CAPTION_CLASS}`).forEach((cap) => {
      const owner = cap.parentElement;
      const stillThere = owner !== null && Array.from(hosts.values()).includes(owner);
      if (!stillThere) {
        owner?.classList.remove(HOST_CLASS);
        cap.remove();
      }
    });
    for (const [line, host] of hosts) {
      const fig = byLine.get(line);
      if (!fig) continue;
      let cap = host.querySelector<HTMLElement>(`:scope > .${CAPTION_CLASS}`);
      if (!cap) {
        cap = document.createElement(`div`);
        cap.className = CAPTION_CLASS;
        host.appendChild(cap);
        host.classList.add(HOST_CLASS);
      }
      const want = fig.text;
      if (cap.dataset.text !== want) {
        cap.dataset.text = want;
        cap.textContent = ``;
        const strong = document.createElement(`strong`);
        strong.textContent = fig.label;
        cap.append(strong, document.createTextNode(want.slice(fig.label.length)));
      }
    }
  }
}

export function figureCaptionExtension(): Extension {
  return ViewPlugin.fromClass(FigureCaptions);
}

// Numero d'un tableau nomme : « Tableau : Nom » s'affiche « Tableau 1 : Nom », sans toucher au texte de la note. Le numero est celui de
// l'export ; un tableau sans nom n'en a pas.
class NumberWidget extends WidgetType {
  constructor(private n: number) {
    super();
  }
  eq(other: NumberWidget): boolean {
    return other.n === this.n;
  }
  toDOM(): HTMLElement {
    const el = document.createElement(`span`);
    el.className = `mmw-table-number`;
    el.textContent = ` ${this.n}`;
    return el;
  }
}

function tableNumbers(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const text = doc.toString();
  if (!/^(Tableau|Table)/im.test(text)) return builder.finish();
  for (const cap of tableCaptionLines(text)) {
    const line = doc.line(cap.line + 1);
    builder.add(line.from + cap.wordEnd, line.from + cap.wordEnd, Decoration.widget({ widget: new NumberWidget(cap.number), side: 1 }));
  }
  return builder.finish();
}

export function tableNumberExtension(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = tableNumbers(view);
      }
      update(u: ViewUpdate): void {
        if (u.docChanged) this.decorations = tableNumbers(u.view);
      }
    },
    { decorations: (v) => v.decorations }
  );
}

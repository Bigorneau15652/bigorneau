// Legende des figures dans l'apercu en direct d'Obsidian : sous une image ou un dessin dont le lien porte un nom (![[dessin.excalidraw|Nom]]),
// la legende « Figure 3 : Nom » est affichee, comme a l'export. Obsidian dessine ces figures lui-meme (et le plugin Excalidraw les
// siennes) : l'extension les reconnait dans le DOM de l'editeur, retrouve leur ligne dans la note et y ajoute la legende. Elle ne fait
// rien quand elle ne trouve pas de figure. Utilise uniquement CodeMirror.
import { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import { figureLines } from "./figure-insert";

const CAPTION_CLASS = `mmw-figure-caption`;

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
    this.view.contentDOM.querySelectorAll(`.${CAPTION_CLASS}`).forEach((e) => e.remove());
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    window.requestAnimationFrame(() => {
      this.scheduled = false;
      this.scan();
    });
  }

  private scan(): void {
    const dom = this.view.contentDOM;
    const text = this.view.state.doc.toString();
    const figures = text.includes(`![`) ? figureLines(text) : [];
    const byLine = new Map(figures.map((f) => [f.line, f]));
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
      if (!stillThere) cap.remove();
    });
    for (const [line, host] of hosts) {
      const fig = byLine.get(line);
      if (!fig) continue;
      let cap = host.querySelector<HTMLElement>(`:scope > .${CAPTION_CLASS}`);
      if (!cap) {
        cap = document.createElement(`div`);
        cap.className = CAPTION_CLASS;
        host.appendChild(cap);
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

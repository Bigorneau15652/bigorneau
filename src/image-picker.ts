// Choix d'une image ou d'un dessin parmi tous ceux du coffre : recherche par nom, vignettes. Un dessin Excalidraw est montre par son
// export image (.excalidraw.svg ou .excalidraw.png), que le plugin Excalidraw ecrit a cote du dessin quand son export automatique est actif.
import { App, Modal, TFile } from "obsidian";
import { imageCandidates } from "./export/image";
import { t } from "./i18n";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif|jfif)$/i;

const IMAGE_LIMIT = 60;

// Fichier du coffre designe par la cible d'une image de zone ; un dessin Excalidraw est lu par son export image.
export function imageFile(app: App, target: string): TFile | null {
  for (const name of imageCandidates(target)) {
    const f = app.metadataCache.getFirstLinkpathDest(name, ``);
    if (f) return f;
  }
  return null;
}

// Choix d'une image ou d'un dessin parmi tous ceux du coffre : recherche par nom, vignettes.
export class ImagePicker extends Modal {
  constructor(app: App, private onPick: (target: string) => void, private title = t(`Choisir une image ou un dessin`)) {
    super(app);
  }

  private items(): { target: string; file: TFile }[] {
    const out: { target: string; file: TFile }[] = [];
    for (const f of this.app.vault.getFiles()) {
      if (/\.excalidraw\.(svg|png)$/i.test(f.name)) continue;
      if (IMAGE_EXT.test(f.name)) out.push({ target: f.name, file: f });
      else if (/\.excalidraw\.md$/i.test(f.name)) {
        const target = f.name.replace(/\.md$/i, ``);
        const rendered = imageFile(this.app, target);
        if (rendered) out.push({ target, file: rendered });
      }
    }
    return out.sort((a, b) => a.target.localeCompare(b.target));
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.modalEl.addClass(`mmw-pmodal`);
    const { contentEl } = this;
    contentEl.empty();
    const all = this.items();
    const search = contentEl.createEl(`input`, { type: `text`, cls: `mmw-ipick-search` });
    search.placeholder = t(`Rechercher dans le coffre`);
    const info = contentEl.createDiv({ cls: `mmw-pnote` });
    const grid = contentEl.createDiv({ cls: `mmw-ipick-grid` });
    const paint = (): void => {
      grid.empty();
      const q = search.value.trim().toLowerCase();
      const found = all.filter((i) => q === `` || i.target.toLowerCase().includes(q));
      info.setText(found.length > IMAGE_LIMIT ? `${found.length} / ${all.length} : ${t(`affinez la recherche pour voir les autres.`)}` : `${found.length} / ${all.length}`);
      for (const item of found.slice(0, IMAGE_LIMIT)) {
        const card = grid.createEl(`button`, { cls: `mmw-ipick-card` });
        card.type = `button`;
        const img = card.createEl(`img`);
        img.src = this.app.vault.getResourcePath(item.file);
        img.loading = `lazy`;
        card.createDiv({ cls: `mmw-ipick-name`, text: item.target });
        card.addEventListener(`click`, () => {
          this.close();
          this.onPick(item.target);
        });
      }
    };
    search.addEventListener(`input`, paint);
    paint();
    search.focus();
  }
}

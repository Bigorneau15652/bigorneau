// Choix d'une image ou d'un dessin parmi tous ceux du coffre : recherche par nom, vignettes. Un dessin Excalidraw est montre par son
// export image (.excalidraw.svg ou .excalidraw.png), que le plugin Excalidraw ecrit a cote du dessin quand son export automatique est actif.
import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { pastedImageName } from "./figure-insert";
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

// Parties non documentees de l'application utilisees ici (dossier des pieces jointes) ; chaque appel est protege.
interface AttachmentApi {
  fileManager?: { getAvailablePathForAttachments?: (name: string, extension: string, file: TFile | null) => Promise<string> };
}

// Enregistre l'image du presse-papiers dans le coffre, dans le dossier des pieces jointes d'Obsidian et sous le meme nom qu'un
// collage (« Pasted image date »). Renvoie le fichier cree, ou null s'il n'y a pas d'image a coller.
export async function savePastedImage(app: App): Promise<TFile | null> {
  let blob: Blob | null = null;
  let type = ``;
  try {
    for (const item of await navigator.clipboard.read()) {
      const found = item.types.find((x) => x.startsWith(`image/`));
      if (found) {
        blob = await item.getType(found);
        type = found;
        break;
      }
    }
  } catch {
    return null;
  }
  if (!blob) return null;
  const extension = type === `image/jpeg` ? `jpg` : type === `image/svg+xml` ? `svg` : type.slice(6).replace(/[^a-z0-9]/gi, ``) || `png`;
  const name = pastedImageName(new Date());
  const note = app.workspace.getActiveFile();
  const manager = (app as unknown as AttachmentApi).fileManager;
  let path: string;
  if (manager?.getAvailablePathForAttachments) path = await manager.getAvailablePathForAttachments(name, extension, note);
  else {
    // Without that function, the picture goes next to the note, under the first name that is free.
    const folder = note?.parent?.path && note.parent.path !== `/` ? `${note.parent.path}/` : ``;
    path = `${folder}${name}.${extension}`;
    for (let n = 1; app.vault.getAbstractFileByPath(path); n++) path = `${folder}${name} ${n}.${extension}`;
  }
  return app.vault.createBinary(path, await blob.arrayBuffer());
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
    new Setting(contentEl)
      .setName(t(`Image du presse-papiers`))
      .setDesc(t(`Une capture d'écran ou une image copiée est enregistrée dans le dossier des pièces jointes d'Obsidian, puis insérée.`))
      .addButton((b) =>
        b.setButtonText(t(`Coller l'image`)).onClick(async () => {
          const file = await savePastedImage(this.app);
          if (!file) {
            new Notice(t(`Le presse-papiers ne contient pas d'image.`));
            return;
          }
          this.close();
          this.onPick(file.name);
        })
      );
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

// Fenetre des reglages de page d'une note : en-tete, pied de page et numerotation, chacun sur son onglet. Chaque modification est
// ecrite tout de suite dans la note (ligne de commentaire sous les proprietes). Les zones sont des textes avec un balisage simple,
// montre dans la ligne de formule : **gras**, *italique*, {xs} {s} {m} {l}, {page}, ![[image.png|hauteur]].
import { App, Modal, Setting, TFile } from "obsidian";
import { t } from "./i18n";
import { Band, defaultConfig, IMAGE_MAX_HEIGHT_PX, IMAGE_MAX_WIDTH_PX, NumberAlign, NumberPlace, NumberShape, PageConfig, parseZone, SIZE_CODES, SizeCode, VARIABLES, ZONE_MAX_LINES, Zones } from "./page-config";

export type PageTab = `header` | `footer` | `numbering`;

export interface PageModalHost {
  // Reglages actuels de la note, et ecriture des nouveaux.
  read(): PageConfig;
  write(config: PageConfig): void;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;

const IMAGE_LIMIT = 60;

// Fichier du coffre designe par la cible d'une image de zone ; un dessin Excalidraw est lu par son export image.
function imageFile(app: App, target: string): TFile | null {
  const names = /\.excalidraw$/i.test(target) ? [`${target}.svg`, `${target}.png`] : [target];
  for (const name of names) {
    const f = app.metadataCache.getFirstLinkpathDest(name, ``);
    if (f) return f;
  }
  return null;
}

// Choix d'une image ou d'un dessin parmi tous ceux du coffre : recherche par nom, vignettes.
class ImagePicker extends Modal {
  constructor(app: App, private onPick: (target: string) => void) {
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
    this.titleEl.setText(t(`Choisir une image ou un dessin`));
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

const SIZE_LABEL: Record<SizeCode, string> = { xs: `XS`, s: `S`, m: `M`, l: `L` };

export class PageModal extends Modal {
  private config: PageConfig;
  private tab: PageTab;
  private lastInput: HTMLTextAreaElement | null = null;

  constructor(app: App, private host: PageModalHost, tab: PageTab = `header`) {
    super(app);
    this.tab = tab;
    this.config = host.read();
  }

  onOpen(): void {
    this.titleEl.setText(t(`Mise en page de la note`));
    this.modalEl.addClass(`mmw-pmodal`);
    this.render();
  }

  private save(): void {
    this.host.write(this.config);
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const tabs = contentEl.createDiv({ cls: `mmw-ptabs` });
    const names: [PageTab, string][] = [
      [`header`, t(`En-tête`)],
      [`footer`, t(`Pied de page`)],
      [`numbering`, t(`Numérotation`)],
    ];
    for (const [id, label] of names) {
      const b = tabs.createEl(`button`, { text: label, cls: `mmw-ptab` });
      b.type = `button`;
      if (id === this.tab) b.addClass(`is-active`);
      b.addEventListener(`click`, () => {
        this.tab = id;
        this.render();
      });
    }
    new Setting(contentEl)
      .setName(t(`Pas d'en-tête, de pied de page ni de numéro sur la première page`))
      .setDesc(t(`Pour une page de garde.`))
      .addToggle((x) =>
        x.setValue(this.config.skipFirst).onChange((v) => {
          this.config.skipFirst = v;
          this.save();
        })
      );
    if (this.tab === `numbering`) this.renderNumbering(contentEl);
    else this.renderBand(contentEl, this.tab);
    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText(t(`Réinitialiser tous les réglages de page`))
        .setWarning()
        .onClick(() => {
          this.config = defaultConfig();
          this.save();
          this.render();
        })
    );
  }

  private renderBand(parent: HTMLElement, which: `header` | `footer`): void {
    const band: Band = this.config[which];
    parent.createDiv({ cls: `mmw-pnote`, text: which === `header` ? t(`L'en-tête apparaît dès qu'une zone est remplie.`) : t(`Le pied de page apparaît dès qu'une zone est remplie.`) });
    new Setting(parent).setName(t(`Filet fin entre le texte et la page`)).addToggle((x) =>
      x.setValue(band.rule).onChange((v) => {
        band.rule = v;
        this.save();
      })
    );
    new Setting(parent)
      .setName(t(`Pages de gauche différentes de celles de droite`))
      .setDesc(t(`Quand elles sont identiques, les zones gauche et droite sont échangées d'une page à l'autre.`))
      .addToggle((x) =>
        x.setValue(band.mirror).onChange((v) => {
          band.mirror = v;
          this.save();
          this.render();
        })
      );
    this.toolbar(parent);
    this.zones(parent, band.mirror ? t(`Pages de droite`) : t(`Toutes les pages`), band.zones);
    if (band.mirror) this.zones(parent, t(`Pages de gauche`), band.verso);
  }

  // Barre de mise en forme : elle agit sur la derniere zone dans laquelle on a ecrit.
  private toolbar(parent: HTMLElement): void {
    const bar = parent.createDiv({ cls: `mmw-ptoolbar` });
    const button = (text: string, title: string, run: () => void, cls = ``): void => {
      const b = bar.createEl(`button`, { text, cls: `mmw-ptool ${cls}`.trim() });
      b.type = `button`;
      b.title = title;
      b.addEventListener(`mousedown`, (e) => e.preventDefault());
      b.addEventListener(`click`, run);
    };
    button(`G`, t(`Gras`), () => this.wrap(`**`, `**`), `mmw-ptool-bold`);
    button(`I`, t(`Italique`), () => this.wrap(`*`, `*`), `mmw-ptool-italic`);
    for (const code of SIZE_CODES) button(SIZE_LABEL[code], t(`Taille`) + ` ${SIZE_LABEL[code]}`, () => this.insert(`{${code}}`));
    const select = bar.createEl(`select`, { cls: `mmw-ptool-select dropdown` });
    select.createEl(`option`, { text: t(`Insérer une valeur`), value: `` });
    const names: Record<string, string> = {
      document: t(`Titre du document`),
      chapter: t(`Titre du chapitre`),
      section: t(`Titre de la section`),
      author: t(`Auteur`),
      date: t(`Date`),
      page: t(`Numéro de page`),
      pages: t(`Nombre de pages`),
    };
    for (const v of VARIABLES) select.createEl(`option`, { text: names[v], value: v });
    select.addEventListener(`change`, () => {
      if (select.value !== ``) this.insert(`{${select.value}}`);
      select.value = ``;
    });
    button(t(`Image`), t(`Insérer une image ou un dessin`), () => new ImagePicker(this.app, (target) => this.insert(`![[${target}]]`)).open());
  }

  private zones(parent: HTMLElement, title: string, zones: Zones): void {
    parent.createDiv({ cls: `mmw-pzone-title`, text: title });
    const grid = parent.createDiv({ cls: `mmw-pzones` });
    const preview = parent.createDiv({ cls: `mmw-ppreview` });
    const paint = (): void => {
      preview.empty();
      for (const key of [`left`, `center`, `right`] as const) {
        const cell = preview.createDiv({ cls: `mmw-ppreview-cell mmw-ppreview-${key}` });
        for (const line of zones[key].split(/\r?\n/).slice(0, ZONE_MAX_LINES)) {
          const row = cell.createDiv({ cls: `mmw-ppreview-line` });
          for (const tok of parseZone(line)) {
            if (tok.kind === `image`) {
              const file = imageFile(this.app, tok.target);
              if (!file) {
                row.createSpan({ cls: `mmw-ppreview-image`, text: `[${tok.target}]` });
                continue;
              }
              const img = row.createEl(`img`, { cls: `mmw-ppreview-img` });
              img.src = this.app.vault.getResourcePath(file);
              // Meme regle que l'export : largeur demandee en pixels, ramenee au maximum permis en gardant les proportions.
              const requested = tok.width;
              img.addEventListener(`load`, () => {
                const ratio = img.naturalHeight > 0 && img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1;
                let w = Math.min(requested && requested > 0 ? requested : img.naturalWidth, IMAGE_MAX_WIDTH_PX);
                if (w * ratio > IMAGE_MAX_HEIGHT_PX) w = IMAGE_MAX_HEIGHT_PX / ratio;
                img.style.width = `${w}px`;
                img.style.height = `${w * ratio}px`;
              });
              continue;
            }
            const sample = tok.kind === `variable` ? this.sample(tok.name) : tok.text;
            const span = row.createSpan({ text: sample });
            if (tok.bold) span.style.fontWeight = `700`;
            if (tok.italic) span.style.fontStyle = `italic`;
            span.style.fontSize = `${{ xs: 0.7, s: 0.85, m: 1, l: 1.2 }[tok.size]}em`;
          }
        }
      }
    };
    const labels: Record<`left` | `center` | `right`, string> = { left: t(`Gauche`), center: t(`Centre`), right: t(`Droite`) };
    for (const key of [`left`, `center`, `right`] as const) {
      const box = grid.createDiv({ cls: `mmw-pzone` });
      box.createDiv({ cls: `mmw-pzone-label`, text: labels[key] });
      const input = box.createEl(`textarea`, { cls: `mmw-pzone-input` });
      input.rows = 3;
      input.value = zones[key];
      input.spellcheck = false;
      input.addEventListener(`focus`, () => (this.lastInput = input));
      input.addEventListener(`input`, () => {
        zones[key] = input.value;
        this.save();
        paint();
      });
    }
    paint();
  }

  private sample(name: string): string {
    const values: Record<string, string> = { document: t(`Titre du document`), chapter: t(`Titre du chapitre`), section: t(`Titre de la section`), author: t(`Auteur`), date: t(`Date`), page: `1`, pages: `12` };
    return values[name] ?? ``;
  }

  // Entoure la selection de la zone active (ou la pose au curseur).
  private wrap(open: string, close: string): void {
    const input = this.lastInput;
    if (!input) return;
    const from = input.selectionStart ?? input.value.length;
    const to = input.selectionEnd ?? from;
    input.setRangeText(`${open}${input.value.slice(from, to)}${close}`, from, to, `end`);
    if (from === to) input.setSelectionRange(from + open.length, from + open.length);
    input.dispatchEvent(new Event(`input`));
    input.focus();
  }

  private insert(text: string): void {
    const input = this.lastInput;
    if (!input) return;
    const from = input.selectionStart ?? input.value.length;
    const to = input.selectionEnd ?? from;
    input.setRangeText(text, from, to, `end`);
    input.dispatchEvent(new Event(`input`));
    input.focus();
  }

  private renderNumbering(parent: HTMLElement): void {
    const n = this.config.numbering;
    const set = <K extends keyof typeof n>(key: K, value: (typeof n)[K], redraw = false): void => {
      n[key] = value;
      this.save();
      if (redraw) this.render();
    };
    new Setting(parent).setName(t(`Numéroter les pages`)).addToggle((x) => x.setValue(n.enabled).onChange((v) => set(`enabled`, v)));
    new Setting(parent).setName(t(`Emplacement du numéro`)).addDropdown((d) =>
      d
        .addOptions({ header: t(`Dans l'en-tête`), footer: t(`Dans le pied de page`), outer: t(`Sur le bord extérieur de la page`) })
        .setValue(n.place)
        .onChange((v) => set(`place`, v as NumberPlace))
    );
    new Setting(parent)
      .setName(t(`Position horizontale`))
      .setDesc(t(`Extérieur : à droite sur les pages de droite et à gauche sur les pages de gauche.`))
      .addDropdown((d) =>
        d
          .addOptions({ outer: t(`Extérieur`), inner: t(`Intérieur`), center: t(`Centre`) })
          .setValue(n.align)
          .onChange((v) => set(`align`, v as NumberAlign))
      );
    new Setting(parent).setName(t(`Taille du numéro`)).addDropdown((d) =>
      d
        .addOptions({ xs: `XS`, s: `S`, m: `M`, l: `L` })
        .setValue(n.size)
        .onChange((v) => set(`size`, v as SizeCode))
    );
    new Setting(parent).setName(t(`Forme autour du numéro`)).addDropdown((d) =>
      d
        .addOptions({ none: t(`Aucune`), circle: t(`Rond`), square: t(`Carré`), rounded: t(`Carré aux coins arrondis`) })
        .setValue(n.shape)
        .onChange((v) => set(`shape`, v as NumberShape))
    );
    const color = (name: string, key: `fill` | `stroke` | `color`): void => {
      new Setting(parent).setName(name).addColorPicker((c) => c.setValue(n[key]).onChange((v) => set(key, v.toLowerCase())));
    };
    color(t(`Couleur de fond de la forme`), `fill`);
    color(t(`Couleur du contour de la forme`), `stroke`);
    color(t(`Couleur du numéro`), `color`);
    parent.createDiv({ cls: `mmw-pnote`, text: t(`Le numéro est dessiné au premier plan : il peut recouvrir le texte de l'en-tête ou du pied de page.`) });
  }
}

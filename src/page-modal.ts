// Fenetre des reglages de page d'une note : en-tete, pied de page et numerotation, chacun sur son onglet. Chaque modification est
// ecrite tout de suite dans la note (ligne de commentaire sous les proprietes). Les zones sont des textes avec un balisage simple,
// montre dans la ligne de formule : **gras**, *italique*, {xs} {s} {m} {l}, {page}, ![[image.png|hauteur]].
import { App, ColorComponent, Modal, Setting, TextComponent, TFile } from "obsidian";
import { t } from "./i18n";
import { Band, defaultConfig, IMAGE_MAX_HEIGHT_PX, IMAGE_MAX_WIDTH_PX, mirrorZones, normalizeHex, NumberShape, OFFERED_VARIABLES, PageShape, PageConfig, parseZone, SIZE_CODES, SizeCode, ZONE_MAX_LINES, Zones } from "./page-config";

export type PageTab = `header` | `footer` | `edge`;

export interface PageModalHost {
  // Reglages actuels de la note, et ecriture des nouveaux.
  read(): PageConfig;
  write(config: PageConfig): void;
  // Auteur : valeur de la propriete `author` de la note, repli propose quand elle est vide (reglage du plugin), ecriture de la propriete.
  author?: { get(): string; fallback: string; set(value: string): void };
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
      [`edge`, t(`Bord extérieur`)],
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
    const author = this.host.author;
    if (author) {
      new Setting(contentEl)
        .setName(t(`Auteur de la note`))
        .setDesc(author.fallback !== `` ? t(`Écrit dans la propriété author de la note. Si elle est vide, le réglage Auteur du PDF est utilisé : {0}.`, author.fallback) : t(`Écrit dans la propriété author de la note. Si elle est vide, le réglage Auteur du PDF des réglages du plugin est utilisé.`))
        .addText((x) => {
          x.setValue(author.get()).setPlaceholder(author.fallback);
          x.inputEl.addEventListener(`change`, () => author.set(x.getValue().trim()));
        });
    }
    new Setting(contentEl)
      .setName(t(`Pas d'en-tête, de pied de page ni de bord sur la première page`))
      .setDesc(t(`Pour une page de garde.`))
      .addToggle((x) =>
        x.setValue(this.config.skipFirst).onChange((v) => {
          this.config.skipFirst = v;
          this.save();
        })
      );
    this.renderBand(contentEl, this.tab);
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

  private renderBand(parent: HTMLElement, which: PageTab): void {
    const band: Band = this.config[which];
    const notes: Record<PageTab, string> = {
      header: t(`L'en-tête apparaît dès qu'une zone est remplie.`),
      footer: t(`Le pied de page apparaît dès qu'une zone est remplie.`),
      edge: t(`Le bord extérieur apparaît dès qu'une zone est remplie : le texte y est écrit à 90 degrés, à droite des pages de droite et à gauche des pages de gauche.`),
    };
    parent.createDiv({ cls: `mmw-pnote`, text: notes[which] });
    new Setting(parent).setName(t(`Filet fin entre le texte et la page`)).addToggle((x) =>
      x.setValue(band.rule).onChange((v) => {
        band.rule = v;
        this.save();
      })
    );
    new Setting(parent)
      .setName(t(`Pages de gauche différentes de celles de droite`))
      .setDesc(t(`À l'activation, les zones des pages de gauche reprennent celles de droite en miroir ; vous pouvez ensuite les modifier.`))
      .addToggle((x) =>
        x.setValue(band.mirror).onChange((v) => {
          band.mirror = v;
          if (v && [band.verso.left, band.verso.center, band.verso.right].every((z) => z.trim() === ``)) band.verso = which === `edge` ? { ...band.zones } : mirrorZones(band.zones);
          this.save();
          this.render();
        })
      );
    this.toolbar(parent);
    parent.createDiv({ cls: `mmw-pnote`, text: t(`Image : ![[nom.png|200]] fixe la largeur en pixels. Taille maximale : 300 pixels de large et 60 pixels de haut, les proportions sont conservées.`) });
    this.zones(parent, band.mirror ? t(`Pages de droite`) : t(`Toutes les pages`), band.zones, which === `edge`);
    if (band.mirror) this.zones(parent, t(`Pages de gauche`), band.verso, which === `edge`);
    this.shapeSettings(parent, band, which);
  }

  // Forme dessinee derriere chaque numero de page {page} ecrit dans la bande : un chapitre a deplier.
  private shapeSettings(parent: HTMLElement, band: Band, which: PageTab): void {
    const shape = band.pageShape;
    const details = parent.createEl(`details`, { cls: `mmw-pdetails` });
    details.createEl(`summary`, { text: t(`Numéro de page dans cette bande`) });
    details.createDiv({ cls: `mmw-pnote`, text: t(`Écrivez {page} dans une zone (liste Insérer une valeur) : la forme et les couleurs ci-dessous s'appliquent à chaque numéro de la bande.`) });
    new Setting(details).setName(t(`Forme derrière le numéro`)).addDropdown((d) =>
      d
        .addOptions({ none: t(`Aucune`), circle: t(`Rond`), square: t(`Carré`), rounded: t(`Carré aux coins arrondis`) })
        .setValue(shape.shape)
        .onChange((v) => {
          shape.shape = v as NumberShape;
          this.save();
        })
    );
    this.colorSetting(details, t(`Remplissage de la forme`), shape, `fill`, true);
    this.colorSetting(details, t(`Contour de la forme`), shape, `stroke`, true);
    this.colorSetting(details, t(`Couleur du numéro`), shape, `color`, false);
    if (which === `edge`) {
      new Setting(details)
        .setName(t(`Numéro de page droit`))
        .setDesc(t(`Le numéro reste horizontal sur le bord extérieur, même si le reste du texte est écrit à 90 degrés.`))
        .addToggle((x) =>
          x.setValue(band.pageUpright).onChange((v) => {
            band.pageUpright = v;
            this.save();
          })
        );
    }
  }

  // Couleur choisie avec le sélecteur ou écrite en hexadécimal (#rrggbb) ; le bouton Aucune retire le remplissage ou le contour.
  private colorSetting(parent: HTMLElement, name: string, shape: PageShape, key: `fill` | `stroke` | `color`, allowNone: boolean): void {
    const setting = new Setting(parent).setName(name);
    let picker: ColorComponent | null = null;
    let field: TextComponent | null = null;
    const show = (): void => {
      field?.setValue(shape[key]);
      if (shape[key] !== ``) picker?.setValue(shape[key]);
    };
    const apply = (v: string): void => {
      shape[key] = v;
      this.save();
      show();
    };
    setting.addColorPicker((c) => {
      picker = c;
      c.setValue(shape[key] === `` ? `#ffffff` : shape[key]).onChange((v) => apply(v.toLowerCase()));
    });
    setting.addText((x) => {
      field = x;
      x.setPlaceholder(allowNone ? t(`aucun`) : `#rrggbb`).setValue(shape[key]);
      x.inputEl.size = 9;
      x.onChange((v) => {
        const hex = normalizeHex(v);
        if (hex !== null && (hex !== `` || allowNone)) {
          shape[key] = hex;
          this.save();
          if (hex !== ``) picker?.setValue(hex);
        }
      });
    });
    if (allowNone) setting.addButton((b) => b.setButtonText(t(`Aucun`)).onClick(() => apply(``)));
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
      date: t(`Date du jour`),
      created: t(`Date de création de la note`),
      modified: t(`Date de dernière modification de la note`),
      page: t(`Numéro de page`),
      pages: t(`Nombre de pages`),
    };
    for (const v of OFFERED_VARIABLES) select.createEl(`option`, { text: names[v], value: v });
    select.addEventListener(`change`, () => {
      if (select.value !== ``) this.insert(`{${select.value}}`);
      select.value = ``;
    });
    button(t(`Image`), t(`Insérer une image ou un dessin`), () => new ImagePicker(this.app, (target) => this.insert(`![[${target}]]`)).open());
  }

  private zones(parent: HTMLElement, title: string, zones: Zones, edge = false): void {
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
    const labels: Record<`left` | `center` | `right`, string> = edge ? { left: t(`Haut`), center: t(`Milieu`), right: t(`Bas`) } : { left: t(`Gauche`), center: t(`Centre`), right: t(`Droite`) };
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
    const values: Record<string, string> = { document: t(`Titre du document`), chapter: t(`Titre du chapitre`), section: t(`Titre de la section`), author: t(`Auteur`), date: t(`Date du jour`), created: t(`Date de création de la note`), modified: t(`Date de dernière modification de la note`), page: `1`, pages: `12` };
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
}

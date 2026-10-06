// Fenetre du format de la page : format de la feuille, orientation, marges et nombre de colonnes. Chaque choix est ecrit tout de suite
// dans la note (ligne de commentaire sous les proprietes), avec les reglages d'en-tete et de pied de page.
import { App, Modal, Setting } from "obsidian";
import { currentLang, t } from "./i18n";
import { FORMAT_IDS, FORMATS, FormatId, GapId, MarginId, maxColumns, MIN_COLUMN_WIDTH, Orientation, PageLayout, sanitizeLayout } from "./page-layout";
import { drawLayoutDiagram, layoutDiagram } from "./layout-diagram";
import type { PageModalHost } from "./page-modal";

export class LayoutModal extends Modal {
  private layout: PageLayout;

  constructor(app: App, private host: PageModalHost) {
    super(app);
    this.layout = host.read().layout;
  }

  onOpen(): void {
    this.titleEl.setText(t(`Format de la page`));
    this.render();
  }

  // Ecrit le choix dans la note ; le nombre de colonnes est ramene au maximum permis par la feuille.
  private save(patch: Partial<PageLayout>): void {
    this.layout = sanitizeLayout({ ...this.layout, ...patch });
    const config = this.host.read();
    config.layout = this.layout;
    this.host.write(config);
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const lang = currentLang();
    // Schema a l'echelle : feuille, marges (pointilles) et colonnes. Il suit les choix ci-dessous.
    const diagram = contentEl.createDiv({ cls: `mmw-diagram` });
    drawLayoutDiagram(diagram, layoutDiagram(this.layout), { margin: t(`Marge`), gap: t(`Espace entre colonnes`), sheet: t(`Schéma de la feuille`) });
    diagram.createDiv({ cls: `mmw-pnote`, text: t(`Le trait pointillé délimite la zone de texte : sa distance au bord de la feuille est la marge.`) });
    new Setting(contentEl).setName(t(`Format de la feuille`)).addDropdown((d) => {
      for (const id of FORMAT_IDS) d.addOption(id, FORMATS[id][lang]);
      d.setValue(this.layout.format).onChange((v) => this.save({ format: v as FormatId }));
    });
    new Setting(contentEl).setName(t(`Orientation`)).addDropdown((d) =>
      d
        .addOptions({ portrait: t(`Portrait`), landscape: t(`Paysage`) })
        .setValue(this.layout.orientation)
        .onChange((v) => this.save({ orientation: v as Orientation }))
    );
    new Setting(contentEl).setName(t(`Marges`)).addDropdown((d) =>
      d
        .addOptions({ narrow: t(`Étroites`), normal: t(`Normales`), wide: t(`Larges`) })
        .setValue(this.layout.margins)
        .onChange((v) => this.save({ margins: v as MarginId }))
    );
    const max = maxColumns(this.layout);
    new Setting(contentEl)
      .setName(t(`Colonnes`))
      .setDesc(t(`Jusqu'à {0} pour cette feuille : une colonne garde au moins {1} cm de large.`, max, Math.round((MIN_COLUMN_WIDTH / 72) * 2.54 * 10) / 10))
      .addDropdown((d) => {
        for (let n = 1; n <= max; n++) d.addOption(String(n), String(n));
        d.setValue(String(this.layout.columns)).onChange((v) => this.save({ columns: Number(v) }));
      });
    if (this.layout.columns > 1) {
      new Setting(contentEl).setName(t(`Espace entre les colonnes`)).setDesc(t(`S : 0,5 cm, M : 1 cm, L : 1,5 cm. Il apparaît en couleur sur le schéma.`)).addDropdown((d) =>
        d.addOptions({ s: `S`, m: `M`, l: `L` }).setValue(this.layout.gap).onChange((v) => this.save({ gap: v as GapId }))
      );
    }
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Les notes de bas de page se placent au bas de leur colonne. Les figures et les tableaux ont la largeur d'une colonne.`) });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

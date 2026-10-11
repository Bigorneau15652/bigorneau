// Onglet « Feuille » de la fenetre de mise en page : format de la feuille, orientation, marges et nombre de colonnes. Chaque choix est
// ecrit tout de suite dans la note (ligne de commentaire sous les proprietes), avec les reglages d'en-tete et de pied de page.
import { Setting } from "obsidian";
import { currentLang, t } from "./i18n";
import { FORMAT_IDS, FORMATS, FormatId, GapId, MarginId, maxColumns, MIN_COLUMN_WIDTH, Orientation, PageLayout, sanitizeLayout } from "./page-layout";
import { drawLayoutDiagram, layoutDiagram } from "./layout-diagram";
import type { PageModalHost } from "./page-modal";

// Dessine l'onglet dans `el` ; `changed` recoit la mise en page apres chaque choix (la fenetre garde ainsi sa copie des reglages a jour).
export function renderLayoutTab(el: HTMLElement, host: PageModalHost, changed: (layout: PageLayout) => void): void {
  let layout: PageLayout = host.read().layout;
  const render = (): void => {
    el.empty();
    const lang = currentLang();
    // Ecrit le choix dans la note ; le nombre de colonnes est ramene au maximum permis par la feuille.
    const save = (patch: Partial<PageLayout>): void => {
      layout = sanitizeLayout({ ...layout, ...patch });
      const config = host.read();
      config.layout = layout;
      host.write(config);
      changed(layout);
      render();
    };
    // Schema a l'echelle : feuille, marges (pointilles) et colonnes. Il suit les choix ci-dessous.
    const diagram = el.createDiv({ cls: `mmw-diagram` });
    drawLayoutDiagram(diagram, layoutDiagram(layout), { margin: t(`Marge`), gap: t(`Espace entre colonnes`), sheet: t(`Schéma de la feuille`) });
    diagram.createDiv({ cls: `mmw-pnote`, text: t(`Le trait pointillé délimite la zone de texte : sa distance au bord de la feuille est la marge.`) });
    new Setting(el).setName(t(`Format de la feuille`)).addDropdown((d) => {
      for (const id of FORMAT_IDS) d.addOption(id, FORMATS[id][lang]);
      d.setValue(layout.format).onChange((v) => save({ format: v as FormatId }));
    });
    new Setting(el).setName(t(`Orientation`)).addDropdown((d) =>
      d
        .addOptions({ portrait: t(`Portrait`), landscape: t(`Paysage`) })
        .setValue(layout.orientation)
        .onChange((v) => save({ orientation: v as Orientation }))
    );
    new Setting(el).setName(t(`Marges`)).addDropdown((d) =>
      d
        .addOptions({ narrow: t(`Étroites`), normal: t(`Normales`), wide: t(`Larges`) })
        .setValue(layout.margins)
        .onChange((v) => save({ margins: v as MarginId }))
    );
    const max = maxColumns(layout);
    new Setting(el)
      .setName(t(`Colonnes`))
      .setDesc(t(`Jusqu'à {0} pour cette feuille : une colonne garde au moins {1} cm de large.`, max, Math.round((MIN_COLUMN_WIDTH / 72) * 2.54 * 10) / 10))
      .addDropdown((d) => {
        for (let n = 1; n <= max; n++) d.addOption(String(n), String(n));
        d.setValue(String(layout.columns)).onChange((v) => save({ columns: Number(v) }));
      });
    if (layout.columns > 1) {
      new Setting(el).setName(t(`Espace entre les colonnes`)).setDesc(t(`S : 0,5 cm, M : 1 cm, L : 1,5 cm. Il apparaît en couleur sur le schéma.`)).addDropdown((d) =>
        d.addOptions({ s: `S`, m: `M`, l: `L` }).setValue(layout.gap).onChange((v) => save({ gap: v as GapId }))
      );
    }
    el.createDiv({ cls: `mmw-pnote`, text: t(`Les notes de bas de page se placent au bas de leur colonne. Les figures et les tableaux ont la largeur d'une colonne.`) });
  };
  render();
}

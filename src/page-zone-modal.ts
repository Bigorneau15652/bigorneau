// Fenetre « Orientation de la page » : le bloc ou se trouve le curseur (grand tableau, grande image) passe en paysage ou en portrait,
// avec son propre nombre de colonnes. Une etiquette cachee est ecrite avant le bloc (voir page-zone.ts).
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";
import { maxColumns, Orientation, PageLayout, sanitizeLayout } from "./page-layout";
import type { PageZone } from "./page-zone";

export interface PageZoneHost {
  layout(): PageLayout;
  current(): PageZone | null;
  set(zone: PageZone | null): void;
}

const SAME = `same`;

export class PageZoneModal extends Modal {
  private orientation: Orientation;
  private columns: string;
  private once: boolean;

  constructor(app: App, private host: PageZoneHost) {
    super(app);
    const now = host.current();
    const base = host.layout();
    this.orientation = now?.orientation ?? (base.orientation === `portrait` ? `landscape` : `portrait`);
    this.columns = now?.columns !== undefined ? String(now.columns) : SAME;
    this.once = now?.once ?? true;
  }

  onOpen(): void {
    this.titleEl.setText(t(`Orientation de la page`));
    this.render();
  }

  private zone(): PageZone {
    return { orientation: this.orientation, ...(this.columns !== SAME ? { columns: Number(this.columns) } : {}), ...(this.once ? { once: true } : {}) };
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Place le curseur dans le tableau, la figure ou le paragraphe voulu avant d'ouvrir cette fenêtre. Une étiquette cachée est écrite avant ce bloc.`) });
    new Setting(contentEl).setName(t(`Orientation`)).addDropdown((d) =>
      d
        .addOptions({ portrait: t(`Portrait`), landscape: t(`Paysage`) })
        .setValue(this.orientation)
        .onChange((v) => {
          this.orientation = v as Orientation;
          this.render();
        })
    );
    const max = maxColumns(sanitizeLayout({ ...this.host.layout(), orientation: this.orientation, columns: 1 }));
    new Setting(contentEl).setName(t(`Colonnes`)).addDropdown((d) => {
      d.addOption(SAME, t(`Comme la note`));
      for (let n = 1; n <= max; n++) d.addOption(String(n), String(n));
      d.setValue(this.columns === SAME || Number(this.columns) <= max ? this.columns : SAME).onChange((v) => (this.columns = v));
    });
    new Setting(contentEl)
      .setName(t(`Étendue`))
      .setDesc(t(`La feuille reprend son orientation après ce bloc, ou garde la nouvelle jusqu'à la prochaine étiquette.`))
      .addDropdown((d) =>
        d
          .addOptions({ once: t(`Ce bloc seulement`), zone: t(`Jusqu'à la prochaine étiquette`) })
          .setValue(this.once ? `once` : `zone`)
          .onChange((v) => (this.once = v === `once`))
      );
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText(t(`Appliquer à ce bloc`)).setCta().onClick(() => {
          this.host.set(this.zone());
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText(t(`Retirer l'étiquette`)).onClick(() => {
          this.host.set(null);
          this.close();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

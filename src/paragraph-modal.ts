// Fenetre « Paragraphes » : style des paragraphes de toute la note (retrait ou espace, alignement), regle dans la note avec les autres
// reglages de page, et exception pour le seul paragraphe ou se trouve le curseur (etiquette cachee au debut de sa ligne).
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";
import { ParagraphFormat, ParaAlign, ParaMode, ParaSize, ParagraphSettings, sanitizeParagraphSettings } from "./paragraph-format";
import type { PageModalHost } from "./page-modal";

export interface ParagraphModalHost extends PageModalHost {
  // Exception du paragraphe sous le curseur, pose et retrait de l'etiquette.
  current(): ParagraphFormat | null;
  setException(format: ParagraphFormat | null): void;
}

const SAME = `same`;

export class ParagraphModal extends Modal {
  private settings: ParagraphSettings;
  // Choix de l'exception en cours d'edition (valeurs de liste : `same` = comme le document).
  private align = SAME;
  private style = SAME;

  constructor(app: App, private host: ParagraphModalHost) {
    super(app);
    this.settings = host.read().paragraphs;
    const now = host.current();
    if (now) {
      this.align = now.align ?? SAME;
      this.style = now.mode === `space` ? `space-${now.size ?? `m`}` : (now.mode ?? SAME);
    }
  }

  onOpen(): void {
    this.titleEl.setText(t(`Paragraphes`));
    this.render();
  }

  private save(patch: Partial<ParagraphSettings>): void {
    this.settings = sanitizeParagraphSettings({ ...this.settings, ...patch });
    const config = this.host.read();
    config.paragraphs = this.settings;
    this.host.write(config);
    this.render();
  }

  private exception(): ParagraphFormat | null {
    const f: ParagraphFormat = {};
    if (this.align !== SAME) f.align = this.align as ParaAlign;
    if (this.style.startsWith(`space-`)) {
      f.mode = `space`;
      f.size = this.style.slice(6) as ParaSize;
    } else if (this.style !== SAME) f.mode = this.style as ParaMode | `none`;
    return Object.keys(f).length ? f : null;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const align = { justify: t(`Justifié`), left: t(`À gauche`), right: t(`À droite`), center: t(`Centré`) };
    contentEl.createEl(`h4`, { text: t(`Toute la note`) });
    new Setting(contentEl).setName(t(`Début des paragraphes`)).addDropdown((d) =>
      d.addOptions({ indent: t(`Retrait de la première ligne`), space: t(`Espace entre les paragraphes`) }).setValue(this.settings.mode).onChange((v) => this.save({ mode: v as ParaMode }))
    );
    if (this.settings.mode === `space`) {
      new Setting(contentEl).setName(t(`Taille de l'espace`)).setDesc(t(`S : 4 pt, M : 8 pt, L : 14 pt. Pas de retrait : l'alignement reste le même.`)).addDropdown((d) =>
        d.addOptions({ s: `S`, m: `M`, l: `L` }).setValue(this.settings.size).onChange((v) => this.save({ size: v as ParaSize }))
      );
    }
    new Setting(contentEl).setName(t(`Alignement`)).addDropdown((d) => d.addOptions(align).setValue(this.settings.align).onChange((v) => this.save({ align: v as ParaAlign })));

    contentEl.createEl(`h4`, { text: t(`Ce paragraphe seulement`) });
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Place le curseur dans le paragraphe voulu avant d'ouvrir cette fenêtre. Une étiquette cachée est écrite au début de sa ligne.`) });
    new Setting(contentEl).setName(t(`Alignement`)).addDropdown((d) =>
      d.addOptions({ [SAME]: t(`Comme le document`), ...align }).setValue(this.align).onChange((v) => (this.align = v))
    );
    new Setting(contentEl).setName(t(`Début`)).addDropdown((d) =>
      d
        .addOptions({
          [SAME]: t(`Comme le document`),
          indent: t(`Retrait de la première ligne`),
          "space-s": t(`Espace avant : S`),
          "space-m": t(`Espace avant : M`),
          "space-l": t(`Espace avant : L`),
          none: t(`Aucun retrait ni espace`),
        })
        .setValue(this.style)
        .onChange((v) => (this.style = v))
    );
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText(t(`Appliquer à ce paragraphe`)).setCta().onClick(() => {
          this.host.setException(this.exception());
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText(t(`Retirer l'exception`)).onClick(() => {
          this.host.setException(null);
          this.close();
        })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

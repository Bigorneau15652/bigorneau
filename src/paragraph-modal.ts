// Fenetre « Paragraphes » : style des paragraphes de toute la note (retrait ou espace, alignement), regle dans la note avec les autres
// reglages de page, et exception pour le seul paragraphe ou se trouve le curseur (etiquette cachee au debut de sa ligne).
import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";
import { effectiveParagraphs, ParagraphFormat, ParaAlign, ParaMode, ParaSize, ParagraphSettings, sanitizeParagraphSettings } from "./paragraph-format";
import type { PageModalHost } from "./page-modal";

export interface ParagraphModalHost extends PageModalHost {
  // Paragraphes de toutes les notes, que la note suit tant qu'elle n'a pas choisi les siens.
  general(): ParagraphSettings;
  // Exception du paragraphe sous le curseur, pose et retrait de l'etiquette.
  current(): ParagraphFormat | null;
  setException(format: ParagraphFormat | null): void;
}

const SAME = `same`;

// `scope` : `document` regle toute la note, `one` l'exception du seul paragraphe du curseur (bouton separe).
export type ParagraphScope = `document` | `one`;

export class ParagraphModal extends Modal {
  private settings: ParagraphSettings;
  // Choix de l'exception en cours d'edition (valeurs de liste : `same` = comme le document).
  private align = SAME;
  private style = SAME;

  constructor(app: App, private host: ParagraphModalHost, private part: ParagraphScope = `document`) {
    super(app);
    this.settings = effectiveParagraphs(host.general(), host.read().paragraphs);
    const now = host.current();
    if (now) {
      this.align = now.align ?? SAME;
      this.style = now.mode === `space` ? `space-${now.size ?? `m`}` : now.mode === `indent` && now.indentSize ? `indent-${now.indentSize}` : (now.mode ?? SAME);
    }
  }

  onOpen(): void {
    this.titleEl.setText(this.part === `document` ? t(`Paragraphes`) : t(`Ce paragraphe seulement`));
    this.render();
  }

  private save(patch: Partial<ParagraphSettings>): void {
    this.settings = sanitizeParagraphSettings({ ...this.settings, ...patch, set: true });
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
    } else if (this.style.startsWith(`indent-`)) {
      f.mode = `indent`;
      f.indentSize = this.style.slice(7) as ParaSize;
    } else if (this.style !== SAME) f.mode = this.style as ParaMode | `none`;
    return Object.keys(f).length ? f : null;
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const align = { justify: t(`Justifié`), left: t(`À gauche`), right: t(`À droite`), center: t(`Centré`) };
    if (this.part === `document`) {
      new Setting(contentEl).setName(t(`Début des paragraphes`)).addDropdown((d) =>
        d.addOptions({ indent: t(`Retrait de la première ligne`), space: t(`Espace entre les paragraphes`) }).setValue(this.settings.mode).onChange((v) => this.save({ mode: v as ParaMode }))
      );
      if (this.settings.mode === `space`) {
        new Setting(contentEl).setName(t(`Taille de l'espace`)).setDesc(t(`S : 4 pt, M : 8 pt, L : 14 pt. Pas de retrait : l'alignement reste le même.`)).addDropdown((d) =>
          d.addOptions({ s: `S`, m: `M`, l: `L` }).setValue(this.settings.size).onChange((v) => this.save({ size: v as ParaSize }))
        );
      } else {
        new Setting(contentEl).setName(t(`Taille du retrait`)).setDesc(t(`S : 0,5 cm, M : 1 cm, L : 1,5 cm.`)).addDropdown((d) =>
          d.addOptions({ s: `S`, m: `M`, l: `L` }).setValue(this.settings.indentSize).onChange((v) => this.save({ indentSize: v as ParaSize }))
        );
      }
      new Setting(contentEl).setName(t(`Alignement`)).addDropdown((d) => d.addOptions(align).setValue(this.settings.align).onChange((v) => this.save({ align: v as ParaAlign })));
      return;
    }
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Place le curseur dans le paragraphe voulu avant d'ouvrir cette fenêtre. Une étiquette cachée est écrite au début de sa ligne.`) });
    new Setting(contentEl).setName(t(`Alignement`)).addDropdown((d) =>
      d.addOptions({ [SAME]: t(`Comme le document`), ...align }).setValue(this.align).onChange((v) => (this.align = v))
    );
    new Setting(contentEl).setName(t(`Début`)).addDropdown((d) =>
      d
        .addOptions({
          [SAME]: t(`Comme le document`),
          indent: t(`Retrait de la première ligne`),
          "indent-s": t(`Retrait : S`),
          "indent-m": t(`Retrait : M`),
          "indent-l": t(`Retrait : L`),
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

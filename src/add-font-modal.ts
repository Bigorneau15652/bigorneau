// Fenetre « Ajouter une police » : explique les etapes (choisir une police sur un site, la telecharger, la copier dans le dossier des
// polices), ouvre les sites et importe les fichiers telecharges depuis n'importe quel dossier de l'ordinateur.
import { App, Modal } from "obsidian";
import { t } from "./i18n";
import type { ImportReport } from "./font-import";

export interface AddFontHost {
  folder(): string;
  // Copie les fichiers dans le dossier des polices, puis relit celui-ci.
  importFiles(files: File[]): Promise<ImportReport>;
}

// Sites de polices : adresse et conseil propre a chacun.
export function fontSites(): { name: string; url: string; note: string }[] {
  return [
    { name: `Google Fonts`, url: `https://fonts.google.com`, note: t(`Libres. Bouton Get font, puis Download all : prenez les fichiers du dossier static.`) },
    { name: `Font Squirrel`, url: `https://www.fontsquirrel.com`, note: t(`Libres pour tout usage, y compris professionnel. Bouton Download TTF.`) },
    { name: `Fontshare`, url: `https://www.fontshare.com`, note: t(`Libres pour tout usage. Bouton Download family.`) },
    { name: `Open Font Library`, url: `https://fontlibrary.org`, note: t(`Libres, sous licence ouverte.`) },
    { name: `Velvetyne`, url: `https://velvetyne.fr/fonts`, note: t(`Libres, création contemporaine.`) },
    { name: `DaFont`, url: `https://www.dafont.com`, note: t(`Attention : beaucoup de polices sont gratuites pour un usage personnel seulement et ne peuvent pas servir à un document professionnel. Choisissez les catégories 100% Free ou Public domain.`) },
  ];
}

export class AddFontModal extends Modal {
  constructor(app: App, private host: AddFontHost, private done: () => void) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Ajouter une police`));
    this.modalEl.addClass(`mmw-pmodal`, `mmw-addfont`);
    this.render();
  }

  onClose(): void {
    this.done();
  }

  private render(report?: ImportReport): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl(`h4`, { text: t(`1. Choisir une police`) });
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Ouvrez l'un de ces sites dans votre navigateur et choisissez une police. Vérifiez sa licence : elle doit autoriser l'usage dans un document diffusé.`) });
    for (const site of fontSites()) {
      const row = contentEl.createDiv({ cls: `mmw-addfont-site` });
      row.createEl(`a`, { text: site.name, href: site.url, attr: { target: `_blank`, rel: `noopener` } });
      row.createSpan({ cls: `mmw-addfont-note`, text: site.note });
    }
    contentEl.createEl(`h4`, { text: t(`2. Télécharger`) });
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Le site fournit un fichier zip ou des fichiers .ttf et .otf, que votre navigateur place le plus souvent dans le dossier Téléchargements. Les formats WOFF, les collections .ttc et les polices variables ne sont pas utilisables.`) });
    contentEl.createEl(`h4`, { text: t(`3. Copier dans Bigorneau`) });
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Importez le zip ou les fichiers depuis n'importe quel dossier de votre ordinateur : Bigorneau les copie dans le dossier des polices du coffre ({0}). Vous pouvez aussi les glisser dans le cadre ci-dessous, ou les copier vous-même dans ce dossier.`, this.host.folder()) });

    const drop = contentEl.createDiv({ cls: `mmw-addfont-drop` });
    drop.createSpan({ text: t(`Glissez ici des fichiers .zip, .ttf ou .otf`) });
    const choose = drop.createEl(`button`, { cls: `mod-cta`, text: t(`Importer des fichiers`) });
    const input = drop.createEl(`input`, { type: `file`, attr: { multiple: `true`, accept: `.zip,.ttf,.otf`, hidden: `true` } });
    choose.addEventListener(`click`, () => input.click());
    input.addEventListener(`change`, () => void this.take(Array.from(input.files ?? [])));
    drop.addEventListener(`dragover`, (e) => {
      e.preventDefault();
      drop.addClass(`is-over`);
    });
    drop.addEventListener(`dragleave`, () => drop.removeClass(`is-over`));
    drop.addEventListener(`drop`, (e) => {
      e.preventDefault();
      drop.removeClass(`is-over`);
      void this.take(Array.from(e.dataTransfer?.files ?? []));
    });

    if (report) {
      if (report.added.length > 0) contentEl.createDiv({ cls: `mmw-addfont-ok`, text: t(`Fichiers copiés : {0}`, report.added.join(`, `)) });
      if (report.skipped.length > 0) contentEl.createDiv({ cls: `mmw-typo-problem`, text: t(`Fichiers ignorés (aucune police .ttf ou .otf) : {0}`, report.skipped.join(`, `)) });
      if (report.added.length > 0) contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Les polices apparaissent dans les listes de police. Un fichier que Bigorneau ne peut pas utiliser est signalé dans la fenêtre Polices et titres.`) });
    }
  }

  private async take(files: File[]): Promise<void> {
    if (files.length === 0) return;
    this.render(await this.host.importFiles(files));
  }
}

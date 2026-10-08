// Fenetres des profils : saisie d'un nom (enregistrer, renommer), confirmation et choix d'un profil a charger.
import { App, FuzzySuggestModal, Modal, Notice } from "obsidian";
import { t } from "./i18n";
import { profileName, sameProfile } from "./profile";

export class ConfirmModal extends Modal {
  constructor(app: App, private opts: { title: string; text: string; confirm: string; danger?: boolean; onConfirm: () => void }) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    this.modalEl.addClass(`mmw-pmodal`);
    this.contentEl.createDiv({ cls: `mmw-pnote`, text: this.opts.text });
    const row = this.contentEl.createDiv({ cls: `mmw-typo-buttons` });
    const ok = row.createEl(`button`, { text: this.opts.confirm, cls: this.opts.danger ? `mod-warning` : `mod-cta` });
    ok.addEventListener(`click`, () => {
      this.close();
      this.opts.onConfirm();
    });
    row.createEl(`button`, { text: t(`Annuler`) }).addEventListener(`click`, () => this.close());
    ok.focus();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export interface NameModalOptions {
  title: string;
  value: string;
  confirm: string;
  // Noms des profils existants, pour avertir avant d'en ecraser un.
  existing: () => Promise<string[]>;
  // Nom qui ne compte pas comme deja pris (le profil qu'on renomme).
  self?: string;
  onSubmit: (name: string, overwrite: boolean) => void | Promise<void>;
}

// Saisie du nom d'un profil. Si le nom existe deja, la fenetre demande confirmation avant de le remplacer.
export class NameModal extends Modal {
  private input!: HTMLInputElement;
  private messageEl!: HTMLElement;
  private buttons!: HTMLElement;

  constructor(app: App, private opts: NameModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.opts.title);
    this.modalEl.addClass(`mmw-pmodal`);
    this.contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Nom du profil`) });
    this.input = this.contentEl.createEl(`input`, { type: `text`, cls: `mmw-profile-name`, attr: { placeholder: t(`Par exemple : Rapport de stage`) } });
    this.input.value = this.opts.value;
    this.messageEl = this.contentEl.createDiv({ cls: `mmw-pnote mmw-profile-message` });
    this.buttons = this.contentEl.createDiv({ cls: `mmw-typo-buttons` });
    this.input.addEventListener(`input`, () => this.showForm());
    this.input.addEventListener(`keydown`, (e) => {
      if (e.key === `Enter`) {
        e.preventDefault();
        void this.submit();
      }
    });
    this.showForm();
    this.input.focus();
    this.input.select();
  }

  private showForm(): void {
    this.messageEl.setText(``);
    this.buttons.empty();
    this.buttons.createEl(`button`, { text: this.opts.confirm, cls: `mod-cta` }).addEventListener(`click`, () => void this.submit());
    this.buttons.createEl(`button`, { text: t(`Annuler`) }).addEventListener(`click`, () => this.close());
  }

  private async submit(): Promise<void> {
    const name = profileName(this.input.value);
    if (name === ``) {
      new Notice(t(`Donnez un nom au profil.`));
      return;
    }
    const clash = (await this.opts.existing()).find((n) => sameProfile(n, name));
    // Aucun profil de ce nom, ou c'est le profil qu'on renomme (changement de casse) : rien a remplacer.
    if (!clash || (this.opts.self !== undefined && sameProfile(clash, this.opts.self))) {
      this.close();
      await this.opts.onSubmit(name, false);
      return;
    }
    // Le nom est deja pris : remplacer ou annuler.
    this.messageEl.setText(t(`Un profil nommé « {0} » existe déjà. Voulez-vous le remplacer ?`, clash));
    this.buttons.empty();
    this.buttons.createEl(`button`, { text: t(`Remplacer`), cls: `mod-warning` }).addEventListener(`click`, () => {
      this.close();
      void this.opts.onSubmit(name, true);
    });
    this.buttons.createEl(`button`, { text: t(`Annuler`) }).addEventListener(`click`, () => this.showForm());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// Choix d'un profil dans une liste a recherche.
export class ProfilePicker extends FuzzySuggestModal<string> {
  constructor(app: App, private names: string[], private onPick: (name: string) => void) {
    super(app);
    this.setPlaceholder(t(`Choisir un profil à charger`));
  }

  getItems(): string[] {
    return this.names;
  }

  getItemText(name: string): string {
    return name;
  }

  onChooseItem(name: string): void {
    this.onPick(name);
  }
}

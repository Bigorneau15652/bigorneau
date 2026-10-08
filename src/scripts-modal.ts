// Fenetre des scripts (bouton bigorneau du panneau) : liste des scripts, activation, ajout d'un fichier a la main et confirmation.
import { App, Modal, Notice, Setting } from "obsidian";
import { currentLang, t } from "./i18n";
import type MindmapWritingPlugin from "./main";
import { renderButtonList } from "./panel-buttons";
import { API_VERSION, ExternalScript, ScriptInfo } from "./scripts";

export class ScriptsModal extends Modal {
  constructor(app: App, private plugin: MindmapWritingPlugin) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Scripts et boutons`));
    this.draw();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private draw(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(`mmw-scripts`);
    contentEl.createEl(`p`, { cls: `mmw-scripts-intro`, text: t(`Les scripts ajoutent des fonctions à Bigorneau : chacun apporte des boutons et des commandes. Désactiver un script le rend inactif tout de suite, mais son code ne se décharge qu'au redémarrage d'Obsidian.`) });
    const list = contentEl.createDiv({ cls: `mmw-scripts-list` });
    for (const info of this.plugin.scripts.info()) this.row(list, info);
    // Boutons du panneau : visibles ou non, ordre, separations (memes reglages que dans les reglages d'Obsidian).
    new Setting(contentEl).setName(t(`Boutons du panneau`)).setHeading();
    renderButtonList(contentEl.createDiv(), this.plugin);
    new Setting(contentEl)
      .setName(t(`Ajouter un fichier de script`))
      .setDesc(t(`Un script a les mêmes pouvoirs que le plugin : il peut lire et modifier toutes vos notes, et sur ordinateur accéder aux fichiers de la machine. N'ajoutez que des scripts dont vous connaissez l'origine. Chaque script doit être confirmé avant son premier lancement, et de nouveau s'il change.`))
      .addButton((b) => b.setButtonText(t(`Choisir un fichier…`)).onClick(() => this.pick()));
    new Setting(contentEl)
      .setName(t(`Diagnostic`))
      .setDesc(t(`Affiche l'état du plugin, des scripts et les temps mesurés, à envoyer avec la description d'un problème.`))
      .addButton((b) =>
        b.setButtonText(t(`Ouvrir le diagnostic`)).onClick(() => {
          this.close();
          this.plugin.openDiagnostic();
        })
      );
  }

  private row(list: HTMLElement, info: ScriptInfo): void {
    const lang = currentLang();
    const row = new Setting(list).setName(`${info.name[lang]} (${info.version})`);
    row.descEl.empty();
    row.descEl.createDiv({ text: info.description[lang] });
    row.descEl.createDiv({ cls: `mmw-scripts-status`, text: this.statusText(info) });
    const needsConfirm = info.status === `needs-confirmation` || info.status === `modified`;
    if (needsConfirm) {
      row.addButton((b) =>
        b.setButtonText(t(`Examiner`)).setCta().onClick(() => {
          const script = this.plugin.scripts.externalScript(info.id);
          if (script) this.confirm(script);
        })
      );
    }
    if (info.origin === `external`) {
      row.addExtraButton((b) =>
        b
          .setIcon(`trash`)
          .setTooltip(t(`Supprimer`))
          .onClick(async () => {
            this.plugin.scripts.remove(info.id);
            if (info.file) await this.plugin.scriptStore.remove(info.file);
            if (info.loaded) new Notice(t(`Le script « {0} » est supprimé. Il sera complètement déchargé au redémarrage d'Obsidian.`, info.name[lang]));
            this.plugin.panel.sync();
            this.draw();
          })
      );
    }
    row.addToggle((x) =>
      x
        .setValue(info.enabled)
        .setDisabled(needsConfirm || info.status === `incompatible`)
        .onChange(async (on) => {
          await this.plugin.scripts.setEnabled(info.id, on);
          if (!on && info.loaded) new Notice(t(`Le script « {0} » est désactivé. Il sera complètement déchargé au redémarrage d'Obsidian.`, info.name[lang]));
          this.plugin.panel.sync();
          this.draw();
        })
    );
  }

  private statusText(info: ScriptInfo): string {
    const origin = info.origin === `builtin` ? t(`Intégré au plugin.`) : t(`Ajouté à la main (fichier {0}).`, info.file ?? ``);
    switch (info.status) {
      case `needs-confirmation`:
        return `${origin} ${t(`À confirmer avant de pouvoir être activé.`)}`;
      case `modified`:
        return `${origin} ${t(`Le fichier a changé depuis votre confirmation : il faut le confirmer de nouveau.`)}`;
      case `incompatible`:
        return `${origin} ${t(`Écrit pour une autre version de l'interface du plugin.`)}`;
      case `blocked`:
        return `${origin} ${t(`Nécessite : {0}.`, info.detail ?? ``)}`;
      case `error`:
        return `${origin} ${t(`Erreur : {0}`, info.detail ?? ``)}`;
      default:
        return `${origin} ${info.enabled ? t(`Activé.`) : t(`Désactivé.`)}`;
    }
  }

  // Choix d'un fichier de script sur l'ordinateur.
  private pick(): void {
    const input = document.createElement(`input`);
    input.type = `file`;
    input.accept = `.js,text/javascript`;
    input.addEventListener(`change`, () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(async (code) => {
        const script = await this.plugin.prepareScript(file.name, code);
        if (script) this.confirm(script, true);
      });
    });
    input.click();
  }

  private confirm(script: ExternalScript, isNew = false): void {
    new ScriptConfirmModal(this.app, script, async () => {
      await this.plugin.confirmScript(script, isNew);
      this.draw();
    }).open();
  }
}

// Confirmation d'un script ajoute a la main : nom, origine et description, avec l'avertissement sur ses pouvoirs.
export class ScriptConfirmModal extends Modal {
  constructor(app: App, private script: ExternalScript, private onConfirm: () => Promise<void>) {
    super(app);
  }

  onOpen(): void {
    const s = this.script;
    const lang = currentLang();
    this.titleEl.setText(t(`Confirmer ce script`));
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass(`mmw-script-confirm`);
    contentEl.createEl(`h4`, { text: `${s.name[lang]} (${s.version})` });
    contentEl.createEl(`p`, { text: s.description[lang] === `` ? t(`Ce script n'a pas de description.`) : s.description[lang] });
    contentEl.createEl(`p`, { cls: `mmw-scripts-status`, text: t(`Origine : fichier « {0} », ajouté à la main. Empreinte (SHA-256) : {1}.`, s.file, s.fingerprint.slice(0, 16)) });
    if (s.requires.length > 0) contentEl.createEl(`p`, { cls: `mmw-scripts-status`, text: t(`Nécessite : {0}.`, s.requires.join(`, `)) });
    if (s.api !== API_VERSION) contentEl.createEl(`p`, { text: t(`Écrit pour une autre version de l'interface du plugin.`) });
    contentEl.createEl(`p`, { cls: `mmw-scripts-warning`, text: t(`Ce script aura les mêmes pouvoirs que le plugin : il pourra lire et modifier toutes vos notes et, sur ordinateur, accéder aux fichiers de la machine. Ne le confirmez que si vous en connaissez l'origine.`) });
    new Setting(contentEl)
      .addButton((b) => b.setButtonText(t(`Annuler`)).onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText(t(`Confirmer et activer`))
          .setCta()
          .onClick(async () => {
            this.close();
            await this.onConfirm();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

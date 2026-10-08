// Fenetre « Diagnostic de Bigorneau » : version, scripts (etat et erreurs), nombre de volets, reglages utiles et temps mesures. Le texte
// se copie pour etre envoye avec une description du probleme.
import { App, Modal, Notice, Setting } from "obsidian";
import { formatSamples, samplesList } from "./diagnostics";
import { excalidrawInstalled } from "./drawing";
import { currentLang, t } from "./i18n";
import type MindmapWritingPlugin from "./main";

export function diagnosticText(app: App, plugin: MindmapWritingPlugin): string {
  const lang = currentLang();
  const lines: string[] = [];
  lines.push(`Bigorneau ${plugin.manifest.version}`);
  lines.push(`Excalidraw : ${excalidrawInstalled(app) ? `activé` : `absent`}`);
  lines.push(`Vue de la carte : ${plugin.settings.viewMode}`);
  lines.push(`Panneau de boutons : ${plugin.settings.panelVisible ? `affiché` : `masqué`}, ${plugin.functions.all().filter((f) => f.button !== false && (!f.available || f.available())).length} boutons disponibles`);
  lines.push(``);
  lines.push(`Scripts :`);
  for (const s of plugin.scripts.info()) lines.push(`- ${s.name[lang]} (${s.version}) : ${s.enabled ? `actif` : `inactif`}, ${s.loaded ? `chargé` : `non chargé`}, état ${s.status}${s.detail ? ` (${s.detail})` : ``}`);
  lines.push(``);
  lines.push(`Temps mesurés :`);
  const measures = formatSamples(samplesList());
  lines.push(measures === `` ? `(aucune mesure pour l'instant : utilisez le plugin quelques instants, puis rouvrez cette fenêtre)` : measures);
  return lines.join(`\n`);
}

export class DiagnosticModal extends Modal {
  constructor(app: App, private plugin: MindmapWritingPlugin) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(t(`Diagnostic de Bigorneau`));
    const { contentEl } = this;
    contentEl.createDiv({ cls: `mmw-pnote`, text: t(`Ce texte décrit l'état du plugin et les temps mesurés. Copiez-le et envoyez-le avec la description du problème.`) });
    const text = diagnosticText(this.app, this.plugin);
    contentEl.createEl(`pre`, { cls: `mmw-diagnostic`, text });
    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t(`Copier`)).setCta().onClick(() => {
        void navigator.clipboard.writeText(text).then(
          () => new Notice(t(`Diagnostic copié dans le presse-papiers.`)),
          () => new Notice(t(`La copie a échoué : sélectionnez le texte et copiez-le à la main.`))
        );
      })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

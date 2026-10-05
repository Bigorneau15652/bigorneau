// Script officiel « Mise en page » : en-tete, pied de page et numerotation des pages de l'export, propres a chaque note. Chaque
// fonction a un bouton a etat (un clic l'active ou la desactive pour la note ouverte, Ctrl + clic ouvre les reglages) et une commande.
// Desactive, il ne change rien : l'export reste celui d'avant, avec ses reglages generaux.
import { applyPageConfig, readPageConfig } from "./page-apply";
import type { PageConfig } from "./page-config";
import { PageModal, PageTab } from "./page-modal";
import type { OfficialScript } from "./scripts";

export const PAGE_SCRIPT: OfficialScript = {
  origin: `builtin`,
  id: `page-layout`,
  name: { fr: `Mise en page`, en: `Page layout` },
  description: {
    fr: `Ajoute un en-tête, un pied de page et une numérotation des pages à l'export PDF, réglés note par note : trois zones, mise en forme, images, pages de gauche et de droite, numéro dans une forme colorée.`,
    en: `Adds a header, a footer and page numbering to the PDF export, set note by note: three zones, formatting, images, left and right pages, number inside a coloured shape.`,
  },
  version: `1.0.0`,
  api: 1,
  requires: [],
  defaultEnabled: false,
  load(api) {
    const configOf = (view: { data?: string } | undefined, editor?: { getValue(): string }): PageConfig => readPageConfig(editor ? editor.getValue() : (view?.data ?? ``));
    const openSettings = (ctx: { editor?: import("obsidian").Editor }, tab: PageTab): void => {
      const editor = ctx.editor;
      if (!editor) return;
      new PageModal(api.app, { read: () => configOf(undefined, editor), write: (c) => applyPageConfig(editor, c) }, tab).open();
    };
    const define = (id: string, tab: PageTab, name: { fr: string; en: string }, icon: string[], enabledOf: (c: PageConfig) => boolean, toggle: (c: PageConfig, on: boolean) => void): void => {
      api.addFunction({
        id,
        name,
        icon,
        needsEditor: true,
        active: ({ editor }) => (editor ? enabledOf(configOf(undefined, editor)) : false),
        settings: (ctx) => openSettings(ctx, tab),
        run: ({ editor }) => {
          if (!editor) return;
          const config = configOf(undefined, editor);
          toggle(config, !enabledOf(config));
          applyPageConfig(editor, config);
        },
      });
      api.addFunction({
        id: `${id}-settings`,
        name: { fr: `${name.fr} : réglages`, en: `${name.en}: settings` },
        needsEditor: true,
        button: false,
        run: (ctx) => openSettings(ctx, tab),
      });
    };
    define(`page-header`, `header`, { fr: `En-tête`, en: `Header` }, [`panel-top`, `align-vertical-justify-start`, `heading`], (c) => c.header.enabled, (c, on) => (c.header.enabled = on));
    define(`page-footer`, `footer`, { fr: `Pied de page`, en: `Footer` }, [`panel-bottom`, `align-vertical-justify-end`, `rectangle-horizontal`], (c) => c.footer.enabled, (c, on) => (c.footer.enabled = on));
    define(`page-numbering`, `numbering`, { fr: `Numérotation des pages`, en: `Page numbering` }, [`list-ordered`, `hash`, `binary`], (c) => c.numbering.enabled, (c, on) => (c.numbering.enabled = on));
  },
};

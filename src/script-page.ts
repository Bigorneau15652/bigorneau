// Script officiel « Mise en page » : en-tete, pied de page et bord exterieur des pages de l'export, propres a chaque note. Un seul
// bouton ouvre la fenetre de reglages (trois onglets) ; il est plus contraste quand au moins un des trois elements existe dans la note.
// Desactive, il ne change rien : l'export reste celui d'avant, avec ses reglages generaux.
import { applyPageConfig, readPageConfig } from "./page-apply";
import { anyDecor } from "./page-config";
import { PageModal } from "./page-modal";
import type { OfficialScript } from "./scripts";

export const PAGE_SCRIPT: OfficialScript = {
  origin: `builtin`,
  id: `page-layout`,
  name: { fr: `Mise en page`, en: `Page layout` },
  description: {
    fr: `Ajoute un en-tête, un pied de page et un bord extérieur (texte à 90 degrés) à l'export PDF, réglés note par note : trois zones, mise en forme, images, pages de gauche et de droite, numéro de page dans une forme colorée.`,
    en: `Adds a header, a footer and an outer edge (text at 90 degrees) to the PDF export, set note by note: three zones, formatting, images, left and right pages, page number inside a coloured shape.`,
  },
  version: `2.0.0`,
  api: 1,
  requires: [],
  defaultEnabled: false,
  load(api) {
    api.addFunction({
      id: `page-layout`,
      name: { fr: `Mise en page : en-tête, pied de page et bord extérieur`, en: `Page layout: header, footer and outer edge` },
      icon: [`panel-top`, `layout-template`, `file-text`],
      needsEditor: true,
      active: ({ editor }) => (editor ? anyDecor(readPageConfig(editor.getValue())) : false),
      run: ({ editor }) => {
        if (!editor) return;
        new PageModal(api.app, { read: () => readPageConfig(editor.getValue()), write: (c) => applyPageConfig(editor, c) }).open();
      },
    });
  },
};

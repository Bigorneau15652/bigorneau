// Script officiel « Mise en page » : en-tete, pied de page et bord exterieur des pages de l'export, propres a chaque note. Un seul
// bouton ouvre la fenetre de reglages (trois onglets) ; il est plus contraste quand au moins un des trois elements existe dans la note.
// Desactive, il ne change rien : l'export reste celui d'avant, avec ses reglages generaux.
import { applyPageConfig, readPageConfig } from "./page-apply";
import { anyDecor } from "./page-config";
import { PageModal, PageModalHost } from "./page-modal";
import type { OfficialScript } from "./scripts";

// `defaultAuthor` donne le reglage « Auteur du PDF » du plugin, propose quand la note n'a pas de propriete author.
export const createPageScript = (defaultAuthor: () => string): OfficialScript => ({
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
      run: ({ editor, view }) => {
        if (!editor) return;
        const file = view?.file ?? null;
        const host: PageModalHost = { read: () => readPageConfig(editor.getValue()), write: (c) => applyPageConfig(editor, c) };
        if (file) {
          host.author = {
            get: () => {
              const value = api.app.metadataCache.getFileCache(file)?.frontmatter?.author;
              return typeof value === `string` ? value : ``;
            },
            fallback: defaultAuthor(),
            set: (value) => void api.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
              if (value === ``) delete fm.author;
              else fm.author = value;
            }),
          };
        }
        new PageModal(api.app, host).open();
      },
    });
  },
});

// Script officiel « Mise en page » : en-tete, pied de page et bord exterieur des pages de l'export, propres a chaque note. Un seul
// bouton ouvre la fenetre de reglages (trois onglets) ; il est plus contraste quand au moins un des trois elements existe dans la note.
// Desactive, il ne change rien : l'export reste celui d'avant, avec ses reglages generaux.
import type { Editor } from "obsidian";
import { applyPageConfig, readPageConfig, replaceChanged } from "./page-apply";
import { LayoutModal } from "./layout-modal";
import { anyDecor } from "./page-config";
import { defaultLayout, sameLayout } from "./page-layout";
import { PageModal, PageModalHost } from "./page-modal";
import { ICON_ORIENTATION, ICON_PARAGRAPH } from "./custom-icons";
import { IllustrationListModal } from "./illustration-list-modal";
import { listMarkersIn, placeListMarker, removeListMarker } from "./illustration-list";
import { PageZoneModal } from "./page-zone-modal";
import { pageZoneAt, setPageZone } from "./page-zone";
import { ParagraphModal, ParagraphModalHost } from "./paragraph-modal";
import { defaultParagraphSettings, isParagraphSet, paragraphMarkerAt, setParagraphMarker } from "./paragraph-format";
import type { OfficialScript } from "./scripts";
import { TypographyHost, TypographyModal } from "./typography-modal";

// `defaultAuthor` donne le reglage « Auteur du PDF » du plugin, propose quand la note n'a pas de propriete author.
// `typography` donne le style general des polices et des titres, et les polices du coffre.
export const createPageScript = (defaultAuthor: () => string, typography: Omit<TypographyHost, `note`>): OfficialScript => ({
  id: `page-layout`,
  name: { fr: `Mise en page`, en: `Page layout` },
  description: {
    fr: `Règle la page de l'export PDF note par note : format de la feuille, orientation, marges et colonnes, puis en-tête, pied de page et bord extérieur (texte à 90 degrés) avec trois zones, mise en forme, images, pages de gauche et de droite, numéro de page dans une forme colorée.`,
    en: `Sets the page of the PDF export note by note: sheet format, orientation, margins and columns, then header, footer and outer edge (text at 90 degrees) with three zones, formatting, images, left and right pages, page number inside a coloured shape.`,
  },
  version: `3.0.0`,
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
              const value: unknown = api.app.metadataCache.getFileCache(file)?.frontmatter?.author;
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
    // Second bouton : format de la feuille, orientation, marges et colonnes. Plus contraste quand la note s'ecarte de l'A4 portrait.
    api.addFunction({
      id: `page-format`,
      name: { fr: `Format de la page : feuille, orientation, marges et colonnes`, en: `Page format: sheet, orientation, margins and columns` },
      icon: [`columns-2`, `layout-panel-left`, `ruler`],
      needsEditor: true,
      active: ({ editor }) => (editor ? !sameLayout(readPageConfig(editor.getValue()).layout, defaultLayout()) : false),
      run: ({ editor }) => {
        if (!editor) return;
        new LayoutModal(api.app, { read: () => readPageConfig(editor.getValue()), write: (c) => applyPageConfig(editor, c) }).open();
      },
    });
    // Troisieme bouton : style des paragraphes de toute la note (retrait ou espace, alignement).
    const paragraphHost = (editor: Editor): ParagraphModalHost => {
      const offset = () => editor.posToOffset(editor.getCursor());
      return {
        read: () => readPageConfig(editor.getValue()),
        write: (c) => applyPageConfig(editor, c),
        general: () => typography.paragraphs(),
        current: () => paragraphMarkerAt(editor.getValue(), offset()),
        setException: (format) => {
          const change = setParagraphMarker(editor.getValue(), offset(), format);
          editor.replaceRange(change.insert, editor.offsetToPos(change.from), editor.offsetToPos(change.to));
        },
      };
    };
    api.addFunction({
      id: `page-paragraphs`,
      name: { fr: `Paragraphes : retrait, espace et alignement de la note`, en: `Paragraphs: indent, spacing and alignment of the note` },
      icon: [`pilcrow`, `align-justify`, `text`],
      needsEditor: true,
      active: ({ editor }) => (editor ? JSON.stringify(readPageConfig(editor.getValue()).paragraphs) !== JSON.stringify(defaultParagraphSettings()) : false),
      run: ({ editor }) => {
        if (editor) new ParagraphModal(api.app, paragraphHost(editor), `document`).open();
      },
    });
    // Quatrieme bouton : exception pour le seul paragraphe du curseur. Plus contraste quand ce paragraphe a une exception.
    api.addFunction({
      id: `page-paragraph`,
      name: { fr: `Ce paragraphe seulement : alignement et début`, en: `This paragraph only: alignment and start` },
      icon: [ICON_PARAGRAPH, `pilcrow`],
      needsEditor: true,
      active: ({ editor }) => (editor ? paragraphMarkerAt(editor.getValue(), editor.posToOffset(editor.getCursor())) !== null : false),
      run: ({ editor }) => {
        if (editor) new ParagraphModal(api.app, paragraphHost(editor), `one`).open();
      },
    });
    // Cinquieme bouton : le bloc du curseur (grand tableau, grande image) passe en paysage ou en portrait.
    api.addFunction({
      id: `page-zone`,
      name: { fr: `Orientation de la page : paysage ou portrait pour un bloc`, en: `Page orientation: landscape or portrait for a block` },
      icon: [ICON_ORIENTATION, `rectangle-horizontal`],
      needsEditor: true,
      active: ({ editor }) => (editor ? pageZoneAt(editor.getValue(), editor.posToOffset(editor.getCursor())) !== null : false),
      run: ({ editor }) => {
        if (!editor) return;
        const offset = () => editor.posToOffset(editor.getCursor());
        new PageZoneModal(api.app, {
          layout: () => readPageConfig(editor.getValue()).layout,
          current: () => pageZoneAt(editor.getValue(), offset())?.zone ?? null,
          set: (zone) => {
            const change = setPageZone(editor.getValue(), offset(), zone);
            editor.replaceRange(change.insert, editor.offsetToPos(change.from), editor.offsetToPos(change.to));
          },
        }).open();
      },
    });
    // Septieme bouton : polices, tailles, casse, soulignement et numerotation du corps de texte et des titres.
    api.addFunction({
      id: `page-typography`,
      name: { fr: `Polices et titres : police, taille, casse, soulignement et numérotation`, en: `Fonts and headings: font, size, case, underline and numbering` },
      icon: [`type`, `a-large-small`, `heading`],
      needsEditor: false,
      active: ({ editor }) => (editor ? Object.keys(readPageConfig(editor.getValue()).typography ?? {}).length > 0 : false),
      run: ({ editor }) => {
        const host: TypographyHost = { ...typography };
        if (editor) {
          host.note = {
            read: () => readPageConfig(editor.getValue()).typography ?? {},
            write: (overrides) => {
              const config = readPageConfig(editor.getValue());
              if (Object.keys(overrides).length > 0) config.typography = overrides;
              else delete config.typography;
              applyPageConfig(editor, config);
            },
            paragraphs: () => {
              const p = readPageConfig(editor.getValue()).paragraphs;
              return isParagraphSet(p) ? p : undefined;
            },
            setParagraphs: (p) => {
              const config = readPageConfig(editor.getValue());
              config.paragraphs = p ?? defaultParagraphSettings();
              applyPageConfig(editor, config);
            },
          };
        }
        new TypographyModal(api.app, host).open();
      },
    });
    // Sixieme bouton : listes des figures et des tableaux, placees ou l'on veut par une etiquette cachee.
    api.addFunction({
      id: `page-lists`,
      name: { fr: `Listes des figures et des tableaux`, en: `Lists of figures and tables` },
      icon: [`gallery-vertical-end`, `list-ordered`, `list`],
      needsEditor: true,
      active: ({ editor }) => (editor ? listMarkersIn(editor.getValue()).length > 0 : false),
      run: ({ editor }) => {
        if (!editor) return;
        const offset = () => editor.posToOffset(editor.getCursor());
        const rewrite = (after: (text: string) => string): void => {
          const before = editor.getValue();
          replaceChanged(editor, before, after(before));
        };
        new IllustrationListModal(api.app, {
          present: () => listMarkersIn(editor.getValue()),
          place: (kind) => rewrite((text) => placeListMarker(text, offset(), kind)),
          remove: (kind) => rewrite((text) => removeListMarker(text, kind)),
        }).open();
      },
    });
  },
});

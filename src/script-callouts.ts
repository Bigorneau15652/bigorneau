// Official module "Callouts": adds a button and a window to create or edit a callout of the note. The callout is written exactly as
// Obsidian and the Callout Manager plugin write it (`> [!type]- Title`, then the lines of the content with `> `): it can also be
// written by hand or with Callout Manager, and the export prints it whether this module is on or not. The window edits the callout that
// holds the cursor, or inserts a new one at the cursor (the selected text becomes its content).
import type { Editor, EditorPosition } from "obsidian";
import { openCalloutEditor } from "./callout-modal";
import { CalloutForm, emptyForm, findCalloutRange, formFromLines, linesFromForm } from "./callout-edit";
import type { CalloutLook } from "./export/callout";
import type { OfficialScript } from "./scripts";

// The module; `getLook` gives the look of the callouts chosen in the settings of the export (for the preview of the window).
export function createCalloutsScript(getLook: () => CalloutLook): OfficialScript {
  return {
    id: `callouts`,
    name: { fr: `Callouts`, en: `Callouts` },
    description: {
      fr: `Ajoute un bouton et une fenêtre pour créer ou modifier un callout : type avec son pictogramme et sa couleur, titre, texte, repliable ou non, couleur ou noir et blanc. Le callout s'écrit comme dans Obsidian et Callout Manager. Les callouts s'impriment dans l'export même sans ce module.`,
      en: `Adds a button and a window to create or edit a callout: type with its pictogram and colour, title, text, foldable or not, colour or black and white. The callout is written as in Obsidian and Callout Manager. Callouts are printed in the export even without this module.`,
    },
    version: `1.0.0`,
    requires: [],
    defaultEnabled: false,
    load(api) {
      const obsidian = api.obsidian as typeof import("obsidian");
      // Opens the window on the callout under the cursor, or on a new one.
      const openForEditor = (editor: Editor): void => {
        const lines = editor.getValue().split(`\n`);
        const cursor = editor.getCursor();
        const range = findCalloutRange(lines, cursor.line);
        const original = range ? lines.slice(range.start, range.end + 1) : null;
        const existing = original ? formFromLines(original) : null;
        // New callout: the selected text, if any, becomes its content and is replaced by the callout.
        const from: EditorPosition = editor.getCursor(`from`);
        const to: EditorPosition = editor.getCursor(`to`);
        const selected = existing ? `` : editor.getSelection();
        const form: CalloutForm = existing ?? { ...emptyForm(), text: selected };
        openCalloutEditor({
          app: api.app,
          obsidian,
          lang: api.language(),
          form,
          editing: existing !== null,
          defaultLook: getLook(),
          onSubmit: (result) => {
            const block = linesFromForm(result).join(`\n`);
            if (original && range) {
              // The note may have changed while the window was open: the callout is searched again by its lines.
              const now = editor.getValue().split(`\n`);
              let at = -1;
              for (let i = 0; i + original.length <= now.length && at < 0; i++) if (original.every((l, k) => now[i + k] === l)) at = i;
              if (at >= 0) {
                editor.replaceRange(block, { line: at, ch: 0 }, { line: at + original.length - 1, ch: now[at + original.length - 1].length });
                return;
              }
              api.notice(api.language() === `fr` ? `Le callout a changé pendant que la fenêtre était ouverte : il est inséré à la place du curseur.` : `The callout changed while the window was open: it is inserted at the cursor.`);
            }
            if (selected !== ``) {
              editor.replaceRange(`${block}\n`, from, to);
              return;
            }
            // New callout: on its own lines, with an empty line before and after.
            const line = editor.getLine(cursor.line);
            if (line.trim() === ``) editor.replaceRange(`${block}\n`, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length });
            else editor.replaceRange(`\n\n${block}\n`, { line: cursor.line, ch: line.length });
          },
        });
      };

      api.addFunction({
        id: `edit-callout`,
        name: { fr: `Éditeur de callouts`, en: `Callout editor` },
        icon: [`message-square-quote`, `quote`, `message-square`],
        needsEditor: true,
        run: ({ editor }) => {
          if (editor) openForEditor(editor);
        },
      });

      api.addHelp([
        {
          id: `editor`,
          title: { fr: `Création de callouts`, en: `Creating callouts` },
          text: {
            fr: `Le module Callouts, désactivé par défaut (bouton bigorneau du panneau), ajoute un bouton Éditeur de callouts (masquable dans les réglages des boutons, avec une commande de la palette). La fenêtre propose le type (avec son pictogramme et sa couleur : note, résumé, information, à faire, astuce, succès, question, avertissement, échec, danger, bogue, exemple, citation, ou un autre nom de type, par exemple un type de Callout Manager), un titre facultatif, le texte, repliable ou non, et l'aspect à l'export : selon le réglage de l'export, en couleur, en noir et blanc ou dans une couleur libre. Le callout s'écrit exactement comme dans Obsidian : \`> [!tip]- Titre\` puis les lignes du texte précédées de \`> \`. Un choix d'aspect est écrit dans une ligne de commentaire sous la première ligne, que Obsidian ne montre pas. Avec le curseur dans un callout, le bouton ouvre ce callout pour le modifier ; ailleurs, il en insère un nouveau, et le texte sélectionné devient son contenu. Un callout peut aussi s'écrire à la main ou avec Callout Manager : l'export l'imprime de la même façon.`,
            en: `The Callouts module, off by default (bigorneau button of the panel), adds a Callout editor button (it can be hidden in the settings of the buttons, and there is a command of the palette). The window offers the type (with its pictogram and colour: note, abstract, info, to do, tip, success, question, warning, failure, danger, bug, example, quote, or another type name, for example a Callout Manager type), an optional title, the text, foldable or not, and the look in the export: as the export setting says, in colour, in black and white or in a free colour. The callout is written exactly as in Obsidian: \`> [!tip]- Title\` then the lines of the text preceded by \`> \`. A choice of look is written in a line of comment under the first line, which Obsidian does not show. With the cursor in a callout, the button opens that callout to edit it; elsewhere it inserts a new one, and the selected text becomes its content. A callout can also be written by hand or with Callout Manager: the export prints it in the same way.`,
          },
          keywords: { fr: `callout callouts encadre note astuce avertissement creer inserer fenetre`, en: `callout callouts box note tip warning create insert window` },
        },
      ]);
    },
  };
}

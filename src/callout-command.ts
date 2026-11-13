// The callout editor as a function of the plugin (button of the panel and command of the palette, always present): it opens the window on
// the callout that holds the cursor, or on a new one. The callout is written exactly as Obsidian and the Callout Manager plugin write it
// (`> [!type]- Title`, then the lines of the content with `> `): it can also be written by hand or with Callout Manager, and the export
// prints it in every case. A selected text becomes the content of a new callout.
import { Editor, EditorPosition, Notice } from "obsidian";
import type * as ObsidianApi from "obsidian";
import { CalloutForm, emptyForm, findCalloutRange, formFromLines, linesFromForm } from "./callout-edit";
import { openCalloutEditor } from "./callout-modal";
import type { CalloutLook } from "./export/callout";
import type { HelpLang } from "./help";
import { t } from "./i18n";
import type { App } from "obsidian";

export interface CalloutCommandDeps {
  app: App;
  obsidian: typeof ObsidianApi;
  editor: Editor;
  lang: HelpLang;
  // Look of the callouts chosen in the settings of the export (for the preview of the window).
  look: CalloutLook;
}

// Opens the window on the callout under the cursor, or on a new one, and writes the result into the note.
export function runCalloutEditor(deps: CalloutCommandDeps): void {
  const { editor } = deps;
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
    app: deps.app,
    obsidian: deps.obsidian,
    lang: deps.lang,
    form,
    editing: existing !== null,
    defaultLook: deps.look,
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
        new Notice(t(`Le callout a changé pendant que la fenêtre était ouverte : il est inséré à la place du curseur.`));
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
}

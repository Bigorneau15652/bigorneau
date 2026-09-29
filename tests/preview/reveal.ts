import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { revealRange } from "../../src/reveal";

// Document de test : 10 chapitres de 12 lignes, puis un dernier chapitre de 6 lignes et un tres long chapitre.
const lines: string[] = [];
const chapters: { head: number; end: number }[] = [];
const add = (title: string, count: number): void => {
  const head = lines.length;
  lines.push(`# ${title}`);
  for (let i = 0; i < count; i++) lines.push(`ligne ${i + 1} du chapitre ${title}`);
  chapters.push({ head, end: lines.length - 1 });
};
for (let i = 1; i <= 10; i++) add(`Chapitre ${i}`, 12);
add(`Dernier`, 6);
const text = lines.join(`\n`);

const cm = new EditorView({
  parent: document.getElementById(`editor`)!,
  state: EditorState.create({ doc: text, extensions: [EditorView.lineWrapping] }),
});

const w = window as unknown as Record<string, unknown>;
w.cm = cm;
w.chapters = chapters;
w.reveal = (index: number, cursorLine?: number): void => {
  const c = chapters[index];
  revealRange(cm, { headLine: c.head, endLine: c.end, cursorLine: cursorLine ?? c.end, cursorCh: 5 });
};
// Renvoie si la ligne (numero a partir de 0) est visible dans la fenetre de defilement.
w.visible = (line: number): boolean => {
  const pos = cm.state.doc.line(line + 1).from;
  const c = cm.coordsAtPos(pos);
  if (!c) return false;
  const r = cm.scrollDOM.getBoundingClientRect();
  return c.top >= r.top - 1 && c.bottom <= r.bottom + 1;
};

import { ItemView, WorkspaceLeaf } from "obsidian";
import type MindmapWritingPlugin from "./main";
import { computeStats, MmDoc, MmNode, parseNote, serializeNote } from "./model";

export const VIEW_TYPE_MINDMAP = `mindmap-writing-view`;

function countWords(text: string): number {
  const t = text.trim();
  return t === `` ? 0 : t.split(/\s+/).length;
}

export class MindmapView extends ItemView {
  private plugin: MindmapWritingPlugin;
  private renderToken = 0;

  constructor(leaf: WorkspaceLeaf, plugin: MindmapWritingPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MINDMAP;
  }

  getDisplayText(): string {
    return `Mindmap Note Writing`;
  }

  getIcon(): string {
    return `network`;
  }

  async onOpen() {
    await this.refresh();
  }

  async onClose() {
    this.contentEl.empty();
  }

  async refresh() {
    const token = ++this.renderToken;
    const el = this.contentEl;
    const file = this.plugin.lastFile;
    let text = ``;
    if (file) text = await this.app.vault.cachedRead(file);
    if (token !== this.renderToken) return;

    el.empty();
    el.addClass(`mmw-view`);
    el.createEl(`h3`, { text: `Mindmap Note Writing` });

    if (!file) {
      el.createEl(`p`, { text: `Aucune note ouverte. Ouvrez une note du coffre, puis relancez la commande.` });
      return;
    }

    const doc = parseNote(text, file.name);
    const rebuilt = serializeNote(doc);
    const identical = rebuilt === text;
    const stats = computeStats(doc);

    el.createEl(`p`, { text: `Note analysee : ${file.basename}`, cls: `mmw-note-name` });

    const summary = el.createEl(`ul`, { cls: `mmw-summary` });
    const line = (label: string) => summary.createEl(`li`, { text: label });
    line(`Noeuds (hors racine) : ${stats.nodeCount}`);
    line(`Profondeur maximale : ${stats.maxDepth}`);
    line(`Titre general detecte : ${doc.hasGeneralTitle ? `oui` : `non`}`);
    line(`Niveaux de titre sautes : ${stats.skippedLevels}`);
    line(`Titres vides : ${stats.emptyTitles}`);
    const check = line(
      identical
        ? `Reconstruction de la note : identique au fichier`
        : `Reconstruction de la note : DIFFERENTE du fichier (ne rien modifier, signalez-le)`
    );
    check.addClass(identical ? `mmw-ok` : `mmw-ko`);

    el.createEl(`h4`, { text: `Structure (lecture seule)` });
    el.appendChild(this.renderTree(doc));
  }

  private renderTree(doc: MmDoc): HTMLElement {
    const ul = document.createElement(`ul`);
    ul.addClass(`mmw-tree`);
    ul.appendChild(this.renderNode(doc.root, true));
    return ul;
  }

  private renderNode(node: MmNode, isRoot: boolean): HTMLElement {
    const li = document.createElement(`li`);
    const label = li.createSpan({ cls: isRoot ? `mmw-root-title` : `mmw-title` });
    label.setText(node.title === `` ? `(sans titre)` : node.title);
    if (node.title === ``) label.addClass(`mmw-empty`);
    const words = countWords(node.body);
    const info = isRoot ? `${words} mots` : `niveau ${node.level}, ${words} mots`;
    li.createSpan({ text: ` (${info})`, cls: `mmw-info` });
    if (node.children.length > 0) {
      const sub = li.createEl(`ul`);
      for (const child of node.children) sub.appendChild(this.renderNode(child, false));
    }
    return li;
  }
}

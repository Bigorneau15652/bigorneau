// Reglages du plugin (sans dependance a Obsidian pour pouvoir etre teste hors de l'application).

export type LongTitles = `ellipsis` | `wrap`;
export type FrameStyle = `sketch` | `rounded` | `straight` | `none`;
export type BranchStyle = `sketch` | `curve` | `elbow` | `straight`;
export type PanePosition = `right` | `left` | `top` | `bottom`;
export type CursorPosition = `last` | `start` | `end`;
export type ParagraphMode = `native` | `simple`;

export interface MmSettings {
  longTitles: LongTitles;
  maxWidth: number;
  frameStyle: FrameStyle;
  branchStyle: BranchStyle;
  showPrefix: boolean;
  compactness: number;
  panePosition: PanePosition;
  paneSize: number;
  cursorPosition: CursorPosition;
  paragraphMode: ParagraphMode;
}

export const DEFAULT_SETTINGS: MmSettings = {
  longTitles: `ellipsis`,
  maxWidth: 240,
  frameStyle: `sketch`,
  branchStyle: `sketch`,
  showPrefix: false,
  compactness: 1,
  panePosition: `right`,
  paneSize: 380,
  cursorPosition: `last`,
  paragraphMode: `native`,
};

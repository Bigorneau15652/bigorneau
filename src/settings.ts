// Reglages du plugin (sans dependance a Obsidian pour pouvoir etre teste hors de l'application).

export type LongTitles = `ellipsis` | `wrap`;
export type FrameStyle = `sketch` | `rounded` | `straight` | `none`;
export type BranchStyle = `sketch` | `curve` | `elbow` | `straight`;

export interface MmSettings {
  longTitles: LongTitles;
  maxWidth: number;
  frameStyle: FrameStyle;
  branchStyle: BranchStyle;
  showPrefix: boolean;
  compactness: number;
}

export const DEFAULT_SETTINGS: MmSettings = {
  longTitles: `ellipsis`,
  maxWidth: 240,
  frameStyle: `sketch`,
  branchStyle: `sketch`,
  showPrefix: false,
  compactness: 1,
};

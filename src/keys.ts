// Combinaisons de touches configurables (sans dependance a Obsidian).
// Format : modificateurs puis touche, separes par un tiret, par exemple Mod-ArrowUp.
// Mod designe Cmd sur Mac et Ctrl ailleurs.

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function eventToCombo(e: KeyLike, isMac: boolean): string {
  const parts: string[] = [];
  const mod = isMac ? e.metaKey : e.ctrlKey;
  if (mod) parts.push(`Mod`);
  if (isMac && e.ctrlKey) parts.push(`Ctrl`);
  if (!isMac && e.metaKey) parts.push(`Meta`);
  if (e.altKey) parts.push(`Alt`);
  if (e.shiftKey) parts.push(`Shift`);
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join(`-`);
}

export function comboMatches(e: KeyLike, combo: string, isMac: boolean): boolean {
  return combo !== `` && eventToCombo(e, isMac) === combo;
}

const NAMES: Record<string, string> = {
  ArrowUp: `↑`,
  ArrowDown: `↓`,
  ArrowLeft: `←`,
  ArrowRight: `→`,
  Enter: `Entrée`,
  Escape: `Échap`,
  Backspace: `Retour arrière`,
  Delete: `Suppr`,
  " ": `Espace`,
};

// Libelle lisible d'une combinaison, par exemple Cmd + ↑ sur Mac.
export function comboLabel(combo: string, isMac: boolean): string {
  if (combo === ``) return `Aucune`;
  return combo
    .split(`-`)
    .map((part) => {
      if (part === `Mod`) return isMac ? `Cmd` : `Ctrl`;
      if (part === `Alt`) return isMac ? `Option` : `Alt`;
      if (part === `Shift`) return `Maj`;
      if (part === ``) return `-`;
      return NAMES[part] ?? part;
    })
    .join(` + `);
}

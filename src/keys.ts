import { t } from "./i18n";

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

// Cmd ou Ctrl + Entree, avec ou sans Maj : passe de la carte a la note, et de la note a la carte. Dans l'editeur,
// Obsidian reserve Cmd + Entree a ses propres commandes (case a cocher, ouverture d'un lien) et peut l'intercepter :
// Cmd + Maj + Entree est alors le raccourci fiable.
export function isModEnter(e: KeyLike): boolean {
  return e.key === `Enter` && (e.metaKey || e.ctrlKey) && !e.altKey;
}

export function comboMatches(e: KeyLike, combo: string, isMac: boolean): boolean {
  return combo !== `` && eventToCombo(e, isMac) === combo;
}

const names = (): Record<string, string> => ({
  ArrowUp: `↑`,
  ArrowDown: `↓`,
  ArrowLeft: `←`,
  ArrowRight: `→`,
  Enter: t(`Entrée`),
  Escape: t(`Échap`),
  Backspace: t(`Retour arrière`),
  Delete: t(`Suppr`),
  " ": t(`Espace`),
});

// Libelle lisible d'une combinaison, par exemple Cmd + ↑ sur Mac.
export function comboLabel(combo: string, isMac: boolean): string {
  if (combo === ``) return t(`Aucune`);
  return combo
    .split(`-`)
    .map((part) => {
      if (part === `Mod`) return isMac ? `Cmd` : `Ctrl`;
      if (part === `Alt`) return isMac ? `Option` : `Alt`;
      if (part === `Shift`) return `Maj`;
      if (part === ``) return `-`;
      return names()[part] ?? part;
    })
    .join(` + `);
}

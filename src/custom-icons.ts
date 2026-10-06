// Icones dessinees pour Bigorneau, quand la serie d'Obsidian n'a rien de parlant. Chaque icone tient dans un carre de 100 sur 100 et
// prend la couleur du texte.
import { addIcon } from "obsidian";

export const ICON_FOOTNOTE = `bigorneau-footnote`;
export const ICON_LOREM = `bigorneau-lorem`;

const STROKE = `fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS: Record<string, string> = {
  // Deux lignes de texte avec un 1 en exposant, puis un filet court et la note numerotee en bas de page.
  [ICON_FOOTNOTE]: `<g ${STROKE}><path d="M12 26 H52"/><path d="M12 46 H88"/><path d="M60 12 L66 7 V25" stroke-width="5"/><path d="M12 64 H36" stroke-width="4"/><path d="M12 82 L18 77 V94" stroke-width="5"/><path d="M30 82 H88"/><path d="M30 94 H66"/></g>`,
  // Les lettres L et I en capitales romaines, comme sur une inscription ancienne.
  [ICON_LOREM]: `<text x="50" y="72" font-size="62" font-weight="700" font-family="Trajan Pro, Cinzel, Georgia, Times New Roman, serif" text-anchor="middle" fill="currentColor">LI</text>`,
};

export const CUSTOM_ICON_IDS = new Set(Object.keys(ICONS));

export function registerCustomIcons(): void {
  for (const [id, svg] of Object.entries(ICONS)) addIcon(id, svg);
}

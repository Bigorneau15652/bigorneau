// Reperes de lignes dans un texte, sans piege de bord : `lastIndexOf` avec une position negative regarde quand meme le premier caractere,
// ce qui donnait un debut de ligne faux (et des boucles sans fin) pour une note qui commence par une ligne vide.
// Ce module ne depend pas d'Obsidian.

// Debut de la ligne qui contient `offset`.
export function lineStartAt(text: string, offset: number): number {
  return offset <= 0 ? 0 : text.lastIndexOf(`\n`, offset - 1) + 1;
}

// Fin de la ligne qui contient `offset` (position du retour a la ligne, ou fin du texte).
export function lineEndAt(text: string, offset: number): number {
  const nl = text.indexOf(`\n`, Math.max(0, offset));
  return nl === -1 ? text.length : nl;
}

// Debut de la ligne qui precede la ligne commencant en `start` ; `start` doit etre superieur a 0. Le resultat est toujours inferieur a `start`.
export function previousLineStart(text: string, start: number): number {
  return start <= 1 ? 0 : text.lastIndexOf(`\n`, start - 2) + 1;
}

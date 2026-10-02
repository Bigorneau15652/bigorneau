// Export de haute qualite : protrusion (crenage des marges), l'une des techniques de microtypographie de l'extension microtype de
// LaTeX. En bout de ligne justifiee, la ponctuation et les tirets depassent un peu dans la marge, de sorte que le bord du texte
// parait droit a l'oeil. Les facteurs sont des fractions de la largeur du caractere ; ils sont de l'ordre de ceux de microtype
// pour les polices romaines (forts pour le trait d'union, la virgule et le point, moyens pour les deux-points, les guillemets et
// les apostrophes, faibles pour les autres signes) et seront compares a la sortie de LaTeX a la phase 8.

const RIGHT: Record<string, number> = {
  "-": 0.7,
  "‐": 0.7,
  ".": 0.7,
  ",": 0.7,
  ":": 0.5,
  ";": 0.5,
  "!": 0.3,
  "?": 0.3,
  "’": 0.5,
  "”": 0.4,
  "\x27": 0.5,
  "\x22": 0.4,
  "»": 0.2,
  ")": 0.1,
  "–": 0.3,
  "—": 0.2,
};

const LEFT: Record<string, number> = {
  "‘": 0.5,
  "“": 0.4,
  "\x27": 0.4,
  "\x22": 0.4,
  "«": 0.2,
  "(": 0.1,
  "–": 0.3,
  "—": 0.2,
};

// Part de la largeur du caractere qui depasse a droite de la ligne, ou a gauche (0 si le caractere ne depasse pas).
export const rightProtrusion = (ch: string): number => RIGHT[ch] ?? 0;
export const leftProtrusion = (ch: string): number => LEFT[ch] ?? 0;

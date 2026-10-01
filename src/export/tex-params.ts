// Export de haute qualite : parametres numeriques de la composition, regroupes en un seul endroit.
// Chaque parametre porte sa valeur par defaut, sa source et une plage raisonnable.
// Sources verifiees pendant la phase zero : tex.web (programme de reference de TeX, depot TeX Live), ltplain.dtx et
// ltpage.dtx (LaTeX2e), crates/typst-layout/src/inline/linebreak.rs (Typst), fichiers de motifs du projet hyph-utf8.
// Attention : TeX brut (IniTeX) met tous ces parametres a zero, sauf tolerance (10000) ; les valeurs ci-dessous sont celles
// de plain TeX et de LaTeX.

export interface TexParams {
  // Seuil de laideur (badness) de la premiere passe, faite sans cesure. Source : ltplain.dtx. Plage : 0 a 10000.
  pretolerance: number;
  // Seuil de laideur de la deuxieme passe, avec cesure. Source : ltplain.dtx. Plage : 100 a 10000.
  tolerance: number;
  // Etirement d'urgence de la troisieme passe, en fraction de la taille du texte (em). LaTeX le met a 0 (\fussy) et a 3 em
  // avec \sloppy (ltpage.dtx). Ici 3 em : sans cela, un paragraphe etroit qui contient un groupe de mots insecable (nombre et
  // unite) produit une ligne qui depasse la colonne, ce qui est pire qu'une ligne un peu lache. Plage : 0 a 5.
  emergencyStretch: number;
  // Pénalité ajoutee a chaque ligne, qui favorise les paragraphes courts. Source : ltplain.dtx (10). Plage : 0 a 100.
  linePenalty: number;
  // Cout d'une coupure apres une cesure automatique ou un tiret explicite. Source : ltplain.dtx (50 pour les deux).
  // Typst utilise 135 car 50 coupe trop souvent. Ici 50 comme TeX ; plage : 0 a 500.
  hyphenPenalty: number;
  exHyphenPenalty: number;
  // Demerites supplementaires : deux lignes consecutives de classes d'espacement incompatibles, deux lignes consecutives
  // finissant par une cesure, cesure sur l'avant-derniere ligne. Source : ltplain.dtx (10000, 10000, 5000).
  adjDemerits: number;
  doubleHyphenDemerits: number;
  finalHyphenDemerits: number;
  // Penalites de pagination (phase trois) : ligne orpheline, ligne veuve, page coupee sur une cesure. Source : ltplain.dtx.
  clubPenalty: number;
  widowPenalty: number;
  brokenPenalty: number;
  // Retrait de premiere ligne (alinea), en em. Convention typographique francaise : un retrait plutot qu'un espace entre
  // paragraphes. Plage : 0 a 3.
  parIndent: number;
  // Espace entre les mots, en fraction de sa largeur naturelle : etirement et compression. TeX (Computer Modern) : un tiers de
  // cadratin, etirable de la moitie et compressible du tiers de cette valeur (document de politique, paragraphe 2.2).
  spaceStretch: number;
  spaceShrink: number;
  // Etirement donne a chaque ligne (en em) pour la composition en drapeau : equivaut a \rightskip=0pt plus 2em.
  raggedStretch: number;
  // Nombre minimal de lettres laissees avant et apres une cesure. Valeurs du projet hyph-utf8 : francais 2 et 2,
  // anglais britannique 2 et 3.
  leftHyphenMin: number;
  rightHyphenMin: number;
  // Un mot plus court que ce nombre de caracteres n'est jamais coupe.
  minHyphenWordLength: number;
}

export const DEFAULT_TEX_PARAMS: TexParams = {
  pretolerance: 100,
  tolerance: 200,
  emergencyStretch: 3,
  linePenalty: 10,
  hyphenPenalty: 50,
  exHyphenPenalty: 50,
  adjDemerits: 10000,
  doubleHyphenDemerits: 10000,
  finalHyphenDemerits: 5000,
  clubPenalty: 150,
  widowPenalty: 150,
  brokenPenalty: 100,
  parIndent: 1,
  spaceStretch: 0.5,
  spaceShrink: 1 / 3,
  raggedStretch: 2,
  leftHyphenMin: 2,
  rightHyphenMin: 2,
  minHyphenWordLength: 5,
};

// Constantes de l'algorithme (tex.web).
// Laideur maximale : une ligne qui ne peut pas s'etirer assez est infiniment laide.
export const INF_BAD = 10000;
// Penalite infinie : interdit (ou impose, si negative) une coupure.
export const INF_PENALTY = 10000;
// Demerites d'une ligne dont le total (laideur + penalite de ligne) atteint 10000.
export const AWFUL_DEMERITS = 100000000;

// Classes d'espacement d'une ligne (tex.web) : 0 tres lache (etirement de plus de 99 de laideur), 1 lache (12 a 99),
// 2 normale, 3 serree (ligne comprimee de plus de 12 de laideur).
export type Fitness = 0 | 1 | 2 | 3;
export const VERY_LOOSE: Fitness = 0;
export const LOOSE: Fitness = 1;
export const DECENT: Fitness = 2;
export const TIGHT: Fitness = 3;

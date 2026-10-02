// Palettes de l'editeur de formules. Chaque modele est du TeX ; les emplacements vides « {} » se remplissent un a un (touche Tab).
// Les barres de fraction s'imbriquent en placant une fraction dans un emplacement d'une autre. Ce module ne depend pas d'Obsidian.
import type { HelpLang } from "./help";

export interface PaletteItem {
  tex: string;
  // Texte du bouton.
  label: string;
  // Infobulle : nom de la structure, ou la commande TeX elle-meme pour un symbole.
  tip: Record<HelpLang, string>;
  // Explication de l'effet du bouton (structures seulement), pour le cours de l'editeur.
  how?: Record<HelpLang, string>;
  // Formule dessinee sur le bouton (structures seulement) ; a defaut, le modele avec ses emplacements vides remplaces par un carre.
  sample?: string;
}

export interface PaletteGroup {
  id: string;
  name: Record<HelpLang, string>;
  items: PaletteItem[];
}

const R = String.raw;

const structure = (tex: string, label: string, name: [string, string], how: [string, string], sample?: string): PaletteItem => ({
  tex,
  label,
  tip: { fr: name[0], en: name[1] },
  how: { fr: how[0], en: how[1] },
  ...(sample !== undefined ? { sample } : {}),
});
// Symbole : l'infobulle montre la commande TeX, qui s'apprend ainsi en l'utilisant.
const symbol = (name: string, label: string): PaletteItem => ({ tex: `\\${name}`, label, tip: { fr: `\\${name}`, en: `\\${name}` } });
const symbols = (list: [string, string][]): PaletteItem[] => list.map(([name, label]) => symbol(name, label));

export const PALETTE: PaletteGroup[] = [
  {
    id: `structures`,
    name: { fr: `Structures`, en: `Structures` },
    items: [
      structure(R`\frac{}{}`, `a/b`, [`Fraction (à imbriquer pour plusieurs niveaux)`, `Fraction (nest for several levels)`], [`Dessine une barre de fraction avec deux emplacements : le numérateur au-dessus et le dénominateur en dessous. Pour une fraction à plusieurs niveaux, placez le curseur dans un emplacement puis cliquez de nouveau sur ce bouton.`, `Draws a fraction bar with two slots: the numerator above and the denominator below. For a multi-level fraction, put the cursor in a slot and click this button again.`]),
      structure(R`\dfrac{}{}`, `a/b ▪`, [`Fraction en grand format`, `Large fraction`], [`Comme la fraction, mais avec des caractères pleine taille même dans une formule en ligne.`, `Like the fraction, but with full-size characters even in an inline formula.`]),
      structure(R`\cfrac{}{}`, `⋰`, [`Fraction continue`, `Continued fraction`], [`Fraction dont le dénominateur contient une autre fraction, avec des niveaux de même taille.`, `A fraction whose denominator holds another fraction, with levels of the same size.`]),
      structure(R`\binom{}{}`, `(n k)`, [`Coefficient binomial`, `Binomial coefficient`], [`Deux nombres l'un au-dessus de l'autre entre parenthèses, sans barre (n parmi k).`, `Two numbers one above the other in parentheses, without a bar (n choose k).`]),
      structure(R`\sqrt{}`, `√`, [`Racine carrée`, `Square root`], [`Dessine le signe racine au-dessus du contenu de l'emplacement.`, `Draws the root sign over the content of the slot.`]),
      structure(R`\sqrt[]{}`, `ⁿ√`, [`Racine n-ième`, `n-th root`], [`Racine avec un petit nombre pour l'indice (racine cubique : 3) dans le premier emplacement et le contenu dans le second.`, `Root with a small number for the index (cube root: 3) in the first slot and the content in the second.`], R`\sqrt[n]{x}`),
      structure(`^{}`, `xⁿ`, [`Exposant`, `Superscript`], [`Place un exposant à la suite du symbole qui précède le curseur.`, `Puts a superscript after the symbol that comes before the cursor.`]),
      structure(`_{}`, `xₙ`, [`Indice`, `Subscript`], [`Place un indice à la suite du symbole qui précède le curseur.`, `Puts a subscript after the symbol that comes before the cursor.`]),
      structure(`_{}^{}`, `xₙⁿ`, [`Indice et exposant`, `Subscript and superscript`], [`Place un indice puis un exposant à la suite du symbole qui précède le curseur.`, `Puts a subscript then a superscript after the symbol that comes before the cursor.`]),
      structure(R`\sum_{}^{}`, `Σ`, [`Somme`, `Sum`], [`Signe somme avec la borne basse (i = 1) dans le premier emplacement et la borne haute dans le second.`, `Sum sign with the lower bound (i = 1) in the first slot and the upper bound in the second.`]),
      structure(R`\prod_{}^{}`, `Π`, [`Produit`, `Product`], [`Signe produit, avec ses bornes basse et haute.`, `Product sign, with its lower and upper bounds.`]),
      structure(R`\int_{}^{}`, `∫`, [`Intégrale`, `Integral`], [`Signe intégrale, avec ses bornes basse et haute.`, `Integral sign, with its lower and upper bounds.`]),
      structure(R`\iint_{}^{}`, `∬`, [`Intégrale double`, `Double integral`], [`Deux signes intégrale côte à côte, avec leurs bornes.`, `Two integral signs side by side, with their bounds.`]),
      structure(R`\oint_{}^{}`, `∮`, [`Intégrale curviligne`, `Contour integral`], [`Signe intégrale avec un cercle, pour une intégrale sur un contour fermé.`, `Integral sign with a circle, for an integral over a closed contour.`]),
      structure(R`\lim_{{} \to {}}`, `lim`, [`Limite`, `Limit`], [`Écrit lim avec, en dessous, la variable et sa valeur limite séparées par une flèche.`, `Writes lim with the variable and its limit value below, separated by an arrow.`]),
      structure(R`\frac{\partial {}}{\partial {}}`, `∂/∂`, [`Dérivée partielle`, `Partial derivative`], [`Fraction de dérivée partielle : la fonction en haut, la variable en bas.`, `Partial derivative fraction: the function on top, the variable below.`]),
      structure(R`\frac{\mathrm{d}{}}{\mathrm{d}{}}`, `d/d`, [`Dérivée`, `Derivative`], [`Fraction de dérivée : la fonction en haut, la variable en bas, avec des d droits.`, `Derivative fraction: the function on top, the variable below, with upright d.`]),
      structure(R`\left( {} \right)`, `( )`, [`Parenthèses adaptées à la hauteur`, `Height-adjusted parentheses`], [`Parenthèses qui grandissent avec leur contenu (une fraction, par exemple).`, `Parentheses that grow with their content (a fraction, for instance).`]),
      structure(R`\left[ {} \right]`, `[ ]`, [`Crochets adaptés à la hauteur`, `Height-adjusted brackets`], [`Crochets qui grandissent avec leur contenu.`, `Brackets that grow with their content.`]),
      structure(R`\left\{ {} \right\}`, `{ }`, [`Accolades adaptées à la hauteur`, `Height-adjusted braces`], [`Accolades qui grandissent avec leur contenu.`, `Braces that grow with their content.`]),
      structure(R`\left| {} \right|`, `| |`, [`Valeur absolue`, `Absolute value`], [`Barres verticales qui grandissent avec leur contenu.`, `Vertical bars that grow with their content.`]),
      structure(R`\left\| {} \right\|`, `‖ ‖`, [`Norme`, `Norm`], [`Doubles barres verticales qui grandissent avec leur contenu.`, `Double vertical bars that grow with their content.`]),
      structure(R`\begin{pmatrix} {} & {} \\ {} & {} \end{pmatrix}`, `(▦)`, [`Matrice entre parenthèses`, `Matrix in parentheses`], [`Tableau de quatre cases entre parenthèses. Dans le texte TeX, « & » sépare les colonnes et « \\\\ » les lignes : ajoutez-en pour agrandir la matrice.`, `Table of four cells in parentheses. In the TeX text, "&" separates columns and "\\\\" rows: add some to enlarge the matrix.`]),
      structure(R`\begin{bmatrix} {} & {} \\ {} & {} \end{bmatrix}`, `[▦]`, [`Matrice entre crochets`, `Matrix in brackets`], [`Même chose avec des crochets.`, `The same with brackets.`]),
      structure(R`\begin{cases} {} & {} \\ {} & {} \end{cases}`, `{▤`, [`Système ou fonction par morceaux`, `System or piecewise function`], [`Accolade à gauche et deux lignes : la valeur à gauche, sa condition à droite.`, `A brace on the left and two lines: the value on the left, its condition on the right.`]),
      structure(R`\begin{aligned} {} &= {} \\ &= {} \end{aligned}`, `=▤`, [`Lignes alignées sur le signe égal`, `Lines aligned on the equal sign`], [`Plusieurs lignes de calcul dont les signes égal sont l'un sous l'autre.`, `Several lines of calculation whose equal signs are one under the other.`]),
      structure(R`\overline{}`, `x̄`, [`Barre au-dessus`, `Overline`], [`Trace une barre au-dessus du contenu (moyenne, complémentaire).`, `Draws a bar over the content (mean, complement).`]),
      structure(R`\underline{}`, `x̲`, [`Soulignement`, `Underline`], [`Souligne le contenu.`, `Underlines the content.`]),
      structure(R`\hat{}`, `x̂`, [`Accent circonflexe`, `Hat`], [`Place un accent circonflexe au-dessus du symbole.`, `Puts a hat over the symbol.`]),
      structure(R`\vec{}`, `x⃗`, [`Vecteur`, `Vector`], [`Place une flèche au-dessus du symbole.`, `Puts an arrow over the symbol.`]),
      structure(R`\dot{}`, `ẋ`, [`Point au-dessus`, `Dot above`], [`Place un point au-dessus du symbole (dérivée par rapport au temps).`, `Puts a dot over the symbol (time derivative).`]),
      structure(R`\tilde{}`, `x̃`, [`Tilde`, `Tilde`], [`Place un tilde au-dessus du symbole.`, `Puts a tilde over the symbol.`]),
      structure(R`\overbrace{}^{}`, `⏞`, [`Accolade au-dessus`, `Brace above`], [`Accolade au-dessus du contenu, avec un emplacement pour une légende.`, `Brace over the content, with a slot for a caption.`], R`\overbrace{abc}^{n}`),
      structure(R`\underbrace{}_{}`, `⏟`, [`Accolade en dessous`, `Brace below`], [`Accolade sous le contenu, avec un emplacement pour une légende.`, `Brace under the content, with a slot for a caption.`], R`\underbrace{abc}_{n}`),
      structure(R`\text{}`, `abc`, [`Texte dans une formule`, `Text inside a formula`], [`Écrit du texte ordinaire (avec ses espaces) à l'intérieur de la formule.`, `Writes ordinary text (with its spaces) inside the formula.`], R`\text{abc}`),
      structure(R`\mathrm{}`, `Rm`, [`Caractères droits`, `Upright characters`], [`Écrit le contenu en caractères droits, au lieu des italiques des variables (unités, d de dérivée).`, `Writes the content in upright characters instead of the italics of variables (units, derivative d).`], R`\mathrm{km}`),
      structure(R`\mathbf{}`, `𝐁`, [`Caractères gras`, `Bold characters`], [`Écrit le contenu en gras (vecteurs, matrices).`, `Writes the content in bold (vectors, matrices).`], R`\mathbf{B}`),
      structure(R`\mathbb{}`, `ℝ`, [`Ensemble (R, N, Z, Q, C)`, `Blackboard bold (R, N, Z, Q, C)`], [`Lettre majuscule à double trait pour les ensembles de nombres. Tapez R, N, Z, Q ou C dans l'emplacement.`, `Double-struck capital letter for number sets. Type R, N, Z, Q or C in the slot.`], R`\mathbb{R}`),
      structure(R`\mathcal{}`, `𝒞`, [`Lettres calligraphiques`, `Calligraphic letters`], [`Lettre majuscule calligraphique (ensembles, espaces, opérateurs).`, `Calligraphic capital letter (sets, spaces, operators).`], R`\mathcal{C}`),
    ],
  },
  {
    id: `greek`,
    name: { fr: `Lettres grecques`, en: `Greek letters` },
    items: symbols([
      [`alpha`, `α`], [`beta`, `β`], [`gamma`, `γ`], [`delta`, `δ`], [`epsilon`, `ϵ`], [`varepsilon`, `ε`], [`zeta`, `ζ`], [`eta`, `η`],
      [`theta`, `θ`], [`vartheta`, `ϑ`], [`iota`, `ι`], [`kappa`, `κ`], [`lambda`, `λ`], [`mu`, `μ`], [`nu`, `ν`], [`xi`, `ξ`],
      [`pi`, `π`], [`varpi`, `ϖ`], [`rho`, `ρ`], [`varrho`, `ϱ`], [`sigma`, `σ`], [`varsigma`, `ς`], [`tau`, `τ`], [`upsilon`, `υ`],
      [`phi`, `ϕ`], [`varphi`, `φ`], [`chi`, `χ`], [`psi`, `ψ`], [`omega`, `ω`],
      [`Gamma`, `Γ`], [`Delta`, `Δ`], [`Theta`, `Θ`], [`Lambda`, `Λ`], [`Xi`, `Ξ`], [`Pi`, `Π`], [`Sigma`, `Σ`], [`Upsilon`, `Υ`],
      [`Phi`, `Φ`], [`Psi`, `Ψ`], [`Omega`, `Ω`],
    ]),
  },
  {
    id: `operators`,
    name: { fr: `Opérateurs`, en: `Operators` },
    items: symbols([
      [`pm`, `±`], [`mp`, `∓`], [`times`, `×`], [`div`, `÷`], [`cdot`, `·`], [`circ`, `∘`], [`ast`, `∗`], [`star`, `⋆`],
      [`oplus`, `⊕`], [`otimes`, `⊗`], [`ominus`, `⊖`], [`odot`, `⊙`], [`wedge`, `∧`], [`vee`, `∨`], [`cap`, `∩`], [`cup`, `∪`],
      [`setminus`, `∖`], [`partial`, `∂`], [`nabla`, `∇`], [`infty`, `∞`], [`forall`, `∀`], [`exists`, `∃`], [`nexists`, `∄`],
      [`neg`, `¬`], [`emptyset`, `∅`], [`cdots`, `⋯`], [`ldots`, `…`], [`vdots`, `⋮`], [`ddots`, `⋱`], [`prime`, `′`],
      [`degree`, `°`], [`angle`, `∠`], [`hbar`, `ℏ`], [`ell`, `ℓ`], [`Re`, `ℜ`], [`Im`, `ℑ`], [`aleph`, `ℵ`], [`therefore`, `∴`], [`because`, `∵`],
    ]),
  },
  {
    id: `relations`,
    name: { fr: `Relations`, en: `Relations` },
    items: [
      { tex: `=`, label: `=`, tip: { fr: `=`, en: `=` } },
      { tex: `<`, label: `<`, tip: { fr: `<`, en: `<` } },
      { tex: `>`, label: `>`, tip: { fr: `>`, en: `>` } },
      ...symbols([
        [`neq`, `≠`], [`approx`, `≈`], [`equiv`, `≡`], [`sim`, `∼`], [`simeq`, `≃`], [`cong`, `≅`], [`propto`, `∝`], [`leq`, `≤`], [`geq`, `≥`],
        [`ll`, `≪`], [`gg`, `≫`], [`in`, `∈`], [`notin`, `∉`], [`ni`, `∋`], [`subset`, `⊂`], [`subseteq`, `⊆`], [`supset`, `⊃`],
        [`supseteq`, `⊇`], [`perp`, `⊥`], [`parallel`, `∥`], [`mid`, `∣`], [`doteq`, `≐`], [`prec`, `≺`], [`succ`, `≻`],
      ]),
    ],
  },
  {
    id: `arrows`,
    name: { fr: `Flèches`, en: `Arrows` },
    items: symbols([
      [`to`, `→`], [`leftarrow`, `←`], [`leftrightarrow`, `↔`], [`uparrow`, `↑`], [`downarrow`, `↓`], [`Rightarrow`, `⇒`],
      [`Leftarrow`, `⇐`], [`Leftrightarrow`, `⇔`], [`mapsto`, `↦`], [`longrightarrow`, `⟶`], [`Longrightarrow`, `⟹`],
      [`Longleftrightarrow`, `⟺`], [`rightleftharpoons`, `⇌`], [`rightarrow`, `→`], [`nearrow`, `↗`], [`searrow`, `↘`],
      [`hookrightarrow`, `↪`], [`rightharpoonup`, `⇀`],
    ]),
  },
  {
    id: `functions`,
    name: { fr: `Fonctions`, en: `Functions` },
    items: symbols([
      [`sin`, `sin`], [`cos`, `cos`], [`tan`, `tan`], [`cot`, `cot`], [`arcsin`, `arcsin`], [`arccos`, `arccos`], [`arctan`, `arctan`],
      [`sinh`, `sinh`], [`cosh`, `cosh`], [`tanh`, `tanh`], [`ln`, `ln`], [`log`, `log`], [`exp`, `exp`], [`min`, `min`], [`max`, `max`],
      [`sup`, `sup`], [`inf`, `inf`], [`lim`, `lim`], [`det`, `det`], [`dim`, `dim`], [`ker`, `ker`], [`deg`, `deg`], [`gcd`, `pgcd`],
      [`arg`, `arg`], [`Pr`, `Pr`], [`hom`, `hom`],
    ]),
  },
];

// Tous les modeles de la palette (pour les tests).
export function allItems(): PaletteItem[] {
  return PALETTE.flatMap((g) => g.items);
}

// Formule dessinee sur le bouton d'une structure : l'exemple donne, sinon le modele avec ses emplacements remplis par un carre (et une
// base pour les exposants et indices).
export function sampleOf(item: PaletteItem): string {
  if (item.sample !== undefined) return item.sample;
  return (/^[_^]/.test(item.tex) ? `x` : ``) + item.tex.split(`{}`).join(String.raw`{\square}`);
}

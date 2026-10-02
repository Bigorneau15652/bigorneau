// Palettes de l'editeur de formules. Chaque modele est du TeX ; les emplacements vides « {} » se remplissent un a un (touche Tab).
// Les barres de fraction s'imbriquent en placant une fraction dans un emplacement d'une autre. Ce module ne depend pas d'Obsidian.
import type { HelpLang } from "./help";

export interface PaletteItem {
  tex: string;
  // Texte du bouton.
  label: string;
  // Infobulle : nom de la structure, ou la commande TeX elle-meme pour un symbole.
  tip: Record<HelpLang, string>;
}

export interface PaletteGroup {
  id: string;
  name: Record<HelpLang, string>;
  items: PaletteItem[];
}

const R = String.raw;

const structure = (tex: string, label: string, fr: string, en: string): PaletteItem => ({ tex, label, tip: { fr, en } });
// Symbole : l'infobulle montre la commande TeX, qui s'apprend ainsi en l'utilisant.
const symbol = (name: string, label: string): PaletteItem => ({ tex: `\\${name}`, label, tip: { fr: `\\${name}`, en: `\\${name}` } });
const symbols = (list: [string, string][]): PaletteItem[] => list.map(([name, label]) => symbol(name, label));

export const PALETTE: PaletteGroup[] = [
  {
    id: `structures`,
    name: { fr: `Structures`, en: `Structures` },
    items: [
      structure(R`\frac{}{}`, `a/b`, `Fraction (à imbriquer pour plusieurs niveaux)`, `Fraction (nest for several levels)`),
      structure(R`\dfrac{}{}`, `a/b ▪`, `Fraction en grand format`, `Large fraction`),
      structure(R`\cfrac{}{}`, `⋰`, `Fraction continue`, `Continued fraction`),
      structure(R`\binom{}{}`, `(n k)`, `Coefficient binomial`, `Binomial coefficient`),
      structure(R`\sqrt{}`, `√`, `Racine carrée`, `Square root`),
      structure(R`\sqrt[]{}`, `ⁿ√`, `Racine n-ième`, `n-th root`),
      structure(`^{}`, `xⁿ`, `Exposant`, `Superscript`),
      structure(`_{}`, `xₙ`, `Indice`, `Subscript`),
      structure(`_{}^{}`, `xₙⁿ`, `Indice et exposant`, `Subscript and superscript`),
      structure(R`\sum_{}^{}`, `Σ`, `Somme`, `Sum`),
      structure(R`\prod_{}^{}`, `Π`, `Produit`, `Product`),
      structure(R`\int_{}^{}`, `∫`, `Intégrale`, `Integral`),
      structure(R`\iint_{}^{}`, `∬`, `Intégrale double`, `Double integral`),
      structure(R`\oint_{}^{}`, `∮`, `Intégrale curviligne`, `Contour integral`),
      structure(R`\lim_{{} \to {}}`, `lim`, `Limite`, `Limit`),
      structure(R`\frac{\partial {}}{\partial {}}`, `∂/∂`, `Dérivée partielle`, `Partial derivative`),
      structure(R`\frac{\mathrm{d}{}}{\mathrm{d}{}}`, `d/d`, `Dérivée`, `Derivative`),
      structure(R`\left( {} \right)`, `( )`, `Parenthèses adaptées à la hauteur`, `Height-adjusted parentheses`),
      structure(R`\left[ {} \right]`, `[ ]`, `Crochets adaptés à la hauteur`, `Height-adjusted brackets`),
      structure(R`\left\{ {} \right\}`, `{ }`, `Accolades adaptées à la hauteur`, `Height-adjusted braces`),
      structure(R`\left| {} \right|`, `| |`, `Valeur absolue`, `Absolute value`),
      structure(R`\left\| {} \right\|`, `‖ ‖`, `Norme`, `Norm`),
      structure(R`\begin{pmatrix} {} & {} \\ {} & {} \end{pmatrix}`, `(▦)`, `Matrice entre parenthèses`, `Matrix in parentheses`),
      structure(R`\begin{bmatrix} {} & {} \\ {} & {} \end{bmatrix}`, `[▦]`, `Matrice entre crochets`, `Matrix in brackets`),
      structure(R`\begin{cases} {} & {} \\ {} & {} \end{cases}`, `{▤`, `Système ou fonction par morceaux`, `System or piecewise function`),
      structure(R`\begin{aligned} {} &= {} \\ &= {} \end{aligned}`, `=▤`, `Lignes alignées sur le signe égal`, `Lines aligned on the equal sign`),
      structure(R`\overline{}`, `x̄`, `Barre au-dessus`, `Overline`),
      structure(R`\underline{}`, `x̲`, `Soulignement`, `Underline`),
      structure(R`\hat{}`, `x̂`, `Accent circonflexe`, `Hat`),
      structure(R`\vec{}`, `x⃗`, `Vecteur`, `Vector`),
      structure(R`\dot{}`, `ẋ`, `Point au-dessus`, `Dot above`),
      structure(R`\tilde{}`, `x̃`, `Tilde`, `Tilde`),
      structure(R`\overbrace{}^{}`, `⏞`, `Accolade au-dessus`, `Brace above`),
      structure(R`\underbrace{}_{}`, `⏟`, `Accolade en dessous`, `Brace below`),
      structure(R`\text{}`, `abc`, `Texte dans une formule`, `Text inside a formula`),
      structure(R`\mathrm{}`, `Rm`, `Caractères droits`, `Upright characters`),
      structure(R`\mathbf{}`, `𝐁`, `Caractères gras`, `Bold characters`),
      structure(R`\mathbb{}`, `ℝ`, `Ensemble (R, N, Z, Q, C)`, `Blackboard bold (R, N, Z, Q, C)`),
      structure(R`\mathcal{}`, `𝒞`, `Lettres calligraphiques`, `Calligraphic letters`),
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

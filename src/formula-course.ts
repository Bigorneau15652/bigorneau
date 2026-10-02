// Cours de l'editeur de formules, en francais et en anglais : prise en main, emplacements, correction depuis l'apercu, role de chaque
// bouton des structures, puis les autres palettes. Il s'affiche dans l'editeur (bouton d'aide) et dans la fenetre d'aide du plugin.
// Ce module ne depend pas d'Obsidian.
import { PALETTE } from "./formula-palette";
import type { HelpLang } from "./help";

export interface CourseSection {
  id: string;
  title: Record<HelpLang, string>;
  text: Record<HelpLang, string>;
}

const structures = (lang: HelpLang): string =>
  (PALETTE.find((g) => g.id === `structures`)?.items ?? []).map((i) => `${i.tip[lang]} : ${i.how?.[lang] ?? ``}`).join(`\n`);

export function courseSections(): CourseSection[] {
  return [
    {
      id: `start`,
      title: { fr: `Éditeur de formules : prise en main`, en: `Formula editor: getting started` },
      text: {
        fr: `L'éditeur s'ouvre avec le bouton Formules du panneau ou avec les commandes « Insérer une formule en ligne » et « Insérer une formule en bloc ». Il se compose de quatre zones : le choix du mode en haut, les palettes par onglets, la zone de saisie où s'écrit la formule en TeX, et l'aperçu dessiné en direct. Pour écrire une formule, cliquez sur un bouton d'une palette : son modèle est inséré dans la zone de saisie à la place du curseur, et l'aperçu se met à jour. Le bouton Insérer écrit la formule dans la note ; Ctrl ou Cmd avec Entrée fait la même chose. Si le curseur de la note était dans une formule quand vous avez ouvert l'éditeur, elle s'ouvre pour être corrigée et le bouton devient Remplacer la formule. Si du texte était sélectionné, il devient le début de la formule.`,
        en: `The editor opens with the Formulas button of the panel or with the commands "Insert an inline formula" and "Insert a block formula". It has four areas: the mode choice at the top, the tabbed palettes, the input area where the formula is written in TeX, and the live drawn preview. To write a formula, click a button of a palette: its template is inserted in the input area at the cursor, and the preview updates. The Insert button writes the formula into the note; Ctrl or Cmd with Enter does the same. If the cursor of the note was inside a formula when you opened the editor, it opens for correction and the button becomes Replace the formula. If some text was selected, it becomes the start of the formula.`,
      },
    },
    {
      id: `modes`,
      title: { fr: `Formule en ligne ou en bloc`, en: `Inline or block formula` },
      text: {
        fr: `Une formule en ligne s'écrit entre deux signes dollar ($x^2$) au milieu d'une phrase ; ses structures sont compactes pour ne pas déformer la ligne. Une formule en bloc occupe ses propres lignes entre deux signes $$ ; ses structures sont en grand format, centrées, avec les bornes des sommes et des intégrales au-dessus et en dessous. Le menu du haut de l'éditeur choisit le mode, et l'aperçu change en conséquence.`,
        en: `An inline formula is written between two dollar signs ($x^2$) in the middle of a sentence; its structures are compact so as not to distort the line. A block formula takes its own lines between two $$ signs; its structures are large and centred, with the bounds of sums and integrals above and below. The menu at the top of the editor chooses the mode, and the preview changes accordingly.`,
      },
    },
    {
      id: `slots`,
      title: { fr: `Emplacements vides, touche Tab et imbrication`, en: `Empty slots, the Tab key and nesting` },
      text: {
        fr: `Un modèle de structure contient des emplacements vides, écrits « {} » dans le texte TeX. Après un clic sur un bouton, le curseur est dans le premier emplacement : tapez son contenu, puis appuyez sur Tab pour passer à l'emplacement vide suivant. Si du texte était sélectionné dans la zone de saisie, il entre dans le premier emplacement. Pour imbriquer, placez le curseur dans un emplacement et cliquez sur une autre structure : une fraction dans le dénominateur d'une fraction donne une fraction à deux niveaux, et on peut continuer autant que nécessaire. Exemple : cliquez sur Fraction, tapez 1, Tab, cliquez de nouveau sur Fraction, tapez 1, Tab, tapez 2 ; le texte TeX obtenu est \\frac{1}{\\frac{1}{2}}.`,
        en: `A structure template contains empty slots, written "{}" in the TeX text. After clicking a button, the cursor is in the first slot: type its content, then press Tab to move to the next empty slot. If some text was selected in the input area, it goes into the first slot. To nest, put the cursor in a slot and click another structure: a fraction in the denominator of a fraction gives a two-level fraction, and you can go on as much as needed. Example: click Fraction, type 1, Tab, click Fraction again, type 1, Tab, type 2; the resulting TeX text is \\frac{1}{\\frac{1}{2}}.`,
      },
    },
    {
      id: `preview`,
      title: { fr: `Corriger une formule depuis l'aperçu`, en: `Correcting a formula from the preview` },
      text: {
        fr: `On n'a pas besoin de comprendre le texte TeX pour corriger : cliquez sur un élément de l'aperçu (un chiffre, une lettre, un signe, une barre de fraction), et la partie correspondante du texte TeX est sélectionnée dans la zone de saisie, avec l'élément coloré dans l'aperçu. Un deuxième clic au même endroit sélectionne la partie plus grande qui contient l'élément : un exposant, puis la base avec son exposant, puis la structure entière. Il suffit ensuite de taper pour remplacer la partie choisie, ou d'appuyer sur Suppr ou Retour arrière pour l'effacer en entier : une petite formule de plusieurs caractères comme une racine, un exposant avec son signe ou une fraction disparaît d'un coup. Un exposant ou un indice supprimé disparaît avec son signe, et un argument de fraction ou de racine laisse son emplacement vide, prêt à être rempli.`,
        en: `You do not need to understand the TeX text to correct a formula: click an element of the preview (a digit, a letter, a sign, a fraction bar), and the matching part of the TeX text is selected in the input area, with the element coloured in the preview. A second click in the same place selects the larger part that contains the element: an exponent, then the base with its exponent, then the whole structure. Then just type to replace the chosen part, or press Delete or Backspace to erase it entirely: a small formula of several characters such as a root, an exponent with its sign or a fraction disappears at once. A deleted exponent or subscript disappears with its sign, and a fraction or root argument leaves its slot empty, ready to be filled.`,
      },
    },
    {
      id: `structures`,
      title: { fr: `Palette Structures : rôle de chaque bouton`, en: `Structures palette: what each button does` },
      text: { fr: structures(`fr`), en: structures(`en`) },
    },
    {
      id: `symbols`,
      title: { fr: `Palettes de symboles`, en: `Symbol palettes` },
      text: {
        fr: `Lettres grecques : minuscules et majuscules, avec leurs variantes (phi et varphi, epsilon et varepsilon, rho et varrho). Opérateurs : signes plus ou moins, produits, ensembles (union, intersection), quantificateurs (pour tout, il existe), infini, dérivée partielle, points de suspension. Relations : égalité, inégalités, équivalence, appartenance, inclusion, parallélisme, proportionnalité. Flèches : implications, équivalences, correspondances, limites. Fonctions : sinus, logarithme, exponentielle, minimum, maximum, limite, déterminant, avec le nom en caractères droits comme l'exige l'usage typographique. Passez la souris sur un bouton pour voir sa commande TeX : c'est ainsi que l'on apprend à l'écrire directement. Un symbole qui se termine par une lettre est suivi d'une espace automatiquement.`,
        en: `Greek letters: lowercase and uppercase, with their variants (phi and varphi, epsilon and varepsilon, rho and varrho). Operators: plus or minus signs, products, sets (union, intersection), quantifiers (for all, there exists), infinity, partial derivative, ellipses. Relations: equality, inequalities, equivalence, membership, inclusion, parallelism, proportionality. Arrows: implications, equivalences, mappings, limits. Functions: sine, logarithm, exponential, minimum, maximum, limit, determinant, with the name in upright characters as typographic practice requires. Hover over a button to see its TeX command: this is how you learn to write it directly. A symbol that ends with a letter is followed by a space automatically.`,
      },
    },
    {
      id: `tex`,
      title: { fr: `Quelques notions de TeX`, en: `A few TeX notions` },
      text: {
        fr: `Une commande commence par une barre oblique inverse (\\alpha, \\frac). Les accolades { } regroupent : x^{10} met 10 en exposant, alors que x^10 ne met que 1. Le signe ^ ouvre un exposant et le signe _ un indice. Les espaces tapées dans une formule sont ignorées : TeX règle lui-même les espaces entre les symboles. Pour écrire du texte avec ses espaces, utilisez le bouton Texte (\\text{ma phrase}). Si l'aperçu indique qu'une formule n'est pas reconnue, vérifiez que chaque accolade ouverte est fermée et que les noms de commandes sont bien écrits ; un emplacement vide peut aussi poser problème dans les commandes de texte comme \\text{}.`,
        en: `A command starts with a backslash (\\alpha, \\frac). Braces { } group: x^{10} puts 10 in the exponent, whereas x^10 only puts the 1. The ^ sign opens a superscript and the _ sign a subscript. Spaces typed in a formula are ignored: TeX sets the spaces between symbols itself. To write text with its spaces, use the Text button (\\text{my sentence}). If the preview says a formula is not recognised, check that every opened brace is closed and that command names are spelled correctly; an empty slot can also be a problem in text commands such as \\text{}.`,
      },
    },
  ];
}

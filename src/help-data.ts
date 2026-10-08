// Textes d'aide du plugin, en francais et en anglais. Chaque entree est trouvee par la recherche de la fenetre d'aide (titre,
// mots-cles et texte). Les scripts ajouteront les leurs avec HelpRegistry.add.
import type { HelpEntry } from "./help";

export const PLUGIN_HELP: HelpEntry[] = [
  {
    id: `map-basics`,
    title: { fr: `Écrire avec la carte`, en: `Writing with the map` },
    text: {
      fr: `La carte de la note active s'ouvre avec l'icône du ruban ou avec la commande « Ouvrir la carte de la note active ». La première case porte le nom de la note, et chaque titre Markdown est un chapitre. Chaque case porte le paragraphe de son titre : la carte sert à écrire et à réorganiser un long texte.`,
      en: `The map of the active note opens with the ribbon icon or with the command "Open the map of the active note". The first node holds the name of the note, and every Markdown heading is a chapter. Each node holds the paragraph of its heading: the map is a way to write and reorganise a long text.`,
    },
    keywords: { fr: `carte mentale mindmap ouvrir chapitre titre noeud case`, en: `mind map mindmap open chapter heading node` },
  },
  {
    id: `map-keys`,
    title: { fr: `Raccourcis de la carte`, en: `Map shortcuts` },
    text: {
      fr: `Tab crée un sous-titre, Entrée un titre de même niveau, Suppr supprime un titre après confirmation. Un double clic ou F2 ouvre la fenêtre du titre. Cmd ou Ctrl avec Maj et les flèches déplacent un titre avec sa branche, Cmd ou Ctrl avec C, X et V copient, coupent et collent des titres. Cmd ou Ctrl avec Maj et Entrée fait l'aller-retour entre la carte et la note.`,
      en: `Tab creates a sub-heading, Enter a heading of the same level, Delete removes a heading after a confirmation. A double click or F2 opens the window of the heading. Cmd or Ctrl with Shift and the arrow keys move a heading with its branch, Cmd or Ctrl with C, X and V copy, cut and paste headings. Cmd or Ctrl with Shift and Enter switches between the map and the note.`,
    },
    keywords: { fr: `clavier touches deplacer copier coller supprimer`, en: `keyboard keys move copy paste delete` },
  },
  {
    id: `labels`,
    title: { fr: `Étiquettes, titre court et commentaire`, en: `Labels, short title and comment` },
    text: {
      fr: `La fenêtre d'un titre permet d'écrire un titre court, affiché sur la carte seulement, un commentaire et des étiquettes. Les étiquettes ont un nom, une couleur de fond et une couleur de texte, en nombre illimité, et se définissent dans le menu de la carte. Tout cela est conservé dans un commentaire invisible sous le titre.`,
      en: `The window of a heading lets you write a short title, shown on the map only, a comment and labels. Labels have a name, a background colour and a text colour, with no limit on their number, and are defined in the menu of the map. All of it is kept in an invisible comment under the heading.`,
    },
    keywords: { fr: `etiquette tag couleur commentaire bulle`, en: `label tag colour color comment` },
  },
  {
    id: `hide`,
    title: { fr: `Masquer des titres`, en: `Hiding headings` },
    text: {
      fr: `L'œil qui apparaît au survol d'une case masque le titre et ses sous-titres dans la note : le texte reste dans le fichier et les cases restent sur la carte, grisées. Ces titres ne sont pas exportés en PDF. Le menu burger permet aussi de n'afficher que le chapitre actif dans la note.`,
      en: `The eye that appears when you hover a node hides the heading and its sub-headings in the note: the text stays in the file and the nodes stay on the map, greyed out. These headings are not exported to PDF. The burger menu can also show only the active chapter in the note.`,
    },
    keywords: { fr: `oeil cacher masquer griser chapitre actif`, en: `eye hide grey active chapter` },
  },
  {
    id: `links`,
    title: { fr: `Liens entre titres et vers d'autres notes`, en: `Links between headings and to other notes` },
    text: {
      fr: `Le bouton en forme de chaîne écrit un lien au début du texte du titre de départ et trace une flèche en pointillé vers la cible. La fenêtre cherche aussi dans les notes du coffre : un lien peut viser une autre note, qui apparaît dans une case à gauche de la carte. Une mappemonde apparaît sur un titre dont le paragraphe contient des liens web ou des vidéos.`,
      en: `The chain button writes a link at the start of the text of the first heading and draws a dotted arrow to the target. The window also searches the notes of the vault: a link can point to another note, which appears as a node on the left of the map. A globe appears on a heading whose paragraph contains web links or videos.`,
    },
    keywords: { fr: `lien chaine fleche note cible mappemonde web`, en: `link chain arrow note target globe web` },
  },
  {
    id: `list-view`,
    title: { fr: `Vue Liste`, en: `List view` },
    text: {
      fr: `La vue Liste condense la carte en un titre par ligne, décalé selon son niveau, avec un triangle pour replier les enfants et le même glisser-déposer pour réorganiser les titres. La liste est un cadre fixe qui épouse son contenu : le titre de la note reste en haut, la glissière, la molette ou les flèches font défiler les lignes, et un titre trop long est coupé par des points de suspension (le titre complet s'affiche au survol). On bascule avec le bouton de la barre de commandes ou avec la commande « Basculer entre la vue Mindmap et la vue Liste ».`,
      en: `The List view condenses the map into one heading per line, indented by level, with a triangle to fold the children and the same drag and drop to reorganise headings. The list is a fixed frame that fits its content: the title of the note stays at the top, the scroll bar, the wheel or the arrow keys scroll the lines, and a heading that is too long is cut with an ellipsis (the full title appears on hover). Switch with the button of the command bar or with the command "Switch between Mindmap view and List view".`,
    },
    keywords: { fr: `liste condensee replier basculer`, en: `list condensed fold switch` },
  },
  {
    id: `pinned`,
    title: { fr: `Notes fixes`, en: `Pinned notes` },
    text: {
      fr: `Une note fixe copie le chapitre sélectionné dans son propre volet, au-dessus de la note dynamique qui suit la carte. Utilisez « Ajouter une note fixe » dans le menu burger ou la commande du même nom. Un clic dans une note fixe la rend dynamique.`,
      en: `A pinned note copies the selected chapter into its own pane, above the dynamic note that follows the map. Use "Add a pinned note" in the burger menu or the command of the same name. A click in a pinned note makes it dynamic.`,
    },
    keywords: { fr: `note fixe volet dynamique`, en: `fixed pinned pane dynamic` },
  },
  {
    id: `floats`,
    title: { fr: `Sujets flottants`, en: `Floating topics` },
    text: {
      fr: `Un double clic sur le fond de la carte crée un sujet de notes libre, rattaché à aucun chapitre. On le déplace autour de la carte, et déposé près de la structure il entre dans la carte à cet endroit. Les sujets flottants ne sont pas exportés en PDF.`,
      en: `A double click on the background of the map creates a free topic that belongs to no chapter. It moves freely around the map, and dropped near the structure it joins the map at that place. Floating topics are not exported to PDF.`,
    },
    keywords: { fr: `flottant libre ovale vrac`, en: `floating free oval` },
  },
  {
    id: `appearance`,
    title: { fr: `Apparence : formes, couleurs et traits`, en: `Appearance: shapes, colours and lines` },
    text: {
      fr: `Le panneau Apparence (palette) propose six formes pour les cases, des couleurs, des types de ligne et l'alignement du texte. Les choix s'appliquent à toute la carte, à un niveau ou à un seul titre, selon la portée choisie en haut du panneau.`,
      en: `The Appearance panel (palette) offers six shapes for the nodes, colours, line types and text alignment. The choices apply to the whole map, to one level or to one heading, depending on the scope chosen at the top of the panel.`,
    },
    keywords: { fr: `forme couleur trait palette style`, en: `shape colour color line palette style` },
  },
  {
    id: `export`,
    title: { fr: `Exporter en PDF`, en: `Exporting to PDF` },
    text: {
      fr: `Le bouton « Aperçu et export PDF de la note » du panneau de la note (ou la commande du même nom) ouvre un volet qui montre la note en pages A4, et son bouton « Exporter en PDF… » (ou la commande « Exporter la note en PDF ») écrit le PDF dans le coffre, par défaut dans le dossier de la note, après confirmation avant de remplacer un fichier. L'aperçu et le PDF sont identiques. L'export n'existe que sur ordinateur. Les titres masqués, les sujets flottants et les commentaires du plugin ne sont pas exportés.`,
      en: `The "Preview and PDF export of the note" button of the note panel (or the command of the same name) opens a pane that shows the note as A4 pages, and its "Export to PDF…" button (or the command "Export the note to PDF") writes the PDF into the vault, in the folder of the note by default, after asking for confirmation before replacing a file. The preview and the PDF are identical. The export exists on desktop only. Hidden headings, floating topics and plugin comments are not exported.`,
    },
    keywords: { fr: `pdf apercu exporter imprimer document long`, en: `pdf preview export print long document` },
  },
  {
    id: `typography`,
    title: { fr: `Typographie de l'export`, en: `Typography of the export` },
    text: {
      fr: `Le texte est composé avec l'algorithme de coupure de lignes de Knuth et Plass, la césure française ou anglaise britannique (propriété lang: en pour l'anglais) et les règles de la typographie française. La ponctuation en bout de ligne dépasse légèrement dans la marge (protrusion). Les pages évitent les lignes veuves et orphelines. La police est Libertinus Serif, incorporée au PDF.`,
      en: `The text is set with the line breaking algorithm of Knuth and Plass, French or British English hyphenation (property lang: en for English) and the rules of French typography. Punctuation at the end of a line protrudes slightly into the margin. Pages avoid widows and orphans. The font is Libertinus Serif, embedded in the PDF.`,
    },
    keywords: { fr: `cesure justification protrusion police libertinus veuve orpheline langue`, en: `hyphenation justification protrusion font libertinus widow orphan language` },
  },
  {
    id: `footnotes`,
    title: { fr: `Notes de bas de page`, en: `Footnotes` },
    text: {
      fr: `Une note s'écrit [^id] dans le texte avec sa définition [^id]: texte n'importe où dans la note, ou directement ^[texte]. Elle est placée en bas de la page de son appel, avec un filet, et se prolonge sur la page suivante si elle est trop longue. La commande « Insérer une note de bas de page » écrit ^[] et place le curseur à l'intérieur.`,
      en: `A footnote is written [^id] in the text with its definition [^id]: text anywhere in the note, or directly ^[text]. It is placed at the bottom of the page of its call, with a rule, and continues on the next page if it is too long. The command "Insert a footnote" writes ^[] and puts the cursor inside.`,
    },
    keywords: { fr: `note bas page appel renvoi`, en: `footnote note call` },
  },
  {
    id: `tables`,
    title: { fr: `Tableaux et légendes`, en: `Tables and captions` },
    text: {
      fr: `Un tableau Markdown est composé dans un style sobre : filets en haut, sous l'en-tête et en bas, en-tête en gras, pas de quadrillage. L'alignement des colonnes vient de la ligne de séparation (:--, :-:, --:). Un tableau long est coupé entre deux lignes avec son en-tête répété. Une ligne « Tableau : ... » ou « Table: ... » juste au-dessus du tableau en est la légende, numérotée automatiquement. La commande « Insérer une légende de tableau » l'écrit. Le bouton « Insérer un tableau » ouvre une grille de 9 cases sur 9 : on la survole depuis la case en haut à gauche et on clique pour choisir les lignes et les colonnes. Trois interrupteurs ajoutent une ligne d'en-tête foncée à écriture blanche, une alternance de lignes et une ligne pour le nom du tableau (écrite au-dessus). Ces choix sont gardés dans un commentaire %% mmw-table %% au-dessus du tableau, montrés dans la note et reproduits par l'export, avec des colonnes de même largeur. Dans l'aperçu en direct, un triangle au bord droit et au bord bas du tableau ajoute une colonne ou une ligne ; le clic droit sur une cellule insère, supprime et déplace des lignes et des colonnes, aligne une colonne et règle le style et le nom.`,
      en: `A Markdown table is set in a sober style: rules at the top, under the header and at the bottom, bold header, no grid. Column alignment comes from the separator row (:--, :-:, --:). A long table is split between rows with its header repeated. A line "Table: ..." or "Tableau : ..." directly above the table is its caption, numbered automatically. The command "Insert a table caption" writes it. The "Insert a table" button opens a 9 by 9 grid: hover it from the top-left cell and click to choose rows and columns. Three switches add a dark header row with white text, alternating rows and a line for the name of the table (written above). These choices are kept in a %% mmw-table %% comment above the table, shown in the note and reproduced by the export, with columns of equal width. In the live preview, a triangle at the right and bottom edge of the table adds a column or a row; a right click on a cell inserts, deletes and moves rows and columns, aligns a column and sets the style and the name.`,
    },
    keywords: { fr: `tableau legende colonne alignement`, en: `table caption column alignment` },
  },
  {
    id: `figures`,
    title: { fr: `Figures et images`, en: `Figures and images` },
    text: {
      fr: `Une figure s'écrit ![[plan.png|Légende]] ou ![[plan.png|Légende|400]] avec une largeur en pixels. Les formats PNG, JPEG, WebP, GIF et SVG sont acceptés, réduits à 300 points par pouce au plus. La légende s'affiche « Figure 1 : Légende ». Une image introuvable ou une image du web, jamais téléchargée, est remplacée par un repère et signalée dans le compte rendu de l'export. Les figures et les tableaux légendés flottent en haut ou en bas de la page. Un dessin Excalidraw s'écrit de la même façon (![[schema.excalidraw|Nom du dessin]]) et s'imprime par son export image : activez l'export automatique en SVG ou en PNG dans les réglages d'Excalidraw. Le bouton Dessiner crée un dessin Excalidraw, l'intègre à la note et demande son nom ; le bouton d'insertion d'image place une image ou un dessin du coffre avec son nom. Une figure sans nom n'a ni légende ni numéro et n'est pas référencée. Un réglage de l'export place la légende sous la figure ou au-dessus. Dans l'aperçu en direct, la légende « Figure N : Nom » s'affiche sous la figure nommée, et le numéro des tableaux nommés s'affiche dans leur ligne « Tableau : Nom » (Tableau 1 : Nom), avec la numérotation de l'export. La légende d'un tableau s'écrit à la création du tableau ou avec son menu clic droit.`,
      en: `A figure is written ![[plan.png|Caption]] or ![[plan.png|Caption|400]] with a width in pixels. PNG, JPEG, WebP, GIF and SVG are supported, reduced to at most 300 dots per inch. The caption reads "Figure 1: Caption". A missing image, or a web image which is never downloaded, is replaced by a marker and listed in the export report. Captioned figures and tables float at the top or bottom of the page. An Excalidraw drawing is written the same way (![[diagram.excalidraw|Name of the drawing]]) and is printed through its image export: turn on automatic SVG or PNG export in the Excalidraw settings. The Draw button creates an Excalidraw drawing, embeds it in the note and asks for its name; the image insertion button places an image or a drawing of the vault with its name. A figure without a name has no caption or number and is not referenced. An export setting places the caption below the figure or above it. In live preview, the caption "Figure N: Name" appears under a named figure, and the number of named tables appears in their "Table: Name" line (Table 1: Name), with the numbering of the export. A table caption is written when the table is created or with its right-click menu.`,
    },
    keywords: { fr: `figure image legende png jpeg svg flottant dessin excalidraw dessiner nom`, en: `figure image caption png jpeg svg floating drawing excalidraw draw name` },
  },
  {
    id: `references`,
    title: { fr: `Renvois`, en: `Cross-references` },
    text: {
      fr: `[[#Titre]] devient un lien cliquable vers le titre. Pour viser une figure ou un tableau, ajoutez un identifiant de bloc en fin de ligne, par exemple ![[plan.png|Plan]] ^plan, ou ^conso seul sur la ligne après un tableau, puis écrivez [[#^plan]] : le renvoi s'affiche « Figure 1 ». Un réglage ajoute « (page N) » après le texte du renvoi.`,
      en: `[[#Heading]] becomes a clickable link to the heading. To point to a figure or a table, add a block identifier at the end of the line, for example ![[plan.png|Plan]] ^plan, or ^conso alone on the line after a table, then write [[#^plan]]: the reference reads "Figure 1". A setting adds "(page N)" after the text of the reference.`,
    },
    keywords: { fr: `renvoi reference lien identifiant bloc page`, en: `reference cross-reference link block identifier page` },
  },
  {
    id: `toc`,
    title: { fr: `Tables des matières`, en: `Tables of contents` },
    text: {
      fr: `Une table des matières générale est ajoutée sous le titre quand la note a la propriété toc: true ou quand les réglages la demandent ; toc-depth: 2 limite les niveaux. chapter-toc: true ajoute au début de chaque chapitre de plus haut niveau une table de ses sous-titres, avec chapter-toc-depth: 3 pour ses niveaux. Les numéros de page sont calculés après la mise en page. Les propriétés de la note l'emportent sur les réglages. La commande « Activer ou désactiver la table des matières de la note » bascule toc.`,
      en: `A general table of contents is added under the title when the note has the property toc: true or when the settings ask for it; toc-depth: 2 limits the levels. chapter-toc: true adds at the start of each top-level chapter a table of its sub-headings, with chapter-toc-depth: 3 for its levels. Page numbers are computed after the layout. The properties of the note override the settings. The command "Turn the table of contents of the note on or off" toggles toc.`,
    },
    keywords: { fr: `table matieres sommaire toc niveaux chapitre propriete`, en: `table contents toc levels chapter property` },
  },
  {
    id: `formulas`,
    title: { fr: `Formules`, en: `Formulas` },
    text: {
      fr: `Les formules s'écrivent $formule$ dans le texte et $$formule$$ sur leurs propres lignes. Elles sont dessinées par MathJax et écrites dans le PDF en dessin vectoriel. Cela demande le script Formules, désactivé par défaut : activez-le avec le bouton bigorneau du panneau. Sans lui, les formules restent écrites telles quelles dans le PDF, et le bouton de l'éditeur de formules n'existe pas. L'éditeur de formules (bouton du panneau, ou commandes « Insérer une formule en ligne » et « Insérer une formule en bloc ») ouvre une fenêtre avec des palettes par onglets (structures, lettres grecques, opérateurs, relations, flèches, fonctions), une zone de saisie en TeX et un aperçu dessiné en direct. Une fraction se place dans l'emplacement d'une autre pour faire plusieurs niveaux, et la touche Tab passe à l'emplacement vide suivant. L'aperçu est aussi un éditeur visuel : après un clic dedans, les flèches déplacent le curseur dans la formule (haut et bas entre numérateur et dénominateur), et on tape directement ; le cours illustré de l'éditeur est dans cette aide et derrière le bouton Aide et cours. Si le curseur est dans une formule, l'éditeur l'ouvre et la remplace à la validation ; Ctrl ou Cmd avec Entrée valide. Une formule refusée par MathJax est gardée telle qu'elle est écrite et signalée.`,
      en: `Formulas are written $formula$ inside the text and $$formula$$ on their own lines. They are drawn by MathJax and written in the PDF as vector graphics. This needs the Formulas script, which is off by default: turn it on with the bigorneau button of the panel. Without it, formulas stay written as they are in the PDF, and the formula editor button does not exist. The formula editor (panel button, or the commands "Insert an inline formula" and "Insert a block formula") opens a window with tabbed palettes (structures, Greek letters, operators, relations, arrows, functions), a TeX input area and a live drawn preview. A fraction goes into a slot of another one to make several levels, and the Tab key moves to the next empty slot. The preview is also a visual editor: after a click in it, the arrows move the cursor inside the formula (up and down between numerator and denominator), and you type directly; the illustrated course of the editor is in this help and behind the Help and course button. If the cursor is inside a formula, the editor opens it and replaces it when you confirm; Ctrl or Cmd with Enter confirms. A formula rejected by MathJax is kept as written and reported.`,
    },
    keywords: { fr: `formule mathematique latex mathjax equation`, en: `formula math latex mathjax equation` },
  },
  {
    id: `page-layout`,
    title: { fr: `En-tête, pied de page et bord extérieur`, en: `Header, footer and outer edge` },
    text: {
      fr: `Le script Mise en page, désactivé par défaut (bouton bigorneau du panneau), ajoute un bouton Format de la page (feuille A3, A4, A5, A6, B5, lettre et légal américains, livres 6 x 9 et 5,5 x 8,5 pouces ; portrait ou paysage ; marges étroites, normales ou larges ; une à plusieurs colonnes, selon la largeur de la feuille, les notes de bas de page se plaçant au bas de leur colonne) et un bouton Mise en page qui ouvre une fenêtre à trois onglets : En-tête, Pied de page et Bord extérieur. Les trois fonctionnent de la même manière, le texte du bord extérieur étant écrit à 90 degrés (il descend à droite des pages de droite et monte à gauche des pages de gauche). Le bouton est plus contrasté quand la note utilise au moins une bande. Les réglages sont propres à chaque note et écrits dans une ligne de commentaire sous les propriétés (%% mmw-page {...} %%, masquée dans l'aperçu en direct). Une bande apparaît dès qu'une de ses zones est remplie. Elle a trois zones (gauche, centre, droite ; haut, milieu, bas pour le bord extérieur) de trois lignes au plus, écrites avec un balisage simple : **gras**, *italique*, {xs} {s} {m} {l} pour la taille, {document} {chapter} {section} {author} {date} {created} {modified} {page} pour les valeurs variables (date du jour, date de création et de dernière modification de la note), et ![[image.png|200]] pour une image ou un dessin Excalidraw, choisis parmi tous ceux du coffre. Comme dans Obsidian, le nombre après le trait vertical est la largeur en pixels ; l'image est ramenée à 300 pixels de large et 60 pixels de haut au plus, en gardant ses proportions. Le numéro de page s'écrit {page} dans n'importe quelle zone ; un chapitre à déplier de chaque bande règle la forme (rond, carré, carré aux coins arrondis), le remplissage, le contour et la couleur du numéro (sélecteur ou code hexadécimal, ou aucun), et si le numéro reste droit sur le bord extérieur. L'auteur est la propriété author de la note, sinon le réglage Auteur du PDF ; il se renseigne aussi dans la fenêtre. Un autre chapitre à déplier donne à chaque zone un cadre de couleur ajusté à son texte (forme, remplissage, contour, couleur du texte, marge), par exemple pour des onglets colorés sur le bord. Un réglage d'éloignement, en millimètres, place la bande par rapport au bord de la page : 0 colle le texte ou son cadre au bord. Un aperçu sous les zones montre le résultat. Les pages de gauche peuvent différer de celles de droite. Un réglage supprime les trois bandes de la première page. Un bouton Paragraphes règle, pour toute la note, le début des paragraphes (retrait de la première ligne ou espace S, M ou L de 4, 8 et 14 points entre les paragraphes, sans retrait) et leur alignement (justifié, à gauche, à droite, centré). Un bouton distinct, Ce paragraphe seulement (le pied de mouche entre deux lignes), permet une exception pour le seul paragraphe où se trouve le curseur : une étiquette cachée du type %% p: droite, espace m %% est écrite au début de sa ligne (visible seulement quand le curseur y est) et peut être retirée par le bouton Retirer l'exception. La fenêtre Format de la page montre un schéma à l'échelle de la feuille, de ses marges et de ses colonnes ; à partir de deux colonnes, l'espace entre elles se règle en S, M ou L (0,5, 1 ou 1,5 cm). Un bouton Orientation de la page fait passer le bloc du curseur (grand tableau, grande image) en paysage ou en portrait, avec son propre nombre de colonnes, alors que le reste de la note garde son orientation : une étiquette cachée du type %% page: paysage, 2 colonnes, seulement %% est écrite avant le bloc. Avec le mot seulement, la feuille reprend son orientation après le bloc ; sans lui, la nouvelle orientation dure jusqu'à la prochaine étiquette. Les en-têtes, pieds de page et numéros se replacent sur chaque feuille et la numérotation continue. Un bouton Listes des figures et des tableaux place, à l'endroit du curseur, une étiquette cachée %% liste: figures %% ou %% liste: tableaux %% : à l'export, la liste correspondante apparaît à cet endroit, avec le numéro de page de chaque figure ou tableau nommé, cliquable dans le PDF. Sans étiquette, il n'y a pas de liste ; le bouton permet aussi de déplacer ou de retirer une liste. Quand le curseur est sur un titre, la liste est placée juste sous ce titre et, si ce titre la nomme (Liste des figures), elle n'ajoute pas le sien. Dans l'aperçu en direct, l'étiquette est remplacée par une mention qui indique où la liste sera placée. Un bouton Polices et titres règle le corps de texte, le titre du document, les titres de niveau 1 à 6, les légendes, les notes de bas de page et le texte de l'en-tête et du pied de page : police, taille (plus ou moins haut, en pourcentage de la taille d'origine), gras et italique, puis pour les titres la casse (majuscules, minuscules, initiales en majuscules), le soulignement et la numérotation (décimale 1, 1.1, 1.1.1 ou en plan I, A, 1, a). Le réglage vaut pour toutes les notes (aussi accessible dans les réglages du plugin) ou pour la note ouverte seulement, qui ne garde alors que ce qui diffère du style général. Pour ajouter des polices, déposez des fichiers .ttf ou .otf dans le dossier des polices (Bigorneau/Polices par défaut, modifiable dans les réglages), un fichier par style (normal, italique, gras, gras italique) : pour Google Fonts, prenez ceux du dossier static du téléchargement ; pour DaFont, ceux du fichier zip. Les formats WOFF, les collections .ttc et les polices variables ne sont pas pris en charge, et une police dont la licence interdit l'incorporation est refusée. Certaines polices de DaFont n'ont pas de lettres accentuées : les caractères absents sont signalés dans le compte rendu de l'export. Vérifiez la licence de chaque police avant de diffuser un document.`,
      en: `The Page layout script, off by default (bigorneau button of the panel), adds a Page format button (sheet A3, A4, A5, A6, B5, US Letter and Legal, books 6 x 9 and 5.5 x 8.5 in; portrait or landscape; narrow, normal or wide margins; one to several columns, depending on the width of the sheet, footnotes going at the bottom of their column) and a Page layout button that opens a window with three tabs: Header, Footer and Outer edge. The three work the same way, the text of the outer edge being written at 90 degrees (it runs downwards on the right of right pages and upwards on the left of left pages). The button is more contrasted when the note uses at least one band. Settings belong to each note and are written in a comment line under the properties (%% mmw-page {...} %%, hidden in live preview). A band appears as soon as one of its zones is filled in. It has three zones (left, centre, right; top, middle, bottom for the outer edge) of at most three lines, written with simple markup: **bold**, *italic*, {xs} {s} {m} {l} for the size, {document} {chapter} {section} {author} {date} {created} {modified} {page} for variable values (today's date, creation and last modification date of the note), and ![[image.png|200]] for an image or an Excalidraw drawing, chosen among all those of the vault. As in Obsidian, the number after the vertical bar is the width in pixels; the image is limited to 300 pixels wide and 60 pixels high, keeping its proportions. The page number is written {page} in any zone; a foldable section of each band sets the shape (round, square, rounded square), the fill, the outline and the number colour (picker or hexadecimal code, or none), and whether the number stays upright on the outer edge. The author is the author property of the note, otherwise the PDF author setting; it can also be entered in the window. Another foldable section gives each zone a coloured frame fitted to its text (shape, fill, outline, text colour, padding), for example for coloured tabs on the edge. A distance setting, in millimetres, places the band relative to the page edge: 0 puts the text or its frame against the edge. A preview under the zones shows the result. Left pages may differ from right pages. One setting removes the three bands from the first page. A Paragraphs button sets, for the whole note, how paragraphs start (first-line indent, or a 4, 8 or 14 pt space S, M or L between paragraphs with no indent) and their alignment (justified, left, right, centred). A separate button, This paragraph only (the pilcrow between lines), allows an exception for the paragraph under the cursor only: a hidden label such as %% p: right, space m %% is written at the start of its line (visible only while the cursor is on it) and can be removed with the Remove the exception button. The Page format window shows a to-scale diagram of the sheet, margins and columns; from two columns on, the space between them is set to S, M or L (0.5, 1 or 1.5 cm). A Page orientation button turns the block under the cursor (large table, large picture) to landscape or portrait, with its own number of columns, while the rest of the note keeps its orientation: a hidden label such as %% page: landscape, 2 columns, only %% is written before the block. With the word only, the sheet goes back to its orientation after the block; without it, the new orientation lasts until the next label. Headers, footers and numbers are placed again on each sheet and the numbering goes on. A Lists of figures and tables button places, at the cursor, a hidden label %% list: figures %% or %% list: tables %%: on export the matching list appears at that spot, with the page number of every named figure or table, clickable in the PDF. Without a label there is no list; the button also moves or removes a list. When the cursor is on a title, the list goes right under that title and, if the title names it (List of figures), it does not add its own. In live preview the label is replaced by a note showing where the list will go. A Fonts and headings button sets the body text, the document title, heading levels 1 to 6, captions, footnotes and the header and footer text: font, size (larger or smaller, as a percentage of the original size), bold and italic, then for headings the case (uppercase, lowercase, capitalized words), underline and numbering (decimal 1, 1.1, 1.1.1 or outline I, A, 1, a). The setting applies to all notes (also available in the plugin settings) or to the open note only, which then keeps only what differs from the general style. To add fonts, drop .ttf or .otf files into the fonts folder (Bigorneau/Polices by default, changeable in the settings), one file per style (regular, italic, bold, bold italic): for Google Fonts use those of the static folder of the download; for DaFont those of the zip file. WOFF formats, .ttc collections and variable fonts are not supported, and a font whose licence forbids embedding is refused. Some DaFont fonts have no accented letters: missing characters are listed in the export report. Check the licence of each font before sharing a document.`,
    },
    keywords: { fr: `en-tete pied page bord exterieur onglet numerotation numero pagination script zones image excalidraw`, en: `header footer page outer edge tab numbering number pagination script zones image excalidraw` },
  },
  {
    id: `lorem`,
    title: { fr: `Texte Lorem ipsum`, en: `Lorem ipsum text` },
    text: {
      fr: `Le bouton LI génère du latin de remplissage, comme le site lipsum.com. Une petite fenêtre demande la taille des paragraphes en lignes : 6 donne un paragraphe d'environ 6 lignes, et 6,4,2 donne trois paragraphes de 6, 4 et 2 lignes (une ligne vaut environ 90 caractères, comme dans l'export PDF). Le texte est écrit à la place du curseur. Un interrupteur ajoute une ligne vide entre les paragraphes dans la note ; l'export donne la même mise en page dans les deux cas.`,
      en: `The LI button generates filler Latin, like the lipsum.com site. A small window asks for the size of the paragraphs in lines: 6 gives one paragraph of about 6 lines, and 6,4,2 gives three paragraphs of 6, 4 and 2 lines (a line is about 90 characters, as in the PDF export). The text is written at the cursor. A switch adds a blank line between paragraphs in the note; the export gives the same layout in both cases.`,
    },
    keywords: { fr: `lorem ipsum latin texte remplissage paragraphe generer bouton li`, en: `lorem ipsum latin filler text paragraph generate button li` },
  },
  {
    id: `scripts`,
    title: { fr: `Scripts`, en: `Scripts` },
    text: {
      fr: `Les scripts ajoutent des fonctions à Bigorneau : chacun apporte ses boutons et ses commandes. Le bouton bigorneau, en haut du panneau, ouvre la fenêtre des scripts : on y active ou désactive chaque script. Désactiver un script le rend inactif tout de suite, mais son code ne se décharge qu'au redémarrage d'Obsidian. Le script Formules est intégré au plugin et désactivé par défaut. On peut aussi ajouter un script écrit à la main (fichier JavaScript avec un en-tête) : il est copié dans le dossier technique du plugin, confirmé avant son premier lancement et confirmé de nouveau s'il change. Un script a les mêmes pouvoirs que le plugin : n'ajoutez que des scripts dont vous connaissez l'origine.`,
      en: `Scripts add functions to Bigorneau: each one brings its own buttons and commands. The bigorneau button at the top of the panel opens the scripts window, where each script is turned on or off. Turning a script off makes it inactive at once, but its code is only unloaded when Obsidian restarts. The Formulas script is built into the plugin and off by default. You can also add a script written by hand (a JavaScript file with a header): it is copied into the technical folder of the plugin, confirmed before its first run and confirmed again if it changes. A script has the same powers as the plugin: only add scripts whose origin you know.`,
    },
    keywords: { fr: `script scripts bigorneau activer desactiver ajouter fichier javascript extension`, en: `script scripts bigorneau enable disable add file javascript extension` },
  },
  {
    id: `media`,
    title: { fr: `Vidéos, sons et contenus intégrés`, en: `Videos, sounds and embedded content` },
    text: {
      fr: `Une vidéo, un son, un PDF intégré ou un contenu web intégré ne se lit pas sur papier. Chacun est remplacé dans le PDF par un cadre avec sa sorte, son titre et son adresse, cliquable quand c'est une adresse web. Un réglage remplace le cadre par une simple ligne de texte.`,
      en: `A video, a sound, an embedded PDF or embedded web content cannot be played on paper. Each one is replaced in the PDF by a frame with its kind, its title and its address, clickable when it is a web address. A setting replaces the frame by a plain line of text.`,
    },
    keywords: { fr: `video son audio youtube iframe cadre`, en: `video sound audio youtube iframe frame` },
  },
  {
    id: `properties`,
    title: { fr: `Propriétés de la note pour l'export`, en: `Note properties for the export` },
    text: {
      fr: `Les propriétés de l'en-tête de la note l'emportent sur les réglages : lang (fr ou en), author (auteur du PDF), toc (true ou false), toc-depth (1 à 6), chapter-toc (true ou false) et chapter-toc-depth (1 à 6).`,
      en: `The properties in the header of the note override the settings: lang (fr or en), author (author of the PDF), toc (true or false), toc-depth (1 to 6), chapter-toc (true or false) and chapter-toc-depth (1 to 6).`,
    },
    keywords: { fr: `propriete entete lang author toc langue auteur`, en: `property header lang author toc language` },
  },
  {
    id: `export-settings`,
    title: { fr: `Réglages de l'export`, en: `Export settings` },
    text: {
      fr: `Le chapitre « Export PDF » des réglages couvre l'auteur du PDF, l'en-tête, le pied de page, l'alignement des pages en bas, le saut de page avant chaque chapitre, la numérotation des notes de bas de page, la protrusion, les tables des matières, la place des figures et des tableaux, les renvois et les médias.`,
      en: `The "PDF export" chapter of the settings covers the author of the PDF, the header, the footer, aligning pages at the bottom, a page break before each chapter, footnote numbering, protrusion, the tables of contents, the placement of figures and tables, the references and the media.`,
    },
    keywords: { fr: `reglages options en-tete pied de page numerotation`, en: `settings options header footer numbering` },
  },
  {
    id: `panel`,
    title: { fr: `Panneau de boutons`, en: `Button panel` },
    text: {
      fr: `Le panneau de boutons est à droite de la zone de rédaction. Chaque fonction a un bouton, et la même fonction se trouve dans la palette de commandes, où l'on peut lui attribuer un raccourci dans les réglages d'Obsidian. Un clic long sur un bouton, puis un glissement, le déplace. La fenêtre du bouton Bigorneau (l'escargot) et les réglages, chapitre « Panneau de boutons », permettent de masquer un bouton, de le déplacer en glissant sa poignée, d'ajouter ou de supprimer des séparations entre groupes de boutons ; seul le bouton Bigorneau (l'escargot) ne se modifie pas. L'export en PDF se lance depuis le bouton Aperçu et export PDF. La commande « Diagnostic de Bigorneau » (aussi dans la fenêtre des scripts, bouton bigorneau) affiche l'état du plugin et les temps mesurés, à copier pour décrire une lenteur. La commande « Afficher ou masquer le panneau de boutons » le bascule.`,
      en: `The button panel is on the right of the writing area. Each function has a button, and the same function is in the command palette, where you can give it a keyboard shortcut in the Obsidian settings. A long press on a button, then a drag, moves it. The window of the Bigorneau button (the snail) and the settings, chapter "Button panel", let you hide a button, move it by dragging its handle, and add or remove separators between groups of buttons; only the Bigorneau button (the snail) cannot be changed. The PDF export is started from the Preview and PDF export button. The command "Bigorneau diagnostic" (also in the scripts window, bigorneau button) shows the state of the plugin and the measured times, to copy when describing a slowness. The command "Show or hide the button panel" toggles it.`,
    },
    keywords: { fr: `panneau bouton raccourci palette commande glisser`, en: `panel button shortcut palette command drag` },
  },
  {
    id: `privacy`,
    title: { fr: `Confidentialité`, en: `Privacy` },
    text: {
      fr: `Bigorneau ne se connecte pas à Internet. Il n'a ni télémétrie, ni publicité, ni compte, ni paiement. Il ne lit et n'écrit des fichiers que dans votre coffre et dans son dossier technique, hormis un fichier de script que vous choisissez vous-même. Les liens ne s'ouvrent dans votre navigateur que lorsque vous cliquez dessus.`,
      en: `Bigorneau does not connect to the internet. It has no telemetry, no advertising, no account and no payment. It reads and writes files only inside your vault and its own technical folder, apart from a script file that you choose yourself. Links open in your browser only when you click them.`,
    },
    keywords: { fr: `reseau internet donnees licence`, en: `network internet data licence license` },
  },
];

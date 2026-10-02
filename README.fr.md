# Bigorneau

Bigorneau est un plugin Obsidian pour écrire des notes sous forme de cartes mentales. Chaque titre d'une note devient un nœud de la carte, et chaque nœud porte un véritable paragraphe : la carte sert donc à écrire et à réorganiser un long texte, pas seulement à le dessiner. Le même plugin contient un compositeur de documents longs, qui transforme une note en PDF composé comme un livre, avec la coupure de lignes de TeX, la césure française et anglaise britannique, les notes de bas de page, les tableaux, les figures, une table des matières, des renvois et des formules.

Une version anglaise de ce fichier est disponible dans [README.md](README.md).

## Installation

Bigorneau est en cours de soumission au répertoire des plugins communautaires d'Obsidian. En attendant qu'il y figure, on l'installe avec le plugin BRAT :

1. Installer le plugin communautaire BRAT dans Obsidian.
2. Lancer la commande « BRAT: Add a beta plugin for testing ».
3. Saisir `Bigorneau15652/bigorneau`.
4. Activer Bigorneau dans Réglages, Plugins communautaires.

L'interface existe en français et en anglais. Elle suit la langue d'Obsidian par défaut, et la langue se choisit dans les réglages du plugin. Le compositeur de documents longs n'est disponible que sur ordinateur. La carte et la vue Liste fonctionnent sur tous les appareils.

Si vous utilisiez ce plugin sous son ancien nom, Mindmap Note Writing, désactivez l'ancien plugin avant d'activer Bigorneau. Bigorneau reprend les réglages de l'ancien plugin au premier démarrage.

## Écrire avec la carte

La carte de la note active s'ouvre avec l'icône du ruban ou avec la commande « Ouvrir la carte de la note active ». La première case de la carte porte le nom de la note, et chaque titre Markdown est un chapitre. Tab crée un sous-titre, Entrée crée un titre de même niveau et Suppr supprime un titre après confirmation. Un double clic ou F2 sur une case ouvre une petite fenêtre avec le titre, un titre court qui n'apparaît que sur la carte, un commentaire et des étiquettes. Glisser une case, ou utiliser Cmd ou Ctrl avec Maj et les flèches, la déplace avec sa branche. Cmd ou Ctrl avec C, X et V copient, coupent et collent des titres en Markdown. Cmd ou Ctrl avec Maj et Entrée fait l'aller-retour entre la carte et la note.

Les étiquettes ont un nom, une couleur de fond et une couleur de texte, en nombre illimité. Elles se définissent dans le menu de la carte et n'apparaissent que sur la carte. Le titre court, le commentaire et les étiquettes d'un titre sont conservés dans un commentaire invisible sous le titre. Les commentaires du plugin de la forme `%% mmw ... %%` sont masqués dans la note et protégés contre une suppression accidentelle.

L'œil qui apparaît au survol d'une case masque le titre et ses sous-titres dans la note. Le texte reste dans le fichier et les cases restent sur la carte, grisées. Le menu burger permet aussi de n'afficher que le chapitre actif dans la note, au lieu de griser les autres.

Les liens entre titres s'écrivent avec le bouton en forme de chaîne : il écrit un lien `[[Note#Titre cible|Lien vers Titre cible]]` au début du texte du titre de départ et trace une flèche en pointillé vers la cible. La même fenêtre cherche dans les notes du coffre, donc un lien peut viser une autre note, qui apparaît alors dans une case à gauche de la carte. Une mappemonde apparaît sur un titre dont le paragraphe contient des liens web ou des vidéos intégrées, et un clic ouvre la page.

La vue Liste condense la carte en un titre par ligne, décalé selon son niveau, avec un triangle pour replier les enfants et le même glisser-déposer pour réorganiser les titres. On bascule avec le bouton de la barre de commandes ou avec la commande « Basculer entre la vue Mindmap et la vue Liste ».

Une note fixe copie le chapitre sélectionné dans son propre volet, au-dessus de la note dynamique qui suit la carte. On l'ajoute avec « Ajouter une note fixe » dans le menu burger ou avec la commande du même nom. Les sujets flottants sont des notes libres rattachées à aucun chapitre : un double clic sur le fond de la carte en crée un, et on peut le déposer près de la structure pour l'intégrer à la carte. Le panneau Apparence propose six formes pour les cases, des couleurs, des types de ligne et l'alignement du texte, appliqués à toute la carte, à un niveau ou à un seul titre. Un point d'interrogation en bas à droite de la carte ouvre un panneau d'aide avec les raccourcis.

## Compositeur de documents longs

La commande « Aperçu de l'export de la note » ouvre à côté de la note un volet qui montre la note en pages A4, et « Exporter la note en PDF » écrit le PDF dans le coffre, par défaut dans le dossier de la note, en demandant confirmation avant de remplacer un fichier. L'aperçu et le PDF viennent de la même description des pages, ils sont donc identiques. Les titres masqués, les sujets flottants et les commentaires du plugin ne sont pas exportés.

Le texte est composé avec l'algorithme de coupure de lignes de Knuth et Plass, avec la césure française ou anglaise britannique (ajouter `lang: en` aux propriétés de la note pour l'anglais) et les règles de la typographie française : espace fine insécable avant le point-virgule, le point d'exclamation et le point d'interrogation, espace insécable avant les deux-points et à l'intérieur des guillemets, après les abréviations et entre un nombre et son unité. La ponctuation et les traits d'union en bout de ligne dépassent légèrement dans la marge, ce qui se désactive dans les réglages. La police est Libertinus Serif, avec Libertinus Mono pour le code, incorporées au PDF.

Les pages évitent les lignes veuves et orphelines, gardent un titre avec son texte, placent les notes de bas de page en bas de la page de leur appel avec un filet et un report sur la page suivante si nécessaire, et montrent le titre du chapitre en cours en en-tête et le numéro de page en pied de page. Le PDF contient un texte sélectionnable, des signets hiérarchiques qui suivent les titres, des liens cliquables et des métadonnées : titre, langue, date et auteur, pris dans la propriété `author` de la note ou dans les réglages du plugin.

Le gras, l'italique et les liens sont composés dans le texte. Les notes de bas de page s'écrivent `[^id]` avec une définition `[^id]: texte` n'importe où dans la note, ou directement `^[texte]`.

Un tableau Markdown est composé dans un style sobre : un filet au-dessus, un filet sous la ligne d'en-tête, un filet en bas, un en-tête en gras et pas de quadrillage. La largeur des colonnes s'adapte au contenu, le texte des cellules passe à la ligne comme un paragraphe, l'alignement des colonnes vient de la ligne de séparation (`:--`, `:-:`, `--:`), et un tableau long est coupé entre deux lignes avec son en-tête répété sur la page suivante. Une ligne qui commence par `Tableau :` ou `Table:` juste au-dessus d'un tableau en est la légende, numérotée automatiquement.

Une figure est une image écrite `![[plan.png|Légende]]`, ou `![[plan.png|Légende|400]]` avec une largeur en pixels. Les formats PNG, JPEG, WebP, GIF et SVG sont acceptés, réduits à 300 points par pouce au plus de la taille affichée (les JPEG en couleurs sont repris tels quels). La légende s'affiche « Figure 1 : Légende ». Une image introuvable, ou une image du web qui n'est jamais téléchargée, est remplacée par un repère visible et signalée dans le compte rendu de l'export. Les figures et les tableaux légendés flottent comme en LaTeX, en haut ou en bas de la page où ils tiennent, sauf si le réglage demande de les garder là où ils sont écrits.

Une table des matières est ajoutée sous le titre quand la note a la propriété `toc: true` ou quand les réglages la demandent. `toc-depth: 2` limite les niveaux. Les numéros de page sont calculés après la mise en page définitive, avec des points de conduite et des entrées cliquables. `chapter-toc: true` ajoute au début de chaque chapitre de plus haut niveau une table des matières qui ne liste que ses sous-titres, avec `chapter-toc-depth: 3` pour régler ses niveaux. Les propriétés d'une note l'emportent sur les réglages.

Renvois : `[[#Titre]]` devient un lien cliquable vers le titre. Pour viser une figure ou un tableau, ajouter un identifiant de bloc en fin de ligne, par exemple `![[plan.png|Plan]] ^plan`, ou `^conso` seul sur la ligne après un tableau, puis écrire `[[#^plan]]`, qui s'affiche « Figure 1 ». Un réglage ajoute « (page N) » après le texte du renvoi.

Les formules s'écrivent `$formule$` dans le texte et `$$formule$$` sur leurs propres lignes. Elles sont dessinées par la bibliothèque MathJax intégrée au plugin et écrites dans le PDF en dessin vectoriel, donc nettes à tout agrandissement. Une formule refusée par MathJax est gardée telle qu'elle est écrite et signalée.

Une vidéo, un son, un PDF intégré ou un contenu web intégré ne se lit pas sur papier. Chacun est remplacé par un cadre qui donne sa sorte, son titre et son adresse, cliquable dans le PDF quand c'est une adresse web. Un réglage remplace le cadre par une simple ligne de texte.

Les réglages du chapitre « Export PDF » couvrent l'auteur du PDF, l'en-tête, le pied de page, l'alignement des pages en bas, le saut de page avant chaque chapitre, la numérotation des notes de bas de page, la protrusion, les tables des matières, la place des figures et des tableaux, les renvois et les médias. Cinq commandes de la palette écrivent dans la note, et chacune peut recevoir un raccourci clavier dans les réglages d'Obsidian : insérer une note de bas de page, activer ou désactiver la table des matières de la note, insérer une légende de tableau, insérer une formule en ligne et insérer une formule en bloc.

## Confidentialité et divulgations

Bigorneau ne se connecte pas à Internet. Il n'a ni télémétrie, ni publicité, ni compte, ni paiement. Il ne lit et n'écrit des fichiers que dans votre coffre. Les liens ne s'ouvrent dans votre navigateur que lorsque vous cliquez dessus, et les images du web ne sont pas téléchargées pour l'export.

## Crédits et licences

Bigorneau est publié sous licence MIT (voir [LICENSE](LICENSE)). Le compositeur de documents longs embarque les œuvres suivantes, dont les licences se trouvent dans le dossier [licences](licences) et dans [NOTICE](NOTICE) :

- Les polices Libertinus Serif et Libertinus Mono, version 7.051, copyright 2012-2024 The Libertinus Project Authors, licence SIL Open Font License 1.1.
- La bibliothèque MathJax, version 3.2.2, copyright The MathJax Consortium, licence Apache 2.0.
- Les motifs de césure du français (Daniel Flipo, Bernard Gaulle, Arthur Reutenauer) et de l'anglais britannique (Dominik Wujastyk, Graham Toal), licence MIT, du projet hyph-utf8.

L'algorithme de coupure de lignes (Knuth et Plass, 1981) et l'algorithme de césure (Liang, 1983) sont réimplémentés d'après leurs descriptions publiées, sans reprise de code.

## Développement

Le code est écrit en TypeScript. `npm install` installe les outils, `npm test` lance les tests et `npm run build` produit `main.js`. Les documents de conception sont dans le dossier [docs](docs).

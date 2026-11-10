# Changelog / Journal des modifications

Each version has a short description in English, then in French. The text of a version is copied onto its release page on GitHub.
Chaque version a une courte description en anglais, puis en français. Le texte d'une version est recopié sur la page de sa release GitHub.

## 0.32.7

Fixed: a click on the title of the map (the name of the note) now shows the top of the note, with its properties, even when only the active chapter is shown. The cursor goes to the first line of the note instead of a hidden comment line, which used to push it into the first title and select it. When the note has text of its own under its title, the cursor still goes to the end of that text.

Corrigé : un clic sur le titre de la carte (le nom de la note) montre maintenant le haut de la note, avec ses propriétés, même quand seul le chapitre actif est affiché. Le curseur va à la première ligne de la note au lieu d'une ligne de commentaire masquée, qui le poussait dans le premier titre et le sélectionnait. Quand la note a du texte propre sous son titre, le curseur va toujours à la fin de ce texte.

## 0.32.6

Fixed: when the plugin is in English, the exported document (PDF and HTML) now speaks English too: "Contents" instead of "Table des matières", "(untitled)" for a heading without title, and "[Figure: name]" with an English colon. Before, the language of the document was French unless the note had a lang property. Now, without a lang property, the document takes the language of the plugin; a lang property (for example lang: fr) still has priority.

Corrigé : quand le plugin est en anglais, le document exporté (PDF et HTML) parle aussi anglais : « Contents » au lieu de « Table des matières », « (untitled) » pour un titre sans texte, et « [Figure: nom] » avec les deux-points à l'anglaise. Avant, la langue du document était le français tant que la note n'avait pas de propriété lang. Maintenant, sans propriété lang, le document prend la langue du plugin ; une propriété lang (par exemple lang: fr) garde la priorité.

## 0.32.5

Changed: the lines that link to another note or to a heading, such as [[test1]], are now also read when they are grouped at the end of the text of a title, after its last paragraph (before, only the lines right under the title were read). They give the same boxes on the left of the map and the same arrows, and they can be reordered among themselves. A link line in the middle of a paragraph is still plain text. Added: a title of the main branch can be taken out of it with a right click then "Detach as a floating topic": it becomes a floating topic placed at its own height, to the right of the whole map, with its sub-titles (dragging a title well outside the structure still does the same, and the distance needed is shorter: 40 pixels beyond the map instead of 70).

Modifié : les lignes qui renvoient à une autre note ou à un titre, comme [[test1]], sont maintenant aussi lues quand elles sont groupées à la fin du texte d'un titre, après son dernier paragraphe (avant, seules les lignes placées juste sous le titre étaient lues). Elles donnent les mêmes cases à gauche de la carte et les mêmes flèches, et peuvent être réordonnées entre elles. Une ligne de lien au milieu d'un paragraphe reste du simple texte. Ajouté : un titre de la branche principale peut en être retiré par un clic droit puis « Détacher en sujet flottant » : il devient un sujet flottant placé à sa hauteur, à droite de toute la carte, avec ses sous-titres (glisser un titre bien à l'extérieur de la structure fait toujours la même chose, avec une distance plus courte : 40 pixels au-delà de la carte au lieu de 70).

## 0.32.4

Fixed: in a floating topic, a click in the text of its last sub-title (when the file ends with an empty line) no longer sends the cursor to the last title of the main branch. The empty last line of the file now belongs to the last floating topic. Also fixed: a click on a mark of a title that holds several links (globe, links to other notes, arrows) now opens the list of links and keeps it open, so a link can be chosen with a second click; before, the list showed only while the mouse button was held down. A click outside the list or the Escape key closes it.

Corrigé : dans un sujet flottant, un clic dans le texte de son dernier sous-titre (quand le fichier finit par une ligne vide) n'envoie plus le curseur dans le dernier titre de la branche principale. La dernière ligne vide du fichier appartient maintenant au dernier sujet flottant. Corrigé aussi : un clic sur le repère d'un titre qui porte plusieurs liens (mappemonde, liens vers d'autres notes, flèches) ouvre maintenant la liste des liens et la garde ouverte, ce qui permet de choisir un lien par un second clic ; avant, la liste ne restait affichée que tant que le bouton de la souris était maintenu. Un clic en dehors de la liste ou la touche Échap la ferme.

## 0.32.3

Fixed: when a floating topic is dragged, the lines that join it to its sub-titles are now drawn and move with the copies, so the whole group looks the same as on the map while it is placed. Also fixed: clicking in the text of a sub-title of a floating topic no longer sends the cursor to the last chapter of the note. The zone of the floating topics stayed hidden in the note when the option that hides the inactive chapters was off, so the cursor was pushed out of it.

Corrigé : quand on glisse un sujet flottant, les traits qui le relient à ses sous-titres sont maintenant dessinés et se déplacent avec les copies, de sorte que tout le groupe garde son aspect de la carte pendant qu'on le place. Corrigé aussi : un clic dans le texte d'un sous-titre d'un sujet flottant n'envoie plus le curseur dans le dernier chapitre de la note. La zone des sujets flottants restait masquée dans la note quand l'option qui masque les chapitres inactifs était coupée, et le curseur en était chassé.

## 0.32.2

Fixed: the boxes of the linked notes, at the left of the map, are now centred on the title that holds the links (before, the first one was level with the title and the others below it). When two titles that follow each other have links, the boxes of the lower one are pushed down so that two boxes never lie on each other, whatever the number of links. The boxes are also a little flatter: less space above and below their text. The arrows keep following the boxes. Also fixed: when a floating topic is dragged, its sub-titles are now shown moving with it until the button is released, so the whole group can be placed by sight (before, only the main title moved on screen). The current position of the group fades while it is dragged, so the new place can be compared with the old one.

Corrigé : les cases des notes liées, à gauche de la carte, sont maintenant centrées sur le titre qui porte les liens (avant, la première était à la hauteur du titre et les autres en dessous). Quand deux titres qui se suivent ont des liens, les cases du titre du dessous sont décalées vers le bas pour que deux cases ne se superposent jamais, quel que soit le nombre de liens. Les cases sont aussi un peu plus plates : moins d'espace au-dessus et au-dessous de leur texte. Les flèches suivent toujours les cases. Corrigé aussi : quand on glisse un sujet flottant, ses sous-titres sont maintenant visibles et se déplacent avec lui jusqu'au relâchement du bouton, ce qui permet de placer tout l'ensemble à vue (avant, seul le titre principal bougeait à l'écran). La position actuelle du groupe s'estompe pendant le glisser, pour comparer la nouvelle place à l'ancienne.

## 0.32.1

Changed: in the "Fonts and headings" window, the list and the button "Apply this font everywhere" are replaced by one grey button, "Apply a font everywhere", with a small arrow: a click opens the list of fonts (the original font first), and the chosen font is applied at once to the body, the title, the headings, the captions, the footnotes and the header and footer, with a single redraw. In the window of a heading, a tag that is chosen now shows a small cross, and its tooltip says that a click takes it off the heading (the tag itself is kept in the list).

Modifié : dans la fenêtre « Polices et titres », la liste et le bouton « Appliquer cette police partout » sont remplacés par un seul bouton gris, « Appliquer une police partout », avec une petite flèche : un clic ouvre la liste des polices (la police d'origine en premier), et la police choisie est appliquée aussitôt au corps de texte, au titre, aux titres, aux légendes, aux notes de bas de page, à l'en-tête et au pied de page, avec un seul redessin. Dans la fenêtre d'un titre, une étiquette choisie montre maintenant une petite croix, et son infobulle indique qu'un clic la retire du titre (l'étiquette elle-même reste dans la liste).

## 0.32.0

Changed: the settings screen now uses the settings interface of Obsidian 1.13. It needs Obsidian 1.13.0 or later: the minimum version of the plugin goes from 1.7.2 to 1.13.0, and users of an older Obsidian keep version 0.31.3. The 12 chapters are no longer folding sections but pages: the screen lists them as the native settings of Obsidian do, a click opens a page with a back arrow. The settings are found by the search of Obsidian (the field at the top of the settings window): switches, lists and sliders are declared with the controls of Obsidian, the others (colours, icons, keys, bullets, profiles, list of the panel buttons, fonts of the vault) keep their own drawing inside the page. In the Export PDF chapter the sections are groups, and the fonts of the vault have their own page. The Profiles chapter and the list of the panel buttons also have their page. Nothing else changes: every setting keeps its name, its place in the saved settings and its effect.

Modifié : l'écran des réglages utilise maintenant l'interface de réglages d'Obsidian 1.13. Il demande Obsidian 1.13.0 ou plus : la version minimale du plugin passe de 1.7.2 à 1.13.0, et les utilisateurs d'un Obsidian plus ancien gardent la version 0.31.3. Les 12 chapitres ne sont plus des sections repliables mais des pages : l'écran les liste comme les réglages natifs d'Obsidian, un clic ouvre une page avec une flèche de retour. Les réglages sont retrouvés par la recherche d'Obsidian (le champ en haut de la fenêtre des réglages) : les interrupteurs, listes et curseurs sont déclarés avec les contrôles d'Obsidian, les autres (couleurs, icônes, touches, puces, profils, liste des boutons du panneau, polices du coffre) gardent leur propre dessin dans la page. Dans le chapitre Export PDF les sections sont des groupes, et les polices du coffre ont leur page. Le chapitre Profils et la liste des boutons du panneau ont aussi leur page. Rien d'autre ne change : chaque réglage garde son nom, sa place dans les réglages enregistrés et son effet.

## 0.31.3

Fixed: two warnings of the checks of the Obsidian community directory. The cast that gave the browser set of fonts the methods add and delete is replaced by a declaration of those methods (file `src/font-face-set.d.ts`), and the two `!important` of the padding of the map view and of the export preview are replaced by a more precise selector. The other warnings and recommendations stay: they come from functions of the plugin (pictures, fonts and folders of the vault, copy and paste of tables, shapes of the map, printing, Zen mode). Nothing changes for the user.

Corrigé : deux avertissements des contrôles du répertoire communautaire d'Obsidian. Le cast qui donnait à l'ensemble des polices du navigateur les méthodes add et delete est remplacé par une déclaration de ces méthodes (fichier `src/font-face-set.d.ts`), et les deux `!important` de la marge de la vue carte et de l'aperçu d'export sont remplacés par un sélecteur plus précis. Les autres avertissements et recommandations restent : ils viennent de fonctions du plugin (images, polices et dossiers du coffre, copier et coller de tableaux, formes de la carte, impression, mode Zen). Rien ne change pour l'utilisateur.

## 0.31.2

Fixed: three points that the checks of the Obsidian community directory (the ESLint plugin of Obsidian) report in the code added since version 0.28.2. A non-breaking space written as a character in two lines of the HTML export is now written as an escape, an untyped empty list of formulas in the HTML export is typed, and the canvas that reduces a picture is created with `createEl`. Nothing changes for the user.

Corrigé : trois points que signalent les contrôles du répertoire communautaire d'Obsidian (le plugin ESLint d'Obsidian) dans le code ajouté depuis la version 0.28.2. Une espace insécable écrite comme caractère dans deux lignes de l'export HTML est maintenant écrite comme séquence d'échappement, la liste vide non typée des formules de l'export HTML est typée, et le canevas qui réduit une image est créé avec `createEl`. Rien ne change pour l'utilisateur.

## 0.31.1

Fixed: in the "Hide inactive chapters" mode, the cursor can no longer leave the active chapter by accident. A click in the empty space under the text of the chapter used to put the cursor at the very end of the note, in a hidden chapter (often the conclusion), and the map then switched to that chapter. Now the cursor goes to the end of the active chapter. The arrow keys, Ctrl + End, Ctrl + Home, Page Down and a drag of the mouse also stop at the edge of the active chapter. To change chapter on purpose, use the map (Ctrl + Shift + Enter, the arrow keys, then Ctrl + Shift + Enter to come back) or the keys that move between chapters. The simple grey mode, where the other chapters stay visible, is not changed. The editor of a fixed note, which shows only one chapter, follows the same rule.

Corrigé : dans le mode « Masquer les chapitres inactifs », le curseur ne peut plus quitter le chapitre actif par erreur. Un clic dans le vide sous le texte du chapitre plaçait le curseur tout à la fin de la note, dans un chapitre masqué (souvent la conclusion), et la carte passait alors sur ce chapitre. Le curseur va maintenant à la fin du chapitre actif. Les flèches, Ctrl + Fin, Ctrl + Début, Page suivante et un glissement de la souris s'arrêtent aussi au bord du chapitre actif. Pour changer de chapitre volontairement, passez par la carte (Ctrl + Maj + Entrée, les flèches, puis Ctrl + Maj + Entrée pour revenir) ou par les touches de navigation entre chapitres. Le simple mode gris, où les autres chapitres restent visibles, n'est pas modifié. L'éditeur d'une note fixe, qui ne montre qu'un chapitre, suit la même règle.

## 0.31.0

Added: a second form of the HTML export, a folder with separate media. In the HTML tab of the Export window, the "Form of the export" choice offers "One file" (as before) or "Folder with separate media". The folder holds index.html (the text, the style and the reader), the original pictures without any reduction in the folder medias, the fonts in polices and the panorama viewer in lib. The page loads faster and each picture is a real file. When the folder is made again, the folders medias, polices and lib of the previous export are replaced (moved to the trash according to the settings of Obsidian) and nothing else in the folder is touched. A 360 degree panorama turns only from a website (for example GitHub Pages): a browser refuses to read the picture file when the page is opened from a file of the computer, so the panorama then shows as an ordinary picture with a note that says why. The choice of the form is remembered. The embedded video frame no longer repeats the fullscreen attribute, which made the browser warn.

Ajouté : une deuxième forme de l'export HTML, un dossier avec médias séparés. Dans l'onglet HTML de la fenêtre Export, le choix « Forme de l'export » propose « Fichier unique » (comme avant) ou « Dossier avec médias séparés ». Le dossier contient index.html (le texte, le style et le lecteur), les images d'origine sans aucune réduction dans le dossier medias, les polices dans polices et la visionneuse des panoramas dans lib. La page se charge plus vite et chaque image est un vrai fichier. Quand le dossier est refait, les dossiers medias, polices et lib de l'export précédent sont remplacés (mis à la corbeille selon les réglages d'Obsidian) et rien d'autre dans le dossier n'est touché. Un panorama à 360 degrés ne tourne que depuis un site web (par exemple GitHub Pages) : un navigateur refuse de lire le fichier image quand la page est ouverte depuis un fichier de l'ordinateur, le panorama s'affiche alors comme une image ordinaire avec une note qui explique pourquoi. Le choix de la forme est mémorisé. Le cadre de la vidéo intégrée ne répète plus l'attribut de plein écran, ce qui faisait avertir le navigateur.

## 0.30.3

Fixed: the language of the plugin no longer falls back to English when Obsidian is in French. The language of Obsidian is now read from several places (the local storage, the date library of the application, the page and the browser) instead of one that some versions of Obsidian do not write.

Changed: the settings of the Print tab (pages, paper, orientation, colour, printer, copies, double-sided) and the direct sending to a printer, added in 0.30.0 and 0.30.1, are removed. A click on the Print tab now closes the Export window and opens the print window of the system with the pages of the preview, as it did before 0.30.0. That window offers the printer, the pages, the paper, the orientation, the colour and the double-sided printing, and works the same on Windows, macOS and Linux. The plugin no longer reaches the printing of the application window, and the test that forbade it is back.

Corrigé : la langue du plugin ne repasse plus en anglais quand Obsidian est en français. La langue d'Obsidian est maintenant lue à plusieurs endroits (le stockage local, la bibliothèque de dates de l'application, la page et le navigateur) et non plus à un seul, que certaines versions d'Obsidian n'écrivent pas.

Modifié : les réglages de l'onglet Impression (pages, papier, orientation, couleur, imprimante, copies, recto verso) et l'envoi direct vers une imprimante, ajoutés en 0.30.0 et 0.30.1, sont retirés. Un clic sur l'onglet Impression ferme maintenant la fenêtre Export et ouvre la boîte d'impression du système avec les pages de l'aperçu, comme avant la 0.30.0. Cette boîte propose l'imprimante, les pages, le papier, l'orientation, la couleur et le recto verso, et fonctionne de la même façon sous Windows, macOS et Linux. Le plugin n'atteint plus l'impression de la fenêtre de l'application, et le test qui l'interdisait est rétabli.

## 0.30.1

Fixed: printing to a printer chosen in the Print tab works when the pages do not all have the same sheet size (a landscape page among portrait pages): the pages are sent in several jobs, one for each run of consecutive pages that have the same sheet size, in the order of the document. When the printing to a chosen printer fails, Bigorneau no longer opens the print window of the system: it shows the reason in a message that stays until it is closed. A message tells that the work is on its way, because a printer can take a minute to answer. The print window of the system opens only when "System print box" is chosen or when direct printing does not exist on the system. With double-sided printing, each job starts on a new sheet.

Corrigé : l'impression vers une imprimante choisie dans l'onglet Impression fonctionne quand les pages n'ont pas toutes la même taille de feuille (une page en paysage parmi des pages en portrait) : les pages partent en plusieurs travaux, un par suite de pages consécutives de même taille de feuille, dans l'ordre du document. Quand l'impression vers l'imprimante choisie échoue, Bigorneau n'ouvre plus la boîte d'impression du système : il affiche la raison dans un message qui reste jusqu'à sa fermeture. Un message indique que le travail est en route, car une imprimante peut mettre une minute à répondre. La boîte d'impression du système ne s'ouvre que si « Boîte d'impression du système » est choisie ou si l'impression directe n'existe pas sur le système. En recto verso, chaque travail commence sur une nouvelle feuille.

## 0.30.0

Added: the Print tab of the Export window now has its own settings. Pages to print: all of them, or a list such as 2-5, 8 or 3- (from page 3 to the end). Paper: the size of the note, A4, A3, A5 or Letter; the pages are reduced and centred to fit the sheet without being cut. Orientation: automatic (each page keeps its own), portrait or landscape. Colour: colour, grey tones, or black and white without grey. Printer: the list of the printers of the system, with copies and double-sided printing; the work then goes straight to the chosen printer. With "System print box", or when the list is not available (another system or a newer version of Obsidian), the print window of the system opens as before. If a direct printing fails, the print window of the system opens. The choices are remembered. The plugin reaches the printing of the application window only in the file src/print-system.ts, in a guarded block, and a test checks it.

Ajouté : l'onglet Impression de la fenêtre Export a maintenant ses propres réglages. Pages à imprimer : toutes, ou une liste comme 2-5, 8 ou 3- (de la page 3 à la fin). Papier : celui de la note, A4, A3, A5 ou Letter ; les pages sont réduites et centrées pour tenir sur la feuille sans être coupées. Orientation : automatique (chaque page garde la sienne), portrait ou paysage. Couleur : couleur, niveaux de gris ou noir et blanc sans gris. Imprimante : la liste des imprimantes du système, avec les copies et le recto verso ; le travail part alors directement vers l'imprimante choisie. Avec « Boîte d'impression du système », ou quand la liste n'est pas disponible (autre système ou version plus récente d'Obsidian), la boîte d'impression du système s'ouvre comme avant. Si une impression directe échoue, la boîte d'impression du système s'ouvre. Les choix sont mémorisés. Le plugin n'atteint l'impression de la fenêtre de l'application que dans le fichier src/print-system.ts, dans un bloc protégé, et un test le vérifie.

## 0.29.1

Fixed: a video embed code copied from YouTube (the HTML "iframe" code) is now recognised in the PDF, the preview and the HTML export when it is indented, in a list item, inside a paragraph or div tag, or on the same line as some text; the text around it stays as paragraphs. In the HTML export, a page opened from a file (not from a website) cannot show the YouTube player, which answers "error 153": the player is then replaced by a link, and every video keeps a link to its page under the player. A wide table no longer overflows the page: long words are broken, and a table still too wide scrolls inside its own frame.

Corrigé : un code d'intégration de vidéo copié depuis YouTube (le code HTML « iframe ») est maintenant reconnu dans le PDF, l'aperçu et l'export HTML quand il est décalé, dans un élément de liste, dans une balise p ou div, ou sur la même ligne que du texte ; le texte autour reste en paragraphes. Dans l'export HTML, une page ouverte depuis un fichier (et non depuis un site web) ne peut pas afficher le lecteur YouTube, qui répond « erreur 153 » : le lecteur est alors remplacé par un lien, et chaque vidéo garde un lien vers sa page sous le lecteur. Un tableau large ne déborde plus de la page : les mots longs sont coupés, et un tableau encore trop large défile dans son propre cadre.

## 0.29.0

Added: export to HTML. The "Export" button of the preview (it replaces "Export to PDF…" and "Print…") opens a window with three tabs: PDF, Print and HTML. The HTML tab writes one self-contained web page that works as a reader. On the left, one button opens the outline of the headings and another the thumbnails of the pictures, together or one at a time. On the right, three buttons give the light or dark mode, the full screen (Escape brings the buttons back) and the wide mode that stretches the text over the whole width. Pictures, formulas and fonts are inside the file. A video written as a YouTube or Vimeo link becomes a player. A picture twice as wide as high (at least 1500 pixels) is read as a 360 degree panorama with Pannellum (MIT licence); a setting turns this off. Web links open in the browser. The command "Export the note as HTML" opens the window on the HTML tab. A public Nextcloud link shows the text of the page instead of the page: publish the file on a website, or download it. The mode with separate folders for the media comes in a later version.

Ajouté : export en HTML. Le bouton « Export » de l'aperçu (il remplace « Exporter en PDF… » et « Imprimer… ») ouvre une fenêtre à trois onglets : PDF, Impression et HTML. L'onglet HTML écrit une page web unique et autonome qui sert de liseuse. À gauche, un bouton ouvre le plan des titres et un autre les miniatures des images, ensemble ou séparément. À droite, trois boutons donnent le mode clair ou sombre, le plein écran (la touche Échap ramène les boutons) et le mode large qui étend le texte sur toute la largeur. Les images, les formules et les polices sont dans le fichier. Une vidéo écrite avec un lien YouTube ou Vimeo devient un lecteur. Une image deux fois plus large que haute (au moins 1500 pixels) se lit comme un panorama à 360 degrés avec Pannellum (licence MIT) ; un réglage permet de le désactiver. Les liens web s'ouvrent dans le navigateur. La commande « Exporter la note en HTML » ouvre la fenêtre sur l'onglet HTML. Un lien public Nextcloud affiche le texte de la page au lieu de la page : publiez le fichier sur un site web, ou téléchargez-le. Le mode avec des dossiers séparés pour les médias viendra dans une version suivante.

## 0.28.2

Fixed: the README and the help now match the code. Duplicated sentences are removed (the French README repeated a paragraph about font weights and the fonts folder, and both READMEs said twice that the plugin creates its folders on first launch). The Lorem ipsum generator is a command of the command palette with no button in the panel. The README describes Zen mode, the chapter navigation commands, "Duplicate the selected heading" and "Diagnostic", which it did not mention.

Corrigé : le README et l'aide correspondent maintenant au code. Les phrases en double sont retirées (le README français répétait un paragraphe sur les graisses de polices et le dossier des polices, et les deux README disaient deux fois que le plugin crée ses dossiers au premier lancement). Le générateur Lorem ipsum est une commande de la palette de commandes sans bouton dans le panneau. Le README décrit le mode Zen, les commandes de navigation entre chapitres, « Dupliquer le titre sélectionné » et « Diagnostic », qu'il ne mentionnait pas.

## 0.28.1

Added: this changelog. The release page of each version now shows its description from this file.

Ajouté : ce journal des modifications. La page de la release de chaque version affiche désormais sa description tirée de ce fichier.

## 0.28.0

Added: paste cells copied from a spreadsheet (Excel, LibreOffice Calc, Google Sheets) into a table of the note. Put the cursor in a cell of the table and press Ctrl + V (Cmd + V on a Mac), or use "Paste from a spreadsheet" in the right-click menu of the table or in the command palette. The pasted cells are written as plain text from the cell of the cursor. The table receives the rows and columns that it lacks, its other cells and its caption and style do not change, and one undo restores everything.

Ajouté : coller dans un tableau de la note des cellules copiées dans un tableur (Excel, LibreOffice Calc, Google Sheets). Placez le curseur dans une cellule du tableau et faites Ctrl + V (Cmd + V sur Mac), ou utilisez « Coller depuis un tableur » dans le clic droit du tableau ou dans la palette de commandes. Les cellules sont écrites en texte brut à partir de la cellule du curseur. Le tableau reçoit les lignes et les colonnes qui lui manquent, ses autres cellules, sa légende et son style ne changent pas, et une seule annulation rétablit tout.

## 0.27.4

Changed: the installation section of the README now explains how to install Bigorneau from the community plugins of Obsidian.

Modifié : la section Installation du README explique maintenant comment installer Bigorneau depuis les plugins communautaires d'Obsidian.

## 0.27.3

Changed: new description of the plugin in the manifest.

Modifié : nouvelle description du plugin dans le manifeste.

## 0.27.2

Changed: corrections requested by the automated review of the community directory. Release notes and provenance attestations of the published files, a fixed version of a dependency of MathJax, and the README now states that the plugin reads the list of the files of the vault and the clipboard.

Modifié : corrections demandées par l'examen automatisé du répertoire communautaire. Notes de version et attestations de provenance des fichiers publiés, version corrigée d'une dépendance de MathJax, et le README précise que le plugin lit la liste des fichiers du coffre et le presse-papiers.

## 0.27.1

Changed: first version of the community directory. The detection of the Mac uses the Platform API of Obsidian, the example of the web address field follows the sentence case rule, and two deprecated slider calls are removed. No change of behaviour.

Modifié : première version du répertoire communautaire. La détection du Mac utilise l'outil Platform d'Obsidian, l'exemple du champ d'adresse web respecte la règle de casse et deux appels dépréciés des curseurs sont retirés. Aucun changement de comportement.

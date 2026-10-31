# Changelog / Journal des modifications

Each version has a short description in English, then in French. The text of a version is copied onto its release page on GitHub.
Chaque version a une courte description en anglais, puis en français. Le texte d'une version est recopié sur la page de sa release GitHub.

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

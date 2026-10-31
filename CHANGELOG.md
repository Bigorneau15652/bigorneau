# Changelog / Journal des modifications

Each version has a short description in English, then in French. The text of a version is copied onto its release page on GitHub.
Chaque version a une courte description en anglais, puis en français. Le texte d'une version est recopié sur la page de sa release GitHub.

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

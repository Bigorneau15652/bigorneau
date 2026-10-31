# Changelog / Journal des modifications

Each version has a short description in English, then in French. The text of a version is copied onto its release page on GitHub.
Chaque version a une courte description en anglais, puis en français. Le texte d'une version est recopié sur la page de sa release GitHub.

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

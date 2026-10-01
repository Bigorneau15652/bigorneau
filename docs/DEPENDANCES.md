# Dépendances et licences de l'export

Ce document recense chaque élément extérieur ajouté au plugin pour l'export de haute qualité, avec sa licence, la raison de son ajout et la date de validation par l'utilisateur, comme l'exige le paragraphe 4.12 de docs/POLITIQUE-EXPORT.md. Les textes de licence figurent dans le dossier licences/ et le fichier NOTICE à la racine résume les mentions obligatoires.

## Police Libertinus Serif

La police du premier gabarit est Libertinus Serif en graisse normale, version de la famille distribuée par le paquet npm @fontsource/libertinus-serif 5.3.0 (sous-ensemble latin au format WOFF, 19 Ko), sous licence SIL Open Font License 1.1. L'utilisateur a choisi cette police le 1er octobre 2026 parmi trois propositions. La licence autorise l'incorporation et la redistribution avec le plugin à condition de joindre son texte, ce qui est fait dans licences/OFL-Libertinus.txt. La police est lue une seule fois par l'outil tools/make-font-data.mjs, qui écrit src/export/font-libertinus.ts (police en base 64 pour l'affichage et largeur de chaque caractère pour la mise en page). Ce sous-ensemble contient les caractères français (œ, Œ, guillemets, apostrophe typographique) et l'espace fine, mais il ne contient pas l'espace fine insécable U+202F, remplacée par l'espace fine U+2009, ni les tables de ligatures (GSUB) : la phase suivante qui traitera le crénage et les ligatures devra charger la police complète depuis le dépôt de Libertinus.

## Motifs de césure

Les motifs de césure de Liang du français (hyph-fr.tex) et de l'anglais britannique (hyph-en-gb.tex) viennent du projet hyph-utf8 et sont sous licence MIT. L'utilisateur les a choisis le 1er octobre 2026. L'outil tools/make-patterns.mjs lit les fichiers copiés dans tools/ et écrit src/export/patterns-fr.ts et src/export/patterns-en-gb.ts. Les minimums de lettres avant et après une césure sont ceux du projet (français 2 et 2, anglais britannique 2 et 3), réglables dans src/export/tex-params.ts.

## Aucune bibliothèque JavaScript

À ce stade, aucune bibliothèque n'a été ajoutée à package.json : l'algorithme de Knuth et Plass, les motifs de Liang, la lecture des largeurs de la police et la composition sont écrits dans le plugin. Les outils de génération n'utilisent que les modules intégrés de Node.

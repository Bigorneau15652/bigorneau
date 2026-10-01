# Dépendances et licences de l'export

Ce document recense chaque élément extérieur ajouté au plugin pour l'export de haute qualité, avec sa licence, la raison de son ajout et la date de validation par l'utilisateur, comme l'exige le paragraphe 4.12 de docs/POLITIQUE-EXPORT.md. Les textes de licence figurent dans le dossier licences/ et le fichier NOTICE à la racine résume les mentions obligatoires.

## Polices Libertinus Serif et Libertinus Mono

Les polices de l'export sont Libertinus Serif (normal, italique, gras, gras italique) et Libertinus Mono (chasse fixe, pour le code et les tableaux), dans la version officielle 7.051 publiée sur https://github.com/alerque/libertinus, sous licence SIL Open Font License 1.1. L'utilisateur a choisi cette famille le 1er octobre 2026 puis, le même jour, ses quatre styles avec crénage et ligatures. La licence autorise l'incorporation et la redistribution avec le plugin à condition de joindre son texte, ce qui est fait dans licences/OFL-Libertinus.txt, et d'incorporer les polices telles quelles ou réduites sans reprendre les noms réservés (Linux Libertine, Biolinum, STIX Fonts). L'outil tools/make-fonts.py réduit chaque police au latin (latin de base, Latin-1, Latin étendu A, ponctuation typographique, quelques symboles) en conservant les tables de ligatures et de crénage, puis écrit src/export/fonts-libertinus.ts (environ 150 Ko de polices en base 64). Cet outil emploie la bibliothèque fonttools (licence MIT) uniquement pour la fabrication : elle n'est pas livrée avec le plugin. Le plugin lit lui-même les polices (src/export/font.ts) pour mesurer le texte, former les ligatures, appliquer le crénage et incorporer les polices au PDF, où elles portent une marque de sous-ensemble (MMWSRG+ et suivantes).

## Motifs de césure

Les motifs de césure de Liang du français (hyph-fr.tex) et de l'anglais britannique (hyph-en-gb.tex) viennent du projet hyph-utf8 et sont sous licence MIT. L'utilisateur les a choisis le 1er octobre 2026. L'outil tools/make-patterns.mjs lit les fichiers copiés dans tools/ et écrit src/export/patterns-fr.ts et src/export/patterns-en-gb.ts. Les minimums de lettres avant et après une césure sont ceux du projet (français 2 et 2, anglais britannique 2 et 3), réglables dans src/export/tex-params.ts.

## Bibliothèques JavaScript

Hormis MathJax (voir plus bas), aucune bibliothèque n'a été ajoutée à package.json : l'algorithme de Knuth et Plass, les motifs de Liang, la lecture des polices (largeurs, ligatures, crénage), la composition et l'écriture du PDF sont écrits dans le plugin. Le seul outil de fabrication qui n'est pas intégré à Node est fonttools (Python, licence MIT), utilisé à la main par tools/make-fonts.py.

## Bibliothèque MathJax (formules)

Depuis la version 0.1.6, le plugin intègre la bibliothèque mathjax-full, version 3.2.2, copyright The MathJax Consortium, licence Apache 2.0 (licences/Apache-2.0-MathJax.txt). Source : https://github.com/mathjax/MathJax-src. Elle lit les formules écrites en TeX et produit leur dessin SVG, que le plugin recopie en tracé vectoriel dans le PDF. Elle est incorporée au fichier main.js (environ 2,6 Mo de plus) ; ses polices mathématiques (MathJax TeX) sont sous licence SIL Open Font License 1.1 et leurs contours sont inclus dans le code de la bibliothèque. Le MathJax fourni avec Obsidian ne convient pas : il affiche les formules en HTML et ne donne pas de dessin vectoriel utilisable.

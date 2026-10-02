# Écrire un script Bigorneau

Un script est un fichier JavaScript qui commence par un commentaire d'en-tête. Il s'ajoute depuis la fenêtre des scripts (bouton bigorneau du panneau, puis « Choisir un fichier »). Il est copié dans le dossier `.obsidian/plugins/bigorneau/scripts`, présenté avec son nom, son origine et l'empreinte SHA-256 de son contenu, puis lancé après confirmation. Si le fichier change, il faut le confirmer de nouveau. Un script a les mêmes pouvoirs que le plugin : n'ajoutez que des scripts dont vous connaissez l'origine. Un exemple commenté se trouve dans [exemples/bonjour.js](exemples/bonjour.js).

## En-tête

L'en-tête est un commentaire `/* bigorneau-script ... */` placé au début du fichier, avec une ligne par clé : `name` (obligatoire, en français), `name-en`, `description`, `description-en`, `version`, `api` (obligatoire, 1 pour cette version de l'interface) et `requires` (identifiants de scripts nécessaires, séparés par des virgules). L'identifiant du script est tiré du nom du fichier : `bonjour.js` donne `ext:bonjour`.

## Interface reçue

Le code du script s'exécute avec une variable `bigorneau`, dans une fonction asynchrone (on peut donc utiliser `await`). Elle contient `version`, `app` (l'application Obsidian), `obsidian` (le module Obsidian), `language()` (`fr` ou `en`), `notice(message)`, `addFunction(fonction)`, `addHelp(entrées)`, `provide(nom, service)` et `service(nom)`.

`addFunction` reçoit un objet avec `id`, `name` (texte ou `{ fr, en }`), `icon` (nom d'icône Lucide ou liste de noms candidats), `needsEditor` (vrai si la fonction écrit dans la note), `available` (facultatif) et `run`. Chaque fonction devient un bouton du panneau et une commande de la palette, à laquelle chacun peut attribuer un raccourci. L'identifiant de la commande est précédé du nom du script (`bonjour-salut`). `run` reçoit `{ app, editor, view }` ; `editor` n'existe que si `needsEditor` est vrai.

`addHelp` ajoute des entrées à la fenêtre d'aide, chacune avec `id`, `title`, `text` et `keywords` facultatif, en texte ou `{ fr, en }`. `provide` publie un service que les autres scripts retrouvent avec `service` tant que le script est actif.

## Désactivation

Désactiver un script retire ses boutons et commandes de l'usage tout de suite, mais son code ne se décharge qu'au redémarrage d'Obsidian.

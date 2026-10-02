/* bigorneau-script
name: Bonjour
name-en: Hello
description: Ajoute une fonction qui affiche un message et une autre qui écrit une ligne de date dans la note.
description-en: Adds a function that shows a message and another that writes a date line into the note.
version: 1.0.0
api: 1
*/

// Fonction simple : un bouton et une commande qui affichent un message.
bigorneau.addFunction({
  id: `salut`,
  name: { fr: `Dire bonjour`, en: `Say hello` },
  icon: [`smile`, `hand`],
  run: () => bigorneau.notice(bigorneau.language() === `fr` ? `Bonjour de la part du script.` : `Hello from the script.`),
});

// Fonction qui écrit dans la note : elle reçoit l'éditeur et n'existe qu'en mode édition.
bigorneau.addFunction({
  id: `date`,
  name: { fr: `Insérer la date du jour`, en: `Insert today's date` },
  icon: [`calendar`, `calendar-days`],
  needsEditor: true,
  run: ({ editor }) => editor.replaceSelection(new Date().toISOString().slice(0, 10)),
});

bigorneau.addHelp([
  {
    id: `bonjour`,
    title: { fr: `Script Bonjour`, en: `Hello script` },
    text: { fr: `Exemple de script : un message et l'insertion de la date du jour.`, en: `Example script: a message and the insertion of today's date.` },
  },
]);

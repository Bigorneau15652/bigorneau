// Execution du texte d'un script ajoute a la main. C'est le seul fichier du plugin qui lit un texte comme un programme (new
// Function), comme le font les scripts d'Excalidraw, de Templater et de Dataview. Un tel script n'est execute qu'apres la
// confirmation de l'utilisateur, et de nouveau confirme si son texte change (voir scripts.ts). Il peut etre asynchrone.
export async function runScript(code: string, api: unknown, id: string): Promise<void> {
  const body = `"use strict";\nreturn (async () => {\n${code}\n})();\n//# sourceURL=bigorneau-script-${id.replace(/[^a-z0-9-]/g, `-`)}`;
  const fn = new Function(`bigorneau`, body) as (api: unknown) => Promise<unknown>;
  await fn(api);
}

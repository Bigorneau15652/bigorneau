// Registre des fonctions du plugin. Une fonction a un nom, une icone et une action ; chaque fonction enregistree devient une
// commande de la palette (donc elle peut recevoir un raccourci dans les reglages d'Obsidian) et un bouton du panneau. Les futurs
// scripts y enregistreront leurs propres fonctions. Ce module ne depend pas d'Obsidian : il se teste avec node --test.

export interface PanelFunction<Ctx> {
  // Identifiant de la commande (Obsidian y ajoute lui-meme celui du plugin).
  id: string;
  // Nom affiche dans le panneau, la palette de commandes et les reglages (traduit au moment de l'affichage).
  name: () => string;
  // Icones candidates (noms de la serie Lucide d'Obsidian) : la premiere qui existe est utilisee.
  icons: string[];
  // La fonction ecrit dans la note : il lui faut un editeur en mode edition.
  needsEditor: boolean;
  // Faux : commande de la palette sans bouton dans le panneau ni ligne dans les reglages des boutons.
  button?: boolean;
  // Absente : disponible partout. Sinon, faux sur les appareils ou la fonction n'existe pas (l'export, sur tablette).
  available?: () => boolean;
  // Fonction a etat (activer ou non) : vrai quand elle est active pour la note ouverte, le bouton est alors plus contraste.
  active?: (ctx: Ctx) => boolean;
  run: (ctx: Ctx) => void | Promise<void>;
}

export class FunctionRegistry<Ctx> {
  private items: PanelFunction<Ctx>[] = [];

  register(fn: PanelFunction<Ctx>): void {
    if (this.items.some((f) => f.id === fn.id)) throw new Error(`Fonction déjà enregistrée : ${fn.id}`);
    this.items.push(fn);
  }

  // Fonctions dans l'ordre d'enregistrement.
  all(): PanelFunction<Ctx>[] {
    return [...this.items];
  }

  get(id: string): PanelFunction<Ctx> | undefined {
    return this.items.find((f) => f.id === id);
  }
}

// Separation entre deux groupes de boutons du panneau : un identifiant de la forme sep:N, place dans l'ordre comme un bouton.
export const isSeparator = (id: string): boolean => /^sep:\d+$/.test(id);

// Ordre avec une separation de plus, a la position `at` (a la fin par defaut).
export function addSeparator(order: string[], at?: number): string[] {
  const used = order.filter(isSeparator).map((id) => Number(id.slice(4)));
  const id = `sep:${(used.length > 0 ? Math.max(...used) : 0) + 1}`;
  const out = [...order];
  out.splice(at === undefined ? out.length : Math.max(0, Math.min(out.length, at)), 0, id);
  return out;
}

export const removeId = (order: string[], id: string): string[] => order.filter((x) => x !== id);

// Elements a dessiner : les separations ne comptent que entre deux boutons (ni en tete, ni en queue, ni deux de suite).
export function displayItems(shown: string[]): string[] {
  const out: string[] = [];
  for (const id of shown) {
    if (isSeparator(id) && (out.length === 0 || isSeparator(out[out.length - 1]))) continue;
    out.push(id);
  }
  while (out.length > 0 && isSeparator(out[out.length - 1])) out.pop();
  return out;
}

// Ordre des boutons : d'abord les identifiants de l'ordre enregistre qui existent encore, dans cet ordre, puis les fonctions
// nouvelles, dans l'ordre ou elles ont ete ajoutees.
export function panelOrder(ids: string[], saved: string[]): string[] {
  const known = new Set(ids);
  const out: string[] = [];
  // Une separation (sep:1, sep:2...) n'est pas une fonction : elle reste dans l'ordre tant qu'on ne la supprime pas.
  for (const id of saved) if ((known.has(id) || isSeparator(id)) && !out.includes(id)) out.push(id);
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

// Identifiants des boutons affiches : l'ordre du panneau, sans les boutons masques.
export function visibleIds(ids: string[], saved: string[], hidden: string[]): string[] {
  return panelOrder(ids, saved).filter((id) => !hidden.includes(id));
}

// Deplace un identifiant a la position `to` (0 : en haut) ; une position hors des limites est ramenee dans la liste.
export function moveId(order: string[], id: string, to: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return [...order];
  const out = order.filter((x) => x !== id);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id);
  return out;
}

export function setHidden(hidden: string[], id: string, isHidden: boolean): string[] {
  const rest = hidden.filter((x) => x !== id);
  return isHidden ? [...rest, id] : rest;
}

// Nouvel ordre complet apres que l'utilisateur a reordonne les boutons affiches : les boutons masques gardent leur place, et les
// emplacements des boutons affiches sont remplis dans le nouvel ordre.
export function reorderVisible(full: string[], visible: string[], reordered: string[]): string[] {
  const shown = new Set(visible);
  const queue = reordered.filter((id) => shown.has(id));
  return full.map((id) => (shown.has(id) ? (queue.shift() as string) : id));
}

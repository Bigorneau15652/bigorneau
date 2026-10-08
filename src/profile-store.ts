// Profils, cote Obsidian : dossiers du plugin dans le coffre, liste des profils, enregistrement, chargement, renommage et suppression.
// Les fichiers sont lus et ecrits directement (adapter), car Obsidian n'indexe pas toujours les fichiers .json.
import { App, normalizePath } from "obsidian";
import { applyProfile, AUTO_BACKUP_NAME, buildProfile, parseProfile, Profile, profileName, sameProfile, serializeProfile } from "./profile";
import type { MmSettings } from "./settings";

// Cree un dossier du coffre avec ses dossiers parents s'il manque.
export async function ensureFolder(app: App, folder: string): Promise<void> {
  let path = ``;
  for (const part of normalizePath(folder).split(`/`)) {
    if (part === ``) continue;
    path = path === `` ? part : `${path}/${part}`;
    if (!(await app.vault.adapter.exists(path))) await app.vault.adapter.mkdir(path);
  }
}

export type SaveResult = `saved` | `exists` | `invalid`;
export type RenameResult = `renamed` | `exists` | `missing` | `invalid`;

export class ProfileStore {
  constructor(private app: App, private folder: () => string, private settings: () => MmSettings) {}

  private pathOf(name: string): string {
    return normalizePath(`${this.folder()}/${name}.json`);
  }

  // Noms des profils du dossier, dans l'ordre alphabetique ; les fichiers qui ne sont pas des profils sont ignores.
  async list(): Promise<string[]> {
    const adapter = this.app.vault.adapter;
    const folder = normalizePath(this.folder());
    if (!(await adapter.exists(folder))) return [];
    const names: string[] = [];
    for (const path of (await adapter.list(folder)).files) {
      if (!path.toLowerCase().endsWith(`.json`)) continue;
      try {
        if (parseProfile(await adapter.read(path))) names.push((path.split(`/`).pop() ?? path).replace(/\.json$/i, ``));
      } catch {
        // Fichier illisible : ce n'est pas un profil utilisable.
      }
    }
    return names.sort((a, b) => a.localeCompare(b));
  }

  // Le nom du profil existant qui ne differe de `name` que par la casse, ou null.
  async find(name: string): Promise<string | null> {
    return (await this.list()).find((n) => sameProfile(n, name)) ?? null;
  }

  // Enregistre les reglages actuels sous ce nom. Un nom deja pris n'est remplace qu'avec `overwrite`.
  async save(raw: string, overwrite: boolean): Promise<SaveResult> {
    const name = profileName(raw);
    if (name === ``) return `invalid`;
    const existing = await this.find(name);
    if (existing && !overwrite) return `exists`;
    await ensureFolder(this.app, this.folder());
    await this.app.vault.adapter.write(this.pathOf(existing ?? name), serializeProfile(buildProfile(existing ?? name, this.settings())));
    return `saved`;
  }

  async read(name: string): Promise<Profile | null> {
    try {
      return parseProfile(await this.app.vault.adapter.read(this.pathOf(name)));
    } catch {
      return null;
    }
  }

  // Reglages obtenus en chargeant le profil ; avant, les reglages actuels sont gardes dans le profil « Sauvegarde automatique ».
  async load(name: string): Promise<MmSettings | null> {
    const profile = await this.read(name);
    if (!profile) return null;
    await this.save(AUTO_BACKUP_NAME, true);
    return applyProfile(this.settings(), profile);
  }

  async remove(name: string): Promise<void> {
    const path = this.pathOf(name);
    if (await this.app.vault.adapter.exists(path)) await this.app.vault.adapter.remove(path);
  }

  // Renomme un profil. Un nom deja pris n'est remplace qu'avec `overwrite`.
  async rename(from: string, raw: string, overwrite: boolean): Promise<RenameResult> {
    const to = profileName(raw);
    if (to === ``) return `invalid`;
    const profile = await this.read(from);
    if (!profile) return `missing`;
    const clash = await this.find(to);
    if (clash && !sameProfile(clash, from) && !overwrite) return `exists`;
    if (clash && !sameProfile(clash, from)) await this.remove(clash);
    const adapter = this.app.vault.adapter;
    if (sameProfile(to, from)) {
      // Seule la casse change : sur un disque qui l'ignore, c'est le meme fichier, qu'on ne doit donc pas supprimer. Il passe par un nom
      // provisoire pour que le changement de casse soit pris en compte.
      const temp = this.pathOf(`${to}.renaming`);
      await adapter.rename(this.pathOf(from), temp);
      await adapter.rename(temp, this.pathOf(to));
    } else {
      await adapter.rename(this.pathOf(from), this.pathOf(to));
    }
    // Le nom ecrit dans le fichier change aussi.
    await adapter.write(this.pathOf(to), serializeProfile({ ...profile, name: to }));
    return `renamed`;
  }
}

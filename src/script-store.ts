// Dossier des scripts ajoutes a la main : sous-dossier « scripts » du dossier technique du plugin, invisible dans Obsidian. Les
// fichiers de configuration ne sont pas dans l'index du coffre : seul l'adaptateur peut les lire et les ecrire.
import { App, normalizePath } from "obsidian";

export class ScriptStore {
  constructor(private app: App, private pluginId: string) {}

  private dir(): string {
    return normalizePath(`${this.app.vault.configDir}/plugins/${this.pluginId}/scripts`);
  }

  private path(file: string): string {
    return normalizePath(`${this.dir()}/${file}`);
  }

  // Fichiers .js du dossier, avec leur texte.
  async list(): Promise<{ file: string; code: string }[]> {
    const adapter = this.app.vault.adapter;
    try {
      if (!(await adapter.exists(this.dir()))) return [];
      const listing = await adapter.list(this.dir());
      const out: { file: string; code: string }[] = [];
      for (const full of listing.files) {
        const file = full.split(`/`).pop() ?? full;
        if (/\.js$/i.test(file)) out.push({ file, code: await adapter.read(full) });
      }
      return out;
    } catch {
      return [];
    }
  }

  async write(file: string, code: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.dir()))) await adapter.mkdir(this.dir());
    await adapter.write(this.path(file), code);
  }

  async remove(file: string): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (await adapter.exists(this.path(file))) await adapter.remove(this.path(file));
  }
}

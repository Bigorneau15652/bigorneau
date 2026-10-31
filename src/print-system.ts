// Link with the printing of the system: list of the printers and printing without the box of the system. This is the only file of
// the plugin that reaches the printing of the application window, in a guarded block: when it is not available (another system or
// version of Obsidian), every function says so and the plugin falls back on the printing box of the system.

// A printer of the system.
export interface PrinterInfo {
  name: string;
  label: string;
  isDefault: boolean;
}

interface PrintContents {
  getPrintersAsync(): Promise<{ name: string; displayName?: string; isDefault?: boolean }[]>;
  print(options: Record<string, unknown>, callback?: (success: boolean, reason: string) => void): void;
}

// Printing of the application window, or null when the application does not give access to it.
function printContents(): PrintContents | null {
  try {
    const load = (window as unknown as { require?: (name: string) => unknown }).require;
    if (typeof load !== `function`) return null;
    const host = load(`electron`) as { remote?: { getCurrentWebContents?: () => PrintContents } } | undefined;
    const contents = host?.remote?.getCurrentWebContents?.();
    return contents && typeof contents.getPrintersAsync === `function` && typeof contents.print === `function` ? contents : null;
  } catch {
    return null;
  }
}

// Printers of the system, or null when the list is not available.
export async function listPrinters(): Promise<PrinterInfo[] | null> {
  const contents = printContents();
  if (!contents) return null;
  try {
    const printers = await contents.getPrintersAsync();
    if (!Array.isArray(printers)) return null;
    return printers
      .filter((p) => typeof p.name === `string` && p.name !== ``)
      .map((p) => ({ name: p.name, label: typeof p.displayName === `string` && p.displayName !== `` ? p.displayName : p.name, isDefault: p.isDefault === true }));
  } catch {
    return null;
  }
}

// Sends the window to a printer without the box of the system. Answers with the reason when it fails.
export function printWithoutBox(settings: Record<string, unknown>): Promise<{ ok: boolean; reason: string }> {
  return new Promise((resolve) => {
    const contents = printContents();
    if (!contents) {
      resolve({ ok: false, reason: `` });
      return;
    }
    let done = false;
    const finish = (ok: boolean, reason: string): void => {
      if (done) return;
      done = true;
      resolve({ ok, reason });
    };
    window.setTimeout(() => finish(false, `timeout`), 180000);
    try {
      contents.print(settings, (success, reason) => finish(success === true, typeof reason === `string` ? reason : ``));
    } catch (e) {
      finish(false, e instanceof Error ? e.message : String(e));
    }
  });
}

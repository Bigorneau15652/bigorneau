// Waiting before the print window opens. The pages of the preview are copied under the body just before the printing, and the system
// takes its picture of the window at the moment `window.print()` is called: a picture (above all an SVG one, such as a chart or a drawing
// of Excalidraw, which is loaded by a nested document) that is not yet loaded and decoded is printed as a white space. This helper waits
// until every picture of the copy is ready, with a limit so that a picture that never loads cannot block the printing.

// Resolves when all `images` are decoded (or cannot be), or when `limit` milliseconds have passed.
export async function imagesReady(images: HTMLImageElement[], limit = 15000): Promise<void> {
  if (images.length === 0) return;
  const all = Promise.all(
    images.map(async (img) => {
      try {
        await img.decode();
      } catch {
        // A picture that cannot be decoded is printed as it is.
      }
    })
  );
  await Promise.race([all, new Promise<void>((resolve) => window.setTimeout(resolve, limit))]);
}

// Resolves after the browser has drawn twice, so that what was just added to the page is in the picture taken for the printing.
export function afterPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
}

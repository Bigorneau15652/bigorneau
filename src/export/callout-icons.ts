// Small pictograms of the callouts, drawn by the plugin (simple strokes in a square of 24 units, round ends, no fill). The same paths
// serve the PDF (as path operators), the preview and printing, and the HTML page (as SVG). Only the commands M, L, C and Z are used,
// with absolute numbers. This module does not depend on Obsidian.
import type { CalloutKind } from "./callout";

// Circle of radius `r` as four cubic curves.
function circle(cx: number, cy: number, r: number): string {
  const k = r * 0.5523;
  return `M ${cx + r} ${cy} C ${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r} C ${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy} C ${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r} C ${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy} Z`;
}

// A dot: a very short line, which the round ends draw as a point.
const dot = (x: number, y: number): string => `M ${x} ${y} L ${x} ${y + 0.1}`;

// The paths of each kind (each is one drawing, a drawing may hold several sub-paths).
export const CALLOUT_ICONS: Record<CalloutKind, string> = {
  // Pencil.
  note: `M 15 4.5 L 19.5 9 L 8 20.5 L 3.5 21 L 4 16.5 Z M 12.5 7 L 17 11.5`,
  // Clipboard with lines.
  abstract: `M 6 5 L 18 5 L 18 21 L 6 21 Z M 9 3 L 15 3 L 15 7 L 9 7 Z M 9 12 L 15 12 M 9 16 L 15 16`,
  // Circle with an i.
  info: `${circle(12, 12, 9)} M 12 11 L 12 17 ${dot(12, 7.6)}`,
  // Circle with a tick.
  todo: `${circle(12, 12, 9)} M 8 12.5 L 11 15.5 L 16.5 9`,
  // Flame.
  tip: `M 12 3 C 12 7.5 17 9 17 14.5 C 17 18 14.8 20.5 12 20.5 C 9.2 20.5 7 18 7 14.5 C 7 12 8.3 10.7 9.5 9.2 C 10.2 10.6 10.7 11.4 11.3 12 C 12.3 9.3 12.2 6 12 3 Z`,
  // Tick.
  success: `M 5 12.5 L 10 17.5 L 19 7`,
  // Circle with a question mark.
  question: `${circle(12, 12, 9)} M 9.2 9.7 C 9.2 7.7 10.6 6.9 12 6.9 C 13.6 6.9 14.8 7.9 14.8 9.4 C 14.8 11.3 12 11.7 12 13.9 ${dot(12, 16.9)}`,
  // Triangle with an exclamation mark.
  warning: `M 12 3.5 L 21.5 20 L 2.5 20 Z M 12 9.5 L 12 14 ${dot(12, 16.8)}`,
  // Cross.
  failure: `M 6 6 L 18 18 M 18 6 L 6 18`,
  // Lightning.
  danger: `M 13 3 L 5 13.5 L 11 13.5 L 10 21 L 19 10 L 13 10 Z`,
  // Insect.
  bug: `${circle(12, 14, 5)} M 12 9 L 12 19 M 9 7 L 10.6 9.3 M 15 7 L 13.4 9.3 M 4 12 L 7.2 13.2 M 20 12 L 16.8 13.2 M 4 18 L 7.2 16.6 M 20 18 L 16.8 16.6`,
  // List.
  example: `M 8 6 L 20 6 M 8 12 L 20 12 M 8 18 L 20 18 ${dot(4, 6)} ${dot(4, 12)} ${dot(4, 18)}`,
  // Quotation marks.
  quote: `M 4 11 L 10 11 L 10 17 L 4 17 Z M 4 11 C 4 8.5 5.5 7.3 8 7 M 14 11 L 20 11 L 20 17 L 14 17 Z M 14 11 C 14 8.5 15.5 7.3 18 7`,
};

// Width of the stroke, in the units of the square of 24.
export const ICON_STROKE = 2;

// The path of an icon as PDF operators, in the units of the square of 24 with the y axis pointing down (the page puts the square in place
// with a matrix that flips it).
export function iconPdfPath(kind: CalloutKind): string {
  const tokens = CALLOUT_ICONS[kind].split(/\s+/).filter((t) => t !== ``);
  const out: string[] = [];
  let i = 0;
  const num = (): string => String(Math.round(Number(tokens[i++]) * 1000) / 1000);
  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === `M`) out.push(`${num()} ${num()} m`);
    else if (cmd === `L`) out.push(`${num()} ${num()} l`);
    else if (cmd === `C`) out.push(`${num()} ${num()} ${num()} ${num()} ${num()} ${num()} c`);
    else if (cmd === `Z`) out.push(`h`);
  }
  return out.join(` `);
}

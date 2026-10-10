// Pure helpers for the selection of several titles in the map: range between two titles and toggling one title.
// They work on plain keys so that they can be tested without the map.

// Keys of the displayed titles between two keys (both included), in display order. When one key is missing, only the other is returned.
export function rangeBetween(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return j >= 0 ? [b] : i >= 0 ? [a] : [];
  return order.slice(Math.min(i, j), Math.max(i, j) + 1);
}

// New selection after Cmd or Ctrl + click: the key is removed when it was selected, added otherwise.
export function toggled(selection: string[], key: string): string[] {
  return selection.includes(key) ? selection.filter((k) => k !== key) : [...selection, key];
}

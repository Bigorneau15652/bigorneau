// Icones des reperes de liens : dix modeles pour chaque sorte de lien (autre note, lien dans la note, page web).
// Dessins sur une grille de 16 sur 16, au trait, en couleur du texte courant (currentColor).

export type IconKind = `external` | `internal` | `web`;

export interface IconDef {
  id: string;
  // Nom francais, utilise comme infobulle dans la galerie des reglages.
  name: string;
  body: string;
}

const CHAIN = `<path d="M6.5 9.5a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0-3.5-3.5l-.7.7"/><path d="M9.5 6.5a2.5 2.5 0 0 0-3.5 0l-2 2a2.5 2.5 0 0 0 3.5 3.5l.7-.7"/>`;

export const ICONS: Record<IconKind, IconDef[]> = {
  external: [
    { id: `chain`, name: `Chaîne`, body: CHAIN },
    { id: `open`, name: `Sortie d'un cadre`, body: `<path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5"/>` },
    { id: `file`, name: `Page`, body: `<path d="M4 2h5.5L12 4.5V14H4z"/><path d="M9 2v3h3M6 8h4M6 11h4"/>` },
    { id: `book`, name: `Livre`, body: `<path d="M3 3h4a1 1 0 0 1 1 1v9a1 1 0 0 0-1-1H3zM13 3H9a1 1 0 0 0-1 1v9a1 1 0 0 1 1-1h4z"/>` },
    { id: `arrow`, name: `Flèche vers la droite`, body: `<path d="M3 8h10M9 4l4 4-4 4"/>` },
    { id: `bookmark`, name: `Marque-page`, body: `<path d="M4 2h8v12l-4-3-4 3z"/>` },
    { id: `folder`, name: `Dossier`, body: `<path d="M2 4.5V12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6.5a1 1 0 0 0-1-1H8L6.5 3.5H3a1 1 0 0 0-1 1z"/>` },
    { id: `target`, name: `Cible`, body: `<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="2"/>` },
    { id: `star`, name: `Étoile`, body: `<path d="m8 2 1.8 3.9 4.2.5-3.1 2.9.8 4.2L8 11.4 4.3 13.5l.8-4.2L2 6.4l4.2-.5z"/>` },
    { id: `diamond`, name: `Losange`, body: `<path d="m8 2 6 6-6 6-6-6z"/>` },
  ],
  internal: [
    { id: `return`, name: `Flèche coudée`, body: `<path d="M3 3v5a3 3 0 0 0 3 3h7"/><path d="m10 8 3 3-3 3"/>` },
    { id: `arrow`, name: `Flèche vers la droite`, body: `<path d="M3 8h10M9 4l4 4-4 4"/>` },
    { id: `curve`, name: `Flèche courbe`, body: `<path d="M3 12c0-5 3-8 9-8"/><path d="m9 1.5 3 2.5-2.5 3"/>` },
    { id: `loop`, name: `Boucle`, body: `<path d="M3 8a5 5 0 0 1 9-3M13 8a5 5 0 0 1-9 3"/><path d="M12 2v3h-3M4 14v-3h3"/>` },
    { id: `swap`, name: `Aller et retour`, body: `<path d="M3 5.5h10M10 2.5l3 3-3 3M13 10.5H3M6 7.5l-3 3 3 3"/>` },
    { id: `dot`, name: `Point relié`, body: `<circle cx="4" cy="8" r="1.8"/><circle cx="12" cy="8" r="1.8"/><path d="M5.8 8h4.4"/>` },
    { id: `branch`, name: `Branche`, body: `<circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M4 5v6M4 9c0-2 2-3 6.5-3"/>` },
    { id: `chevrons`, name: `Chevrons`, body: `<path d="m4 4 4 4-4 4M9 4l4 4-4 4"/>` },
    { id: `anchor`, name: `Ancre`, body: `<circle cx="8" cy="4" r="1.5"/><path d="M8 5.5V14M4.5 8H3a5 5 0 0 0 10 0h-1.5M5.5 8h5"/>` },
    { id: `pin`, name: `Épingle`, body: `<path d="M8 14V9M5 9h6l-1-4h1V3H5v2h1z"/>` },
  ],
  web: [
    { id: `globe`, name: `Mappemonde`, body: `<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2.2 2.2 2.2 9.8 0 12M8 2c-2.2 2.2-2.2 9.8 0 12"/>` },
    { id: `globe-meridian`, name: `Globe simple`, body: `<circle cx="8" cy="8" r="6"/><path d="M8 2c3 3 3 9 0 12M2 8h12"/>` },
    { id: `link`, name: `Chaîne`, body: CHAIN },
    { id: `cursor`, name: `Pointeur`, body: `<path d="M4 2.5v10l2.7-2.5 1.8 3.5 1.7-.9-1.8-3.4H12z"/>` },
    { id: `window`, name: `Fenêtre de navigateur`, body: `<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M2 6h12M4.2 4.5h.1M6 4.5h.1"/>` },
    { id: `compass`, name: `Boussole`, body: `<circle cx="8" cy="8" r="6"/><path d="m10.5 5.5-1.3 3.7-3.7 1.3 1.3-3.7z"/>` },
    { id: `cloud`, name: `Nuage`, body: `<path d="M4.5 12.5a3 3 0 0 1-.3-6 4 4 0 0 1 7.6 1 2.5 2.5 0 0 1-.3 5z"/>` },
    { id: `wifi`, name: `Ondes`, body: `<path d="M2 6.5a8 8 0 0 1 12 0M4 9a5 5 0 0 1 8 0M6.2 11.3a2 2 0 0 1 3.6 0"/><circle cx="8" cy="13" r=".6"/>` },
    { id: `external`, name: `Sortie d'un cadre`, body: `<path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5"/>` },
    { id: `play`, name: `Lecture`, body: `<rect x="2" y="3.5" width="12" height="9" rx="2"/><path d="m6.7 6 3.3 2-3.3 2z"/>` },
  ],
};

export const DEFAULT_ICON: Record<IconKind, string> = { external: `chain`, internal: `return`, web: `globe` };

export function iconDef(kind: IconKind, id: string): IconDef {
  const list = ICONS[kind];
  return list.find((i) => i.id === id) ?? list[0];
}

export function iconSvg(kind: IconKind, id: string, size = 12): string {
  const w = kind === `web` ? 1.5 : 1.6;
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconDef(kind, id).body}</svg>`;
}

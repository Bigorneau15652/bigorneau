// Liste des boutons du panneau, avec ses reglages : glisser-deposer d'une ligne, bouton affiche ou masque, separations a ajouter ou a
// supprimer. Elle sert a deux endroits : le chapitre « Panneau de boutons » des reglages d'Obsidian et la fenetre du bouton Bigorneau
// (l'escargot). Les changements se voient tout de suite dans le panneau.
import { Setting } from "obsidian";
import { addSeparator, isSeparator, moveId, panelOrder, removeId, setHidden } from "./functions";
import { t } from "./i18n";
import type MindmapWritingPlugin from "./main";

export function renderButtonList(el: HTMLElement, plugin: MindmapWritingPlugin): void {
  const s = plugin.settings;
  el.createDiv({ cls: `mmw-pnote`, text: t(`Glissez la poignée d'une ligne pour déplacer un bouton ou une séparation (un clic long sur un bouton du panneau, puis un glissement, le déplace aussi). L'interrupteur affiche ou masque le bouton ; le bouton Bigorneau (l'escargot) reste toujours en haut du panneau.`) });
  const list = el.createDiv({ cls: `mmw-panel-settings` });
  const available = () => plugin.functions.all().filter((f) => f.button !== false && (!f.available || f.available()));
  const draw = (): void => {
    list.empty();
    const all = available();
    const order = panelOrder(all.map((f) => f.id), s.panelOrder);
    for (const id of order) {
      const separator = isSeparator(id);
      const fn = all.find((f) => f.id === id);
      if (!separator && !fn) continue;
      const row = new Setting(list).setName(separator ? t(`Séparation`) : (fn as { name: () => string }).name());
      row.settingEl.addClass(`mmw-panel-row`);
      row.settingEl.dataset.id = id;
      if (separator) row.setDesc(t(`Un trait entre deux groupes de boutons.`));
      row.addExtraButton((b) => {
        b.setIcon(`grip-vertical`).setTooltip(t(`Glisser pour déplacer`));
        makeRowDraggable(plugin, b.extraSettingsEl, row.settingEl, list, order, id, draw);
      });
      if (separator) {
        row.addExtraButton((b) =>
          b
            .setIcon(`trash`)
            .setTooltip(t(`Supprimer la séparation`))
            .onClick(async () => {
              await plugin.saveOrder(removeId(order, id));
              draw();
            })
        );
      } else {
        row.addToggle((x) =>
          x.setValue(!s.panelHidden.includes(id)).onChange(async (shown) => {
            s.panelHidden = setHidden(s.panelHidden, id, !shown);
            await plugin.saveSettings(false);
          })
        );
      }
    }
  };
  draw();
  new Setting(el).addButton((b) =>
    b.setButtonText(t(`Ajouter une séparation`)).onClick(async () => {
      await plugin.saveOrder(addSeparator(panelOrder(available().map((f) => f.id), s.panelOrder)));
      draw();
    })
  );
}

// Glisser-deposer d'une ligne : la poignee suit le pointeur, un trait montre ou la ligne sera deposee.
function makeRowDraggable(plugin: MindmapWritingPlugin, handle: HTMLElement, rowEl: HTMLElement, list: HTMLElement, order: string[], id: string, redraw: () => void): void {
  handle.addClass(`mmw-panel-handle`);
  let startY = 0;
  let target = 0;
  let dragging = false;
  const others = (): HTMLElement[] => Array.from(list.querySelectorAll<HTMLElement>(`.mmw-panel-row`)).filter((r) => r !== rowEl);
  const clear = (): void => others().forEach((r) => r.removeClasses([`mmw-panel-drop-before`, `mmw-panel-drop-after`]));
  handle.addEventListener(`pointerdown`, (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    target = order.indexOf(id);
    handle.setPointerCapture(e.pointerId);
    rowEl.addClass(`mmw-panel-row-dragging`);
  });
  handle.addEventListener(`pointermove`, (e) => {
    if (!dragging) return;
    rowEl.style.transform = `translateY(${e.clientY - startY}px)`;
    const rest = others();
    target = rest.filter((r) => {
      const box = r.getBoundingClientRect();
      return box.top + box.height / 2 < e.clientY;
    }).length;
    clear();
    if (target < rest.length) rest[target].addClass(`mmw-panel-drop-before`);
    else if (rest.length > 0) rest[rest.length - 1].addClass(`mmw-panel-drop-after`);
  });
  const finish = async (commit: boolean): Promise<void> => {
    if (!dragging) return;
    dragging = false;
    clear();
    rowEl.removeClass(`mmw-panel-row-dragging`);
    rowEl.style.removeProperty(`transform`);
    if (!commit) return;
    const moved = moveId(order, id, target);
    if (moved.join() === order.join()) return;
    await plugin.saveOrder(moved);
    redraw();
  };
  handle.addEventListener(`pointerup`, () => void finish(true));
  handle.addEventListener(`pointercancel`, () => void finish(false));
}

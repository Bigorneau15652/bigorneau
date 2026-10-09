// Petite fenetre de saisie d'un lien web ou d'une video integree : adresse, texte facultatif, integration.
// N'utilise que le DOM standard, pour pouvoir etre verifiee hors d'Obsidian.

import { t } from "./i18n";

export interface WebDialogOptions {
  title: string;
  url: string;
  label: string;
  embed: boolean;
  // Present seulement quand on modifie un lien existant.
  onDelete?: () => void;
  onSubmit: (values: { url: string; label: string; embed: boolean }) => void;
  onCancel?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

export class WebDialog {
  readonly root: HTMLElement;
  private urlInput: HTMLInputElement;
  private labelInput: HTMLInputElement;
  private embedInput: HTMLInputElement;
  private errorEl: HTMLElement;
  private done = false;
  private cleanups: (() => void)[] = [];

  constructor(host: HTMLElement, private opts: WebDialogOptions) {
    this.root = el(`div`, `mmw-dialog mmw-web-dialog`);
    this.root.setAttribute(`role`, `dialog`);
    this.root.setAttribute(`aria-label`, opts.title);
    this.root.append(el(`div`, `mmw-dlg-label`, opts.title));

    const field = (label: string, input: HTMLElement): void => {
      const wrap = el(`label`, `mmw-dlg-field`);
      wrap.append(el(`span`, `mmw-dlg-label`, label), input);
      this.root.append(wrap);
    };
    this.urlInput = el(`input`, `mmw-dlg-input mmw-web-url`);
    this.urlInput.type = `text`;
    this.urlInput.value = opts.url;
    this.urlInput.placeholder = `https://…`;
    this.urlInput.spellcheck = false;
    field(t(`Adresse (page web, vidéo YouTube…)`), this.urlInput);

    this.labelInput = el(`input`, `mmw-dlg-input mmw-web-label`);
    this.labelInput.type = `text`;
    this.labelInput.value = opts.label;
    this.labelInput.placeholder = t(`Facultatif`);
    field(t(`Texte du lien`), this.labelInput);

    const embedWrap = el(`label`, `mmw-web-embed`);
    this.embedInput = el(`input`, `mmw-web-embed-input`);
    this.embedInput.type = `checkbox`;
    this.embedInput.checked = opts.embed;
    embedWrap.append(this.embedInput, el(`span`, ``, t(` Intégrer dans la note (vidéo ou image) au lieu d'un simple lien`)));
    this.root.append(embedWrap);

    this.errorEl = el(`div`, `mmw-web-error`);
    this.errorEl.hidden = true;
    this.root.append(this.errorEl);

    const actions = el(`div`, `mmw-dlg-actions`);
    if (opts.onDelete) {
      const del = el(`button`, `mmw-dlg-btn mod-warning`, t(`Supprimer le lien`));
      del.type = `button`;
      del.addEventListener(`click`, () => this.finish(() => opts.onDelete!()));
      actions.append(del);
    }
    const cancel = el(`button`, `mmw-dlg-btn`, t(`Annuler`));
    cancel.type = `button`;
    cancel.addEventListener(`click`, () => this.cancel());
    const ok = el(`button`, `mmw-dlg-btn mod-cta`, t(`Enregistrer`));
    ok.type = `button`;
    ok.addEventListener(`click`, () => this.submit());
    actions.append(cancel, ok);
    this.root.append(actions);

    this.root.addEventListener(`keydown`, (e) => {
      // Les touches de la fenetre ne doivent pas agir sur la carte.
      e.stopPropagation();
      if (e.key === `Escape`) {
        e.preventDefault();
        this.cancel();
      } else if (e.key === `Enter` && (e.target as HTMLElement).tagName === `INPUT` && (e.target as HTMLInputElement).type === `text`) {
        e.preventDefault();
        this.submit();
      }
    });
    host.appendChild(this.root);
    this.root.style.left = `${Math.max(8, (host.clientWidth - this.root.offsetWidth) / 2)}px`;
    this.root.style.top = `${Math.max(8, host.clientHeight / 4)}px`;

    // Un clic en dehors de la fenetre l'annule.
    const doc = host.ownerDocument;
    const outside = (e: Event): void => {
      if (!this.root.contains(e.target as Node)) this.cancel();
    };
    doc.addEventListener(`pointerdown`, outside, true);
    this.cleanups.push(() => doc.removeEventListener(`pointerdown`, outside, true));

    this.urlInput.focus();
    this.urlInput.select();
  }

  isOpen(): boolean {
    return !this.done;
  }

  private finish(fn: () => void): void {
    if (this.done) return;
    this.done = true;
    for (const c of this.cleanups) c();
    this.cleanups = [];
    this.root.remove();
    fn();
  }

  private submit(): void {
    const url = this.urlInput.value.trim();
    if (!URL_RE.test(url)) {
      this.errorEl.textContent = t(`L'adresse doit commencer par http:// ou https://.`);
      this.errorEl.hidden = false;
      this.urlInput.focus();
      return;
    }
    const values = { url, label: this.labelInput.value.trim(), embed: this.embedInput.checked };
    this.finish(() => this.opts.onSubmit(values));
  }

  cancel(): void {
    this.finish(() => this.opts.onCancel?.());
  }

  close(): void {
    this.cancel();
  }
}

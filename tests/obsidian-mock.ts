/** Minimal Obsidian DOM adapter for behavior tests, not a runtime replacement. */
type ElementOptions = { text?: string; cls?: string; type?: string; attr?: Record<string, string> };

if (typeof HTMLElement !== 'undefined') {
  Object.assign(HTMLElement.prototype, {
    empty(this: HTMLElement) { this.replaceChildren(); },
    addClass(this: HTMLElement, ...classes: string[]) { this.classList.add(...classes); },
    createEl(this: HTMLElement, tag: string, options: ElementOptions = {}) {
      const element = document.createElement(tag);
      if (options.text) element.textContent = options.text;
      if (options.cls) element.className = options.cls;
      if (options.type) element.setAttribute('type', options.type);
      for (const [key, value] of Object.entries(options.attr ?? {})) element.setAttribute(key, value);
      this.append(element);
      return element;
    },
    createDiv(this: HTMLElement, options: ElementOptions = {}) { return this.createEl('div', options); },
    createSpan(this: HTMLElement, options: ElementOptions = {}) { return this.createEl('span', options); },
  });
}

export class Modal {
  modalEl = document.createElement('div');
  contentEl = document.createElement('div');
  constructor(public app: unknown) { this.modalEl.append(this.contentEl); }
  setTitle(title: string): void { this.modalEl.setAttribute('aria-label', title); }
  open(): void { document.body.append(this.modalEl); this.onOpen(); }
  close(): void { this.onClose(); this.modalEl.remove(); }
  onOpen(): void { /* subclass hook */ }
  onClose(): void { /* subclass hook */ }
}

export class Notice {
  constructor(public message: string) {}
}

export class Plugin {
  constructor(public app: unknown) {}
  loadData(): Promise<unknown> { return Promise.resolve(null); }
  saveData(): Promise<void> { return Promise.resolve(); }
  addSettingTab(): void {}
  addCommand(): void {}
  addRibbonIcon(): HTMLElement { return document.createElement('div'); }
  registerMarkdownCodeBlockProcessor(): void {}
  registerEvent(): void {}
}

export class TFile {
  constructor(public path: string, public basename: string, public extension = 'md') {}
}
export class TFolder { constructor(public path: string) {} }

export class MarkdownView {}
export class PluginSettingTab {
  constructor(public app: unknown, public plugin: unknown) {}
}
export class Setting {}

export function normalizePath(path: string): string { return path.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/\/$/, ''); }

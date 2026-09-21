import { Modal, Notice } from 'obsidian';
import type { App } from 'obsidian';

export class PromptModal extends Modal {
  constructor(app: App, private readonly prompt: string) { super(app); }

  onOpen(): void {
    this.setTitle('Generate quiz prompt');
    this.contentEl.createEl('p', { text: 'Paste this prompt into Claudian or Copilot. Then save the generated quiz blocks in a Markdown note, or copy the response and run "Import generated quiz from clipboard".' });
    const textarea = this.contentEl.createEl('textarea', { cls: 'note-quiz-prompt' });
    textarea.value = this.prompt;
    textarea.readOnly = true;
    textarea.setAttribute('aria-label', 'Quiz generation prompt');
    const status = this.contentEl.createEl('p', { attr: { role: 'status' } });
    const copy = this.contentEl.createEl('button', { text: 'Copy prompt', cls: 'mod-cta' });
    copy.addEventListener('click', () => {
      void this.copy(textarea, status);
    });
  }

  private async copy(textarea: HTMLTextAreaElement, status: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.prompt);
      status.textContent = 'Prompt copied.';
      new Notice('Quiz prompt copied.');
    } catch {
      textarea.focus();
      textarea.select();
      status.textContent = 'Clipboard access is unavailable. Copy the selected text manually.';
    }
  }

  onClose(): void { this.contentEl.empty(); }
}

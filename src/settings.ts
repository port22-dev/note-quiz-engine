import { PluginSettingTab, Setting } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { DEFAULT_PROMPT_TEMPLATE } from './prompt';
import { DEFAULT_QUIZ_FOLDER, LEGACY_QUIZ_FOLDER, normalizeQuizFolder } from './output-folder';

export interface QuizSettings {
  generationLanguage: GenerationLanguage;
  caseSensitive: boolean;
  questionCount: number;
  promptTemplate: string;
  outputFolder: string;
}

export type GenerationLanguage = 'ja' | 'en' | 'source';

export const DEFAULT_SETTINGS: QuizSettings = {
  generationLanguage: 'ja',
  caseSensitive: true,
  questionCount: 10,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  outputFolder: DEFAULT_QUIZ_FOLDER,
};

export function loadQuizSettings(data: unknown): QuizSettings {
  const value = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const hasLegacySettings = ['caseSensitive', 'questionCount', 'promptTemplate'].some((key) => key in value);
  let outputFolder = hasLegacySettings && !('outputFolder' in value) ? LEGACY_QUIZ_FOLDER : DEFAULT_QUIZ_FOLDER;
  if (typeof value.outputFolder === 'string') {
    try { outputFolder = normalizeQuizFolder(value.outputFolder); } catch { /* Repair invalid saved paths. */ }
  }
  return {
    generationLanguage: value.generationLanguage === 'en' || value.generationLanguage === 'source' || value.generationLanguage === 'ja'
      ? value.generationLanguage : DEFAULT_SETTINGS.generationLanguage,
    caseSensitive: typeof value.caseSensitive === 'boolean' ? value.caseSensitive : DEFAULT_SETTINGS.caseSensitive,
    questionCount: typeof value.questionCount === 'number' && Number.isInteger(value.questionCount) && value.questionCount >= 1 && value.questionCount <= 100 ? value.questionCount : DEFAULT_SETTINGS.questionCount,
    promptTemplate: typeof value.promptTemplate === 'string' && value.promptTemplate.trim() ? value.promptTemplate : DEFAULT_SETTINGS.promptTemplate,
    outputFolder,
  };
}

interface SettingsHost extends Plugin {
  settings: QuizSettings;
  persistSettings(): Promise<void>;
}

export class QuizSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly host: SettingsHost) {
    super(app, host);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName('Quiz generation language')
      .setDesc('Language used for generated questions, choices, answers, and explanations.')
      .addDropdown((dropdown) => dropdown
        .addOption('ja', '日本語')
        .addOption('en', 'English')
        .addOption('source', '元ノートと同じ言語')
        .setValue(this.host.settings.generationLanguage)
        .onChange((value) => {
          if (value === 'ja' || value === 'en' || value === 'source') {
            this.host.settings.generationLanguage = value;
            void this.host.persistSettings();
          }
        }));
    new Setting(containerEl).setName('Case-sensitive answers')
      .setDesc('When off, FREE and free are treated as the same answer. Applies to new quiz attempts.')
      .addToggle((toggle) => toggle.setValue(this.host.settings.caseSensitive).onChange((value) => {
        this.host.settings.caseSensitive = value;
        void this.host.persistSettings();
      }));
    new Setting(containerEl).setName('Question count')
      .setDesc('How many questions to ask the AI to create (1–100).')
      .addText((text) => text.setValue(String(this.host.settings.questionCount)).onChange((value) => {
        const count = Number(value);
        if (Number.isInteger(count) && count >= 1 && count <= 100) {
          this.host.settings.questionCount = count;
          void this.host.persistSettings();
        }
      }));
    const folderDescription = 'Generated and imported quizzes are saved here. Existing notes are kept in place.';
    const folderSetting = new Setting(containerEl).setName('Quiz folder').setDesc(folderDescription);
    folderSetting.addText((text) => text.setValue(this.host.settings.outputFolder).setPlaceholder(DEFAULT_QUIZ_FOLDER).onChange((value) => {
      try {
        this.host.settings.outputFolder = normalizeQuizFolder(value);
        folderSetting.setDesc(folderDescription);
        void this.host.persistSettings();
      } catch {
        folderSetting.setDesc('Enter a folder inside your vault, such as Quizzes or Study/Quizzes.');
      }
    }));
    new Setting(containerEl).setName('Prompt template')
      .setDesc('Generate quiz sends this prompt and the current note to Claudian using your configured provider and account. The selected quiz generation language is applied first. You can use {{noteTitle}}, {{notePath}}, {{noteContent}}, {{questionCount}}, and {{generationId}}. The required format and note content are always included.')
      .addTextArea((text) => {
        text.inputEl.rows = 15;
        text.inputEl.addClass('note-quiz-template-setting');
        text.setValue(this.host.settings.promptTemplate).onChange((value) => {
          this.host.settings.promptTemplate = value.trim() ? value : DEFAULT_PROMPT_TEMPLATE;
          void this.host.persistSettings();
        });
      });
    new Setting(containerEl).setName('Restore default prompt')
      .addButton((button) => button.setButtonText('Reset prompt').onClick(() => {
        this.host.settings.promptTemplate = DEFAULT_PROMPT_TEMPLATE;
        void this.host.persistSettings();
        this.display();
      }));
  }
}

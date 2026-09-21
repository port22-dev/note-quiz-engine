import type { App } from 'obsidian';

export interface GenerationOptions {
  signal: AbortSignal;
  onStatus: (status: string) => void;
}

export interface QuizGenerator {
  generate(prompt: string, options: GenerationOptions): Promise<string>;
}

interface Message {
  id: string;
  role: string;
  content?: string;
  completedAt?: number;
  isInterrupt?: boolean;
  contentBlocks?: Array<{ type: string; content?: string }>;
}

interface ClaudianTab {
  state: { messages: Message[]; isStreaming: boolean; requiresAction?: boolean };
  controllers: {
    inputController: {
      sendMessage(options: {
        content: string;
        images: [];
        editorContextOverride: null;
        browserContextOverride: null;
        canvasContextOverride: null;
      }): Promise<void>;
      cancelStreaming(): void;
    };
  };
}

interface ClaudianPlugin {
  activateView(): Promise<void>;
  getView(): {
    getTabManager(): {
      createTab(conversationId: null, tabId: undefined, options: { activate: true }): Promise<ClaudianTab | null>;
    } | null;
  } | null;
}

function cancelled(): Error { return new Error('Quiz generation cancelled.'); }

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw cancelled();
}

/** Compatibility boundary for realclaudian 2.3.0; no provider HTTP or auth code. */
export class ClaudianGenerator implements QuizGenerator {
  constructor(private readonly app: App) {}

  async generate(prompt: string, { signal, onStatus }: GenerationOptions): Promise<string> {
    assertActive(signal);
    const registry = (this.app as App & { plugins?: { getPlugin(id: string): unknown } }).plugins;
    const candidate = registry?.getPlugin('realclaudian') ?? registry?.getPlugin('claudian');
    if (!candidate) throw new Error('Enable Claudian to generate quizzes automatically. You can also use Generate quiz prompt with another AI tool.');
    const plugin = candidate as Partial<ClaudianPlugin>;
    if (typeof plugin.activateView !== 'function' || typeof plugin.getView !== 'function') {
      throw new Error('This Claudian version does not support automatic generation. Tested with realclaudian 2.3.0. Use Generate quiz prompt instead.');
    }
    onStatus('Connecting to Claudian…');
    await plugin.activateView();
    assertActive(signal);
    const view = plugin.getView();
    const manager = typeof view?.getTabManager === 'function' ? view.getTabManager() : null;
    if (typeof manager?.createTab !== 'function') throw new Error('Could not create a Claudian chat. Check that your version is supported.');
    // Omitting draftModel preserves Claudian's selected model and provider.
    const tab = await manager.createTab(null, undefined, { activate: true });
    assertActive(signal);
    const controller = tab?.controllers?.inputController;
    if (!tab || !Array.isArray(tab.state?.messages) || typeof controller?.sendMessage !== 'function' || typeof controller.cancelStreaming !== 'function') {
      throw new Error('Could not prepare a new chat. Open Claudian to check its status.');
    }
    if (tab.state.isStreaming) throw new Error('The generation chat is busy. Wait for it to finish and try again.');
    const previousIds = new Set(tab.state.messages.map((message) => message.id));
    let rejectCancellation!: (reason: Error) => void;
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const abort = () => {
      try { controller.cancelStreaming(); } catch { /* Cancellation still prevents saving. */ }
      rejectCancellation(cancelled());
    };
    signal.addEventListener('abort', abort, { once: true });
    const report = () => onStatus(tab.state.requiresAction
      ? 'Claudian needs your attention. Check the chat to continue.'
      : 'Generating your quiz in Claudian…');
    const timer = setInterval(report, 1000);
    try {
      report();
      await Promise.race([
        controller.sendMessage({ content: prompt, images: [], editorContextOverride: null, browserContextOverride: null, canvasContextOverride: null }),
        cancellation,
      ]);
      assertActive(signal);
      const assistant = tab.state.messages.filter((message) => message.role === 'assistant' && !previousIds.has(message.id)).pop();
      // sendMessage catches provider failures internally: resolve is not success.
      if (!assistant || !Number.isFinite(assistant.completedAt) || assistant.isInterrupt || tab.state.isStreaming) {
        throw new Error('Claudian did not finish generating the quiz. Check the chat for errors or usage limits. No partial quiz was saved.');
      }
      const response = assistant.content?.trim() || assistant.contentBlocks?.filter((block) => block.type === 'text').map((block) => block.content ?? '').join('\n\n').trim();
      if (!response) throw new Error('Claudian returned an empty answer. Please try again.');
      return response;
    } finally {
      clearInterval(timer);
      signal.removeEventListener('abort', abort);
    }
  }
}

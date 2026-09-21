import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { ClaudianGenerator } from '../src/integration/claudian';

interface FakeMessage {
  id: string; role: string; content?: string; completedAt?: number; isInterrupt?: boolean;
  contentBlocks?: { type: string; content: string }[];
}

function fixture(messages: FakeMessage[] = []) {
  const state = { messages, isStreaming: false, requiresAction: false };
  const sendMessage = vi.fn().mockImplementation(async () => { state.messages.push({ id: 'new-assistant', role: 'assistant', content: 'generated response', completedAt: Date.now() }); });
  const cancelStreaming = vi.fn();
  const createTab = vi.fn().mockResolvedValue({ state, controllers: { inputController: { sendMessage, cancelStreaming } } });
  const plugin = { activateView: vi.fn().mockResolvedValue(undefined), getView: () => ({ getTabManager: () => ({ createTab }) }) };
  const getPlugin = vi.fn(() => plugin);
  const app = { plugins: { getPlugin } } as unknown as App;
  const signal = new AbortController();
  const onStatus = vi.fn();
  return { bridge: new ClaudianGenerator(app), state, sendMessage, cancelStreaming, createTab, signal, onStatus };
}

afterEach(() => vi.useRealTimers());

describe('Claudian 2.3.0 compatibility adapter', () => {
  it('creates a dedicated tab, uses configured provider, waits and returns only new assistant output', async () => {
    const context = fixture([{ id: 'old', role: 'assistant', content: 'old quiz', completedAt: 1 }]);
    expect(await context.bridge.generate('note snapshot', { signal: context.signal.signal, onStatus: context.onStatus })).toBe('generated response');
    expect(context.createTab).toHaveBeenCalledWith(null, undefined, { activate: true });
    expect(context.sendMessage).toHaveBeenCalledWith({ content: 'note snapshot', images: [], editorContextOverride: null, browserContextOverride: null, canvasContextOverride: null });
  });

  it('reports missing or incompatible plugins before sending a prompt', async () => {
    for (const plugin of [undefined, {}]) {
      const bridge = new ClaudianGenerator({ plugins: { getPlugin: () => plugin } } as unknown as App);
      await expect(bridge.generate('note', { signal: new AbortController().signal, onStatus: vi.fn() })).rejects.toThrow('Claudian');
    }
  });

  it.each([
    { content: 'partial quiz', isInterrupt: true, completedAt: 3 },
    { content: '**Error:** usage limit' },
    { content: 'partial quiz', completedAt: NaN },
  ])('refuses interrupted or failed assistant results even when sendMessage resolves', async (result) => {
    const context = fixture();
    context.sendMessage.mockImplementation(async () => { context.state.messages.push({ id: 'a', role: 'assistant', ...result }); });
    await expect(context.bridge.generate('note', { signal: context.signal.signal, onStatus: context.onStatus })).rejects.toThrow('did not finish');
  });

  it('never accepts the sent user prompt or stale assistant response', async () => {
    const context = fixture([{ id: 'old', role: 'assistant', content: 'example', completedAt: 1 }]);
    context.sendMessage.mockImplementation(async () => { context.state.messages.push({ id: 'u', role: 'user', content: 'prompt examples' }); });
    await expect(context.bridge.generate('note', { signal: context.signal.signal, onStatus: context.onStatus })).rejects.toThrow('did not finish');
  });

  it('selects only text blocks and excludes reasoning/tools', async () => {
    const context = fixture();
    context.sendMessage.mockImplementation(async () => { context.state.messages.push({ id: 'a', role: 'assistant', completedAt: 3, contentBlocks: [{ type: 'thinking', content: 'hidden' }, { type: 'text', content: 'question' }, { type: 'tool_use', content: 'command' }] }); });
    expect(await context.bridge.generate('note', { signal: context.signal.signal, onStatus: context.onStatus })).toBe('question');
  });

  it('cancels only the dedicated tab and rejects promptly; later output is ignored', async () => {
    const context = fixture();
    let finish!: () => void;
    context.sendMessage.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const running = context.bridge.generate('note', { signal: context.signal.signal, onStatus: context.onStatus });
    const rejection = expect(running).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(context.sendMessage).toHaveBeenCalled());
    context.signal.abort();
    await rejection;
    expect(context.cancelStreaming).toHaveBeenCalledOnce();
    finish();
  });

  it('does not create a tab when already cancelled', async () => {
    const context = fixture();
    context.signal.abort();
    await expect(context.bridge.generate('note', { signal: context.signal.signal, onStatus: context.onStatus })).rejects.toThrow('cancelled');
    expect(context.createTab).not.toHaveBeenCalled();
  });

  it('reports approval waits and cleans polling up after completion', async () => {
    vi.useFakeTimers();
    const context = fixture();
    context.state.requiresAction = true;
    const running = context.bridge.generate('note', { signal: context.signal.signal, onStatus: context.onStatus });
    await running;
    expect(context.onStatus).toHaveBeenCalledWith(expect.stringContaining('needs your attention'));
    expect(vi.getTimerCount()).toBe(0);
  });
});

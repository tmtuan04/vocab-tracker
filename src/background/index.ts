import * as storage from '@/services/storage';
import type { MessageType, ToastPayload } from '@/services/messages';
import type { SelectionPayload } from '@/types/vocabulary';

const MENU_ID = 'save-to-vocabulary';

function ensureContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Save to My Vocabulary',
      contexts: ['selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

// Re-register listeners every SW wake; recreate menu if missing after update
ensureContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;
  void handleSaveFromTab(tab.id, tab.windowId, info.selectionText);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-selection') return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await handleSaveFromTab(tab.id, tab.windowId);
  })();
});

chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  if (message.type === 'SAVE_SELECTION') {
    // Open side panel ASAP to preserve user-gesture when possible
    const earlyWindowId = sender.tab?.windowId;
    if (earlyWindowId != null) {
      void chrome.sidePanel.open({ windowId: earlyWindowId }).catch(() => undefined);
    }

    void (async () => {
      try {
        const result = await storage.saveSelection(message.payload);
        await broadcastUpdated();
        await chrome.storage.session.set({
          selectedVocabularyId: result.vocabulary.id,
        });

        const tabId = sender.tab?.id;
        if (tabId != null) {
          if (result.wasDebounced) {
            await notify(tabId, {
              kind: 'debounced',
              title: '✓ Đã lưu',
              message: `Bạn vừa lưu “${result.vocabulary.word}” gần đây.`,
            });
          } else if (result.isNew) {
            await notify(tabId, {
              kind: 'saved',
              title: '✓ Đã lưu',
              message: `“${result.vocabulary.word}” — lần đầu gặp.`,
            });
          } else {
            await notify(tabId, {
              kind: 'updated',
              title: 'Bạn đã gặp từ này',
              message: `${result.vocabulary.encounterCount} lần · Lần đầu: ${formatShort(
                result.vocabulary.firstSeenAt,
              )} · Gần nhất: ${formatShort(result.vocabulary.lastSeenAt)}`,
            });
          }
        }

        sendResponse({ type: 'SAVE_RESULT', payload: result } satisfies MessageType);
      } catch (err) {
        const tabId = sender.tab?.id;
        const payload: ToastPayload = {
          kind: 'error',
          title: 'Lỗi',
          message: err instanceof Error ? err.message : 'Không thể lưu từ',
        };
        if (tabId != null) await notify(tabId, payload);
        sendResponse({ type: 'SHOW_TOAST', payload } satisfies MessageType);
      }
    })();
    return true;
  }

  if (message.type === 'CHECK_WORD') {
    void (async () => {
      const vocab = await storage.findByWord(message.payload.word);
      sendResponse({ type: 'CHECK_WORD_RESULT', payload: vocab } satisfies MessageType);
    })();
    return true;
  }

  if (message.type === 'OPEN_SIDEPANEL') {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.windowId != null) {
        await openSidePanel(tab.windowId, message.payload?.vocabularyId);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

async function handleSaveFromTab(
  tabId: number,
  windowId?: number,
  selectionText?: string,
): Promise<void> {
  try {
    const selection = await requestSelection(tabId, selectionText);
    if (!selection) {
      await notify(tabId, {
        kind: 'error',
        title: 'Không có từ',
        message: 'Hãy bôi đen một từ rồi thử lại. (F5 trang nếu vừa mới cài extension)',
      });
      return;
    }

    const result = await storage.saveSelection(selection);
    await broadcastUpdated();

    if (result.wasDebounced) {
      await notify(tabId, {
        kind: 'debounced',
        title: '✓ Đã lưu',
        message: `Bạn vừa lưu “${result.vocabulary.word}” gần đây.`,
      });
    } else if (result.isNew) {
      await notify(tabId, {
        kind: 'saved',
        title: '✓ Đã lưu',
        message: `“${result.vocabulary.word}” — lần đầu gặp.`,
      });
    } else {
      await notify(tabId, {
        kind: 'updated',
        title: 'Bạn đã gặp từ này',
        message: `${result.vocabulary.encounterCount} lần · Lần đầu: ${formatShort(
          result.vocabulary.firstSeenAt,
        )} · Gần nhất: ${formatShort(result.vocabulary.lastSeenAt)}`,
      });
    }

    if (windowId != null) {
      await openSidePanel(windowId, result.vocabulary.id);
    }
  } catch (err) {
    await notify(tabId, {
      kind: 'error',
      title: 'Lỗi',
      message: err instanceof Error ? err.message : 'Không thể lưu từ',
    });
  }
}

async function requestSelection(
  tabId: number,
  selectionText?: string,
): Promise<SelectionPayload | null> {
  // Prefer content script (gets full sentence context)
  try {
    const response = (await chrome.tabs.sendMessage(tabId, {
      type: 'GET_SELECTION',
    } satisfies MessageType)) as MessageType | undefined;

    if (response?.type === 'SELECTION_RESULT' && response.payload) {
      return response.payload;
    }
  } catch {
    // Content script may not be injected yet
  }

  // Fallback: script injection
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return null;
        const word = selection.toString().trim();
        if (!word || word.length > 80) return null;
        let domain = '';
        try {
          domain = new URL(location.href).hostname;
        } catch {
          domain = location.hostname;
        }
        return {
          word,
          sentence: word,
          sourceUrl: location.href,
          sourceTitle: document.title,
          domain,
        };
      },
    });
    if (result) return result as SelectionPayload;
  } catch {
    // continue to selectionText fallback
  }

  // Last resort: text from context menu (always available on selection menus)
  const word = selectionText?.trim();
  if (!word || word.length > 80) return null;

  try {
    const tab = await chrome.tabs.get(tabId);
    let domain = '';
    try {
      domain = tab.url ? new URL(tab.url).hostname : '';
    } catch {
      domain = '';
    }
    return {
      word,
      sentence: word,
      sourceUrl: tab.url ?? '',
      sourceTitle: tab.title ?? '',
      domain,
    };
  } catch {
    return {
      word,
      sentence: word,
      sourceUrl: '',
      sourceTitle: '',
      domain: '',
    };
  }
}

async function notify(tabId: number, payload: ToastPayload): Promise<void> {
  await Promise.all([showBadge(payload), showToast(tabId, payload)]);
}

async function showBadge(payload: ToastPayload): Promise<void> {
  try {
    const isError = payload.kind === 'error';
    await chrome.action.setBadgeBackgroundColor({
      color: isError ? '#7f1d1d' : '#2f6f4e',
    });
    await chrome.action.setBadgeText({ text: isError ? '!' : '✓' });
    await chrome.action.setTitle({
      title: `${payload.title}: ${payload.message}`,
    });
    setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' });
      void chrome.action.setTitle({ title: 'Vocabulary Tracker' });
    }, 4000);
  } catch {
    // ignore
  }
}

async function showToast(tabId: number, payload: ToastPayload): Promise<void> {
  // Prefer content-script toast, but always also inject via scripting
  // so feedback still appears when the content script is missing.
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'SHOW_TOAST',
      payload,
    } satisfies MessageType);
  } catch {
    // ignore
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: injectToast,
      args: [payload],
    });
  } catch {
    // Restricted pages (chrome://, Web Store, etc.)
  }
}

function injectToast(payload: {
  kind: string;
  title: string;
  message: string;
}): void {
  const TOAST_ID = 'vocab-tracker-toast';
  document.getElementById(TOAST_ID)?.remove();

  const el = document.createElement('div');
  el.id = TOAST_ID;
  el.setAttribute('role', 'status');
  el.style.cssText = [
    'position:fixed',
    'top:16px',
    'right:16px',
    'z-index:2147483647',
    'max-width:340px',
    'padding:14px 16px',
    'border-radius:12px',
    `background:${payload.kind === 'error' ? '#7f1d1d' : '#1a1f16'}`,
    'color:#f6f7f4',
    'font-family:Segoe UI,system-ui,sans-serif',
    'font-size:13px',
    'line-height:1.45',
    'box-shadow:0 10px 30px rgba(0,0,0,0.35)',
    'border:1px solid rgba(255,255,255,0.12)',
    'pointer-events:none',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = payload.title;
  title.style.fontWeight = '700';
  title.style.marginBottom = '4px';
  title.style.fontSize = '14px';

  const msg = document.createElement('div');
  msg.textContent = payload.message;
  msg.style.opacity = '0.92';
  msg.style.fontSize = '12px';

  el.append(title, msg);
  (document.body ?? document.documentElement).appendChild(el);

  window.setTimeout(() => el.remove(), 4000);
}

async function openSidePanel(windowId: number, vocabularyId?: string): Promise<void> {
  if (vocabularyId) {
    await chrome.storage.session.set({ selectedVocabularyId: vocabularyId });
  }
  try {
    await chrome.sidePanel.open({ windowId });
  } catch {
    // Side panel API may fail on some builds; ignore
  }
}

async function broadcastUpdated(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' } satisfies MessageType);
  } catch {
    // No listeners
  }
}

function formatShort(iso: string): string {
  try {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

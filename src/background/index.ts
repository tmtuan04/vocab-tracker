import * as storage from '@/services/storage';
import type { MessageType, ToastPayload } from '@/services/messages';
import type { SelectionPayload } from '@/types/vocabulary';

const MENU_ID = 'save-to-vocabulary';

function ensureContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Thêm vào từ vựng',
      contexts: ['selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
  if (chrome.sidePanel?.setPanelBehavior) {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

ensureContextMenu();

// Context menu: bôi đen → chuột phải → mở side panel với form nhập nghĩa
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return;

  // ⚡ MỞ SIDE PANEL NGAY LẬP TỨC trong handler đồng bộ (giữ user gesture)
  if (tab.windowId != null) {
    void chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }

  // Sau đó async lấy selection context và lưu vào session
  void (async () => {
    const selection = await requestSelection(tab.id!, info.selectionText);
    if (selection) {
      await chrome.storage.session.set({ pendingNewWord: selection });
    } else {
      await notify(tab.id!, {
        kind: 'error',
        title: 'Không có từ',
        message: 'Hãy bôi đen một từ rồi thử lại. (F5 trang nếu vừa mới cài extension)',
      });
    }
  })();
});

// Phím tắt Alt+S: mở side panel với từ đang chọn
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'save-selection') return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || tab.windowId == null) return;

    // ⚡ Mở side panel ngay
    await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);

    const selection = await requestSelection(tab.id, undefined);
    if (selection) {
      await chrome.storage.session.set({ pendingNewWord: selection });
    }
  })();
});

chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  // Bubble click từ content script
  if (message.type === 'OPEN_SIDEPANEL_FOR_NEW') {
    const windowId = sender.tab?.windowId;

    // ⚡ MỞ SIDE PANEL NGAY LẬP TỨC — TRƯỚC mọi await
    // chrome.sidePanel.open() phải được gọi đồng bộ trong onMessage handler
    // để Chrome còn giữ user gesture context từ content script click.
    if (windowId != null) {
      void chrome.sidePanel.open({ windowId }).catch(() => undefined);
    }

    // Sau đó mới async lưu data vào session
    void (async () => {
      await chrome.storage.session.set({ pendingNewWord: message.payload });
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'SAVE_SELECTION') {
    const windowId = sender.tab?.windowId;
    // ⚡ Mở side panel ngay
    if (windowId != null) {
      void chrome.sidePanel.open({ windowId }).catch(() => undefined);
    }

    void (async () => {
      try {
        const result = await storage.saveSelection(message.payload);
        await broadcastUpdated();
        await chrome.storage.session.set({
          selectedVocabularyId: result.vocabulary.id,
          pendingNewWord: null,
        });
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
        if (message.payload?.vocabularyId) {
          await chrome.storage.session.set({ selectedVocabularyId: message.payload.vocabularyId });
        }
        await chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  return false;
});

async function requestSelection(
  tabId: number,
  selectionText?: string,
): Promise<SelectionPayload | null> {
  // 1. Hỏi content script
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

  // 2. Fallback: executeScript để lấy selection trực tiếp
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

  // 3. Fallback: dùng selectionText từ context menu
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
    return { word, sentence: word, sourceUrl: '', sourceTitle: '', domain: '' };
  }
}

async function notify(tabId: number, payload: ToastPayload): Promise<void> {
  await Promise.all([showBadge(payload), showToast(tabId, payload)]);
}

async function showBadge(payload: ToastPayload): Promise<void> {
  try {
    const isError = payload.kind === 'error';
    await chrome.action.setBadgeBackgroundColor({ color: isError ? '#7f1d1d' : '#2f6f4e' });
    await chrome.action.setBadgeText({ text: isError ? '!' : '✓' });
    await chrome.action.setTitle({ title: `${payload.title}: ${payload.message}` });
    setTimeout(() => {
      void chrome.action.setBadgeText({ text: '' });
      void chrome.action.setTitle({ title: 'Vocabulary Tracker' });
    }, 4000);
  } catch {
    // ignore
  }
}

async function showToast(tabId: number, payload: ToastPayload): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'SHOW_TOAST', payload } satisfies MessageType);
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
    // Restricted pages
  }
}

function injectToast(payload: { kind: string; title: string; message: string }): void {
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

async function broadcastUpdated(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: 'VOCAB_UPDATED' } satisfies MessageType);
  } catch {
    // No listeners
  }
}

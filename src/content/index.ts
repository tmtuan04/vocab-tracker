import { getSelectionContext } from '@/services/sentence';
import type { MessageType, ToastPayload } from '@/services/messages';
import type { SelectionPayload } from '@/types/vocabulary';

const BUBBLE_ID = 'vocab-tracker-bubble';
const TOAST_ID = 'vocab-tracker-toast';
const BUBBLE_SIZE = 36;
const BUBBLE_GAP = 8;

let busy = false;
/** Snapshot taken when bubble is shown — selection is often cleared on click. */
let pendingSelection: SelectionPayload | null = null;

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    const payload = getSelectionContext() ?? pendingSelection;
    sendResponse({ type: 'SELECTION_RESULT', payload } satisfies MessageType);
    return false;
  }

  if (message.type === 'SHOW_TOAST') {
    showToast(message.payload);
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

document.addEventListener('mouseup', (e) => {
  if (isEventOnBubble(e.target)) return;
  window.setTimeout(() => syncBubbleFromSelection(), 10);
});

document.addEventListener(
  'keyup',
  (e) => {
    if (e.key === 'Escape') {
      hideBubble();
      return;
    }
    if (e.shiftKey || e.key?.startsWith('Arrow')) {
      window.setTimeout(() => syncBubbleFromSelection(), 10);
    }
  },
  true,
);

document.addEventListener(
  'mousedown',
  (e) => {
    if (isEventOnBubble(e.target)) {
      e.preventDefault();
      return;
    }
    hideBubble();
  },
  true,
);

document.addEventListener('scroll', () => hideBubble(), true);

function isEventOnBubble(target: EventTarget | null): boolean {
  const bubble = document.getElementById(BUBBLE_ID);
  return Boolean(bubble && target instanceof Node && bubble.contains(target));
}

function syncBubbleFromSelection(): void {
  if (busy) return;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    hideBubble();
    return;
  }

  const context = getSelectionContext();
  if (!context) {
    hideBubble();
    return;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    hideBubble();
    return;
  }

  pendingSelection = context;
  showBubble(rect);
}

function showBubble(rect: DOMRect): void {
  let bubble = document.getElementById(BUBBLE_ID) as HTMLButtonElement | null;
  if (!bubble) {
    bubble = document.createElement('button');
    bubble.id = BUBBLE_ID;
    bubble.type = 'button';
    bubble.title = 'Thêm vào từ vựng';
    bubble.setAttribute('aria-label', 'Thêm vào từ vựng');
    bubble.style.cssText = [
      'position:fixed',
      'z-index:2147483646',
      `width:${BUBBLE_SIZE}px`,
      `height:${BUBBLE_SIZE}px`,
      'padding:0',
      'margin:0',
      'border:1px solid rgba(47,111,78,0.35)',
      'border-radius:10px',
      'background:#ffffff',
      'box-shadow:0 6px 18px rgba(0,0,0,0.18)',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'line-height:0',
      'transition:transform 120ms ease, box-shadow 120ms ease',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';');

    bubble.addEventListener('mouseenter', () => {
      bubble!.style.transform = 'scale(1.06)';
      bubble!.style.boxShadow = '0 8px 22px rgba(0,0,0,0.22)';
    });
    bubble.addEventListener('mouseleave', () => {
      bubble!.style.transform = 'scale(1)';
      bubble!.style.boxShadow = '0 6px 18px rgba(0,0,0,0.18)';
    });

    const img = document.createElement('img');
    img.src = chrome.runtime.getURL('public/icons/icon48.png');
    img.alt = '';
    img.width = 22;
    img.height = 22;
    img.style.cssText = 'display:block;pointer-events:none;border-radius:4px;';
    img.draggable = false;
    bubble.appendChild(img);

    // Click bubble → mở side panel để nhập nghĩa
    bubble.addEventListener('pointerup', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void openSidePanelForNew();
    });
    bubble.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    (document.body ?? document.documentElement).appendChild(bubble);
  }

  const left = Math.min(
    Math.max(8, rect.left + rect.width / 2 - BUBBLE_SIZE / 2),
    window.innerWidth - BUBBLE_SIZE - 8,
  );
  let top = rect.top - BUBBLE_SIZE - BUBBLE_GAP;
  if (top < 8) top = rect.bottom + BUBBLE_GAP;
  top = Math.min(top, window.innerHeight - BUBBLE_SIZE - 8);

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
  bubble.style.display = 'flex';
}

function hideBubble(): void {
  if (!busy) pendingSelection = null;
  const bubble = document.getElementById(BUBBLE_ID);
  if (bubble) bubble.style.display = 'none';
}

/**
 * Kiểm tra extension context còn hợp lệ không.
 * Trả về false khi extension vừa được reload/update.
 */
function isContextValid(): boolean {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Gửi context của từ đang chọn lên background để mở Side Panel với form nhập nghĩa.
 */
async function openSidePanelForNew(): Promise<void> {
  if (busy) return;

  // Kiểm tra extension context trước khi gọi chrome API
  if (!isContextValid()) {
    showToast({
      kind: 'error',
      title: 'Extension đã được cập nhật',
      message: 'Vui lòng tải lại trang (F5) để tiếp tục.',
    });
    hideBubble();
    return;
  }

  const context = getSelectionContext() ?? pendingSelection;
  if (!context) {
    showToast({
      kind: 'error',
      title: 'Không có từ',
      message: 'Hãy bôi đen một từ rồi thử lại.',
    });
    pendingSelection = null;
    hideBubble();
    return;
  }

  busy = true;
  const bubble = document.getElementById(BUBBLE_ID) as HTMLButtonElement | null;
  if (bubble) {
    bubble.disabled = true;
    bubble.style.opacity = '0.6';
  }

  try {
    await chrome.runtime.sendMessage({
      type: 'OPEN_SIDEPANEL_FOR_NEW',
      payload: context,
    } satisfies MessageType);
  } catch (err) {
    // err có thể là Error, DOMException, string, hoặc object tùy trình duyệt
    const msg = String(
      (err as { message?: string })?.message ?? err ?? '',
    );
    const isInvalidated =
      msg.includes('invalidated') ||
      msg.includes('Extension context') ||
      !isContextValid();

    showToast({
      kind: 'error',
      title: isInvalidated ? 'Extension đã được cập nhật' : 'Lỗi',
      message: isInvalidated
        ? 'Vui lòng tải lại trang (F5) để tiếp tục sử dụng.'
        : msg || 'Không thể mở side panel',
    });
  } finally {
    busy = false;
    pendingSelection = null;
    if (bubble) {
      bubble.disabled = false;
      bubble.style.opacity = '1';
      bubble.style.display = 'none';
    }
  }
}


function showToast(payload: ToastPayload): void {
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

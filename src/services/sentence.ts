const SENTENCE_MAX = 300;

export function normalizeWord(raw: string): string {
  return raw
    .trim()
    .replace(/^[\s"'“”‘’([{«]+|[\]\)\}»"'“”‘’.,;:!?…]+$/g, '')
    .toLowerCase();
}

export function displayWord(raw: string): string {
  return raw
    .trim()
    .replace(/^[\s"'“”‘’([{«]+|[\]\)\}»"'“”‘’.,;:!?…]+$/g, '');
}

/**
 * Expand selection to the nearest sentence within its container text.
 */
export function extractSentence(fullText: string, selected: string): string {
  const text = fullText.replace(/\s+/g, ' ').trim();
  const needle = selected.trim();
  if (!text || !needle) return needle.slice(0, SENTENCE_MAX);

  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  let index = lowerText.indexOf(lowerNeedle);
  if (index < 0) {
    return needle.slice(0, SENTENCE_MAX);
  }

  const boundary = /[.!?…\n]/;
  let start = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (boundary.test(text[i]!)) {
      start = i + 1;
      break;
    }
  }

  let end = text.length;
  for (let i = index + needle.length; i < text.length; i += 1) {
    if (boundary.test(text[i]!)) {
      end = i + 1;
      break;
    }
  }

  let sentence = text.slice(start, end).trim();
  if (sentence.length > SENTENCE_MAX) {
    const rel = index - start;
    const half = Math.floor(SENTENCE_MAX / 2);
    const from = Math.max(0, rel - half);
    sentence = (from > 0 ? '…' : '') + sentence.slice(from, from + SENTENCE_MAX).trim() + '…';
  }
  return sentence || needle.slice(0, SENTENCE_MAX);
}

export function getSelectionContext(): {
  word: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
} | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) {
    return null;
  }

  const word = displayWord(selection.toString());
  if (!word || word.length > 80 || word.split(/\s+/).length > 5) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const container =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : (range.commonAncestorContainer as Element);

  const block =
    container?.closest('p, li, td, th, blockquote, h1, h2, h3, h4, h5, h6, article, section, div') ??
    container;
  const fullText = block?.textContent ?? selection.toString();
  const sentence = extractSentence(fullText, word);

  let domain = '';
  try {
    domain = new URL(window.location.href).hostname;
  } catch {
    domain = window.location.hostname;
  }

  return {
    word,
    sentence,
    sourceUrl: window.location.href,
    sourceTitle: document.title,
    domain,
  };
}

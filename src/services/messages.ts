import type { SaveResult, SelectionPayload, Vocabulary } from '@/types/vocabulary';

export type MessageType =
  | { type: 'GET_SELECTION' }
  | { type: 'SELECTION_RESULT'; payload: SelectionPayload | null }
  | { type: 'SAVE_SELECTION'; payload: SelectionPayload }
  | { type: 'SAVE_RESULT'; payload: SaveResult }
  | { type: 'SHOW_TOAST'; payload: ToastPayload }
  | { type: 'CHECK_WORD'; payload: { word: string } }
  | { type: 'CHECK_WORD_RESULT'; payload: Vocabulary | null }
  | { type: 'OPEN_SIDEPANEL'; payload?: { vocabularyId?: string } }
  | { type: 'OPEN_SIDEPANEL_FOR_NEW'; payload: SelectionPayload }
  | { type: 'VOCAB_UPDATED' };

export type ToastPayload = {
  kind: 'saved' | 'updated' | 'debounced' | 'error' | 'info';
  title: string;
  message: string;
};

export function isMessage(value: unknown): value is MessageType {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string'
  );
}

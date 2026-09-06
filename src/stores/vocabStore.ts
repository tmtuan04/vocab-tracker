import { useCallback, useEffect, useState } from 'react';
import * as storage from '@/services/storage';
import type { Vocabulary, VocabularyStats } from '@/types/vocabulary';

export function useVocabularies(query = '') {
  const [items, setItems] = useState<Vocabulary[]>([]);
  const [stats, setStats] = useState<VocabularyStats>({
    total: 0,
    newThisWeek: 0,
    dueForReview: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [list, nextStats] = await Promise.all([
        storage.searchVocabularies(query),
        storage.getStats(),
      ]);
      setItems(list);
      setStats(nextStats);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === 'local' && (changes.vocabularies || changes.encounters)) {
        void refresh();
      }
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [refresh]);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        (message as { type: string }).type === 'VOCAB_UPDATED'
      ) {
        void refresh();
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [refresh]);

  return { items, stats, loading, refresh };
}

export type Vocabulary = {
  id: string;
  word: string;
  normalizedWord: string;
  phonetic?: string;
  partOfSpeech?: string;
  meaning?: string;
  encounterCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  note?: string;
};

export type Encounter = {
  id: string;
  vocabularyId: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
  encounteredAt: string;
};

export type VocabularyStats = {
  total: number;
  newThisWeek: number;
  needsReview: number;
};

export type SelectionPayload = {
  word: string;
  sentence: string;
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
};

export type SaveResult = {
  vocabulary: Vocabulary;
  encounter: Encounter;
  isNew: boolean;
  wasDebounced: boolean;
};

export type ExportData = {
  version: 1;
  exportedAt: string;
  vocabularies: Vocabulary[];
  encounters: Encounter[];
};

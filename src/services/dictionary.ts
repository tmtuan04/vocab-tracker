// ─── Rich dictionary types ────────────────────────────────────────────────────

export type DictionaryDefinition = {
  definition: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
};

export type DictionaryMeaning = {
  partOfSpeech: string;
  definitions: DictionaryDefinition[];
  synonyms?: string[];
  antonyms?: string[];
};

export type DictionaryEntry = {
  phonetic?: string;
  audioUrl?: string;
  meanings: DictionaryMeaning[];
};

/** Marker lưu khi đã gọi API nhưng không có kết quả — tránh tra lại mỗi lần mở. */
export const EMPTY_DICTIONARY: DictionaryEntry = { meanings: [] };

export function hasDictionaryContent(entry: DictionaryEntry | null | undefined): boolean {
  return !!entry && entry.meanings.length > 0;
}

/** true nếu đã từng tra (có data hoặc miss đã cache). */
export function isDictionaryResolved(entry: DictionaryEntry | undefined): boolean {
  return entry !== undefined;
}

// ─── Raw API types ────────────────────────────────────────────────────────────

type FreeDictDefinition = {
  definition?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
};

type FreeDictMeaning = {
  partOfSpeech?: string;
  definitions?: FreeDictDefinition[];
  synonyms?: string[];
  antonyms?: string[];
};

type FreeDictPhonetic = {
  text?: string;
  audio?: string;
};

type FreeDictEntry = {
  word?: string;
  phonetic?: string;
  phonetics?: FreeDictPhonetic[];
  meanings?: FreeDictMeaning[];
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchDictionary(word: string): Promise<DictionaryEntry | null> {
  const cleaned = word.trim().toLowerCase();
  // API chỉ hỗ trợ tiếng Anh một từ
  if (!cleaned || cleaned.split(/\s+/).length > 2) return null;

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`,
    );
    if (!res.ok) return null;

    const data = (await res.json()) as FreeDictEntry[];
    const entry = data[0];
    if (!entry) return null;

    // Phonetic: ưu tiên entry.phonetic, rồi phonetics[].text
    const phonetic =
      entry.phonetic ||
      entry.phonetics?.find((p) => p.text)?.text ||
      undefined;

    // Audio: lấy URL đầu tiên có audio
    const audioUrl =
      entry.phonetics?.find((p) => p.audio && p.audio.length > 5)?.audio || undefined;

    // Meanings: giữ tối đa 4 definitions mỗi part of speech
    const meanings: DictionaryMeaning[] = (entry.meanings ?? []).map((m) => ({
      partOfSpeech: m.partOfSpeech ?? '',
      definitions: (m.definitions ?? []).slice(0, 4).map((d) => ({
        definition: d.definition ?? '',
        example: d.example || undefined,
        synonyms: d.synonyms?.length ? d.synonyms.slice(0, 6) : undefined,
        antonyms: d.antonyms?.length ? d.antonyms.slice(0, 6) : undefined,
      })),
      synonyms: m.synonyms?.length ? m.synonyms.slice(0, 8) : undefined,
      antonyms: m.antonyms?.length ? m.antonyms.slice(0, 8) : undefined,
    }));

    return { phonetic, audioUrl, meanings };
  } catch {
    return null;
  }
}

/** Lấy definition đầu tiên làm default meaning cho user. */
export function getFirstDefinition(entry: DictionaryEntry): string {
  return entry.meanings[0]?.definitions[0]?.definition ?? '';
}

export type DictionaryInfo = {
  phonetic?: string;
  partOfSpeech?: string;
  meaning?: string;
};

type FreeDictEntry = {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: {
    partOfSpeech?: string;
    definitions?: { definition?: string }[];
  }[];
};

export async function fetchDictionaryInfo(word: string): Promise<DictionaryInfo> {
  const cleaned = word.trim().toLowerCase();
  if (!cleaned || cleaned.includes(' ')) {
    return {};
  }

  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`,
    );
    if (!res.ok) return {};

    const data = (await res.json()) as FreeDictEntry[];
    const entry = data[0];
    if (!entry) return {};

    const phonetic =
      entry.phonetic ||
      entry.phonetics?.find((p) => p.text)?.text ||
      undefined;
    const meaningEntry = entry.meanings?.[0];
    const partOfSpeech = meaningEntry?.partOfSpeech;
    const meaning = meaningEntry?.definitions?.[0]?.definition;

    return { phonetic, partOfSpeech, meaning };
  } catch {
    return {};
  }
}

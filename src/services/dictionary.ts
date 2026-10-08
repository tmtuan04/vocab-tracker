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
  source?: 'wiktapi' | 'dictionaryapi' | 'cache';
  raw?: unknown;
};

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_KEY = 'dictCache';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CACHE_ENTRIES = 5000;

type CacheEntry = {
  data: DictionaryEntry;
  ts: number;
};

async function getCache(): Promise<Record<string, CacheEntry>> {
  const result = await chrome.storage.local.get(CACHE_KEY);
  return (result[CACHE_KEY] as Record<string, CacheEntry>) ?? {};
}

async function setCache(cache: Record<string, CacheEntry>): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function getCachedEntry(word: string): Promise<DictionaryEntry | null> {
  const cache = await getCache();
  const key = word.toLowerCase().trim();
  const entry = cache[key];
  if (entry && Date.now() - entry.ts < CACHE_TTL) {
    return { ...entry.data, source: 'cache' };
  }
  return null;
}

async function setCachedEntry(word: string, data: DictionaryEntry): Promise<void> {
  const cache = await getCache();
  const key = word.toLowerCase().trim();
  
  if (Object.keys(cache).length >= MAX_CACHE_ENTRIES) {
    const oldestKey = Object.entries(cache)
      .sort((a, b) => a[1].ts - b[1].ts)[0]?.[0];
    if (oldestKey) delete cache[oldestKey];
  }
  
  cache[key] = { data, ts: Date.now() };
  await setCache(cache);
}

// ─── Fetch utilities ──────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

// ─── Wiktapi Types (single endpoint response) ────────────────────────────────

interface WiktapiSense {
  glosses: string[];
  examples?: { text: string; type: string; bold_text_offsets?: number[][] }[];
  tags?: string[];
  synonyms?: { word: string }[];
  antonyms?: { word: string }[];
  coordinate_terms?: { word: string; source: string; tags?: string[] }[];
}

interface WiktapiSound {
  enpr?: string;
  ipa?: string;
  audio?: string;
  ogg_url?: string;
  mp3_url?: string;
  tags?: string[];
  rhymes?: string;
}

interface WiktapiEntry {
  senses: WiktapiSense[];
  sounds: WiktapiSound[];
  translations: unknown[];
  forms: unknown[];
}

interface WiktapiWordResponse {
  word: string;
  edition: string;
  entries: WiktapiEntry[];
}

// ─── Source 1: Wiktapi (Primary) — supports phrases ──────────────────────────

async function fetchWiktapi(word: string): Promise<DictionaryEntry | null> {
  const cleaned = word.trim().toLowerCase();
  if (!cleaned) return null;

  const encoded = encodeURIComponent(cleaned);

  try {
    const res = await fetchWithTimeout(
      `https://api.wiktapi.dev/v1/en/word/${encoded}?lang=en`,
      { headers: { Accept: 'application/json' } },
      3000
    );

    if (!res?.ok) return null;

    const data = (await res.json()) as WiktapiWordResponse;
    if (!data.entries?.length) return null;

    let firstIpa: string | undefined;
    let firstAudioUrl: string | undefined;

    for (const entry of data.entries) {
      // Extract IPA and audio from sounds
      for (const sound of entry.sounds ?? []) {
        if (!firstIpa && sound.ipa) firstIpa = sound.ipa;
        if (!firstAudioUrl && (sound.mp3_url || sound.ogg_url)) {
          firstAudioUrl = sound.mp3_url || sound.ogg_url;
        }
      }

      // Group senses by POS (using first entry's senses structure)
      // The main endpoint doesn't include POS in senses directly,
      // so we need to fetch definitions endpoint for POS info
    }

    // Fetch definitions for POS information
    const defsRes = await fetchWithTimeout(
      `https://api.wiktapi.dev/v1/en/word/${encoded}/definitions?lang=en`,
      { headers: { Accept: 'application/json' } },
      3000
    );

    if (!defsRes?.ok) return null;

    const defsData = (await defsRes.json()) as { definitions: { pos: string; lang_code: string; senses: WiktapiSense[] }[] };
    if (!defsData.definitions?.length) return null;

    // Build pronunciation map by POS from main entry sounds
    const pronByPos = new Map<string, { ipa?: string; audio?: string }>();
    
    for (const entry of data.entries) {
      for (const sound of entry.sounds ?? []) {
        // The main endpoint sounds don't have POS, so we use first available
        // For better POS-specific pronunciation, we'd need more complex logic
        if (sound.ipa || sound.mp3_url || sound.ogg_url) {
          if (!pronByPos.has('default')) {
            pronByPos.set('default', {
              ipa: sound.ipa,
              audio: sound.mp3_url || sound.ogg_url,
            });
          }
        }
      }
    }

    // Meanings from definitions endpoint (has POS)
    const meanings: DictionaryMeaning[] = defsData.definitions.map((d) => {
      pronByPos.get('default');
      
      return {
        partOfSpeech: d.pos,
        definitions: (d.senses ?? []).slice(0, 4).map((s) => ({
          definition: s.glosses?.[0] ?? '',
          example: s.examples?.[0]?.text,
          synonyms: s.synonyms?.length ? s.synonyms.slice(0, 6).map(s => s.word) : undefined,
          antonyms: s.antonyms?.length ? s.antonyms.slice(0, 6).map(a => a.word) : undefined,
        })),
        synonyms: d.senses.flatMap(s => s.synonyms?.map(s => s.word) ?? []).slice(0, 8),
        antonyms: d.senses.flatMap(s => s.antonyms?.map(a => a.word) ?? []).slice(0, 8),
      };
    }).filter(m => m.definitions.some(d => d.definition));

    if (!meanings.length) return null;

    const defaultPron = pronByPos.get('default');
    const phonetic = defaultPron?.ipa || firstIpa;
    const audioUrl = defaultPron?.audio || firstAudioUrl;

    return { phonetic, audioUrl, meanings, source: 'wiktapi', raw: data };
  } catch {
    return null;
  }
}

// ─── Source 2: Free Dictionary API (Fallback) — single words only ─────────────

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

async function fetchDictionaryAPI(word: string): Promise<DictionaryEntry | null> {
  const cleaned = word.trim().toLowerCase();
  if (!cleaned || cleaned.split(/\s+/).length > 2) return null;

  try {
    const res = await fetchWithTimeout(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleaned)}`,
      { headers: { Accept: 'application/json' } },
      3000
    );
    if (!res?.ok) return null;

    const data = (await res.json()) as FreeDictEntry[];
    const entry = data[0];
    if (!entry || !entry.meanings?.length) return null;

    const phonetic =
      entry.phonetic ||
      entry.phonetics?.find((p) => p.text)?.text ||
      undefined;

    const audioUrl =
      entry.phonetics?.find((p) => p.audio && p.audio.length > 5)?.audio || undefined;

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

    return { phonetic, audioUrl, meanings, source: 'dictionaryapi', raw: entry };
  } catch {
    return null;
  }
}

// ─── Main fetch function with pipeline ────────────────────────────────────────

/**
 * Fetch dictionary entry with cache → Wiktapi (primary) → DictionaryAPI (fallback) pipeline.
 * Supports both single words and multi-word phrases.
 */
export async function fetchDictionary(word: string): Promise<DictionaryEntry | null> {
  const cleaned = word.trim().toLowerCase();
  if (!cleaned) return null;

  // 1. Check cache first
  const cached = await getCachedEntry(cleaned);
  if (cached) return cached;

  // 2. Try primary source (Wiktapi) - supports phrases
  const primary = await fetchWiktapi(cleaned);
  if (primary) {
    await setCachedEntry(cleaned, primary);
    return primary;
  }

  // 3. Fallback to DictionaryAPI (single words only)
  const fallback = await fetchDictionaryAPI(cleaned);
  if (fallback) {
    await setCachedEntry(cleaned, fallback);
    return fallback;
  }

  return null;
}

/** Lấy definition đầu tiên làm default meaning cho user. */
export function getFirstDefinition(entry: DictionaryEntry): string {
  return entry.meanings[0]?.definitions[0]?.definition ?? '';
}

// ─── Cache management utilities ──────────────────────────────────────────────

export async function clearDictionaryCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}

export async function getDictionaryCacheStats(): Promise<{ entries: number; oldestEntry: number | null; sizeKB: number }> {
  const cache = await getCache();
  const entries = Object.keys(cache).length;
  const oldestEntry = entries > 0
    ? Math.min(...Object.values(cache).map(e => e.ts))
    : null;
  const sizeKB = Math.round(JSON.stringify(cache).length / 1024);
  return { entries, oldestEntry, sizeKB };
}
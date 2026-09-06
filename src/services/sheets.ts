// Không phải đồng bộ 2 chiều realtime -> backup/mirror local data to sheets
// 3 điều kiện để đồng bộ, nếu không thỏa mãn -> bỏ qua
// 1. Đã đăng nhập
// 2. Có spreadsheetId
// 3. Token hợp lệ

import { GOOGLE_CLIENT_ID } from '@/config/google';
import type { Vocabulary } from '@/types/vocabulary';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SheetsConfig = {
  spreadsheetId: string | null;
  spreadsheetTitle: string;
  sheetTabName: string;
  lastSyncAt: string | null;
  userEmail: string | null;
};

type SheetRow = (string | number | boolean)[];

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_NAME = 'Vocabulary';
const HEADERS: string[] = [
  'Word', 'Meaning', 'Example', 'Note',
  'Encounter Count', 'Next Review', 'First Seen', 'Last Seen',
];

const CONFIG_KEY = 'sheetsConfig';

// ─── Config persistence ───────────────────────────────────────────────────────

const DEFAULT_CONFIG: SheetsConfig = {
  spreadsheetId: null,
  spreadsheetTitle: '',
  sheetTabName: SHEET_NAME,
  lastSyncAt: null,
  userEmail: null,
};

export async function getSheetsConfig(): Promise<SheetsConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return { ...DEFAULT_CONFIG, ...(result[CONFIG_KEY] as Partial<SheetsConfig> | undefined) };
}

export async function setSheetsConfig(patch: Partial<SheetsConfig>): Promise<SheetsConfig> {
  const current = await getSheetsConfig();
  const updated = { ...current, ...patch };
  await chrome.storage.local.set({ [CONFIG_KEY]: updated });
  return updated;
}

export async function clearSheetsConfig(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_KEY);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!GOOGLE_CLIENT_ID;
}

export async function getAuthToken(interactive: boolean): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!token) {
        return reject(new Error('Không lấy được token. Hãy thử đăng nhập lại.'));
      }
      resolve(token);
    });
  });
}

export async function isSignedIn(): Promise<boolean> {
  try {
    await getAuthToken(false);
    return true;
  } catch {
    return false;
  }
}

export async function signIn(): Promise<string> {
  const token = await getAuthToken(true);

  // Lấy email user
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const info = (await res.json()) as { email?: string };
      if (info.email) {
        await setSheetsConfig({ userEmail: info.email });
      }
    }
  } catch {
    // Không critical, bỏ qua
  }

  return token;
}

export async function signOut(): Promise<void> {
  try {
    const token = await getAuthToken(false);
    // Revoke token
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
    // Xóa cache
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
  } catch {
    // Token already invalid
  }
  await clearSheetsConfig();
}

// ─── Authenticated fetch with auto-retry on 401 ──────────────────────────────

async function sheetsFetch(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getAuthToken(false);

  let response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // Token expired → clear cache → retry
  if (response.status === 401) {
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => resolve());
    });
    token = await getAuthToken(false);
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google API lỗi (${response.status}): ${body.slice(0, 200)}`);
  }

  return response;
}

// ─── Spreadsheet operations ───────────────────────────────────────────────────

/** Tạo spreadsheet mới trong Google Drive của user. */
export async function createSpreadsheet(): Promise<{ id: string; title: string; url: string }> {
  const title = `Vocab Tracker – ${new Date().toLocaleDateString('vi-VN')}`;

  const res = await sheetsFetch(SHEETS_API, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: {
          title: SHEET_NAME,
          gridProperties: { frozenRowCount: 1 },
        },
      }],
    }),
  });

  const data = (await res.json()) as { spreadsheetId: string; spreadsheetUrl: string };

  // Ghi header row
  await sheetsFetch(
    `${SHEETS_API}/${data.spreadsheetId}/values/'${SHEET_NAME}'!A1:H1?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: [HEADERS] }),
    },
  );

  await setSheetsConfig({
    spreadsheetId: data.spreadsheetId,
    spreadsheetTitle: title,
    sheetTabName: SHEET_NAME,
    lastSyncAt: null,
  });

  return { id: data.spreadsheetId, title, url: data.spreadsheetUrl };
}

/** Kết nối spreadsheet có sẵn bằng ID. Tự detect tên tab đầu tiên. */
export async function connectSpreadsheet(spreadsheetId: string): Promise<string> {
  const res = await sheetsFetch(`${SHEETS_API}/${spreadsheetId}?fields=properties.title,sheets.properties.title`);
  const data = (await res.json()) as {
    properties: { title: string };
    sheets?: { properties: { title: string } }[];
  };

  // Lấy tên tab đầu tiên của spreadsheet
  const firstTab = data.sheets?.[0]?.properties?.title || SHEET_NAME;

  await setSheetsConfig({
    spreadsheetId,
    spreadsheetTitle: data.properties.title,
    sheetTabName: firstTab,
    lastSyncAt: null,
  });

  return data.properties.title;
}

/** URL để mở sheet trên browser. */
export function getSheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

// ─── Push: Local → Google Sheets ──────────────────────────────────────────────

function vocabToRow(v: Vocabulary): SheetRow {
  return [
    v.word,
    v.meaning ?? '',
    v.example ?? '',
    v.note ?? '',
    v.encounterCount,
    v.review?.nextReviewAt?.slice(0, 10) ?? '',
    v.firstSeenAt.slice(0, 10),
    v.lastSeenAt.slice(0, 10),
  ];
}

/**
 * Push toàn bộ data local lên Sheet (overwrite).
 * Strategy: clear sheet → ghi lại toàn bộ.
 */
export async function pushToSheets(
  spreadsheetId: string,
  vocabularies: Vocabulary[],
): Promise<number> {
  const config = await getSheetsConfig();
  const tabName = config.sheetTabName || SHEET_NAME;
  const rows = vocabularies
    .sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime())
    .map(vocabToRow);

  const allValues = [HEADERS, ...rows];

  // Clear sheet rồi ghi lại
  await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/'${tabName}'!A1:Z?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ values: allValues }),
    },
  );

  await setSheetsConfig({ lastSyncAt: new Date().toISOString() });
  return rows.length;
}

// ─── Pull: Google Sheets → Local ──────────────────────────────────────────────

interface PullRow {
  Word?: string;
  Meaning?: string;
  Example?: string;
  Note?: string;
  'Encounter Count'?: string | number;
  'First Seen'?: string;
  'Last Seen'?: string;
}

/**
 * Pull dữ liệu từ Sheet, trả về parsed rows để merge vào local.
 * Hỗ trợ header tiếng Anh, tiếng Việt, hoặc fallback theo thứ tự cột.
 */
export async function pullFromSheets(spreadsheetId: string): Promise<PullRow[]> {
  const config = await getSheetsConfig();
  const tabName = config.sheetTabName || SHEET_NAME;
  const range = encodeURIComponent(`'${tabName}'!A1:H`);
  const res = await sheetsFetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}?majorDimension=ROWS`,
  );
  const data = (await res.json()) as { values?: SheetRow[] };
  const rows = data.values;
  if (!rows || rows.length < 2) return [];

  const rawHeaders = rows[0]!.map((h) => String(h).trim().toLowerCase());

  // Smart mapping: tìm index của từng field theo nhiều tên khác nhau
  const findCol = (...names: string[]) =>
    rawHeaders.findIndex((h) => names.some((n) => h.includes(n)));

  let wordIdx = findCol('word', 'từ', 'vocabulary', 'english');
  let meaningIdx = findCol('meaning', 'nghĩa', 'definition', 'vietnamese', 'tiếng việt');
  let exampleIdx = findCol('example', 'ví dụ', 'sentence', 'câu');
  let noteIdx = findCol('note', 'ghi chú', 'notes');
  const encounterIdx = findCol('encounter', 'số lần', 'count');
  const firstSeenIdx = findCol('first seen', 'ngày thêm', 'created');
  const lastSeenIdx = findCol('last seen', 'ngày gặp', 'updated');

  // Fallback: nếu không tìm thấy header, dùng thứ tự cột (col 0=word, 1=meaning, 2=example)
  if (wordIdx < 0) wordIdx = 0;
  if (meaningIdx < 0) meaningIdx = wordIdx + 1 < rawHeaders.length ? wordIdx + 1 : -1;
  if (exampleIdx < 0) exampleIdx = wordIdx + 2 < rawHeaders.length ? wordIdx + 2 : -1;

  const result: PullRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const word = String(row[wordIdx] ?? '').trim();
    if (!word) continue;
    result.push({
      Word: word,
      Meaning: meaningIdx >= 0 ? String(row[meaningIdx] ?? '') : '',
      Example: exampleIdx >= 0 ? String(row[exampleIdx] ?? '') : '',
      Note: noteIdx >= 0 ? String(row[noteIdx] ?? '') : '',
      'Encounter Count': encounterIdx >= 0 ? String(row[encounterIdx] ?? '') : undefined,
      'First Seen': firstSeenIdx >= 0 ? String(row[firstSeenIdx] ?? '') : undefined,
      'Last Seen': lastSeenIdx >= 0 ? String(row[lastSeenIdx] ?? '') : undefined,
    });
  }

  await setSheetsConfig({ lastSyncAt: new Date().toISOString() });
  return result;
}

// ─── Auto Sync (debounced) ────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Gọi hàm này sau mỗi lần thay đổi data (save/update/delete).
 * Sẽ tự push lên Sheet sau 3 giây (debounce để gom nhiều thay đổi liên tiếp).
 * Nếu chưa đăng nhập hoặc chưa có sheet → bỏ qua im lặng.
 */
export function scheduleAutoSync(): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void doAutoSync();
  }, 3000);
}

async function doAutoSync(): Promise<void> {
  try {
    if (!isConfigured()) return;
    const config = await getSheetsConfig();
    if (!config.spreadsheetId) return;

    // Kiểm tra token (không interactive — nếu hết hạn thì bỏ qua)
    const signed = await isSignedIn();
    if (!signed) return;

    // Import storage dynamically để tránh circular dependency
    const storageModule = await import('@/services/storage');
    const vocabs = await storageModule.listVocabularies();
    await pushToSheets(config.spreadsheetId, vocabs);
  } catch {
    // Auto-sync thất bại → bỏ qua im lặng, user vẫn dùng nút Push thủ công
  }
}

# Personal Vocabulary Tracker — Tổng quan dự án

> **Không phải từ điển. Không phải flashcard.**
>
> Extension Chrome giúp ghi lại những lần **thật sự gặp** một từ khi đọc trên web — kèm ngữ cảnh, nguồn và số lần gặp.

---

## Mục lục

1. [Vấn đề & giải pháp](#1-vấn-đề--giải-pháp)
2. [Tính năng chính](#2-tính-năng-chính)
3. [Tech stack](#3-tech-stack)
4. [Cấu trúc thư mục](#4-cấu-trúc-thư-mục)
5. [Kiến trúc extension](#5-kiến-trúc-extension)
6. [Mô hình dữ liệu](#6-mô-hình-dữ-liệu)
7. [Services & modules](#7-services--modules)
8. [Quản lý state](#8-quản-lý-state)
9. [Luồng người dùng](#9-luồng-người-dùng)
10. [Google Sheets & OAuth](#10-google-sheets--oauth)
11. [Cấu hình & biến môi trường](#11-cấu-hình--biến-môi-trường)
12. [Build & phát triển](#12-build--phát-triển)
13. [Quyền & bảo mật](#13-quyền--bảo-mật)
14. [Lịch sử cập nhật](#14-lịch-sử-cập-nhật)

---

## 1. Vấn đề & giải pháp

Khi đọc bài tiếng Anh, gặp từ mới thường phải chuyển tab sang sổ tay điện tử — mất tập trung, tốn thời gian, dễ bỏ sót.

**Vocab Tracker** giải quyết bằng cách cho phép **bôi đen → lưu ngay** mà không rời trang. Extension trả lời ba câu hỏi cốt lõi:

| Câu hỏi | Cách trả lời |
|---------|--------------|
| Đã gặp từ này chưa? | Kiểm tra kho từ cá nhân |
| Gặp bao nhiêu lần? | Đếm `encounterCount` qua mỗi lần lưu |
| Gặp trong ngữ cảnh nào? | Lưu câu gốc, URL, tiêu đề trang, thời điểm |

Extension kết hợp tốt với các công cụ tra từ khác (Google Translate, Cambridge Dictionary…) và hỗ trợ xuất dữ liệu ra Excel/CSV/JSON hoặc đồng bộ Google Sheets.

---

## 2. Tính năng chính

### Lưu từ khi đọc web
- Bôi đen từ → icon nổi (floating bubble) cạnh selection
- Chuột phải → **Thêm vào từ vựng**
- Phím tắt `Alt+S`
- Tự trích xuất câu chứa từ, URL, tiêu đề trang, domain

### Tra cứu từ điển
- Tích hợp [Free Dictionary API](https://api.dictionaryapi.dev)
- Phiên âm IPA, loại từ, định nghĩa, ví dụ, đồng/trái nghĩa
- Nút 🔊 phát âm (audio API + fallback Web Speech API)

### Giao diện
| Thành phần | Vai trò |
|------------|---------|
| **Popup** (360×420px) | Tìm kiếm, thống kê, danh sách 20 từ gần nhất |
| **Side Panel** | Ứng dụng chính: danh sách, chi tiết, ôn tập, cài đặt, hướng dẫn |
| **Options** (tab riêng) | Sao lưu/khôi phục Excel & JSON (phiên bản đơn giản) |

### Ôn tập SRS (Spaced Repetition)
- Thuật toán SM-2 với 4 mức đánh giá: **Quên / Khó / Tốt / Dễ**
- Khoảng cách ôn tập tùy chỉnh trong Cài đặt
- Badge hiển thị số từ đến hạn ôn

### Nhập / Xuất dữ liệu
- **Excel** (.xlsx), **CSV**, **JSON** backup
- Merge thông minh theo từ đã chuẩn hóa (không trùng lặp)

### Google Sheets
- Đăng nhập Google OAuth
- Tạo hoặc kết nối Spreadsheet có sẵn
- Push / Pull thủ công + **tự động đồng bộ** sau mỗi thay đổi local (debounce 3 giây)

---

## 3. Tech stack

| Lớp | Công nghệ |
|-----|-----------|
| Extension | Chrome Manifest V3 |
| UI | React 19, TypeScript 5.6 |
| Build | Vite 5 + `@crxjs/vite-plugin` 2.0-beta |
| Styling | Tailwind CSS 3.4, PostCSS, Autoprefixer |
| Spreadsheet I/O | `xlsx` 0.18.5 |
| Từ điển | Free Dictionary API |
| Google | Sheets API v4 + `chrome.identity` OAuth |

**Scripts:**

```bash
npm run dev      # Vite dev server + HMR (load thư mục dist/)
npm run build    # tsc --noEmit && vite build → dist/
npm run preview  # Vite preview
```

---

## 4. Cấu trúc thư mục

```
vocab-tracker/
├── manifest.config.ts       # Manifest MV3 (CRXJS)
├── vite.config.ts           # Vite + React + CRXJS plugin
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── README.md
├── CHANGELOG.md
├── TONG_QUAN.md             # Tài liệu này
├── .env.example             # Mẫu biến môi trường
├── public/icons/            # icon16/48/128.png
├── dist/                    # Build output (load unpacked)
└── src/
    ├── background/          # Service worker
    │   └── index.ts
    ├── content/             # Content script (bubble, selection)
    │   └── index.ts
    ├── popup/               # Popup UI
    │   ├── index.html, main.tsx, App.tsx
    ├── sidepanel/           # Side panel — UI chính (~1400 dòng)
    │   ├── index.html, main.tsx, App.tsx
    ├── options/             # Trang Options (tab riêng)
    │   ├── index.html, main.tsx, App.tsx
    ├── components/          # Component dùng chung
    │   ├── WordCard.tsx
    │   ├── EncounterList.tsx
    │   ├── SearchBox.tsx
    │   └── StatsBar.tsx
    ├── config/
    │   └── google.ts        # OAuth client ID + scopes
    ├── services/            # Business logic
    │   ├── storage.ts       # chrome.storage + import/export
    │   ├── sheets.ts        # Google Sheets sync
    │   ├── dictionary.ts    # Free Dictionary API
    │   ├── srs.ts           # Spaced Repetition
    │   ├── sentence.ts      # Trích xuất câu từ selection
    │   └── messages.ts      # Message types giữa các context
    ├── stores/
    │   └── vocabStore.ts    # Hook useVocabularies
    ├── types/
    │   └── vocabulary.ts    # TypeScript types
    ├── utils/
    │   └── date.ts
    └── styles/
        └── globals.css
```

---

## 5. Kiến trúc extension

### Sơ đồ tổng quan

```
┌─────────────────────────────────────────────────────────────┐
│                        Trang web (bất kỳ)                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Content Script (content/index.ts)                   │    │
│  │  • Floating bubble khi bôi đen                       │    │
│  │  • Gửi OPEN_SIDEPANEL_FOR_NEW → Background         │    │
│  └──────────────────────┬──────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          │ chrome.runtime.sendMessage
┌─────────────────────────▼───────────────────────────────────┐
│  Background Service Worker (background/index.ts)             │
│  • Context menu "Thêm vào từ vựng"                        │
│  • Phím tắt Alt+S                                           │
│  • Mở side panel ĐỒNG BỘ (giữ user gesture)                 │
│  • Lưu pendingNewWord vào chrome.storage.session            │
│  • Broadcast VOCAB_UPDATED sau khi lưu                        │
└──────────┬──────────────────────────────┬───────────────────┘
           │                              │
┌──────────▼──────────┐    ┌──────────────▼──────────────────┐
│  Popup (popup/)     │    │  Side Panel (sidepanel/)         │
│  • Tìm kiếm nhanh   │    │  Tab: Từ vựng | Ôn tập |        │
│  • Stats + list     │    │       Cài đặt | Hướng dẫn       │
│  • Mở side panel    │    │  • AddWordForm, WordDetail      │
└─────────────────────┘    │  • StudyMode (SRS)              │
                           │  • SettingsTab (Sheets, export) │
                           └──────────────┬──────────────────┘
                                          │
                           ┌──────────────▼──────────────────┐
                           │  chrome.storage.local            │
                           │  • vocabularies, encounters      │
                           │  • sheetsConfig, srsConfig       │
                           └─────────────────────────────────┘
```

### Manifest (`manifest.config.ts`)

| Thuộc tính | Giá trị |
|------------|---------|
| `manifest_version` | 3 |
| `action` | Popup tại `src/popup/index.html` |
| `side_panel` | `src/sidepanel/index.html` |
| `options_ui` | `src/options/index.html` (mở tab riêng) |
| `background` | `src/background/index.ts` (ES module) |
| `content_scripts` | `src/content/index.ts` trên `<all_urls>`, `document_idle` |
| `commands` | `save-selection` → `Alt+S` |
| `oauth2` | Chỉ inject khi có `VITE_GOOGLE_CLIENT_ID` |

**Permissions:** `contextMenus`, `storage`, `sidePanel`, `activeTab`, `scripting`, `tabs`, `identity`

**Host permissions:** `<all_urls>`, `https://api.dictionaryapi.dev/*`

### Background Service Worker

Trung tâm điều phối giữa content script, popup và side panel:

- Đăng ký context menu khi cài đặt
- Bật `sidePanel.openPanelOnActionClick: true`
- Xử lý messages: `OPEN_SIDEPANEL_FOR_NEW`, `SAVE_SELECTION`, `CHECK_WORD`, `OPEN_SIDEPANEL`
- **Pattern quan trọng:** gọi `chrome.sidePanel.open()` **đồng bộ** trong message handler để Chrome giữ user gesture
- `requestSelection()` — 3 tầng fallback: content script → `executeScript` → `selectionText` từ context menu

### Content Script

- Hiện floating bubble khi user bôi đen text (mouseup/keyup)
- Snapshot selection vào `pendingSelection` (vì selection bị xóa khi click)
- Gửi `OPEN_SIDEPANEL_FOR_NEW` kèm `SelectionPayload`
- Phát hiện extension context invalidated → nhắc F5 reload trang

### Side Panel — ứng dụng chính

| Tab | Chức năng |
|-----|-----------|
| **Từ vựng** | Danh sách, tìm kiếm, thêm/sửa/xóa từ, xem lịch sử gặp |
| **Ôn tập** | Flashcard SRS với 4 nút đánh giá |
| **Cài đặt** | Google Sheets, Excel/CSV/JSON, cấu hình SRS, xóa toàn bộ |
| **Hướng dẫn** | Tài liệu sử dụng tích hợp trong extension |

---

## 6. Mô hình dữ liệu

Định nghĩa tại `src/types/vocabulary.ts`.

### `Vocabulary` — một từ trong kho

```ts
{
  id: string;
  word: string;              // Từ gốc (có thể chứa IPA)
  normalizedWord: string;    // Chuẩn hóa để dedup (lowercase, bỏ dấu câu)
  meaning: string;
  example?: string;
  note?: string;             // Legacy — form chi tiết đã bỏ, dữ liệu cũ vẫn giữ
  dictionary?: DictionaryEntry;
  review?: ReviewInfo;       // Dữ liệu SRS
  encounterCount: number;
  firstSeenAt: string;       // ISO datetime
  lastSeenAt: string;
}
```

### `Encounter` — một lần gặp từ

```ts
{
  id: string;
  vocabularyId: string;
  sentence: string;          // Câu chứa từ (tối đa ~300 ký tự)
  sourceUrl: string;
  sourceTitle: string;
  domain: string;
  encounteredAt: string;     // ISO datetime
}
```

### Các type khác

| Type | Mô tả |
|------|-------|
| `VocabularyStats` | `{ total, newThisWeek, dueForReview }` |
| `SelectionPayload` | Dữ liệu từ selection trên trang web |
| `SaveWordPayload` | Selection + meaning/example/dictionary |
| `SaveResult` | Kết quả lưu: `{ vocabulary, encounter, isNew, wasDebounced }` |
| `ExportData` | Backup JSON v2: `{ version, exportedAt, vocabularies, encounters }` |
| `DictionaryEntry` | Phiên âm, audio, meanings[] từ API |
| `ReviewInfo` / `ReviewGrade` | Dữ liệu SRS (grade 0–3) |
| `SheetsConfig` | spreadsheetId, title, sheetTabName, lastSyncAt, userEmail |

**Chuẩn hóa từ:** `normalizeWord()` — lowercase + bỏ dấu câu để gộp từ trùng.

---

## 7. Services & modules

### `storage.ts` — lưu trữ cục bộ

**Storage keys** trong `chrome.storage.local`:

| Key | Nội dung |
|-----|----------|
| `vocabularies` | Mảng `Vocabulary[]` |
| `encounters` | Mảng `Encounter[]` |
| `sheetsConfig` | Cấu hình Google Sheets |
| `srsConfig` | Cấu hình khoảng cách ôn tập |

**Chức năng chính:**
- CRUD từ vựng: `saveWord`, `saveSelection`, `updateVocabulary`, `removeVocabulary`
- Tìm kiếm & thống kê: `searchVocabularies`, `getStats`
- SRS: `getDueWords`, `submitReview`, `getDueCount`
- Import/export: JSON (v1/v2), Excel, CSV — merge theo `normalizedWord`
- `importRowsFromPull()` — merge từ Sheets với `skipAutoSync: true`
- Mỗi lần ghi local → `scheduleAutoSync()` (trừ khi skip)

### `sheets.ts` — đồng bộ Google Sheets

- Auth qua `chrome.identity.getAuthToken` (refresh token khi 401)
- `signIn` / `signOut` (revoke + xóa cached token)
- `createSpreadsheet()` — tạo sheet tab "Vocabulary" với header row
- `connectSpreadsheet(id)` — tự detect tên tab đầu tiên
- `pushToSheets()` — ghi đè toàn bộ (8 cột)
- `pullFromSheets()` — smart column mapping (header VN/EN hoặc fallback theo vị trí)
- `scheduleAutoSync()` — debounce 3 giây sau thay đổi local

### `dictionary.ts` — tra từ điển

```
GET https://api.dictionaryapi.dev/api/v2/entries/en/{word}
```

- Giới hạn 1–2 từ, cap số definitions/synonyms
- `getFirstDefinition()` — auto-prefill form lưu từ mới

### `srs.ts` — Spaced Repetition

- Thuật toán SM-2
- Config mặc định: Again=0d, Hard=1d, Good=3d, Easy=7d; lần ôn thứ 2=6d
- Lưu config tại `srsConfig` trong `chrome.storage.local`

### `sentence.ts` — trích xuất ngữ cảnh

- `extractSentence()` — mở rộng selection thành câu hoàn chỉnh (max 300 ký tự)
- `getSelectionContext()` — validate từ (≤80 ký tự, ≤5 từ), tìm container block-level

### `messages.ts` — giao tiếp giữa contexts

| Message | Hướng | Mục đích |
|---------|-------|----------|
| `GET_SELECTION` | → Content | Lấy selection hiện tại |
| `OPEN_SIDEPANEL_FOR_NEW` | Content → BG | Mở panel + lưu từ mới |
| `SAVE_SELECTION` | → BG | Lưu từ từ background |
| `CHECK_WORD` | → BG | Kiểm tra từ đã tồn tại |
| `VOCAB_UPDATED` | BG → UI | Refresh danh sách |
| `SHOW_TOAST` | BG → Content | Hiện thông báo trên trang |

---

## 8. Quản lý state

**Không dùng thư viện global state** (không Zustand/Redux).

| Cơ chế | Cách dùng |
|--------|-----------|
| `useVocabularies(query)` hook | React state + `storage.searchVocabularies`; refresh khi `chrome.storage.onChanged` hoặc nhận `VOCAB_UPDATED` |
| `useState` local | UI state trong từng component (tab, form, study session) |
| `chrome.storage.local` | Dữ liệu persistent: vocab, encounters, config |
| `chrome.storage.session` | Ephemeral: `pendingNewWord`, `selectedVocabularyId` |
| Runtime messages | Đồng bộ refresh giữa background ↔ UI |

---

## 9. Luồng người dùng

### Lưu từ mới

```
Bôi đen từ trên trang web
    ↓
Bubble / Chuột phải / Alt+S
    ↓
Background mở Side Panel NGAY (đồng bộ)
    ↓
Lưu SelectionPayload → chrome.storage.session.pendingNewWord
    ↓
Side Panel hiện AddWordForm
    ↓
Dictionary API auto-prefill nghĩa/ví dụ
    ↓
User chỉnh sửa → "✓ Lưu từ"
    ↓
storage.saveWord() → Vocabulary + Encounter mới
    ↓
Toast "Đã lưu từ thành công!" + scheduleAutoSync()
```

Gặp lại cùng từ → tăng `encounterCount`, thêm `Encounter` mới.

### Xem / sửa từ

1. Click từ trong popup hoặc danh sách side panel
2. Set `selectedVocabularyId` trong session storage
3. `WordDetail` hiện encounters, dictionary, cho phép sửa word/meaning/example

### Ôn tập SRS

1. Tab **Ôn tập** (badge = số từ đến hạn)
2. `getDueWords(20)` — ưu tiên chưa ôn, sau đó quá hạn nhất
3. Lật thẻ → đánh giá 0–3 → `submitReview()` cập nhật lịch SM-2

### Đồng bộ Google Sheets

1. Cài đặt → Đăng nhập Google
2. Tạo spreadsheet mới hoặc dán Spreadsheet ID
3. Push / Pull thủ công, hoặc tự động push sau 3 giây khi có thay đổi local
4. Pull merge vào local **không** trigger push ngược lại

### Sao lưu dữ liệu

- **Side Panel → Cài đặt** hoặc **Options tab**: Export/Import Excel, CSV, JSON
- Excel/CSV: merge theo từ chuẩn hóa
- JSON: thay thế toàn bộ dữ liệu

---

## 10. Google Sheets & OAuth

### Thiết lập developer

1. Tạo OAuth Client ID (Chrome Extension) trên [Google Cloud Console](https://console.cloud.google.com)
2. Copy client ID vào `.env`:

```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

3. Build lại extension (`npm run build`)

### Luồng OAuth

```
User click "Đăng nhập với Google"
    ↓
chrome.identity.getAuthToken({ interactive: true })
    ↓
Lấy email qua oauth2/v2/userinfo
    ↓
Tạo / kết nối Spreadsheet
    ↓
Push: ghi đè sheet (8 cột)
Pull: đọc rows → smart header mapping → merge local
    ↓
Auto-sync: debounce 3s sau mỗi thay đổi local
```

### Cột trên Google Sheets

| Cột | Nội dung |
|-----|----------|
| Từ | `word` |
| Nghĩa | `meaning` |
| Ví dụ | `example` |
| Số lần gặp | `encounterCount` |
| Lần đầu gặp | `firstSeenAt` |
| Lần cuối gặp | `lastSeenAt` |
| Ngữ cảnh gần nhất | sentence từ encounter mới nhất |
| Nguồn | URL từ encounter mới nhất |

Nếu chưa cấu hình `VITE_GOOGLE_CLIENT_ID`, `isConfigured()` trả về `false` và UI hiện hướng dẫn setup.

---

## 11. Cấu hình & biến môi trường

| Biến | File | Mục đích |
|------|------|----------|
| `VITE_GOOGLE_CLIENT_ID` | `.env` | Google OAuth Client ID cho Sheets sync |

- Đọc lúc build trong `manifest.config.ts` (qua `loadEnv`)
- Đọc lúc runtime trong `src/config/google.ts` (qua `import.meta.env`)
- `.env` nằm trong `.gitignore` — **không commit**
- Xem `.env.example` để biết format

**Không cần biến env** cho các tính năng cơ bản (lưu từ, tra từ điển, SRS, export/import). Chỉ Google Sheets sync yêu cầu OAuth client ID.

---

## 12. Build & phát triển

### Cài đặt từ mã nguồn

```bash
cd vocab-tracker
cp .env.example .env        # (tùy chọn) điền Google Client ID
npm install
npm run build
```

Load unpacked trong Chrome:
1. Mở `chrome://extensions`
2. Bật **Developer mode**
3. **Load unpacked** → chọn thư mục `dist/`

### Phát triển

```bash
npm run dev
```

- Vite dev server với HMR
- Sau thay đổi: reload extension + refresh trang web đang đọc (đặc biệt content script)

### Cấu hình build

| File | Vai trò |
|------|---------|
| `vite.config.ts` | React + CRXJS plugin; alias `@` → `src/`; Rollup inputs cho popup/sidepanel/options |
| `manifest.config.ts` | Nguồn manifest MV3; inject OAuth từ env |
| `tsconfig.json` | Strict TypeScript, ES2022, path alias `@/*` |
| `tailwind.config.js` | Palette `ink` + `accent`, display font |

---

## 13. Quyền & bảo mật

### Quyền Chrome

| Permission | Lý do |
|------------|-------|
| `storage` | Lưu từ vựng local |
| `sidePanel` | Giao diện chính |
| `contextMenus` | Menu chuột phải "Thêm vào từ vựng" |
| `activeTab` / `scripting` / `tabs` | Lấy selection từ tab hiện tại |
| `identity` | Google OAuth cho Sheets sync |

### Riêng tư

- **Dữ liệu từ vựng lưu hoàn toàn trên máy** (`chrome.storage.local`)
- Không gửi dữ liệu lên server riêng của extension
- Google Sheets sync chỉ khi user chủ động đăng nhập và kết nối
- Dictionary API chỉ gửi từ cần tra (không gửi dữ liệu cá nhân)
- OAuth Client ID trong `.env` — không commit vào git

---

## 14. Lịch sử cập nhật

Chi tiết đầy đủ tại [`CHANGELOG.md`](./CHANGELOG.md).

### 27/08/2026
- Redesign Cài đặt (card, accordion, toast feedback)
- Nghĩa & Ví dụ chuyển sang textarea
- Cho phép sửa tên từ (IPA, cách viết khác)
- Fix Pull Sheets không trigger auto-push ghi đè
- Smart column mapping (header VN/EN)
- Auto-detect tên tab spreadsheet
- SRS interval tùy chỉnh theo từng mức đánh giá
- Fix nút loa — thêm fallback Web Speech API

### 18/08/2026 — Bản tính năng lớn
- Tra cứu từ điển + phát âm
- Lưu từ với nghĩa/ví dụ/ghi chú
- Export/import Excel, CSV, JSON
- Flashcard SRS (Spaced Repetition)
- Google Sheets connect + auto-sync
- Tab Hướng dẫn tích hợp

### Bug fixes
- Fix "Extension context invalidated" sau reload extension
- Fix Side Panel không mở khi click bubble (gọi `sidePanel.open()` đồng bộ)

---

## Ghi chú cho developer

- **Side Panel là trung tâm** — popup và options là bề mặt phụ
- **Options vs Side Panel Settings** có chức năng trùng lặp một phần; side panel đầy đủ hơn (Sheets, CSV, SRS)
- **README.md** chưa cập nhật hết tính năng mới — tham khảo `CHANGELOG.md` và tài liệu này để có bức tranh đầy đủ
- Sau khi cài/cập nhật extension, user cần **F5 trang web** để content script hoạt động

---

*Phiên bản dự án: 1.0.0 · Giấy phép: MIT*

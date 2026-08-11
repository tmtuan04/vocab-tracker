# Personal Vocabulary Tracker

**Không phải từ điển. Không phải flashcard.**

Đây là tiện ích Chrome giúp bạn ghi lại những lần **thật sự gặp** một từ khi đọc trên web — kèm ngữ cảnh, nguồn và số lần gặp.

Khi học tiếng Anh trên Wikipedia, bài báo hay đề TOEIC, mỗi từ bạn lưu lại trở thành một dấu vết: “mình đã gặp từ này ở đâu, khi nào, và bao nhiêu lần?”

---

## Vì sao dùng?

Ba câu hỏi quan trọng nhất khi gặp lại một từ:

| | |
|---|---|
| **Đã gặp chưa?** | Biết ngay từ này đã có trong kho của bạn |
| **Gặp bao nhiêu lần?** | Theo dõi mức độ tiếp xúc thực tế |
| **Gặp trong ngữ cảnh nào?** | Xem lại câu gốc + trang nguồn |

---

## Tính năng

- **Lưu nhanh khi đọc** — bôi đen từ, bấm icon nổi cạnh selection (hoặc chuột phải / `Alt+S`)
- **Giữ ngữ cảnh đầy đủ** — câu chứa từ, URL, tiêu đề trang, thời điểm gặp
- **Theo dõi mỗi lần gặp lại** — tăng số lần gặp và thêm ngữ cảnh mới
- **Nghĩa & phiên âm** — tự điền từ từ điển tiếng Anh khi lưu lần đầu
- **Popup** — tìm kiếm, thống kê nhanh, danh sách từ gần đây
- **Side panel** — xem chi tiết, lịch sử gặp, ghi chú cá nhân
- **Sao lưu** — xuất / nhập dữ liệu JSON từ trang Options
- **Riêng tư** — dữ liệu lưu trên máy bạn (`chrome.storage.local`)

---

## Cài đặt

### Từ mã nguồn

1. Clone repo và build:

```bash
cd vocab-tracker
npm install
npm run build
```

2. Mở Chrome → `chrome://extensions`
3. Bật **Developer mode**
4. Chọn **Load unpacked** → trỏ tới thư mục `dist`

---

## Cách dùng

1. Mở bất kỳ trang web nào (http/https)
2. Bôi đen một từ hoặc cụm ngắn
3. Bấm **icon nổi** cạnh đoạn chọn  
   *(hoặc chuột phải → Save to My Vocabulary / nhấn `Alt+S`)*
4. Mở popup để xem kho từ, hoặc side panel để xem lịch sử gặp và ghi chú

**Lưu ý:** Sau khi cài hoặc cập nhật extension, hãy **refresh** trang đang đọc để icon nổi hoạt động.

### Mở trang Options (sao lưu / xóa dữ liệu)

- Chuột phải icon extension → **Options**, hoặc  
- `chrome://extensions` → Personal Vocabulary Tracker → **Details** → **Extension options**

---

## Dành cho developer

```bash
npm run dev    # phát triển với hot reload (load dist/)
npm run build  # build production vào dist/
```

Stack: React, TypeScript, Vite, Tailwind, Manifest V3, Free Dictionary API.

---

## Giấy phép

MIT

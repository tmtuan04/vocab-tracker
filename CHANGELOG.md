# Changelog

> Khi đọc bài tiếng Anh, gặp từ mới muốn ghi lại phải chuyển tab liên tục sang sổ tay điện tử mất tập trung, tốn thời gian, dễ bỏ sót.
>
> Extension cho phép **bôi đen → lưu ngay** mà không rời trang, kết hợp rất tốt với các extension tra từ chuyên nghiệp khác (Google Translate, Cambridge Dictionary...). Ngoài ra extension hỗ trợ kết nối với Google Sheets cá nhân và hỗ trợ nhập xuất dữ liệu ra file Excel, CSV để sử dụng tùy ý (như nhập vào Anki).

---
## Tính năng mới & Cập nhật
> **Cập nhật**: 27/08/2026

### 🎨 Giao diện
- **Cài đặt** — redesign hoàn toàn: nhóm theo card với header gradient + icon, accordion collapsible cho Excel/CSV/JSON, nút Push/Pull có SVG icon, toast feedback ở đầu trang
- **Nghĩa & Ví dụ** — chuyển sang textarea, cho phép Enter xuống dòng
- **Từ vựng** — cho phép sửa tên từ (thêm phiên âm IPA, cách viết khác)
- **Lưu từ mới** — hiện toast "Đã lưu từ thành công! ✓" thay vì chuyển sang trang chi tiết
- **Số lượng từ** — chuyển badge từ header xuống ngang hàng tiêu đề "Danh sách từ"
- **Bỏ trường Ghi chú** khỏi form chi tiết từ (giữ dữ liệu cũ trong storage)

### 🔧 Google Sheets Sync
- **Fix Pull phá cấu trúc sheet gốc** — Pull không còn trigger auto-sync Push ghi đè sheet
- **Smart column mapping** — Pull tự nhận diện header tiếng Việt (`Từ`, `Nghĩa`, `Ví dụ`), tiếng Anh, hoặc fallback theo thứ tự cột
- **Auto-detect tên tab** — kết nối sheet có sẵn tự lấy tên tab đầu tiên, không hardcode "Vocabulary"
- **Fix lỗi 400 "Unable to parse range"** khi kết nối sheet có tên tab khác "Vocabulary"

### 🧠 SRS
- **Interval tùy chỉnh** theo từng mức đánh giá (Quên/Khó/Tốt/Dễ) trong Cài đặt
- **submitReview** dùng config user thay vì giá trị mặc định

### 🔊 Audio
- **Fix nút loa không phát âm** — thêm fallback Web Speech API (`speechSynthesis`)

> **Cập nhật**: 18/08/2026

| Tính năng | Cũ | Mới |
|-----------|-------------|-------------------|
| **Tra cứu từ điển** | Chưa có | Tự tra Dictionary API tham khảo: phiên âm, loại từ, định nghĩa, ví dụ, đồng/trái nghĩa. Nút 🔊 nghe phát âm |
| **Lưu từ mới** | Lưu cơ bản, chỉ JSON | Người dùng có thể tra từ rồi ghi vào các trường **Nghĩa**, **Ví dụ**, **Ghi chú** rồi lưu lại. |
| **Nhập/Xuất dữ liệu** | Chưa có | Hỗ trợ xuất **Excel (.xlsx)**, **CSV**, JSON backup và **kiểm tra trùng lặp** |
| **Ôn tập từ** | Chưa có | Flashcard theo phương pháp **Spaced Repetition**. 4 mức đánh giá, khoảng cách ôn tập tùy chỉnh trong Cài đặt |
| **Kết nối Google Sheets** | Chưa có | Đăng nhập Google → tạo/kết nối Spreadsheet → Push/Pull + **tự động đồng bộ** sau mỗi thay đổi |
| **Hướng dẫn sử dụng** | Chưa có | Tab ❓ Hướng dẫn tích hợp ngay trong extension |

---

## Bug fixes

- Fix **lỗi "Extension context invalidated"** khi bôi đen từ sau khi reload extension
- Fix **Side Panel không mở** khi click bubble (phải gọi `sidePanel.open()` đồng bộ)

---

# Changelog

> Khi đọc bài tiếng Anh, gặp từ mới muốn ghi lại phải chuyển tab liên tục sang sổ tay điện tử mất tập trung, tốn thời gian, dễ bỏ sót.
>
> Extension cho phép **bôi đen → lưu ngay** mà không rời trang, kết hợp rất tốt với các extension tra từ chuyên nghiệp khác (Google Translate, Cambridge Dictionary...). Ngoài ra extension hỗ trợ kết nối với Google Sheets cá nhân và hỗ trợ nhập xuất dữ liệu ra file Excel, CSV để sử dụng tùy ý (như nhập vào Anki).

---
## Tính năng mới
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



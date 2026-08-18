import { useRef, useState } from 'react';
import * as storage from '@/services/storage';

export default function App() {
  const excelImportRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setSuccess(msg: string) {
    setError(null);
    setMessage(msg);
  }
  function setFail(msg: string) {
    setMessage(null);
    setError(msg);
  }

  // ─── Excel ────────────────────────────────────────────────────────────────

  const onExportExcel = async () => {
    try {
      const blob = await storage.exportExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocab-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Đã xuất file Excel.');
    } catch (err) {
      setFail(err instanceof Error ? err.message : 'Xuất Excel thất bại');
    }
  };

  const onImportExcel = async (file: File) => {
    try {
      const { imported, updated } = await storage.importExcel(file);
      setSuccess(`Import xong: ${imported} từ mới, ${updated} từ được cập nhật.`);
    } catch (err) {
      setFail(err instanceof Error ? err.message : 'Import Excel thất bại');
    }
  };

  // ─── JSON (backup) ────────────────────────────────────────────────────────

  const onExportJson = async () => {
    try {
      const data = await storage.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vocab-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Đã xuất backup JSON.');
    } catch (err) {
      setFail(err instanceof Error ? err.message : 'Xuất JSON thất bại');
    }
  };

  const onImportJson = async (file: File) => {
    try {
      const text = await file.text();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const data = JSON.parse(text);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await storage.importData(data as any);
      setSuccess('Import JSON thành công.');
    } catch (err) {
      setFail(err instanceof Error ? err.message : 'Import JSON thất bại');
    }
  };

  // ─── Clear ────────────────────────────────────────────────────────────────

  const onClear = async () => {
    if (!confirm('Xóa toàn bộ từ vựng? Không thể hoàn tác.')) return;
    await storage.clearAll();
    setSuccess('Đã xóa toàn bộ dữ liệu.');
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(160deg,#f6f7f4_0%,#e6f2eb_45%,#e8ebe3_100%)] px-6 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-3xl font-semibold text-ink-900">Cài đặt</h1>
        <p className="mt-1 text-sm text-ink-600">Quản lý dữ liệu từ vựng của bạn.</p>

        {/* Excel section */}
        <div className="mt-8">
          <h2 className="mb-1 font-semibold text-ink-900">📊 Excel (.xlsx)</h2>
          <p className="mb-3 text-xs text-ink-600">
            Xuất / nhập danh sách từ. Cột: <em>Word, Meaning, Example, Note, Encounter Count,
            First Seen, Last Seen</em>.
          </p>
          <div className="space-y-2 card-soft">
            <button
              id="export-excel-btn"
              type="button"
              className="btn-primary w-full"
              onClick={() => void onExportExcel()}
            >
              Xuất Excel
            </button>
            <button
              id="import-excel-btn"
              type="button"
              className="btn-ghost w-full border border-ink-200"
              onClick={() => excelImportRef.current?.click()}
            >
              Nhập Excel
            </button>
            <input
              ref={excelImportRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportExcel(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* JSON backup section */}
        <div className="mt-6">
          <h2 className="mb-1 font-semibold text-ink-900">💾 Backup JSON</h2>
          <p className="mb-3 text-xs text-ink-600">
            Sao lưu / phục hồi toàn bộ dữ liệu (bao gồm lịch sử gặp).
          </p>
          <div className="space-y-2 card-soft">
            <button
              id="export-json-btn"
              type="button"
              className="btn-ghost w-full border border-ink-200"
              onClick={() => void onExportJson()}
            >
              Xuất JSON
            </button>
            <button
              id="import-json-btn"
              type="button"
              className="btn-ghost w-full border border-ink-200"
              onClick={() => jsonImportRef.current?.click()}
            >
              Nhập JSON
            </button>
            <input
              ref={jsonImportRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportJson(file);
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* Google Sheets */}
        <div className="mt-6">
          <h2 className="mb-1 font-semibold text-ink-900">☁️ Google Sheets Sync</h2>
          <div className="card-soft">
            <p className="text-sm text-ink-600">
              Đồng bộ từ vựng với Google Sheets đã có sẵn trong Side Panel → ⚙️ Cài đặt.
            </p>
            <p className="mt-2 text-xs text-ink-500">
              Mở Side Panel để đăng nhập Google và kết nối Spreadsheet.
            </p>
          </div>
        </div>

        {/* Danger zone */}
        <div className="mt-6">
          <h2 className="mb-1 font-semibold text-red-700">⚠️ Danger Zone</h2>
          <div className="card-soft">
            <button
              id="clear-all-btn"
              type="button"
              className="btn-danger w-full"
              onClick={() => void onClear()}
            >
              Xóa toàn bộ dữ liệu
            </button>
          </div>
        </div>

        {/* Feedback */}
        {message && (
          <div className="mt-4 rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent-dark">
            ✓ {message}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            ✗ {error}
          </div>
        )}

        {/* Keyboard shortcuts */}
        <div className="mt-8 text-sm text-ink-700">
          <h2 className="font-semibold text-ink-900">⌨️ Phím tắt</h2>
          <ul className="mt-1 list-disc pl-5 space-y-1">
            <li>
              <kbd className="rounded bg-ink-100 px-1">Alt</kbd>{' '}+{' '}
              <kbd className="rounded bg-ink-100 px-1">S</kbd> — Mở side panel với từ đang chọn
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

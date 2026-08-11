import { useRef, useState } from 'react';
import * as storage from '@/services/storage';
import type { ExportData } from '@/types/vocabulary';

export default function App() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onExport = async () => {
    setError(null);
    const data = await storage.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocabulary-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Đã xuất JSON.');
  };

  const onImport = async (file: File) => {
    setError(null);
    setMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;
      await storage.importData(data);
      setMessage(`Đã import ${data.vocabularies.length} từ / ${data.encounters.length} ngữ cảnh.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import thất bại');
    }
  };

  const onClear = async () => {
    if (!confirm('Xóa toàn bộ từ vựng và ngữ cảnh? Không thể hoàn tác.')) return;
    await storage.clearAll();
    setMessage('Đã xóa toàn bộ dữ liệu.');
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(160deg,#f6f7f4_0%,#e6f2eb_45%,#e8ebe3_100%)] px-6 py-10">
      <div className="mx-auto max-w-xl">
        <h1 className="font-display text-3xl font-semibold text-ink-900">
          Vocabulary Options
        </h1>
        <p className="mt-1 text-sm text-ink-700">
          Xuất / nhập dữ liệu lưu trên máy (chrome.storage.local).
        </p>

        <div className="mt-6 space-y-3 card-soft">
          <button type="button" className="btn-primary w-full" onClick={() => void onExport()}>
            Export JSON
          </button>

          <button
            type="button"
            className="btn-ghost w-full border border-ink-200"
            onClick={() => fileRef.current?.click()}
          >
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
              e.target.value = '';
            }}
          />

          <button type="button" className="btn-danger w-full" onClick={() => void onClear()}>
            Clear all data
          </button>
        </div>

        {message ? (
          <p className="mt-4 text-sm text-accent-dark">{message}</p>
        ) : null}
        {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

        <div className="mt-8 text-sm text-ink-700">
          <h2 className="font-semibold text-ink-900">Phím tắt</h2>
          <ul className="mt-1 list-disc pl-5">
            <li>
              <kbd className="rounded bg-ink-100 px-1">Alt</kbd> +{' '}
              <kbd className="rounded bg-ink-100 px-1">S</kbd> — Save selection
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

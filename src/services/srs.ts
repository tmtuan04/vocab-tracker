// ─── Types ────────────────────────────────────────────────────────────────────

export type ReviewGrade = 0 | 1 | 2 | 3;
// 0 = Again (quên hoàn toàn)
// 1 = Hard  (nhớ nhưng khó khăn)
// 2 = Good  (nhớ ổn)
// 3 = Easy  (nhớ ngay lập tức)

export type ReviewInfo = {
  interval: number;      // số ngày đến lần ôn tiếp theo
  easeFactor: number;   // hệ số dễ nhớ (1.3 – 2.5), mặc định 2.5
  repetitions: number;  // số lần ôn thành công liên tiếp
  nextReviewAt: string; // ISO timestamp: lần ôn tiếp theo
  lastReviewAt: string; // ISO timestamp: lần ôn gần nhất
};

// ─── Configurable intervals ───────────────────────────────────────────────────

export type SRSConfig = {
  /** Interval (ngày) cho lần ôn đầu tiên theo mỗi grade */
  firstReviewIntervals: Record<ReviewGrade, number>;
  /** Interval (ngày) cho lần ôn thứ 2 (reps=1) */
  secondReviewInterval: number;
};

const SRS_CONFIG_KEY = 'srsConfig';

const DEFAULT_SRS_CONFIG: SRSConfig = {
  firstReviewIntervals: {
    0: 0,   // Again: ôn lại trong ngày (vài phút sau)
    1: 1,   // Hard: 1 ngày
    2: 3,   // Good: 3 ngày
    3: 7,   // Easy: 7 ngày
  },
  secondReviewInterval: 6,
};

export async function getSRSConfig(): Promise<SRSConfig> {
  const result = await chrome.storage.local.get(SRS_CONFIG_KEY);
  return { ...DEFAULT_SRS_CONFIG, ...(result[SRS_CONFIG_KEY] as Partial<SRSConfig> | undefined) };
}

export async function setSRSConfig(config: SRSConfig): Promise<void> {
  await chrome.storage.local.set({ [SRS_CONFIG_KEY]: config });
}

// ─── SM-2 Algorithm ───────────────────────────────────────────────────────────

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

/**
 * Tính toán lịch ôn tập tiếp theo theo thuật toán SM-2 (cải tiến).
 *
 * SM-2 quality mapping:
 *   Grade 0 (Again) → quality 0  → reset
 *   Grade 1 (Hard)  → quality 3  → pass but reduce EF
 *   Grade 2 (Good)  → quality 4  → pass normal
 *   Grade 3 (Easy)  → quality 5  → pass, boost EF
 */
export function calculateNextReview(
  current: ReviewInfo | undefined,
  grade: ReviewGrade,
  config: SRSConfig = DEFAULT_SRS_CONFIG,
): ReviewInfo {
  const qualityMap: Record<ReviewGrade, number> = { 0: 0, 1: 3, 2: 4, 3: 5 };
  const quality = qualityMap[grade];

  const ef = current?.easeFactor ?? DEFAULT_EASE;
  const reps = current?.repetitions ?? 0;
  const prevInterval = current?.interval ?? 0;

  let newInterval: number;
  let newReps: number;

  if (quality < 3) {
    // Quên → reset về đầu
    newReps = 0;
    newInterval = config.firstReviewIntervals[0];
  } else {
    // Nhớ → tăng interval
    if (reps === 0) {
      // Lần ôn đầu tiên: interval khác nhau tùy grade
      newInterval = config.firstReviewIntervals[grade];
    } else if (reps === 1) {
      newInterval = config.secondReviewInterval;
    } else {
      newInterval = Math.round(prevInterval * ef);
    }
    newReps = reps + 1;
  }

  // Cập nhật ease factor: EF' = EF + 0.1 - (5-q)(0.08 + (5-q)·0.02)
  const newEF = Math.max(MIN_EASE, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));

  const now = new Date();
  const nextReview = new Date(now);
  nextReview.setDate(nextReview.getDate() + Math.max(0, newInterval));

  return {
    interval: newInterval,
    easeFactor: parseFloat(newEF.toFixed(4)),
    repetitions: newReps,
    nextReviewAt: nextReview.toISOString(),
    lastReviewAt: now.toISOString(),
  };
}

/** Kiểm tra từ có đến hạn ôn không. */
export function isDue(review: ReviewInfo | undefined): boolean {
  if (!review) return true; // Chưa ôn lần nào → luôn due
  return new Date(review.nextReviewAt) <= new Date();
}

/** Label cho các nút grade. */
export const GRADE_LABELS: Record<ReviewGrade, { label: string; sub: string; color: string }> = {
  0: { label: 'Quên', sub: '', color: 'bg-red-500 hover:bg-red-600' },
  1: { label: 'Khó', sub: '', color: 'bg-orange-400 hover:bg-orange-500' },
  2: { label: 'Tốt', sub: '', color: 'bg-accent hover:bg-accent-dark' },
  3: { label: 'Dễ', sub: '', color: 'bg-sky-500 hover:bg-sky-600' },
};

/** Tính label hiển thị interval sau khi chọn grade. */
export function previewInterval(current: ReviewInfo | undefined, grade: ReviewGrade, config?: SRSConfig): string {
  const next = calculateNextReview(current, grade, config);
  const d = next.interval;
  if (d <= 0) return 'hôm nay';
  if (d === 1) return '1 ngày';
  if (d < 30) return `${d} ngày`;
  if (d < 365) return `${Math.round(d / 30)} tháng`;
  return `${Math.round(d / 365)} năm`;
}

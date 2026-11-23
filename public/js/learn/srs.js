// Spaced repetition, one entry per GATE topic: { step, due }.
// A topic enters the queue when it is first mastered and comes back after
// 2 days; each passed review moves it to the next gap (7, 21, then every 45
// days). A failed review drops it back one gap and brings it back tomorrow.

export const INTERVALS = [2, 7, 21, 45];
export const DAY = 86400000;
export const REVIEW_QUESTIONS = 2;

export function enter(reviews, topic, now) {
  if (!reviews[topic]) reviews[topic] = { step: 0, due: now + INTERVALS[0] * DAY };
  return reviews[topic];
}

// The entry after a review session. passed = every question in it was right.
export function applyReview(entry, passed, now) {
  const step = entry?.step ?? 0;
  if (passed) {
    const next = Math.min(step + 1, INTERVALS.length - 1);
    return { step: next, due: now + INTERVALS[next] * DAY };
  }
  return { step: Math.max(step - 1, 0), due: now + DAY };
}

// Topics due now, the most overdue first.
export function dueTopics(reviews, now) {
  return Object.entries(reviews).filter(([, r]) => r.due <= now).sort((a, b) => a[1].due - b[1].due).map(([t]) => t);
}

export function nextDue(reviews, now) {
  const later = Object.values(reviews).filter((r) => r.due > now).map((r) => r.due);
  return later.length ? Math.min(...later) : null;
}

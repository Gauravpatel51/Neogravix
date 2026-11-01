/**
 * Pure scheduling engine for Backlog Rescue.
 * Respects lecture prerequisites (Lecture N before N+1 within chapter),
 * daily time capacity, and carry-forward.
 */

/**
 * Finds the next eligible backlog item that satisfies prerequisite constraints.
 * For lectures, Lecture N cannot be scheduled if an incomplete Lecture < N
 * for the same chapter still exists in the remaining queue.
 *
 * @param {Array} arr - Remaining items
 * @param {Array} chosen - Items already scheduled in the current batch/day
 * @returns {Object|null}
 */
export function findAvailable(arr, chosen = []) {
  for (const x of arr) {
    if (x.kind !== 'lecture') {
      return x;
    }
    const earlier = arr.find(
      y => y.kind === 'lecture' && y.chapter === x.chapter && Number(y.num) < Number(x.num)
    );
    if (!earlier) {
      return x;
    }
  }
  return null;
}

/**
 * Plans rescue schedule over a window of days with a daily time limit.
 *
 * @param {Object} options
 * @param {Array} options.items - Backlog items
 * @param {number} [options.dailyMinutes=120] - Minutes available per day
 * @param {number} [options.days=5] - Number of days in rescue window
 * @param {boolean} [options.keepRegularStudy=true] - Reserve 30m/day for regular study
 * @returns {{ planned: Array, remaining: Array, totalBacklogMinutes: number, completedCount: number, pendingCount: number }}
 */
export function planRescue({
  items = [],
  dailyMinutes = 120,
  days = 5,
  keepRegularStudy = true
} = {}) {
  const cap = Number(dailyMinutes) - (keepRegularStudy ? 30 : 0);
  const D = Number(days);

  if (cap <= 0) {
    throw new Error('Daily time must be greater than study reserve (30m).');
  }

  // Deep clone remaining incomplete items
  let remaining = items
    .filter(x => !x.done)
    .map(x => ({ ...x, min: Number(x.min) || 0 }));

  const planned = [];
  let carry = 0;

  for (let day = 1; day <= D; day++) {
    const budget = cap + carry;
    carry = 0;
    const dayItems = [];
    let used = 0;

    while (true) {
      const candidate = findAvailable(remaining, dayItems);
      if (!candidate) break;

      if (candidate.min <= budget - used) {
        dayItems.push({ ...candidate });
        used += candidate.min;
        remaining = remaining.filter(x => x.id !== candidate.id);
      } else {
        break;
      }
    }

    // If day is still empty and next available lecture exceeds budget, split it
    if (dayItems.length === 0 && remaining.length > 0) {
      const candidate = findAvailable(remaining, []);
      if (candidate && candidate.kind === 'lecture' && candidate.min > budget) {
        const part = Math.min(budget, candidate.min);
        dayItems.push({
          ...candidate,
          name: candidate.name.includes('(Part') ? candidate.name : `${candidate.name} (Part 1)`,
          min: part,
          split: true
        });
        candidate.min -= part;
        used += part;
      }
    }

    carry = Math.max(0, budget - used);
    planned.push({ day, used, items: dayItems, carry });
    if (!remaining.length) break;
  }

  const pending = items.filter(x => !x.done);
  const done = items.filter(x => x.done);
  const totalBacklogMinutes = pending.reduce((sum, x) => sum + (Number(x.min) || 0), 0);

  return {
    planned,
    remaining,
    totalBacklogMinutes,
    pendingCount: pending.length,
    completedCount: done.length
  };
}

/**
 * Computes backlog summary metrics.
 *
 * @param {Array} items
 * @returns {{ pendingCount: number, doneCount: number, totalMinutes: number, formattedTime: string }}
 */
export function calculateBacklogStats(items = []) {
  const pending = items.filter(x => !x.done);
  const done = items.filter(x => x.done);
  const totalMinutes = pending.reduce((sum, x) => sum + (Number(x.min) || 0), 0);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const formattedTime = hours > 0
    ? `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim()
    : `${mins}m`;

  return {
    pendingCount: pending.length,
    doneCount: done.length,
    totalMinutes,
    formattedTime
  };
}

// Alias for backwards/demo compatibility
export const rescue = planRescue;

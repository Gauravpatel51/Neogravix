import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planRescue, findAvailable, calculateBacklogStats } from './rescuePlanner.js';

describe('rescuePlanner', () => {
  const sampleItems = [
    { id: 1, kind: 'lecture', name: 'Current Electricity — Lecture 05', subject: 'Physics', chapter: 'Current Electricity', num: 5, min: 70, done: false },
    { id: 2, kind: 'lecture', name: 'Current Electricity — Lecture 06', subject: 'Physics', chapter: 'Current Electricity', num: 6, min: 80, done: false },
    { id: 3, kind: 'lecture', name: 'Current Electricity — Lecture 07', subject: 'Physics', chapter: 'Current Electricity', num: 7, min: 75, done: false },
    { id: 4, kind: 'lecture', name: 'Ionic Equilibrium — Lecture 03', subject: 'Chemistry', chapter: 'Ionic Equilibrium', num: 3, min: 65, done: false },
    { id: 5, kind: 'lecture', name: 'Ionic Equilibrium — Lecture 04', subject: 'Chemistry', chapter: 'Ionic Equilibrium', num: 4, min: 80, done: false },
    { id: 6, kind: 'task', name: 'Biological Classification — Revision', type: 'Revision', min: 35, done: false },
    { id: 7, kind: 'task', name: 'Current Electricity — DPP 03', type: 'DPP', min: 40, done: false },
    { id: 8, kind: 'task', name: 'Animal Kingdom — CBT', type: 'CBT', min: 35, done: true },
  ];

  it('findAvailable selects earliest incomplete lecture within each chapter', () => {
    const lectureQueue = [
      { id: 2, kind: 'lecture', chapter: 'Current Electricity', num: 6 },
      { id: 1, kind: 'lecture', chapter: 'Current Electricity', num: 5 }
    ];
    const candidate = findAvailable(lectureQueue, []);
    assert.equal(candidate.id, 1, 'Should pick Lecture 5 before Lecture 6');
  });

  it('findAvailable picks non-lecture tasks without chapter prerequisite check', () => {
    const mixedQueue = [
      { id: 2, kind: 'lecture', chapter: 'Physics', num: 6 },
      { id: 1, kind: 'lecture', chapter: 'Physics', num: 5 },
      { id: 3, kind: 'task', name: 'DPP 01' }
    ];
    const candidate = findAvailable(mixedQueue, []);
    assert.equal(candidate.id, 1);

    const taskFirst = [
      { id: 3, kind: 'task', name: 'DPP 01' },
      { id: 2, kind: 'lecture', chapter: 'Physics', num: 6 }
    ];
    assert.equal(findAvailable(taskFirst, []).id, 3);
  });

  it('respects lecture sequence across scheduled days', () => {
    const result = planRescue({
      items: sampleItems,
      dailyMinutes: 120, // 120 - 30 = 90 min/day
      days: 5,
      keepRegularStudy: true
    });

    const allScheduled = result.planned.flatMap(p => p.items);
    const scheduledLec5Idx = allScheduled.findIndex(x => x.id === 1);
    const scheduledLec6Idx = allScheduled.findIndex(x => x.id === 2);
    const scheduledLec7Idx = allScheduled.findIndex(x => x.id === 3);

    assert.ok(scheduledLec5Idx !== -1, 'Lecture 5 must be scheduled');
    assert.ok(scheduledLec6Idx !== -1, 'Lecture 6 must be scheduled');
    assert.ok(scheduledLec7Idx !== -1, 'Lecture 7 must be scheduled');
    assert.ok(scheduledLec5Idx < scheduledLec6Idx, 'Lecture 5 must come before Lecture 6');
    assert.ok(scheduledLec6Idx < scheduledLec7Idx, 'Lecture 6 must come before Lecture 7');
  });

  it('excludes already completed items from the plan', () => {
    const result = planRescue({
      items: sampleItems,
      dailyMinutes: 120,
      days: 5,
      keepRegularStudy: true
    });

    const allScheduled = result.planned.flatMap(p => p.items);
    const completedItem = allScheduled.find(x => x.id === 8);
    assert.equal(completedItem, undefined, 'Item with done: true should not be scheduled');
  });

  it('respects daily budget and applies carry-forward', () => {
    const twoItems = [
      { id: 101, kind: 'lecture', name: 'L1', chapter: 'A', num: 1, min: 70, done: false },
      { id: 102, kind: 'lecture', name: 'L2', chapter: 'A', num: 2, min: 100, done: false },
    ];

    const result = planRescue({
      items: twoItems,
      dailyMinutes: 120, // 90 cap
      days: 2,
      keepRegularStudy: true
    });

    assert.equal(result.planned.length, 2);
    assert.equal(result.planned[0].used, 70);
    assert.equal(result.planned[0].carry, 20); // 90 - 70 = 20 carry forward
    assert.equal(result.planned[1].used, 100); // 100 fits in 90 + 20 = 110
    assert.equal(result.remaining.length, 0);
  });

  it('splits single large lecture when day is empty and lecture exceeds capacity', () => {
    const largeItem = [
      { id: 201, kind: 'lecture', name: 'Long Lecture', chapter: 'B', num: 1, min: 120, done: false }
    ];

    // Day 1 has 60 min capacity
    const res1 = planRescue({
      items: largeItem,
      dailyMinutes: 90, // cap = 60 min
      days: 1,
      keepRegularStudy: true
    });

    assert.equal(res1.planned[0].items[0].min, 60);
    assert.ok(res1.planned[0].items[0].name.includes('(Part 1)'));
    assert.equal(res1.remaining[0].min, 60);

    // Across 2 days, the second part gets completed on Day 2
    const res2 = planRescue({
      items: largeItem,
      dailyMinutes: 90,
      days: 2,
      keepRegularStudy: true
    });

    assert.equal(res2.planned.length, 2);
    assert.equal(res2.planned[0].items[0].min, 60);
    assert.equal(res2.planned[1].items[0].min, 60);
    assert.equal(res2.remaining.length, 0);
  });

  it('throws error when daily capacity is non-positive', () => {
    assert.throws(() => {
      planRescue({
        items: sampleItems,
        dailyMinutes: 30, // 30 - 30 = 0
        days: 5,
        keepRegularStudy: true
      });
    }, /Daily time must be greater than study reserve/);
  });

  it('calculates backlog statistics correctly', () => {
    const stats = calculateBacklogStats(sampleItems);
    assert.equal(stats.pendingCount, 7);
    assert.equal(stats.doneCount, 1);
    assert.equal(stats.totalMinutes, 445);
    assert.equal(stats.formattedTime, '7h 25m');
  });
});

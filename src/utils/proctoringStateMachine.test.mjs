import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProctoringStateMachine, VIOLATION_TYPES } from './proctoringStateMachine.js';

describe('ProctoringStateMachine', () => {
  const config = {
    MAX_VIOLATIONS: 5,
    GRACE_PERIOD_MS: 8000,
    SUSTAINED_NO_FACE_MS: 3000,
    SUSTAINED_MULTIPLE_FACES_MS: 2000,
    SUSTAINED_LOOKING_AWAY_MS: 3500,
    SUSTAINED_COVERED_LENS_MS: 3000,
    COOLDOWN_MS: 5000,
    YAW_THRESHOLD_DEG: 28,
    PITCH_UP_THRESHOLD_DEG: 22,
    PITCH_DOWN_THRESHOLD_DEG: 25,
    HYSTERESIS_MARGIN: 0.1,
    MIN_FRAME_BRIGHTNESS: 15,
    MIN_FRAME_VARIANCE: 4
  };

  it('ignores suspicious conditions during initial grace period', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(1000); // starts at t=1000ms

    // At t=2000ms (1s in), student has no face in frame
    let res = sm.processFrame({ timestamp: 2000, faceCount: 0 });
    assert.equal(res.status, 'grace_period');
    assert.equal(res.violationType, null);
    assert.equal(res.inGracePeriod, true);

    // At t=6000ms (5s in), still within 8s grace period
    res = sm.processFrame({ timestamp: 6000, faceCount: 0 });
    assert.equal(res.status, 'grace_period');
    assert.equal(res.violationCount, 0);

    // At t=9500ms (grace period elapsed), normal frame
    res = sm.processFrame({ timestamp: 9500, faceCount: 1 });
    assert.equal(res.status, 'normal');
    assert.equal(res.violationCount, 0);
  });

  it('ignores momentary blinks or short glances (< sustained threshold)', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    // After grace period at t=10000ms
    sm.processFrame({ timestamp: 10000, faceCount: 1, headPose: { yaw: 0, pitch: 0 } });

    // Glances away (yaw = 40 deg) at t=10500ms
    let r1 = sm.processFrame({ timestamp: 10500, faceCount: 1, headPose: { yaw: 40, pitch: 0 } });
    assert.equal(r1.status, 'warning');
    assert.equal(r1.activeWarning, VIOLATION_TYPES.LOOKING_AWAY);

    // At t=12000ms (glance lasted 1.5s < 3.5s limit)
    let r2 = sm.processFrame({ timestamp: 12000, faceCount: 1, headPose: { yaw: 40, pitch: 0 } });
    assert.equal(r2.status, 'warning');
    assert.equal(r2.violationType, null);

    // Returns eyes to screen at t=12500ms (normal)
    let r3 = sm.processFrame({ timestamp: 12500, faceCount: 1, headPose: { yaw: 5, pitch: 0 } });
    assert.equal(r3.status, 'normal');
    assert.equal(r3.violationCount, 0);

    // Still 0 violations
    assert.equal(sm.getViolationCount(), 0);
  });

  it('triggers LOOKING_AWAY violation when gaze deflection is sustained >= threshold', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    // Past grace period
    sm.processFrame({ timestamp: 10000, faceCount: 1 });

    // Starts looking away at t=10500ms
    sm.processFrame({ timestamp: 10500, faceCount: 1, headPose: { yaw: 35 } });
    // Still looking away at t=12000ms (1.5s)
    sm.processFrame({ timestamp: 12000, faceCount: 1, headPose: { yaw: 35 } });
    // Still looking away at t=13500ms (3.0s)
    sm.processFrame({ timestamp: 13500, faceCount: 1, headPose: { yaw: 35 } });
    // At t=14000ms (3.5s sustained looking away!)
    const r = sm.processFrame({ timestamp: 14000, faceCount: 1, headPose: { yaw: 35 } });

    assert.equal(r.status, 'violation');
    assert.equal(r.violationType, VIOLATION_TYPES.LOOKING_AWAY);
    assert.equal(r.violationCount, 1);
    assert.equal(r.autoSubmit, false);
  });

  it('triggers NO_FACE violation when student leaves frame for >= 3000ms', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    sm.processFrame({ timestamp: 10000, faceCount: 1 });

    // Student leaves frame at t=11000ms
    sm.processFrame({ timestamp: 11000, faceCount: 0 });
    sm.processFrame({ timestamp: 12500, faceCount: 0 });
    // 3.0s later at t=14000ms
    const r = sm.processFrame({ timestamp: 14000, faceCount: 0 });

    assert.equal(r.status, 'violation');
    assert.equal(r.violationType, VIOLATION_TYPES.NO_FACE);
    assert.equal(r.violationCount, 1);
  });

  it('triggers MULTIPLE_FACES violation when two faces are present for >= 2000ms', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    sm.processFrame({ timestamp: 10000, faceCount: 1 });

    // Second person appears at t=11000ms
    sm.processFrame({ timestamp: 11000, faceCount: 2 });
    sm.processFrame({ timestamp: 12000, faceCount: 2 });
    // 2.0s later at t=13000ms
    const r = sm.processFrame({ timestamp: 13000, faceCount: 2 });

    assert.equal(r.status, 'violation');
    assert.equal(r.violationType, VIOLATION_TYPES.MULTIPLE_FACES);
    assert.equal(r.violationCount, 1);
  });

  it('triggers COVERED_LENS violation when camera is blocked or dark', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    sm.processFrame({ timestamp: 10000, faceCount: 1, brightness: 120, variance: 30 });

    // Lens covered (brightness = 5, variance = 1) at t=11000ms
    sm.processFrame({ timestamp: 11000, faceCount: 0, brightness: 5, variance: 1 });
    sm.processFrame({ timestamp: 12500, faceCount: 0, brightness: 5, variance: 1 });
    // 3.0s later at t=14000ms
    const r = sm.processFrame({ timestamp: 14000, faceCount: 0, brightness: 5, variance: 1 });

    assert.equal(r.status, 'violation');
    assert.equal(r.violationType, VIOLATION_TYPES.COVERED_LENS);
    assert.equal(r.violationCount, 1);
  });

  it('enforces cooldown period after violation before next violation can fire', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    // Violation occurs at t=14000ms
    sm.processFrame({ timestamp: 10000, faceCount: 1 });
    sm.processFrame({ timestamp: 11000, faceCount: 0 });
    sm.processFrame({ timestamp: 14000, faceCount: 0 }); // Fires violation #1
    assert.equal(sm.getViolationCount(), 1);

    // During cooldown (14000ms to 19000ms, cooldown is 5000ms)
    // Even if face is continuously missing at t=16000ms:
    const rCooldown = sm.processFrame({ timestamp: 16000, faceCount: 0 });
    assert.equal(rCooldown.status, 'cooldown');
    assert.equal(rCooldown.violationType, null);
    assert.equal(sm.getViolationCount(), 1);

    // After cooldown expires at t=19500ms:
    sm.processFrame({ timestamp: 19500, faceCount: 0 }); // starts new condition
    // Sustained 3000ms later at t=22500ms:
    const r2 = sm.processFrame({ timestamp: 22500, faceCount: 0 });
    assert.equal(r2.status, 'violation');
    assert.equal(r2.violationCount, 2);
  });

  it('hysteresis prevents flapping near angle boundaries', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    // Threshold is 28 deg. With 0.1 hysteresis margin, exit threshold is 28 * 0.9 = 25.2 deg.
    // 1. Cross threshold into looking away
    sm.processFrame({ timestamp: 10000, faceCount: 1, headPose: { yaw: 29 } });
    assert.equal(sm.isLookingAwayWithHysteresis, true);

    // 2. Drop slightly to 27 deg (below entry 28, but above exit 25.2) -> stays looking away!
    sm.processFrame({ timestamp: 10500, faceCount: 1, headPose: { yaw: 27 } });
    assert.equal(sm.isLookingAwayWithHysteresis, true);

    // 3. Drop clearly below exit threshold to 24 deg -> exits looking away!
    sm.processFrame({ timestamp: 11000, faceCount: 1, headPose: { yaw: 24 } });
    assert.equal(sm.isLookingAwayWithHysteresis, false);
  });

  it('restores violation count on page refresh and auto-submits on 5th violation', () => {
    const sm = new ProctoringStateMachine(config);
    // Student already had 4 violations stored in DB / localStorage
    sm.reset(0, 4);
    assert.equal(sm.getViolationCount(), 4);

    // Fast-forward past grace period
    sm.processFrame({ timestamp: 10000, faceCount: 1 });

    // 5th violation triggered
    sm.processFrame({ timestamp: 11000, faceCount: 0 });
    const r = sm.processFrame({ timestamp: 14000, faceCount: 0 });

    assert.equal(r.status, 'violation');
    assert.equal(r.violationCount, 5);
    assert.equal(r.autoSubmit, true, '5th violation must trigger autoSubmit');
  });

  it('consistently stays normal during normal attentive sitting', () => {
    const sm = new ProctoringStateMachine(config);
    sm.reset(0);

    for (let t = 10000; t <= 50000; t += 500) {
      const r = sm.processFrame({
        timestamp: t,
        faceCount: 1,
        headPose: { yaw: 2, pitch: -3 },
        brightness: 115,
        variance: 35
      });
      assert.equal(r.status, 'normal');
      assert.equal(r.violationCount, 0);
    }
    assert.equal(sm.getViolationCount(), 0);
  });
});

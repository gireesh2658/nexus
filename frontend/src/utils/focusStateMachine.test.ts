import { FocusStateMachine } from './focusStateMachine';

function runFocusStateMachineTests() {
  console.log('=== RUNNING FOCUS STATE MACHINE TESTS ===');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`  ✓ ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      failed++;
    }
  }

  let t = 1000;
  const fsm = new FocusStateMachine({
    awayGracePeriodMs: 2500,
    recoveryWindowMs: 800,
    unavailableTimeoutMs: 6000,
    awayThresholdScore: 50,
    recoveryThresholdScore: 65,
    emaAlpha: 0.3
  }, t);

  // Test 1: Continuous on-screen gaze remains NORMAL
  let res = fsm.processFrame(95, t);
  for (let i = 0; i < 20; i++) {
    t += 100;
    res = fsm.processFrame(95, t);
  }
  assert(res.state === 'NORMAL', 'Continuous on-screen gaze remains NORMAL state');
  assert(res.isLookingAway === false, 'isLookingAway is false during normal gaze');
  assert(res.eventEmitted === null, 'No event emitted during steady normal state');

  // Test 2: Brief 1-second glance away does NOT trigger Focus Lost
  for (let i = 0; i < 10; i++) { // 10 * 100ms = 1000ms (1s)
    t += 100;
    res = fsm.processFrame(20, t);
  }
  assert(res.state === 'CANDIDATE_AWAY', '1-second glance away transitions only to CANDIDATE_AWAY');
  assert(res.isLookingAway === false, '1-second glance away DOES NOT set isLookingAway=true (no warning)');
  assert(res.eventEmitted === null, 'No focus_lost event emitted for 1s glance');

  // Participant looks back after 1 second glance
  for (let i = 0; i < 5; i++) {
    t += 100;
    res = fsm.processFrame(90, t);
  }
  assert(res.state === 'NORMAL', 'Looking back immediately cancels candidate state and restores NORMAL');
  assert(res.isLookingAway === false, 'isLookingAway remains false');

  // Test 3: Sustained gaze away (> 2.5s) triggers CONFIRMED_AWAY and exactly ONE focus_lost event
  let focusLostEventCount = 0;
  for (let i = 0; i < 30; i++) { // 30 * 100ms = 3000ms (3.0s)
    t += 100;
    res = fsm.processFrame(15, t);
    if (res.eventEmitted === 'focus_lost') focusLostEventCount++;
  }
  assert(res.state === 'CONFIRMED_AWAY', 'Sustained gaze away transitions to CONFIRMED_AWAY after 2.5s grace period');
  assert(res.isLookingAway === true, 'isLookingAway becomes true after sustained gaze away');
  assert(focusLostEventCount === 1, 'Exactly one focus_lost event was emitted (no spam)');

  // Test 4: Gaze returns to screen, enters CANDIDATE_RECOVERY and recovers after 800ms
  let focusRegainedEventCount = 0;
  // First 400ms on screen: CANDIDATE_RECOVERY
  for (let i = 0; i < 4; i++) {
    t += 100;
    res = fsm.processFrame(95, t);
    if (res.eventEmitted === 'focus_regained') focusRegainedEventCount++;
  }
  assert(res.state === 'CANDIDATE_RECOVERY', 'Returns to screen enters CANDIDATE_RECOVERY');
  assert(res.isLookingAway === true, 'isLookingAway remains true until recovery window completes');

  // Additional 500ms on screen (total 900ms > 800ms): completes recovery
  for (let i = 0; i < 5; i++) {
    t += 100;
    res = fsm.processFrame(95, t);
    if (res.eventEmitted === 'focus_regained') focusRegainedEventCount++;
  }
  assert(res.state === 'NORMAL', 'Stably looking back for 800ms recovers state to NORMAL');
  assert(res.isLookingAway === false, 'isLookingAway clears automatically to false');
  assert(focusRegainedEventCount === 1, 'Exactly one focus_regained event emitted');

  // Test 5: Temporary face detection drop (500ms) does NOT trigger Focus Lost
  for (let i = 0; i < 5; i++) {
    t += 100;
    res = fsm.processFrame(null, t);
  }
  assert(res.isLookingAway === false, 'Temporary face dropout (500ms) does not trigger Focus Lost');

  // Look back
  for (let i = 0; i < 5; i++) {
    t += 100;
    res = fsm.processFrame(90, t);
  }
  assert(res.state === 'NORMAL', 'Normal state resumed after momentary detector drop');

  // Test 6: Extended camera absence (> 6s) transitions to UNAVAILABLE
  for (let i = 0; i < 65; i++) { // 6500ms
    t += 100;
    res = fsm.processFrame(null, t);
  }
  assert(res.state === 'UNAVAILABLE', 'Extended absence (> 6s) marks state as UNAVAILABLE');
  assert(res.isUnavailable === true, 'isUnavailable is true');
  assert(res.isLookingAway === false, 'isLookingAway is false (camera off is not voluntary look away)');

  // Camera returns
  for (let i = 0; i < 5; i++) {
    t += 100;
    res = fsm.processFrame(90, t);
  }
  // Test 7: Stale or out-of-order detector result does not cause invalid state regression
  const preStaleState = res.state;
  const staleRes = fsm.processFrame(10, t - 2000); // 2 seconds in the past!
  assert(staleRes.state === preStaleState, 'Out-of-order frame timestamp does not cause state regression');
  assert(staleRes.eventEmitted === null, 'Out-of-order frame does not emit spurious events');

  // Test 8: Two independent participants maintain strictly isolated state machines
  const p1_fsm = new FocusStateMachine({}, 5000);
  const p2_fsm = new FocusStateMachine({}, 5000);

  // P1 stays focused, P2 looks away for 3s
  let p1_res = p1_fsm.processFrame(95, 5000);
  let p2_res = p2_fsm.processFrame(15, 5000);
  for (let i = 0; i < 30; i++) {
    const simTime = 5100 + (i * 100);
    p1_res = p1_fsm.processFrame(95, simTime);
    p2_res = p2_fsm.processFrame(15, simTime);
  }
  assert(p1_res.state === 'NORMAL', 'Participant 1 remains in NORMAL state');
  assert(p1_res.isLookingAway === false, 'Participant 1 isLookingAway is false');
  assert(p2_res.state === 'CONFIRMED_AWAY', 'Participant 2 transitions to CONFIRMED_AWAY');
  assert(p2_res.isLookingAway === true, 'Participant 2 isLookingAway is true');

  // Test 9: Score oscillation near threshold (48 <-> 52) does not cause rapid state toggling
  const osc_fsm = new FocusStateMachine({ awayThresholdScore: 50, recoveryThresholdScore: 65 }, 10000);
  osc_fsm.processFrame(90, 10000);
  let oscRes;
  let oscEventCount = 0;
  for (let i = 0; i < 20; i++) {
    const simTime = 10100 + (i * 100);
    const oscScore = (i % 2 === 0) ? 48 : 52;
    oscRes = osc_fsm.processFrame(oscScore, simTime);
    if (oscRes.eventEmitted !== null) oscEventCount++;
  }
  assert(oscEventCount <= 1, 'Near-threshold oscillation does not cause event spam or rapid toggling');

  console.log(`\nTEST RESULTS: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    throw new Error(`FocusStateMachine tests failed: ${failed} failure(s)`);
  }
}

runFocusStateMachineTests();


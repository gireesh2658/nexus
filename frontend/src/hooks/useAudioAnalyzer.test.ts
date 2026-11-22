import {
  calculateRms,
  computeNoiseFloor,
  isSpeakingThreshold,
  calculateRmsAndSpeaking
} from './useAudioAnalyzer';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function runAudioAnalyzerTests() {
  console.log('=== RUNNING AUDIO ANALYZER TESTS ===');
  let passed = 0;

  // Test 1: Pure silence (all 128) -> RMS ~ 0, isSpeaking false
  const silence = new Uint8Array(256).fill(128);
  const silenceRms = calculateRms(silence);
  assert(silenceRms < 0.001, `Expected silence RMS ~ 0, got ${silenceRms}`);
  const silenceResult = calculateRmsAndSpeaking(silence, [0.01]);
  assert(silenceResult.isSpeaking === false, 'Expected silence isSpeaking to be false');
  console.log(`  ✓ Pure silence (all 128) -> RMS = ${silenceRms.toFixed(4)} (~0), isSpeaking = false`);
  passed++;

  // Test 2: 440 Hz synthetic sine wave -> RMS > 0.05, isSpeaking true
  const sampleRate = 44100;
  const sineWave = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 440 * t);
    sineWave[i] = Math.round(128 + sample * 100);
  }
  const sineRms = calculateRms(sineWave);
  assert(sineRms > 0.05, `Expected sine wave RMS > 0.05, got ${sineRms}`);
  const sineResult = calculateRmsAndSpeaking(sineWave, [0.01]);
  assert(sineResult.isSpeaking === true, 'Expected sine wave isSpeaking to be true');
  console.log(`  ✓ 440 Hz synthetic sine wave -> RMS = ${sineRms.toFixed(4)} (> 0.05), isSpeaking = true`);
  passed++;

  // Test 3: computeNoiseFloor caps at 0.01 minimum
  const zeroHistory = [0.0, 0.001, 0.005];
  const floor = computeNoiseFloor(zeroHistory);
  assert(floor === 0.01, 'Expected noise floor minimum of 0.01');
  console.log('  ✓ Noise floor calculation respects 0.01 minimum');
  passed++;

  // Test 4: isSpeakingThreshold requires 2.5x noise floor
  assert(isSpeakingThreshold(0.02, 0.01) === false, '0.02 is not > 2.5 * 0.01');
  assert(isSpeakingThreshold(0.03, 0.01) === true, '0.03 is > 2.5 * 0.01');
  console.log('  ✓ Speaking threshold correctly verifies 2.5x noise floor');
  passed++;

  console.log(`Audio analyzer test suite: ${passed}/${passed} passed.\n`);
  return passed;
}

// Support execution via runner
runAudioAnalyzerTests();

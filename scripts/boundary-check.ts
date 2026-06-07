import { determineResult } from '../src/sillytavern/dice-engine';
import { pickRollForResult, CHEATING_RESULT_TYPES } from '../src/sillytavern/cheating-helpers';
import type { DiceResultType } from '../src/types';

const rngFixed = (v: number) => () => Math.min(0.999999, Math.max(0, v));

// ========== Check 1: failure for target=0 ==========
console.log('=== Check 1: failure interval for target=0 ===');
const r0 = pickRollForResult('failure', 0, false, rngFixed(0));
console.log('pickRollForResult(failure, 0, false, rng=0) ->', r0);
if (r0 !== null) {
  const result = determineResult(r0, 0, false);
  console.log('determineResult(' + r0 + ', 0, false) ->', result);
  console.log('ROUND-TRIP:', result === 'failure' ? 'OK' : 'FAIL');
}
let bad0 = 0;
for (let v = 1; v <= 95; v++) {
  if (determineResult(v, 0, false) !== 'failure') bad0++;
}
console.log(bad0 + ' values in [1,95] for target=0 are NOT failure');

// ========== Check 2: success for target=100 ==========
console.log('\n=== Check 2: success interval for target=100 non-SAN ===');
const r100 = pickRollForResult('success', 100, false, rngFixed(0.999999));
console.log('pickRollForResult(success, 100, false, rng=max) ->', r100);
if (r100 !== null) {
  const result = determineResult(r100, 100, false);
  console.log('determineResult(' + r100 + ', 100, false) ->', result);
  console.log('ROUND-TRIP:', result === 'success' ? 'OK' : 'FAIL');
}
let bad100 = 0;
for (let v = 51; v <= 100; v++) {
  if (determineResult(v, 100, false) !== 'success') {
    bad100++;
    if (v === 100) console.log('  roll=100 -> ' + determineResult(v, 100, false) + ' (cannot be success)');
  }
}
console.log(bad100 + ' values in [51,100] for target=100 non-SAN are NOT success');

// ========== Check 3: all types round-trip for target=0 ==========
console.log('\n=== Check 3: Exhaustive round-trip for target=0 ===');
for (const san of [false, true]) {
  for (const type of CHEATING_RESULT_TYPES) {
    const roll = pickRollForResult(type, 0, san, rngFixed(0));
    if (roll === null) {
      console.log('  target=0 san=' + san + ' ' + type + ': null');
    } else {
      const verify = determineResult(roll, 0, san);
      const ok = verify === type;
      if (!ok) console.log('  target=0 san=' + san + ' ' + type + ': roll=' + roll + ' -> ' + verify + ' (FAIL)');
    }
  }
}

// ========== Check 4: all types round-trip for target=100 ==========
console.log('\n=== Check 4: Exhaustive round-trip for target=100 ===');
for (const san of [false, true]) {
  for (const type of CHEATING_RESULT_TYPES) {
    const roll = pickRollForResult(type, 100, san, rngFixed(0.5));
    if (roll === null) {
      console.log('  target=100 san=' + san + ' ' + type + ': null');
    } else {
      const verify = determineResult(roll, 100, san);
      const ok = verify === type;
      if (!ok) console.log('  target=100 san=' + san + ' ' + type + ': roll=' + roll + ' -> ' + verify + ' (FAIL)');
    }
  }
}

console.log('\nDone.');

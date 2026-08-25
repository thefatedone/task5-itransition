// scripts/verify-helpers.mjs
// Adversarial verification of the pure helpers in GenerationParamsContext.
// Run with: node scripts/verify-helpers.mjs
//
// We re-implement the helpers here (rather than importing the .tsx) because
// the project has no test runner wired up yet — the helpers are small,
// pure, and trivially verifiable.

// ---------- Re-implementation (must match GenerationParamsContext.tsx) ----

const SEED_48BIT_MAX = (1n << 48n) - 1n;
const SEED_48BIT_MOD = 1n << 48n;

function isValidSeedString(s) {
  if (s === '') return false;
  if (!/^[0-9]+$/.test(s)) return false;
  try {
    const n = BigInt(s);
    return n >= 0n && n <= SEED_48BIT_MAX;
  } catch {
    return false;
  }
}

function seedStringToNumber(s) {
  if (!isValidSeedString(s)) {
    throw new Error(`seedStringToNumber: invalid seed string ${JSON.stringify(s)}`);
  }
  return Number(s);
}

function generateRandom48BitSeedString() {
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(buf);
  const value48 = buf[0] % SEED_48BIT_MOD;
  return value48.toString();
}

// ---------- Test runner ---------------------------------------------------

let passed = 0;
let failed = 0;

function check(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

console.log('--- isValidSeedString ---');
check('empty string rejected',       isValidSeedString('') === false);
check('"0" accepted',                isValidSeedString('0') === true);
check('"1" accepted',                isValidSeedString('1') === true);
check('"42" accepted',               isValidSeedString('42') === true);
check('"12345" accepted',            isValidSeedString('12345') === true);
check('"281474976710655" accepted',  isValidSeedString('281474976710655') === true); // 2^48 - 1
check('"281474976710656" rejected',  isValidSeedString('281474976710656') === false); // 2^48
check('"9999999999999999999999" rejected (way > 2^48)',
  isValidSeedString('9999999999999999999999') === false);
check('"-1" rejected',               isValidSeedString('-1') === false);
check('"1.5" rejected',              isValidSeedString('1.5') === false);
check('"abc" rejected',              isValidSeedString('abc') === false);
check('"0x10" rejected',             isValidSeedString('0x10') === false);
check('" 123" rejected (leading space)', isValidSeedString(' 123') === false);
check('"123 " rejected (trailing space)', isValidSeedString('123 ') === false);
check('"1e3" rejected (scientific)', isValidSeedString('1e3') === false);
check('"+1" rejected',              isValidSeedString('+1') === false);
check('"00" accepted',               isValidSeedString('00') === true); // leading zero is fine

console.log();
console.log('--- seedStringToNumber ---');
check('"0" -> 0',                   seedStringToNumber('0') === 0);
check('"42" -> 42',                 seedStringToNumber('42') === 42);
check('"281474976710655" -> exact (no FP loss)',
  seedStringToNumber('281474976710655') === 281474976710655);
check('Number is integer',          Number.isInteger(seedStringToNumber('12345')));
let threw = false;
try { seedStringToNumber('abc'); } catch { threw = true; }
check('invalid throws',             threw);

console.log();
console.log('--- generateRandom48BitSeedString ---');
const samples = [];
for (let i = 0; i < 1000; i++) samples.push(generateRandom48BitSeedString());
const allValid = samples.every(isValidSeedString);
check('1000 random samples all valid', allValid);
const allInts = samples.every((s) => /^[0-9]+$/.test(s));
check('all digits-only',            allInts);
const maxVal = samples.map(BigInt).reduce((m, v) => v > m ? v : m, 0n);
check('max observed value <= 2^48 - 1', maxVal <= SEED_48BIT_MAX, `max=${maxVal}`);
const distinct = new Set(samples).size;
check('1000 samples, all distinct', distinct === 1000, `distinct=${distinct}`);
// Bit-width spot check: 48-bit max as string is 15 chars.
check('2^48-1 string has exactly 15 digits', '281474976710655'.length === 15);

// Distribution sanity: out of 1000 samples, the high bit (value >= 2^47)
const halfThreshold = 1n << 47n;
const highCount = samples.filter((s) => BigInt(s) >= halfThreshold).length;
check('~50% in upper half of 48-bit range',
  highCount > 400 && highCount < 600,
  `highCount=${highCount}`);

console.log();
console.log(`Result: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
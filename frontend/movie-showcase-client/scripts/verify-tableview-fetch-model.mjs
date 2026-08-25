// scripts/verify-tableview-fetch-model.mjs
// Adversarial verification of TableView's effect model.
//
// The component bundles (page, generation) into a single `view` state and
// runs two effects:
//
//   Effect 1 (deps: [ctxGen]): when ctxGen changes from outside, setView
//     to {page: 1, generation: ctxGen}. (Functional setter returns prev
//     when nothing changes, so React bails out without re-rendering.)
//
//   Effect 2 (deps: [view]): when view changes, fire one HTTP fetch.
//
// We simulate React's effect ordering here and assert that the net
// number of fetches across a sequence of state transitions is exactly
// what the spec requires (one fetch per (page, generation) combo).

// ---------- Simulated React-ish runtime -----------------------------------

let ctxGen = 0;
let view = { page: 1, generation: ctxGen };
let fetchCount = 0;
const fetchLog = [];

function setView(updater) {
  const next = typeof updater === 'function' ? updater(view) : updater;
  if (next === view) return; // React bail-out (Object.is same reference)
  view = next;
  runEffects();
}

function setCtxGen(next) {
  if (next === ctxGen) return;
  ctxGen = next;
  runEffects();
}

function runEffects() {
  // Effect 1 body
  setView((prev) =>
    prev.generation === ctxGen ? prev : { page: 1, generation: ctxGen },
  );

  // Effect 2 body (only if a fetch is warranted)
  const key = `${view.page}|${view.generation}`;
  if (fetchLog[fetchLog.length - 1] !== key) {
    fetchLog.push(key);
    fetchCount++;
  }
}

// ---------- Test scenarios -----------------------------------------------

function reset() {
  ctxGen = 0;
  view = { page: 1, generation: ctxGen };
  fetchCount = 0;
  fetchLog.length = 0;
}

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else      { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

// 1. Initial mount: exactly one fetch for (page=1, gen=0).
reset();
runEffects();
check('mount → 1 fetch',                fetchCount === 1, `got ${fetchCount}`);
check('mount → fetch (1, 0)',           fetchLog[0] === '1|0');

// 2. User clicks Next while on page 1: one fetch for (2, 0).
reset();
runEffects();
setView((prev) => ({ ...prev, page: 2 }));
check('Next → 1 fetch',                 fetchCount === 2, `got ${fetchCount}`);
check('Next → fetches (1,0) and (2,0)', fetchLog.join(',') === '1|0,2|0');

// 3. Generation changes from outside while on page 5: page resets to 1
//    and ONE fetch is issued for (1, newGen).
reset();
runEffects();
setView((prev) => ({ ...prev, page: 5 }));
setCtxGen(1); // simulate context generation bump
check('gen change on page 5 → 1 new fetch', fetchCount === 3, `got ${fetchCount} log=${fetchLog.join(',')}`);
check('last fetch is (1, 1)',           fetchLog[fetchLog.length - 1] === '1|1');

// 4. Generation changes when page is ALREADY 1: one fetch for (1, newGen).
reset();
runEffects();
setCtxGen(1);
check('gen change on page 1 → 1 new fetch', fetchCount === 2, `got ${fetchCount}`);
check('fetches are (1,0) and (1,1)',    fetchLog.join(',') === '1|0,1|1');

// 5. Rapid generation bumps (simulating rapid slider drag → debounced
//    generation increments). Each should produce a fetch for page 1.
reset();
runEffects();
for (let g = 1; g <= 5; g++) setCtxGen(g);
check('5 rapid gen bumps → 5 new fetches',
  fetchCount === 6, // mount + 5 bumps
  `got ${fetchCount}`);
check('last 5 fetches are (1, 1..5)',   fetchLog.slice(1).join(',') === '1|1,1|2,1|3,1|4,1|5');

// 6. User on page 4, gen bumps, then user clicks Next → page 5 with newGen.
reset();
runEffects();
setView((prev) => ({ ...prev, page: 4 }));
const afterGenBump = fetchCount;
setCtxGen(1);
const afterGenFetch = fetchCount;
setView((prev) => ({ ...prev, page: 5 }));
check('gen bump adds 1 fetch',
  afterGenFetch === afterGenBump + 1,
  `before=${afterGenBump}, after=${afterGenFetch}`);
check('Next after gen bump adds 1 fetch',
  fetchCount === afterGenFetch + 1,
  `after=${fetchCount}`);
check('final fetch is (5, 1)', fetchLog[fetchLog.length - 1] === '5|1');

// 7. Same value re-set (e.g. user types same seed): no fetch.
reset();
runEffects();
setCtxGen(0); // same value
check('idempotent ctxGen set → no fetch', fetchCount === 1, `got ${fetchCount}`);

// 8. setView with same reference (React bail-out): no fetch.
reset();
runEffects();
setView((prev) => prev); // explicit "no change"
check('setView no-op → no fetch', fetchCount === 1, `got ${fetchCount}`);

console.log();
console.log(`Result: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
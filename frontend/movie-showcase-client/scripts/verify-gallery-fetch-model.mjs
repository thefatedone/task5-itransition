// scripts/verify-gallery-fetch-model.mjs
// Adversarial verification of GalleryView's effect + fetch model.
//
// The component runs:
//
//   Effect 1 (deps: [ctxGen]): on mount and on every ctxGen change,
//     cancel any in-flight fetch (via shared AbortController), create
//     a new controller, scroll the container to top, clear all loaded
//     movies, and fire one batch-0 fetch with the new params.
//
//   loadNextBatch (called from the IntersectionObserver): if not
//     loading AND hasNextBatch is true, fetch the next batch using the
//     shared controller. If the response is stale (controller !== the
//     current one in abortRef), silently discard it.
//
//   Effect 2 (deps: []): attach an IntersectionObserver once. The
//     observer callback reads `loadingRef.current` (and
//     `hasNextBatchRef.current`) to enforce single-flight + end-of-
//     catalog guards.
//
// We simulate that whole flow here and assert the spec:
//   - exactly one batch-0 fetch on mount
//   - exactly one batch-0 fetch per ctxGen change (older in-flight
//     responses are discarded, not double-applied)
//   - loadNextBatch fetches `nextBatchIndex`, then increments it
//   - overlapping loadNextBatch calls are coalesced (only one fetch
//     while loading)
//   - response with controller !== currentAbortRef is dropped

// ---------- Simulated runtime --------------------------------------------

let ctxGen = 0;

// Single shared abort slot — every fetch captures the controller that's
// currently in this slot, and bails out of its .then if the slot has
// since moved on (the race-safety pattern used in the real component).
const abortRef = { controller: null };

// A FIFO queue of pending responses. Each push corresponds to one
// in-flight fetch; resolveAllPending() applies them in order, applying
// each one's "stale?" check before mutating state.
const pendingQueue = [];

let movies = [];
let nextBatchIndex = 0;
let loading = true;            // initial fetch is in flight on mount
let hasNextBatch = true;

// Refs that the observer reads (kept in sync with the variables below on
// every state change so we model the "loadNextBatch reads the latest
// values" behaviour).
const loadingRef = { current: loading };
const hasNextBatchRef = { current: hasNextBatch };
const nextBatchIndexRef = { current: nextBatchIndex };

const fetchLog = []; // ordered list of every fetch that was *issued*

function makeController(id) {
  return { id, signal: { aborted: false }, abort() { this.signal.aborted = true; } };
}

function produceBatch(batchIndex, opts = {}) {
  return {
    movies: [
      { sequenceIndex: batchIndex * 3 + 1, title: `m${batchIndex * 3 + 1}` },
      { sequenceIndex: batchIndex * 3 + 2, title: `m${batchIndex * 3 + 2}` },
      { sequenceIndex: batchIndex * 3 + 3, title: `m${batchIndex * 3 + 3}` },
    ],
    hasNextBatch: opts.finalBatch ? false : true,
  };
}

// Effect 1 (reset + initial fetch).
//
// Mirrors the real GalleryView: abort the previous controller, install
// a new one, clear local state, fire a batch-0 fetch with the new
// controller's signal. The "response" is queued, not applied — see
// resolveAllPending() below.
function runResetEffect() {
  if (abortRef.controller) abortRef.controller.abort();
  const controller = makeController(fetchLog.length + 1);
  abortRef.controller = controller;

  movies = [];
  nextBatchIndex = 0;
  loading = true;
  hasNextBatch = true;
  loadingRef.current = true;
  hasNextBatchRef.current = true;
  nextBatchIndexRef.current = 0;

  fetchLog.push({ kind: 'reset-batch0', batchIndex: 0, controllerId: controller.id });

  const res = produceBatch(0);
  pendingQueue.push((apply) => {
    if (controller !== abortRef.controller) return; // stale
    apply({
        movies: res.movies,
        nextBatchIndex: 1,
        hasNextBatch: res.hasNextBatch,
      });
  });
}

// loadNextBatch — only fires if not loading and has next batch.
// Mirrors the real component's single-flight + end-of-catalog guards.
function loadNextBatch(opts = {}) {
  if (loadingRef.current) return;
  if (!hasNextBatchRef.current) return;

  const controller = abortRef.controller;
  if (!controller || controller.signal.aborted) return;

  const batchIndex = nextBatchIndexRef.current;
  loading = true;
  loadingRef.current = true;
  fetchLog.push({ kind: 'load-next', batchIndex, controllerId: controller.id });

  const res = produceBatch(batchIndex, opts);
  pendingQueue.push((apply) => {
    if (controller !== abortRef.controller) return; // stale
    apply({
      movies: movies.concat(res.movies),
      nextBatchIndex: batchIndex + 1,
      hasNextBatch: res.hasNextBatch,
    });
  });
}

// Resolve every queued response, in order. Each callback runs the
// "stale?" check before applying its state mutation.
function resolveAllPending() {
  const queue = pendingQueue.splice(0);
  for (const cb of queue) {
    cb((partial) => {
      movies = partial.movies;
      nextBatchIndex = partial.nextBatchIndex;
      hasNextBatch = partial.hasNextBatch;
      loading = false;
      loadingRef.current = false;
      hasNextBatchRef.current = hasNextBatch;
      nextBatchIndexRef.current = nextBatchIndex;
    });
  }
}

// IntersectionObserver callback simulation — calls loadNextBatch.
// `opts` is forwarded so tests can simulate "this batch is the last
// one" by passing `{finalBatch: true}`, mirroring the server's
// `hasNextBatch: false` response.
function observerFires(opts = {}) {
  loadNextBatch(opts);
}

// ---------- Test scenarios -----------------------------------------------

function reset() {
  ctxGen = 0;
  abortRef.controller = null;
  pendingQueue.length = 0;
  movies = [];
  nextBatchIndex = 0;
  loading = true;
  hasNextBatch = true;
  loadingRef.current = true;
  hasNextBatchRef.current = true;
  nextBatchIndexRef.current = 0;
  fetchLog.length = 0;
}

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else      { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

// 1. Initial mount: exactly one fetch (batch 0).
reset();
runResetEffect();
resolveAllPending();
check('mount → 1 fetch',                      fetchLog.length === 1);
check('mount → fetch is reset-batch0',        fetchLog[0].kind === 'reset-batch0');
check('mount → fetch batchIndex 0',           fetchLog[0].batchIndex === 0);
check('mount → loading flipped false',        loading === false);
check('mount → movies has 3 entries',         movies.length === 3);
check('mount → nextBatchIndex = 1',           nextBatchIndex === 1);

// 2. User scrolls: observer fires, loads batch 1.
reset();
runResetEffect();
resolveAllPending();
observerFires();
resolveAllPending();
check('1 scroll → 2nd fetch',                 fetchLog.length === 2);
check('1 scroll → fetch is load-next',        fetchLog[1].kind === 'load-next');
check('1 scroll → fetch batchIndex 1',        fetchLog[1].batchIndex === 1);
check('1 scroll → movies has 6 entries',      movies.length === 6);
check('1 scroll → nextBatchIndex = 2',        nextBatchIndex === 2);

// 3. Multiple rapid scrolls while loading: only one fetch.
reset();
runResetEffect();
resolveAllPending();
observerFires();         // starts a fetch (loading=true)
// Sentinel still intersecting → observer fires again, but loading=true.
observerFires();
observerFires();
check('3 rapid scrolls → exactly 2 fetches (mount + 1 load)',
  fetchLog.length === 2,
  `got ${fetchLog.length}, log=${fetchLog.map(f => f.kind).join(',')}`);

// 4. ctxGen change while a fetch is in flight: older fetch is
//    discarded, new batch-0 fetch is fired.
reset();
runResetEffect();
const oldController = abortRef.controller;
observerFires();          // suppressed by loading=true (initial fetch in flight)
check('scroll during initial load → suppressed', fetchLog.length === 1);
ctxGen = 1;
runResetEffect();         // bumps ctxGen → runs reset effect
check('ctxGen bump → 2nd fetch issued',       fetchLog.length === 2);
check('ctxGen bump → 2nd fetch is reset-batch0', fetchLog[1].kind === 'reset-batch0');
check('old controller was aborted',           oldController.signal.aborted === true);
resolveAllPending();      // drain everything, applying stale-checks
check('after resolve → movies has 3 (initial batch only)',
  movies.length === 3, `got ${movies.length}`);

// 5. Resolve a stale fetch (controller !== current) — should be dropped.
//    Construct it manually to force the race.
reset();
runResetEffect();
const staleController = abortRef.controller;
const staleResponse = produceBatch(7);
staleController.response = staleResponse;
ctxGen = 1;
runResetEffect();         // installs a new controller; old is aborted
// Manually queue the stale response to confirm it is dropped.
pendingQueue.push((apply) => {
  if (staleController !== abortRef.controller) return; // stale
  apply({ movies: staleResponse.movies, nextBatchIndex: 99, hasNextBatch: true });
});
resolveAllPending();
check('stale response (controller mismatch) → discarded', movies.length === 3);

// 6. Load to end of catalog, then one more scroll → no fetch.
reset();
runResetEffect();
resolveAllPending();
observerFires();                 // batch 1
resolveAllPending();
observerFires({ finalBatch: true }); // batch 2 (hasNextBatch=false)
resolveAllPending();
observerFires();                 // suppressed (hasNextBatch=false)
observerFires();                 // suppressed (hasNextBatch=false)
check('exhausted catalog → fetches stop (mount + 2 appends)',
  fetchLog.length === 3, `got ${fetchLog.length}`);
check('exhausted catalog → hasNextBatch=false', hasNextBatch === false);

// 7. ctxGen bump while loadNextBatch in flight: previous response
//    discarded, new reset fires.
reset();
runResetEffect();
resolveAllPending();
observerFires();             // batch 1 in flight (loading=true)
ctxGen = 2;
runResetEffect();            // installs new controller, aborts old
check('ctxGen bump during loadNextBatch → reset issued', fetchLog.length === 3);
check('latest fetch is reset-batch0 (idx 2)', fetchLog[2].kind === 'reset-batch0');
resolveAllPending();         // batch 1's response is stale → dropped; reset batch 0 applied
check('after resolve → only reset batch 0 applied (3 movies, idx 1)',
  movies.length === 3 && nextBatchIndex === 1,
  `movies=${movies.length}, nextBatchIndex=${nextBatchIndex}`);

// 8. After reset, observer fires loadNextBatch: must fetch the NEW
//    batchIndex (post-reset, which is 1, not the pre-reset value).
reset();
runResetEffect();
resolveAllPending();
observerFires();             // batch 1 in flight
resolveAllPending();
ctxGen = 1;
runResetEffect();            // reset: clears, nextBatchIndex=0, batch 0 fetched
resolveAllPending();
observerFires();             // load-next for batchIndex=1 (post-reset)
check('post-reset observer → fetch batchIndex 1',
  fetchLog[fetchLog.length - 1].batchIndex === 1);

console.log();
console.log(`Result: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
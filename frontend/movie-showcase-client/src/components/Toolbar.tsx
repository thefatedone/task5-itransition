import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import {
  useGenerationParams,
  LIKES_REVIEWS_MAX,
  LIKES_REVIEWS_MIN,
} from '../state/GenerationParamsContext';
import { fetchAvailableLocales } from '../api/movies';
import type { LocaleInfo } from '../types/movie';

/** Debounce window for the seed text input. */
const SEED_DEBOUNCE_MS = 300;

export default function Toolbar() {
  const {
    state,
    setLocale,
    setSeed,
    setLikesAvg,
    setReviewsAvg,
    randomizeSeed,
  } = useGenerationParams();

  const [locales, setLocales] = useState<LocaleInfo[] | null>(null);
  const [seedDraft, setSeedDraft] = useState<string>(state.seed);

  // Tracks the most recent committed seed we've already mirrored into the
  // visible input. Used to distinguish "external" seed changes (e.g. from
  // the randomize button) from "the user is typing" — the former should
  // overwrite the input, the latter should not.
  const lastCommittedSeedRef = useRef<string>(state.seed);

  // Pending debounce timer. Cleared on each new keystroke and whenever the
  // committed seed changes externally (so a stale timer can't clobber a
  // freshly randomized value).
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ----- Fetch available locales on mount ------------------------------
  useEffect(() => {
    let cancelled = false;
    fetchAvailableLocales()
      .then((res) => {
        if (cancelled) return;
        setLocales(res.locales);
        // Default selection: the first locale the API exposes. The reducer
        // short-circuits if it's already the current value, so this is
        // safe even when the fallback locale happens to be the same.
        const first = res.locales[0];
        if (first) setLocale(first.code);
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[Toolbar] failed to fetch locales:', err);
      });
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount. setLocale is stable (useCallback
    // with []), so omitting it from deps doesn't risk a stale closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Sync draft → committed seed (and vice versa) ------------------
  // When state.seed changes for reasons other than the user typing
  // (randomize, future reset-to-default), copy it into the input and
  // cancel any in-flight debounce so the random value can't be overwritten
  // by a stale keystroke that just hadn't fired yet.
  useEffect(() => {
    if (state.seed !== lastCommittedSeedRef.current) {
      lastCommittedSeedRef.current = state.seed;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setSeedDraft(state.seed);
    }
  }, [state.seed]);

  // ----- Cleanup pending debounce on unmount ---------------------------
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  // ----- Handlers ------------------------------------------------------
  const handleSeedDraftChange = useCallback(
    (value: string) => {
      setSeedDraft(value);
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        // setSeed is the only path into the reducer; invalid values
        // (empty, non-digit, out-of-range) are silently rejected there,
        // so we don't need to pre-validate here.
        setSeed(value);
      }, SEED_DEBOUNCE_MS);
    },
    [setSeed],
  );

  const handleLocaleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => setLocale(e.target.value),
    [setLocale],
  );

  const handleLikesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setLikesAvg(parseFloat(e.target.value)),
    [setLikesAvg],
  );

  const handleReviewsChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) =>
      setReviewsAvg(parseFloat(e.target.value)),
    [setReviewsAvg],
  );

  // Whether the currently-committed locale is in the fetched list. The
  // select would otherwise silently coerce to the first option on render,
  // masking the fact that the user's previous choice is no longer valid.
  const localeIsKnown =
    locales !== null && locales.some((l) => l.code === state.locale);

  return (
    <div className="toolbar" role="toolbar" aria-label="Generation parameters">
      <div className="toolbar-group toolbar-group--locale">
        <label htmlFor="locale-select">Language</label>
        <select
          id="locale-select"
          value={state.locale}
          onChange={handleLocaleChange}
          disabled={locales === null}
        >
          {locales === null ? (
            <option value={state.locale}>Loading…</option>
          ) : (
            <>
              {!localeIsKnown && (
                <option value={state.locale}>{state.locale}</option>
              )}
              {locales.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.displayName} ({l.code})
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      <div className="toolbar-group toolbar-group--seed">
        <label htmlFor="seed-input">Seed</label>
        <input
          id="seed-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          spellCheck={false}
          value={seedDraft}
          onChange={(e) => handleSeedDraftChange(e.target.value)}
          aria-label="Seed (non-negative integer, up to 48 bits)"
          title="Non-negative integer, up to 281474976710655"
        />
        <button
          id="randomize-seed"
          type="button"
          onClick={randomizeSeed}
          title="Generate a new random 48-bit seed"
        >
          🎲 Randomize
        </button>
      </div>

      <div className="toolbar-group toolbar-group--likes">
        <label htmlFor="likes-input">
          Likes / movie:{' '}
          <strong className="toolbar-value">{state.likesAvg.toFixed(1)}</strong>
        </label>
        <input
          id="likes-input"
          type="range"
          min={LIKES_REVIEWS_MIN}
          max={LIKES_REVIEWS_MAX}
          step={0.1}
          value={state.likesAvg}
          onChange={handleLikesChange}
        />
      </div>

      <div className="toolbar-group toolbar-group--reviews">
        <label htmlFor="reviews-input">
          Reviews / movie:{' '}
          <strong className="toolbar-value">{state.reviewsAvg.toFixed(1)}</strong>
        </label>
        <input
          id="reviews-input"
          type="range"
          min={LIKES_REVIEWS_MIN}
          max={LIKES_REVIEWS_MAX}
          step={0.1}
          value={state.reviewsAvg}
          onChange={handleReviewsChange}
        />
      </div>
    </div>
  );
}
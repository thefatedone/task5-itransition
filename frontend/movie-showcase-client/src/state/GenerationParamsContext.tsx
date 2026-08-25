import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';

// ============================================================================
// Types
// ============================================================================

/**
 * The single source of truth for "what does the user want the server to
 * generate right now". Every value is the bare minimum the API endpoints
 * (/api/movies/table, /api/movies/gallery) need — they were designed to be
 * driven by these exact knobs.
 *
 * The four mutable knobs (locale, seed, likesAvg, reviewsAvg) are
 * deliberately orthogonal on the server side: changing likesAvg never
 * changes titles/actors/genres, because everything is deterministically
 * derived from a single seeded `Random` instance in a fixed call order.
 * The frontend's job is therefore just to forward the latest values to the
 * API on every relevant fetch — no client-side caching that could break
 * the cross-knob independence.
 */
export interface GenerationParamsState {
  /** IETF language tag (e.g. "en-US"). Drives /Locales selection. */
  locale: string;

  /**
   * User seed as a decimal string. We store it as a string because:
   *   - the user is allowed to type up to 48-bit values
   *     (max 281_474_976_710_655), and keeping the canonical decimal form
   *     around avoids any chance of a floating-point round-trip changing
   *     the digits the user sees in the input field;
   *   - the seed is parsed to a `Number` (or `BigInt` if we ever go past
   *     2^53) at the API call boundary only, never inside this context.
   *
   * Invariant: when this is set, it has already passed `isValidSeedString`,
   * so it is always a non-negative decimal integer in [0, 2^48 - 1].
   */
  seed: string;

  /** Mean likes per movie, in [0, 10]. One decimal. */
  likesAvg: number;

  /** Mean reviews per movie, in [0, 10]. One decimal. */
  reviewsAvg: number;

  /**
   * Monotonically-increasing version counter. Incremented on every
   * committed change to `locale`, `seed`, `likesAvg`, or `reviewsAvg`.
   * Consumers (Table view, Gallery view) watch this number and reset
   * their local state when it changes — Table resets to page 1, Gallery
   * scrolls back to its initial position.
   *
   * NOT incremented for rejected updates (invalid seed string, value
   * unchanged, etc.) — only for changes that actually took effect.
   */
  generation: number;
}

/** All actions a reducer understands. */
export type GenerationParamsAction =
  | { type: 'SET_LOCALE'; locale: string }
  | { type: 'SET_SEED'; seed: string }
  | { type: 'SET_LIKES_AVG'; likesAvg: number }
  | { type: 'SET_REVIEWS_AVG'; reviewsAvg: number }
  | { type: 'RANDOMIZE_SEED' };

/** Shape returned by `useGenerationParams()` — state + action dispatchers. */
export interface GenerationParamsApi {
  state: GenerationParamsState;
  setLocale: (locale: string) => void;
  setSeed: (seed: string) => void;
  setLikesAvg: (likesAvg: number) => void;
  setReviewsAvg: (reviewsAvg: number) => void;
  randomizeSeed: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Fallback locale used before /api/locales has resolved. */
export const DEFAULT_FALLBACK_LOCALE = 'en-US';
export const DEFAULT_LIKES_AVG = 3.5;
export const DEFAULT_REVIEWS_AVG = 2.0;
export const DEFAULT_SEED = '0';
export const LIKES_REVIEWS_MIN = 0;
export const LIKES_REVIEWS_MAX = 10;

/** 2^48 - 1 = 281_474_976_710_655. The largest seed value we accept. */
export const SEED_48BIT_MAX = (1n << 48n) - 1n;
/** 2^48, used as an exclusive upper bound for random draws. */
export const SEED_48BIT_MOD = 1n << 48n;

// ============================================================================
// Pure helpers (exported for tests and for the API call boundary)
// ============================================================================

/**
 * True iff `s` is a non-negative decimal integer string in [0, 2^48 - 1].
 * Empty strings, negative numbers, fractional values, hex, scientific
 * notation, and anything beyond 48 bits are all rejected.
 */
export function isValidSeedString(s: string): boolean {
  if (s === '') return false;
  // Cheap pre-check: only ASCII digits.
  if (!/^[0-9]+$/.test(s)) return false;
  try {
    const n = BigInt(s);
    return n >= 0n && n <= SEED_48BIT_MAX;
  } catch {
    // BigInt() should never throw on a digit-only string of any length,
    // but guarding against a 1MB string anyway.
    return false;
  }
}

/**
 * Convert a validated seed string into a JS `Number` for the API call
 * boundary. All valid 48-bit seeds fit comfortably inside
 * `Number.MAX_SAFE_INTEGER` (2^53 - 1), so this round-trip is exact.
 *
 * Throws if `s` is not a valid seed string — callers should validate with
 * `isValidSeedString` first, or just let `setSeed` do the validation.
 */
export function seedStringToNumber(s: string): number {
  if (!isValidSeedString(s)) {
    throw new Error(
      `seedStringToNumber: invalid seed string ${JSON.stringify(s)}`,
    );
  }
  return Number(s);
}

/**
 * Cryptographically-uniform 48-bit non-negative integer, returned as a
 * decimal string. We use one 64-bit CSPRNG draw masked to 48 bits rather
 * than `Math.floor(Math.random() * 2^48)` because:
 *   - `crypto.getRandomValues` is the standard, browser-supported
 *     uniform random source;
 *   - using BigUint64 + a bitmask keeps the result *exactly* 48 bits wide,
 *     with no FP round-trip anywhere;
 *   - the output is independent of the user's typed seed, so clicking
 *     "Randomize" never echoes the value currently in the input.
 */
export function generateRandom48BitSeedString(): string {
  const buf = new BigUint64Array(1);
  crypto.getRandomValues(buf);
  const value48 = buf[0] % SEED_48BIT_MOD; // exact, uniform over [0, 2^48)
  return value48.toString();
}

/** Clamp any number into [LIKES_REVIEWS_MIN, LIKES_REVIEWS_MAX]. */
function clampLikesOrReviews(n: number): number {
  if (!Number.isFinite(n)) return LIKES_REVIEWS_MIN;
  return Math.max(LIKES_REVIEWS_MIN, Math.min(LIKES_REVIEWS_MAX, n));
}

// ============================================================================
// Reducer
// ============================================================================

function makeInitialState(initialLocale?: string): GenerationParamsState {
  return {
    locale: initialLocale ?? DEFAULT_FALLBACK_LOCALE,
    seed: DEFAULT_SEED,
    likesAvg: DEFAULT_LIKES_AVG,
    reviewsAvg: DEFAULT_REVIEWS_AVG,
    generation: 0,
  };
}

/**
 * Pure reducer. Every successful mutation increments `generation`; every
 * no-op (invalid value, identical value) returns the same state reference
 * so React's referential equality short-circuits re-renders downstream.
 */
function reducer(
  state: GenerationParamsState,
  action: GenerationParamsAction,
): GenerationParamsState {
  switch (action.type) {
    case 'SET_LOCALE': {
      if (action.locale === state.locale) return state;
      return {
        ...state,
        locale: action.locale,
        generation: state.generation + 1,
      };
    }

    case 'SET_SEED': {
      if (!isValidSeedString(action.seed)) return state;
      if (action.seed === state.seed) return state;
      return {
        ...state,
        seed: action.seed,
        generation: state.generation + 1,
      };
    }

    case 'SET_LIKES_AVG': {
      const clamped = clampLikesOrReviews(action.likesAvg);
      if (clamped === state.likesAvg) return state;
      return {
        ...state,
        likesAvg: clamped,
        generation: state.generation + 1,
      };
    }

    case 'SET_REVIEWS_AVG': {
      const clamped = clampLikesOrReviews(action.reviewsAvg);
      if (clamped === state.reviewsAvg) return state;
      return {
        ...state,
        reviewsAvg: clamped,
        generation: state.generation + 1,
      };
    }

    case 'RANDOMIZE_SEED': {
      const newSeed = generateRandom48BitSeedString();
      // Astronomically unlikely with 48 bits of entropy, but stay safe.
      if (newSeed === state.seed) return state;
      return {
        ...state,
        seed: newSeed,
        generation: state.generation + 1,
      };
    }
  }

  // Fallthrough for future, unhandled action types: keep current state.
  return state;
}

// ============================================================================
// Context + Provider + custom hook
// ============================================================================

const GenerationParamsContext = createContext<GenerationParamsApi | null>(null);

export interface GenerationParamsProviderProps {
  children: ReactNode;
  /**
   * Optional pre-known initial locale (e.g. server-rendered, or restored
   * from localStorage in a future iteration). Defaults to
   * `DEFAULT_FALLBACK_LOCALE` ("en-US") if absent.
   */
  initialLocale?: string;
}

export function GenerationParamsProvider({
  children,
  initialLocale,
}: GenerationParamsProviderProps) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => makeInitialState(initialLocale),
  );

  // All dispatchers are stable across renders because React's `dispatch`
  // from useReducer is referentially stable.
  const setLocale = useCallback(
    (locale: string) => dispatch({ type: 'SET_LOCALE', locale }),
    [],
  );
  const setSeed = useCallback(
    (seed: string) => dispatch({ type: 'SET_SEED', seed }),
    [],
  );
  const setLikesAvg = useCallback(
    (likesAvg: number) => dispatch({ type: 'SET_LIKES_AVG', likesAvg }),
    [],
  );
  const setReviewsAvg = useCallback(
    (reviewsAvg: number) => dispatch({ type: 'SET_REVIEWS_AVG', reviewsAvg }),
    [],
  );
  const randomizeSeed = useCallback(
    () => dispatch({ type: 'RANDOMIZE_SEED' }),
    [],
  );

  // The `value` object identity changes only when `state` changes — that's
  // fine, because any consumer reading `state` would re-render anyway.
  const value = useMemo<GenerationParamsApi>(
    () => ({
      state,
      setLocale,
      setSeed,
      setLikesAvg,
      setReviewsAvg,
      randomizeSeed,
    }),
    [state, setLocale, setSeed, setLikesAvg, setReviewsAvg, randomizeSeed],
  );

  return (
    <GenerationParamsContext.Provider value={value}>
      {children}
    </GenerationParamsContext.Provider>
  );
}

/**
 * Consume the GenerationParams context. Throws if used outside of a
 * `<GenerationParamsProvider>` so wiring mistakes fail loudly.
 */
export function useGenerationParams(): GenerationParamsApi {
  const ctx = useContext(GenerationParamsContext);
  if (!ctx) {
    throw new Error(
      'useGenerationParams() must be used inside <GenerationParamsProvider>',
    );
  }
  return ctx;
}
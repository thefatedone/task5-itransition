import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useGenerationParams,
  seedStringToNumber,
} from '../state/GenerationParamsContext';
import { fetchGalleryBatch } from '../api/movies';
import type { Movie } from '../types/movie';
import TrailerFreezeFrame from './TrailerFreezeFrame';
import TrailerPlayButton from './TrailerPlayButton';

/** Fixed batch size for now; later we may expose this in the toolbar. */
const BATCH_SIZE = 12;

/**
 * Infinite-scroll Gallery view of the catalog.
 *
 * - On mount, fetches batch 0 with the current default parameters.
 * - Whenever the context `generation` counter changes, the view resets:
 *   scroll container back to top, all loaded movies cleared, and batch 0
 *   re-fetched with the new parameters.
 * - As the user scrolls down, an IntersectionObserver attached to a
 *   sentinel <div> at the bottom of the grid detects when more content
 *   is needed and loads the next batch. Batches are appended to a flat
 *   `movies` array.
 * - Only one card is expanded at a time (mirrors TableView's behaviour).
 *   Cards share the trailer freeze frame and play button sub-components
 *   from `./TrailerSubComponents`.
 *
 * Race-safety strategy:
 *   Each effect run (one per `ctxGen` change) creates its own
 *   AbortController and stores it in `abortRef.current`. When a newer
 *   run starts, it calls `abortRef.current?.abort()` first, which
 *   cancels the in-flight fetch from the previous run. Inside every
 *   `.then` / `.catch` we compare the captured controller against
 *   `abortRef.current` — if they don't match, the response is stale and
 *   we silently discard it. This is the cleanest way to handle "stale
 *   response" races without version counters or timer IDs.
 *
 * Single-flight strategy:
 *   `loadNextBatch` reads `loadingRef.current` and bails out if a fetch
 *   is already in flight. The IntersectionObserver may fire any number
 *   of times; only the first event after `loading` flips back to false
 *   actually triggers a new request.
 */
export default function GalleryView() {
  const { state } = useGenerationParams();
  const ctxGen = state.generation;

  // ---- Refs ----
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Shared abort controller — see class-level docstring above.
  const abortRef = useRef<AbortController | null>(null);

  // ---- Local state ----
  const [movies, setMovies] = useState<Movie[]>([]);
  // Index of the NEXT batch we intend to fetch. Starts at 0; becomes 1
  // after batch 0 resolves, 2 after batch 1, etc.
  const [nextBatchIndex, setNextBatchIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasNextBatch, setHasNextBatch] = useState<boolean>(true);
  // Single expanded card, keyed by global sequenceIndex (unique across
  // all batches). Reset on every ctxGen change.
  const [expandedSequenceIndex, setExpandedSequenceIndex] = useState<number | null>(null);

  // Refs so the IntersectionObserver (attached once with []) can read
  // the latest values without forcing a re-attach.
  const loadingRef = useRef(loading);
  const hasNextBatchRef = useRef(hasNextBatch);
  const nextBatchIndexRef = useRef(nextBatchIndex);
  loadingRef.current = loading;
  hasNextBatchRef.current = hasNextBatch;
  nextBatchIndexRef.current = nextBatchIndex;

  // ---- Reset effect: clear and fetch batch 0 on mount + ctxGen change.
  //
  // Same pattern as TableView: deps [ctxGen]. Any param change bumps
  // ctxGen (per context contract), so a change in locale/seed/likesAvg/
  // reviewsAvg triggers exactly one reset effect run.
  useEffect(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }

    setMovies([]);
    setNextBatchIndex(0);
    setError(null);
    setHasNextBatch(true);
    setExpandedSequenceIndex(null);
    setLoading(true);

    fetchGalleryBatch({
      locale:     state.locale,
      seed:       seedStringToNumber(state.seed),
      likesAvg:   state.likesAvg,
      reviewsAvg: state.reviewsAvg,
      batchIndex: 0,
      batchSize:  BATCH_SIZE,
    }, controller.signal)
      .then((res) => {
        if (controller !== abortRef.current) return; // stale, newer run superseded us
        setMovies(res.movies);
        setNextBatchIndex(1);
        setHasNextBatch(res.hasNextBatch);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller !== abortRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxGen]);

  // ---- loadNextBatch: fetch the next batch and append.
  //
  // Declared as a plain function (NOT useCallback'd) — its identity
  // changes on every render, which is fine because the observer below
  // reads it through a ref. The observer itself is attached once with
  // empty deps so we don't suffer "re-attach on every render" churn.
  //
  // Reads latest state via refs so it always uses the values current
  // at call time (not the values current at observer-attach time).
  const loadNextBatch = () => {
    if (loadingRef.current) return;          // single-flight guard
    if (!hasNextBatchRef.current) return;   // catalog exhausted

    const controller = abortRef.current;
    if (!controller || controller.signal.aborted) return;

    const batchIndex = nextBatchIndexRef.current;
    setLoading(true);

    fetchGalleryBatch({
      locale:     state.locale,
      seed:       seedStringToNumber(state.seed),
      likesAvg:   state.likesAvg,
      reviewsAvg: state.reviewsAvg,
      batchIndex,
      batchSize:  BATCH_SIZE,
    }, controller.signal)
      .then((res) => {
        if (controller !== abortRef.current) return;
        setMovies((prev) => [...prev, ...res.movies]);
        setNextBatchIndex(batchIndex + 1);
        setHasNextBatch(res.hasNextBatch);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller !== abortRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
  };

  // Latest loadNextBatch is always reachable via this ref.
  const loadNextBatchRef = useRef(loadNextBatch);
  loadNextBatchRef.current = loadNextBatch;

  // ---- IntersectionObserver: triggers loadNextBatch when the sentinel
  //      becomes visible inside the scroll container.
  //
  // Attached ONCE with empty deps. The callback reads `loadNextBatchRef`
  // (always points to the latest function) and lets that function
  // consult `loadingRef` / `hasNextBatchRef` for the single-flight /
  // end-of-catalog guards.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadNextBatchRef.current();
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px 0px',
      },
    );

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // ---- Handlers ----
  const handleToggleCard = useCallback((sequenceIndex: number) => {
    setExpandedSequenceIndex((current) =>
      current === sequenceIndex ? null : sequenceIndex,
    );
  }, []);

  // ---- Render ----
  return (
    <section className="gallery-view">
      <header className="gallery-view__header">
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Gallery view</h2>
        <span className="gallery-view__status" aria-live="polite">
          {loading && movies.length === 0
            ? 'Loading…'
            : `${movies.length} movie${movies.length === 1 ? '' : 's'} loaded${hasNextBatch ? '' : ' · end of catalog'}`}
        </span>
      </header>

      {error && <p className="gallery-view__error">Error: {error}</p>}

      <div
        className="gallery-view__scroll"
        ref={scrollContainerRef}
      >
        {movies.length === 0 && !loading && !error && (
          <p style={{ opacity: 0.6, padding: '1rem' }}>No movies yet.</p>
        )}

        <div className="gallery-view__grid">
          {movies.map((movie) => (
            <GalleryCard
              key={movie.sequenceIndex}
              movie={movie}
              isExpanded={expandedSequenceIndex === movie.sequenceIndex}
              onToggle={handleToggleCard}
            />
          ))}
        </div>

        <div
          ref={sentinelRef}
          className="gallery-view__sentinel"
          aria-hidden="true"
        >
          {loading && movies.length > 0 && (
            <p className="gallery-view__loading">Loading more…</p>
          )}
          {!hasNextBatch && movies.length > 0 && (
            <p className="gallery-view__end">End of catalog.</p>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface GalleryCardProps {
  movie: Movie;
  isExpanded: boolean;
  onToggle: (sequenceIndex: number) => void;
}

/**
 * A single catalog card in the grid. Clicking the card toggles its
 * expanded state, which reveals the trailer freeze frame, play button,
 * reviews, and likes. The play button's click handler calls
 * stopPropagation() so it doesn't collapse the card.
 */
function GalleryCard({
  movie,
  isExpanded,
  onToggle,
}: GalleryCardProps) {
  return (
    <article
      className={`gallery-card${isExpanded ? ' is-expanded' : ''}`}
      onClick={() => onToggle(movie.sequenceIndex)}
      aria-expanded={isExpanded}
    >
      <header className="gallery-card__header">
        <span className="gallery-card__index">#{movie.sequenceIndex}</span>
        <h3 className="gallery-card__title">{movie.title}</h3>
      </header>

      <div className="gallery-card__meta">
        {movie.actors.length > 0 ? movie.actors.join(', ') : <em>—</em>}
        {' · '}
        {movie.year}
        {' · '}
        {movie.genre}
      </div>

      {isExpanded && (
        <div className="gallery-card__expanded">
          <div className="gallery-card__trailer">
            <TrailerFreezeFrame movie={movie} />
            <TrailerPlayButton movie={movie} />
          </div>
          <div className="gallery-card__details">
            <div className="gallery-card__likes">
              <strong>Likes:</strong> {movie.likes}
            </div>
            <div className="gallery-card__reviews">
              <h4>Reviews ({movie.reviews.length})</h4>
              {movie.reviews.length > 0 ? (
                <ul>
                  {movie.reviews.map((review, i) => (
                    <li key={i}>{review}</li>
                  ))}
                </ul>
              ) : (
                <em style={{ opacity: 0.6 }}>No reviews yet.</em>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
import { useCallback, useEffect, useState } from 'react';
import {
  useGenerationParams,
  seedStringToNumber,
} from '../state/GenerationParamsContext';
import { fetchTableMovies } from '../api/movies';
import type { Movie } from '../types/movie';
import TrailerFreezeFrame from './TrailerFreezeFrame';
import TrailerPlayButton from './TrailerPlayButton';

/** Fixed page size for now; later we may expose this in the toolbar. */
const PAGE_SIZE = 20;

/**
 * Combined view state. Bundling `page` and `generation` into one object
 * lets us collapse "context generation changed" and "user clicked Next"
 * into a single React effect run, which is the cleanest way to avoid a
 * double-fetch when the generation changes (see the effect comments
 * below).
 */
interface ViewState {
  page: number;
  /** Mirror of context.generation at the time this view was issued. */
  generation: number;
}

/**
 * Paginated table view of the catalog.
 *
 * - On mount, fetches page 1 with the current default parameters.
 * - Whenever the context `generation` counter changes, the view resets to
 *   page 1 and a new fetch is issued with the new parameters.
 * - The Previous / Next buttons move through pages 1..N+; Previous is
 *   disabled on page 1, Next is always enabled (the server reports
 *   `hasNextPage: true` for every non-empty page, per spec).
 * - Rows can be expanded inline to show trailer freeze frame, play
 *   button, reviews, and likes. Collapsing restores the original row
 *   state without a page reload.
 */
export default function TableView() {
  const { state } = useGenerationParams();
  const ctxGen = state.generation;

  // ---- Local state ----
  const [view, setView] = useState<ViewState>(() => ({
    page: 1,
    generation: ctxGen,
  }));
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Only one row expanded at a time (per spec's "keep it simple").
  // Keyed by `${page}|${sequenceIndex}` so different pages don't collide.
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  // ---- Effect 1: when the context generation changes, reset to page 1.
  //
  // We only depend on `ctxGen` here. The functional setState returns the
  // previous reference when nothing changed, which means React skips the
  // re-render and no fetch is triggered.
  //
  // The reason we DON'T list `view.page` in this effect's deps (and don't
  // include any other state) is to keep this effect focused on a single
  // job: when ctxGen moves forward, ask for page 1. The fetch effect
  // below will pick up the new `view` reference.
  useEffect(() => {
    setView((prev) =>
      prev.generation === ctxGen ? prev : { page: 1, generation: ctxGen },
    );
  }, [ctxGen]);

  // ---- Effect 2: fetch whenever `view` (page + generation) changes.
  //
  // This is the only place that issues HTTP requests. Because `view`
  // captures both the desired page AND the generation it belongs to, a
  // generation change produces exactly one render and one fetch — the
  // reset effect above sets view to {page:1, gen:newGen}, this effect
  // sees the new view reference and fires one fetch.
  //
  // We deliberately do NOT list state.locale / state.seed / state.likesAvg
  // / state.reviewsAvg in the deps array. Every one of those changes
  // bumps `ctxGen` (per the context's contract), which triggers the reset
  // effect, which updates `view`, which triggers this fetch. Listing them
  // would risk double-fetches via stale closures.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchTableMovies({
      locale:     state.locale,
      seed:       seedStringToNumber(state.seed),
      likesAvg:   state.likesAvg,
      reviewsAvg: state.reviewsAvg,
      page:       view.page,
      pageSize:   PAGE_SIZE,
    })
      .then((res) => {
        if (cancelled) return;
        setMovies(res.movies);
        setLoading(false);
        // Collapse any expanded row — the data under it has changed.
        setExpandedRowKey(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // ---- Handlers ----
  const goToPage = useCallback((page: number) => {
    if (page < 1) return;
    setView((prev) => ({ ...prev, page }));
  }, []);

  const toggleRow = useCallback((rowKey: string) => {
    setExpandedRowKey((current) => (current === rowKey ? null : rowKey));
  }, []);

  // ---- Render ----
  return (
    <section className="table-view">
      <header className="table-view__header">
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Table view</h2>
        <span className="table-view__status" aria-live="polite">
          {loading
            ? `Loading page ${view.page}…`
            : `${movies.length} movie${movies.length === 1 ? '' : 's'} on this page`}
        </span>
      </header>

      {error && <p className="table-view__error">Error: {error}</p>}

      {movies.length === 0 && !loading && !error && (
        <p style={{ opacity: 0.6 }}>No movies on this page.</p>
      )}

      {movies.length > 0 && (
        <table className="catalog-table">
          <thead>
            <tr>
              <th className="catalog-table__chevron" aria-label="Expand" />
              <th scope="col">#</th>
              <th scope="col">Title</th>
              <th scope="col">Actors</th>
              <th scope="col">Year</th>
              <th scope="col">Genre</th>
            </tr>
          </thead>
          <tbody>
            {movies.map((movie) => {
              const rowKey = `${view.page}|${movie.sequenceIndex}`;
              const isExpanded = expandedRowKey === rowKey;
              return (
                <RowGroup
                  key={rowKey}
                  movie={movie}
                  rowKey={rowKey}
                  isExpanded={isExpanded}
                  onToggle={toggleRow}
                />
              );
            })}
          </tbody>
        </table>
      )}

      <Pagination page={view.page} onChange={goToPage} />
    </section>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface RowGroupProps {
  movie: Movie;
  rowKey: string;
  isExpanded: boolean;
  onToggle: (rowKey: string) => void;
}

/**
 * A single catalog row plus, when expanded, a full-width detail row
 * immediately beneath it. Both rows live in the same <tbody> so the
 * detail row sits right below the collapsed row it belongs to — the
 * browser handles all the layout.
 */
function RowGroup({
  movie,
  rowKey,
  isExpanded,
  onToggle,
}: RowGroupProps) {
  return (
    <>
      <tr
        className={`catalog-row${isExpanded ? ' catalog-row--expanded' : ''}`}
        onClick={() => onToggle(rowKey)}
        aria-expanded={isExpanded}
      >
        <td className="catalog-table__chevron">
          <button
            type="button"
            className="catalog-row__toggle"
            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(rowKey);
            }}
          >
            {isExpanded ? '▾' : '▸'}
          </button>
        </td>
        <td>{movie.sequenceIndex}</td>
        <td>
          <strong>{movie.title}</strong>
        </td>
        <td>
          {movie.actors.length > 0 ? movie.actors.join(', ') : <em>—</em>}
        </td>
        <td>{movie.year}</td>
        <td>{movie.genre}</td>
      </tr>
      {isExpanded && (
        <tr className="catalog-row__detail">
          <td colSpan={6}>
            <ExpandedPanel movie={movie} />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedPanel({ movie }: { movie: Movie }) {
  return (
    <div className="expanded-panel">
      <div className="expanded-panel__trailer">
        <TrailerFreezeFrame movie={movie} />
        <TrailerPlayButton movie={movie} />
      </div>
      <div className="expanded-panel__meta">
        <div className="expanded-panel__likes">
          <strong>Likes:</strong> {movie.likes}
        </div>
        <div className="expanded-panel__reviews">
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
  );
}

interface PaginationProps {
  page: number;
  onChange: (page: number) => void;
}

/**
 * Previous / Next pagination. The server reports `hasNextPage: true` for
 * every non-empty page per spec, so Next is always enabled; Previous is
 * disabled on page 1.
 */
function Pagination({ page, onChange }: PaginationProps) {
  return (
    <nav className="pagination" aria-label="Table pagination">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        ◀ Previous
      </button>
      <span className="pagination__indicator">Page {page}</span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        Next ▶
      </button>
    </nav>
  );
}
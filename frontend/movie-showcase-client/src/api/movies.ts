import type {
  LocaleListResponse,
  MovieGalleryResponse,
  MovieTableResponse,
} from '../types/movie';

/**
 * Build a query string from an object, ignoring undefined / null values.
 *
 * We accept `string | number` for the seed so callers can pass an exact
 * 48-bit decimal without any floating-point round-trip — `Number("281474976710655")`
 * fits inside `Number.MAX_SAFE_INTEGER` and survives the JSON encoder, but
 * constructing that Number from a string every time we make a request is
 * wasteful. Either form ends up as the same digits in the URL.
 */
function toQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null,
  );
  if (entries.length === 0) return '';
  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    qs.append(key, String(value));
  }
  return `?${qs.toString()}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return (await response.json()) as T;
}

/**
 * Shared query-string parameters for both endpoints.
 */
interface CommonParams {
  locale?: string;
  /**
   * 48-bit user seed. String is preferred (no FP round-trip at all); plain
   * `number` is also accepted for callers that already have one in hand.
   * Either way, the URL receives the canonical decimal form.
   */
  seed?: number | string;
  likesAvg?: number;
  reviewsAvg?: number;
}

/**
 * GET /api/movies/table — paginated table view (1-based pages).
 *
 * Returns at most `pageSize` movies for the requested page. The server
 * marks `hasNextPage` for every non-empty page, so the client can always
 * offer a "Next" button.
 */
export async function fetchTableMovies(
  params: CommonParams & { page?: number; pageSize?: number } = {},
  signal?: AbortSignal,
): Promise<MovieTableResponse> {
  const query = toQueryString({
    locale:     params.locale     ?? 'en-US',
    seed:       params.seed       ?? '0',
    likesAvg:   params.likesAvg   ?? 1.0,
    reviewsAvg: params.reviewsAvg ?? 1.0,
    page:       params.page       ?? 1,
    pageSize:   params.pageSize   ?? 20,
  });

  return getJson<MovieTableResponse>(`/api/movies/table${query}`, signal);
}

/**
 * GET /api/movies/gallery — batched view (0-based batches).
 *
 * Used by the infinite-scroll Gallery view. Each call returns one batch of
 * `batchSize` movies; the caller appends results and requests the next
 * batch index as the user scrolls. The server marks `hasNextBatch` for
 * every non-empty batch so the client can stop fetching once the catalog
 * is exhausted.
 */
export async function fetchGalleryBatch(
  params: CommonParams & { batchIndex?: number; batchSize?: number } = {},
  signal?: AbortSignal,
): Promise<MovieGalleryResponse> {
  const query = toQueryString({
    locale:     params.locale     ?? 'en-US',
    seed:       params.seed       ?? '0',
    likesAvg:   params.likesAvg   ?? 1.0,
    reviewsAvg: params.reviewsAvg ?? 1.0,
    batchIndex: params.batchIndex ?? 0,
    batchSize:  params.batchSize  ?? 12,
  });

  return getJson<MovieGalleryResponse>(`/api/movies/gallery${query}`, signal);
}

/**
 * Alias kept for backwards compatibility with the original smoke-test
 * App. New code should call `fetchGalleryBatch` directly.
 *
 * @deprecated use fetchGalleryBatch instead.
 */
export const fetchGalleryMovies = fetchGalleryBatch;

/** GET /api/locales — list of locale codes with display names. */
export async function fetchAvailableLocales(
  signal?: AbortSignal,
): Promise<LocaleListResponse> {
  return getJson<LocaleListResponse>('/api/locales', signal);
}

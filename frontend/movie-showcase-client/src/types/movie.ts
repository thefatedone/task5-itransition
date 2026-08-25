/**
 * TypeScript mirrors of the backend models in
 * `MovieShowcase.Api/Models/`. Keep these in sync when the C# side changes.
 */

export interface TitleAnimationSegment {
  /** Text to display — either the movie title or a filler phrase. */
  text: string;
  /** Renderer hint, e.g. "typewriter", "fade-scale", "slide-up". */
  animationType: string;
  /** Start offset within the trailer, in milliseconds. */
  startMs: number;
  /** How long this segment stays on screen, in milliseconds. */
  durationMs: number;
  /** Font style identifier, e.g. "bold-condensed", "serif-dramatic". */
  fontStyle: string;
  /** Text color as #RRGGBB. */
  textColor: string;
}

/**
 * Per-segment background video clip + visual treatment. The browser tries
 * to load and draw the clip; if loading fails (CORS, network, decoder),
 * it falls back to the canvas background renderer for that segment.
 */
export interface VideoSegmentEffect {
  /** Direct .mp4 URL — must be CORS-friendly. */
  clipUrl: string;
  /** Playback rate: 0.7 (slow) to 1.5 (fast). 1.0 = normal. */
  playbackRate: number;
  /** Starting zoom factor for the canvas drawImage. */
  zoomStart: number;
  /** Ending zoom factor (interpolated over the segment's duration). */
  zoomEnd: number;
  /** Color-grading preset, e.g. "none" | "sepia" | "cool-blue". */
  colorFilter: string;
  /** Start time of this segment, in ms relative to trailer start. */
  startMs: number;
  /** Length of this segment, in ms. */
  durationMs: number;
}

export interface TrailerSpec {
  /** Total trailer length in milliseconds, in [5000, 10000]. */
  durationMs: number;
  /** Background renderer identifier, e.g. "gradient", "particles".
   *  Used as a fallback when a video clip can't load. */
  backgroundStyle: string;
  /** 2–3 hex colors (#RRGGBB) for the background renderer. */
  backgroundColors: string[];
  /** Ordered 3–5 text segments. At least one carries the movie title. */
  titleSegments: TitleAnimationSegment[];
  /** Transition names between adjacent segments (length = segments-1). */
  transitionTypes: string[];
  /** One video effect per title segment, aligned to its StartMs/DurationMs.
   *  Empty array means "no video — use the canvas renderer for the whole trailer". */
  videoEffects: VideoSegmentEffect[];
}

export interface Movie {
  sequenceIndex: number;
  title: string;
  actors: string[];
  year: number;
  genre: string;
  trailer: TrailerSpec;
  reviews: string[];
  likes: number;
}

/** Common shape for both movie endpoints' response envelopes. */
interface BaseMovieResponse {
  movies: Movie[];
}

/** Response from `GET /api/movies/table`. */
export interface MovieTableResponse extends BaseMovieResponse {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

/** Response from `GET /api/movies/gallery`. */
export interface MovieGalleryResponse extends BaseMovieResponse {
  batchIndex: number;
  batchSize: number;
  hasNextBatch: boolean;
}

export interface LocaleInfo {
  code: string;
  displayName: string;
}

export interface LocaleListResponse {
  locales: LocaleInfo[];
}
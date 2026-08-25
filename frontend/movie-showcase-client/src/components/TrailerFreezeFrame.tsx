import { useEffect, useRef } from 'react';
import type { Movie } from '../types/movie';
import {
  ensureVideoLoaded,
  renderFreezeFrame,
} from '../lib/trailerPlayer';

/**
 * Inline trailer freeze-frame: a small canvas (16:9) showing a static
 * "paused" moment of the trailer.
 *
 * Two render paths:
 *   1. Pure canvas (gradient / particles / etc.) — the same renderer used
 *      when no video clip is loaded. Drawn synchronously on mount and on
 *      every `movie` change, so users always see *something* immediately.
 *   2. Video composite — if the trailer's VideoSegmentEffect for the
 *      freeze moment has loaded its clip, we re-draw the canvas as soon
 *      as the clip is ready, this time using drawImage(video, ...) with
 *      the configured zoom + color filter. This is what makes the freeze
 *      frame look like a real paused video moment rather than a slideshow.
 *
 * The two-path approach is the user-visible effect of the "video fails →
 * canvas fallback" guarantee: if the CDN is slow or unreachable, the
 * freeze-frame shows the canvas renderer and never looks broken.
 *
 * Width / height are hardcoded at 320x180 to keep the freeze-frame
 * compact inside the expanded row / card. The aspect ratio (16:9)
 * matches what the larger modal canvas uses, so the freeze frame is a
 * faithful scaled-down preview of a real moment in the trailer.
 */
const FREEZE_WIDTH = 320;
const FREEZE_HEIGHT = 180;

interface Props {
  movie: Movie;
}

export default function TrailerFreezeFrame({ movie }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize defensively — the attributes are set in JSX but external
    // CSS could in principle override them.
    canvas.width = FREEZE_WIDTH;
    canvas.height = FREEZE_HEIGHT;

    // First paint: always show the canvas-rendered freeze frame. This
    // paints something visible immediately, even before any video loads.
    renderFreezeFrame(ctx, movie, FREEZE_WIDTH, FREEZE_HEIGHT);

    // Now try to upgrade to a video composite. We pick the clip that
    // covers the freeze moment — that's the same VideoSegmentEffect the
    // full trailer would be drawing at that elapsedMs, so the freeze
    // frame is a true preview of what the modal will show.
    const effects = movie.trailer.videoEffects ?? [];
    if (effects.length === 0) return;

    const freezeMs = computeFreezeMs(movie);
    const active = effects.find(
      (e) => freezeMs >= e.startMs && freezeMs < e.startMs + e.durationMs,
    );
    if (!active) return;

    // Fire-and-forget: the loader returns immediately with either a
    // <video> already loaded, or null if the URL has previously errored.
    const video = ensureVideoLoaded(active.clipUrl);
    if (!video) return;

    // If the video is already at HAVE_CURRENT_DATA, paint the video frame
    // synchronously. Otherwise, wait for loadeddata and then paint.
    const paint = (): void => {
      // The renderer re-reads state on every call, so calling
      // renderFreezeFrame again will pick up the now-loaded video.
      const c = canvasRef.current;
      if (!c) return;
      const c2 = c.getContext('2d');
      if (!c2) return;
      renderFreezeFrame(c2, movie, FREEZE_WIDTH, FREEZE_HEIGHT);
    };

    if (video.readyState >= 2 /* HAVE_CURRENT_DATA */) {
      paint();
    } else {
      const onLoaded = (): void => {
        paint();
        video.removeEventListener('loadeddata', onLoaded);
      };
      video.addEventListener('loadeddata', onLoaded);
    }
  }, [movie]);

  return (
    <canvas
      ref={canvasRef}
      width={FREEZE_WIDTH}
      height={FREEZE_HEIGHT}
      className="trailer-freeze-frame"
      role="img"
      aria-label={`Trailer freeze frame for ${movie.title}`}
    />
  );
}

/**
 * Same moment the canvas renderer picks for its freeze frame: the last
 * title segment at 90% progress. We duplicate the logic here rather than
 * reaching into the renderer's internals, so this file stays
 * self-contained.
 */
function computeFreezeMs(movie: Movie): number {
  const segs = movie.trailer.titleSegments;
  if (segs.length === 0) return 0;
  let chosen = segs[segs.length - 1];
  for (let i = segs.length - 1; i >= 0; i--) {
    if (segs[i].text === movie.title) {
      chosen = segs[i];
      break;
    }
  }
  return chosen.startMs + chosen.durationMs * 0.9;
}

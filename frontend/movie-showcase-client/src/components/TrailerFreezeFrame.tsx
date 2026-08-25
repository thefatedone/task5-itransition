import { useEffect, useRef } from 'react';
import type { Movie } from '../types/movie';
import { renderFreezeFrame } from '../lib/trailerPlayer';

/**
 * Inline trailer freeze-frame: a small canvas (16:9) showing a static
 * "paused" moment of the trailer. The frame is a pure function of the
 * `movie` prop — same movie, same pixels, every time.
 *
 * The canvas is drawn once on mount and re-drawn if the `movie` prop
 * changes (which happens when the user switches params). The browser
 * handles the actual painting; we just hand it the 2D context.
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

    renderFreezeFrame(ctx, movie, FREEZE_WIDTH, FREEZE_HEIGHT);
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
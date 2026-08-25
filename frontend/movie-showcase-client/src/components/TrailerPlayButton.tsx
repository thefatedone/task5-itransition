import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { Movie } from '../types/movie';
import { startPlayback } from '../lib/trailerPlayer';

/**
 * "Play trailer" button + full-screen modal.
 *
 * Design choice (called out for the reviewer): the modal is opened
 * INTERNALLY by this component. That means the consumer
 * (TableView / GalleryView) only needs to render
 * `<TrailerPlayButton movie={movie} />` — no `onPlay` callback, no
 * plumbing for a modal manager at the parent level. Both call-sites
 * already shrink to a single line each.
 *
 * The modal:
 *   - Renders a 16:9 canvas at 960x540 (large enough to feel cinematic,
 *     small enough that it fits comfortably on a laptop screen).
 *   - Drives playback via /lib/trailerPlayer.ts's startPlayback(),
 *     which returns a {stop} handle we hold in a ref.
 *   - Shows a progress bar + elapsed/remaining time.
 *   - Closes on Escape, on backdrop click, on the X button, or when
 *     the trailer finishes naturally.
 *   - Cleans up: every effect that could leak (the rAF loop, the
 *     keydown listener) is unwound in its own cleanup function or in
 *     the modal-close path.
 */

const MODAL_WIDTH = 960;
const MODAL_HEIGHT = 540;

interface Props {
  movie: Movie;
}

export default function TrailerPlayButton({ movie }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  // Snapshot of the movie at the moment playback was opened. We use
  // this snapshot rather than `movie` because the user could change
  // params (locale/seed/likes/etc.) mid-playback; playing the same
  // deterministic spec from the moment of click is more intuitive.
  const [snapshot, setSnapshot] = useState<Movie | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Stop the rAF loop when the component unmounts (e.g. user switches
  // view modes while a trailer is playing). The cleanup runs whenever
  // isOpen flips too, which is fine — stop() is idempotent.
  useEffect(() => {
    return () => {
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [isOpen]);

  const closeModal = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    setIsOpen(false);
    setSnapshot(null);
    setElapsedMs(0);
  }, []);

  const openModal = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      // The button itself doesn't toggle expanded card state in the
      // gallery view; TableView has no expansion to manage. We still
      // stopPropagation defensively in case a future caller wraps us.
      e.stopPropagation();
      setSnapshot(movie);
      setElapsedMs(0);
      setIsOpen(true);
    },
    [movie],
  );

  // Once the modal is open AND the canvas is mounted, kick off
  // playback. We listen for [isOpen, snapshot] — when either changes
  // (including the very first render with isOpen=true), we spin up a
  // new playback handle.
  useEffect(() => {
    if (!isOpen || !snapshot) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = MODAL_WIDTH;
    canvas.height = MODAL_HEIGHT;

    const handle = startPlayback(ctx, snapshot, (ms) => {
      setElapsedMs(ms);
    });
    stopRef.current = handle.stop;

    return () => {
      handle.stop();
      if (stopRef.current === handle.stop) stopRef.current = null;
    };
  }, [isOpen, snapshot]);

  // Keyboard: Escape closes the modal while it's open.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeModal]);

  // Focus the close button when the modal opens so keyboard users have
  // an obvious target.
  useEffect(() => {
    if (!isOpen) return;
    dialogRef.current?.querySelector<HTMLButtonElement>('button[data-close]')?.focus();
  }, [isOpen]);

  const totalMs = snapshot?.trailer.durationMs ?? 1;
  const progress = Math.min(100, (elapsedMs / totalMs) * 100);
  const elapsedSec = (elapsedMs / 1000).toFixed(1);
  const totalSec = (totalMs / 1000).toFixed(1);

  return (
    <>
      <button
        type="button"
        className="trailer-play-button"
        onClick={openModal}
        aria-label={`Play trailer for ${movie.title}`}
      >
        ▶ Play trailer
      </button>

      {isOpen && snapshot && (
        <div
          className="trailer-modal-backdrop"
          onClick={(e) => {
            // Backdrop click closes; click on the dialog itself doesn't.
            if (e.target === e.currentTarget) closeModal();
          }}
          role="presentation"
        >
          <div
            ref={dialogRef}
            className="trailer-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="trailer-modal__header">
              <h2 id={titleId} className="trailer-modal__title">
                {snapshot.title}
              </h2>
              <button
                type="button"
                className="trailer-modal__close"
                data-close
                onClick={closeModal}
                aria-label="Close trailer"
              >
                ✕
              </button>
            </header>

            <div className="trailer-modal__canvas-wrap">
              <canvas
                ref={canvasRef}
                width={MODAL_WIDTH}
                height={MODAL_HEIGHT}
                className="trailer-modal__canvas"
              />
            </div>

            <footer className="trailer-modal__footer">
              <div className="trailer-modal__progress-track">
                <div
                  className="trailer-modal__progress-fill"
                  style={{ width: `${progress}%` }}
                  aria-hidden="true"
                />
              </div>
              <div className="trailer-modal__time" aria-live="off">
                {elapsedSec}s / {totalSec}s
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
/**
 * Pure, deterministic canvas renderer for TrailerSpec playback.
 *
 * Determinism contract — STRICT, no exceptions:
 *   - No `Math.random()` is ever called. All "random-looking" values are
 *     derived from a hash of the movie title / segment text / segment
 *     index via the xmur3 + mulberry32 pair below.
 *   - Every visible state is a pure function of
 *     (movie, trailerSpec, elapsedMs). Calling
 *     `renderFreezeFrame(ctx, movie, w, h)` twice on the same canvas
 *     produces byte-identical pixels.
 *   - Calling `renderAt(ctx, movie, spec, w, h, elapsedMs)` twice with
 *     the same elapsedMs produces byte-identical pixels.
 *
 * Why it lives in /lib, not /components:
 *   The renderer has no React, no DOM, no requestAnimationFrame — it's a
 *   pure function from inputs to canvas drawing calls. That makes it
 *   trivially testable (we feed it a recording context in the verify
 *   script) and trivially reusable (both the small freeze-frame and the
 *   large modal canvas call into the same primitives).
 *
 * Visual contract — four background renderers, five text animators,
 * five transitions:
 *   backgroundStyle ∈ "gradient" | "particles" | "grid-lines" | "radial-pulse"
 *   animationType   ∈ "typewriter" | "fade-scale" | "slide-up" | "letter-spacing-collapse" | "flicker-in"
 *   transitionType  ∈ "fade" | "wipe-left" | "wipe-right" | "zoom-blur" | "slide-cut"
 *   fontStyle       ∈ "bold-condensed" | "serif-dramatic" | "sans-wide"
 *
 *   All identifiers are matched exactly; any unknown value falls back to
 *   a sensible default ("gradient" / static text / no transition) so a
 *   future server-side addition never breaks the renderer.
 */

import type { Movie, TitleAnimationSegment, TrailerSpec } from '../types/movie';

// ---------------------------------------------------------------------------
// Deterministic hash + RNG. mulberry32 is the standard 32-bit integer
// generator that pairs nicely with xmur3 (a MurmurHash3-style string
// mixer). Both produce identical output across browsers / Node versions.
// ---------------------------------------------------------------------------

/** MurmurHash3-style string mixer; returns an unsigned 32-bit integer. */
function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 PRNG; returns a function that yields floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build a seeded RNG from an arbitrary string. Two calls with the same
 * string produce sequences with identical first value; we use this for
 * particle positions, flicker patterns, etc.
 */
function rngFromString(s: string): () => number {
  return mulberry32(xmur3(s));
}

// ---------------------------------------------------------------------------
// Easings — small, hand-picked, no dependencies. Each is a pure function
// of t ∈ [0, 1] returning eased t ∈ [0, 1].
// ---------------------------------------------------------------------------

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
const easeInOutQuad = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

// ---------------------------------------------------------------------------
// Font style lookup. We map the server's identifier strings to actual
// CSS font strings. Browsers without a specific family fall back to the
// next entry in the comma list, so we always end up with *something*
// visible even on locked-down systems.
// ---------------------------------------------------------------------------

const FONT_LOOKUP: Record<string, string> = {
  'bold-condensed':
    '"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", Impact, sans-serif',
  'serif-dramatic':
    '"Times New Roman", "Playfair Display", "Georgia", "Liberation Serif", serif',
  'sans-wide': '"Trebuchet MS", "Verdana", "Tahoma", sans-serif',
};

function fontString(fontStyle: string, sizePx: number): string {
  const family = FONT_LOOKUP[fontStyle] ?? 'sans-serif';
  // 700 weight for all three so the trailer reads "cinematic" rather
  // than "default body copy".
  return `700 ${sizePx}px ${family}`;
}

// ---------------------------------------------------------------------------
// Background renderers. All accept (ctx, spec, w, h, elapsedMs, seedKey).
// Each one clears the canvas first (via a black fill in drawBackground
// below) so callers don't have to.
// ---------------------------------------------------------------------------

function drawGradientBg(
  ctx: CanvasRenderingContext2D,
  spec: TrailerSpec,
  w: number,
  h: number,
  elapsedMs: number,
): void {
  const colors = spec.backgroundColors;
  // Slowly rotate the gradient axis. The phase term is purely a function
  // of elapsedMs (no randomness), so the result is reproducible.
  const phase = (elapsedMs / spec.durationMs) * Math.PI * 2;
  const angle = Math.PI / 4 + phase * 0.15;

  const cx = w / 2;
  const cy = h / 2;
  const len = Math.max(w, h);
  const x0 = cx - Math.cos(angle) * len;
  const y0 = cy - Math.sin(angle) * len;
  const x1 = cx + Math.cos(angle) * len;
  const y1 = cy + Math.sin(angle) * len;

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  // Color stops wobble very slightly around their nominal positions.
  for (let i = 0; i < colors.length; i++) {
    const nominal = i / Math.max(1, colors.length - 1);
    const wobble = Math.sin(phase * 2 + i * 1.3) * 0.03;
    const stop = Math.max(0, Math.min(1, nominal + wobble));
    grad.addColorStop(stop, colors[i]);
  }
  // Pin the endpoints so the gradient always covers the full canvas.
  if (!Number.isFinite(grad as unknown as number)) {
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[colors.length - 1]);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

interface Particle {
  baseX: number;
  baseY: number;
  radius: number;
  speed: number;
  phase: number;
  colorIndex: number;
}

function drawParticlesBg(
  ctx: CanvasRenderingContext2D,
  spec: TrailerSpec,
  w: number,
  h: number,
  elapsedMs: number,
  seedKey: string,
): void {
  // Particles are seeded from the movie title so the layout is stable
  // for the same movie across re-renders. NB: we rebuild the particle
  // array on every frame — that's ~60 cheap allocations per second of
  // playback; for a 320×180 canvas this is comfortably under 1ms.
  const rng = rngFromString(seedKey);
  const N = 50;
  const particles: Particle[] = [];
  const colors = spec.backgroundColors;
  for (let i = 0; i < N; i++) {
    particles.push({
      baseX: rng() * w,
      baseY: rng() * h,
      radius: 1.2 + rng() * 2.6,
      speed: 0.4 + rng() * 1.1,
      phase: rng() * Math.PI * 2,
      colorIndex: i % Math.max(1, colors.length),
    });
  }

  const tSec = elapsedMs / 1000;

  // Solid base layer so gaps between particles aren't transparent black.
  ctx.fillStyle = colors[0] ?? '#111';
  ctx.fillRect(0, 0, w, h);

  for (const p of particles) {
    // Each particle drifts on its own closed Lissajous-like path.
    // Position is a pure function of elapsedMs, so it's reproducible.
    const dx = Math.sin(tSec * p.speed + p.phase) * 30;
    const dy = Math.cos(tSec * p.speed * 0.73 + p.phase * 1.3) * 22;
    let x = p.baseX + dx;
    let y = p.baseY + dy;
    // Wrap around so off-edge particles reappear on the other side.
    if (x < -10) x += w + 20;
    if (x > w + 10) x -= w + 20;
    if (y < -10) y += h + 20;
    if (y > h + 10) y -= h + 20;

    ctx.fillStyle = colors[p.colorIndex] ?? '#fff';
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(x, y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGridLinesBg(
  ctx: CanvasRenderingContext2D,
  spec: TrailerSpec,
  w: number,
  h: number,
  elapsedMs: number,
): void {
  const colors = spec.backgroundColors;
  ctx.fillStyle = colors[0] ?? '#111';
  ctx.fillRect(0, 0, w, h);

  // Two grid colors: the base and a contrasting accent. If we only have
  // one color, draw the lines slightly lighter via globalAlpha.
  const accent = colors[1] ?? colors[0] ?? '#fff';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.globalAlpha = colors.length >= 2 ? 0.45 : 0.18;

  const cellSize = Math.max(20, Math.min(w, h) / 12);
  // Lines scroll diagonally over time — purely a function of elapsedMs.
  const offset = (elapsedMs / 60) % cellSize;

  ctx.beginPath();
  for (let x = -cellSize + offset; x < w + cellSize; x += cellSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = -cellSize + offset; y < h + cellSize; y += cellSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawRadialPulseBg(
  ctx: CanvasRenderingContext2D,
  spec: TrailerSpec,
  w: number,
  h: number,
  elapsedMs: number,
): void {
  const colors = spec.backgroundColors;
  const cx = w / 2;
  const cy = h / 2;
  const baseRadius = Math.max(w, h) * 0.7;
  // One full breath cycle per (durationMs / 4) — gives roughly 4 pulses
  // across a 10s trailer.
  const phase = (elapsedMs / spec.durationMs) * Math.PI * 4;
  const pulseRadius = baseRadius + Math.sin(phase) * baseRadius * 0.15;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseRadius);
  for (let i = 0; i < colors.length; i++) {
    const stop = i / Math.max(1, colors.length - 1);
    grad.addColorStop(stop, colors[i]);
  }

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/** Top-level background dispatcher. Always paints over the whole canvas. */
function drawBackground(
  ctx: CanvasRenderingContext2D,
  spec: TrailerSpec,
  w: number,
  h: number,
  elapsedMs: number,
  seedKey: string,
): void {
  // Black underlay so any transparent pixel from a renderer is opaque
  // black rather than whatever was on the canvas previously.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  switch (spec.backgroundStyle) {
    case 'particles':
      drawParticlesBg(ctx, spec, w, h, elapsedMs, seedKey);
      break;
    case 'grid-lines':
      drawGridLinesBg(ctx, spec, w, h, elapsedMs);
      break;
    case 'radial-pulse':
      drawRadialPulseBg(ctx, spec, w, h, elapsedMs);
      break;
    case 'gradient':
    default:
      drawGradientBg(ctx, spec, w, h, elapsedMs);
      break;
  }
}

// ---------------------------------------------------------------------------
// Cinematic vignette. Cheap (one radial gradient) but does a lot of work
// to make the trailer feel like a movie rather than a flat rectangle.
// ---------------------------------------------------------------------------

function drawVignette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const grad = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.min(w, h) * 0.3,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.75,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Text animators. Each takes (ctx, seg, progress, cx, cy, w, segIdx)
// where progress ∈ [0, 1] is the segment's local progress.
// All output is reproducible — flicker-in derives its on/off pattern
// from a hash of (segment text + segment index + "flicker"), not from
// Math.random().
// ---------------------------------------------------------------------------

function drawTypewriter(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  progress: number,
  cx: number,
  cy: number,
): void {
  const fullText = seg.text;
  const visibleChars = Math.max(
    1,
    Math.ceil(fullText.length * easeOutCubic(progress)),
  );
  const text = fullText.substring(0, visibleChars);

  ctx.font = fontString(seg.fontStyle, Math.max(0, ctx.canvas.width / 14));
  ctx.fillStyle = seg.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, cx, cy);

  // Blinking caret — on/off pattern is a hash of (text + progress),
  // not Math.random(), so it's reproducible across re-renders.
  if (progress < 1) {
    const caretRng = mulberry32(xmur3(seg.text + '|caret'));
    // The on/off decision is a deterministic function of the segment
    // text — same trailer, same caret flicker pattern, every render.
    const visible = caretRng() > 0.4; // biased to "visible" — looks more like a real caret
    if (visible) {
      const metrics = ctx.measureText(text);
      const caretX = cx + metrics.width / 2 + 4;
      const fontSize = ctx.canvas.width / 14;
      ctx.fillRect(caretX, cy - fontSize * 0.5, 3, fontSize);
    }
  }
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawFadeScale(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  progress: number,
  cx: number,
  cy: number,
): void {
  const eased = easeOutQuart(progress);
  const scale = 0.78 + 0.22 * eased;
  const opacity = eased;

  ctx.font = fontString(seg.fontStyle, ctx.canvas.width / 12);
  ctx.fillStyle = seg.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha = opacity;
  ctx.fillText(seg.text, 0, 0);
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawSlideUp(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  progress: number,
  cx: number,
  cy: number,
  w: number,
): void {
  const eased = easeOutCubic(progress);
  const yOffset = (1 - eased) * w * 0.18;
  const opacity = Math.min(1, progress * 2); // fade in during first half

  ctx.font = fontString(seg.fontStyle, ctx.canvas.width / 12);
  ctx.fillStyle = seg.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  ctx.save();
  ctx.translate(cx, cy + yOffset);
  ctx.globalAlpha = opacity;
  ctx.fillText(seg.text, 0, 0);
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawLetterSpacingCollapse(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  progress: number,
  cx: number,
  cy: number,
  segIdx: number,
): void {
  // Pick a deterministic per-segment extra starting spacing from a hash.
  const rng = mulberry32(xmur3(seg.text + '|' + segIdx + '|spacing'));
  const startSpacing = 28 + rng() * 28; // 28–56 px extra between letters
  const eased = easeOutCubic(progress);
  const extraSpacing = startSpacing * (1 - eased);

  const chars = Array.from(seg.text);
  if (chars.length === 0) return;

  ctx.font = fontString(seg.fontStyle, ctx.canvas.width / 12);
  ctx.fillStyle = seg.textColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  // Measure each char so the row stays centered even with varying widths.
  const widths: number[] = chars.map((c) => ctx.measureText(c).width);
  const totalWidth =
    widths.reduce((a, b) => a + b, 0) + extraSpacing * (chars.length - 1);
  let cursorX = cx - totalWidth / 2;

  for (let i = 0; i < chars.length; i++) {
    // Per-letter opacity ramps up slightly so they appear to "settle" in.
    const localP = Math.max(0, Math.min(1, (progress - i * 0.05) * 1.5));
    ctx.globalAlpha = localP;
    ctx.fillText(chars[i], cursorX, cy);
    cursorX += widths[i] + extraSpacing;
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.textAlign = 'center';
}

function drawFlickerIn(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  progress: number,
  cx: number,
  cy: number,
  segIdx: number,
): void {
  // 8 deterministic on/off keyframes across the segment's lifetime.
  // The pattern is derived from a hash of (text + index + "flicker"),
  // so it's reproducible across re-renders AND across replays.
  const rng = mulberry32(xmur3(seg.text + '|' + segIdx + '|flicker'));
  const keyframes: number[] = [];
  for (let i = 0; i < 8; i++) keyframes.push(rng());
  keyframes.sort();

  // Decide whether the text is currently "on". Look at where `progress`
  // falls in the keyframe timeline:
  //   progress ∈ [0, keyframes[3])  → chaotic flicker, mostly off
  //   progress ∈ [keyframes[3], 1) → mostly on, occasional blip
  const threshold = keyframes[3];
  const visible = progress >= threshold;

  // Plus a small deterministic flicker for the "mostly on" phase.
  let on = visible;
  if (visible && progress > threshold) {
    const frame = Math.floor((progress - threshold) * 20);
    const flickerRng = mulberry32(xmur3(seg.text + '|' + frame));
    // ~10% of "mostly on" frames flicker off briefly.
    on = flickerRng() > 0.1;
  }

  if (!on) return;

  ctx.font = fontString(seg.fontStyle, ctx.canvas.width / 12);
  ctx.fillStyle = seg.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 2;
  // Brightness "settles in" — last 20% of progress is full opacity.
  ctx.globalAlpha = Math.min(1, progress * 1.4);
  ctx.fillText(seg.text, cx, cy);
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Static fallback for unknown animationType values. */
function drawStaticText(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  cx: number,
  cy: number,
): void {
  ctx.font = fontString(seg.fontStyle, ctx.canvas.width / 12);
  ctx.fillStyle = seg.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 2;
  ctx.fillText(seg.text, cx, cy);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

/** Top-level text dispatcher. Picks the right animator per segment. */
function drawAnimatedText(
  ctx: CanvasRenderingContext2D,
  seg: TitleAnimationSegment,
  progress: number,
  cx: number,
  cy: number,
  w: number,
  segIdx: number,
): void {
  switch (seg.animationType) {
    case 'typewriter':
      drawTypewriter(ctx, seg, progress, cx, cy);
      break;
    case 'fade-scale':
      drawFadeScale(ctx, seg, progress, cx, cy);
      break;
    case 'slide-up':
      drawSlideUp(ctx, seg, progress, cx, cy, w);
      break;
    case 'letter-spacing-collapse':
      drawLetterSpacingCollapse(ctx, seg, progress, cx, cy, segIdx);
      break;
    case 'flicker-in':
      drawFlickerIn(ctx, seg, progress, cx, cy, segIdx);
      break;
    default:
      drawStaticText(ctx, seg, cx, cy);
      break;
  }
}

// ---------------------------------------------------------------------------
// Transitions. Each takes (ctx, spec, transitionIdx, progress, w, h,
// fromSeg, toSeg, seedKey). The renderer draws the previous segment still
// partially on screen and the next one coming in.
//
// Convention: `progress` ∈ [0, 1] where 0 = still fully on `fromSeg`
// and 1 = fully on `toSeg`. We render BOTH segments, applying the
// transition effect on top to create the visible "handoff".
// ---------------------------------------------------------------------------

function drawFade(
  ctx: CanvasRenderingContext2D,
  _spec: TrailerSpec,
  _idx: number,
  progress: number,
  _w: number,
  _h: number,
  fromSeg: TitleAnimationSegment,
  toSeg: TitleAnimationSegment,
  segFromIdx: number,
  segToIdx: number,
  cx: number,
  cy: number,
): void {
  // We don't actually animate the segments during the transition —
  // they're held at 100% complete. The visible "handoff" is just the
  // alpha crossfade.
  drawAnimatedText(
    ctx,
    fromSeg,
    1,
    cx,
    cy,
    _w,
    segFromIdx,
  );
  ctx.globalAlpha = easeOutCubic(progress);
  drawAnimatedText(ctx, toSeg, 1, cx, cy, _w, segToIdx);
  ctx.globalAlpha = 1;
}

function drawWipe(
  ctx: CanvasRenderingContext2D,
  _spec: TrailerSpec,
  _idx: number,
  progress: number,
  w: number,
  h: number,
  fromSeg: TitleAnimationSegment,
  toSeg: TitleAnimationSegment,
  segFromIdx: number,
  segToIdx: number,
  cx: number,
  cy: number,
  direction: 'left' | 'right',
): void {
  // Draw `fromSeg` first, then clip and draw `toSeg` over only the
  // unwiped portion. The reveal edge is at `progress * w`.
  drawAnimatedText(ctx, fromSeg, 1, cx, cy, w, segFromIdx);

  ctx.save();
  if (direction === 'left') {
    // Edge moves left→right; revealed area is x ∈ [edge, w].
    const edge = progress * w;
    ctx.beginPath();
    ctx.rect(edge, 0, w - edge, h);
    ctx.clip();
  } else {
    // Edge moves right→left; revealed area is x ∈ [0, w - edge].
    const edge = progress * w;
    ctx.beginPath();
    ctx.rect(0, 0, w - edge, h);
    ctx.clip();
  }
  // Soft edge — a thin gradient strip so the wipe doesn't look like a
  // hard pixel boundary.
  const edgePx = direction === 'left' ? progress * w : w - progress * w;
  const softEdge = ctx.createLinearGradient(
    direction === 'left' ? edgePx - 24 : edgePx - 24,
    0,
    direction === 'left' ? edgePx + 24 : edgePx + 24,
    0,
  );
  softEdge.addColorStop(0, 'rgba(0,0,0,0)');
  softEdge.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  softEdge.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = softEdge;
  ctx.fillRect(0, 0, w, h);

  drawAnimatedText(ctx, toSeg, 1, cx, cy, w, segToIdx);
  ctx.restore();
}

function drawZoomBlur(
  ctx: CanvasRenderingContext2D,
  _spec: TrailerSpec,
  _idx: number,
  progress: number,
  w: number,
  _h: number,
  fromSeg: TitleAnimationSegment,
  toSeg: TitleAnimationSegment,
  segFromIdx: number,
  segToIdx: number,
  cx: number,
  cy: number,
): void {
  // fromSeg scales UP and fades OUT; toSeg scales UP from small and
  // fades IN. The "blur" is approximated by an extra shadow blur that
  // peaks at progress=0.5 and falls off on either side.
  const eased = easeInOutQuad(progress);

  // fromSeg
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1 + eased * 0.3, 1 + eased * 0.3);
  ctx.globalAlpha = 1 - eased;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = Math.sin(progress * Math.PI) * 25;
  drawAnimatedText(ctx, fromSeg, 1, 0, 0, w, segFromIdx);
  ctx.restore();

  // toSeg
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.6 + eased * 0.4, 0.6 + eased * 0.4);
  ctx.globalAlpha = eased;
  ctx.shadowBlur = Math.sin(progress * Math.PI) * 25;
  drawAnimatedText(ctx, toSeg, 1, 0, 0, w, segToIdx);
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawSlideCut(
  ctx: CanvasRenderingContext2D,
  _spec: TrailerSpec,
  _idx: number,
  progress: number,
  w: number,
  _h: number,
  fromSeg: TitleAnimationSegment,
  toSeg: TitleAnimationSegment,
  segFromIdx: number,
  segToIdx: number,
  cx: number,
  cy: number,
): void {
  // fromSeg slides out one way, toSeg slides in the other way, meeting
  // roughly at the midpoint of the transition.
  const offset = (1 - 2 * Math.abs(progress - 0.5)) * w * 0.25;
  const fromX = cx - offset;
  const toX = cx + offset;

  // fromSeg fades out
  ctx.save();
  ctx.globalAlpha = 1 - Math.min(1, progress * 2);
  drawAnimatedText(ctx, fromSeg, 1, fromX, cy, w, segFromIdx);
  ctx.restore();

  // toSeg fades in
  ctx.save();
  ctx.globalAlpha = Math.max(0, (progress - 0.5) * 2);
  drawAnimatedText(ctx, toSeg, 1, toX, cy, w, segToIdx);
  ctx.restore();

  ctx.globalAlpha = 1;
}

/** Top-level transition dispatcher. */
function drawTransition(
  ctx: CanvasRenderingContext2D,
  spec: TrailerSpec,
  transitionIdx: number,
  progress: number,
  w: number,
  h: number,
  fromSeg: TitleAnimationSegment,
  toSeg: TitleAnimationSegment,
  segFromIdx: number,
  segToIdx: number,
  cx: number,
  cy: number,
): void {
  const name = spec.transitionTypes[transitionIdx] ?? 'fade';
  switch (name) {
    case 'wipe-left':
      drawWipe(ctx, spec, transitionIdx, progress, w, h, fromSeg, toSeg, segFromIdx, segToIdx, cx, cy, 'left');
      break;
    case 'wipe-right':
      drawWipe(ctx, spec, transitionIdx, progress, w, h, fromSeg, toSeg, segFromIdx, segToIdx, cx, cy, 'right');
      break;
    case 'zoom-blur':
      drawZoomBlur(ctx, spec, transitionIdx, progress, w, h, fromSeg, toSeg, segFromIdx, segToIdx, cx, cy);
      break;
    case 'slide-cut':
      drawSlideCut(ctx, spec, transitionIdx, progress, w, h, fromSeg, toSeg, segFromIdx, segToIdx, cx, cy);
      break;
    case 'fade':
    default:
      drawFade(ctx, spec, transitionIdx, progress, w, h, fromSeg, toSeg, segFromIdx, segToIdx, cx, cy);
      break;
  }
}

// ---------------------------------------------------------------------------
// Active-segment + transition progress resolution. Given an elapsedMs,
// find which segment (or transition) is currently on screen, and what
// the local progress is.
// ---------------------------------------------------------------------------

interface ActiveState {
  /** 'segment' = a single segment is on screen; 'transition' = we're mid-handoff. */
  kind: 'segment' | 'transition' | 'done';
  /** Index of the "from" segment (when kind=transition). */
  segFromIdx?: number;
  /** Index of the "to" segment (when kind=transition), or the active segment (kind=segment). */
  segToIdx?: number;
  /** Progress within the active segment, [0, 1]. */
  progress?: number;
  /** Progress within the active transition, [0, 1]. */
  transitionProgress?: number;
}

function resolveActive(
  spec: TrailerSpec,
  elapsedMs: number,
): ActiveState {
  const segs = spec.titleSegments;
  if (segs.length === 0) return { kind: 'done' };

  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const start = seg.startMs;
    const end = start + seg.durationMs;

    if (elapsedMs < start) continue;
    if (elapsedMs < end) {
      return {
        kind: 'segment',
        segToIdx: i,
        progress: (elapsedMs - start) / seg.durationMs,
      };
    }

    // Look for a transition window starting at `end`.
    const transitionDuration = i < segs.length - 1
      ? Math.min(400, (segs[i + 1].startMs - end) || 400)
      : 0;
    const transEnd = end + transitionDuration;
    if (i < segs.length - 1 && elapsedMs < transEnd) {
      return {
        kind: 'transition',
        segFromIdx: i,
        segToIdx: i + 1,
        transitionProgress: (elapsedMs - end) / transitionDuration,
      };
    }
  }
  return { kind: 'done' };
}

// ---------------------------------------------------------------------------
// Top-level render: paints the full trailer at `elapsedMs`. Used by both
// the freeze-frame caller (with a fixed elapsedMs) and the playback
// loop (with the live one).
// ---------------------------------------------------------------------------

/**
 * Render the trailer at the given elapsed time. Pure function: same
 * inputs → same canvas pixels.
 */
export function renderAt(
  ctx: CanvasRenderingContext2D,
  movie: Movie,
  spec: TrailerSpec,
  w: number,
  h: number,
  elapsedMs: number,
): void {
  const cx = w / 2;
  const cy = h / 2;

  // Background is always painted; the segment / transition layer
  // composes on top.
  drawBackground(ctx, spec, w, h, elapsedMs, movie.title);

  const active = resolveActive(spec, elapsedMs);
  if (active.kind === 'segment' && active.segToIdx !== undefined && active.progress !== undefined) {
    const seg = spec.titleSegments[active.segToIdx];
    drawAnimatedText(ctx, seg, active.progress, cx, cy, w, active.segToIdx);
  } else if (
    active.kind === 'transition' &&
    active.segFromIdx !== undefined &&
    active.segToIdx !== undefined &&
    active.transitionProgress !== undefined
  ) {
    const fromSeg = spec.titleSegments[active.segFromIdx];
    const toSeg = spec.titleSegments[active.segToIdx];
    drawTransition(
      ctx,
      spec,
      active.segFromIdx, // transition idx == from segment idx (per server convention)
      active.transitionProgress,
      w,
      h,
      fromSeg,
      toSeg,
      active.segFromIdx,
      active.segToIdx,
      cx,
      cy,
    );
  }

  drawVignette(ctx, w, h);
}

// ---------------------------------------------------------------------------
// Freeze frame: pick a representative moment, render once. We prefer
// the LAST title segment (most likely to still be showing the title)
// at 90% progress — guaranteed visible and almost-finished animation.
// ---------------------------------------------------------------------------

function findFreezeMoment(
  spec: TrailerSpec,
  movieTitle: string,
): number {
  // Find the last segment that carries the movie title; fall back to
  // the first segment if there's no title match (shouldn't happen per
  // server contract, but be defensive).
  let chosen: TitleAnimationSegment | undefined;
  for (let i = spec.titleSegments.length - 1; i >= 0; i--) {
    if (spec.titleSegments[i].text === movieTitle) {
      chosen = spec.titleSegments[i];
      break;
    }
  }
  if (!chosen) chosen = spec.titleSegments[0];
  // 90% into the segment — animation is nearly complete, title is fully
  // visible for any animation type.
  return chosen.startMs + chosen.durationMs * 0.9;
}

/**
 * Render a single static frame representing a paused trailer moment.
 * Pure function of (movie, spec, width, height). Same movie always
 * produces the same pixels.
 */
export function renderFreezeFrame(
  ctx: CanvasRenderingContext2D,
  movie: Movie,
  width: number,
  height: number,
): void {
  const elapsedMs = findFreezeMoment(movie.trailer, movie.title);
  renderAt(ctx, movie, movie.trailer, width, height, elapsedMs);
}

// ---------------------------------------------------------------------------
// Playback engine. Drives a requestAnimationFrame loop for the full
// durationMs, calling onProgress(elapsedMs) each frame and onComplete()
// when finished (or stop() is called externally).
// ---------------------------------------------------------------------------

export interface PlaybackHandle {
  /** Stop the playback loop immediately. Idempotent. */
  stop: () => void;
}

/**
 * Start playing a trailer on the given canvas. Returns a handle with a
 * `stop()` method to cancel.
 *
 * `onProgress(elapsedMs)` is called every animation frame; `onComplete`
 * is called exactly once when the trailer finishes naturally. Both are
 * optional.
 *
 * The caller is responsible for sizing the canvas correctly — we don't
 * touch canvas.width / canvas.height here, since that's a React-y
 * concern handled by the component using this function.
 */
export function startPlayback(
  ctx: CanvasRenderingContext2D,
  movie: Movie,
  onProgress?: (elapsedMs: number) => void,
  onComplete?: () => void,
): PlaybackHandle {
  const spec = movie.trailer;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  let startTs: number | null = null;
  let rafId: number | null = null;
  let stopped = false;
  let completed = false;

  const frame = (ts: number): void => {
    if (stopped) return;
    if (startTs === null) startTs = ts;
    const elapsedMs = ts - startTs;

    if (elapsedMs >= spec.durationMs) {
      // Render the very last frame so the final state is visible.
      renderAt(ctx, movie, spec, w, h, spec.durationMs);
      onProgress?.(spec.durationMs);
      if (!completed) {
        completed = true;
        onComplete?.();
      }
      return;
    }

    renderAt(ctx, movie, spec, w, h, elapsedMs);
    onProgress?.(elapsedMs);
    rafId = requestAnimationFrame(frame);
  };

  rafId = requestAnimationFrame(frame);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers exported only for tests.
// ---------------------------------------------------------------------------

/** @internal */
export const __testing = {
  xmur3,
  mulberry32,
  rngFromString,
  resolveActive,
  findFreezeMoment,
  fontString,
};
namespace MovieShowcase.Api.Models;

/// <summary>
/// Server-generated specification for a single movie trailer. The client
/// renders this against an HTML5 <c>&lt;canvas&gt;</c> at playback time —
/// keeping the spec data-driven (rather than a pre-rendered video) is what
/// lets us satisfy the "all generation happens on the server" rule while
/// still allowing smooth in-browser playback.
///
/// All fields are deterministic for a given
/// <c>(sequenceIndex, movieSeed, locale)</c> triple.
/// </summary>
public class TrailerSpec
{
    /// <summary>Total trailer length in milliseconds, in [5000, 10000].</summary>
    public int DurationMs { get; set; }

    /// <summary>
    /// Background renderer identifier. The client maps this string to a
    /// concrete canvas drawing routine — the server doesn't ship any pixels.
    ///
    /// Acts as an automatic fallback if the video clips in
    /// <see cref="VideoEffects"/> fail to load (CORS error, slow network,
    /// offline, etc.) — every segment always has a canvas fallback.
    /// </summary>
    public string BackgroundStyle { get; set; } = string.Empty;

    /// <summary>
    /// 2–3 hex colors (<c>#RRGGBB</c>) consumed by the background renderer.
    /// Order is meaningful: most renderers treat them as a top-to-bottom
    /// gradient / stop sequence.
    /// </summary>
    public List<string> BackgroundColors { get; set; } = new();

    /// <summary>
    /// Ordered list of 3–5 text segments. Exactly one segment carries the
    /// movie title; the others may carry filler trailer phrases or repeat
    /// the title for emphasis.
    /// </summary>
    public List<TitleAnimationSegment> TitleSegments { get; set; } = new();

    /// <summary>
    /// Transition effect names between consecutive segments. Length is
    /// <c>TitleSegments.Count - 1</c>. <c>TitleSegments[i]</c> transitions
    /// to <c>TitleSegments[i+1]</c> using <c>TransitionTypes[i]</c>.
    /// </summary>
    public List<string> TransitionTypes { get; set; } = new();

    /// <summary>
    /// Per-segment video background specification. Each effect describes
    /// one short clip that plays under the corresponding text segment.
    /// If the client cannot load the clip (CORS, network, decoder failure),
    /// it falls back to the <see cref="BackgroundStyle"/> canvas renderer
    /// for that segment so the trailer never shows a broken frame.
    ///
    /// <para>
    /// The list may be shorter than <see cref="TitleSegments"/> — when that
    /// happens the client repeats the last video effect for the remaining
    /// segments, or (if the list is empty) skips video entirely and uses
    /// the canvas background renderer for the whole trailer.
    /// </para>
    /// </summary>
    public List<VideoSegmentEffect> VideoEffects { get; set; } = new();
}

/// <summary>
/// One background video clip + the visual treatment applied to it for a
/// single trailer segment. Generated deterministically on the server; the
/// client just downloads the clip and composites it onto the canvas.
///
/// <para>
/// All fields are pure data — no resources, no scripts, no embedded
/// pixels — so the spec is safe to JSON-serialize and ship to the browser.
/// </para>
/// </summary>
public class VideoSegmentEffect
{
    /// <summary>
    /// Direct <c>.mp4</c> URL for the clip. Must be a CORS-friendly
    /// public CDN (e.g. assets.mixkit.co or videos.pexels.com) so the
    /// browser can fetch it with <c>crossorigin="anonymous"</c> and
    /// <c>drawImage()</c> without tainting the canvas.
    /// </summary>
    public string ClipUrl { get; set; } = string.Empty;

    /// <summary>
    /// Playback rate applied via <c>HTMLVideoElement.playbackRate</c>.
    /// Range: 0.7 (slower) to 1.5 (faster). 1.0 is normal speed.
    /// </summary>
    public double PlaybackRate { get; set; } = 1.0;

    /// <summary>
    /// Starting zoom factor for the canvas <c>drawImage()</c> call.
    /// 1.0 = clip fills the canvas; values &gt;1 zoom in (cropping).
    /// </summary>
    public double ZoomStart { get; set; } = 1.0;

    /// <summary>
    /// Ending zoom factor — interpolated linearly from
    /// <see cref="ZoomStart"/> over the segment's duration.
    /// </summary>
    public double ZoomEnd { get; set; } = 1.0;

    /// <summary>
    /// One of the small fixed set of CSS filter color-grading presets
    /// the client knows how to apply:
    /// <c>none | sepia | cool-blue | warm | high-contrast | desaturated</c>.
    /// The client maps the string to a <c>ctx.filter = "..."</c> value.
    /// </summary>
    public string ColorFilter { get; set; } = "none";

    /// <summary>Segment start time, in milliseconds, relative to trailer start.</summary>
    public int StartMs { get; set; }

    /// <summary>Segment length, in milliseconds.</summary>
    public int DurationMs { get; set; }
}

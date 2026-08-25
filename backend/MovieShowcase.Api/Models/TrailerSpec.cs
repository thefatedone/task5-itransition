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
}

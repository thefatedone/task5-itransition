namespace MovieShowcase.Api.Models;

/// <summary>
/// One text segment inside a <see cref="TrailerSpec"/>. A trailer is built
/// by concatenating these segments and transitioning between them.
/// </summary>
public class TitleAnimationSegment
{
    /// <summary>Text to display — either the movie title or a filler phrase.</summary>
    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// Identifier for the per-segment animation (e.g. <c>"typewriter"</c>,
    /// <c>"fade-scale"</c>, <c>"slide-up"</c>, <c>"letter-spacing-collapse"</c>,
    /// <c>"flicker-in"</c>). The client maps this to a canvas animation.
    /// </summary>
    public string AnimationType { get; set; } = string.Empty;

    /// <summary>Start offset within the trailer, in milliseconds.</summary>
    public int StartMs { get; set; }

    /// <summary>How long this segment stays on screen, in milliseconds.</summary>
    public int DurationMs { get; set; }

    /// <summary>
    /// Font style identifier (e.g. <c>"bold-condensed"</c>,
    /// <c>"serif-dramatic"</c>, <c>"sans-wide"</c>). The client picks a
    /// matching <c>font-family</c>/<c>font-weight</c>/<c>font-stretch</c>.
    /// </summary>
    public string FontStyle { get; set; } = string.Empty;

    /// <summary>Text color as <c>#RRGGBB</c>.</summary>
    public string TextColor { get; set; } = string.Empty;
}

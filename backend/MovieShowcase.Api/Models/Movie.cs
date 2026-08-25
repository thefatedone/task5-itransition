namespace MovieShowcase.Api.Models;

/// <summary>
/// One fake movie record produced by the server-side generator.
/// All properties are settable so the generator can populate them after
/// construction; consumers should treat instances as immutable in practice.
/// </summary>
public class Movie
{
    /// <summary>0-based position in the generated sequence for a given (seed, locale).</summary>
    public int SequenceIndex { get; set; }

    /// <summary>Localized title assembled from a template + adjective/noun.</summary>
    public string Title { get; set; } = string.Empty;

    /// <summary>2–4 actor names, generated via Bogus Faker for the locale.</summary>
    public List<string> Actors { get; set; } = new();

    /// <summary>Release year (currently between 1970 and 2026 inclusive).</summary>
    public int Year { get; set; }

    /// <summary>Genre name, picked from the active locale's genres list.</summary>
    public string Genre { get; set; } = string.Empty;

    /// <summary>Trailer metadata. Placeholder for now — filled in a later step.</summary>
    public TrailerSpec Trailer { get; set; } = new();

    /// <summary>Review snippets. Empty for now — populated by a later step.</summary>
    public List<string> Reviews { get; set; } = new();

    /// <summary>Like count. Zero for now — populated by a later step.</summary>
    public int Likes { get; set; }
}

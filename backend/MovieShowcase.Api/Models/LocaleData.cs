namespace MovieShowcase.Api.Models;

/// <summary>
/// Strongly-typed view of a single locale JSON file under <c>/Locales</c>.
/// Mirrors the keys the JSON files use. Extra keys are ignored on load.
/// </summary>
public class LocaleData
{
    /// <summary>Locale identifier (e.g. <c>en-US</c>). Used as the cache key.</summary>
    public string Locale { get; set; } = string.Empty;

    /// <summary>
    /// Human-readable label for the locale (e.g. <c>English (United States)</c>).
    /// Returned by <c>/api/locales</c>. Falls back to <see cref="Locale"/> when
    /// the JSON omits the field.
    /// </summary>
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Locale code passed to <c>Bogus.Faker</c> for personal-name generation.
    ///
    /// Verified against Bogus 35.0.1: <c>en</c>, <c>de</c>, and <c>uk</c> are
    /// all natively supported and produce locale-appropriate names. Bogus is
    /// CASE-SENSITIVE and throws <c>BogusException</c> for unknown codes, so
    /// this value must match exactly (e.g. <c>"uk"</c>, not <c>"UK"</c> or
    /// <c>"uk-UA"</c>). If a future release ever drops <c>uk</c>, switch
    /// this to <c>"ru"</c> (closest Cyrillic fallback) — the rest of the
    /// locale data stays untouched.
    /// </summary>
    public string BogusLocaleCode { get; set; } = string.Empty;

    /// <summary>Movie genres available in this locale.</summary>
    public List<string> Genres { get; set; } = new();

    /// <summary>
    /// Title templates using the placeholders <c>{adjective}</c>, <c>{noun}</c>,
    /// and <c>{subtitle}</c>. At least 8 templates per locale.
    /// </summary>
    public List<string> TitleTemplates { get; set; } = new();

    /// <summary>Adjectives used to fill <c>{adjective}</c> in templates.</summary>
    public List<string> TitleAdjectives { get; set; } = new();

    /// <summary>Nouns used to fill <c>{noun}</c> in templates.</summary>
    public List<string> TitleNouns { get; set; } = new();

    /// <summary>Subtitles used to fill <c>{subtitle}</c> in templates.</summary>
    public List<string> TitleSubtitles { get; set; } = new();

    // -------------------------------------------------------------------
    // Review text — used by ReviewTextGenerator to assemble per-movie
    // review sentences from templates + word lists. All phrase components
    // live here (not in C# code) so a translator never needs to touch
    // the generator to localize reviews. The locale's word lists should
    // be sized to comfortably fill every template — at least 20
    // opinions, 15 aspects, 15 verbs, and 10 recommendations.
    // -------------------------------------------------------------------

    /// <summary>
    /// Review sentence templates. Each template may use any subset of
    /// <c>{opinion}</c>, <c>{opinion2}</c>, <c>{aspect}</c>, <c>{verb}</c>,
    /// and <c>{recommendation}</c>; the renderer picks one value per
    /// placeholder type per review using the movie's seeded
    /// <see cref="Random"/>. At least 8 templates per locale.
    /// </summary>
    public List<string> ReviewTemplates { get; set; } = new();

    /// <summary>
    /// Adjectives / adjectival phrases describing a film's overall
    /// quality — used for <c>{opinion}</c> and <c>{opinion2}</c>.
    /// At least 20 per locale.
    /// </summary>
    public List<string> ReviewOpinions { get; set; } = new();

    /// <summary>
    /// Noun phrases naming a specific film element — used for
    /// <c>{aspect}</c>. At least 15 per locale.
    /// </summary>
    public List<string> ReviewAspects { get; set; } = new();

    /// <summary>
    /// Verb phrases (past tense) describing what the <c>{aspect}</c> did
    /// to the reviewer — used for <c>{verb}</c>. At least 15 per locale.
    /// </summary>
    public List<string> ReviewVerbs { get; set; } = new();

    /// <summary>
    /// Closing recommendation phrases — used for
    /// <c>{recommendation}</c>. At least 10 per locale.
    /// </summary>
    public List<string> ReviewRecommendations { get; set; } = new();
}

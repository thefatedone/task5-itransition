using MovieShowcase.Api.Models;

namespace MovieShowcase.Api.Services;

/// <summary>
/// Assembles per-movie review sentences by picking a template from the locale
/// JSON and substituting placeholders with values drawn from the locale's
/// word lists. All phrase components live in the JSON — this class only
/// knows the placeholder names (<c>{opinion}</c>, <c>{aspect}</c>, etc.), so
/// translators never need to touch C# to localize reviews.
///
/// Determinism contract: every random draw goes through the caller-supplied
/// <see cref="Random"/>, which is itself seeded with the movie's
/// <c>movieSeed</c>. As long as the per-template draw order documented below
/// is preserved, the same input tuple produces the same review string —
/// across processes, machines, and time.
/// </summary>
public static class ReviewTextGenerator
{
    /// <summary>
    /// Generates a single review string for a movie.
    ///
    /// Draw order (must be stable for determinism):
    ///   1. <c>template</c>           — from <see cref="LocaleData.ReviewTemplates"/>
    ///   2. <c>opinion</c>            — from <see cref="LocaleData.ReviewOpinions"/> (if used)
    ///   3. <c>opinion2</c>           — from <see cref="LocaleData.ReviewOpinions"/> (if used)
    ///   4. <c>aspect</c>             — from <see cref="LocaleData.ReviewAspects"/>  (if used)
    ///   5. <c>verb</c>               — from <see cref="LocaleData.ReviewVerbs"/>    (if used)
    ///   6. <c>recommendation</c>     — from <see cref="LocaleData.ReviewRecommendations"/> (if used)
    ///
    /// Only placeholders actually present in the chosen template are drawn,
    /// so adding new placeholder types in the future is backwards-compatible
    /// (the generator simply draws extra values when the template uses them).
    /// </summary>
    public static string GenerateReview(Random rng, LocaleData locale)
    {
        // Step 1 — Pick a template.
        var template = PickOne(locale.ReviewTemplates, rng);

        // Steps 2..6 — Draw one value per placeholder type the template
        // actually references. We probe with IndexOf rather than a regex so
        // the placeholder detection is cheap and allocation-free.
        string result = template;

        if (NeedsPlaceholder(template, "{opinion}"))
        {
            result = result.Replace("{opinion}", PickOne(locale.ReviewOpinions, rng));
        }

        if (NeedsPlaceholder(template, "{opinion2}"))
        {
            // opinion2 is intentionally drawn AFTER opinion — same word
            // list, but a separate draw so templates can request two
            // distinct opinions.
            result = result.Replace("{opinion2}", PickOne(locale.ReviewOpinions, rng));
        }

        if (NeedsPlaceholder(template, "{aspect}"))
        {
            result = result.Replace("{aspect}", PickOne(locale.ReviewAspects, rng));
        }

        if (NeedsPlaceholder(template, "{verb}"))
        {
            result = result.Replace("{verb}", PickOne(locale.ReviewVerbs, rng));
        }

        if (NeedsPlaceholder(template, "{recommendation}"))
        {
            result = result.Replace("{recommendation}", PickOne(locale.ReviewRecommendations, rng));
        }

        return result;
    }

    /// <summary>
    /// Generates <paramref name="count"/> reviews for a single movie, each
    /// drawn independently through the shared <paramref name="rng"/>.
    /// </summary>
    public static List<string> GenerateReviews(Random rng, LocaleData locale, int count)
    {
        var reviews = new List<string>(count);
        for (var i = 0; i < count; i++)
        {
            reviews.Add(GenerateReview(rng, locale));
        }
        return reviews;
    }

    // -----------------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------------

    private static string PickOne(IList<string> list, Random rng)
    {
        if (list.Count == 0)
        {
            throw new InvalidOperationException(
                "Review word list is empty — LocalizationService should have " +
                "rejected the locale at startup.");
        }
        return list[rng.Next(list.Count)];
    }

    private static bool NeedsPlaceholder(string template, string placeholder)
        => template.IndexOf(placeholder, StringComparison.Ordinal) >= 0;
}
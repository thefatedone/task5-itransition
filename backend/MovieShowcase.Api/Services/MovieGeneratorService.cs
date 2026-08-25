using Bogus;
using MovieShowcase.Api.Models;

namespace MovieShowcase.Api.Services;

/// <summary>
/// Bogus-backed implementation of <see cref="IMovieGeneratorService"/>.
///
/// Determinism guarantee: each call constructs a fresh <see cref="Random"/>
/// seeded with the caller-provided <c>movieSeed</c>, so the same
/// (sequenceIndex, movieSeed, locale, likesAvg, reviewsAvg) tuple always
/// produces the same movie — across processes, machines, and time. We never
/// use <c>DateTime.Now</c>, <c>Guid.NewGuid()</c>, or a shared static random
/// source.
///
/// Localization: all genre names, title templates, and template words are
/// read from the locale JSON via <see cref="LocalizationService"/>. Nothing
/// region-specific lives in this file.
/// </summary>
public sealed class MovieGeneratorService : IMovieGeneratorService
{
    private readonly LocalizationService _localization;

    public MovieGeneratorService(LocalizationService localization)
    {
        _localization = localization;
    }

    public Movie GenerateMovie(
        int sequenceIndex,
        int movieSeed,
        string locale,
        double likesAvg,
        double reviewsAvg)
    {
        var data = _localization.GetLocaleData(locale);

        // Per-call deterministic RNG for OUR custom generation code
        // (titles, genres, years, likes, reviews, trailer). Seeded with the
        // caller-mixed movieSeed. Never reused across calls.
        var rng = new Random(movieSeed);

        // Bogus Faker needs its OWN Bogus.Randomizer (Faker.Random is of
        // type Bogus.Randomizer in v35.x — it's not a System.Random, and
        // there's no constructor that wraps one). We give Faker a
        // Randomizer seeded with the SAME movieSeed; Bogus then advances
        // its internal state deterministically from there for Faker.Name,
        // Faker.Lorem, etc. Determinism is preserved as long as we never
        // touch Bogus's Randomizer from the outside.
        var faker = new Faker(data.BogusLocaleCode)
        {
            Random = new Randomizer(movieSeed)
        };

        // -----------------------------------------------------------------
        // Deterministic call order of `rng` within GenerateMovie.
        //
        // The same sequence MUST be followed for every call, otherwise
        // results diverge. The order is fixed; only the per-step counts
        // below can vary based on input.
        // -----------------------------------------------------------------

        // Step 1 — Title assembly.
        //   rng calls: 4  (template, adjective, noun, subtitle indices)
        //   Bogus calls: 0
        var title = BuildTitle(data, rng);

        // Step 2 — Actors.
        //   rng calls: 1  (count = 2..4)
        //   Bogus Randomizer calls: up to ~count × ~3 per faker.Name.FullName()
        //               attempt (Faker draws first/last/etc. internally;
        //                attempts may exceed count due to the uniqueness loop)
        var actors = BuildActors(faker, rng);

        // Step 3 — Genre.
        //   rng calls: 1
        var genre = Pick(data.Genres, rng);

        // Step 4 — Year.
        //   rng calls: 1
        var year = rng.Next(1970, 2027); // upper bound is exclusive → 1970..2026

        // Step 5 — Likes (probabilistic).
        //   rng calls: 0 if likesAvg is a whole number, else 1 (NextDouble).
        var likes = ProbabilisticCountGenerator.GenerateCount(likesAvg, rng);

        // Step 6 — Reviews count (probabilistic).
        //   rng calls: 0 if reviewsAvg is whole, else 1.
        var reviewCount = ProbabilisticCountGenerator.GenerateCount(reviewsAvg, rng);

        // Step 7 — Reviews text.
        //   rng calls per review: 1 (template) + N (one per placeholder
        //                         type the template actually uses — see
        //                         ReviewTextGenerator.GenerateReview).
        //   Bogus Randomizer calls: 0 — reviews are fully locale-driven,
        //               no faker.Lorem involvement.
        var reviews = ReviewTextGenerator.GenerateReviews(rng, data, reviewCount);

        // Step 8 — Trailer spec. MUST run after Step 1, because it uses
        //          `title` for the mandatory title segment.
        //   rng calls: ~30–45 depending on segment / color counts:
        //     1  duration
        //     1  background style
        //     1  background color count (2..3)
        //     3 × backgroundColorCount (RGB per color)
        //     1  segment count (3..5)
        //     1  filler count (0..2)
        //     fillerCount  filler picks
        //     segmentCount  weight picks
        //     segmentCount × 5  (animation, font, 3 RGB for text color)
        //     (segmentCount − 1)  transition picks
        var trailer = TrailerSpecGenerator.Generate(rng, title);

        return new Movie
        {
            SequenceIndex = sequenceIndex,
            Title         = title,
            Actors        = actors,
            Year          = year,
            Genre         = genre,
            Trailer       = trailer,
            Reviews       = reviews,
            Likes         = likes
        };
    }

    // -----------------------------------------------------------------------
    // Title assembly
    // -----------------------------------------------------------------------

    private static string BuildTitle(LocaleData data, Random rng)
    {
        var template = Pick(data.TitleTemplates, rng);

        return template
            .Replace("{adjective}", Pick(data.TitleAdjectives, rng))
            .Replace("{noun}",      Pick(data.TitleNouns,      rng))
            .Replace("{subtitle}",  Pick(data.TitleSubtitles,  rng));
    }

    private static string Pick(IList<string> list, Random rng)
        => list[rng.Next(list.Count)];

    // -----------------------------------------------------------------------
    // Actors
    // -----------------------------------------------------------------------

    private static List<string> BuildActors(Faker faker, Random rng)
    {
        var actorCount = rng.Next(2, 5); // 2..4 inclusive
        var actors = new List<string>(actorCount);
        var seen = new HashSet<string>(StringComparer.Ordinal);

        // Safety budget: stop if Faker keeps producing duplicates (very small
        // locale name pools could in theory loop forever). 10× the desired
        // count is more than enough for any realistic locale.
        var attempts = 0;
        var maxAttempts = Math.Max(20, actorCount * 10);

        while (actors.Count < actorCount && attempts++ < maxAttempts)
        {
            var name = faker.Name.FullName();
            if (seen.Add(name))
            {
                actors.Add(name);
            }
        }

        return actors;
    }

    // -----------------------------------------------------------------------
    // Reviews — moved out of this file into ReviewTextGenerator. The old
    // BuildReviews used faker.Lorem.Sentences, which the task spec
    // explicitly forbids ("Placeholder text such as lorem ipsum is NOT
    // acceptable"). ReviewTextGenerator assembles each review from
    // locale-JSON templates + word lists, with no Lorem anywhere.
    // -----------------------------------------------------------------------
}

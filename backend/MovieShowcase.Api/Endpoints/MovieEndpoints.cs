using MovieShowcase.Api.Models;
using MovieShowcase.Api.Services;

namespace MovieShowcase.Api.Endpoints;

/// <summary>
/// Minimal-API endpoint group for <c>/api/movies</c>.
///
/// Two flavours are exposed:
/// <list type="bullet">
///   <item><c>/api/movies/table</c>   — paginated table view (1-based pages).</item>
///   <item><c>/api/movies/gallery</c> — infinite-scroll batched view (0-based batches).</item>
/// </list>
///
/// Both run the same generator. Pagination vs. batching is just naming — the
/// underlying math (page/batch index → movie seed) is identical.
/// </summary>
public static class MovieEndpoints
{
    // Hard ceilings, enforced server-side.
    private const int MaxPageSize     = 100;
    private const int MaxBatchSize    = 100;
    private const int DefaultPageSize = 20;
    private const int DefaultBatchSize = 12;

    public static IEndpointRouteBuilder MapMovieEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/movies").WithTags("Movies");

        // -------------------------------------------------------------------
        // GET /api/movies/table?locale=&seed=&likesAvg=&reviewsAvg=&page=&pageSize=
        // -------------------------------------------------------------------
        group.MapGet("/table", (
            IMovieGeneratorService generator,
            LocalizationService localization,
            string? locale,
            long? seed,
            double? likesAvg,
            double? reviewsAvg,
            int? page,
            int? pageSize) =>
        {
            if (!TryValidateParams(localization, locale, seed, likesAvg, reviewsAvg,
                                   out var localeCode, out var userSeed,
                                   out var likes, out var reviews,
                                   out var validationError))
            {
                return validationError;
            }

            var pageNumber = Math.Max(1, page ?? 1);
            var size       = Math.Clamp(pageSize ?? DefaultPageSize, 1, MaxPageSize);

            var movies = GenerateBatch(
                generator, localization, localeCode, userSeed,
                likes, reviews,
                pageNumberForSeed: pageNumber,
                startSequenceIndex: (pageNumber - 1) * size + 1,  // 1-based global
                batchSize: size);

            return Results.Ok(new
            {
                movies,
                page,
                pageSize    = size,
                // Always true — generation is infinite, not a fixed dataset.
                hasNextPage = true
            });
        })
        .WithName("GetMoviesTable")
        .WithSummary("Returns a paginated page of server-generated fake movies (table view).");

        // -------------------------------------------------------------------
        // GET /api/movies/gallery?locale=&seed=&likesAvg=&reviewsAvg=&batchIndex=&batchSize=
        // -------------------------------------------------------------------
        group.MapGet("/gallery", (
            IMovieGeneratorService generator,
            LocalizationService localization,
            string? locale,
            long? seed,
            double? likesAvg,
            double? reviewsAvg,
            int? batchIndex,
            int? batchSize) =>
        {
            if (!TryValidateParams(localization, locale, seed, likesAvg, reviewsAvg,
                                   out var localeCode, out var userSeed,
                                   out var likes, out var reviews,
                                   out var validationError))
            {
                return validationError;
            }

            var batchIdx = Math.Max(0, batchIndex ?? 0);
            var batchSz  = Math.Clamp(batchSize ?? DefaultBatchSize, 1, MaxBatchSize);

            var movies = GenerateBatch(
                generator, localization, localeCode, userSeed,
                likes, reviews,
                pageNumberForSeed: batchIdx,            // batchIndex acts as pageNumber in the seed formula
                startSequenceIndex: batchIdx * batchSz + 1, // 1-based global
                batchSize: batchSz);

            return Results.Ok(new
            {
                movies,
                batchIndex,
                batchSize     = batchSz,
                hasNextBatch  = true
            });
        })
        .WithName("GetMoviesGallery")
        .WithSummary("Returns a batch of server-generated fake movies (infinite-scroll gallery view).");

        return app;
    }

    // -------------------------------------------------------------------------
    // Shared helpers
    // -------------------------------------------------------------------------

    /// <summary>
    /// Validate the shared parameters (locale, seed, likesAvg, reviewsAvg)
    /// once, so both endpoints fail the same way on bad input.
    /// </summary>
    private static bool TryValidateParams(
        LocalizationService localization,
        string? locale,
        long? seed,
        double? likesAvg,
        double? reviewsAvg,
        out string localeCode,
        out long userSeed,
        out double likes,
        out double reviews,
        out IResult? error)
    {
        localeCode = string.IsNullOrWhiteSpace(locale) ? "en-US" : locale;
        var available = localization.GetAvailableLocales();
        if (!available.Contains(localeCode, StringComparer.OrdinalIgnoreCase))
        {
            error = Results.BadRequest(new
            {
                error     = "unknown_locale",
                locale    = localeCode,
                available
            });
            userSeed = 0; likes = 0; reviews = 0;
            return false;
        }

        // 48+ bit seed; reject negatives so the user-supplied value is always
        // a non-negative integer in the documented range.
        userSeed = seed ?? 0;
        if (userSeed < 0)
        {
            error = Results.BadRequest(new
            {
                error   = "invalid_seed",
                message = "seed must be a non-negative integer (up to 48+ bits).",
                seed    = userSeed
            });
            likes = 0; reviews = 0;
            return false;
        }

        likes    = likesAvg    ?? 1.0;
        reviews  = reviewsAvg  ?? 1.0;

        if (likes < 0.0 || likes > 10.0 || double.IsNaN(likes))
        {
            error = Results.BadRequest(new
            {
                error     = "invalid_likes_avg",
                message   = "likesAvg must be in [0, 10].",
                likesAvg  = likes,
                range     = new[] { 0, 10 }
            });
            reviews = 0;
            return false;
        }

        if (reviews < 0.0 || reviews > 10.0 || double.IsNaN(reviews))
        {
            error = Results.BadRequest(new
            {
                error       = "invalid_reviews_avg",
                message     = "reviewsAvg must be in [0, 10].",
                reviewsAvg  = reviews,
                range       = new[] { 0, 10 }
            });
            return false;
        }

        error = null;
        return true;
    }

    /// <summary>
    /// Run the generator for a batch of movies. The page-level seed is
    /// derived from the user seed and the supplied index; each movie gets its
    /// own movieSeed derived from the page seed + its global sequenceIndex.
    /// </summary>
    private static List<Movie> GenerateBatch(
        IMovieGeneratorService generator,
        LocalizationService localization,
        string localeCode,
        long userSeed,
        double likes,
        double reviews,
        int pageNumberForSeed,
        int startSequenceIndex,
        int batchSize)
    {
        // Touch localization so DI is consistent even if we end up not needing
        // the service in this method (and to keep the signature symmetric with
        // TryValidateParams for future expansion).
        _ = localization;

        var pageSeed = SeedCalculator.CalculatePageSeed(userSeed, pageNumberForSeed);
        var movies = new List<Movie>(batchSize);

        for (var i = 0; i < batchSize; i++)
        {
            var sequenceIndex = startSequenceIndex + i;
            var movieSeed = SeedCalculator.CalculateMovieSeed(pageSeed, sequenceIndex);
            movies.Add(generator.GenerateMovie(
                sequenceIndex, movieSeed, localeCode, likes, reviews));
        }

        return movies;
    }
}

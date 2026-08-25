using MovieShowcase.Api.Models;

namespace MovieShowcase.Api.Services;

/// <summary>
/// Generates a single fake movie. Implementations must be deterministic for a
/// given (<paramref name="sequenceIndex"/>, <paramref name="movieSeed"/>,
/// <paramref name="locale"/>, <paramref name="likesAvg"/>,
/// <paramref name="reviewsAvg"/>) tuple — no <c>DateTime.Now</c>, no
/// <c>Guid.NewGuid()</c>, no shared static <c>Random</c>.
/// </summary>
public interface IMovieGeneratorService
{
    /// <summary>
    /// Generate the movie at position <paramref name="sequenceIndex"/> using
    /// <paramref name="movieSeed"/> as the source of all randomness.
    /// </summary>
    /// <param name="sequenceIndex">
    /// Globally-unique 1-based position within the (seed, locale) sequence.
    /// Used as the <see cref="Movie.SequenceIndex"/>; the endpoint layer is
    /// responsible for keeping it monotonic across pages/batches.
    /// </param>
    /// <param name="movieSeed">
    /// The pre-mixed seed for this specific movie (computed via
    /// <see cref="SeedCalculator.CalculateMovieSeed"/>).
    /// </param>
    /// <param name="locale">Locale code the generation should run in.</param>
    /// <param name="likesAvg">Target average likes (0–10, fractional OK).</param>
    /// <param name="reviewsAvg">Target average reviews (0–10, fractional OK).</param>
    Movie GenerateMovie(
        int sequenceIndex,
        int movieSeed,
        string locale,
        double likesAvg,
        double reviewsAvg);
}

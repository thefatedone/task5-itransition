namespace MovieShowcase.Api.Services;

/// <summary>
/// Produces an integer count whose long-run average equals a supplied
/// fractional target. Used by the movie generator to realise fractional
/// <c>likesAvg</c> / <c>reviewsAvg</c> values (e.g. 3.7 → mostly 4s with a
/// 30% chance of 3, so the mean converges to 3.7 across many movies).
///
/// Always pass the movie's own <see cref="Random"/> instance so the result is
/// reproducible per (sequenceIndex, movieSeed).
/// </summary>
public static class ProbabilisticCountGenerator
{
    /// <summary>
    /// Returns <c>floor(average)</c> with probability <c>1 - frac</c>, and
    /// <c>floor(average) + 1</c> with probability <c>frac</c>.
    ///
    /// Examples:
    /// <list type="bullet">
    ///   <item><c>average = 0</c>   → always <c>0</c>.</item>
    ///   <item><c>average = 10</c>  → always <c>10</c>.</item>
    ///   <item><c>average = 0.5</c> → <c>0</c> or <c>1</c>, 50/50.</item>
    ///   <item><c>average = 3.7</c> → <c>3</c> with 30%, <c>4</c> with 70%.</item>
    /// </list>
    /// </summary>
    public static int GenerateCount(double average, Random random)
    {
        ArgumentNullException.ThrowIfNull(random);

        // Defensive normalization. The spec says 0–10, but a stray negative or
        // NaN shouldn't be able to crash generation.
        if (double.IsNaN(average) || double.IsInfinity(average) || average < 0d)
        {
            average = 0d;
        }

        var floor = (int)Math.Floor(average);
        var fractional = average - floor;

        // No fractional part, or the fractional part is effectively zero:
        // no random roll needed, return the deterministic floor.
        if (fractional <= 0d)
        {
            return floor;
        }

        // Otherwise roll a uniform [0, 1) and bump if we're within the
        // fractional band.
        return floor + (random.NextDouble() < fractional ? 1 : 0);
    }
}

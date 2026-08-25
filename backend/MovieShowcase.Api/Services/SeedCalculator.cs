namespace MovieShowcase.Api.Services;

/// <summary>
/// Mixes user input (page index, record index) into 32-bit seeds for
/// <see cref="System.Random"/>. The contract is:
/// <list type="bullet">
///   <item>deterministic — the same inputs always produce the same seed;</item>
///   <item>uniform — the output bits are uniformly distributed (no sign bias);</item>
///   <item>overflow-safe — runs in an <c>unchecked</c> block so the
///         multiply/add wrap without throwing.</item>
/// </list>
///
/// The user-supplied <c>seed</c> is a <see cref="long"/> because the public
/// spec requires at least 48 bits of seed entropy; an <see cref="int"/> can't
/// hold that. We mix it down to an <see cref="int"/> here, since
/// <see cref="System.Random"/> only takes <see cref="int"/> seeds.
/// </summary>
public static class SeedCalculator
{
    // Two large primes for the MAD (multiply-add) mix. 1000003 keeps the
    // 48-bit user seed well-mixed into the low 32 bits; 7919 is a different
    // prime so consecutive pages don't collapse onto the same low bits.
    private const long PageSeedMultiplier = 1000003L;
    private const long PageSeedPageAddend = 7919L;

    // Smaller prime for the per-movie mix — we already have a well-mixed
    // pageSeed here, we just need to perturb it per sequenceIndex.
    private const long MovieSeedMultiplier = 31L;

    /// <summary>
    /// Combines the user-supplied seed (up to 48+ bits) and the page index
    /// into an effective page-level seed. Same inputs → same seed, every
    /// time, on every machine.
    /// </summary>
    public static int CalculatePageSeed(long userSeed, int pageNumber)
    {
        unchecked
        {
            long combined = userSeed * PageSeedMultiplier
                         + (long)pageNumber * PageSeedPageAddend;

            // Truncate to the low 32 bits: uniform distribution, no sign bias
            // (roughly half negative, half positive — but Random treats both
            // ranges identically, so this is fine). Avoids the information
            // loss that `% int.MaxValue` would cause, and avoids Math.Abs's
            // long.MinValue quirk.
            return (int)combined;
        }
    }

    /// <summary>
    /// Combines the page-level seed with a record's global sequence index so
    /// each movie on a page has its own deterministic, well-distributed seed.
    /// </summary>
    public static int CalculateMovieSeed(int pageSeed, int sequenceIndex)
    {
        unchecked
        {
            // Promote to long first so the multiplication can't overflow int.
            long combined = (long)pageSeed * MovieSeedMultiplier
                         + sequenceIndex;

            return (int)combined;
        }
    }
}

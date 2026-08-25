using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using MovieShowcase.Api.Models;
using MovieShowcase.Api.Services;

// Determinism probe for the TrailerSpec / Movie generation pipeline.
//
// Verifies three contracts:
//   1. STABILITY: calling the pipeline N times with the same seed yields
//      byte-for-byte identical Movie JSON.
//   2. SENSITIVITY: sufficiently-different seeds yield different movies
//      (sanity: the generator isn't a constant or a hash of one input).
//   3. REVIEW STABILITY: the Reviews array is byte-equal across repeated
//      calls — guards against accidental non-determinism introduced by
//      the new ReviewTextGenerator (template-pick + placeholder draws).
//
// NOTE on seed symmetry: .NET's Random(int Seed) normalises the seed via
// Math.Abs, so Random(+x) and Random(-x) yield identical sequences for any
// x. This is documented runtime behaviour, not a generator bug. We avoid
// ±x pairs in the sensitivity set so we don't confuse a feature of the
// RNG for a bug in our code.

Console.OutputEncoding = System.Text.Encoding.UTF8;

// LocalizationService wants an IWebHostEnvironment whose ContentRootPath is
// the API project (where /Locales lives).
var apiRoot = Path.GetFullPath(Path.Combine(
    AppContext.BaseDirectory,
    "..", "..", "..", "..", "MovieShowcase.Api"));

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    ContentRootPath = apiRoot,
    EnvironmentName = "Development"
});

var localization = new LocalizationService(
    (IWebHostEnvironment)builder.Services
        .BuildServiceProvider()
        .GetService(typeof(IWebHostEnvironment))!);

var generator = new MovieGeneratorService(localization);

var options = new JsonSerializerOptions
{
    WriteIndented = false,
    PropertyNameCaseInsensitive = true
};

// ---------- 1. Stability across many seeds, many calls each ----------

var stabilitySeeds = new long[] { 1, 42, 12345, 99_999_999, 2_000_000_001 };
const int callsPerSeed = 8;

Console.WriteLine($"--- Stability (each seed called {callsPerSeed}x) ---");
var allStable = true;
foreach (var seed in stabilitySeeds)
{
    var first = generator.GenerateMovie(
        sequenceIndex: 0,
        movieSeed:     unchecked((int)seed),
        locale:        "en-US",
        likesAvg:      3.5,
        reviewsAvg:    2.0);

    var firstJson = JsonSerializer.Serialize(first, options);
    var firstTrailerJson = JsonSerializer.Serialize(first.Trailer, options);

    var stable = true;
    for (var i = 1; i < callsPerSeed; i++)
    {
        var repeat = generator.GenerateMovie(
            sequenceIndex: 0,
            movieSeed:     unchecked((int)seed),
            locale:        "en-US",
            likesAvg:      3.5,
            reviewsAvg:    2.0);

        var repeatJson = JsonSerializer.Serialize(repeat, options);
        var repeatTrailerJson = JsonSerializer.Serialize(repeat.Trailer, options);

        if (repeatJson != firstJson || repeatTrailerJson != firstTrailerJson)
        {
            stable = false;
            break;
        }
    }

    Console.WriteLine(
        $"  seed={seed,12} | title={first.Title,-40} | " +
        $"trailer.duration={first.Trailer.DurationMs,5}ms | " +
        $"segments={first.Trailer.TitleSegments.Count} | " +
        $"reviews={first.Reviews.Count} | " +
        $"stable={stable}");

    if (!stable) allStable = false;
}

// ---------- 2. Sensitivity: no two positive seeds should collide -----

var sensitivitySeeds = new long[]
{
    1, 2, 3, 7, 100, 101, 12345, 99999,
    1_000_000, 1_000_001,
    100_000_007, 200_000_011
};

Console.WriteLine();
Console.WriteLine($"--- Sensitivity ({sensitivitySeeds.Length} distinct positive seeds) ---");
var perSeed = new List<(long seed, string json)>();
foreach (var seed in sensitivitySeeds)
{
    var m = generator.GenerateMovie(
        sequenceIndex: 0,
        movieSeed:     unchecked((int)seed),
        locale:        "en-US",
        likesAvg:      3.5,
        reviewsAvg:    2.0);
    perSeed.Add((seed, JsonSerializer.Serialize(m.Trailer, options)));
}

var distinct = perSeed.Select(t => t.json).Distinct().Count();
Console.WriteLine($"  Distinct trailers: {distinct} / {sensitivitySeeds.Length}");
var sensitivityOk = (distinct == sensitivitySeeds.Length);

// ---------- 3. Locale sensitivity (same seed, different locale) ------

Console.WriteLine();
Console.WriteLine("--- Locale sensitivity (seed=42, 3 locales) ---");
var localeOutputs = new List<(string locale, string json)>();
foreach (var loc in new[] { "en-US", "uk-UA", "de-DE" })
{
    var m = generator.GenerateMovie(
        sequenceIndex: 0,
        movieSeed:     42,
        locale:        loc,
        likesAvg:      3.5,
        reviewsAvg:    2.0);
    localeOutputs.Add((loc, JsonSerializer.Serialize(m, options)));
    Console.WriteLine($"  {loc}: title=\"{m.Title}\", genre={m.Genre}, year={m.Year}");
}
var localeDistinct = localeOutputs.Select(t => t.json).Distinct().Count();
var localeOk = (localeDistinct == localeOutputs.Count);
Console.WriteLine($"  Distinct full-movie JSONs: {localeDistinct} / {localeOutputs.Count}");

// ---------- 4. Review stability (template-fill draws are deterministic) ----

Console.WriteLine();
Console.WriteLine("--- Review stability (seed=42, en-US, 10 calls) ---");
const int reviewCalls = 10;
Movie firstReviewMovie = generator.GenerateMovie(0, 42, "en-US", 3.5, 2.0);
var firstReviewsJson = JsonSerializer.Serialize(firstReviewMovie.Reviews, options);
var firstReview0 = firstReviewMovie.Reviews[0];
Console.WriteLine($"  first review: \"{firstReview0}\"");
var reviewsStable = firstReviewMovie.Reviews.Count > 0;
for (var i = 1; i < reviewCalls && reviewsStable; i++)
{
    var m = generator.GenerateMovie(0, 42, "en-US", 3.5, 2.0);
    var j = JsonSerializer.Serialize(m.Reviews, options);
    if (j != firstReviewsJson)
    {
        reviewsStable = false;
        Console.WriteLine($"  DIVERGED on call {i + 1}");
    }
}
Console.WriteLine($"  review-array stable across {reviewCalls} calls: {reviewsStable}");

// ---------- 4b. Review sanity — no Lorem placeholder text leaks ---------

Console.WriteLine();
Console.WriteLine("--- Review sanity (no lorem-style strings) ---");
var loremMarkers = new[] { "lorem", "ipsum", "dolor", "sit amet" };
var reviewsAcrossLocales = new List<(string locale, string review)>();
foreach (var loc in new[] { "en-US", "uk-UA", "de-DE" })
{
    var m = generator.GenerateMovie(0, 42, loc, 3.5, 5.0); // 5 reviews
    foreach (var r in m.Reviews)
    {
        reviewsAcrossLocales.Add((loc, r));
    }
}
var leaked = reviewsAcrossLocales
    .Where(t => loremMarkers.Any(marker =>
        t.review.Contains(marker, StringComparison.OrdinalIgnoreCase)))
    .ToList();
Console.WriteLine($"  reviews sampled across 3 locales: {reviewsAcrossLocales.Count}");
Console.WriteLine($"  reviews containing lorem markers: {leaked.Count}");
var noLoremLeak = leaked.Count == 0;
foreach (var t in reviewsAcrossLocales.Take(6))
{
    Console.WriteLine($"    [{t.locale}] {t.review}");
}

// ---------- 5. Show one full TrailerSpec to confirm shape -----------

Console.WriteLine();
Console.WriteLine("--- Sample TrailerSpec (seed=42, en-US) ---");
Console.WriteLine(JsonSerializer.Serialize(
    generator.GenerateMovie(0, 42, "en-US", 3.5, 2.0).Trailer,
    new JsonSerializerOptions { WriteIndented = true }));

// ---------- Verdict ----------

Console.WriteLine();
var allOk = allStable && sensitivityOk && localeOk && reviewsStable && noLoremLeak;
Console.WriteLine(allOk
    ? "DETERMINISM: OK  (stable across calls, distinct across seeds, sensitive to locale, reviews stable, no lorem leak)"
    : "DETERMINISM: FAIL");

return allOk ? 0 : 1;
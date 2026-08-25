using System.Text.Json;
using MovieShowcase.Api.Models;

namespace MovieShowcase.Api.Services;

/// <summary>
/// Builds a <see cref="TrailerSpec"/> for one movie. The trailer is described
/// entirely as data (colors, timings, animation names, text) so the client can
/// render it frame-by-frame on an HTML5 <c>&lt;canvas&gt;</c> at playback time.
/// This satisfies the rule that all generation from a seed happens on the
/// server, while still giving smooth, real-time playback in the browser.
///
/// Determinism contract: the SAME <see cref="Random"/> instance, consumed in
/// the SAME order, must always produce a byte-for-byte identical
/// <see cref="TrailerSpec"/>. Verified empirically — see the determinism
/// probe in the project history.
/// </summary>
public static class TrailerSpecGenerator
{
    // -- Technique identifiers (renderer hints, NOT linguistic content) ----
    // These are deliberately short fixed enums in code: the client uses them
    // as keys into its own animation/font/background registries. Keeping
    // them here avoids shipping yet another JSON file for what is really a
    // rendering-technique enum.

    private static readonly string[] BackgroundStyles =
    {
        "gradient",
        "particles",
        "grid-lines",
        "radial-pulse"
    };

    private static readonly string[] AnimationTypes =
    {
        "typewriter",
        "fade-scale",
        "slide-up",
        "letter-spacing-collapse",
        "flicker-in"
    };

    private static readonly string[] FontStyles =
    {
        "bold-condensed",
        "serif-dramatic",
        "sans-wide"
    };

    private static readonly string[] TransitionTypes =
    {
        "fade",
        "wipe-left",
        "wipe-right",
        "zoom-blur",
        "slide-cut"
    };

    // -- Cinematic filler phrases ------------------------------------------
    // Cinematic conventions are universal, not region-specific — but to keep
    // ALL text out of code we load these from a small JSON file shipped under
    // /Locales/_shared/. A fallback list is used if the file is missing, so
    // the generator never crashes on a botched deploy.

    private static readonly string[] FallbackFillerPhrases =
    {
        "IN A WORLD...",
        "THIS FALL",
        "COMING SOON",
        "ONE HERO",
        "NO ESCAPE"
    };

    private static readonly Lazy<string[]> _fillerPhrases =
        new(LoadFillerPhrases, isThreadSafe: true);

    // -- Timing bounds ------------------------------------------------------

    /// <summary>Minimum length of any individual segment, in ms.</summary>
    private const int MinSegmentMs = 500;

    /// <summary>Trailer length range (inclusive).</summary>
    private const int MinDurationMs = 5000;
    private const int MaxDurationMs = 10000;

    // ===========================================================================
    // Public API
    // ===========================================================================

    /// <summary>
    /// Generate a <see cref="TrailerSpec"/> for the given movie title. The
    /// caller passes a per-movie seeded <see cref="Random"/>; the generator
    /// does NOT allocate its own RNG and does NOT touch <c>DateTime.Now</c>.
    /// </summary>
    /// <param name="rng">The movie's deterministic RNG.</param>
    /// <param name="movieTitle">Mandatory — at least one segment will display this.</param>
    public static TrailerSpec Generate(Random rng, string movieTitle)
    {
        ArgumentNullException.ThrowIfNull(rng);
        ArgumentNullException.ThrowIfNull(movieTitle);

        // 1. Total trailer length, in [5000, 10000] ms.
        // rng.Next(min, max+1) because the upper bound is exclusive.
        var durationMs = rng.Next(MinDurationMs, MaxDurationMs + 1);

        // 2. Background renderer.
        var backgroundStyle = Pick(BackgroundStyles, rng);

        // 3. Background palette: 2 or 3 random hex colors.
        var bgColorCount = rng.Next(2, 4); // 2..3
        var backgroundColors = new List<string>(bgColorCount);
        for (var i = 0; i < bgColorCount; i++)
        {
            backgroundColors.Add(RandomHexColor(rng));
        }

        // 4. Title segments: 3–5, with 0–2 filler phrases, then the rest titles.
        var segmentCount = rng.Next(3, 6); // 3..5
        var maxFillers = Math.Min(2, segmentCount - 1); // leave ≥1 slot for the title
        var fillerCount = rng.Next(0, maxFillers + 1);  // 0..maxFillers

        var pickedFillers = PickDistinctFillers(rng, fillerCount);

        // 4a. Give each segment a random integer weight in [1, 100], then
        //     scale those weights so the total fills `durationMs` exactly
        //     while every segment still gets ≥ MinSegmentMs.
        var weights = new int[segmentCount];
        var totalWeight = 0;
        for (var i = 0; i < segmentCount; i++)
        {
            weights[i] = rng.Next(1, 101);
            totalWeight += weights[i];
        }

        var variableBudget = durationMs - segmentCount * MinSegmentMs;
        var slices = new int[segmentCount];
        var assigned = 0;
        for (var i = 0; i < segmentCount; i++)
        {
            // Use long division to avoid overflow at extreme weights.
            slices[i] = (int)((long)weights[i] * variableBudget / totalWeight);
            assigned += slices[i];
        }

        // Hand out the rounding remainder one millisecond at a time.
        var remainder = variableBudget - assigned;
        for (var i = 0; i < remainder; i++)
        {
            slices[i]++;
        }

        var durations = new int[segmentCount];
        var starts = new int[segmentCount];
        var runningStart = 0;
        for (var i = 0; i < segmentCount; i++)
        {
            starts[i] = runningStart;
            durations[i] = MinSegmentMs + slices[i];
            runningStart += durations[i];
        }

        // 4b. Build the segment list. Per-segment rng calls happen in the
        //     order: text (no rng), animation, font, color (3 calls).
        var segments = new List<TitleAnimationSegment>(segmentCount);
        for (var i = 0; i < segmentCount; i++)
        {
            var text = i < fillerCount ? pickedFillers[i] : movieTitle;

            segments.Add(new TitleAnimationSegment
            {
                Text          = text,
                AnimationType = Pick(AnimationTypes, rng),
                StartMs       = starts[i],
                DurationMs    = durations[i],
                FontStyle     = Pick(FontStyles, rng),
                TextColor     = RandomHexColor(rng)
            });
        }

        // 5. Transitions: exactly one between every adjacent pair of segments.
        var transitionCount = segmentCount - 1;
        var transitions = new List<string>(transitionCount);
        for (var i = 0; i < transitionCount; i++)
        {
            transitions.Add(Pick(TransitionTypes, rng));
        }

        // 6. Video background effects — one per title segment. The clips
        //    play in parallel with the text segments; timing aligns exactly
        //    so a clip's window covers its corresponding text segment.
        //    If the client can't load a clip it falls back to the canvas
        //    background renderer for that segment.
        //
        //    Strategy: pick a clip per segment, allow repeats (small pool,
        //    and variety within a single trailer doesn't matter as much as
        //    variety across trailers). For each segment:
        //      - clip URL          (1 rng draw)
        //      - playback rate     (1 rng draw, mapped to 0.7..1.5)
        //      - zoomStart         (1 rng draw, mapped to 1.0..1.3)
        //      - zoomEnd           (1 rng draw, mapped to 1.0..1.4)
        //      - color filter      (1 rng draw)
        //    Determinism contract: same seed → identical VideoEffects array
        //    on every call.
        var videoEffects = new List<VideoSegmentEffect>(segmentCount);
        for (var i = 0; i < segmentCount; i++)
        {
            var clipUrl   = Pick(VideoClipLibrary.ClipUrls, rng);
            var rate      = 0.7 + rng.NextDouble() * 0.8;    // 0.7..1.5
            var zoomStart = 1.0 + rng.NextDouble() * 0.3;    // 1.0..1.3
            // End zoom is biased to be ≥ start so the visual "leans in".
            // Occasional pull-back (end < start) is allowed (rng-driven).
            var zoomEnd   = 1.0 + rng.NextDouble() * 0.4;    // 1.0..1.4
            var colorFilter = Pick(VideoClipLibrary.ColorFilters, rng);

            videoEffects.Add(new VideoSegmentEffect
            {
                ClipUrl      = clipUrl,
                PlaybackRate = Math.Round(rate, 3),
                ZoomStart    = Math.Round(zoomStart, 3),
                ZoomEnd      = Math.Round(zoomEnd, 3),
                ColorFilter  = colorFilter,
                StartMs      = starts[i],
                DurationMs   = durations[i]
            });
        }

        return new TrailerSpec
        {
            DurationMs       = durationMs,
            BackgroundStyle  = backgroundStyle,
            BackgroundColors = backgroundColors,
            TitleSegments    = segments,
            TransitionTypes  = transitions,
            VideoEffects     = videoEffects
        };
    }

    // ===========================================================================
    // Helpers
    // ===========================================================================

    private static string Pick(string[] options, Random rng)
        => options[rng.Next(options.Length)];

    /// <summary>
    /// Sample <paramref name="count"/> distinct filler phrases from the
    /// loaded pool without replacement (partial Fisher–Yates). Uses one rng
    /// call per picked phrase. Does not mutate the cached pool — operates
    /// on a local copy.
    /// </summary>
    private static List<string> PickDistinctFillers(Random rng, int count)
    {
        var pool = _fillerPhrases.Value;
        if (count <= 0) return new List<string>();

        // Tiny pool: just take everything we have, no rng draws needed.
        if (count >= pool.Length)
        {
            return pool.ToList();
        }

        // Local copy so we don't mutate the cached array.
        var copy = pool.ToArray();
        var result = new List<string>(count);
        var available = copy.Length;
        for (var pick = 0; pick < count; pick++)
        {
            var idx = rng.Next(0, available);
            result.Add(copy[idx]);
            // Swap the picked element with the last available one, shrink.
            copy[idx] = copy[available - 1];
            available--;
        }
        return result;
    }

    /// <summary>
    /// Generate a random <c>#RRGGBB</c> color from the seeded RNG. Uses 3
    /// draws (one per channel).
    /// </summary>
    private static string RandomHexColor(Random rng)
    {
        var r = rng.Next(0, 256);
        var g = rng.Next(0, 256);
        var b = rng.Next(0, 256);
        return $"#{r:X2}{g:X2}{b:X2}";
    }

    /// <summary>
    /// Load the cinematic filler phrases from
    /// <c>/Locales/_shared/trailer-phrases.json</c> at first use. Falls back
    /// to <see cref="FallbackFillerPhrases"/> if the file is missing or
    /// malformed — the generator must never crash just because a JSON file
    /// is absent.
    /// </summary>
    private static string[] LoadFillerPhrases()
    {
        try
        {
            var path = Path.Combine(
                AppContext.BaseDirectory,
                "Locales", "_shared", "trailer-phrases.json");

            if (!File.Exists(path))
            {
                return FallbackFillerPhrases;
            }

            using var stream = File.OpenRead(path);
            using var doc = JsonDocument.Parse(stream);
            var root = doc.RootElement;

            if (!root.TryGetProperty("phrases", out var phrases) ||
                phrases.ValueKind != JsonValueKind.Array)
            {
                return FallbackFillerPhrases;
            }

            var list = new List<string>();
            foreach (var p in phrases.EnumerateArray())
            {
                if (p.ValueKind == JsonValueKind.String)
                {
                    var s = p.GetString();
                    if (!string.IsNullOrWhiteSpace(s))
                    {
                        list.Add(s);
                    }
                }
            }

            return list.Count > 0 ? list.ToArray() : FallbackFillerPhrases;
        }
        catch
        {
            // Any I/O / parse failure → use the fallback list. Better to
            // generate slightly less variety than to crash trailer generation.
            return FallbackFillerPhrases;
        }
    }
}

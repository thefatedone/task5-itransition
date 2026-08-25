namespace MovieShowcase.Api.Services;

/// <summary>
/// Fixed pool of short background video clips available to trailers. Each
/// URL is a direct <c>.mp4</c> link hosted on a public, freely-licensed
/// CDN that returns <c>Access-Control-Allow-Origin: *</c> — verified manually
/// before being committed here.
///
/// <para>
/// <b>Why hardcoded (not locale/JSON-driven):</b> these are technical
/// rendering assets, not user-facing strings. They never need translation,
/// and the set itself is engineered (CORS headers, file size, codec) rather
/// than curated per region. Keeping them in code is the simplest thing that
/// works.
/// </para>
///
/// <para>
/// <b>License attribution:</b>
/// </para>
/// <list type="bullet">
///   <item>Mixkit clips — © Mixkit, used under the
///         <see href="https://mixkit.co/license/">Mixkit Free License</see>
///         (no attribution required, but we credit here for transparency).</item>
///   <item>Pexels clips — © Pexels / respective creators, used under the
///         <see href="https://www.pexels.com/license/">Pexels License</see>
///         (no attribution required, but we credit here for transparency).</item>
/// </list>
///
/// <para>
/// <b>Verified properties (each URL was probed with
/// <c>curl -I -H "Origin: ..."</c> on 2026-08-25):</b>
/// </para>
/// <list type="bullet">
///   <item>HTTP 200 OK, <c>Content-Type: video/mp4</c></item>
///   <item><c>Access-Control-Allow-Origin: *</c> (the browser can fetch
///         with <c>crossorigin="anonymous"</c> and drawImage without
///         tainting the canvas)</item>
///   <item>File size 538 KB – 1.44 MB</item>
///   <item>Resolution SD-360 (640×360) for Mixkit, sd_640_360 for Pexels</item>
///   <item>Clip length 6.2 – 19.0 seconds — long enough that under a 5–10s
///         trailer with <c>&lt;video loop&gt;</c> the clip seamlessly repeats</item>
/// </list>
///
/// <para>
/// <b>Re-verification cadence:</b> if a clip URL stops returning 200 or
/// stops returning CORS headers, remove it from this list and re-pick from
/// the remaining pool. The generator picks 2-3 URLs per trailer from this
/// pool; loss of individual entries degrades variety, never correctness.
/// </para>
/// </summary>
public static class VideoClipLibrary
{
    /// <summary>
    /// All candidate clip URLs. Order is not significant — the generator
    /// picks uniformly at random with the seeded <see cref="Random"/>, so
    /// re-ordering this list does not break determinism for previously
    /// generated trailers (their indices are still valid positions in the
    /// array; they just point to different URLs).
    ///
    /// <para>
    /// <b>Stability invariant for already-generated trailers:</b> NEVER
    /// remove entries that have already been returned in live TrailerSpec
    /// JSON — clients may have cached the JSON and will request the URL
    /// again. Add new entries at the END of the array only.
    /// </para>
    /// </summary>
    public static readonly string[] ClipUrls =
    {
        // --- Mixkit (Mixkit Free License) -------------------------------
        // URL pattern: https://assets.mixkit.co/videos/{id}/{id}-360.mp4
        "https://assets.mixkit.co/videos/4067/4067-360.mp4",     //  6.2s · 538 KB · urban / traffic
        "https://assets.mixkit.co/videos/5016/5016-360.mp4",     //  9.0s · 666 KB · water / waves
        "https://assets.mixkit.co/videos/26108/26108-360.mp4",   //  9.1s · 642 KB · sky / clouds
        "https://assets.mixkit.co/videos/4119/4119-360.mp4",     //  9.3s · 784 KB · sunset
        "https://assets.mixkit.co/videos/28897/28897-360.mp4",   //  9.5s · 580 KB · abstract / dark
        "https://assets.mixkit.co/videos/4645/4645-360.mp4",     // 10.8s · 800 KB · tropical
        "https://assets.mixkit.co/videos/505/505-360.mp4",       // 11.1s · 791 KB · ink / texture
        "https://assets.mixkit.co/videos/2168/2168-360.mp4",     // 13.6s · 894 KB · sunset
        "https://assets.mixkit.co/videos/2213/2213-360.mp4",     // 15.0s · 986 KB · waterfall
        "https://assets.mixkit.co/videos/51502/51502-360.mp4",   // 15.9s · 1.29 MB · aerial coast
        "https://assets.mixkit.co/videos/2408/2408-360.mp4",     // 18.1s · 1.06 MB · clouds
        "https://assets.mixkit.co/videos/3428/3428-360.mp4",     // 19.0s · 1.44 MB · street dusk

        // --- Pexels (Pexels License) ------------------------------------
        // URL pattern: https://videos.pexels.com/video-files/{id}/{id}-sd_640_360_{fps}fps.mp4
        // NOTE: the trailing FPS suffix is per-clip — Pexels serves only
        // the recorded FPS for each upload, so 30fps / 24fps / 25fps must
        // be matched exactly to the original clip.
        "https://videos.pexels.com/video-files/7429612/7429612-sd_640_360_30fps.mp4",  //  9.4s · 735 KB · clouds
        "https://videos.pexels.com/video-files/19827952/19827952-sd_640_360_24fps.mp4", // 10.3s · 1.01 MB · clouds
        "https://videos.pexels.com/video-files/7491823/7491823-sd_640_360_25fps.mp4",  // 10.8s · 744 KB · clouds
        "https://videos.pexels.com/video-files/3209828/3209828-sd_640_360_25fps.mp4",  // 13.8s · 937 KB · aerial icy
    };

    /// <summary>
    /// All color-grade presets the renderer knows how to apply to a video
    /// clip via <c>ctx.filter = ...</c>. The generator picks one of these
    /// uniformly at random for each segment. Keep this list aligned with
    /// the COLOR_FILTER_PRESETS map on the client side; if you add a name
    /// here, the client must know its CSS-filter equivalent.
    /// </summary>
    public static readonly string[] ColorFilters =
    {
        "none",
        "sepia",
        "cool-blue",
        "warm",
        "high-contrast",
        "desaturated"
    };
}

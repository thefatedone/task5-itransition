using MovieShowcase.Api.Services;

namespace MovieShowcase.Api.Endpoints;

/// <summary>
/// Minimal-API endpoints for locale discovery.
/// </summary>
public static class LocaleEndpoints
{
    public static IEndpointRouteBuilder MapLocaleEndpoints(this IEndpointRouteBuilder app)
    {
        // GET /api/locales — lists every locale the API can serve, derived
        // from the file names + display names under /Locales. No hardcoded
        // list: drop a new *.json into /Locales and restart, and it appears.
        app.MapGet("/api/locales", (LocalizationService localization) =>
            Results.Ok(new { locales = localization.GetAvailableLocaleInfos() }))
            .WithTags("Locales")
            .WithName("GetAvailableLocales")
            .WithSummary("Lists every locale code (and display name) the API can serve.");

        // GET /api/health — liveness probe. Returns 200 with a tiny JSON
        // payload. Used by deploy platforms (Render, Docker healthcheck,
        // etc.) and the frontend's connectivity check. Lives under /api/*
        // so it never collides with the SPA's index.html fallback at "/".
        app.MapGet("/api/health", () => Results.Ok(new
        {
            name   = "MovieShowcase.Api",
            status = "ok"
        }))
        .WithTags("Health")
        .WithName("Health")
        .WithSummary("Liveness probe — always returns 200 if the process is up.");

        return app;
    }
}

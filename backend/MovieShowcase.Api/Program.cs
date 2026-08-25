using Microsoft.Extensions.Configuration.Json;
using MovieShowcase.Api.Endpoints;
using MovieShowcase.Api.Services;

// ---------------------------------------------------------------------------
// Reload-on-change suppression — IMPORTANT: the loop below is a SECONDARY
// guard, not the primary fix.
//
// PRIMARY FIX is in the Dockerfile's runtime stage:
//   ENV DOTNET_HOSTBUILDER__RELOADCONFIGONCHANGE=false
//
// Why primary matters: WebApplication.CreateBuilder() registers appsettings.json
// and appsettings.{Environment}.json with reloadOnChange:true by default, and
// the FileSystemWatcher is created EAGERLY inside the JsonConfigurationProvider
// constructor (via ChangeToken.OnChange(producer) → producer() →
// FileProvider.Watch → new FileSystemWatcher). On Linux that watcher
// consumes an inotify instance, and constrained container hosts (Render.com
// free tier caps fs.inotify.max_user_instances at 128) crash the app with:
//
//   System.IO.IOException: The configured user limit (128) on the number
//   of inotify instances has been reached
//     at System.IO.FileSystemWatcher.StartRaisingEvents()
//     at ...ApplyDefaultAppConfiguration(...)
//     at WebApplicationBuilder..ctor(...)
//     at WebApplication.CreateBuilder(...)
//
// That crash happens BEFORE CreateBuilder returns — so any mutation of
// builder.Configuration.Sources AFTER CreateBuilder runs (which is what we
// do below) is too late to prevent it. The env var works because
// ApplyDefaultAppConfiguration reads `hostBuilder:reloadConfigOnChange`
// from the host config (built from `DOTNET_*` env vars + CLI) BEFORE adding
// the JSON sources — see HostingHostBuilderExtensions.cs in dotnet/runtime
// release/8.0.
//
// What the loop below still buys us:
//   - In dev (or anyone re-introducing reload via a future code path),
//     this disables the change-token registration so reloads stay off.
//   - It's a zero-cost safety net — one foreach over a tiny list.
//   - We keep the JSON sources themselves (don't Clear() and re-add) so
//     the file set is identical to the default; we only flip the watch bit.
var builder = WebApplication.CreateBuilder(args);

foreach (var source in builder.Configuration.Sources)
{
    if (source is JsonConfigurationSource json)
    {
        json.ReloadOnChange = false;
    }
}

// ---------------------------------------------------------------------------
// Service registration
// ---------------------------------------------------------------------------

// CORS is ONLY needed for the `npm run dev` workflow (frontend on :5173
// calling backend on :5080). In a production-style deployment both the
// static frontend and the API live on the same origin, so CORS would be
// a no-op. We still register a permissive policy that activates only in
// the Development environment, just in case someone runs the backend
// under `dotnet run` while the frontend is served by Vite.
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddCors(options =>
    {
        options.AddPolicy("DevPermissive", policy =>
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
    });
}

// Scans /Locales/*.json at startup, caches the parsed data in memory, and
// exposes the locale list + per-locale data to the rest of the app.
// NOTE: LocalizationService loads locale files via plain File.ReadAllText
// in its constructor — no IFileProvider / PhysicalFileProvider /
// FileSystemWatcher is involved, so it does NOT consume inotify instances.
builder.Services.AddSingleton<LocalizationService>();

// Deterministic, locale-aware fake-movie generator. Bogus + LocalizationService.
builder.Services.AddSingleton<IMovieGeneratorService, MovieGeneratorService>();

// Built-in minimal-API helpers.
builder.Services.AddEndpointsApiExplorer();

var app = builder.Build();

// ---------------------------------------------------------------------------
// Eager initialization
// ---------------------------------------------------------------------------
// Force the LocalizationService to load its JSON files now — not on the first
// request — so that missing / malformed locale files surface as startup
// errors instead of 500s at runtime.
_ = app.Services.GetRequiredService<LocalizationService>();

// ---------------------------------------------------------------------------
// Middleware pipeline
//
// Order matters:
//   1. Dev-only CORS (no-op outside Development).
//   2. UseDefaultFiles — turns "/" into "/index.html" before static lookup.
//   3. UseStaticFiles  — serves /wwwroot/* (the built React app).
//   4. SPA fallback    — anything that didn't match an API route or a real
//      static file returns /index.html so client-side routing / hard links
//      work. (This app doesn't use React Router today, but the catch-all is
//      standard for SPA hosting and harmless if not needed.)
//   5. API endpoints   — /api/* minimal-API mappings.
// ---------------------------------------------------------------------------

if (app.Environment.IsDevelopment())
{
    app.UseCors("DevPermissive");
}

// Wwwroot is .NET's conventional static-files root. When the Docker build
// copies frontend/movie-showcase-client/dist/* here, the React app is served
// from the same origin as the API — no extra configuration required.
app.UseDefaultFiles();   // serves wwwroot/index.html on "/"
app.UseStaticFiles();    // serves wwwroot/assets/* etc.

// SPA fallback: requests that didn't match an API route AND didn't match a
// real static file fall through to here, where we hand them index.html so
// client-side routing / hard refreshes keep working. We register this as a
// minimal-API endpoint AFTER the static-file middleware so it never wins
// over a real file (e.g. /assets/index-abc123.js still serves as JS, not
// as HTML).
app.MapFallbackToFile("index.html");

// ---------------------------------------------------------------------------
// Endpoint registration
// ---------------------------------------------------------------------------
app.MapMovieEndpoints();
app.MapLocaleEndpoints();

app.Run();
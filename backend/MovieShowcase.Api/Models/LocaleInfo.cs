namespace MovieShowcase.Api.Models;

/// <summary>
/// Lightweight, public-facing summary of a locale. Returned by
/// <c>GET /api/locales</c>. <see cref="Code"/> is the lookup key the rest of
/// the API accepts; <see cref="DisplayName"/> is a human-readable label for
/// UI dropdowns.
/// </summary>
public sealed class LocaleInfo
{
    /// <summary>Locale code used as the lookup key (e.g. <c>en-US</c>).</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Human-readable label (e.g. <c>English (United States)</c>).</summary>
    public string DisplayName { get; set; } = string.Empty;
}

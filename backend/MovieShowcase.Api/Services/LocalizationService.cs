using System.Text.Json;
using MovieShowcase.Api.Models;

namespace MovieShowcase.Api.Services;

/// <summary>
/// Loads every <c>*.json</c> file under <c>/Locales</c> at process startup and
/// caches the parsed data in memory. Locale files are discovered by scanning
/// the directory — adding a new file (e.g. <c>fr-FR.json</c>) requires no code
/// change.
/// </summary>
public sealed class LocalizationService
{
    private readonly Dictionary<string, LocaleData> _byLocale =
        new(StringComparer.OrdinalIgnoreCase);

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public LocalizationService(IWebHostEnvironment env)
    {
        var directory = Path.Combine(env.ContentRootPath, "Locales");
        if (!Directory.Exists(directory))
        {
            throw new DirectoryNotFoundException(
                $"Locales directory not found at '{directory}'. " +
                "Create the folder and add at least one locale JSON file.");
        }

        LoadAllFromDisk(directory);
    }

    private void LoadAllFromDisk(string directory)
    {
        foreach (var file in Directory.EnumerateFiles(directory, "*.json"))
        {
            var codeFromFileName = Path.GetFileNameWithoutExtension(file);
            var json = File.ReadAllText(file);

            var data = JsonSerializer.Deserialize<LocaleData>(json, JsonOptions)
                       ?? throw new InvalidDataException(
                           $"Locale file '{file}' deserialized to null.");

            // If the JSON omits / has empty "locale", fall back to the file name.
            if (string.IsNullOrWhiteSpace(data.Locale))
            {
                data.Locale = codeFromFileName;
            }

            // Validate the minimum the generator relies on.
            EnsureNotEmpty(data.Genres,         nameof(data.Genres),         codeFromFileName);
            EnsureNotEmpty(data.TitleTemplates, nameof(data.TitleTemplates), codeFromFileName);
            EnsureNotEmpty(data.TitleAdjectives, nameof(data.TitleAdjectives), codeFromFileName);
            EnsureNotEmpty(data.TitleNouns,      nameof(data.TitleNouns),      codeFromFileName);
            // Review vocabulary — required by ReviewTextGenerator. Same
            // strict validation: a locale that ships without these lists
            // would silently fall back to nonsense on the review step.
            EnsureNotEmpty(data.ReviewTemplates,        nameof(data.ReviewTemplates),        codeFromFileName);
            EnsureNotEmpty(data.ReviewOpinions,         nameof(data.ReviewOpinions),         codeFromFileName);
            EnsureNotEmpty(data.ReviewAspects,          nameof(data.ReviewAspects),          codeFromFileName);
            EnsureNotEmpty(data.ReviewVerbs,            nameof(data.ReviewVerbs),            codeFromFileName);
            EnsureNotEmpty(data.ReviewRecommendations,  nameof(data.ReviewRecommendations),  codeFromFileName);

            _byLocale[codeFromFileName] = data;
        }

        if (_byLocale.Count == 0)
        {
            throw new InvalidOperationException(
                $"No locale files (*.json) found in '{directory}'.");
        }
    }

    private static void EnsureNotEmpty(IList<string> list, string name, string locale)
    {
        if (list.Count == 0)
        {
            throw new InvalidDataException(
                $"Locale '{locale}' is missing required non-empty list '{name}'.");
        }
    }

    /// <summary>
    /// Locale codes for every JSON file in <c>/Locales</c>, derived from the
    /// file names at startup. Adding a new locale file requires no code change.
    /// </summary>
    public IReadOnlyList<string> GetAvailableLocales()
        => _byLocale.Keys
                    .OrderBy(k => k, StringComparer.OrdinalIgnoreCase)
                    .ToList();

    /// <summary>
    /// Locale summaries for the public <c>/api/locales</c> endpoint. Each
    /// entry combines the lookup code with its display name. Falls back to
    /// the code itself when the JSON omits a display name.
    /// </summary>
    public IReadOnlyList<LocaleInfo> GetAvailableLocaleInfos()
        => _byLocale.Values
                    .Select(d => new LocaleInfo
                    {
                        Code        = string.IsNullOrWhiteSpace(d.Locale)     ? "<unknown>" : d.Locale,
                        DisplayName = string.IsNullOrWhiteSpace(d.DisplayName) ? d.Locale    : d.DisplayName
                    })
                    .OrderBy(info => info.Code, StringComparer.OrdinalIgnoreCase)
                    .ToList();

    /// <summary>
    /// Returns the parsed locale data. Throws <see cref="KeyNotFoundException"/>
    /// for unknown locales — callers should surface a 400 Bad Request.
    /// </summary>
    public LocaleData GetLocaleData(string locale)
    {
        if (!_byLocale.TryGetValue(locale, out var data))
        {
            throw new KeyNotFoundException(
                $"Locale '{locale}' is not available. Known locales: " +
                string.Join(", ", _byLocale.Keys));
        }
        return data;
    }
}

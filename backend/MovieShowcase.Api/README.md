# MovieShowcase.Api

ASP.NET Core (.NET 8) Web API in Minimal-API style.

## Layout

```
MovieShowcase.Api/
├── Endpoints/         # Minimal-API endpoint groups
├── Locales/           # Localization JSON files (genres, title parts, names…)
├── Models/            # DTOs / domain records
├── Services/          # Generation logic
├── Properties/        # launchSettings.json
├── Program.cs
├── appsettings.json
└── appsettings.Development.json
```

## Run

```bash
dotnet restore
dotnet run --project MovieShowcase.Api
```

By default the API listens on `http://localhost:5080`.

## Stub endpoint

```
GET /api/movies?locale=en-US&seed=12345&page=1&pageSize=20&likesAvg=3.5&reviewsAvg=2.0
```

Returns one hard-coded fake movie so we can confirm the API boots and CORS works.

## CORS

- Development: any origin is allowed (`DevPermissive` policy).
- Production: only `http://localhost:5173` and `http://127.0.0.1:5173` (`FrontendDev` policy).

# Fake Movie Store Showcase

Full-stack scaffold for a server-generated fake movie catalog.

```
task5-itransition/
├── backend/
│   └── MovieShowcase.Api/        # ASP.NET Core (.NET 8) Minimal API
│       ├── Endpoints/
│       ├── Locales/              # en-US.json, uk-UA.json, de-DE.json
│       ├── Models/
│       ├── Services/
│       ├── Properties/
│       └── Program.cs
└── frontend/
    └── movie-showcase-client/    # React + Vite + TypeScript
        └── src/
            ├── api/
            ├── components/
            └── types/
```

## Quick start

```bash
# 1. Backend (listens on http://localhost:5080)
dotnet run --project backend/MovieShowcase.Api

# 2. Frontend (listens on http://localhost:5173)
cd frontend/movie-showcase-client
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/*` to the
ASP.NET backend, so the browser calls a same-origin URL and CORS stays out
of the way during development. In production, the same CORS policy on the
backend (`FrontendDev` policy in `Program.cs`) allows the Vite origin
explicitly.

## Design constraints (project-wide)

- **SPA, no auth.** No login screens, registration, JWT, sessions, etc.
- **Server-generated data only.** The browser only displays what the API
  returns; nothing is fabricated on the client.
- **No hardcoded locale data.** Genres, names, title parts, etc. all come
  from the JSON files under `backend/MovieShowcase.Api/Locales/`.
- **No database.** All data is generated per request (and deterministic
  per seed), so there's nothing to persist.

## Status

This is the scaffold. The current `GET /api/movies` returns one hard-coded
stub movie so we can confirm boot + CORS. Real generation via Bogus and
locales lands next.

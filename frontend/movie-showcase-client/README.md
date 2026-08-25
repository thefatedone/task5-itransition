# movie-showcase-client

React + Vite + TypeScript SPA. Dev server is pinned to **port 5173**.

## Layout

```
movie-showcase-client/
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── api/          # fetch wrappers for the backend
    ├── components/   # React components
    ├── types/        # TypeScript interfaces that mirror the backend DTOs
    ├── App.tsx
    ├── main.tsx
    └── index.css
```

## Run

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The Vite dev server proxies `/api/*` to the
ASP.NET backend at <http://localhost:5080> (see `vite.config.ts`).

## Smoke test

`App.tsx` calls `GET /api/movies` on mount, logs the response to the browser
console, and dumps it as JSON on the page. If you see the stub movie there,
frontend ↔ backend connectivity is working.

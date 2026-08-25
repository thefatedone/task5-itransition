# =============================================================================
# MovieShowcase — single-container build
#
# Produces one image that runs the .NET 8 backend on port 8080 and serves the
# React frontend's built assets (from /wwwroot) on the same origin. Both the
# API (/api/*) and the SPA (/) are served by one process — exactly what
# Render.com and similar PaaS providers expect for a single-port Web Service.
#
# Build from the REPOSITORY ROOT:
#   docker build -t movie-showcase .
#
# Run locally:
#   docker run --rm -p 8080:8080 -e ASPNETCORE_ENVIRONMENT=Production movie-showcase
# Then open http://localhost:8080/ for the SPA and
# http://localhost:8080/api/health for the liveness probe.
# =============================================================================


# -----------------------------------------------------------------------------
# Stage 1 — Build the React frontend
# -----------------------------------------------------------------------------
# node:20-bookworm-slim is the smallest image with a recent-enough Node for
# Vite 5 + Vite's plugin-react. Pinned to bookworm (Debian 12) for glibc
# compat with anything else we add later.
FROM node:20-bookworm-slim AS frontend-build

WORKDIR /src/frontend

# Copy only the manifest first so this layer caches across source edits —
# any change to package.json invalidates the cache, but a change to a .tsx
# file reuses the installed node_modules.
COPY frontend/movie-showcase-client/package.json       ./package.json
COPY frontend/movie-showcase-client/package-lock.json  ./package-lock.json

# ci (not install) respects the lockfile exactly. Runs to completion even
# if optional native deps fail — fine because nothing in this stack is
# native.
RUN npm ci --no-audit --no-fund

# Now copy the rest of the frontend source and build. tsc -b && vite build
# (defined in package.json) emits into ./dist/.
COPY frontend/movie-showcase-client/ ./
RUN npm run build


# -----------------------------------------------------------------------------
# Stage 2 — Publish the .NET backend
# -----------------------------------------------------------------------------
# Pinned to .NET 8 SDK to match <TargetFramework>net8.0</TargetFramework>.
# aspnet base image is used as the runtime stage; SDK is only needed here
# for restore + publish.
#
# Folder layout INSIDE this stage mirrors the repo's
# backend/MovieShowcase.Api/ path: the .csproj is always reached as
# /src/backend/MovieShowcase.Api/MovieShowcase.Api.csproj in BOTH restore
# and publish. Keeping restore and publish on the SAME path is mandatory:
# `dotnet restore` writes ./obj/project.assets.json next to the .csproj,
# and a later `dotnet publish` from a different path can't find it
# (NETSDK1004). Previous draft had a path mismatch between the two steps.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build

WORKDIR /src/backend

# Copy only the .csproj first so this layer caches across source-code edits
# — any change to the .csproj (or NuGet feeds) invalidates the cache, but
# a change to a .cs file reuses the restored packages.
COPY backend/MovieShowcase.Api/MovieShowcase.Api.csproj \
     ./MovieShowcase.Api/MovieShowcase.Api.csproj

# Restore in the same path we'll publish from. The restore writes
# ./MovieShowcase.Api/obj/project.assets.json which `dotnet publish` then
# consumes with --no-restore below.
RUN dotnet restore ./MovieShowcase.Api/MovieShowcase.Api.csproj

# Now copy the rest of the backend source (Locales/*.json, Services,
# Endpoints, Models, Program.cs, appsettings*.json) into the same folder
# the .csproj is in. Release config strips symbols; /app/publish is the
# output root.
COPY backend/MovieShowcase.Api/  ./MovieShowcase.Api/
RUN dotnet publish ./MovieShowcase.Api/MovieShowcase.Api.csproj \
        -c Release \
        -o /app/publish \
        --no-restore \
        /p:UseAppHost=false


# -----------------------------------------------------------------------------
# Stage 3 — Runtime image
# -----------------------------------------------------------------------------
# aspnet:8.0 is the small runtime-only image (~110 MB) — no SDK, no npm, no
# build tools. Everything needed at runtime is in /app/publish plus the
# React dist copied into wwwroot/.
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime

WORKDIR /app

# Bring in the published .NET app from stage 2.
COPY --from=backend-build /app/publish ./

# Bring in the built React app from stage 1 and drop it into wwwroot so the
# backend's UseStaticFiles() serves it. The .NET Web SDK includes any
# pre-existing wwwroot folder in the publish output, so we just need to land
# the dist contents at /app/wwwroot before the runtime image is finalised.
#
# If wwwroot didn't exist at publish time, we create it here. UseStaticFiles
# will serve any *.html, *.css, *.js, *.svg, *.png, etc. from this folder at
# the root path of the request.
COPY --from=frontend-build /src/frontend/dist/ ./wwwroot/

# Render.com (and most PaaS) expect the app to bind to PORT=8080 via the
# ASPNETCORE_URLS env var. We bake it into the image so the default
# `docker run` works without extra flags; the env var can still be
# overridden at run time.
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

EXPOSE 8080

# The .NET app is self-contained as a managed assembly — `dotnet MovieShowcase.Api.dll`
# works without a native apphost (we disabled UseAppHost above).
ENTRYPOINT ["dotnet", "MovieShowcase.Api.dll"]
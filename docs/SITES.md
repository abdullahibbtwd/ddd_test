# Sites (Task 11)

Domain model for `sites` / `site_types` and `/api/sites` / `/api/site-types`.

## Rules

- A site belongs to **exactly one client** and **exactly one ACTIVE area**.
- Business status: `ACTIVE` | `TERMINATED` (reversible). No physical deletes.
- A client with **ACTIVE** sites cannot be archived (`CLIENT_HAS_ACTIVE_SITES`).
- Creating or reactivating a site for an **archived** client fails (`CLIENT_ARCHIVED`).
- Inactive area or site type → `VALIDATION_FAILED` with field details (not a custom code).

## Scoping (FIELD)

- **Site read/create** only when `areaId` is in the user’s assigned areas.
- Out-of-scope **read** → `404 NOT_FOUND`; create outside areas → `403 FORBIDDEN`.
- FIELD cannot **update** sites in this task.
- **Client read** only for clients that have at least one site in the user’s areas (`accessibleClientWhere`).
- FIELD may create a **new client** only together with its first site (`newClient` + `quickCreate`).

## Quick-add

`POST /api/sites` with `newClient` (mutually exclusive with `clientId`) runs in one `PrismaService.transaction()`. If the site insert fails, the client is rolled back. `DUPLICATE_EIK` includes `{ existingClientId, existingName, existingIsActive }` only when the caller can read that client.

## Map and navigation

- List filters: `areaId`, `siteTypeId`, `status` (default ACTIVE), `clientId`, `search` (site name/address contains; client name contains; client EIK starts-with).
- `GET /api/sites/map` — sites with coordinates only; cap 500; `{ total, truncated }`.
- `buildNavigationUrl({ lat, lng, address })` → Google Maps directions (coords preferred).
- Web map: **Leaflet** + OpenStreetMap tiles (attribution required). No clustering, no geocoding.

## OSM note

OSM’s tile usage policy fits small internal deployments. Referrer-Policy stays `strict-origin-when-cross-origin`. If usage grows, switch to a hosted tile provider.

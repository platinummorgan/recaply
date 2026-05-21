# Release Hardening

This project now has a baseline release gate to reduce last-minute regressions.

## Local Pre-Release Command

Run this from repo root:

```powershell
npm run release:check
```

It validates:
- Version alignment: `package.json` and `app.json`
- Release note files exist and are non-empty
- Frontend quality lane:
  - `npm run typecheck:frontend`
  - `npm run typecheck:root`
  - `npm run lint:frontend`
  - `npm run test:frontend`
- Backend quality lane:
  - `npm --prefix backend run build`
  - `npm --prefix backend test`

## CI Coverage

- Backend CI: `.github/workflows/backend-ci.yml`
- Frontend quality CI: `.github/workflows/frontend-quality.yml`

## Notes

- Frontend typecheck intentionally targets the active app surface (`tsconfig.frontend.json`).
- Legacy/unused screens remain excluded until they are modernized or removed.

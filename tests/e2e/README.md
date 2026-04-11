# Playwright E2E

This folder contains browser end-to-end tests for the Vite app.

## Run tests

- `npm run test:e2e`
- `npm run test:e2e:headed`
- `npm run test:e2e:ui`

## Field Visit lifecycle spec

- File: `tests/e2e/field-visit-lifecycle.spec.js`
- This test is environment-gated and auto-skips unless both vars are present:
	- `PLAYWRIGHT_EMAIL`
	- `PLAYWRIGHT_PASSWORD`
- Optional API override:
	- `PLAYWRIGHT_API_URL` (defaults to `PLAYWRIGHT_BASE_URL`)

## Notes

- The config starts the local app automatically on port `4173`.
- Override base URL with `PLAYWRIGHT_BASE_URL` if needed.

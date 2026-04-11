/**
 * Retry wrapper for React.lazy dynamic imports.
 *
 * When the browser disk-cache is corrupted (ERR_CACHE_READ_FAILURE) or a
 * Vite dep-optimization hash changes between server restarts, the dynamic
 * import() call rejects.  This wrapper:
 *   1. Catches the failure
 *   2. Retries up to `maxRetries` times with an ever-changing `?t=<timestamp>`
 *      query-string to bypass any cached 404 / corrupt entry
 *   3. On final failure does a **hard page reload** (once) so the browser
 *      fetches the latest index.html with the correct chunk mappings
 *
 * Usage:
 *   const Foo = React.lazy(() => lazyRetry(() => import('./Foo')));
 *   const Bar = React.lazy(() => lazyRetry(() => import('./Bar').then(m => ({ default: m.Bar }))));
 */

const SESSION_KEY = 'lazyRetry_reloaded';

export default function lazyRetry(importFn, maxRetries = 2) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryImport = () => {
      importFn()
        .then(resolve)
        .catch((err) => {
          attempt += 1;
          if (attempt <= maxRetries) {
            // Small delay + cache-bust query string on next attempt
            setTimeout(() => {
              // Vite supports import() with query strings in dev mode
              tryImport();
            }, 300 * attempt);
          } else {
            // All retries exhausted — do a one-time hard reload
            // so the browser picks up the latest module graph
            const hasReloaded = sessionStorage.getItem(SESSION_KEY);
            if (!hasReloaded) {
              sessionStorage.setItem(SESSION_KEY, '1');
              window.location.reload();
            } else {
              // Already reloaded once this session — surface the real error
              sessionStorage.removeItem(SESSION_KEY);
              reject(err);
            }
          }
        });
    };

    tryImport();
  });
}

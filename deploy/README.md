# Shared TC9 provisioning connection

All Test Hub visitors use **one operator-configured TC9 API token**, one build library and one realm library. There is no end-user login, password, personal token entry or user identification. The API token never reaches the browser.

## Configure

Use Node.js 24 (minimum 22.12). Run `npm ci`, `npm test`, `npm run lint`, `npm run build`.

Copy `.env.example` to `.env` in the Test Hub checkout (ignored by Git):

```dotenv
TC9_UPSTREAM_URL=https://test.expanded.space
TC9_API_TOKEN=tc9_your_dedicated_test_hub_token
TC9_PUBLIC_ORIGIN=https://expanded.space
TC9_COOKIE_PATH=/test-hub/tc9-api/
PORT=8787
TC9_VISITOR_SECRET=generate_a_random_64_character_hex_secret
```

The provider creates a dedicated **Test Hub** token in the provisioning tool's **Account & API** tab with `read`, `build`, `manage` and `download` scopes. Put it in `TC9_API_TOKEN`; no user needs to supply a token. `TC9_UPSTREAM_URL` must be an approved HTTPS origin. `TC9_PUBLIC_ORIGIN` is the exact browser origin and `TC9_COOKIE_PATH` includes the external website subpath.

`npm run serve:api` loads `.env` and listens only on loopback port 8787. Runtime environment variables take precedence. Never put secrets in `VITE_*`, Git, `dist/` or build arguments. Restrict the environment file to its operator/service user (`chmod 600`). Generate `TC9_VISITOR_SECRET` once with `openssl rand -hex 32` and retain it across restarts and API-token rotations; it signs private browser cookies used for personal game-account recovery.

For systemd, keep the same variables in root-owned mode-0600 `/etc/ac-test-hub/tc9.env` and install `ac-test-hub-api.service` in `/etc/systemd/system/`. EnvironmentFile supplies the runtime configuration directly; a second checkout `.env` is unnecessary. Source files are readable by the unprivileged `actesthub` service user. Restart the service after changing credentials.

Include `nginx-tc9.conf` inside the VM's static-site server block, adjusting the trusted edge IP if needed. The external edge strips `/test-hub/`, overwrites `X-Real-IP`, preserves Origin and cookies, and must disable buffering and allow a 300-second read timeout for `/test-hub/tc9-api/`. Run `nginx -t`, reload nginx and `systemctl enable --now ac-test-hub-api`.

The optional gateway lives at `tc9-api/` relative to the website. Static installations without it retain the public queue and local server commands. For local development, Vite proxies this path to port 8787. Set `TC9_PUBLIC_ORIGIN=http://localhost:5173` and `TC9_COOKIE_PATH=/tc9-api/` in `.env`, then run `npm run serve:api` and `npm run dev` in separate terminals. Keep the upstream HTTPS.

## Use

Select a PR. Step 2 offers **Run it on your server OR use a hosted test realm**. Choose the hosted option and configure the realm, or open **Test Hub builds & realms**. The shared connection is automatic. Select a compilation server and up to five approved modules. Optional characters use the validated JSON editor (up to three; an example is provided), including items and active/completed quest IDs. Submit **Compile & create realm**.

The API pins the authoritative PR head. The library displays its revision and separate compilation, database and realm progress. A compact progress card and changing action button remain on the exact PR when the dialog closes. The selected build is polled in the background and restored after reload; other PRs never inherit its status. All visitors can see and manage the same account's resources. Start, stop, recompile and delete controls reflect realm state; stop, recompile, delete and build cancellation ask for confirmation. Use **Get my game account** on a running realm to create a separate PR-specific game login for this visitor. Another visitor gets a different username/password. Repeat clicks, refreshes and gateway restarts recover the same account using a persistent HttpOnly browser cookie. Passwords are shown only on request and are not stored in browser storage. Requested test fixtures are copied to personal characters with unique names. Clearing the visitor cookie creates a new visitor identity for game-account recovery; it does not require a website login.

Prepare archives independently for the pinned build or the current realm, then download the core ZIP. Archives stream through the gateway with Range support, without holding the full file in browser or gateway memory. Errors preserve upstream status and retry guidance. Token scopes are independent: read access does not guarantee build/manage/download access.

## Gateway behavior

All requests use the **same server-side `TC9_API_TOKEN`**. Callers cannot override it via headers or enter their own credential. The provisioning API credential remains shared; the separate anonymous browser key only selects a personal in-game account on each realm.

The gateway issues a short-lived, signed, HttpOnly, Secure, SameSite=Strict cookie solely for browser CSRF protection, with no website login or session database. A separate signed, 180-day HttpOnly visitor cookie recovers personal game accounts; the gateway derives a private realm-specific `X-TC9-Account-Key` server-side and never forwards a caller-supplied account key. Mutations require its nonce and the exact configured Origin. Refresh/reload obtains a new nonce after service restarts or expiry. Public configuration contains only the upstream origin and whether the shared token is configured. Responses are `no-store`; tokens and game credentials are never stored in localStorage, sessionStorage, URLs or compiled assets.

Only implemented developer-API route/method/query combinations are forwarded. Arbitrary hosts, redirects, account-token management and internal worker routes are rejected. The API remains authoritative for allowed repositories, PR eligibility, ownership of the shared provider account, capacity and fixture validity. All visitors intentionally have the access granted by the shared token.

Library/archive polling stops when the dialog closes. The selected PR’s tracked compilation continues to update outside the dialog, preserves the last known progress during outages, and backs off on errors/Retry-After. Mutations are never automatically retried. Synchronous guards prevent duplicate clicks; Web Locks serialize same-PR submissions across supporting browser tabs. Before a fresh request, the library is checked for an already-running compilation of this PR. An uncertain submission persists its original inputs and Idempotency-Key and retries that exact request after reload. Only an explicit rejection permits editing inputs; an accepted operation is viewed instead of submitted again. Terminal failures offer a deliberate fresh compilation. After a reload or an uncertain submission, check the build library before submitting again.

## Validate and deploy

`npm test` covers existing queue/report behavior, fixture validation and mocked gateway tests (shared-account forwarding, CSRF, signed cookies, route restrictions, idempotency, errors and streaming). Live smoke tests use authenticated GETs only; no real compilation or realm mutation is needed to validate deployment.

Deploy a pushed fork commit, run `npm ci`, checks and a staging production build. Back up the old `dist` and nginx configuration, restart the gateway, replace `dist`, and reload nginx. Record the commit in `/var/lib/ac-test-hub/deployed-commit`; verify the external URL and shared connection. Keep `/var/lib/ac-test-hub/data.json` and its refresh timer. Roll back using the previous source/dist and restart the gateway.

# Optional hosted test realms

The default Test Hub is a static site, including on GitHub Pages. It requires no provisioning service and sends no gateway requests. Hosted compilation is an explicit opt-in for operators running a compatible TC9 developer API and a Node.js gateway beside the site.

## Configure and build

Use Node.js 24 (minimum 22.12). Run `npm ci`, then copy `.env.example` to `.env` (ignored by Git). Set:

```dotenv
VITE_TC9_ENABLED=true
TC9_UPSTREAM_URL=https://provisioner.example.org
TC9_API_TOKEN=tc9_your_dedicated_test_hub_token
TC9_PUBLIC_ORIGIN=https://hub.example.org
TC9_COOKIE_PATH=/tc9-api/
PORT=8787
TC9_ALLOW_MANAGEMENT=false
TC9_PERSONAL_ACCOUNTS=false
```

`VITE_TC9_ENABLED` is a **build-time** flag. Run `npm run build` after changing it. The remaining variables configure the gateway at runtime; restart it after changing them. GitHub Pages cannot run this gateway. Leave the feature disabled in the standard Pages workflow, or separately operate a gateway under the same public origin.

Create a dedicated provider token with `read`, `build` and `download` scopes. All site visitors intentionally share its resources, without a website login or personal token entry. Public visitors can initiate compilations, so configure repository eligibility, concurrency, account quotas and rate limits at the provider before enabling a public site. Do not use an operator's general-purpose token.

Lifecycle controls (start, stop, recompile, delete and cancel) are disabled by default and rejected by the gateway even if a caller constructs the request directly. For a trusted audience, explicitly set `TC9_ALLOW_MANAGEMENT=true` and grant the token `manage` scope. Every visitor will then be able to manage all resources in this shared provider account.

Personal game accounts are an optional TC9 extension (`GET/POST /api/v1/realms/{id}/account` with server-derived `X-TC9-Account-Key`). Enable `TC9_PERSONAL_ACCOUNTS=true` only when your provider implements it, grant `manage` scope, and set `TC9_VISITOR_SECRET` to the output of `openssl rand -hex 32`. Retain this secret across restarts and token rotation so visitors can recover their accounts. Management controls can remain disabled while personal account creation is enabled.

The provider must support durable `Idempotency-Key` for build creation and atomic, exact-input active-build reuse through `X-TC9-Reuse-Active: true`. Reuse must compare the full request: repository, PR, builder, modules and character fixtures; sharing a PR number alone is insufficient. Verify these capabilities in the provider's developer API documentation. The hub forwards a fixed set of `/api/v1` routes, not internal worker or token-management endpoints.

Keep secrets out of `VITE_*`, Git, `dist/` and build arguments. Restrict the runtime file to its operator/service user (`chmod 600`). Nothing in the frontend contains the provider token or visitor secret.

## Serve

`npm run serve:api` loads `.env` and binds only to `127.0.0.1:8787`. Serve `dist/` with your web server and proxy **`tc9-api/` relative to the site** to the gateway. See [nginx-tc9.conf](nginx-tc9.conf). Preserve Origin, cookies and Range headers; disable response buffering for streamed archives.

| Site address | `TC9_PUBLIC_ORIGIN` | `TC9_COOKIE_PATH` | nginx location |
| --- | --- | --- | --- |
| `https://hub.example.org/` | `https://hub.example.org` | `/tc9-api/` | `/tc9-api/` |
| `https://hub.example.org/test-hub/` | `https://hub.example.org` | `/test-hub/tc9-api/` | `/test-hub/tc9-api/` |

Serve a subpath with its trailing slash. If another reverse proxy strips a prefix, adjust the inner nginx location to the path it receives; the cookie path must still match the browser-visible URL. No private network addresses or trusted edge topology are assumed. Origins must use HTTPS and contain no credentials, path, query or fragment. The upstream API origin is fixed by the operator; redirects are rejected.

For systemd, [ac-test-hub-api.service](ac-test-hub-api.service) is an example using an unprivileged `actesthub` user, `/opt/ac-test-hub` checkout and root-owned mode-0600 `/etc/ac-test-hub/tc9.env`. Adjust these paths and the Node executable for your host. EnvironmentFile supplies runtime settings directly; the checkout `.env` is unnecessary at runtime. Validate nginx configuration, then enable/restart the service.

For local development, set `VITE_TC9_ENABLED=true`, `TC9_PUBLIC_ORIGIN=http://localhost:5173` and `TC9_COOKIE_PATH=/tc9-api/`. Run `npm run serve:api` and `npm run dev` separately. Vite proxies the gateway path to loopback. Only loopback public origins can use HTTP; keep the remote provider on HTTPS.

## Use and recovery

The combined run step offers local server instructions or a hosted test realm. Choose a PR, builder, up to five approved modules and optional test characters. The API pins the authoritative PR head. The selected operation's progress remains on that PR after the dialog closes and after reload. Library polling stops when the dialog closes; progress polling continues for the selected PR, with backoff on errors and Retry-After.

Synchronous guards and cross-tab Web Locks prevent duplicate clicks. An uncertain submission retains its exact inputs and Idempotency-Key for a deliberate retry; the provider recovers that operation or atomically reuses an identical active build. Mutations are never automatically replayed. Unrelated module/character choices are never replaced by another visitor's build just because it uses the same PR. Only an explicit rejection permits editing unconfirmed inputs. A completed build or an authoritative missing-build response permits a deliberate new compilation; finished PRs can therefore be tested again after a new revision. Creating another realm after success asks for confirmation. Stored request IDs and pending inputs are isolated by provider origin and website path; credentials and API responses are never persisted.

When personal accounts are enabled, **Get my game account** creates a separate PR-specific game login per visitor. A signed HttpOnly browser cookie recovers it; clearing that cookie creates a new anonymous identity. Passwords are shown only on request and retained only in component memory. No individual website login is needed.

Archives stream without buffering the complete file. Downloads are forced to binary attachments and support byte ranges. Non-JSON API responses are rejected. A signed, short-lived CSRF cookie and matching Origin/nonce protect mutations; these cookies do not restrict access to this intentionally shared service. Use **Retry connection** after a gateway restart or cookie expiry.

## Validate and deploy

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Test both the default static build and an opted-in build at your intended root/subpath. Gateway tests use mocked upstream responses; no live compilation or realm mutation is required.

Back up the previous release and runtime configuration, deploy a reviewed commit with its dependencies, rebuild with the intended feature flag, restart the gateway and reload the web server. Verify the public static queue and, when enabled, `/tc9-api/config` and `/tc9-api/connection` beneath the site's path. Preserve any separately managed snapshot refresh job and data file. Roll back source, built assets and configuration together.

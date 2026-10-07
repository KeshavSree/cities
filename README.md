# C.I.T.I.E.S

A little city of people who build things. Every resident gets a low-poly tower; GitHub contributions and daily participation earn resources to grow and customize it. New residents arrive through invitations and receive plots near their inviter.

## Run locally

Requires Node.js 22+ and npm. No Cloudflare account is needed for local development.

```sh
npm install
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173**. The Worker runs at `127.0.0.1:8787`; Vite proxies API and WebSocket requests. Use `127.0.0.1` consistently rather than mixing it with `localhost`, so cookies and origin checks match.

`setup` copies `.dev.vars.example` to the ignored `.dev.vars`, generates a local encryption key, and applies D1 migrations. The local D1 database and Durable Object state persist in `.wrangler/state/`. The first visit seeds 21 explicitly labeled demo residents and signs you in as Alex Park. Balances, upgrades, colors, daily claims, invitations, and live updates use the real local Worker and D1 database. Refreshing or restarting the app preserves changes.

To demonstrate invitations, click **Invite a friend**, create an invitation, then **Try a demo join**. This consumes the invitation and places a demo neighbor near you. Demo routes are disabled unless the server configuration sets `DEV_MODE=true`; that setting is absent from production configuration.

```sh
npm run build       # TypeScript compilation + production frontend bundle
npm run preview     # Serve the built app through the local Worker on port 8787
```

## Controls

- Drag to orbit, right-drag to pan, scroll or use the buttons to zoom.
- Click a tower or use the searchable resident list to inspect it.
- Select your tower to upgrade, change architecture, or change its facade color.
- Switch between daytime and evening from the navigation bar.
- The help dialog explains progression. Mobile uses a bottom inspector.
- For a live update demonstration, open the city in two tabs, then upgrade or change a tower in one. The other receives the update over a Durable Object WebSocket.

## Real GitHub login locally

1. Register a [GitHub OAuth app](https://github.com/settings/developers).
2. Set homepage to `http://127.0.0.1:5173` and callback to `http://127.0.0.1:5173/api/auth/github/callback`.
3. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.dev.vars`. `setup` has already generated `TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as base64).
4. Configure `FOUNDER_GITHUB_ID` with the numeric GitHub ID of the founding account. For your own CLI-authenticated account, obtain it with `gh api user --jq .id`. This is an ID, not a username. The founder can create the first real account without an invitation; everyone else needs one.
5. Restart `npm run dev`. Open the tower's **Account** button, sign out of the demo session, and continue with GitHub.

The founding plot is `(0, 0)`. For a fresh city using real GitHub data, start with a fresh local D1 database rather than the seeded demo city. Preserve any demo work first, stop the dev server, and move `.wrangler/state` to a backup directory before applying `npm run setup` again. Set `DEV_MODE=false` in `.dev.vars` **before** opening the new database so it won't seed demo residents. Existing demo plots otherwise occupy the founding plot.

GitHub OAuth uses state validation, PKCE, and server-only credentials. Session cookies are HttpOnly and SameSite=Lax, with Secure enabled over HTTPS; only token hashes are stored in D1. GitHub access tokens are encrypted with AES-GCM. Expired/revoked provider tokens require signing in again; refresh-token rotation is not included in this first version.

## Progression

| Action | Resources |
| --- | ---: |
| Newly credited GitHub commit contribution | 1 |
| Newly credited pull request contribution | 8 |
| Newly credited review contribution | 5 |
| Daily check-in, once per UTC calendar day | 30 |
| Next tower level | Costs `65 + current level × 35` |
| Change silhouette | Costs 45 |
| Change facade color | Costs 15 |

No level cap. Rendered height continues to increase, while mesh detail is bounded so very tall towers don't require one mesh per floor. Meshes are merged by material and resident to reduce draw calls. Provider data is fetched from GitHub's past-year `contributionsCollection`. Each metric's credited high-water mark prevents repeated refreshes from awarding the same contributions. This deliberately conservative first version can under-credit new activity when older contributions leave the rolling year; permanent provider event IDs are the next step for precise long-term progression.

GitHub account control and provider counts are verifiable. They do not prove that commits are valuable work, that a person is unique, or that activity cannot be gamed. Demo heatmaps are decorative and labeled. Real residents show provider counts without fabricated contribution history. School email, website ownership, and LinkedIn integrations are future work.

## Architecture

```text
Browser: React + Three.js
  | HTTP: snapshots, auth, game actions
  v
Cloudflare Worker ----------> D1: users, plots, balances, invites, claims, sessions
  |
  | notify after persisted changes
  v
Durable Object per 8×8 neighborhood
  | hibernating WebSockets
  v
Browsers viewing that neighborhood
```

The initial view fetches up to 250 towers in a bounded area. Panning loads another snapshot. The browser connects to the nine neighborhood rooms surrounding its view; rendering frames never call the API. Broadcasts are ephemeral, and reconnecting loads a fresh database snapshot. A commit followed by a failed notification is recovered by snapshot reload, rather than rolling back the persisted action. Production reliability can be extended with a durable outbox if guaranteed delivery is needed.

Daily rewards use a composite unique key and atomic D1 batches. Spending uses conditional SQL updates. Plot coordinates and identity are unique, and invitation allocation runs as an atomic batch that rejects used invitations and retries coordinate collisions. Changes require same-origin requests and authenticated sessions. A resident can issue at most five invitations per UTC day.

GitHub manual sync has a 15-minute cooldown. A six-hour Cron Trigger refreshes at most three stale accounts per invocation. This is suitable for an initial small city; use Queues and more frequent scheduled batches before supporting many active GitHub accounts. No polling of GitHub during page rendering.

## Cloudflare deployment later

No resources are provisioned automatically, and this project has not been deployed. `wrangler.jsonc` contains a placeholder database ID and application origin.

```sh
npx wrangler login
npx wrangler d1 create cities
```

Replace `database_id` with the returned ID, and set `APP_ORIGIN` to the exact HTTPS origin where you will host the app. Configure `FOUNDER_GITHUB_ID` in `vars`. Register the production GitHub OAuth callback at that origin, then store credentials:

```sh
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler d1 migrations apply cities --remote
npm run deploy
```

Generate a separate production encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Keep that value in a password manager. Changing it makes existing encrypted GitHub tokens unreadable until users reconnect. Never copy local demo data into production, or enable `DEV_MODE` there.

Static assets bypass the Worker except for `/api/*`. Use SQLite-backed Durable Objects (`new_sqlite_classes`), which are available on Cloudflare's free plan. The intended starting cost is $0 within the free quotas; paid Workers starts at $5/month. OAuth CPU consumption, production latency, traffic capacity, and the real provider flow still need measurement on the deployed runtime.

## Project layout

- `src/`: React interface, styles, procedural Three.js city.
- `worker/`: API, GitHub OAuth/sync, local-only demo fixtures, Durable Object.
- `shared/`: typed building descriptors and progression rules.
- `migrations/`: D1 schema.
- `scripts/setup.mjs`: local configuration and migration setup.
- `PLAN.md`: implementation plan and scope.

Development dependencies override `sharp` and `shell-quote` to patched releases because the local runtime and process runner pulled affected versions. `package-lock.json` records the complete installation.

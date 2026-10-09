# C.I.T.I.E.S

A little city of people who build things. Every resident gets a low-poly building; Verified activity earns permanent XP to level up through ten model tiers. Spend bricks on segment designs, finishes, and nearby public projects. New residents arrive through invitations and receive plots near their inviter.

## Run locally

Requires Node.js 22+ and npm. No Cloudflare account is needed for local development.

```sh
npm install
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173**. The Worker runs at `127.0.0.1:8787`; Vite proxies API and WebSocket requests. Use `127.0.0.1` consistently rather than mixing it with `localhost`, so cookies and origin checks match.

`setup` copies `.dev.vars.example` to the ignored `.dev.vars`, generates a local encryption key, and applies D1 migrations. The local D1 database and Durable Object state persist in `.wrangler/state/`. The first visit seeds 21 explicitly labeled demo residents and signs you in as Alex Park. XP, bricks, customization, likes, public contributions, daily claims, invitations, and live updates use the real local Worker and D1 database. Refreshing or restarting the app preserves changes.

To demonstrate invitations, click **Invite a friend**, create an invitation, then **Try a demo join**. This consumes the invitation and places a demo neighbor near you. Demo routes are disabled unless the server configuration sets `DEV_MODE=true`; that setting is absent from production configuration.

```sh
npm run build       # TypeScript compilation + production frontend bundle
npm run preview     # Serve the built app through the local Worker on port 8787
```

## Controls

- Drag to orbit, right-drag to pan, scroll or use the buttons to zoom.
- Click the city canvas or focus it with Tab. Hold WASD to move relative to the camera, Q/E to rotate, Space to rise, and Shift to descend. Arrow keys also pan. Movement pauses while an input, button, or dialog has focus, and clears when the tab loses focus.
- Click a tower or use the searchable resident list to inspect it.
- In local development, toggle **Dev mode** to show level, model tier, and XP above each building. The drawer explains the road score, nearby mean level, planned frontage, each segment’s architectural role, overlap with the tier below, and overhang. Local demo controls preview any level from 1–30 and simulate rewards, clearly labeled in the XP ledger. Dev edits cannot target real residents, and dev routes are disabled in production.
- Select your tower to inspect XP, bricks, and recent rewards. Architecture lets you customize the segments unlocked by your tier or change the overall finish. Levels unlock automatically.
- Lighting follows the viewer's actual local clock, refreshing automatically and when the tab becomes visible. Dawn and dusk are approximate clock-based transitions, not location-based sunrise calculations. There is no day/night toggle or district selector.
- Orbit down to about 2.6 degrees above the ground. The camera and terrain adapt to keep the foreground continuous at low angles.
- The help dialog explains progression. Tower details slide from the right edge on desktop and mobile. Click or drag the edge handle to pull them out or push them back.
- For a live update demonstration, open the city in two tabs, then earn a reward or change a tower in one. The other receives the update over a Durable Object WebSocket.

## Real GitHub login locally

1. Register a [GitHub OAuth app](https://github.com/settings/developers).
2. Set homepage to `http://127.0.0.1:5173` and callback to `http://127.0.0.1:5173/api/auth/github/callback`.
3. Add `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` to `.dev.vars`. `setup` has already generated `TOKEN_ENCRYPTION_KEY` (32 random bytes encoded as base64).
4. Configure `FOUNDER_GITHUB_ID` with the numeric GitHub ID of the founding account. For your own CLI-authenticated account, obtain it with `gh api user --jq .id`. This is an ID, not a username. The founder can create the first real account without an invitation; everyone else needs one.
5. Restart `npm run dev`. Open the tower's **Account** button, sign out of the demo session, and continue with GitHub.

The founding plot is `(0, 0)`. For a fresh city using real GitHub data, start with a fresh local D1 database rather than the seeded demo city. Preserve any demo work first, stop the dev server, and move `.wrangler/state` to a backup directory before applying `npm run setup` again. Set `DEV_MODE=false` in `.dev.vars` **before** opening the new database so it won't seed demo residents. Existing demo plots otherwise occupy the founding plot.

GitHub OAuth uses state validation, PKCE, and server-only credentials. Session cookies are HttpOnly and SameSite=Lax, with Secure enabled over HTTPS; only token hashes are stored in D1. GitHub access tokens are encrypted with AES-GCM. Expired/revoked provider tokens require signing in again; refresh-token rotation is not included in this first version.

## Progression

XP is permanent and levels unlock automatically. The current version has **30 levels and ten model tiers**. Going from level `L` to `L+1` requires `100 + 50 × (L−1)` XP. Cumulative thresholds are shared by the UI and the database migration; XP never pays for cosmetics. XP can continue accumulating at level 30.

| Action | XP | Bricks |
| --- | ---: | ---: |
| Newly credited GitHub commit | 5 | 1 per five commit XP |
| Invited resident actually joins | 200 | — |
| Another authenticated resident likes your tower | 50 | — |
| Nearby new construction or tier milestone | 12 | — |
| Complete a public project, having contributed at least 25 bricks | 200 | — |
| Daily visit, once per UTC calendar day | 30 | 30 |
| Edit one segment's color and details | — | Costs 20 |
| Change overall finish / default facade color | — | Costs 45 / 15 |

GitHub rewards are commit-only; pull requests and reviews do not earn XP or bricks. Updated rates apply to future rewards, preserving earned XP and credited commit counts. `0003_reward_rates.sql` updates the public-project completion trigger to 200 XP.

Likes are permanent, limited to one per account per tower, and cannot target yourself. Production liking requires a GitHub-connected account; local demo likes stay between demo residents. Invites only award after successful joining. Nearby construction is an event, not passive proximity income: the eight closest other residents within three plot spacings receive XP when a building is created or crosses levels 4, 7, 10, 13, 16, 19, 22, 25, or 28. Coordinate-keyed, distance-weighted occupancy still shapes roads; it no longer determines an individual tower's model.

| Levels | Model | Ground |
| --- | --- | --- |
| 1–3 | Shack | Wild clearing, timber foundation |
| 4–6 | Cottage | Meadow garden, fences, stepping stones |
| 7–9 | Townhouse | Lawn, brick patio, hedges |
| 10–12 | Apartments | Shared paved courtyard |
| 13–15 | High-rise | Stone plaza |
| 16–18 | Skyscraper | Raised civic terrace |
| 19–21 | Neon tower | Illuminated plaza, cyan base band |
| 22–24 | Prism spire | Faceted transit court, violet platform |
| 25–27 | Sky garden | Biosphere terrace, green base band and roof planting |
| 28–30 | Arcology | Civic energy platform, blue base band |

Every three levels unlock a model tier and one editable segment: one at levels 1–3, up to ten at levels 28–30. Each level within a tier increases height. Each segment stores its own architectural theme, color, and facade details. Terraced Contemporary is the first available theme; classic windows, glass facades, and balconies are independent finishes. Existing saved designs inherit the new theme without spending bricks. The server accepts edits only for unlocked segments; ten storage slots are initialized on creation.

Apartments and higher models have parcel-following bases. The Terraced Contemporary grammar uses asymmetric setbacks, paired volumes, a planted roof pavilion, and recessed garden floors supported by perimeter columns. Each tier combines a new proposal derived from the original plot with the previous tier’s four-corner frame (65% proposal, 35% inherited frame). Plot skew remains present at every height. Actual lower wall geometry then constrains the result: at least 85% floor-plate overlap and at most 0.28 world units of cantilever (0.10 for smaller models). This is a visual massing rule, not structural engineering. A chamfer is confined to upper corners rather than making the whole tower triangular. Adjacent plots alternate the direction of lateral setbacks. Higher models use gentler lateral offsets and three-part shaft groups with matching outlines, so multiple editable tiers read as one continuous volume. One shallow recessed garden floor separates the upper shaft.

Facade bays share a common datum; slab edges, mullions, and timber end panels connect the tiers. Shacks, cottages, and townhouses use small, widely spaced windows with substantial solid walls. Window width, height, and bay density increase gradually through apartments and high-rises; glass facade customization respects that progression. Roof pavilions have solid walls and punched windows below the skyscraper tier. Terrace planting and railings use exposed roof space outside the next section, with clearance for planters. The upper pavilion leaves a roof garden around it. Theme selection is stored per unlocked tier and dispatched per tier by the massing registry, ready for additional themes. The existing ten-tier progression, ground treatments, and road-clearance contours remain in use.

Architectural references: [Herzog & de Meuron’s 56 Leonard](https://www.herzogdemeuron.com/projects/305-56-leonard-street/) informed the shared core, distinct stacked volumes and inhabited setbacks; [BIG’s The Mountain](https://big.dk/projects/the-mountain-1430) informed roofs becoming gardens for the homes above. These are design principles translated into a stylized generator, not replicas of those projects.

`0004_ten_tiers.sql` extends cumulative XP thresholds through level 30, recalculates levels from existing earned XP, preserves saved segment designs while padding storage to ten slots, and changes construction milestones to every third level. XP and brick balances are preserved. Fresh demo fixtures cover all ten tiers; existing demo residents retain their progress and can use the dev tier previews. The old `resources` column remains for migration compatibility.

GitHub account control and provider counts are verifiable. Provider data comes from the past-year contribution collection; credited high-water marks prevent repeated refresh awards. This conservative version may under-credit activity when old contributions leave the rolling year. Permanent provider event IDs remain a future improvement. School email, website ownership, LinkedIn, and package release verification are not integrated yet.

### Public projects

Riverside commons and Makers square reserve two-by-two plot zones. They cannot be allocated as private homes. Their boundaries follow the real road shoulders, including angled segments and width transitions, rather than a fixed rectangle. Boundary streets connect to the existing network through the nearest street corner; fencing leaves a road-facing entrance and the path leads into the project. Distant, unloaded projects do not generate long access roads. Nearby residents (within 35 world units) pool bricks; funding reveals groundwork, trees, seating, and a final pavilion or sculpture at quarter-goal stages. Clicking a site or its label opens that project in the flush sidebar, with funding, contributors, and brick contributions. The Projects button opens a project directory in the same sidebar.

Contributions are guarded by balance and remaining goal, with idempotent request receipts. Completion rewards each resident who contributed at least 25 bricks once. D1 triggers commit spending, funding, and completion XP together. Projects broadcast updates over a neighborhood WebSocket; completion reloads snapshots to reflect contributors' newly unlocked levels.

Brick balances are private to their owner. Production snapshots, like responses, and public WebSocket events redact other balances; the owner refreshes their private balance through an authenticated endpoint after a live update. Local dev diagnostics can inspect all balances.

### Reward accounting

A unique-key XP ledger records GitHub credits, redeemed invites, likes, daily visits, nearby construction, and public project completions. SQL triggers apply XP, bricks, and automatic level changes atomically. Construction milestones are queued durably, and a bounded worker drains one milestone per active snapshot/reward request or scheduled run, broadcasting the eight recipients. Further milestones caused by those rewards remain queued. Delays are possible when nobody is active; retries cannot double-credit a milestone. Dev level previews edit sample totals directly and suppress preview-only construction; simulated rewards are labeled `demo`.

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

The initial view fetches up to 250 nearest towers within a bounded 64-plot radius. Panning loads another snapshot. The browser connects to nearby neighborhood rooms and the rooms containing loaded towers; rendering frames never call the API. Broadcasts are ephemeral, and reconnecting loads a fresh database snapshot. A commit followed by a failed notification is recovered by snapshot reload, rather than rolling back the persisted action. Production reliability can be extended with a durable outbox if guaranteed delivery is needed. A dense city will need viewport-aware database pagination and multiplexed live subscriptions before going beyond this initial 250-tower snapshot.

### Continuous terrain and coastline

The visible world uses a finite mesh window projected from the camera's four viewing lines onto the ground plane, with extra terrain beyond the view. The window is rebuilt on chunk boundaries as you pan or zoom. Land and water fill the view without a board edge; terrain generation is entirely local and does not create empty database plots.

Terrain uses long filled strips rather than one polygon per distant plot. This keeps shallow camera angles practical as the visible ground extends toward the horizon.

`shared/world.ts` defines a fixed curved coast using a sum of waves sampled at globally anchored intervals. Straight segments connect those samples into a low-poly shoreline that extends in both directions. Its shape and location stay stable while the terrain window moves. The same function keeps server-created plots and their bordering streets inland of the beach.

Road segments are deduplicated boundaries of occupied plots, so empty land has a plot grid but no prebuilt streets. The coastal buffer is reserved for sand and shallow water. Existing building coordinates remain unchanged.

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
- `shared/`: typed building descriptors, progression rules, and shared coastline math.
- `migrations/`: D1 schema.
- `scripts/setup.mjs`: local configuration and migration setup.
- `PLAN.md`: implementation plan and scope.

Development dependencies override `sharp` and `shell-quote` to patched releases because the local runtime and process runner pulled affected versions. `package-lock.json` records the complete installation.

### Density and irregular streets

The straight road segments, shared angled junctions, tapering widths, and solid-color transitions are retained. Road development now combines nearby occupancy and building levels over a 7 × 7 neighborhood. Spatial weights use actual world distance: `w = exp(−distance² / 3.2)` in plot-spacing units.

- `D`: occupied weight divided by all possible plot weight.
- `M`: distance-weighted mean level of occupied nearby buildings.
- `L`: `(M−1)/29`, or zero when there are no occupied neighbors.
- Road score: **`0.45 × D + 0.55 × L`**.
- Rural roads below 0.25; suburban from 0.25 to below 0.72; urban at 0.72 or above.

Roads correlate with neighboring development, while individual building models and grounds follow their own level tier. The same score drives street surfaces, transitions, empty gardens, dev diagnostics, and placement previews. The snapshot is capped at 250 residents, so a larger dense city will require finer spatial paging for accurate nearby means.

### Planned orientations and future plots

`shared/plots.ts` precomputes 4 × 3 areas (12 slots). Even sums of area coordinates align buildings with horizontal roads; odd sums use the angled side-road family. Adjacent areas switch families. Every slot independently chooses one of the two facing directions on its chosen family. Plans are cached in bounded chunks; occupancy never rotates existing buildings.

Every occupied plot creates its planned entrance road. Small rectangular models and their entrances align to that frontage; larger bases follow parcel edges and upper sections fit their supporting shapes. Separate ground polygons are clipped to road shoulders; fences leave an entrance gap.

The server returns 24 available slots around the signed-in resident using occupancy independent of the render limit, excluding public zones. Dev mode shows level-one shack outlines, entrance arrows, and an initial road prediction. Each candidate is simulated individually; simultaneous joins can take a previewed slot before redemption. Ground gardens are cleared when a real building occupies the plot.

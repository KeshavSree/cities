# Local development and neighborhood rendering

A little city of people who build things. Every resident gets a low-poly building; Verified activity earns permanent XP to level up through ten model tiers. Spend bricks on permanent theme unlocks, finishes, and nearby public projects. New residents arrive through invitations and receive plots near their inviter.

## Run locally

Requires Node.js 22+ and npm. No Cloudflare account is needed for local development.

```sh
npm install
npm run setup
npm run dev
```

Open **http://127.0.0.1:5173**. The Worker runs at `127.0.0.1:8787`; Vite proxies API and WebSocket requests. Use `127.0.0.1` consistently rather than mixing it with `localhost`, so cookies and origin checks match.

`setup` copies `.dev.vars.example` to the ignored `.dev.vars`, generates a local encryption key, and applies D1 migrations. The local D1 database and Durable Object state persist in `.wrangler/state/`. The first visit seeds 21 explicitly labeled demo residents and signs you in as Alex Park without GitHub. Cookie-free local requests use the same mock owner. A one-time starter gift adds 1,500 bricks; streets start empty. Older automatic starter items remain in storage. Reloads do not repeat the gift or reset purchases. To add example purchases to four other demo residents in the current database, explicitly POST `/api/dev/neighborhood-examples`. This local-only, repeat-safe action adds attached shops, walking neighbors, lamps, benches, and planters, using real catalog costs and purchase records without spending your bricks. It never runs during normal startup. For a denser visual/performance fixture across all 21 demo properties, explicitly POST `/api/dev/neighborhood-populate`; this adds legal ground-level shops, lamps, trees, benches, planters, sculptures, and walking neighbors while preserving existing items and balances. Both fixture actions are repeat-safe and local only. Dev brick grants can use `/api/dev/progression` with `{source:"bricks",amount:10000,requestId:"a-unique-request-id"}`; the receipt makes retries safe. Mock authentication requires both `DEV_MODE=true` and a loopback `APP_ORIGIN`. XP, bricks, customization, likes, public contributions, daily claims, invitations, and live updates use the real local Worker and D1 database. Refreshing or restarting the app preserves changes.

To demonstrate invitations, click **Invite a friend**, create an invitation, then **Try a demo join**. The invitation is permanent and can be reused to place demo neighbors near you. Demo routes are disabled unless the server configuration sets `DEV_MODE=true`; that setting is absent from production configuration.

```sh
npm run build       # TypeScript compilation + production frontend bundle
npm run preview     # Serve the built app through the local Worker on port 8787
```

## Controls

- Phones and touch devices use a full-screen Street view interface with a left thumb joystick and right **Pick up / Place** button. Drag the joystick in any direction; pushing farther walks faster, with a small central dead zone to prevent drift. Swipe the scene with another finger to look while walking. Held items expose **Rotate** and **Cancel**, the placement price, and any invalid-spot message. **Shop** opens your tower panel and pauses movement; **Resume walking** closes panels. **City view** restores the map and its navigation. Controls respect safe areas, small portrait/landscape screens, and viewport height changes. Releasing or canceling touches, opening a panel, or switching control layouts stops held movement.
- The five-step **Neighborhood guide** covers Street view entry, shopping, carrying items, storefronts, walking neighbors, and local lighting. New residents reach it after tower onboarding; returning residents (including local demo owners) see it once per account in each browser. Skip or close it at any time and replay it from **Settings → Neighborhood guide** or **How it works → Tour the neighborhood features**. Completion is stored locally under the versioned `cities-neighborhood-guide:v1:<owner>` key. The guide pauses walking, never buys or moves an item, and finishes by highlighting streets for the player to choose. It waits until pending placement and item interactions finish before appearing automatically. Replay is disabled during those interactions. **Test onboarding** replays the original tower tour and then this guide.
- Drag the little amber person beside **Street view** onto a blue highlighted road and drop to enter. The person wiggles while held (unless reduced motion is enabled). You can also click or tap the person to highlight the roads, then click or tap a road to start there. Keyboard users can activate the person with Enter or Space, choose a road from the street list, then activate **Enter Street view**. Selecting a list entry previews the same highlighted road; entry stays disabled until a street is chosen. Click the person again, choose City view, or press Escape to cancel. An invalid drop never enters Street view. Native pointer lock confines and hides the cursor while you look around; click the scene to recapture after releasing it. Use WASD or the walking arrows to move. Escape releases the mouse and cancels a held item; **City view** returns to the overview. Touch uses swipes to look and a thumb joystick to walk. Opening a panel pauses walking and releases the mouse. If an embedded browser blocks capture, Street view shows a retry prompt; open the local URL in a full Chrome or Safari browser for captured mouse-look. Q/E and arrow keys remain available without capture. After a rejected capture attempt, the next click can pick up an aimed owned item; the initial capture click still cannot accidentally pick it up.
- Drag to orbit, right-drag to pan, scroll or use the buttons to zoom.
- Click the city canvas or focus it with Tab. Hold WASD to move relative to the camera, Q/E to rotate, Space to rise, and Shift to descend. Arrow keys also pan. Movement pauses while an input, button, or dialog has focus, and clears when the tab loses focus.
- Click a tower or use the searchable resident list to inspect it.
- Open **My tower → Neighborhood shop** (or **Shop** in Street view) for flower planters (40 bricks), benches (70), lamps (90), small trees (120), sculptures (160), neighbors (100), and corner shops (220). From City view, choose a yard spot, rotate/nudge the preview, and confirm **Buy & place**. In Street view, choosing an item closes the shop and immediately puts its preview in your hands, ready to place. The same shop click restores mouse capture when the browser allows it. Held previews can also be placed with one click if capture is unavailable; use Q/E and arrow keys to look. Walk to a spot and click to place it; new purchases charge only on placement. Look directly at one of your placed items within reach to highlight it, then click to pick it up. F picks up or places without mouse capture; R rotates; Escape cancels without moving the saved original. Touch uses taps to pick up/place, with Rotate and Cancel buttons. Invalid spots show a red preview. Owned items move and store for free, with 24 items per collection. Roads, sidewalks, buildings, other parcels, and existing items stay clear. Items displaced by building growth remain in the collection.
- Purchased neighbors walk to reachable corner shops and commercial buildings, pause to visit, and return home. Without a reachable shop, they stroll nearby. Picking one up pauses their walk; placing them sets a new home. Walking never changes their saved home or spends bricks.
- In local development, toggle **Dev mode** to show level, model tier, and XP above each building. The drawer explains the road score, nearby mean level, planned frontage, each segment’s architectural role, overlap with the tier below, and overhang. Local demo controls preview any level from 1–30 and simulate rewards, clearly labeled in the XP ledger. Dev edits cannot target real residents, and dev routes are disabled in production.
- Select your tower to inspect XP, bricks, and recent rewards. Architecture lets you customize the segments unlocked by your tier or change the overall finish. Levels unlock automatically.
- Lighting follows the viewer's actual local clock, refreshing automatically and when the tab becomes visible. Dawn and dusk use approximate clock-based transitions. Local development also provides a Lighting preview selector in Settings for Morning, Day, Evening, Night, and Auto (local time).
- Orbit down to about 2.6 degrees above the ground. The camera and terrain adapt to keep the foreground continuous at low angles.
- The help dialog explains progression. Tower details slide from the right edge on desktop and mobile. Click or drag the edge handle to pull them out or push them back.
- For a live update demonstration, open the city in two tabs, then earn a reward or change a tower in one. The other receives the update over a Durable Object WebSocket.

## Real GitHub login locally

For real authentication testing, set `DEV_MODE=false` in `.dev.vars` and restart the dev server to disable automatic mock ownership.

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
| Newly credited GitHub commit (max 20/day) | 10 | 10 |
| Approved contribution merged into C.I.T.I.E.S | 100 | — |
| Invited resident actually joins | 200 | — |
| An authenticated resident likes your tower, including yourself | 50 | — |
| Nearby tower levels up, including creation (0 → 1) | 20 | — |
| Complete a public project, having contributed at least 25 bricks | 200 | — |
| Daily visit, once per UTC calendar day | 30 | 30 |
| Edit one segment's color and details | — | Costs 20 |
| Change overall finish / default facade color | — | Costs 45 / 15 |

The first successful GitHub sync records a baseline and awards no XP or bricks for historical commits. Subsequent syncs reward increases above that baseline, capped at 20 commits (200 XP and 200 bricks) per UTC day. Excess commits are consumed by the baseline and cannot carry into later reward days. GitHub rewards are commit-only; pull requests and reviews do not earn XP or bricks. Updated rates apply to future rewards, preserving earned XP and credited commit counts. `0003_reward_rates.sql` updates the public-project completion trigger to 200 XP.

Likes are permanent and limited to one per account per tower, including your own tower. Production liking requires a GitHub-connected account; local demo likes stay between demo residents. Invites only award after successful joining. Nearby rewards are event-based: the eight closest other residents within three plot spacings receive 20 XP for each level a nearby tower gains. Placing a new tower counts as 0 → 1; subsequent level-ups continue through level 30. Migration `0006_level_up_rewards.sql` replaces tier-milestone rewards with individual level-up rewards while retaining creation rewards, existing XP and balances. Coordinate-keyed, distance-weighted occupancy still shapes roads; it no longer determines an individual tower's model.

| Levels | Model | Ground |
| --- | --- | --- |
| 1–3 | Shack | Wild clearing, timber foundation |
| 4–6 | Cottage | Meadow garden, fences, stepping stones |
| 7–9 | Townhouse | Lawn, brick patio, hedges |
| 10–12 | Apartments | Shared paved courtyard |
| 13–15 | High-rise | Stone plaza |
| 16–18 | Skyscraper | Raised civic terrace |
| 19–21 | Skybridge tower | Illuminated plaza, cyan base band |
| 22–24 | Vertical campus | Faceted transit court, violet platform |
| 25–27 | Sky garden | Biosphere terrace, green base band and roof planting |
| 28–30 | Arcology | Civic energy platform, blue base band |

Every three levels unlock a model tier and one editable segment: one at levels 1–3, up to ten at levels 28–30. Each level within a tier increases height. Each segment stores its own architectural theme, color, and facade details. Terraced Contemporary is free; four additional themes are permanent brick unlocks at shared price tiers. Classic windows, glass facades, and balconies remain independent details. Once a theme is unlocked, it can be applied to any available segment—and switched again later—without spending more bricks. The server verifies theme ownership and accepts edits only for unlocked segments; ten storage slots are initialized on creation.

| Price tier | Theme | Bricks | Architectural system |
| --- | --- | ---: | --- |
| Starter | Terraced Contemporary | 0 | Offset volumes, planted terraces, connected facade lines |
| 1 | Earthen Citadel | 90 | Tapered mineral walls, recessed openings, parapets and shaded courts |
| 2 | Art Deco | 180 | Axial setbacks, vertical ribs, geometric entrances and stepped crowns |
| 3 | Metabolism | 360 | Stable service cores, projecting modular pods and rooftop equipment |
| 4 | Nocturne Spire | 540 | Buttressed dark masonry, narrow luminous bays and split pointed crowns |

Theme identity extends through massing, facade proportions, materials, ground furnishings, roof treatment, crown and night lighting. Adjacent segments may use different owned themes; the shared composition layer retains the lower outline, support overlap and common facade datum so the result remains one building.

Apartments and higher models have parcel-following bases. The Terraced Contemporary grammar uses asymmetric setbacks, paired volumes, a planted roof pavilion, and recessed garden floors supported by perimeter columns. Each tier combines a new proposal derived from the original plot with the previous tier’s parcel frame (65% proposal, 35% inherited frame). Plot skew remains present at every height. Actual lower wall geometry then constrains the result: at least 85% floor-plate overlap and at most 0.28 world units of cantilever (0.10 for smaller models). This is a visual massing rule, not structural engineering. A chamfer is confined to upper corners rather than making the whole tower triangular. Adjacent plots alternate the direction of lateral setbacks. Higher models use gentler lateral offsets and three-part shaft groups with matching outlines, so multiple editable tiers read as one continuous volume. One shallow recessed garden floor separates the upper shaft.

Facade bays share a common datum; slab edges, mullions, and timber end panels connect the tiers. Shacks, cottages, and townhouses use small, widely spaced windows with substantial solid walls. Window width, height, and bay density increase gradually through apartments and high-rises; glass facade customization respects that progression. Roof pavilions have solid walls and punched windows below the skyscraper tier. Terrace planting and railings use exposed roof space outside the next section, with clearance for planters. The upper pavilion leaves a roof garden around it. Theme selection is stored per unlocked tier and dispatched per tier by the massing registry, ready for additional themes. The existing ten-tier progression, ground treatments, and road-clearance contours remain in use.

Architectural references: [Herzog & de Meuron’s 56 Leonard](https://www.herzogdemeuron.com/projects/305-56-leonard-street/) informed the shared core, distinct stacked volumes and inhabited setbacks; [BIG’s The Mountain](https://big.dk/projects/the-mountain-1430) informed roofs becoming gardens for the homes above. These are design principles translated into a stylized generator, not replicas of those projects.

`0004_ten_tiers.sql` extends cumulative XP thresholds through level 30, recalculates levels from existing earned XP, preserves saved segment designs while padding storage to ten slots, and changes construction milestones to every third level. XP and brick balances are preserved. Fresh demo fixtures cover all ten tiers; existing demo residents retain their progress and can use the dev tier previews. The old `resources` column remains for migration compatibility.

GitHub account control and provider counts are verifiable. Provider data comes from the past-year contribution collection; credited high-water marks prevent repeated refresh awards. This conservative version may under-credit activity when old contributions leave the rolling year. Permanent provider event IDs remain a future improvement. School email, website ownership, LinkedIn, and package release verification are not integrated yet.

### Public projects

Riverside commons and Makers square reserve two-by-two plot zones. They cannot be allocated as private homes. Their boundaries follow the real road shoulders, including angled segments and width transitions, rather than a fixed rectangle. Boundary streets connect to the existing network through the nearest street corner; fencing leaves a road-facing entrance and the path leads into the project. Distant, unloaded projects do not generate long access roads. Nearby residents (within 35 world units) pool bricks; funding reveals groundwork, trees, seating, and a final pavilion or sculpture at quarter-goal stages. Clicking a site or its label opens that project in the flush sidebar, with funding, contributors, and brick contributions. The Projects button opens a project directory in the same sidebar.

Contributions are guarded by balance and remaining goal, with idempotent request receipts. Completion rewards each resident who contributed at least 25 bricks once. D1 triggers commit spending, funding, and completion XP together. Projects broadcast updates over a neighborhood WebSocket; completion reloads snapshots to reflect contributors' newly unlocked levels.

Brick balances are private to their owner. Production snapshots, like responses, and public WebSocket events redact other balances; the owner refreshes their private balance through an authenticated endpoint after a live update. Local dev diagnostics can inspect all balances.

### Reward accounting

A unique-key XP ledger records GitHub credits, redeemed invites, likes, daily visits, nearby construction, and public project completions. SQL triggers apply XP, bricks, and automatic level changes atomically. Tower level-ups are queued durably, and a bounded worker drains one level-up per active snapshot/reward request or scheduled run, broadcasting the eight recipients. Further level-ups caused by those rewards remain queued. Delays are possible when nobody is active; retries cannot double-credit a level-up. Dev level previews edit sample totals directly and suppress preview-only construction; simulated rewards are labeled `demo`.

### Profiles

Residents can edit their own bio (up to 280 characters) and upload a profile picture from the sidebar. Photos are center-cropped to 256 × 256 JPEGs, capped at 128 KiB, and stored separately in D1. Neighborhood snapshots contain only the image URL. GitHub photos are used by default; missing or broken photos show a gray silhouette. Custom bios and uploaded photos survive subsequent GitHub logins. Migration `0007_profiles.sql` adds profile storage; `0008_self_likes.sql` permits self-likes while preserving existing likes.

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

`shared/world.ts` keeps the original square grid within ±3.5 logical plots. A finite transition ring, three plots deep, joins it to a square grid rotated 30 degrees. Eight affine triangles connect the two boundaries while retaining straight road segments within each patch. Beyond ±6.5 logical plots, the entire exterior is a rigid square lattice in every direction; the transition never widens or returns to the original heading. Whole plots at a logical Chebyshev radius of seven or more are fully in the outgoing grid. Local T junctions and cul-de-sacs still alter individual parcels. Camera paging uses the exact inverse of the original grid, finite patches, or rotated exterior.

`shared/streets.ts` precomputes a street graph and land boundaries without occupancy data. The established starter grid keeps its existing topology. New planning areas use coordinate-seeded randomness (`STREET_BRANCH_SEED = 7113`): 20% T junctions, 15% cul-de-sacs, and 65% square crossings. Triangular forks occur at the finite interface between grid orientations; the seed chooses between eligible fork corners outside the starter area, with at most one per 4×3 planning area. Fork halves share a diagonal street and neighboring parcels follow those corners. T junctions omit an arm permanently, including inside fully occupied areas. Cul-de-sacs reserve a twelve-sided turning circle, share one approach, and orient nearby houses toward a circle facet. Public-project boundaries suppress special junctions on their edges.

Before allocating a resident, `shared/plots.ts` precomputes a placement plan containing the lot, frontage, orientation, and access roads extending the inviter’s existing street blueprint. A cached breadth-first expansion walks actual street nodes, including triangular-fork halves and cul-de-sac facets. Approaches use at most 32 planned edges, stay inland, and avoid public-site interiors. Occupancy filters available slots; it cannot reshape a placement plan. Rendering activates the planned roads and blends their widths and materials from surrounding density and levels. The saved invitation anchors the same route after construction; snapshots include the inviter’s coordinates even when that resident is outside the render page. Public-project access follows legal planned links.

Run `npm run check:roads` to check convex parcels, usable footprints across all model tiers, entrance alignment, all three junction types, and equality between preview and constructed road plans over a sample of 475 parcels.

The city follows the viewer’s browser timezone: morning 6–9am, day 9am–6pm, evening 6–9pm, and night 9pm–6am. Sky and sunlight blend through dawn and dusk. Purchased lamps, shop windows, and funded park lamps turn on from 6pm to 6am. Lamps cast warm, soft-edged light onto roads, sidewalks, buildings, and people, with distance falloff. Purchased corner shops and attached storefront windows also spill warm light outward onto the pavement; their light direction follows the shop’s actual wall angle. Daytime sunlight casts shadows from buildings, decorations, walking neighbors, and woodland, with finer shadow detail at street level. The sun’s horizontal direction is reversed from the original lighting setup. Tower rooms have a stable mix of lit and dark windows after dusk; each room’s occupancy follows its building and facade address rather than rerolling on refresh. Moving people refresh their shadows at a bounded rate. Every placed lamp and shop window keeps a soft warm ground pool after dusk, independent of camera position. These persistent pools use one instanced draw. Surface illumination uses a fixed world-space grid shared by receiving materials. Each surface checks at most eight nearby sources, with the same brightness on desktop and mobile. Panning never reallocates light power, rebuilds light textures, or starts brightness fades. Carried previews use two reserved shader slots. This diffuse streetlight shading adds no per-lamp render passes or local shadow maps; sunlight still casts shadows. Carried and placement-preview lamps move their light with them; stored lamps emit nothing. The clock refreshes every 30 seconds and immediately on focus or returning to the page, including timezone and daylight-saving changes. Settings shows the current local phase. In the Vite dev server, Settings → Lighting preview selects Morning, Day, Evening, Night, or Auto (local time). Street view also has a Lighting shortcut. A preview holds until changed; Auto immediately restores the local clock. Reloading starts in Auto, and the preview controls are absent from production builds. Run `npm run check:lighting` for clock boundaries, timezone/DST behavior, palette continuity, and lamp materials.

Undeveloped land grows deterministic broadleaf trees, pines, and wild undergrowth. Natural woodland stays clear of occupied parcels, public project plots, actual roads and sidewalks, beaches, and the inland lake. It uses instanced meshes in a bounded cache of up to 49 woodland tiles. Existing tile buffers survive movement, and only newly exposed edge tiles are generated; tile bounds also let the camera and shadow passes cull distant trees. Tiles share geometry and materials. Camera movement and lighting previews preserve tree locations, and new construction clears its own plot automatically. Owned parcels still start empty; purchased trees and decorations remain separate from the natural landscape.

Run `npm run check:neighbors` to verify collision-free routes, shop visits, return trips, narrow garden exits, carried-person suspension, and local mock-auth guards.

Run `npm run check:decorations` to verify placement across tiers and irregular plots, road and ownership boundaries, rotation, overlap, storage, and building growth. Its database checks cover atomic brick spending, retry receipts, free moves, stale layout conflicts, rollback, and collection limits. Migration `0014_decorations.sql` adds owned decorations and purchase/move triggers; migration `0015_neighborhood_items.sql` extends the catalog to shops and people while preserving existing purchases and balances. Migration `0016_attached_shops.sql` adds tower storefronts without changing existing receipts or balances. Apply all three before running the updated worker. Tower storefronts cost 300 bricks, unlock at level 4, and snap to free ground-floor wall slots; purchased neighbors visit both these shops and freestanding corner shops. Run `npm run check:shops` to verify attachments and visits across building tiers and irregular plots. Decoration purchases use server prices, authenticated ownership, and layout revisions. Public snapshots include decorations so neighbors see placed items. Buildings now leave wider setbacks beside the widened roads and shoulders while keeping all plot coordinates stable.

Run `npm run check:street` to check safe street arrivals across building tiers and irregular parcels, chosen starting points, empty default streets and purchased-item collision, body clearance, wall sliding, fast movement, and the shoreline boundary. Interaction checks also verify owned-object highlighting, occlusion, reach, pickup, carrying, invalid placement, rotation, cancellation, pending saves, failed-save recovery, and exit cleanup. Street view uses the same world geometry with a perspective camera and a bounded terrain window with distance fog. Streets start without shops, people, decorations, or lamps. Crossings and road markings remain. Only explicitly placed purchases furnish private plots, and only purchased neighbors walk and visit placed shops. Click the simple person icon to highlight available streets, then click a highlighted road; dragging the person onto a road also chooses your starting point. During decoration placement, the City view and Street view controls preserve the pending item, exact coordinates, rotation, and purchase request. Street view starts on a clear road beside the item; City view centers its editor on that position. Moving or looking resumes carrying from the preserved position. Switching or cancelling spends no bricks.

Daily rewards use a composite unique key and atomic D1 batches. Spending uses conditional SQL updates. Plot coordinates and identity are unique, and invitation signup runs as an atomic batch that rejects invalid links and records each distinct new resident. Links are permanent and reusable; plot selection checks availability again when confirmed. Changes require same-origin requests and authenticated sessions. Residents can create invitations without a daily limit. Invitations from the last seven days appear with usage counts; expired links cannot be copied from the menu.

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

The server returns the next 48 available slots in allocation order, using occupancy independent of the render limit and excluding public zones. Each candidate already has its plot and access-road plan. There is no separately curated remote preview block or connection repair after placement. Dev mode shows level-one shack outlines, entrance arrows, and the same planned approach roads that construction will activate. Individual candidates predict density independently; simultaneous joins can take a previewed slot before redemption. Ground gardens are cleared when a real building occupies the plot.

### GitHub contribution calendar

The tower sidebar uses a cached, real GitHub contribution calendar for the past year, with scrollable weekly columns, intensity colors, and daily hover details. The calendar includes all GitHub contribution types; XP still uses only newly credited commits. Manual and scheduled sync refresh both the calendar and commit count. Demo residents do not show fabricated graphs. Migration `0010_github_calendar.sql` stores calendars separately from neighborhood snapshots.

Calendar layout adapted from [Kian Kasad’s website](https://github.com/kdkasad/website), copyright 2025 Kian Kasad, under the BSD-2-Clause-Patent license. The full license is distributed in `public/licenses/kasad-website.txt`.

### Shared neighborhood reads

The client reads public towers/projects from `/api/neighborhood` and personal balances, likes, unlocks and placement state from `/api/self`. A shared Durable Object caches neighborhood snapshots in eight-plot buckets for up to 30 seconds, coalesces simultaneous cache misses, and invalidates on tower/project mutations. Public cached buildings always have `bricks: null`. One hibernating WebSocket per browser subscribes to its current view; the server sends private tower balances only to the authenticated owner. Normal events patch individual entities; full catch-up reads occur on reconnection or explicit placement changes. The legacy bootstrap endpoint remains compatible with older clients.


### Rendering and scaling

`CityAssets` caches streets by spatial chunk, buildings independently, decorations individually, and public sites independently. Balances, likes, XP counters, avatars, unchanged snapshots, and camera pans preserve existing geometry. A decoration move replaces only its asset. Layout changes also refresh affected road/lot geometry. Queued changes coalesce, and construction yields between assets at a 5 ms desktop / 3 ms mobile target rather than rebuilding a whole city in one task. A single complex asset can exceed that target. Replaced or evicted assets release their geometry, textures, and owned materials. The existing neighborhood API bounds snapshots to 250 residents; this is a bounded neighborhood renderer, not a claim of unlimited simultaneous residents.

The lazy scene bundle loads the Three.js engine and its addons as separate reusable vendor chunks, so routine scene changes do not replace the entire renderer download.

Surface colors are baked into vertex attributes so meshes can share materials while keeping ownership, item picking, emissive lighting, textures, and cast/receive-shadow boundaries. Temporary box geometry is reused during assembly. Static world matrices remain fixed. Nearby spatial queries limit first-person collision and reticle raycasts. Placement reuses validated layout geometry and avoids recalculation when the camera and draft stay still.

Purchased neighbors share geometry/materials, retain at most 96 nearby models, and build newly needed models in small batches. Their path searches run on a dedicated worker with one outstanding request; stale results are discarded when the layout changes. Route and grid caches are bounded. Resting neighborhoods sleep until input, a pending job, a route reply, or the next simulation wakeup; hidden tabs stop rendering. Only sunlight needs shadow maps; streetlight illumination uses bounded spatial shader lookups. Snapshot requests follow the server's eight-plot cache cells.

Run `npm run check:rendering` for cache reuse, one-item edits, queued-work coalescing, triangle/ownership equivalence, material color fidelity, eviction, spatial queries, forest reuse, camera-independent illumination, legal dense fixtures, and nearby placement starts. `check:lighting`, `check:neighbors`, and `check:street` cover persistent distant lighting, worker-compatible navigation, collision, and placement transfer. Browser checks exercise desktop/mobile placement round trips, real worker-driven walks, persistent illumination while panning, and cancellation without purchases.

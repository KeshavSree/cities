# C.I.T.I.E.S implementation plan

## Goal
Build an invitation-only 3D city: each person has a plot near their inviter and a tower that grows from provider-verified activity and daily participation. First delivery is a working local build, pushed to a new GitHub repository named `cities`.

## Architecture
- React + Vite for the interface; Three.js renders procedural, solid-color low-poly buildings in the browser.
- Cloudflare Worker owns authentication, invitations, rewards, resource spending, and plot placement.
- D1 stores users, sessions, buildings, provider metrics, invitations, and daily claims.
- A SQLite-backed Durable Object distributes neighborhood changes over hibernating WebSockets. Reconnects reload a database snapshot.
- Wrangler runs the backend locally. Vite proxies `/api` to it during development; the production Worker serves Vite's static build.

## Delivery sequence
1. Scaffold the project, D1 migration, local configuration, and setup instructions.
2. Implement persistent game actions with server-owned balances and unique constraints for daily claims, invite redemption, and plot coordinates.
3. Build the city scene and responsive controls: select, search, zoom, focus, inspect, customize, upgrade, invite, and daily reward.
4. Add GitHub OAuth, provider-fetched activity, and scheduled refresh. Demo access exists only when the server has `DEV_MODE=true`.
5. Produce the local build, review the running interface, and document remaining external setup.
6. Commit and push to a new private `KeshavSree/cities` repository.

## Game rules for the first version
- Each additional floor costs more resources; no maximum level.
- Daily claim awards resources once per UTC calendar day.
- GitHub's authenticated contribution API supplies commit, pull request, and review counts. Reward already-credited activity only once. These counts verify provider data, not the quality or uniqueness of a person's work.
- Invitation tokens are single-use. The server searches for a free plot around the inviter and retries coordinate collisions.
- Styles and facade colors cost resources. All balances and costs are enforced by the Worker.
- Demo residents and demo activity are visibly labeled, cannot be mistaken for verified achievements, and cannot be enabled through a production browser request.

## Scope boundaries
- Website ownership verification, school email verification, and LinkedIn connection come later. LinkedIn profile claims are not automatically verified achievements.
- Use scheduled batches and only refresh stale activity; do not fetch GitHub or write the database during animation frames.
- Render tower detail at bounded complexity even when logical level grows without a cap.
- Cloudflare hosting can start at $0 within free quotas. Paid Workers starts at $5/month. Production credentials, provisioning, and performance measurement remain external setup.

## Design
City-first layout with quiet white controls, pale blue sky, green terrain, violet interactive accents, warm geometric towers, and a restrained sans-serif typeface. Every mesh face has a single material color. No uploaded tower textures. Responsive inspector and visible keyboard controls.

## Delivery status
- Implemented the local city, Worker API, D1 migration, GitHub OAuth with PKCE, encrypted provider tokens, progression, invitations, and neighborhood WebSockets.
- Production frontend build and TypeScript compilation succeed. The Three.js scene is loaded separately from the interface.
- Reviewed upgrades, architecture changes, daily claim, invitation creation and redemption, and a live architectural update across two browser tabs.
- GitHub OAuth remains credential-gated and has not been exercised with a real provider account. Cloudflare production resources have not been provisioned.
- Deployment and local setup instructions are in README.md.

## Continuous world update
- Replace the visible island/board edge with a finite render window projected from the camera and recycled during pan and zoom.
- Extend a fixed curved coast using globally anchored line segments. The coastline does not shift when the render window changes.
- Continue the subtle plot grid over empty land; generate streets only around occupied plots.
- Share coastline math with server plot allocation so new residents cannot be placed on the beach or in the ocean.
- Reviewed the widest zoom and panning into empty land. Increased camera distance to keep the near plane from clipping the foreground. Vegetation stays tied to inhabited areas rather than moving with the terrain window.

## Camera and local time update
- Allow an orbit down to roughly 2.6 degrees above the ground; adapt the orthographic camera distance to preserve foreground coverage.
- Render terrain with long strips so low angles do not allocate a full filled tile grid.
- Follow the viewer's actual local clock with gradual dawn/dusk lighting and automatic refresh. Remove the manual lighting toggle.
- Remove named districts and the header location selector; the city is continuous. Internal WebSocket routing remains an implementation detail.

## Drawer and settlement update
- Remove the top-left introduction overlay. Tower details now fill the right edge and slide with a draggable handle on desktop and mobile.
- Use stable irregular plot positions, straight streets meeting at varied corner angles, and separate polygonal ground pads around rectangular, road-aligned towers; remove the regular terrain grid overlay.
- Let nearby occupied plots drive an urban → suburban → rural transition in paving, streets, lighting, gardens, and woodland, with matching minimap rendering.
- Show actual inviter relationships without creating synthetic social links.

## Keyboard camera movement
- Add continuous WASD movement relative to the camera, Q/E rotation, Space up, and Shift down.
- Keep motion independent of frame rate, cancel automatic tower focus on manual movement, and refresh the loaded region while navigating.
- Preserve typing and button shortcuts, release held keys on focus loss, and keep the terrain and shadows aligned with the viewed ground at changing heights.

## Ground, roads, graph density, and selection
- Clip independent lot polygons to actual road shoulders; choose ground and foundation treatments from terrain, coast distance, settlement score, tower footprint, style, level, and color.
- Share street geometry between the 3D view and minimap. Taper widths and blend solid-color road sections into shared junction surfaces.
- Use an 80% spatial occupancy / 20% local invitation-degree score. Rural <0.25, suburban 0.25–<0.72, urban ≥0.72. Read total invitation degrees from the server and update both endpoints on arrivals.
- Highlight selected building silhouettes in white with a selection outline render pass.

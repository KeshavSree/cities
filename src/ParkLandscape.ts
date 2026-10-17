import * as THREE from 'three';
import { streetLamp } from './StreetLighting';
import type { GroundPoint } from './neighborhood';

type Box = (parent: THREE.Group, x: number, y: number, z: number, width: number, height: number, depth: number, color: string) => THREE.Mesh;
type Material = (color: string) => THREE.Material;

/** A stable park plan fitted to the road-defined parcel, with construction milestones. */
export function buildParkLandscape(site: THREE.Group, boundary: GroundPoint[], entrance: GroundPoint, funded: number, night: boolean, box: Box, material: Material, simplified = false) {
  const inside = (point: GroundPoint) => {
    let result = false;
    for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
      const a = boundary[i], b = boundary[j];
      if ((a.z > point.z) !== (b.z > point.z) && point.x < (b.x - a.x) * (point.z - a.z) / (b.z - a.z) + a.x) result = !result;
    }
    return result;
  };
  const distanceToSegment = (p: GroundPoint, a: GroundPoint, b: GroundPoint) => {
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
  };
  const clearance = (p: GroundPoint) => inside(p) ? Math.min(...boundary.map((a, i) => distanceToSegment(p, a, boundary[(i + 1) % boundary.length]))) : 0;
  const minX = Math.min(...boundary.map(p => p.x)), maxX = Math.max(...boundary.map(p => p.x));
  const minZ = Math.min(...boundary.map(p => p.z)), maxZ = Math.max(...boundary.map(p => p.z));
  const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  const candidates: GroundPoint[] = [];
  let seed = 0;
  for (let z = minZ + .7; z < maxZ; z += 1.25) for (let x = minX + .7; x < maxX; x += 1.25) {
    const p = { x: x + (hash(seed++) - .5) * .65, z: z + (hash(seed++) - .5) * .65 };
    if (clearance(p) > .45) candidates.push(p);
  }
  if (!candidates.length) return;
  // Find a roomy courtyard inside the parcel rather than assuming its origin is usable.
  const anchor = candidates.reduce((best, p) => clearance(p) > clearance(best) ? p : best);
  const radius = Math.min(3.5, clearance(anchor) - .5);
  const heading = Math.atan2(entrance.z - anchor.z, entrance.x - anchor.x);
  const loop = Array.from({ length: 8 }, (_, i) => ({ x: anchor.x + Math.cos(heading + i * Math.PI / 4) * radius, z: anchor.z + Math.sin(heading + i * Math.PI / 4) * radius }));
  const paths: [GroundPoint, GroundPoint][] = [[entrance, loop[0]], [loop[0], anchor]];
  for (let i = 0; i < loop.length; i++) paths.push([loop[i], loop[(i + 1) % loop.length]]);
  const disc = (p: GroundPoint, size: number, height: number, color: string, sides = 12) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(size, size, .045, sides), material(color));
    mesh.position.set(p.x, height, p.z); mesh.receiveShadow = true; site.add(mesh); return mesh;
  };
  for (const [a, b] of paths) {
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    // Sample the access path as well, so a concave boundary never gets paved over.
    const steps = Math.max(1, Math.ceil(length / .3));
    for (let i = 0; i < steps; i++) {
      const t = (i + .5) / steps, p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      if (!inside(p)) continue;
      const strip = box(site, p.x, .12, p.z, length / steps + .015, .045, .7, '#dfd4bd');
      strip.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    }
  }
  disc(anchor, Math.min(1.9, radius * .65), .135, '#d3ccb9');
  const nearPath = (p: GroundPoint, margin: number) => paths.some(([a, b]) => distanceToSegment(p, a, b) < margin + .35);
  const occupied: { point: GroundPoint; radius: number }[] = [{ point: anchor, radius: 1.9 }];
  const available = (p: GroundPoint, r: number) => clearance(p) > r && !nearPath(p, r) && occupied.every(other => Math.hypot(p.x - other.point.x, p.z - other.point.z) > r + other.radius);
  // Reserve distinct garden rooms before planting; funding never rerolls the layout.
  const rooms: GroundPoint[] = [];
  for (const p of [...candidates].sort((a, b) => clearance(b) - clearance(a))) {
    if (!available(p, 1.2)) continue;
    rooms.push(p); occupied.push({ point: p, radius: 1.25 });
    if (rooms.length === 3) break;
  }
  const canopy = (p: GroundPoint, scale: number, index: number) => {
    box(site, p.x, .65 * scale, p.z, .18 * scale, 1.15 * scale, .18 * scale, '#947454');
    for (const [dx, y, dz, size] of [[0, 1.65, 0, .8], [.32, 1.4, .1, .55], [-.25, 1.5, -.15, .55]]) {
      const geometry=simplified?new THREE.SphereGeometry(size*scale,8,6):new THREE.IcosahedronGeometry(size*scale,0);
      const leaf = new THREE.Mesh(geometry, material(['#719655', '#88a66d', '#5f824e'][index % 3]));
      leaf.position.set(p.x + dx * scale, y * scale, p.z + dz * scale); leaf.scale.y = 1.12; leaf.castShadow = true; site.add(leaf);
    }
    disc(p, .45 * scale, .115, '#8c9d69', 8);
  };
  let trees = 0;
  // Mature perimeter groves are present from the start, with more planting at 25%.
  for (const p of candidates) {
    const scale = .72 + hash(trees + 60) * .5, r = scale * .9;
    if (!available(p, r)) continue;
    occupied.push({ point: p, radius: r });
    canopy(p, scale, trees++);
    if (trees >= (funded >= .25 ? 18 : 12)) break;
  }
  let shrubs = 0;
  for (const p of [...candidates].reverse()) {
    if (!available(p, .45)) continue;
    disc(p, .42, .12, '#99ad7e', 8);
    const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(.36, 0), material(shrubs % 2 ? '#8ba764' : '#a1b578'));
    shrub.position.set(p.x, .35, p.z); shrub.scale.y = .65; site.add(shrub);
    occupied.push({ point: p, radius: .4 });
    if (++shrubs >= 20) break;
  }
  const gardenBed = (p: GroundPoint, index: number) => {
    box(site, p.x, .2, p.z, 1.8, .22, 1.45, '#af9470');
    box(site, p.x, .325, p.z, 1.62, .045, 1.27, '#6e7951');
    for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
      const x = p.x - .58 + col * .38, z = p.z - .4 + row * .4;
      box(site, x, .43, z, .22, .18, .22, '#729553');
      box(site, x, .54, z, .12, .06, .12, ['#d9b37c', '#ce958c', '#c7b2d6'][index % 3]);
    }
  };
  if (funded >= .25) for (const [i, p] of rooms.entries()) if (i !== 2 || funded < 1) gardenBed(p, i);
  const bench = (p: GroundPoint, angle: number) => {
    const seat = new THREE.Group(); seat.position.set(p.x, 0, p.z); seat.rotation.y = angle; site.add(seat);
    for (const x of [-.55, .55]) box(seat, x, .27, 0, .09, .3, .44, '#6e7b71');
    for (const z of [-.15, 0, .15]) box(seat, 0, .45, z, 1.5, .08, .11, '#b69a73');
    for (const y of [.65, .8]) box(seat, 0, y, .22, 1.5, .1, .07, '#b69a73');
  };
  if (funded >= .5) {
    // Benches and lights follow the inner edge of the walking loop, facing the lawn.
    for (let i = 1; i < 8; i += 2) {
      const angle = heading + i * Math.PI / 4, r = radius - .8;
      const p = { x: anchor.x + Math.cos(angle) * r, z: anchor.z + Math.sin(angle) * r };
      if (clearance(p) > .85 && radius > 2.5) bench(p, Math.PI / 2 - angle);
      const lamp = { x: anchor.x + Math.cos(angle) * (radius + .45), z: anchor.z + Math.sin(angle) * (radius + .45) };
      if (clearance(lamp) > .3) {
        box(site, lamp.x, .95, lamp.z, .07, 1.7, .07, '#748278');
        box(site, lamp.x, 1.83, lamp.z, .25, .16, .25, night ? '#f3d795' : '#e7dfc7');
        box(site, lamp.x, 1.94, lamp.z, .31, .06, .31, '#748278');
        streetLamp(site,lamp.x,1.72,lamp.z,8,6.5);
      }
    }
    // A picnic table on the courtyard, away from the pavilion's central footprint.
    if (radius > 3) {
      const picnic = new THREE.Group(); picnic.position.set(anchor.x, 0, anchor.z + 1.8); site.add(picnic);
      box(picnic, 0, .68, 0, 1.35, .1, .65, '#b69a73');
      for (const x of [-.4, .4]) box(picnic, x, .4, 0, .1, .5, .6, '#6e7b71');
      for (const z of [-.6, .6]) box(picnic, 0, .4, z, 1.5, .1, .25, '#b69a73');
    }
  }
  if (funded >= .75 && clearance(anchor) > 1.9 && radius > 2.3) {
    // A garden pergola with a slatted roof, rather than four isolated posts.
    for (const x of [-1.1, 1.1]) for (const z of [-1.1, 1.1]) box(site, anchor.x + x, 1.05, anchor.z + z, .13, 1.8, .13, '#a88e68');
    for (const z of [-1.1, 1.1]) box(site, anchor.x, 1.98, anchor.z + z, 2.6, .16, .16, '#a88e68');
    for (let i = 0; i < 7; i++) box(site, anchor.x - 1.2 + i * .4, 2.09, anchor.z, .13, .12, 2.6, '#c0a77f');
    if (funded >= 1) {
      for (const x of [-1.1, 1.1]) {
        box(site, anchor.x + x, 1.3, anchor.z - 1.1, .27, 1.9, .27, '#7c9b68');
        box(site, anchor.x + x * .55, 2.18, anchor.z - .75, 1.1, .12, .9, '#86a36b');
      }
    }
  }
  if (funded >= 1 && rooms[2]) {
    const pond = rooms[2];
    disc(pond, 1.1, .14, '#bec4ac', 10);
    disc(pond, .92, .17, '#83afb4', 10);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * .4, p = { x: pond.x + Math.cos(angle) * 1.02, z: pond.z + Math.sin(angle) * 1.02 };
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(.2, 0), material('#a7ad99'));
      rock.position.set(p.x, .25, p.z); rock.scale.y = .65; site.add(rock);
    }
    disc({ x: pond.x + .24, z: pond.z + .28 }, .18, .2, '#759568', 6);
  }
}

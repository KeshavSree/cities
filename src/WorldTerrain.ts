import * as THREE from 'three';
import { coastZ, PLOT_SPACING } from '../shared/world';

const CHUNK_SIZE = PLOT_SPACING * 8;
const BEACH_WIDTH = 2.2;
type Point = { x: number; z: number };

/** A finite render window around the camera; its procedural coordinates never move. */
export class WorldTerrain {
  readonly group = new THREE.Group();
  private windowKey = '';
  private ray = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  update(camera: THREE.OrthographicCamera, night: boolean) {
    camera.updateMatrixWorld();
    let index = 0;
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      this.pointer.set(x, y);
      this.ray.setFromCamera(this.pointer, camera);
      const { origin, direction } = this.ray.ray;
      // Project the viewing lines onto the ground plane, including rays beyond its near plane.
      this.corners[index++].copy(direction).multiplyScalar(-origin.y / direction.y).add(origin);
    }
    // Keep two extra chunks around the visible ground, then recycle as the camera moves.
    const minX = Math.floor(Math.min(...this.corners.map(p => p.x)) / CHUNK_SIZE) * CHUNK_SIZE - CHUNK_SIZE * 2;
    const maxX = Math.ceil(Math.max(...this.corners.map(p => p.x)) / CHUNK_SIZE) * CHUNK_SIZE + CHUNK_SIZE * 2;
    const minZ = Math.floor(Math.min(...this.corners.map(p => p.z)) / CHUNK_SIZE) * CHUNK_SIZE - CHUNK_SIZE * 2;
    const maxZ = Math.ceil(Math.max(...this.corners.map(p => p.z)) / CHUNK_SIZE) * CHUNK_SIZE + CHUNK_SIZE * 2;
    const key = `${minX},${maxX},${minZ},${maxZ},${night}`;
    if (key === this.windowKey) return;
    this.windowKey = key;
    this.disposeMeshes();
    this.generate(minX, maxX, minZ, maxZ, night);
  }

  dispose() { this.disposeMeshes(); }

  private disposeMeshes() {
    this.group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    this.group.clear();
  }

  private generate(minX: number, maxX: number, minZ: number, maxZ: number, night: boolean) {
    const positions: number[] = [], colors: number[] = [], grid: number[] = [];
    const beach: number[] = [], shallow: number[] = [];
    const grass = new THREE.Color(night ? '#637e6c' : '#bfd2ae');
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      new THREE.MeshStandardMaterial({ color: night ? '#598597' : '#a8ced8', roughness: 1, flatShading: true }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set((minX + maxX) / 2, -0.16, (minZ + maxZ) / 2);
    ocean.receiveShadow = true;
    this.group.add(ocean);

    for (let x = minX; x < maxX; x += PLOT_SPACING) {
      const right = x + PLOT_SPACING;
      const coastLeft = coastZ(x), coastRight = coastZ(right);
      for (let z = minZ; z < maxZ; z += PLOT_SPACING) {
        const polygon = clipToCoast([
          { x, z }, { x: right, z },
          { x: right, z: z + PLOT_SPACING }, { x, z: z + PLOT_SPACING },
        ], x, right, coastLeft - BEACH_WIDTH, coastRight - BEACH_WIDTH);
        if (polygon.length < 3) continue;
        // One flat color for every face; variation stays fixed at its world grid location.
        const cellColor = grass.clone().multiplyScalar(0.985 + hash(x / PLOT_SPACING, z / PLOT_SPACING) * 0.03);
        appendPolygon(positions, polygon, 0);
        for (let i = 1; i < polygon.length - 1; i++) for (let v = 0; v < 3; v++) colors.push(cellColor.r, cellColor.g, cellColor.b);
        for (let i = 0; i < polygon.length; i++) {
          const a = polygon[i], b = polygon[(i + 1) % polygon.length];
          grid.push(a.x, 0.009, a.z, b.x, 0.009, b.z);
        }
      }
      if (Math.max(coastLeft, coastRight) < minZ - 9 || Math.min(coastLeft, coastRight) > maxZ + BEACH_WIDTH) continue;
      appendPolygon(beach, [
        { x, z: coastLeft - BEACH_WIDTH }, { x: right, z: coastRight - BEACH_WIDTH },
        { x: right, z: coastRight + 0.4 }, { x, z: coastLeft + 0.4 },
      ], -0.015);
      appendPolygon(shallow, [
        { x, z: coastLeft + 0.4 }, { x: right, z: coastRight + 0.4 },
        { x: right, z: coastRight + 5 }, { x, z: coastLeft + 5 },
      ], -0.14);
    }

    const grassGeometry = geometry(positions);
    grassGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const ground = new THREE.Mesh(grassGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, side: THREE.DoubleSide }));
    ground.receiveShadow = true;
    this.group.add(ground);
    const lines = new THREE.BufferGeometry();
    lines.setAttribute('position', new THREE.Float32BufferAttribute(grid, 3));
    this.group.add(new THREE.LineSegments(lines, new THREE.LineBasicMaterial({ color: night ? '#8aa18e' : '#99b38c', transparent: true, opacity: night ? 0.13 : 0.17, depthWrite: false })));
    const sand = new THREE.Mesh(geometry(beach), new THREE.MeshStandardMaterial({ color: night ? '#a6a08c' : '#e4d5b2', roughness: 1, side: THREE.DoubleSide }));
    sand.receiveShadow = true;
    this.group.add(sand);
    this.group.add(new THREE.Mesh(geometry(shallow), new THREE.MeshStandardMaterial({ color: night ? '#719b9f' : '#bddad7', roughness: 1, side: THREE.DoubleSide })));
  }
}

function hash(x: number, z: number) {
  const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function geometry(positions: number[]) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.computeVertexNormals();
  return result;
}

function appendPolygon(positions: number[], polygon: Point[], height: number) {
  for (let i = 1; i < polygon.length - 1; i++) {
    for (const point of [polygon[0], polygon[i + 1], polygon[i]]) positions.push(point.x, height, point.z);
  }
}

/** Clip a tile against the same line segment used by the shared coast function. */
function clipToCoast(polygon: Point[], left: number, right: number, shoreLeft: number, shoreRight: number) {
  const distance = (p: Point) => p.z - (shoreLeft + (shoreRight - shoreLeft) * (p.x - left) / (right - left));
  const clipped: Point[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    const da = distance(a), db = distance(b);
    if (da <= 0) clipped.push(a);
    if ((da <= 0) !== (db <= 0)) {
      const t = da / (da - db);
      clipped.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  return clipped;
}

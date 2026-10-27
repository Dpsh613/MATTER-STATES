import type { MaterialId } from './physics';

export type SiteKind = 'corner' | 'face' | 'body' | 'anion' | 'cation' | 'interstitial';
export interface Site { x: number; y: number; z: number; kind: SiteKind; }
export interface SpinDirection { x: number; y: number; z: number; }

const TETRAHEDRAL_OFFSETS: [number, number, number][] = [
  [-0.25, -0.25, -0.25], [-0.25, -0.25, 0.25], [-0.25, 0.25, -0.25], [-0.25, 0.25, 0.25],
  [0.25, -0.25, -0.25], [0.25, -0.25, 0.25], [0.25, 0.25, -0.25], [0.25, 0.25, 0.25],
];
const INTERSTITIAL_CELLS: [number, number, number][] = [
  [0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/**
 * Conventional-cell coordinates for the cubic structures used in the app.
 * Cell centres sit on integer coordinates and the cell spans -a/2..a/2.
 */
export function latticeSites(material: MaterialId, unit: boolean): Site[] {
  const sites = new Map<string, Site>();
  const add = (x: number, y: number, z: number, kind: SiteKind) => {
    sites.set(`${Math.round(x * 2)},${Math.round(y * 2)},${Math.round(z * 2)}`, { x, y, z, kind });
  };

  if (material === 'salt' && !unit) {
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) {
      add(x / 2, y / 2, z / 2, Math.abs(x + y + z) % 2 ? 'anion' : 'cation');
    }
  } else if (material === 'salt') {
    for (let x = 0; x <= 2; x++) for (let y = 0; y <= 2; y++) for (let z = 0; z <= 2; z++) {
      add(x / 2 - 0.5, y / 2 - 0.5, z / 2 - 0.5, (x + y + z) % 2 ? 'anion' : 'cation');
    }
  } else {
    const min = unit ? 0 : -1, max = unit ? 0 : 1;
    for (let x = min; x <= max; x++) for (let y = min; y <= max; y++) for (let z = min; z <= max; z++) {
      for (const a of [-0.5, 0.5]) for (const b of [-0.5, 0.5]) for (const c of [-0.5, 0.5]) add(x + a, y + b, z + c, 'corner');
      if (material === 'iron') {
        add(x, y, z, 'body');
      } else {
        // FCC face centres, one per cube face. Edge midpoints are not lattice points.
        add(x + 0.5, y, z, 'face');
        add(x - 0.5, y, z, 'face');
        add(x, y + 0.5, z, 'face');
        add(x, y - 0.5, z, 'face');
        add(x, y, z + 0.5, 'face');
        add(x, y, z - 0.5, 'face');
      }
    }
  }
  return [...sites.values()];
}

/**
 * Interstitial positions are illustrative. In the conventional cell all seven
 * examples sit at tetrahedral offsets inside the drawn box; the lattice view
 * repeats those offsets in nearby cells so the added atoms stay in the sample.
 */
export function interstitialSites(unit: boolean, count: number): Site[] {
  const cells = unit ? [[0, 0, 0] as [number, number, number]] : INTERSTITIAL_CELLS;
  return Array.from({ length: Math.min(Math.max(count, 0), 7) }, (_, index) => {
    const cell = cells[index % cells.length];
    const offset = TETRAHEDRAL_OFFSETS[index % TETRAHEDRAL_OFFSETS.length];
    return {
      x: cell[0] + offset[0],
      y: cell[1] + offset[1],
      z: cell[2] + offset[2],
      kind: 'interstitial' as const,
    };
  });
}

export function bondOffsets(material: MaterialId): [number, number, number][] {
  if (material === 'iron') return [[0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, -0.5]];
  if (material === 'salt') return [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]];
  return [[0.5, 0.5, 0], [0.5, -0.5, 0], [0.5, 0, 0.5], [0.5, 0, -0.5], [0, 0.5, 0.5], [0, 0.5, -0.5]];
}

export function bondPairs(material: MaterialId, sites: Site[]): [number, number][] {
  const byPosition = new Map(sites.map((site, index) => [`${Math.round(site.x * 2)},${Math.round(site.y * 2)},${Math.round(site.z * 2)}`, index]));
  const pairs = new Map<string, [number, number]>();
  sites.forEach((site, index) => {
    for (const [dx, dy, dz] of bondOffsets(material)) {
      const target = byPosition.get(`${Math.round((site.x + dx) * 2)},${Math.round((site.y + dy) * 2)},${Math.round((site.z + dz) * 2)}`);
      if (target !== undefined && target !== index) {
        const pair: [number, number] = index < target ? [index, target] : [target, index];
        pairs.set(`${pair[0]}:${pair[1]}`, pair);
      }
    }
  });
  return [...pairs.values()];
}

export function nearestNeighbourDistance(material: MaterialId, latticeParameter: number) {
  if (material === 'iron') return latticeParameter * Math.sqrt(3) / 2;
  if (material === 'salt') return latticeParameter / 2;
  return latticeParameter / Math.SQRT2;
}

export function bulkCoordination(material: MaterialId) {
  return material === 'iron' ? 8 : material === 'salt' ? 6 : 12;
}

const scatter = (index: number) => {
  const value = Math.sin((index + 1) * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

/**
 * Mean-field moment directions with an exactly matching vertical projection.
 * Most moments sit in balanced up/down populations; one moment trims the
 * finite-sample sum so the average vertical component equals the displayed m.
 */
export function spinDirections(magnetization: number, count: number): SpinDirection[] {
  if (count <= 0) return [];
  const m = Math.min(1, Math.max(0, magnetization));
  const maxBase = count - 1;
  const minimumCone = count > 1 ? Math.max(0, (count * m - 1) / (count - 1)) : 1;
  const vertical = Math.min(1, Math.max(0.9, minimumCone));
  const targetBase = (count * m) / vertical;
  let base = Math.max(-maxBase, Math.min(maxBase, Math.round(targetBase)));
  if ((base & 1) !== (maxBase & 1)) base += targetBase >= base ? 1 : -1;
  base = Math.max(-maxBase, Math.min(maxBase, base));

  const trim = Math.max(-1, Math.min(1, count * m - vertical * base));
  const upCount = (maxBase + base) / 2;
  const order = Array.from({ length: count }, (_, index) => index).sort((a, b) => scatter(a) - scatter(b));
  const up = new Set(order.slice(0, upCount));
  const down = new Set(order.slice(upCount, maxBase));
  const directions: SpinDirection[] = [];

  for (let index = 0; index < count; index++) {
    const y = up.has(index) ? vertical : down.has(index) ? -vertical : trim;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const phi = index * 2.399963 + 0.37;
    directions.push({ x: radius * Math.cos(phi), y, z: radius * Math.sin(phi) });
  }
  return directions;
}

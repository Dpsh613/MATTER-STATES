import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { chapters, criticalField, magnetization, type ChapterId, type DefectType, type MaterialId } from './physics';

export type SceneHandle = { zoom: (factor: number) => void; reset: () => void; inspect: () => void; clearSelection: () => void };
export type AtomSelection = { symbol: string; kind: string; position: string; explanation: string };
interface Props {
  chapter: ChapterId; material: MaterialId; scale: 'lattice' | 'cell'; spacing: number;
  autoRotate: boolean; defectType: DefectType; defectCount: number; temperature: number;
  field: number; tau: number; scTemperature: number; scField: number;
  onSelect: (selection: AtomSelection | null) => void; onReady: () => void;
}
interface Site { x: number; y: number; z: number; kind: 'corner' | 'face' | 'body' | 'anion' | 'cation'; }
interface Model { root: THREE.Group; update: (time: number, dt: number, live: Props) => void; targets: THREE.InstancedMesh[]; sites: Site[]; }
interface Engine {
  scene: THREE.Scene; renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera;
  controls: OrbitControls; composer: EffectComposer; model: Model | null; desired: THREE.Vector3 | null;
  focus: THREE.Vector3; initialPosition: THREE.Vector3; needsRender: boolean; inspect?: () => void;
}

function latticeSites(material: MaterialId, unit: boolean): Site[] {
  const sites = new Map<string, Site>();
  const add = (x: number, y: number, z: number, kind: Site['kind']) => {
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
      if (material === 'iron') add(x, y, z, 'body');
      else {
        add(x, y + 0.5, z + 0.5, 'face');
        add(x, y - 0.5, z + 0.5, 'face');
        add(x + 0.5, y, z + 0.5, 'face');
        add(x - 0.5, y, z + 0.5, 'face');
        add(x + 0.5, y + 0.5, z, 'face');
        add(x + 0.5, y - 0.5, z, 'face');
      }
    }
  }
  return [...sites.values()];
}

function makeModel(props: Props): Model {
  const { chapter, material, scale, spacing, defectType, defectCount, temperature, scTemperature, scField } = props;
  const root = new THREE.Group();
  const structure = chapter === 3 ? 'iron' : chapter === 5 || chapter === 2 ? 'copper' : material;
  const actual = latticeSites(structure, scale === 'cell');
  const isMagnetic = chapter === 3, isConductive = chapter === 2, isSuper = chapter === 5, isDefect = chapter === 4;
  const sites = actual.map(p => ({ ...p }));
  const accent = chapters[chapter].theme;
  const baseColor = new THREE.Color(structure === 'iron' ? '#aabec3' : structure === 'salt' ? '#b1c1b1' : '#a6c4ac');
  const atomGeometry = new THREE.SphereGeometry(isMagnetic ? 0.065 : scale === 'cell' ? 0.135 : 0.105, 24, 16);
  const atomMaterial = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: isMagnetic ? 0.45 : 0.58, roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.15,
    emissive: '#234633', emissiveIntensity: 0.19, envMapIntensity: 0.85,
    transparent: isConductive, opacity: isConductive ? 0.25 : 1,
  });
  const atoms = new THREE.InstancedMesh(atomGeometry, atomMaterial, sites.length);
  atoms.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const bondsMaterial = new THREE.MeshStandardMaterial({ color: '#4e8060', metalness: 0.35, roughness: 0.55, transparent: true, opacity: isConductive ? 0.12 : 0.58 });
  const bondGeometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 5);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const bonds: [THREE.Vector3, THREE.Vector3][] = [];
  const byPosition = new Map<string, number>();
  sites.forEach((site, index) => byPosition.set(`${Math.round(site.x * 2)},${Math.round(site.y * 2)},${Math.round(site.z * 2)}`, index));
  const defectSites = isDefect ? [...sites.keys()].sort((a, b) => {
    const aP = sites[a], bP = sites[b];
    return (aP.x * aP.x + aP.y * aP.y + aP.z * aP.z) - (bP.x * bP.x + bP.y * bP.y + bP.z * bP.z);
  }).filter((_, i) => i < defectCount) : [];
  const interstitials: THREE.Vector3[] = [];
  if (isDefect && defectType === 'interstitial') {
    const centers = structure === 'copper' ? [[0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 0, -1]] : [[0.25, 0.25, 0.25], [-0.25, 0.25, 0.25], [0.25, -0.25, 0.25], [0.25, 0.25, -0.25], [-0.25, -0.25, 0.25], [-0.25, 0.25, -0.25], [0.25, -0.25, -0.25]];
    for (let i = 0; i < defectCount; i++) interstitials.push(new THREE.Vector3(...centers[i % centers.length] as [number, number, number]));
  }
  const isVacant = (index: number) => isDefect && defectType === 'vacancy' && defectSites.includes(index);
  sites.forEach((site, index) => {
    const p = new THREE.Vector3(site.x, site.y, site.z);
    if (isVacant(index)) {
      matrix.makeScale(0.001, 0.001, 0.001);
      matrix.setPosition(p);
    } else {
      const neighbor = defectSites.some(d => Math.abs(sites[d].x - site.x) + Math.abs(sites[d].y - site.y) + Math.abs(sites[d].z - site.z) === 0.5 || (Math.abs(sites[d].x - site.x) + Math.abs(sites[d].y - site.y) + Math.abs(sites[d].z - site.z) < 1.2));
      if (isDefect && neighbor && defectType === 'vacancy') p.multiplyScalar(0.97);
      if (isDefect && defectType === 'interstitial' && interstitials.some(v => v.distanceTo(p) < 0.72)) p.multiplyScalar(1.025);
      matrix.makeScale(1, 1, 1).setPosition(p);
    }
    atoms.setMatrixAt(index, matrix);
    const shade = 0.7 + ((index * 13 % 19) / 19) * 0.3;
    let color = baseColor.clone().multiplyScalar(shade);
    if (structure === 'salt') color = site.kind === 'anion' ? new THREE.Color('#e3dfc4') : new THREE.Color('#84b99c');
    if (isSuper) color = new THREE.Color('#96c6c3').multiplyScalar(shade);
    atoms.setColorAt(index, color);
    const offsets = structure === 'iron' ? [[0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, -0.5]] : structure === 'salt' ? [[0.5, 0, 0], [0, 0.5, 0], [0, 0, 0.5]] : [[0.5, 0.5, 0], [0.5, -0.5, 0], [0.5, 0, 0.5], [0.5, 0, -0.5], [0, 0.5, 0.5], [0, 0.5, -0.5]];
    if (!isVacant(index)) for (const offset of offsets) {
      const key = `${Math.round((site.x + offset[0]) * 2)},${Math.round((site.y + offset[1]) * 2)},${Math.round((site.z + offset[2]) * 2)}`;
      const target = byPosition.get(key);
      if (target !== undefined && !isVacant(target)) bonds.push([p, new THREE.Vector3(sites[target].x, sites[target].y, sites[target].z)]);
    }
  });
  atoms.name = 'atoms';
  atoms.userData.sites = sites;
  root.add(atoms);
  const bondMesh = new THREE.InstancedMesh(bondGeometry, bondsMaterial, bonds.length);
  bonds.forEach(([a, b], index) => {
    const direction = b.clone().sub(a);
    matrix.compose(a.clone().add(b).multiplyScalar(0.5), quaternion.setFromUnitVectors(up, direction.clone().normalize()), new THREE.Vector3(1, direction.length(), 1));
    bondMesh.setMatrixAt(index, matrix);
  });
  root.add(bondMesh);
  if (scale === 'cell') {
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.025, 1.025, 1.025)), new THREE.LineDashedMaterial({ color: accent, transparent: true, opacity: 0.6, dashSize: 0.035, gapSize: 0.025 }));
    box.computeLineDistances(); root.add(box);
  }
  const extras: THREE.Object3D[] = [];
  const highlightMaterial = new THREE.MeshBasicMaterial({ color: '#ddc68d', transparent: true, opacity: 0.8, wireframe: true });
  if (isDefect) {
    const gold = new THREE.MeshPhysicalMaterial({ color: '#dfc99c', emissive: '#ac7942', emissiveIntensity: 0.65, metalness: 0.6, roughness: 0.2 });
    interstitials.forEach(p => {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), gold); sphere.position.copy(p); root.add(sphere);
    });
    defectSites.filter(() => defectType === 'vacancy').forEach(index => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.009, 8, 64), highlightMaterial);
      ring.position.set(sites[index].x, sites[index].y, sites[index].z); ring.name = 'vacancy-ring'; extras.push(ring); root.add(ring);
    });
  }
  let electronMesh: THREE.InstancedMesh | undefined;
  let spinCones: THREE.InstancedMesh | undefined;
  let electronTrails: THREE.LineSegments | undefined;
  const electrons: { x: number; y: number; z: number; phase: number; }[] = [];
  if (isMagnetic) {
    const m = magnetization(temperature);
    const arrowMaterial = new THREE.MeshStandardMaterial({ color: '#cdd7bc', emissive: '#477155', emissiveIntensity: 0.3, metalness: 0.5, roughness: 0.3 });
    spinCones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.057, 0.22, 8), arrowMaterial, sites.length);
    const shafts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.20, 6), arrowMaterial, sites.length);
    sites.forEach((site, index) => {
      const seed = Math.sin(index * 912.73 + 6.3) * 43758.5453;
      const r = seed - Math.floor(seed);
      const phi = index * 2.39996;
      const tilt = (1 - m) * Math.PI * 0.85 + r * (m > 0 ? 0.25 : Math.PI * 1.5);
      const sign = r < (m + 1) / 2 ? 1 : -1;
      const direction = new THREE.Vector3(Math.sin(tilt) * Math.cos(phi), Math.cos(tilt) * sign, Math.sin(tilt) * Math.sin(phi)).normalize();
      const q = quaternion.setFromUnitVectors(up, direction);
      const p = new THREE.Vector3(site.x, site.y, site.z);
      const base = new THREE.Vector3(0, 0.065, 0).applyQuaternion(q).add(p);
      matrix.compose(base, q, new THREE.Vector3(1, 1, 1)); shafts.setMatrixAt(index, matrix);
      const tip = new THREE.Vector3(0, 0.24, 0).applyQuaternion(q).add(p);
      matrix.compose(tip, q, new THREE.Vector3(1, 1, 1)); spinCones!.setMatrixAt(index, matrix);
    });
    root.add(spinCones, shafts);
  }
  if (isConductive || isSuper) {
    const electronMaterial = new THREE.MeshBasicMaterial({ color: isSuper ? '#c6eac9' : '#dbe6b1', toneMapped: false });
    electronMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.025, 12, 8), electronMaterial, 32);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(32 * 6), 3));
    electronTrails = new THREE.LineSegments(trailGeo, new THREE.LineBasicMaterial({ color: isSuper ? '#a8d5b6' : '#d8dcb4', transparent: true, opacity: 0.23 }));
    root.add(electronMesh, electronTrails);
    for (let i = 0; i < 32; i++) {
      const r = Math.abs(Math.sin(i * 912.5 + 0.15) * 43758.5453) % 1;
      electrons.push({ x: r * 3.4 - 1.7, y: ((i * 0.618) % 2.1) - 1.05, z: Math.sin(i * 2.399) * 1.1, phase: i * 1.618 });
    }
  }
  const fieldLines = new THREE.Group();
  let superconducting = false;
  if (isSuper) {
    superconducting = scTemperature < 7.19 && scField / 1000 < criticalField(scTemperature);
    const fieldMaterial = new THREE.LineBasicMaterial({ color: '#8db3af', transparent: true, opacity: scField === 0 ? 0 : superconducting ? 0.55 : 0.3 });
    for (let i = -3; i <= 3; i++) {
      const radius = Math.abs(i) * 0.38 + 0.4;
      const sign = i < 0 ? -1 : 1;
      const points = superconducting ? [new THREE.Vector3(i * 0.35, -2.9, 0), new THREE.Vector3(sign * radius, -1.6, 0), new THREE.Vector3(sign * (radius + 0.4), -0.8, 0), new THREE.Vector3(sign * (radius + 0.4), 0.8, 0), new THREE.Vector3(sign * radius, 1.6, 0), new THREE.Vector3(i * 0.35, 2.9, 0)] : [new THREE.Vector3(i * 0.35, -2.9, 0), new THREE.Vector3(i * 0.35, 2.9, 0)];
      const curve = new THREE.CatmullRomCurve3(points);
      fieldLines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(100)), fieldMaterial));
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.10, 6), new THREE.MeshBasicMaterial({ color: '#83b5ae', transparent: true, opacity: scField === 0 ? 0 : 0.7 }));
      arrow.position.set(sign * (radius + 0.4), 1.0, 0); if (!superconducting) arrow.position.set(i * 0.35, 1.5, 0); fieldLines.add(arrow);
    }
    root.add(fieldLines);
    root.scale.setScalar(0.84);
  }
  if (isDefect && scale === 'lattice') root.scale.setScalar(1.02);
  root.scale.multiplyScalar(1 + (spacing - 100) / 100);
  const update = (time: number, dt: number, live: Props) => {
    const { field, tau } = live;
      if (electronMesh) {
      const trailPositions = electronTrails!.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < electrons.length; i++) {
        const e = electrons[i];
        if (isSuper) {
          if (superconducting) {
            const angle = time * 0.25 + electrons[i - i % 2].phase;
            position.set(Math.cos(angle) * 1.55 + (i % 2 ? 0.045 : -0.045), e.y + 0.04 * Math.sin(time + e.phase), Math.sin(angle) * 1.2 + (i % 2 ? 0.045 : -0.045));
          } else position.set(e.x, e.y + Math.sin(time + e.phase) * 0.08, e.z);
        } else {
          e.x -= dt * field / 100 * 0.7 * tau / 25;
          if (e.x < -1.8) e.x = 1.8;
          if (e.x > 1.8) e.x = -1.8;
          position.set(e.x + Math.sin(time * 0.5 + e.phase) * 0.03, e.y + Math.sin(time * 0.7 + e.phase) * 0.035, e.z + Math.cos(time * 0.4 + e.phase) * 0.03);
        }
        matrix.makeScale(1, 1, 1).setPosition(position); electronMesh.setMatrixAt(i, matrix);
        const trail = isSuper ? 0.12 : field / 100 * 0.35;
        trailPositions.setXYZ(i * 2, position.x + trail, position.y, position.z);
        trailPositions.setXYZ(i * 2 + 1, position.x, position.y, position.z);
      }
      electronMesh.instanceMatrix.needsUpdate = true; trailPositions.needsUpdate = true;
    }
  };
  return { root, update, targets: [atoms], sites };
}

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

function FallbackLattice() {
  return <div className="fallback-scene"><svg viewBox="0 0 700 650" role="img" aria-label="Three-dimensional cubic lattice, reduced graphics mode">
    <defs><radialGradient id="atom"><stop offset="0" stopColor="#e3f1ce"/><stop offset="0.28" stopColor="#bdd8ba"/><stop offset="1" stopColor="#3e7256"/></radialGradient></defs>
    {Array.from({ length: 5 }, (_, x) => Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, z) => {
      const X = 340 + (x - 2) * 56 + (y - 2) * 28, Y = 300 + (y - 2) * 20 - (z - 2) * 53 + (x - 2) * 18;
      return <g key={`${x}-${y}-${z}`}><line x1={X} y1={Y} x2={X + 56} y2={Y + 18} stroke="#52785b" strokeWidth="0.7" opacity=".5"/><line x1={X} y1={Y} x2={X + 28} y2={Y + 20} stroke="#52785b" strokeWidth="0.7" opacity=".5"/><circle cx={X} cy={Y} r="6.4" fill="url(#atom)"/></g>;
    })))}</svg><span className="fallback-note">REDUCED GRAPHICS MODE · WebGL unavailable</span></div>;
}

const CrystalScene = forwardRef<SceneHandle, Props>(function CrystalScene(props, ref) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<Engine | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [failed, setFailed] = useState(false);
  const selected = useRef<THREE.Mesh | null>(null);
  const resetCamera = () => {
    const e = engine.current; if (!e) return;
    e.controls.enableDamping = false; e.controls.update();
    e.controls.enableDamping = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    e.desired = e.initialPosition.clone(); e.controls.target.set(0, 0, 0); e.focus.set(0, 0, 0);
  };
  const clearSelection = () => {
    const e = engine.current;
    if (selected.current && e) {
      e.scene.remove(selected.current);
      selected.current.geometry.dispose();
      (selected.current.material as THREE.Material).dispose();
      selected.current = null;
      e.needsRender = true;
    }
    latest.current.onSelect(null);
  };
  useImperativeHandle(ref, () => ({
    zoom: factor => { const e = engine.current; if (!e) return; e.desired = e.camera.position.clone().sub(e.controls.target).multiplyScalar(factor).clampLength(2.2, 17).add(e.controls.target); },
    reset: resetCamera,
    inspect: () => engine.current?.inspect?.(),
    clearSelection,
  }));
  useEffect(() => {
    const host = container.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
    catch { setFailed(true); latest.current.onReady(); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setClearColor('#080d0b', 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D model. Drag to rotate, scroll to zoom. Use the atom inspection button for a keyboard-accessible selection.');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080d0b');
    scene.fog = new THREE.FogExp2('#080d0b', 0.026);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(5.0, 3.45, 5.65);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reduceMotion; controls.dampingFactor = 0.06; controls.enablePan = false;
    controls.minDistance = 2.2; controls.maxDistance = 17; controls.autoRotateSpeed = 0.30;
    controls.minPolarAngle = 0.1; controls.maxPolarAngle = Math.PI - 0.1;
    const focus = new THREE.Vector3(0, 0, 0);
    controls.target.copy(focus);
    const e: Engine = { renderer, camera, scene, controls, composer: null!, model: null, desired: null, focus, initialPosition: camera.position.clone(), needsRender: true };
    engine.current = e;
    scene.add(new THREE.AmbientLight('#c0cfbf', 0.55));
    const keyLight = new THREE.DirectionalLight('#e6f3d5', 2.4); keyLight.position.set(-3, 6, 5); scene.add(keyLight);
    const fill = new THREE.DirectionalLight('#a5dbc1', 0.9); fill.position.set(5, 2, -3); scene.add(fill);
    const rim = new THREE.DirectionalLight('#dceecf', 1.8); rim.position.set(-2, 3, -5); scene.add(rim);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04);
    scene.environment = env.texture; scene.environmentIntensity = 0.55;
    room.dispose(); pmrem.dispose();
    const grid = new THREE.GridHelper(24, 48, '#244132', '#16251d'); grid.position.y = -2.15;
    (grid.material as THREE.LineBasicMaterial).transparent = true; (grid.material as THREE.LineBasicMaterial).opacity = 0.14;
    scene.add(grid);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(800, 600), 0.25, 0.5, 1.1));
    composer.addPass(new OutputPass()); e.composer = composer;
    const onResize = () => {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height; camera.updateProjectionMatrix();
      renderer.setSize(width, height); composer.setSize(width, height); e.needsRender = true;
    };
    const observer = new ResizeObserver(onResize); observer.observe(host); onResize();
    let isVisible = true;
    const visibilityObserver = new IntersectionObserver(entries => { isVisible = entries[0].isIntersecting; if (isVisible) e.needsRender = true; });
    visibilityObserver.observe(host);
    const stopTransition = () => { e.desired = null; };
    controls.addEventListener('start', stopTransition);
    const pointer = new THREE.Vector2();
    let downX = 0, downY = 0;
    const pointerDown = (event: PointerEvent) => { downX = event.clientX; downY = event.clientY; };
    const showAtom = (id: number) => {
      if (!e.model || id < 0 || id >= e.model.sites.length) return;
      const site = e.model.sites[id];
      const mat = latest.current.material;
      const symbol = latest.current.chapter === 2 ? 'Cu' : latest.current.chapter === 3 ? 'Fe' : latest.current.chapter === 5 ? 'Pb' : mat === 'copper' ? 'Cu' : mat === 'iron' ? 'Fe' : site.kind === 'anion' ? 'Cl' : 'Na';
      const kind = latest.current.chapter === 3 ? 'Magnetic moment' : site.kind === 'face' ? 'Face-centered site' : site.kind === 'corner' ? 'Corner site' : site.kind === 'body' ? 'Body-centered site' : site.kind === 'cation' ? 'Sodium ion' : 'Chloride ion';
      latest.current.onSelect({ symbol, kind, position: `(${site.x.toFixed(2)}, ${site.y.toFixed(2)}, ${site.z.toFixed(2)}) a`, explanation: site.kind === 'corner' ? 'Shared by eight adjacent conventional cells; contributes ⅛ of an atom to one cell.' : site.kind === 'face' ? 'Shared by two adjacent cells; contributes ½ of an atom to one cell.' : site.kind === 'body' ? 'Inside the conventional cell; contributes one whole atom.' : 'Alternating ionic sites form the rock-salt structure. Positions use the conventional-cell coordinate system.' });
      if (selected.current) { scene.remove(selected.current); selected.current.geometry.dispose(); (selected.current.material as THREE.Material).dispose(); }
      const selection = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 12), new THREE.MeshBasicMaterial({ color: '#cde5c6', wireframe: true, transparent: true, opacity: 0.45 }));
      e.model.root.updateMatrixWorld(true);
      selection.position.set(site.x, site.y, site.z);
      e.model.root.localToWorld(selection.position);
      selection.name = 'selection'; scene.add(selection); selected.current = selection; e.needsRender = true;
    };
    const isRealSite = (id: number) => {
      const instance = new THREE.Matrix4(); e.model!.targets[0].getMatrixAt(id, instance);
      return instance.elements[0] > 0.01;
    };
    let inspectionIndex = 0;
    e.inspect = () => {
      if (!e.model) return;
      const sites = e.model.sites.map((_, index) => index).filter(isRealSite);
      const id = sites[inspectionIndex % sites.length]; inspectionIndex++;
      if (id !== undefined) showAtom(id);
    };
    const pick = (event: PointerEvent) => {
      if (!e.model || event.button > 0 || Math.hypot(event.clientX - downX, event.clientY - downY) > 5) return;
      const rect = host.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(pointer, camera);
      const intersection = ray.intersectObjects(e.model.targets, false).find(hit => hit.instanceId !== undefined && isRealSite(hit.instanceId));
      if (intersection?.instanceId !== undefined) showAtom(intersection.instanceId);
      else clearSelection();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '-', '='].includes(event.key)) event.preventDefault();
      const offset = camera.position.clone().sub(controls.target);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? 0.12 : -0.12);
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), event.key === 'ArrowUp' ? 0.12 : -0.12);
      if (event.key === '+' || event.key === '=') offset.multiplyScalar(0.9);
      if (event.key === '-') offset.multiplyScalar(1.1);
      camera.position.copy(controls.target).add(offset); e.desired = null;
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pick);
    renderer.domElement.addEventListener('keydown', keyDown);
    let contextLostFlag = false;
    const contextLost = (event: Event) => { event.preventDefault(); contextLostFlag = true; setFailed(true); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    let frame = 0, last = performance.now(), disposed = false;
    const animate = (now: number) => {
      if (disposed || contextLostFlag) return;
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!isVisible || document.hidden) { frame = requestAnimationFrame(animate); return; }
      const transitioning = !!e.desired;
      controls.autoRotate = latest.current.autoRotate && !e.desired;
      if (e.desired) {
        if (reduceMotion) camera.position.copy(e.desired); else camera.position.lerp(e.desired, 1 - Math.exp(-dt * 4));
        if (camera.position.distanceTo(e.desired) < 0.015) e.desired = null;
      }
      const cameraMoved = controls.update();
      e.model?.update(now / 1000, dt, latest.current);
      if (e.model) e.model.root.traverse(object => { if (object.name === 'vacancy-ring') object.quaternion.copy(camera.quaternion); });
      if (e.needsRender || transitioning || cameraMoved || [2, 5].includes(latest.current.chapter)) { composer.render(); e.needsRender = false; }
      frame = requestAnimationFrame(animate);
    };
    e.model = makeModel(latest.current); scene.add(e.model.root);
    frame = requestAnimationFrame(animate);
    latest.current.onReady();
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); visibilityObserver.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown); renderer.domElement.removeEventListener('pointerup', pick); renderer.domElement.removeEventListener('keydown', keyDown); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      if (e.model) disposeGroup(e.model.root);
      if (selected.current) { scene.remove(selected.current); selected.current.geometry.dispose(); (selected.current.material as THREE.Material).dispose(); selected.current = null; }
      grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); env.dispose(); composer.dispose(); renderer.dispose(); renderer.domElement.remove(); engine.current = null;
    };
  }, []);
  useEffect(() => {
    const e = engine.current; if (!e) return;
    if (e.model) { e.scene.remove(e.model.root); disposeGroup(e.model.root); }
    if (selected.current) { e.scene.remove(selected.current); selected.current.geometry.dispose(); (selected.current.material as THREE.Material).dispose(); selected.current = null; }
    e.model = makeModel(props); e.scene.add(e.model.root); e.needsRender = true;
    latest.current.onReady();
    latest.current.onSelect(null);
  }, [props.chapter, props.material, props.scale, props.defectType, props.defectCount, props.temperature, props.scTemperature, props.scField]);
  useEffect(() => {
    const e = engine.current; if (!e) return;
    if (props.scale === 'cell') e.initialPosition.set(2.6, 1.8, 3.0);
    else e.initialPosition.set(5.0, 3.45, 5.65);
    if (props.chapter === 5) e.initialPosition.set(5.9, 3.8, 7.6);
    e.desired = e.initialPosition.clone();
  }, [props.chapter, props.scale]);
  useEffect(() => {
    if (!engine.current?.model) return;
    engine.current.needsRender = true;
    engine.current.model.root.scale.setScalar((props.chapter === 5 ? 0.84 : 1) * (1 + (props.spacing - 100) / 100));
  }, [props.spacing, props.chapter]);
  return <div className={`crystal-canvas ${failed ? 'has-fallback' : ''}`} ref={container}>{failed && <FallbackLattice />}</div>;
});

export default CrystalScene;

/**
 * Optional textured GLB ship models (user-supplied assets in public/models/).
 * Loaded once before the fleet is built; buildShip clones from this registry
 * and falls back to the procedural builders when a model is missing or the
 * preload failed — tests and offline runs never depend on fetches.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const registry = new Map<string, THREE.Group>();

/** Fit a ship model to the fleet convention: hull length along Z (Y stays
 * up), scaled to targetLength, with a modest draft below the waterline. */
function normalize(scene: THREE.Group, targetLength: number): THREE.Group {
  const wrap = new THREE.Group();
  wrap.add(scene);
  let box = new THREE.Box3().setFromObject(wrap);
  let size = box.getSize(new THREE.Vector3());
  if (size.x > size.z) scene.rotation.y = -Math.PI / 2; // length X -> Z, bow -Z
  box = new THREE.Box3().setFromObject(wrap);
  size = box.getSize(new THREE.Vector3());
  const s = targetLength / size.z;
  scene.scale.setScalar(s);
  box = new THREE.Box3().setFromObject(wrap);
  const center = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  scene.position.set(
    scene.position.x - center.x,
    scene.position.y - box.min.y - height * 0.06, // hull draft under water
    scene.position.z - center.z,
  );
  return wrap;
}

export async function preloadShipModels(): Promise<void> {
  const loader = new GLTFLoader();
  const base = import.meta.env.BASE_URL;
  const wanted: [string, string, number][] = [
    ["p:w", `${base}models/pawn_white.glb`, 0.4],
    ["p:b", `${base}models/pawn_black.glb`, 0.4],
    ["b:w", `${base}models/bishop_white.glb`, 0.76],
    ["b:b", `${base}models/bishop_black.glb`, 0.76],
    ["n:w", `${base}models/knight_white.glb`, 0.56],
    ["n:b", `${base}models/knight_black.glb`, 0.56],
    ["k:w", `${base}models/king_white.glb`, 0.95],
    ["k:b", `${base}models/king_black.glb`, 0.95],
    ["q:w", `${base}models/queen_white.glb`, 0.95],
    ["q:b", `${base}models/queen_black.glb`, 0.95],
    ["r:w", `${base}models/rook_white.glb`, 0.92],
    ["r:b", `${base}models/rook_black.glb`, 0.92],
  ];
  await Promise.all(
    wanted.map(async ([key, url, height]) => {
      try {
        const gltf = await loader.loadAsync(url);
        // Visibility floor for the black fleet: dark textures on dark water
        // can vanish, so lift albedo slightly and add a whisper of emissive.
        if (key.endsWith(":b")) {
          gltf.scene.traverse((o) => {
            const mesh = o as THREE.Mesh;
            const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
            if (mat?.isMeshStandardMaterial) {
              mat.color.multiplyScalar(1.1);
              mat.emissive.setRGB(0.02, 0.022, 0.025);
            }
          });
        }
        registry.set(key, normalize(gltf.scene, height));
      } catch {
        // Missing/failed model: the procedural builder covers this ship.
      }
    }),
  );
}

/** A fresh clone for one ship instance (geometry/materials shared). */
export function getShipModel(type: string, ivory: boolean): THREE.Group | null {
  const proto = registry.get(`${type}:${ivory ? "w" : "b"}`);
  return proto ? (proto.clone(true) as THREE.Group) : null;
}

import * as THREE from 'three';

type BayPoint = readonly [number, number];
type QuayPart = { x: number; y: number; z: number; w: number; h: number; d: number };

/** A short scenic quay, not a physics barrier or a reconstruction of the whole bay. */
export function createC3BayQuay(a: BayPoint, b: BayPoint): THREE.Group {
  const group = new THREE.Group();
  group.name = 'C3_BayQuay';
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const edgeLength = Math.hypot(dx, dz), setback = 6;
  if (!Number.isFinite(edgeLength) || edgeLength <= setback * 2) return group;
  const length = edgeLength - setback * 2;
  group.position.set((a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2);
  group.rotation.y = -Math.atan2(dz, dx);
  // X follows the CCW bay edge, +Z is water; the promenade stays on land at -Z.
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const retaining = new THREE.MeshStandardMaterial({ name: 'C3_QuayRetainingStone', color: 0x596169, roughness: 0.95, metalness: 0 });
  const paving = new THREE.MeshStandardMaterial({ name: 'C3_QuayPavingStone', color: 0x848b90, roughness: 0.94, metalness: 0 });
  const paintedRail = new THREE.MeshStandardMaterial({ name: 'C3_QuayPaintedRail', color: 0x4c5963, roughness: 0.72, metalness: 0 });
  const dummy = new THREE.Object3D();
  const add = (name: string, material: THREE.Material, parts: QuayPart[]) => {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = name;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      dummy.position.set(p.x, p.y, p.z); dummy.scale.set(p.w, p.h, p.d); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    group.add(mesh);
  };
  add('C3_QuayRetainingWall', retaining, [{ x: 0, y: -0.70, z: 0, w: length, h: 1.6, d: 0.55 }]);
  add('C3_QuayCoping', paving, [{ x: 0, y: 0.1, z: 0, w: length, h: 0.16, d: 0.8 }]);
  add('C3_QuayPromenade', paving, [{ x: 0, y: -0.035, z: -2.2, w: length, h: 0.15, d: 3.6 }]);
  const intervals = Math.ceil(length / 5);
  const rails: QuayPart[] = [];
  for (let i = 0; i <= intervals; i++) {
    rails.push({ x: -length / 2 + 0.06 + (length - 0.12) * i / intervals, y: 0.69, z: -0.1, w: 0.09, h: 1.1, d: 0.09 });
  }
  rails.push({ x: 0, y: 1.22, z: -0.1, w: length - 0.12, h: 0.06, d: 0.06 });
  rails.push({ x: 0, y: 0.64, z: -0.1, w: length - 0.12, h: 0.05, d: 0.06 });
  add('C3_QuayGuardrail', paintedRail, rails);
  group.userData.c3Quay = { endpoints: [[...a], [...b]], setback, length, waterY: -0.65, sceneOnly: true };
  return group;
}

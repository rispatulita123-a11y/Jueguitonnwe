import * as THREE from 'three';

type Point = [number, number];
type BankPoint = { x: number; z: number; t: number };

/** Scenic river, not surveyed bathymetry or Singapore planimetry. */
export function createC3RiverChannel(bay: readonly (readonly [number, number])[], points: readonly { x: number; z: number }[]): { contour: Point[]; group: THREE.Group } {
  const group = new THREE.Group();
  group.name = 'C3_RiverContext';
  const original = bay.map(([x, z]): Point => [x, z]);
  const unchanged = () => ({ contour: original, group });
  const anchor = points[372], before = points[371], after = points[373];
  if (!anchor || !before || !after || bay.length < 3) return unchanged();
  const yaw = Math.atan2(after.x - before.x, after.z - before.z);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const world = (x: number, z: number): Point => [anchor.x + c * x + s * z, anchor.z - s * x + c * z];
  const local = ([x, z]: readonly number[]): Point => [c * (x-anchor.x) - s * (z-anchor.z), s * (x-anchor.x) + c * (z-anchor.z)];
  const cross = (a: Point, b: Point) => a[0]*b[1]-a[1]*b[0];
  const subtract = (a: readonly number[], b: readonly number[]): Point => [a[0]-b[0], a[1]-b[1]];
  const intersection = (p: Point, end: Point, q: readonly number[], qEnd: readonly number[]) => {
    const r = subtract(end,p), t = subtract(qEnd,q), delta = subtract(q,p), den = cross(r,t);
    if (Math.abs(den) < 1e-9) return null;
    const along = cross(delta,t)/den, shore = cross(delta,r)/den;
    if (along <= 0 || along >= 1 || shore <= 0 || shore >= 1) return null;
    return {along, shore, point:[p[0]+along*r[0],p[1]+along*r[1]] as Point};
  };
  const minX = -100, maxX = 140, halfWidth = 18;
  const banks = [-halfWidth,halfWidth].map(z => {
    const west=world(minX,z), east=world(maxX,z), hit=intersection(west,east,bay[bay.length-1],bay[0]);
    return hit ? {...hit,z,west,localEndX:minX+(maxX-minX)*hit.along} : null;
  });
  if (!banks[0] || !banks[1]) return unchanged();
  const ordered = [banks[0],banks[1]].sort((a,b)=>a.shore-b.shore);
  const coastA=local(bay[bay.length-1]), coastB=local(bay[0]);
  if (Math.abs(coastB[1]-coastA[1]) < 1e-7) return unchanged();
  const coastX = (z:number) => coastA[0]+(coastB[0]-coastA[0])*(z-coastA[1])/(coastB[1]-coastA[1]);
  const smooth = (a:number,b:number,x:number) => {const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const middleMouth=(ordered[0].localEndX+ordered[1].localEndX)/2;
  const rows: Array<{a:Point;b:Point;t:number}> = [];
  const localRows: Array<{a:BankPoint;b:BankPoint;t:number}> = [];
  const segments = 64;
  for (let i=0;i<=segments;i++) {
    const t=i/segments, xMean=minX+(middleMouth-minX)*t;
    // Upstream meander and rounded head; keep the bridge throat and mouth width.
    const upstream=1-smooth(-38,-14,xMean);
    const center=upstream*(4.5*Math.sin((xMean-minX)/(minX+38)*Math.PI)+2.5);
    const widthBase=18-2.2*upstream+1.1*upstream*Math.sin((xMean+55)*0.065);
    const cap=xMean < minX+16 ? Math.sqrt(Math.max(0,1-((xMean-(minX+16))/16)**2)) : 1;
    const width=widthBase*cap;
    const bankPoint=(side:number):BankPoint => {
      const z=center+side*width;
      return {x:minX+(coastX(z)-minX)*t,z,t};
    };
    const a=bankPoint(Math.sign(ordered[0].z)), b=bankPoint(Math.sign(ordered[1].z));
    localRows.push({a,b,t}); rows.push({a:world(a.x,a.z),b:world(b.x,b.z),t});
  }
  // One connected cutout, sharing the exact two original mouth intersections.
  const path = [...localRows.map(r=>r.a).reverse(),...localRows.slice(1).map(r=>r.b)];
  const contour:Point[] = [...original,...path.map(p=>world(p.x,p.z))];
  group.position.set(anchor.x,0,anchor.z); group.rotation.y=yaw;

  // Keep the original UUID/resource creation sequence before procedural crowds.
  // Replacement bank geometry is built only by finalizeC3RiverChannel at the end.
  const unit = new THREE.BoxGeometry(1,1,1);
  const stone = new THREE.MeshStandardMaterial({name:'C3_RiverBankStone',color:0x596169,roughness:0.95,metalness:0});
  const walls = new THREE.InstancedMesh(unit,stone,3);
  walls.name='C3_RiverRetainingBanks';
  const matrix=new THREE.Matrix4(), quaternion=new THREE.Quaternion();
  const boxes:number[][]=ordered.map(bank=>[(minX+bank.localEndX)/2,-0.6,bank.z,bank.localEndX-minX,1.05,0.4]);
  boxes.push([minX,-0.6,0,0.4,1.05,halfWidth*2]);
  boxes.forEach(([x,y,z,w,h,d],i)=>{matrix.compose(new THREE.Vector3(x,y,z),quaternion,new THREE.Vector3(w,h,d));walls.setMatrixAt(i,matrix);});
  walls.instanceMatrix.needsUpdate=true;walls.computeBoundingBox();walls.computeBoundingSphere();walls.receiveShadow=true;group.add(walls);
  const deck=new THREE.Mesh(unit,stone);
  deck.name='C3_AndersonDeckSlab';deck.position.set(0,-0.13,0);deck.scale.set(24,0.24,66);deck.receiveShadow=true;group.add(deck);
  group.userData.c3River={
    scenicOnly:true,contour,anchor:[anchor.x,anchor.z],yaw,
    channel:{minX,maxX,halfWidth},
    intersections:ordered.map(bank=>({world:bank.point,localX:bank.localEndX,localZ:bank.z,shoreT:bank.shore})),
    bankTopY:0.22,waterY:-0.65,deckTopY:-0.01,
    bankPathLocal:path,bedProfile:{bayContour:original,rows,centerDepth:9.5,edgeDepth:1.4},
    bankWidth:2.5,geometryFinalized:false,
  };
  return {contour,group};
}

/** Called AFTER crowd construction; never changes the existing bridge deck. */
export function finalizeC3RiverChannel(group:THREE.Object3D):void {
  const data=group.userData.c3River;
  if (!data || data.geometryFinalized) return;
  const walls=group.getObjectByName('C3_RiverRetainingBanks') as THREE.InstancedMesh;
  const path=data.bankPathLocal as BankPoint[];
  if (!walls || !path || path.length<3) return;
  const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const positions:number[]=[], uvs:number[]=[], stoneIndices:number[]=[], wetIndices:number[]=[];
  let distance=0;
  for (let i=0;i<path.length;i++) {
    const p=path[i], prev=path[Math.max(0,i-1)], next=path[Math.min(path.length-1,i+1)];
    const tx=next.x-prev.x,tz=next.z-prev.z,len=Math.hypot(tx,tz)||1;
    // The connected cutout has water on the left and land on the right.
    const nx=tz/len,nz=-tx/len;
    if(i)distance+=Math.hypot(p.x-prev.x,p.z-prev.z);
    const mouth=1-smooth(0.86,1,p.t);
    const bridge=smooth(12.2,18,Math.abs(p.x));
    const top=THREE.MathUtils.lerp(-0.16,-0.08+0.30*mouth,bridge);
    const width=2.5*mouth;
    const section=[
      // Submerged walls reach down to -0.75: seamlessly below the -0.65 water level.
      [0,-0.75],[0,Math.min(-0.18,top-0.12)],[0.12*mouth,top-0.04*mouth],
      [0.32*mouth,top],[1.25*mouth,top],[width,-0.08],
    ];
    for(let j=0;j<section.length;j++) {
      const [offset,y]=section[j];
      // No raised material within the complete existing bridge slab footprint.
      const x=p.x+nx*offset,z=p.z+nz*offset;
      const safeY=Math.abs(x)<=12.05&&Math.abs(z)<=33.05?Math.min(y,-0.16):y;
      positions.push(x,safeY,z);uvs.push(distance*0.45,offset*0.45);
    }
  }
  for(let i=0;i<path.length-1;i++)for(let j=0;j<5;j++) {
    const a=i*6+j,b=(i+1)*6+j;
    (j===0?wetIndices:stoneIndices).push(a,b,a+1,b,b+1,a+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex([...stoneIndices,...wetIndices]);
  geometry.addGroup(0,stoneIndices.length,0);geometry.addGroup(stoneIndices.length,wetIndices.length,1);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const stone=(walls.material as THREE.MeshStandardMaterial).clone();
  stone.side=THREE.DoubleSide;
  const wet=new THREE.MeshStandardMaterial({name:'C3_RiverWetStone',color:0x2b393c,roughness:0.94,metalness:0,side:THREE.DoubleSide});
  // Old unit geometry remains owned by the unchanged deck slab and is not disposed here.
  walls.geometry=geometry;walls.material=[stone,wet];walls.count=1;walls.setMatrixAt(0,new THREE.Matrix4());
  walls.instanceMatrix.needsUpdate=true;walls.computeBoundingBox();walls.computeBoundingSphere();
  // This shallow open ribbon produced striped self-shadowing in the shadow atlas.
  // Keep received bridge/contact shadows; omit only the bank's own shadow casting.
  walls.userData.c3NoShadow=true;walls.castShadow=false;walls.receiveShadow=true;
  data.geometryFinalized=true;
  data.bankVertices=positions.length/3;
  data.bedProfile.centerDepth=9.5;
}

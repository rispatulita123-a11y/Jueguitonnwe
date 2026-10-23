import * as THREE from 'three';

export type C3WaterContour = readonly (readonly [number, number])[];
export interface C3RiverBedProfile {
  bayContour: C3WaterContour;
  rows: readonly { a: readonly [number, number]; b: readonly [number, number]; t: number }[];
  centerDepth: number;
  edgeDepth: number;
}
export interface C3WaterVolume {
  group: THREE.Group;
  diagnostics: {
    waterY: number; bedY: number; depth: number; contourPoints: number;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    riverDepth?: { center: number; edge: number; mouth: number };
  };
}

/** One submerged volume. River shoulders/bottom join the unchanged 8 m bay. */
export function createC3WaterVolume(contour:C3WaterContour, waterY=-0.65, depth=8, river?:C3RiverBedProfile):C3WaterVolume {
  if(contour.length<3 || !Number.isFinite(waterY) || !Number.isFinite(depth) || depth<=0) throw new Error('Invalid C3 water volume');
  const points=contour.map(([x,z])=>{if(!Number.isFinite(x)||!Number.isFinite(z))throw new Error('Non-finite water contour');return [x,z] as const;});
  const minX=Math.min(...points.map(p=>p[0])),maxX=Math.max(...points.map(p=>p[0]));
  const minZ=Math.min(...points.map(p=>p[1])),maxZ=Math.max(...points.map(p=>p[1]));
  const bedY=waterY-depth,group=new THREE.Group();group.name='C3_WaterVolume';
  const smooth=(a:number,b:number,x:number)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
  const riverDepth=(t:number,u:number):number=>{
    if(!river)return depth;
    const lateral=Math.pow(Math.max(0,Math.sin(Math.PI*u)),0.75);
    const section=river.edgeDepth+(river.centerDepth-river.edgeDepth)*lateral*smooth(0,0.10,t);
    return THREE.MathUtils.lerp(section,depth,smooth(0.82,1,t));
  };
  const shape=new THREE.Shape();
  const floorContour=river?.bayContour ?? points;
  shape.moveTo(floorContour[0][0],-floorContour[0][1]);
  for(let i=1;i<floorContour.length;i++)shape.lineTo(floorContour[i][0],-floorContour[i][1]);
  shape.closePath();
  const bedGeometry=new THREE.ShapeGeometry(shape,1);bedGeometry.rotateX(-Math.PI/2);
  if(river){
    if(river.rows.length<3||!Number.isFinite(river.centerDepth)||river.centerDepth<=0||river.edgeDepth<=0)throw new Error('Invalid river profile');
    const positions=Array.from(bedGeometry.getAttribute('position').array);
    const uv=Array.from(bedGeometry.getAttribute('uv').array);
    const indices=Array.from(bedGeometry.index!.array);
    const start=positions.length/3, across=12;
    for(const row of river.rows)for(let j=0;j<=across;j++){
      const u=j/across,x=THREE.MathUtils.lerp(row.a[0],row.b[0],u),z=THREE.MathUtils.lerp(row.a[1],row.b[1],u);
      const y=depth-riverDepth(row.t,u);
      if(![x,y,z].every(Number.isFinite))throw new Error('Non-finite river bed vertex');
      positions.push(x,y,z);uv.push(x,-z);
    }
    const triangle=(a:number,b:number,c:number)=>{
      const ax=positions[a*3],az=positions[a*3+2],bx=positions[b*3],bz=positions[b*3+2],cx=positions[c*3],cz=positions[c*3+2];
      if(Math.abs((bx-ax)*(cz-az)-(bz-az)*(cx-ax))>1e-8)indices.push(a,b,c);
    };
    for(let i=0;i<river.rows.length-1;i++)for(let j=0;j<across;j++){
      const a=start+i*(across+1)+j,b=a+across+1;triangle(a,b,a+1);triangle(b,b+1,a+1);
    }
    bedGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    bedGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));bedGeometry.setIndex(indices);
    bedGeometry.deleteAttribute('normal');
  }
  bedGeometry.computeVertexNormals();
  const bedMaterial=new THREE.MeshStandardMaterial({name:'C3_WaterSeabedMaterial',color:0x071820,roughness:0.95,metalness:0,side:THREE.DoubleSide});
  const bed=new THREE.Mesh(bedGeometry,bedMaterial);bed.name='C3_WaterSeabed';bed.position.y=bedY;
  bed.castShadow=false;bed.receiveShadow=false;bed.userData.c3NoShadow=true;group.add(bed);

  const boundaryDepth=new Map<string,number>();
  const key=(p:readonly number[])=>p[0].toFixed(6)+','+p[1].toFixed(6);
  if(river)for(const row of river.rows){boundaryDepth.set(key(row.a),riverDepth(row.t,0));boundaryDepth.set(key(row.b),riverDepth(row.t,1));}
  const vertices:number[]=[],uvs:number[]=[],indices:number[]=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],base=vertices.length/3;
    const ay=waterY-(boundaryDepth.get(key(a))??depth),by=waterY-(boundaryDepth.get(key(b))??depth);
    vertices.push(a[0],waterY,a[1],b[0],waterY,b[1],b[0],by,b[1],a[0],ay,a[1]);
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]);uvs.push(0,1,length,1,length,0,0,0);indices.push(base,base+1,base+2,base,base+2,base+3);
  }
  const wallGeometry=new THREE.BufferGeometry();wallGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  wallGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));wallGeometry.setIndex(indices);wallGeometry.computeVertexNormals();
  const wallMaterial=new THREE.MeshStandardMaterial({name:'C3_WaterDepthWallsMaterial',color:0x071820,roughness:0.95,metalness:0,side:THREE.DoubleSide});
  const walls=new THREE.Mesh(wallGeometry,wallMaterial);walls.name='C3_WaterDepthWalls';walls.castShadow=false;walls.receiveShadow=false;walls.userData.c3NoShadow=true;group.add(walls);
  const diagnostics:C3WaterVolume['diagnostics']={waterY,bedY,depth,contourPoints:points.length,bounds:{minX,maxX,minZ,maxZ}};
  if(river)diagnostics.riverDepth={center:river.centerDepth,edge:river.edgeDepth,mouth:depth};
  group.userData.c3WaterVolume=diagnostics;group.userData.c3WaterContour=points;
  return {group,diagnostics};
}

/**
 * SingaporeTrackBuilder.ts — procedural Marina Bay-inspired night circuit.
 *
 * Closed 19-turn route, shared barrier/collision geometry, and bounded landmark LODs.
 * Visual references guide the landmarks; this is not surveyed FIA planimetry,
 * certification, a zero-bug guarantee, or a device-performance claim.
 * The host project supplies THREE, race logic, lighting and physics integration.
 */

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cloneC3AsphaltMap, finishC3AsphaltSurface, finishC3RubberSurface } from './SingaporeAsphaltSurface';
import asphaltImg from '../../../assets/images/track_asphalt_detail_1790904767865.jpg';
import { getAsphaltPBRTextures, getConcretePBRTextures } from '../../utils/TrackPBRTextures';
import { ITrackWorld } from '../ICircuit';
import { StaticObstacle, DynamicProp } from '../../world/TrackBuilder';
import { SINGAPORE_WAYPOINTS } from './SingaporeWaypoints';
import { GrandstandCrowdSystem } from '../../crowd/GrandstandCrowdSystem';
import { buildC3SafetyStrip, getC3TrackFrames } from './SingaporeSafetyGeometry';
import { buildC3KerbRibbons } from './SingaporeKerbGeometry';
import { decorateMarinaBaySands, decorateRafflesSkyline } from './SingaporeArchitectureDetails';
import { createC3SkyPark, createC3LotusMuseum } from './SingaporeLandmarkGeometry';
import { createC3EsplanadeShells } from './SingaporeEsplanadeGeometry';
import { createC3AndersonBridge } from './SingaporeAndersonBridge';
import { createC3FlyerCapsules } from './SingaporeFlyerCapsules';
import { createC3FlyerRims } from './SingaporeFlyerRims';
import { createC3FlyerFootings } from './SingaporeFlyerFootings';
import { createC3FlyerAxle } from './SingaporeFlyerAxle';
import { buildC3FloodlightRig, createC3FloodlightSteelMaterial } from './SingaporeFloodlightDesign';
import { SingaporeCinematicAtmosphere } from './SingaporeCinematicAtmosphere';
import { createC3WaterSurface, type C3WaterSurface } from './SingaporeWaterSurface';
export class SingaporeTrackBuilder implements ITrackWorld {
  public group: THREE.Group;
  public staticObstacles: StaticObstacle[] = [];
  public dynamicProps: DynamicProp[] = [];
  public crowdSystem: GrandstandCrowdSystem;

  // Track Dimensions (Official F1 Urban standard width: 14m)
  public readonly trackWidth = 14.0;
  public readonly halfWidth = 7.0;

  // Pit Stop Area Bounds along canonical main straight (X ≈ 698 to 726, Z from -180 to 20)
  public readonly pitZone = {
    minX: 697.0,
    maxX: 728.0,
    minZ: -185.0,
    maxZ: 25.0,
  };

  // Materials
  private asphaltMat!: THREE.MeshStandardMaterial;
  private rubberGrooveMat!: THREE.MeshStandardMaterial;
  private kerbBlueMat!: THREE.MeshStandardMaterial;
  private kerbWhiteMat!: THREE.MeshStandardMaterial;
  private concreteBarrierMat!: THREE.MeshStandardMaterial;
  private safetyWallMat!: THREE.MeshStandardMaterial;
  private waterSurface?: C3WaterSurface;
  private waterMesh?: THREE.Mesh;
  private waterMat!: THREE.MeshStandardMaterial;
  private whiteLineMat!: THREE.MeshStandardMaterial;
  private yellowLineMat!: THREE.MeshStandardMaterial;
  private floodlightPoleMat!: THREE.MeshStandardMaterial;
  private mbsBuildingMat!: THREE.MeshStandardMaterial;
  private mbsGlassMat!: THREE.MeshStandardMaterial;
  private mbsWindowPatternMat!: THREE.MeshStandardMaterial;
  private esplanadeDomeMat!: THREE.MeshStandardMaterial;
  private esplanadeGlowMat!: THREE.MeshStandardMaterial;
  private neonGlowCyanMat!: THREE.MeshStandardMaterial;
  private neonGlowMagentaMat!: THREE.MeshStandardMaterial;
  private sponsorSgMat!: THREE.MeshStandardMaterial;
  private sponsorRolexMat!: THREE.MeshStandardMaterial;
  private sponsorAirlinesMat!: THREE.MeshStandardMaterial;
  private bridgeTrussMat!: THREE.MeshStandardMaterial;
  private bridgeLanternMat!: THREE.MeshStandardMaterial;
  private skyscraperFacadeMat!: THREE.MeshStandardMaterial;

  // Dynamic animation objects
  private ferrisWheelRimGroup?: THREE.Group;
  private cinematicAtmosphere?: SingaporeCinematicAtmosphere;
  private disposed = false;

  constructor() {
    this.group = new THREE.Group();
    this.crowdSystem = new GrandstandCrowdSystem();

    this.initMaterials();
    this.buildMarinaBayWater();
    this.buildRoadbedFoundation();
    this.buildTrackRibbon();
    this.buildRubberRacingGroove();
    this.buildSingaporeRibbonKerbs();
    this.buildRoadMarkings();
    this.buildStartFinishGantry();
    this.buildPitLaneAndGarages();
    this.buildDoubleSidedSafetyBarriers();
    this.buildPitAccessPerimeterWalls();
    this.buildInstancedStadiumFloodlights();
    this.buildAndersonBridgeStructure();
    this.buildMarinaBaySandsLandmark();
    this.buildEsplanadeTheatresLandmark();
    this.buildSingaporeFlyerWheel();
    this.buildRafflesPlaceCitySkyline();
    this.buildTracksideGrandstands();
    this.buildBrakingDistanceBoards();
    this.upgradeWaterSurface();

    // Optimize static nodes for zero CPU matrix overhead
    const dynamicMeshes = new Set(this.dynamicProps.map((p) => p.mesh));
    if (this.ferrisWheelRimGroup) dynamicMeshes.add(this.ferrisWheelRimGroup);
    this.group.traverse((obj) => {
      let isDynamic = false;
      let shadowlessAncestor = false;
      let curr: THREE.Object3D | null = obj;
      while (curr && curr !== this.group) {
        if (dynamicMeshes.has(curr as any)) {
          isDynamic = true;
        }
        if (curr.userData.c3NoShadow) shadowlessAncestor = true;
        curr = curr.parent;
      }

      if (obj instanceof THREE.Mesh) {
        obj.castShadow = !shadowlessAncestor && !obj.userData.c3NoShadow &&
          !obj.name.startsWith('C3_UrbanGround') && obj.name !== 'C3_DistantCityBlocks';
        obj.receiveShadow = true;
        if (!isDynamic) {
          obj.matrixAutoUpdate = false;
          obj.updateMatrix();
        }
      }
    });
    this.group.updateMatrixWorld(true);
    this.cinematicAtmosphere = new SingaporeCinematicAtmosphere(this.group, quality => {
      const material = this.waterSurface?.mesh.material as THREE.ShaderMaterial | undefined;
      material?.userData.setQuality?.(quality);
      if (this.waterSurface) this.waterSurface.mesh.userData.c3Frame = (this.waterSurface.mesh.userData.c3Frame ?? 0) + 1;
    });
    this.group.userData.c3Cinematic = this.cinematicAtmosphere.diagnostics;
  }

  private initMaterials(): void {
    const asphaltPBR = getAsphaltPBRTextures();
    const asphaltAlbedo = asphaltPBR.albedo ? cloneC3AsphaltMap(asphaltPBR.albedo) : new THREE.TextureLoader().load(asphaltImg);
    asphaltAlbedo.wrapS = asphaltAlbedo.wrapT = THREE.RepeatWrapping;
    asphaltAlbedo.colorSpace = THREE.SRGBColorSpace;
    asphaltAlbedo.repeat.set(28, 28);
    asphaltAlbedo.anisotropy = 8;

    const asphaltNormal = cloneC3AsphaltMap(asphaltPBR.normal);
    asphaltNormal.repeat.set(28, 28);
    asphaltNormal.anisotropy = 4;

    const asphaltRough = cloneC3AsphaltMap(asphaltPBR.roughness);
    asphaltRough.repeat.set(28, 28);

    // Dry aggregate is dielectric. Suppress the former metallic, near-mirror
    // response and subpixel normal sparkle without changing the shared renderer.
    this.asphaltMat = new THREE.MeshPhysicalMaterial({
      name: 'C3_DryAggregateAsphalt',
      map: asphaltAlbedo,
      normalMap: asphaltNormal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughnessMap: asphaltRough,
      color: 0x889096,
      roughness: 0.95,
      metalness: 0.0,
    });

    finishC3AsphaltSurface(this.asphaltMat);

    // 2. High-contrast rubber groove
    this.rubberGrooveMat = new THREE.MeshStandardMaterial({
      name: 'C3_RubberedRacingLine',
      color: 0x15191d,
      roughness: 0.72,
      metalness: 0.0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    finishC3RubberSurface(this.rubberGrooveMat);

    // 3. Official Marina Bay blue & white curbs
    this.kerbBlueMat = new THREE.MeshStandardMaterial({
      color: 0x0055b8, // Singapore Grand Prix royal blue
      roughness: 0.78,
      metalness: 0.0,
    });

    this.kerbWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf2f4f8,
      roughness: 0.78,
      metalness: 0.0,
    });

    // 4. Concrete barrier
    this.concreteBarrierMat = new THREE.MeshStandardMaterial({
      color: 0xa2a7ad,
      roughness: 0.94,
      metalness: 0.0,
    });
    const concretePBR = getConcretePBRTextures();
    this.safetyWallMat = this.concreteBarrierMat.clone();
    this.safetyWallMat.name = 'C3_PrecastConcreteWalls';
    this.safetyWallMat.color.set(0xffffff);
    if (concretePBR.albedo) {
      // The shared map is calibrated for dark sunlit concrete. A brighter
      // instance-owned canvas represents pale precast race barriers at night.
      const source = concretePBR.albedo.image as HTMLCanvasElement;
      const canvas = document.createElement('canvas');
      canvas.width = source.width;canvas.height = source.height;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = 'brightness(1.7)';ctx.drawImage(source, 0, 0);
      this.safetyWallMat.map = new THREE.CanvasTexture(canvas);
      this.safetyWallMat.map.colorSpace = THREE.SRGBColorSpace;
      this.safetyWallMat.map.wrapS = this.safetyWallMat.map.wrapT = THREE.RepeatWrapping;
      this.safetyWallMat.map.anisotropy = 4;
    }
    this.safetyWallMat.normalMap = concretePBR.normal.clone();
    this.safetyWallMat.roughnessMap = concretePBR.roughness.clone();
    this.safetyWallMat.normalScale.set(0.14, 0.14);

    // SkyPark's elevated pool remains independent from the sea-level planar reflection.
    this.waterMat = new THREE.MeshStandardMaterial({ name: 'C3_SkyParkPoolWater', color: 0x0b171b, roughness: 0.36, metalness: 0 });

    // 6. Crisp track markings
    this.whiteLineMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.82,
      metalness: 0.0,
    });

    this.yellowLineMat = new THREE.MeshStandardMaterial({
      color: 0xffd200,
      roughness: 0.35,
      metalness: 0.1,
    });

    // 7. Floodlight structures — shared textured PBR finish for every mast, boom and case.
    this.floodlightPoleMat = createC3FloodlightSteelMaterial();

    // 8. Landmarks
    this.mbsBuildingMat = new THREE.MeshStandardMaterial({
      color: 0xdde3ea,
      roughness: 0.45,
      metalness: 0.25,
    });

    this.mbsGlassMat = new THREE.MeshStandardMaterial({
      color: 0x0f2b48,
      roughness: 0.12,
      metalness: 0.85,
      emissive: 0x0a1e36,
      emissiveIntensity: 0.65,
    });

    this.mbsWindowPatternMat = new THREE.MeshStandardMaterial({
      color: 0x1a2634,
      emissive: 0x253b52,
      emissiveIntensity: 0.75,
      roughness: 0.3,
      metalness: 0.4,
    });

    this.esplanadeDomeMat = new THREE.MeshStandardMaterial({
      name: 'C3_EsplanadeAluminiumSunshades',
      color: 0xb9ad96,
      roughness: 0.68,
      metalness: 0.65,
    });

    this.esplanadeGlowMat = new THREE.MeshStandardMaterial({
      name: 'C3_EsplanadeRecessedGlazing',
      color: 0x222b31,
      emissive: 0x5c4020,
      emissiveIntensity: 0.3,
      roughness: 0.34,
      metalness: 0.05,
    });

    this.neonGlowCyanMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00c8e0,
      emissiveIntensity: 2.8,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.neonGlowMagentaMat = new THREE.MeshStandardMaterial({
      color: 0xff0066,
      emissive: 0xe6005c,
      emissiveIntensity: 2.6,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.sponsorSgMat = new THREE.MeshStandardMaterial({
      color: 0xe60000,
      emissive: 0x660000,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.1,
    });

    this.sponsorRolexMat = new THREE.MeshStandardMaterial({
      color: 0x006039,
      emissive: 0x002c1a,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.3,
    });

    this.sponsorAirlinesMat = new THREE.MeshStandardMaterial({
      color: 0x162b4d,
      emissive: 0x0d1a2e,
      emissiveIntensity: 0.5,
      roughness: 0.4,
      metalness: 0.1,
    });

    this.bridgeTrussMat = new THREE.MeshStandardMaterial({
      color: 0xadb7be,
      roughness: 0.65,
      metalness: 0,
    });
    this.bridgeTrussMat.name = 'C3_AndersonPaintedSteel';

    this.bridgeLanternMat = new THREE.MeshStandardMaterial({
      color: 0xfffaed,
      emissive: 0xffb84d,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.1,
    });

    this.skyscraperFacadeMat = new THREE.MeshStandardMaterial({
      color: 0x121b28,
      emissive: 0x1e2e42,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });
  }

  private buildMarinaBayWater(): void {
    // Continuous deep-water plane beneath and around the entire floating route.
    const waterGeo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    // Construct the original placeholder before procedural scenery. Three UUIDs
    // consume Math.random, so new effect resources must come AFTER the crowd.
    const waterMesh = new THREE.Mesh(waterGeo, this.waterMat);
    this.waterMesh = waterMesh;
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(0, -0.65, 0);
    this.group.add(waterMesh);
  }

  private upgradeWaterSurface(): void {
    const original = this.waterMesh!;
    const index = this.group.children.indexOf(original);
    this.waterSurface = createC3WaterSurface(original.geometry);
    const originalMaterials = Array.isArray(original.material) ? original.material : [original.material];
    originalMaterials.forEach((material) => material.dispose());
    const water = this.waterSurface.mesh;
    water.position.copy(original.position);
    water.rotation.x = -Math.PI / 2;
    water.userData.c3NoShadow = true;
    this.group.remove(original); this.group.add(water);
    // Preserve the approved child order. Only water geometry changes under the explicit depth exception.
    this.group.children.splice(this.group.children.indexOf(water), 1);
    this.group.children.splice(index, 0, water);
    this.waterMesh = water;
    this.group.userData.c3Ocean = {
      seaLevel: water.position.y,
      width: 1900,
      depth: 1500,
      trackSurfaceY: 0.02,
      clearanceBelowTrack: 0.02 - water.position.y,
      continuous: true,
      visualMarginMetres: 100,
    };
    this.group.userData.c3Water = this.waterSurface.diagnostics;
  }

  private buildTrackRibbon(): void {
    const pts = SINGAPORE_WAYPOINTS;
    const numPts = pts.length;

    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const halfW = this.halfWidth;
    const last = pts[numPts - 1], first = pts[0];
    const lapLength = (last.accumulatedDistance ?? (numPts - 1) * 7.5) + Math.hypot(last.x - first.x, last.z - first.z);
    // An integer lap UV closes phase exactly with the shared integer-repeat maps.
    // The 0.0406% density adjustment avoids a fractional texture jump at WP0.
    const lapV = Math.max(1, Math.round(lapLength * 0.08));
    const uvPerMetre = lapV / lapLength;

    // Duplicate the first pair only for the closing UV edge, not its faces.
    for (let i = 0; i <= numPts; i++) {
      const pointIndex = i % numPts;
      const p = pts[pointIndex];
      const prevP = pts[(pointIndex - 1 + numPts) % numPts];
      const nextP = pts[(pointIndex + 1) % numPts];

      const dx = nextP.x - prevP.x;
      const dz = nextP.z - prevP.z;
      const len = Math.hypot(dx, dz) || 1;
      const normX = -dz / len;
      const normZ = dx / len;

      const dist = i === numPts ? lapV : (p.accumulatedDistance ?? i * 7.5) * uvPerMetre;
      vertices.push(p.x - normX * halfW, 0.02, p.z - normZ * halfW);
      uvs.push(0, dist);

      vertices.push(p.x + normX * halfW, 0.02, p.z + normZ * halfW);
      uvs.push(1, dist);

      if (i < numPts) {
        const currentLeft = i * 2;
        const currentRight = i * 2 + 1;
        const nextLeft = (i + 1) * 2;
        const nextRight = (i + 1) * 2 + 1;

        indices.push(currentLeft, currentRight, nextLeft);
        indices.push(currentRight, nextRight, nextLeft);
      }
    }

    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const roadMesh = new THREE.Mesh(roadGeo, this.asphaltMat);
    roadMesh.name = 'C3_MainAsphalt';
    roadMesh.userData.c3NoShadow = true;
    this.group.add(roadMesh);
  }

  /**
   * Slightly oversized structural pavement below the visible ribbon.
   * It seals the acute-corner seams between waypoint quads without changing
   * the racing surface, kerbs, UVs or collision line. This is deliberately a
   * single static mesh so it costs one draw call and prevents the ocean from
   * showing through at every tight turn.
   */
  private buildRoadbedFoundation(): void {
    const pts = SINGAPORE_WAYPOINTS;
    const halfW = this.halfWidth + 1.35;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const next = pts[(i + 1) % pts.length];
      const dx = next.x - prev.x, dz = next.z - prev.z;
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length, nz = dx / length;
      vertices.push(p.x - nx * halfW, -0.02, p.z - nz * halfW);
      uvs.push(0, (p.accumulatedDistance ?? i * 7.5) * 0.08);
      vertices.push(p.x + nx * halfW, -0.02, p.z + nz * halfW);
      uvs.push(1, (p.accumulatedDistance ?? i * 7.5) * 0.08);
      const j = (i + 1) % pts.length;
      indices.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const roadbed = new THREE.Mesh(geometry, this.asphaltMat);
    roadbed.name = 'C3_ContinuousRoadbed';
    roadbed.userData.c3NoShadow = true;
    this.group.add(roadbed);
  }

  private buildRubberRacingGroove(): void {
    const pts = SINGAPORE_WAYPOINTS;
    const numPts = pts.length;
    const grooveWidth = 3.6;

    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < numPts; i++) {
      const p = pts[i];
      const prevP = pts[(i - 1 + numPts) % numPts];
      const nextP = pts[(i + 1) % numPts];

      const dx = nextP.x - prevP.x;
      const dz = nextP.z - prevP.z;
      const len = Math.hypot(dx, dz) || 1;
      const normX = -dz / len;
      const normZ = dx / len;

      vertices.push(p.x - normX * grooveWidth, 0.025, p.z - normZ * grooveWidth);
      vertices.push(p.x + normX * grooveWidth, 0.025, p.z + normZ * grooveWidth);

      const currentLeft = i * 2;
      const currentRight = i * 2 + 1;
      const nextLeft = ((i + 1) % numPts) * 2;
      const nextRight = ((i + 1) % numPts) * 2 + 1;

      indices.push(currentLeft, currentRight, nextLeft);
      indices.push(currentRight, nextRight, nextLeft);
    }

    const grooveGeo = new THREE.BufferGeometry();
    grooveGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    grooveGeo.setIndex(indices);
    grooveGeo.computeVertexNormals();

    const grooveMesh = new THREE.Mesh(grooveGeo, this.rubberGrooveMat);
    grooveMesh.name = 'C3_RubberGroove';
    grooveMesh.userData.c3NoShadow = true;
    this.group.add(grooveMesh);
  }

  private buildSingaporeRibbonKerbs(): void {
    const ribbons = buildC3KerbRibbons(SINGAPORE_WAYPOINTS, this.halfWidth);
    const blue = new THREE.Mesh(ribbons.blue, this.kerbBlueMat);
    const white = new THREE.Mesh(ribbons.white, this.kerbWhiteMat);
    blue.name = 'C3_KerbsBlue';white.name = 'C3_KerbsWhite';
    this.group.add(blue, white);
    this.group.userData.c3KerbStats = ribbons.stats;
  }

  private buildRoadMarkings(): void {
    const pts = SINGAPORE_WAYPOINTS;
    const numPts = pts.length;
    const halfW = this.halfWidth - 0.25;

    const leftVertices: number[] = [];
    const rightVertices: number[] = [];
    const leftIndices: number[] = [];
    const rightIndices: number[] = [];

    const lineWidth = 0.10; // Half of a 20 cm stripe, wholly on the asphalt.

    for (let i = 0; i < numPts; i++) {
      const p = pts[i];
      const prevP = pts[(i - 1 + numPts) % numPts];
      const nextP = pts[(i + 1) % numPts];

      const dx = nextP.x - prevP.x;
      const dz = nextP.z - prevP.z;
      const len = Math.hypot(dx, dz) || 1;
      const normX = -dz / len;
      const normZ = dx / len;

      const lx = p.x - normX * halfW;
      const lz = p.z - normZ * halfW;
      leftVertices.push(lx - normX * lineWidth, 0.026, lz - normZ * lineWidth);
      leftVertices.push(lx + normX * lineWidth, 0.026, lz + normZ * lineWidth);

      const rx = p.x + normX * halfW;
      const rz = p.z + normZ * halfW;
      rightVertices.push(rx - normX * lineWidth, 0.026, rz - normZ * lineWidth);
      rightVertices.push(rx + normX * lineWidth, 0.026, rz + normZ * lineWidth);

      const curL = i * 2;
      const curR = i * 2 + 1;
      const nxtL = ((i + 1) % numPts) * 2;
      const nxtR = ((i + 1) % numPts) * 2 + 1;

      leftIndices.push(curL, curR, nxtL, curR, nxtR, nxtL);
      rightIndices.push(curL, curR, nxtL, curR, nxtR, nxtL);
    }

    const leftGeo = new THREE.BufferGeometry();
    leftGeo.setAttribute('position', new THREE.Float32BufferAttribute(leftVertices, 3));
    leftGeo.setIndex(leftIndices);

    const rightGeo = new THREE.BufferGeometry();
    rightGeo.setAttribute('position', new THREE.Float32BufferAttribute(rightVertices, 3));
    rightGeo.setIndex(rightIndices);

    const mergedWhiteLines = BufferGeometryUtils.mergeGeometries([leftGeo, rightGeo]);
    leftGeo.dispose();
    rightGeo.dispose();
    if (mergedWhiteLines) {
      mergedWhiteLines.computeVertexNormals();
      const linesMesh = new THREE.Mesh(mergedWhiteLines, this.whiteLineMat);
      linesMesh.name = 'C3_MergedTrackEdgeLines';
      this.group.add(linesMesh);
    }
  }

  private buildStartFinishGantry(): void {
    const gantryGroup = new THREE.Group();
    // Exactly at Start / Finish line (X: 687.89, Z: -108.18)
    gantryGroup.position.set(687.89, 0, -108.18);
    gantryGroup.rotation.y = -2.996; // Aligned with the track heading

    const pylonGeo = new THREE.BoxGeometry(1.0, 9.5, 1.0);
    const pylonL = new THREE.Mesh(pylonGeo, this.floodlightPoleMat);
    pylonL.position.set(-9.5, 4.75, 0);
    const pylonR = new THREE.Mesh(pylonGeo, this.floodlightPoleMat);
    pylonR.position.set(9.5, 4.75, 0);
    gantryGroup.add(pylonL, pylonR);

    const trussGeo = new THREE.BoxGeometry(20.5, 1.4, 1.4);
    const truss = new THREE.Mesh(trussGeo, this.floodlightPoleMat);
    truss.position.set(0, 8.8, 0);
    gantryGroup.add(truss);

    const bannerGeo = new THREE.PlaneGeometry(16.5, 2.0);
    const banner = new THREE.Mesh(bannerGeo, this.sponsorSgMat);
    banner.position.set(0, 8.8, -0.75);
    banner.rotation.y = Math.PI;
    gantryGroup.add(banner);

    const rolexGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.4, 24);
    const rolex = new THREE.Mesh(rolexGeo, this.sponsorRolexMat);
    rolex.rotation.x = Math.PI / 2;
    rolex.position.set(0, 10.4, 0);
    gantryGroup.add(rolex);

    const gridGeo = new THREE.PlaneGeometry(14.0, 2.2);
    const gridMesh = new THREE.Mesh(gridGeo, this.whiteLineMat);
    gridMesh.rotation.x = -Math.PI / 2;
    gridMesh.position.set(0, 0.035, 0);
    gantryGroup.add(gridMesh);

    this.group.add(gantryGroup);
  }

  private buildPitLaneAndGarages(): void {
    const pitGroup = new THREE.Group();
    pitGroup.name = 'C3_PitComplex';
    // The heading maps local +Z to the racing direction and local -X to the
    // eastern paddock. Keep the long axis on Z, never across the 14 m road.
    pitGroup.position.set(687.89, 0, -108.18);
    pitGroup.rotation.y = -2.996;

    const laneWidth = 10, laneLength = 240;
    const laneGeometry = new THREE.PlaneGeometry(laneWidth, laneLength);
    // Match the ribbon's U per full road width and V per metre. Default plane
    // UVs stretched the shared aggregate map across a 24:1 rectangle.
    const laneUV = laneGeometry.getAttribute('uv');
    for (let i = 0; i < laneUV.count; i++) {
      laneUV.setXY(i, laneUV.getX(i) * laneWidth / (2 * this.halfWidth), laneUV.getY(i) * laneLength * 0.08);
    }
    laneUV.needsUpdate = true;
    const lane = new THREE.Mesh(laneGeometry, this.asphaltMat);
    lane.name = 'C3_PitApron';
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(-13.7, 0.018, 0);
    pitGroup.add(lane);

    // Keep the open pit lane and divider while removing the entire building/garage.
    const pitWallGeo = new THREE.BoxGeometry(1.0, 1.3, 160);
    const pitWall = new THREE.Mesh(pitWallGeo, this.concreteBarrierMat);
    pitWall.name = 'C3_PitWall';
    pitWall.position.set(-8.5, 0.65, 0);
    pitGroup.add(pitWall);

    pitGroup.updateMatrixWorld(true);
    const wallStart = new THREE.Vector3(0, 0, -80).applyMatrix4(pitWall.matrixWorld);
    const wallEnd = new THREE.Vector3(0, 0, 80).applyMatrix4(pitWall.matrixWorld);
    this.staticObstacles.push({
      x: (wallStart.x + wallEnd.x) / 2, z: (wallStart.z + wallEnd.z) / 2,
      radius: 80.5, type: 'wall', isWallSegment: true,
      p1: { x: wallStart.x, z: wallStart.z },
      p2: { x: wallEnd.x, z: wallEnd.z },
    });

    const perchGeo = new THREE.BoxGeometry(1.4, 2.2, 4.5);
    const monitorGeo = new THREE.BoxGeometry(0.2, 1.0, 3.6);
    const perchCount = 6;
    const perchInst = new THREE.InstancedMesh(perchGeo, this.floodlightPoleMat, perchCount);
    const monitorInst = new THREE.InstancedMesh(monitorGeo, this.neonGlowCyanMat, perchCount);
    perchInst.name = 'C3_PitPerchesInstanced';
    monitorInst.name = 'C3_PitMonitorsInstanced';

    const dummy = new THREE.Object3D();
    let pIdx = 0;
    for (let w = -5; w <= 5; w += 2) {
      dummy.position.set(-8.5, 1.4, w * 12);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      perchInst.setMatrixAt(pIdx, dummy.matrix);

      dummy.position.set(-9.2, 2.0, w * 12);
      dummy.updateMatrix();
      monitorInst.setMatrixAt(pIdx, dummy.matrix);
      pIdx++;
    }
    perchInst.instanceMatrix.needsUpdate = true;
    monitorInst.instanceMatrix.needsUpdate = true;
    pitGroup.add(perchInst, monitorInst);

    this.group.add(pitGroup);
  }

  private buildDoubleSidedSafetyBarriers(): void {
    const strip = buildC3SafetyStrip(SINGAPORE_WAYPOINTS);
    const walls = new THREE.Mesh(strip.walls, this.safetyWallMat);
    walls.name = 'C3_ContinuousSafetyWalls';
    this.group.add(walls);
    for (const {p1, p2} of strip.segments) {
      this.staticObstacles.push({
        x: (p1.x + p2.x) / 2, z: (p1.z + p2.z) / 2,
        radius: Math.hypot(p2.x - p1.x, p2.z - p1.z) * 0.55,
        type: 'wall', isWallSegment: true, p1, p2,
      });
    }
    this.group.userData.c3SafetySegments = strip.segments.length;
  }

  /**
   * The inside safety strip intentionally opens for the pit entry/exit. A
   * second, outer line closes the visual/collision envelope in those spans,
   * while leaving the 7–14 m pit apron between the racing ribbon and barrier.
   */
  private buildPitAccessPerimeterWalls(): void {
    const points = SINGAPORE_WAYPOINTS;
    const frames = getC3TrackFrames(points);
    const vertices: number[] = [], indices: number[] = [];
    const lateral = 14.5, height = 1.1;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const d = points[i].accumulatedDistance ?? i * 7.5;
      if (!(d < 160 || d > 4680)) continue;
      const a = frames[i], b = frames[j];
      const ax = a.x + a.nx * lateral, az = a.z + a.nz * lateral;
      const bx = b.x + b.nx * lateral, bz = b.z + b.nz * lateral;
      const base = vertices.length / 3;
      vertices.push(ax, 0, az, bx, 0, bz, ax, height, az, bx, height, bz);
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      this.staticObstacles.push({
        x: (ax + bx) * 0.5, z: (az + bz) * 0.5,
        radius: Math.hypot(bx - ax, bz - az) * 0.55,
        type: 'wall', isWallSegment: true,
        p1: { x: ax, z: az }, p2: { x: bx, z: bz },
      });
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const walls = new THREE.Mesh(geometry, this.safetyWallMat);
    walls.name = 'C3_PitAccessOuterWalls';
    this.group.add(walls);
  }

  private buildInstancedStadiumFloodlights(): void {
    const floodlights = buildC3FloodlightRig(
      SINGAPORE_WAYPOINTS,
      this.halfWidth,
      this.floodlightPoleMat,
      this.concreteBarrierMat,
    );
    this.group.add(floodlights);
    this.group.userData.c3FloodlightDesign = floodlights.userData.c3FloodlightDesign;
  }

  private buildAndersonBridgeStructure(): void {
    // Game-scale, two-sided truss LOD: connected joints and route-derived heading.
    // No central girder across the racing lane, and no new dynamic lights.
    const bridge = createC3AndersonBridge(this.bridgeTrussMat);
    bridge.traverse((o) => o.layers.enable(1));
    this.group.add(bridge);
  }

  private buildMarinaBaySandsLandmark(): void {
    const mbsGroup = new THREE.Group();
    // 380m south of the track, commanding the southern shoreline of Marina Bay
    mbsGroup.position.set(200, 0, 540);
    mbsGroup.rotation.y = -0.35;

    const towerGeo = new THREE.BoxGeometry(45, 175, 26);
    const glassStripGeo = new THREE.BoxGeometry(42, 168, 1.2);
    const towerOffsets = [-75, 0, 75];

    const towerInst = new THREE.InstancedMesh(towerGeo, this.mbsBuildingMat, 3);
    const glassStripFInst = new THREE.InstancedMesh(glassStripGeo, this.mbsGlassMat, 3);
    const glassStripBInst = new THREE.InstancedMesh(glassStripGeo, this.mbsWindowPatternMat, 3);
    towerInst.name = 'C3_MBSTowersInstanced';
    glassStripFInst.name = 'C3_MBSGlassFrontInstanced';
    glassStripBInst.name = 'C3_MBSGlassBackInstanced';

    const dummy = new THREE.Object3D();
    towerOffsets.forEach((xOff, idx) => {
      const zOff = idx === 1 ? -8 : 0;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);

      dummy.position.set(xOff, 87.5, zOff);
      dummy.updateMatrix();
      towerInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(xOff, 87.5, zOff + 13.2);
      dummy.updateMatrix();
      glassStripFInst.setMatrixAt(idx, dummy.matrix);

      dummy.position.set(xOff, 87.5, zOff - 13.2);
      dummy.updateMatrix();
      glassStripBInst.setMatrixAt(idx, dummy.matrix);
    });

    towerInst.instanceMatrix.needsUpdate = true;
    glassStripFInst.instanceMatrix.needsUpdate = true;
    glassStripBInst.instanceMatrix.needsUpdate = true;
    mbsGroup.add(towerInst, glassStripFInst, glassStripBInst);

    // Tapered SkyPark hull and curved, closed-shell lotus petals.
    // Helpers already use the local MBS coordinate frame: do not translate twice.
    const skypark = createC3SkyPark(this.mbsBuildingMat, this.mbsGlassMat, this.floodlightPoleMat, this.waterMat);
    const lotus = createC3LotusMuseum(this.mbsBuildingMat, this.mbsGlassMat);
    mbsGroup.add(skypark, lotus);

    mbsGroup.name = 'C3_MarinaBaySands';
    mbsGroup.userData.c3NoShadow = true;
    mbsGroup.userData.c3ReflectionExclude = true;
    // Enable Layer 1 only for landmark silhouettes (towers, SkyPark, Lotus)
    towerInst.layers.enable(1);
    skypark.traverse((o) => o.layers.enable(1));
    lotus.traverse((o) => o.layers.enable(1));
    decorateMarinaBaySands(mbsGroup);
    this.group.add(mbsGroup);
  }

  private buildEsplanadeTheatresLandmark(): void {
    const esplanadeGroup = new THREE.Group();
    // The old (-240,-45) plinth covered seven route samples. This infield
    // position is checked against every segment, including the northern return.
    esplanadeGroup.position.set(-200, 0, -105);

    esplanadeGroup.name = 'C3_EsplanadeTheatres';
    esplanadeGroup.userData.c3NoShadow = true;
    esplanadeGroup.userData.c3ReflectionExclude = true;
    esplanadeGroup.add(createC3EsplanadeShells(this.esplanadeDomeMat, this.esplanadeGlowMat));

    const deckGeo = new THREE.BoxGeometry(130, 3.5, 75);
    const deck = new THREE.Mesh(deckGeo, this.mbsBuildingMat);
    deck.position.set(2, 1.75, 6);
    esplanadeGroup.add(deck);

    esplanadeGroup.traverse((o) => o.layers.enable(1));
    this.group.add(esplanadeGroup);
  }

  private buildSingaporeFlyerWheel(): void {
    const flyerGroup = new THREE.Group();
    flyerGroup.name = 'C3_SingaporeFlyer';
    flyerGroup.userData.c3NoShadow = true;
    flyerGroup.userData.c3ReflectionExclude = true;
    // 122m east of the main straight, visible over the pit buildings
    flyerGroup.position.set(810, 0, -120);
    flyerGroup.rotation.y = -0.45;

    const legGeo = new THREE.CylinderGeometry(1.2, 2.4, 85, 8);
    const leg1 = new THREE.Mesh(legGeo, this.floodlightPoleMat);
    leg1.position.set(0, 42.5, -22);
    leg1.rotation.x = 0.26;

    const leg2 = new THREE.Mesh(legGeo, this.floodlightPoleMat);
    leg2.position.set(0, 42.5, 22);
    leg2.rotation.x = -0.26;
    flyerGroup.add(leg1, leg2);
    flyerGroup.add(createC3FlyerFootings([leg1, leg2]));

    this.ferrisWheelRimGroup = new THREE.Group();
    this.ferrisWheelRimGroup.position.set(0, 85, 0);

    const wheelRadius = 55.0;

    this.ferrisWheelRimGroup.add(...createC3FlyerRims(wheelRadius));

    // A cylinder spans a full diameter: eight diameters already give 16 radial directions.
    // The former second half-turn duplicated every surface and its shadow draw.
    const spokeDiameterCount = 8;
    const spokeGeo = new THREE.CylinderGeometry(0.18, 0.18, wheelRadius * 2, 6);
    const spokeInst = new THREE.InstancedMesh(spokeGeo, this.floodlightPoleMat, spokeDiameterCount);
    spokeInst.name = 'C3_FlyerSpokesInstanced';
    const dummySpoke = new THREE.Object3D();
    for (let s = 0; s < spokeDiameterCount; s++) {
      dummySpoke.position.set(0, 0, 0);
      dummySpoke.rotation.set(0, 0, (s / spokeDiameterCount) * Math.PI);
      dummySpoke.scale.set(1, 1, 1);
      dummySpoke.updateMatrix();
      spokeInst.setMatrixAt(s, dummySpoke.matrix);
    }
    spokeInst.instanceMatrix.needsUpdate = true;
    this.ferrisWheelRimGroup.add(spokeInst);

    this.ferrisWheelRimGroup.add(...createC3FlyerCapsules(wheelRadius, 28));

    const axle = createC3FlyerAxle([leg1, leg2], this.ferrisWheelRimGroup.position.y);
    flyerGroup.add(axle.supports);
    this.ferrisWheelRimGroup.add(axle.rotor);
    flyerGroup.add(this.ferrisWheelRimGroup);
    flyerGroup.traverse((o) => o.layers.enable(1));
    this.group.add(flyerGroup);
    // A landmark is not a throwable sign: do not add a 60 m invisible collider
    // to the dynamic prop list used by the car's impact subsystem.
  }

  private buildRafflesPlaceCitySkyline(): void {
    const skylineGroup = new THREE.Group();
    skylineGroup.userData.c3NoShadow = true;
    skylineGroup.userData.c3ReflectionExclude = true;
    // Behind Anderson Bridge and Connaught Drive (south-west Singapore downtown)
    skylineGroup.position.set(-580, 0, 680);

    const towers = [
      { x: -80, z: -40, w: 42, d: 36, h: 210 },
      { x: -15, z: 30, w: 48, d: 42, h: 260 },
      { x: 55, z: -20, w: 38, d: 38, h: 230 },
      { x: 120, z: 45, w: 45, d: 36, h: 195 },
      { x: 180, z: -35, w: 36, d: 34, h: 165 },
    ];

    const beaconGeo = new THREE.SphereGeometry(1.8, 8, 8);
    const towerGeos: THREE.BufferGeometry[] = [];
    const beaconInst = new THREE.InstancedMesh(beaconGeo, this.sponsorSgMat, towers.length);
    beaconInst.name = 'C3_RafflesBeaconsInstanced';
    const dummyBeacon = new THREE.Object3D();

    towers.forEach((t, i) => {
      const bGeo = new THREE.BoxGeometry(t.w, t.h, t.d);
      bGeo.translate(t.x, t.h * 0.5, t.z);
      towerGeos.push(bGeo);

      dummyBeacon.position.set(t.x, t.h + 1.8, t.z);
      dummyBeacon.rotation.set(0, 0, 0);
      dummyBeacon.scale.set(1, 1, 1);
      dummyBeacon.updateMatrix();
      beaconInst.setMatrixAt(i, dummyBeacon.matrix);
    });

    const mergedTowers = BufferGeometryUtils.mergeGeometries(towerGeos);
    towerGeos.forEach((g) => g.dispose());
    if (mergedTowers) {
      mergedTowers.computeVertexNormals();
      const towersMesh = new THREE.Mesh(mergedTowers, this.skyscraperFacadeMat);
      towersMesh.name = 'C3_MergedRafflesTowers';
      towersMesh.layers.enable(1);
      skylineGroup.add(towersMesh);
    }
    beaconInst.instanceMatrix.needsUpdate = true;
    skylineGroup.add(beaconInst);

    skylineGroup.name = 'C3_RafflesSkyline';
    decorateRafflesSkyline(skylineGroup, towers);
    this.group.add(skylineGroup);
  }

  private buildTracksideGrandstands(): void {
    const grandstands = [
      // Pit Straight Grandstand (facing pit straight from the west)
      { x: 658, z: -108, rot: Math.PI / 2 + 0.145, tiers: 12, width: 140 },
      // Padang Grandstand (Turn 10)
      { x: -745, z: 190, rot: 1.57, tiers: 10, width: 110 },
      // Waterfront Grandstand (Turn 16)
      { x: 360, z: 98, rot: 0, tiers: 10, width: 100 },
    ];

    grandstands.forEach((gs) => {
      const gsGroup = new THREE.Group();
      gsGroup.name = `C3_Grandstand_${gs.x}`;
      gsGroup.position.set(gs.x, 0, gs.z);
      gsGroup.rotation.y = gs.rot;

      // One instanced mesh replaces one draw call per tier (36 calls total).
      // Every instance keeps the original dimensions and local transform.
      const stepGeo = new THREE.BoxGeometry(gs.width, 0.75, 1.4);
      const steps = new THREE.InstancedMesh(stepGeo, this.concreteBarrierMat, gs.tiers);
      const stepMatrix = new THREE.Matrix4();
      for (let t = 0; t < gs.tiers; t++) {
        stepMatrix.makeTranslation(0, (t + 1) * 0.75, t * 1.4);
        steps.setMatrixAt(t, stepMatrix);
      }
      steps.instanceMatrix.needsUpdate = true;
      steps.computeBoundingSphere();
      gsGroup.add(steps);

      const canopyGeo = new THREE.BoxGeometry(gs.width + 2, 0.45, gs.tiers * 1.6);
      const canopy = new THREE.Mesh(canopyGeo, this.sponsorAirlinesMat);
      canopy.position.set(0, gs.tiers * 0.75 + 4.5, (gs.tiers * 1.4) * 0.5);
      gsGroup.add(canopy);

      this.group.add(gsGroup);
    });
  }

  private buildBrakingDistanceBoards(): void {
    // Braking distance boards placed strictly behind catch barriers (> 10.5m from centerline)
    const boards = [
      // Turn 1 Braking (Sheares approach, outside right)
      { x: 674.2, z: -274.7, text: '150', rot: -3.00 },
      { x: 667.6, z: -319.7, text: '100', rot: -3.00 },
      { x: 660.0, z: -372.2, text: '50', rot: -3.00 },
      // Turn 7 Braking (Memorial Corner, outside right)
      { x: -90.6, z: -193.2, text: '150', rot: -2.08 },
      { x: -137.0, z: -218.8, text: '100', rot: -2.08 },
      { x: -176.8, z: -240.8, text: '50', rot: -2.08 },
      // Turn 14 Braking (Raffles Avenue, outside left)
      { x: -409.7, z: 114.7, text: '100', rot: 2.86 },
      { x: -395.4, z: 70.7, text: '50', rot: 2.79 },
    ];

    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 6);
    const panelGeo = new THREE.BoxGeometry(1.6, 1.0, 0.12);
    const postsInst = new THREE.InstancedMesh(postGeo, this.floodlightPoleMat, boards.length);
    const panelsInst = new THREE.InstancedMesh(panelGeo, this.kerbWhiteMat, boards.length);
    postsInst.name = 'C3_BrakingPostsInstanced';
    panelsInst.name = 'C3_BrakingPanelsInstanced';

    const dummy = new THREE.Object3D();
    const tempMatrix = new THREE.Matrix4();
    const localPost = new THREE.Matrix4().makeTranslation(0, 1.1, 0);
    const localPanel = new THREE.Matrix4().makeTranslation(0, 2.2, 0);

    boards.forEach((b, i) => {
      dummy.position.set(b.x, 0, b.z);
      dummy.rotation.set(0, b.rot, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();

      tempMatrix.multiplyMatrices(dummy.matrix, localPost);
      postsInst.setMatrixAt(i, tempMatrix);

      tempMatrix.multiplyMatrices(dummy.matrix, localPanel);
      panelsInst.setMatrixAt(i, tempMatrix);
    });

    postsInst.instanceMatrix.needsUpdate = true;
    panelsInst.instanceMatrix.needsUpdate = true;
    this.group.add(postsInst, panelsInst);
  }

  public impartImpulseToProp(prop: DynamicProp, vel: THREE.Vector3, normal: THREE.Vector3): void {
    prop.isSleeping = false;
    prop.isAirborne = true;
    prop.airborneTimer = 0;
    const impactSpeed = vel.length();
    const impulseStrength = Math.min(32, Math.max(6, impactSpeed * 1.4));

    prop.velocity.x = normal.x * impulseStrength + vel.x * 0.45;
    prop.velocity.z = normal.z * impulseStrength + vel.z * 0.45;
    prop.velocity.y = Math.min(12, 5.0 + Math.random() * 3.5);

    prop.angularVelocity.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
  }

  public updateDynamicProps(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = 0; i < this.dynamicProps.length; i++) {
      const prop = this.dynamicProps[i];
      if (prop.mesh === this.ferrisWheelRimGroup) continue;

      if (!prop.prevPosition) prop.prevPosition = prop.position.clone();
      if (!prop.prevRotation) prop.prevRotation = prop.rotation.clone();
      if (prop.isSleeping) continue;

      prop.prevPosition.copy(prop.position);
      prop.prevRotation.copy(prop.rotation);

      if (prop.isAirborne) {
        prop.airborneTimer = (prop.airborneTimer || 0) + dt;
        if (prop.airborneTimer > 2.0) {
          const fadeProgress = (prop.airborneTimer - 2.0) / 0.8;
          const scale = Math.max(0, 1 - fadeProgress);
          prop.mesh.scale.set(scale, scale, scale);
        }
        if (prop.airborneTimer >= 2.8) {
          prop.mesh.visible = false;
          prop.mesh.scale.set(0.001, 0.001, 0.001);
          prop.isSleeping = true;
          prop.velocity.set(0, 0, 0);
          prop.angularVelocity.set(0, 0, 0);
          continue;
        }
      }

      prop.position.addScaledVector(prop.velocity, dt);
      prop.velocity.y -= 19.6 * dt;
      prop.rotation.addScaledVector(prop.angularVelocity, dt);

      if (prop.position.y <= prop.baseY) {
        prop.position.y = prop.baseY;
        prop.velocity.y *= -0.32;
        prop.velocity.x *= 0.65;
        prop.velocity.z *= 0.65;
        prop.angularVelocity.multiplyScalar(0.7);

        if (prop.velocity.lengthSq() < 0.25) {
          prop.isSleeping = true;
          prop.velocity.set(0, 0, 0);
          prop.angularVelocity.set(0, 0, 0);
        }
      }
    }
  }

  /** Visual-only animation; called once per rendered frame, not per physics substep. */
  public updateVisualDynamicProps(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.cinematicAtmosphere?.update(dt);
    this.waterSurface?.update(dt);
    if (!this.ferrisWheelRimGroup) return;
    this.ferrisWheelRimGroup.rotation.z = (this.ferrisWheelRimGroup.rotation.z + 0.04 * Math.min(dt, 0.1)) % (Math.PI * 2);
    for (const child of this.ferrisWheelRimGroup.children) {
      if (child.name === 'C3_FlyerCapsule') {
        child.rotation.z = -this.ferrisWheelRimGroup.rotation.z;
        child.updateMatrix();
      }
    }
  }

  /** Keep shadow casters in a local bubble around the car. Visible meshes and
   * collision geometry remain untouched; only their shadow-map participation
   * is changed. Large track ribbons stay eligible when their bounds overlap
   * the bubble. */
  public updateNearbyShadowCasters(center: THREE.Vector3, radius = 150): void {
    const radiusSq = radius * radius;
    const centerWorld = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || obj.userData.c3NoShadow) return;
      const geometry = obj.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingSphere) return;
      sphere.copy(geometry.boundingSphere).applyMatrix4(obj.matrixWorld);
      centerWorld.copy(sphere.center);
      const maxRadius = sphere.radius;
      const distanceSq = centerWorld.distanceToSquared(center);
      obj.castShadow = distanceSq <= (radius + maxRadius) * (radius + maxRadius) ||
        obj.userData.c3ShadowAlways === true;
    });
  }

  public syncDynamicPropsVisuals(alpha: number): void {
    for (let i = 0; i < this.dynamicProps.length; i++) {
      const prop = this.dynamicProps[i];
      if (prop.mesh === this.ferrisWheelRimGroup) continue;
      if (prop.isSleeping || !prop.prevPosition || !prop.prevRotation) continue;

      prop.mesh.position.lerpVectors(prop.prevPosition, prop.position, alpha);
      prop.mesh.rotation.x = THREE.MathUtils.lerp(prop.prevRotation.x, prop.rotation.x, alpha);
      prop.mesh.rotation.y = THREE.MathUtils.lerp(prop.prevRotation.y, prop.rotation.y, alpha);
      prop.mesh.rotation.z = THREE.MathUtils.lerp(prop.prevRotation.z, prop.rotation.z, alpha);
    }
  }

  public dispose(): void {
    this.disposed = true;
    this.cinematicAtmosphere?.dispose();
    this.waterSurface?.dispose();
    this.crowdSystem.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    this.group.traverse((obj) => {
      // Instanced matrix/color buffers are object-owned, not geometry-owned.
      if (obj instanceof THREE.InstancedMesh) obj.dispose();
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) geometries.add(obj.geometry);
        for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      }
    });
    // All C3 map assignments are instance-owned clones; cached PBR originals
    // remain alive for other circuits. Deduplicate shared resources per disposal.
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
    this.group.clear();
    this.staticObstacles.length = 0;
    this.dynamicProps.length = 0;
  }
}

import React, { useMemo, useRef, useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Center, Environment, Text3D } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore, Fault } from './store';
import { createLayerGeometry } from './geometry';
import { handleExportSTL, handleExportZIP, handleExport3MF } from './exportUtils';
import { Box, Square, Download, FileCode, Sun, Activity, Archive, HelpCircle, X, Info, AlertTriangle } from 'lucide-react';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Evaluator, Brush, SUBTRACTION, ADDITION } from 'three-bvh-csg';
import { loadFont } from './fontLoader';

import { useTranslation } from 'react-i18next';

class ErrorBoundary extends Component<{ children: ReactNode, t: any }, { hasError: boolean }> {
  constructor(props: { children: ReactNode, t: any }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Viewer Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-400 p-8 text-center rounded-xl border border-zinc-800">
          <AlertTriangle size={48} className="text-amber-500 mb-4" />
          <h3 className="text-lg font-bold text-zinc-200 mb-2">{t('app.viewerError')}</h3>
          <p className="text-sm max-w-md">
            {t('app.viewerErrorDesc')}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors"
          >
            {t('app.reloadPage')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Helper for Z conversion (matching geometry.ts)
const convertZValue = (z: number, isTimeScale: boolean, averageVelocity: number, exaggeration: number, directionUp: number, referenceZ?: number) => {
  let depth = isTimeScale ? (z * averageVelocity) / 2 : z;
  let val;
  if (referenceZ !== undefined) {
    const refDepth = isTimeScale ? (referenceZ * averageVelocity) / 2 : referenceZ;
    val = (depth - refDepth) * exaggeration + refDepth;
  } else {
    val = depth * exaggeration;
  }
  return val * directionUp;
};

// Helper for surface interpolation
function getSurfaceZAt(x: number, y: number, surface: THREE.Vector3[], gridWidth: number, gridHeight: number) {
  if (!surface || surface.length === 0) return 0;
  
  const minX = surface[0].x;
  const maxX = surface[gridWidth - 1].x;
  const minY = surface[0].y;
  const maxY = surface[surface.length - 1].y;

  if (x < minX || x > maxX || y < minY || y > maxY) {
    // Clamp to edges
    const cx = Math.max(minX, Math.min(maxX, x));
    const cy = Math.max(minY, Math.min(maxY, y));
    return getSurfaceZAt(cx, cy, surface, gridWidth, gridHeight);
  }

  const tx = (x - minX) / (maxX - minX) * (gridWidth - 1);
  const ty = (y - minY) / (maxY - minY) * (gridHeight - 1);

  const ix = Math.floor(tx);
  const iy = Math.floor(ty);
  const fx = tx - ix;
  const fy = ty - iy;

  const i00 = iy * gridWidth + ix;
  const i10 = iy * gridWidth + Math.min(ix + 1, gridWidth - 1);
  const i01 = Math.min(iy + 1, gridHeight - 1) * gridWidth + ix;
  const i11 = Math.min(iy + 1, gridHeight - 1) * gridWidth + Math.min(ix + 1, gridWidth - 1);

  const z00 = surface[i00].z;
  const z10 = surface[i10].z;
  const z01 = surface[i01].z;
  const z11 = surface[i11].z;

  const z0 = z00 * (1 - fx) + z10 * fx;
  const z1 = z01 * (1 - fx) + z11 * fx;
  return z0 * (1 - fy) + z1 * fy;
}

// Helper to subdivide segments for better surface conformance
function subdividePoints(points: THREE.Vector3[], segmentsPerUnit: number = 0.1) {
  if (points.length < 2) return points;
  const newPoints: THREE.Vector3[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i+1];
    const dist = p1.distanceTo(p2);
    const numSubdivisions = Math.max(1, Math.floor(dist * segmentsPerUnit));
    for (let j = 0; j < numSubdivisions; j++) {
      newPoints.push(p1.clone().lerp(p2, j / numSubdivisions));
    }
  }
  newPoints.push(points[points.length - 1].clone());
  return newPoints;
}

// 2D Line Clipping (Cohen-Sutherland)
function computeOutCode(x: number, y: number, minX: number, maxX: number, minY: number, maxY: number) {
  let code = 0;
  if (x < minX) code |= 1;
  else if (x > maxX) code |= 2;
  if (y < minY) code |= 4;
  else if (y > maxY) code |= 8;
  return code;
}

function clipSegmentToBox(p1: THREE.Vector3, p2: THREE.Vector3, minX: number, maxX: number, minY: number, maxY: number): THREE.Vector3[] {
  let x0 = p1.x, y0 = p1.y, z0 = p1.z;
  let x1 = p2.x, y1 = p2.y, z1 = p2.z;

  let outcode0 = computeOutCode(x0, y0, minX, maxX, minY, maxY);
  let outcode1 = computeOutCode(x1, y1, minX, maxX, minY, maxY);
  let accept = false;

  while (true) {
    if (!(outcode0 | outcode1)) {
      accept = true;
      break;
    } else if (outcode0 & outcode1) {
      break; // Outside
    } else {
      let x = 0, y = 0, z = 0;
      let outcodeOut = outcode0 ? outcode0 : outcode1;

      if (outcodeOut & 8) { // top
        x = x0 + (x1 - x0) * (maxY - y0) / (y1 - y0);
        y = maxY;
        z = z0 + (z1 - z0) * (maxY - y0) / (y1 - y0);
      } else if (outcodeOut & 4) { // bottom
        x = x0 + (x1 - x0) * (minY - y0) / (y1 - y0);
        y = minY;
        z = z0 + (z1 - z0) * (minY - y0) / (y1 - y0);
      } else if (outcodeOut & 2) { // right
        y = y0 + (y1 - y0) * (maxX - x0) / (x1 - x0);
        x = maxX;
        z = z0 + (z1 - z0) * (maxX - x0) / (x1 - x0);
      } else if (outcodeOut & 1) { // left
        y = y0 + (y1 - y0) * (minX - x0) / (x1 - x0);
        x = minX;
        z = z0 + (z1 - z0) * (minX - x0) / (x1 - x0);
      }

      if (outcodeOut === outcode0) {
        x0 = x; y0 = y; z0 = z;
        outcode0 = computeOutCode(x0, y0, minX, maxX, minY, maxY);
      } else {
        x1 = x; y1 = y; z1 = z;
        outcode1 = computeOutCode(x1, y1, minX, maxX, minY, maxY);
      }
    }
  }
  if (accept) {
    return [new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)];
  }
  return [];
}

function PuzzleLayer({
  topSurface,
  bottomSurface,
  gridWidth,
  gridHeight,
  clearanceTop,
  clearanceBottom,
  exaggeration,
  isTimeScale,
  averageVelocity,
  color,
  showWireframe,
  colorMap,
  smoothOptions,
  referenceZ,
  bottomZFixed,
  directionUp,
  name,
  faults,
  faultWidth,
  showFaults,
  embossLabels,
  labelNumber,
  labelSize,
  labelThickness,
  labelX,
  globalMaxTextSize,
  scaleX,
  scaleZ
}: {
  topSurface: THREE.Vector3[];
  bottomSurface: THREE.Vector3[];
  gridWidth: number;
  gridHeight: number;
  clearanceTop: number;
  clearanceBottom: number;
  exaggeration: number;
  isTimeScale: boolean;
  averageVelocity: number;
  color: string;
  showWireframe: boolean;
  colorMap: 'none' | 'rainbow' | 'viridis' | 'magma';
  smoothOptions?: { enabled: boolean; iterations: number };
  referenceZ?: number;
  bottomZFixed?: number;
  directionUp: number;
  name?: string;
  faults: Fault[];
  faultWidth: number;
  showFaults: boolean;
  embossLabels: boolean;
  labelNumber?: number;
  labelSize?: number;
  labelThickness?: number;
  labelX?: number;
  globalMaxTextSize?: number;
  scaleX: number;
  scaleZ: number;
}) {
  const geometry = useMemo(() => {
    const geom = createLayerGeometry(
      gridWidth,
      gridHeight,
      topSurface,
      bottomSurface,
      clearanceTop,
      clearanceBottom,
      exaggeration,
      isTimeScale,
      averageVelocity,
      smoothOptions,
      referenceZ,
      bottomZFixed,
      directionUp
    );

    if (colorMap !== 'none') {
      const positions = geom.getAttribute('position');
      const colors = [];
      let minZ = Infinity;
      let maxZ = -Infinity;

      for (let i = 0; i < positions.count; i++) {
        const z = positions.getZ(i);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }

      const range = maxZ - minZ || 1;
      const colorObj = new THREE.Color();

      for (let i = 0; i < positions.count; i++) {
        const z = positions.getZ(i);
        const t = (z - minZ) / range;
        
        if (colorMap === 'rainbow') {
          colorObj.setHSL(0.7 * (1 - t), 1, 0.5);
        } else if (colorMap === 'viridis') {
          colorObj.setRGB(t, 1 - Math.abs(t - 0.5) * 2, 1 - t);
        } else {
          colorObj.setRGB(t, t * 0.5, 0.2);
        }
        
        colors.push(colorObj.r, colorObj.g, colorObj.b);
      }
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    return geom;
  }, [topSurface, bottomSurface, gridWidth, gridHeight, clearanceTop, clearanceBottom, exaggeration, isTimeScale, averageVelocity, colorMap, smoothOptions, referenceZ, bottomZFixed, directionUp]);

  const [font, setFont] = useState<any>(null);
  const [csgGeometry, setCsgGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    if (embossLabels) {
      loadFont().then(setFont).catch(err => console.error("Failed to load font", err));
    }
  }, [embossLabels]);

  useEffect(() => {
    if (!embossLabels || !font || labelNumber === undefined) {
      setCsgGeometry(null);
      return;
    }

    let isMounted = true;

    // We do the CSG in a separate effect to avoid blocking the main thread too much
    // and to handle the async nature of font loading
    const runCSG = async () => {
      geometry.computeBoundingBox();
      const gBox = geometry.boundingBox!;
      const gWidth = gBox.max.x - gBox.min.x;
      const southY = gBox.max.y;
      const marginX = 5 / scaleX;
      let marginZ = 2 / scaleZ;
      
      const initialX = labelX !== undefined ? labelX : gBox.max.x - marginX;
      const szBottomInit = getSurfaceZAt(initialX, southY, bottomSurface, gridWidth, gridHeight);
      const zBottomInit = bottomZFixed !== undefined ? bottomZFixed : convertZValue(szBottomInit, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) + clearanceBottom;
      const szTopInit = getSurfaceZAt(initialX, southY, topSurface, gridWidth, gridHeight);
      const zTopInit = convertZValue(szTopInit, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) - clearanceTop;
      const isDepthMode = directionUp < 0;
      const thickness = Math.abs(zBottomInit - zTopInit);

      const requestedTextSize = (labelSize || 2) / (scaleZ || 1);
      const minTextSize = 2 / (scaleZ || 1);
      const localMaxTextSize = Math.max(minTextSize, Math.min(gWidth * 0.15, thickness * 0.6));
      const maxTextSize = globalMaxTextSize !== undefined ? globalMaxTextSize : localMaxTextSize;
      let textSize = Math.min(requestedTextSize, maxTextSize);
      if (isNaN(textSize) || !isFinite(textSize)) textSize = 2 / (scaleZ || 1);
      
      let rawDepth = (labelThickness || 0.2) / (scaleZ || 1);
      if (isNaN(rawDepth) || !isFinite(rawDepth)) rawDepth = 0.2 / (scaleZ || 1);

      const textGeo = new TextGeometry(labelNumber.toString(), {
        font: font,
        size: textSize,
        depth: rawDepth * 2,
        curveSegments: 4,
        bevelEnabled: false
      });

      textGeo.computeBoundingBox();
      let tBox = textGeo.boundingBox!;
      let tWidth = tBox.max.x - tBox.min.x;
      let tHeight = tBox.max.y - tBox.min.y;
      let tDepth = tBox.max.z - tBox.min.z;

      textGeo.translate(-tBox.min.x - tWidth / 2, -tBox.min.y - tHeight / 2, -tBox.min.z - tDepth / 2);

      const dummy = new THREE.Object3D();
      const minPosX = gBox.min.x + marginX + tWidth / 2;
      const maxPosX = gBox.max.x - marginX - tWidth / 2;
      const posX = Math.max(minPosX, Math.min(maxPosX, initialX));
      
      const numSamples = 5;
      let safeTop = isDepthMode ? -Infinity : Infinity;
      let safeBottom = isDepthMode ? Infinity : -Infinity;

      for (let i = 0; i <= numSamples; i++) {
        const sampleX = posX - tWidth/2 + (tWidth * i / numSamples);
        const szB = getSurfaceZAt(sampleX, southY, bottomSurface, gridWidth, gridHeight);
        const zB = bottomZFixed !== undefined ? bottomZFixed : convertZValue(szB, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) + clearanceBottom;
        const szT = getSurfaceZAt(sampleX, southY, topSurface, gridWidth, gridHeight);
        const zT = convertZValue(szT, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) - clearanceTop;

        if (isDepthMode) {
          safeTop = Math.max(safeTop, zT);
          safeBottom = Math.min(safeBottom, zB);
        } else {
          safeTop = Math.min(safeTop, zT);
          safeBottom = Math.max(safeBottom, zB);
        }
      }

      let availableThickness = Math.abs(safeBottom - safeTop) - marginZ * 2;
      const availableWidth = (gBox.max.x - gBox.min.x) - marginX * 2;
      
      if (availableThickness <= 0.1) {
        const absoluteThickness = Math.abs(safeBottom - safeTop);
        availableThickness = Math.max(0.1, absoluteThickness * 0.8);
        marginZ = absoluteThickness * 0.1;
      }
      
      let scaleDown = 1;
      if (tHeight > availableThickness) scaleDown = Math.min(scaleDown, availableThickness / tHeight);
      if (tWidth > availableWidth && availableWidth > 0.1) scaleDown = Math.min(scaleDown, availableWidth / tWidth);
      
      if (scaleDown < 1) {
        textGeo.scale(scaleDown, scaleDown, scaleDown);
        textGeo.computeBoundingBox();
        tBox = textGeo.boundingBox!;
        tWidth = tBox.max.x - tBox.min.x;
        tHeight = tBox.max.y - tBox.min.y;
        tDepth = tBox.max.z - tBox.min.z;
        textGeo.translate(-tBox.min.x - tWidth / 2, -tBox.min.y - tHeight / 2, -tBox.min.z - tDepth / 2);
      }
      
      const finalMinPosX = gBox.min.x + marginX + tWidth / 2;
      const finalMaxPosX = gBox.max.x - marginX - tWidth / 2;
      const finalPosX = Math.max(finalMinPosX, Math.min(finalMaxPosX, posX));

      let posZ;
      if (isDepthMode) {
        posZ = safeBottom - marginZ - tHeight / 2;
        posZ = Math.max(safeTop + tHeight / 2 + marginZ, posZ);
      } else {
        posZ = safeBottom + marginZ + tHeight / 2;
        posZ = Math.min(safeTop - tHeight / 2 - marginZ, posZ);
      }
      
      dummy.position.set(finalPosX, southY, posZ);
      dummy.up.set(0, 0, isDepthMode ? -1 : 1);
      dummy.lookAt(finalPosX, southY + 1, posZ);
      dummy.updateMatrix();
      textGeo.applyMatrix4(dummy.matrix);

      try {
        const cleanGeometry = BufferGeometryUtils.mergeVertices(geometry, 0.05);
        const cleanTextGeo = BufferGeometryUtils.mergeVertices(textGeo, 0.05);
        
        const brush1 = new Brush(cleanGeometry);
        const brush2 = new Brush(cleanTextGeo);
        brush1.updateMatrixWorld(true);
        brush2.updateMatrixWorld(true);

        const evaluator = new Evaluator();
        evaluator.useGroups = false;
        const result = evaluator.evaluate(brush1, brush2, ADDITION);
        
        let finalGeom = result.geometry;
        finalGeom = BufferGeometryUtils.mergeVertices(finalGeom, 0.05);
        finalGeom.computeVertexNormals();

        if (geometry.hasAttribute('color')) {
          finalGeom.setAttribute('color', geometry.getAttribute('color')!);
        }

        if (isMounted) setCsgGeometry(finalGeom);
      } catch (err) {
        console.error("CSG failed for piece label", err);
        if (isMounted) setCsgGeometry(null);
      }
    };

    runCSG();

    return () => {
      isMounted = false;
    };
  }, [geometry, font, labelNumber, embossLabels, labelSize, labelThickness, scaleZ, scaleX, directionUp, labelX, bottomSurface, topSurface, gridWidth, gridHeight, isTimeScale, averageVelocity, exaggeration, referenceZ, clearanceBottom, clearanceTop, bottomZFixed]);

  const finalGeometry = csgGeometry || geometry;

  const faultTraces = useMemo(() => {
    if (!showFaults || !faults || faults.length === 0) return null;

    const minX = topSurface[0].x;
    const maxX = topSurface[gridWidth - 1].x;
    const minY = topSurface[0].y;
    const maxY = topSurface[topSurface.length - 1].y;
    const dataMaxDim = Math.max(maxX - minX, maxY - minY);

    const traces: React.ReactNode[] = [];
    // Thin tube radius for "drawn line" look (exportable)
    const tubeRadius = Math.max(0.15, (faultWidth / 1000) * dataMaxDim * 0.25);

    faults.forEach((fault) => {
      if (!fault.visible || fault.points.length < 2) return;

      // Subdivide for smooth surface following
      const subPoints = subdividePoints(fault.points, 1.0);
      
      // Clip the polyline to the bounding box
      const clippedSegments: THREE.Vector3[][] = [];
      let currentSegment: THREE.Vector3[] = [];
      const boundaryPoints: THREE.Vector3[] = []; // Points exactly on the boundary

      for (let i = 0; i < subPoints.length - 1; i++) {
        const p1 = subPoints[i];
        const p2 = subPoints[i + 1];
        const clipped = clipSegmentToBox(p1, p2, minX, maxX, minY, maxY);
        
        if (clipped.length === 2) {
          if (currentSegment.length === 0) {
            currentSegment.push(clipped[0]);
          } else {
            // Check if connected
            const lastPoint = currentSegment[currentSegment.length - 1];
            if (lastPoint.distanceTo(clipped[0]) > 0.001) {
              clippedSegments.push([...currentSegment]);
              currentSegment = [clipped[0]];
            }
          }
          currentSegment.push(clipped[1]);
        }
      }
      if (currentSegment.length > 0) {
        clippedSegments.push(currentSegment);
      }

      // Find boundary points from the clipped segments
      clippedSegments.forEach(segment => {
        const first = segment[0];
        const last = segment[segment.length - 1];
        
        const isFirstOnBoundary = Math.abs(first.x - minX) < 0.001 || Math.abs(first.x - maxX) < 0.001 || 
                                  Math.abs(first.y - minY) < 0.001 || Math.abs(first.y - maxY) < 0.001;
        const isLastOnBoundary = Math.abs(last.x - minX) < 0.001 || Math.abs(last.x - maxX) < 0.001 || 
                                 Math.abs(last.y - minY) < 0.001 || Math.abs(last.y - maxY) < 0.001;
                                 
        if (isFirstOnBoundary && !boundaryPoints.some(bp => bp.distanceTo(first) < 0.001)) {
          boundaryPoints.push(first);
        }
        if (isLastOnBoundary && !boundaryPoints.some(bp => bp.distanceTo(last) < 0.001)) {
          boundaryPoints.push(last);
        }
      });

      // 1. Top Surface Trace
      clippedSegments.forEach((segment, segIdx) => {
        const topPoints: THREE.Vector3[] = [];
        segment.forEach(p => {
          const sz = getSurfaceZAt(p.x, p.y, topSurface, gridWidth, gridHeight);
          const z = convertZValue(sz, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) - clearanceTop;
          topPoints.push(new THREE.Vector3(p.x, p.y, z + 0.1));
        });

        if (topPoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(topPoints);
          traces.push(
            <mesh key={`fault-top-${fault.id}-${segIdx}`} castShadow receiveShadow name={`Fault_${fault.id}`}>
              <tubeGeometry args={[curve, Math.max(2, topPoints.length), tubeRadius, 6, false]} />
              <meshStandardMaterial color={fault.color} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          );
        }
      });

      // 2. Bottom Surface Trace
      clippedSegments.forEach((segment, segIdx) => {
        const bottomPoints: THREE.Vector3[] = [];
        segment.forEach(p => {
          const sz = getSurfaceZAt(p.x, p.y, bottomSurface, gridWidth, gridHeight);
          const z = bottomZFixed !== undefined ? bottomZFixed : convertZValue(sz, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) + clearanceBottom;
          bottomPoints.push(new THREE.Vector3(p.x, p.y, z - 0.1));
        });

        if (bottomPoints.length >= 2) {
          const curve = new THREE.CatmullRomCurve3(bottomPoints);
          traces.push(
            <mesh key={`fault-bottom-${fault.id}-${segIdx}`} castShadow receiveShadow name={`Fault_${fault.id}`}>
              <tubeGeometry args={[curve, Math.max(2, bottomPoints.length), tubeRadius, 6, false]} />
              <meshStandardMaterial color={fault.color} polygonOffset polygonOffsetFactor={-1} />
            </mesh>
          );
        }
      });

      // 3. Wall Traces (Vertical lines at boundary intersections)
      boundaryPoints.forEach((bp, bpIdx) => {
        const szTop = getSurfaceZAt(bp.x, bp.y, topSurface, gridWidth, gridHeight);
        const szBottom = getSurfaceZAt(bp.x, bp.y, bottomSurface, gridWidth, gridHeight);
        
        const zTop = convertZValue(szTop, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) - clearanceTop;
        const zBottom = bottomZFixed !== undefined ? bottomZFixed : convertZValue(szBottom, isTimeScale, averageVelocity, exaggeration, directionUp, referenceZ) + clearanceBottom;
        
        // We no longer check if the fault's Z is within this specific layer's Z range.
        // If a fault stick intersects the X/Y boundary of the model, we assume it's a 
        // vertical/sub-vertical plane that cuts through all layers at that X/Y coordinate.
        // This ensures the fault trace is visible on the walls of all pieces it passes through.
        
        // Offset slightly outward based on which wall it's on to avoid z-fighting
        let ox = 0, oy = 0;
        if (Math.abs(bp.x - minX) < 0.001) ox = -0.1;
        else if (Math.abs(bp.x - maxX) < 0.001) ox = 0.1;
        if (Math.abs(bp.y - minY) < 0.001) oy = -0.1;
        else if (Math.abs(bp.y - maxY) < 0.001) oy = 0.1;

        const wallPoints = [
          new THREE.Vector3(bp.x + ox, bp.y + oy, zTop),
          new THREE.Vector3(bp.x + ox, bp.y + oy, zBottom)
        ];

        const curve = new THREE.CatmullRomCurve3(wallPoints);
        traces.push(
          <mesh key={`fault-wall-v-${fault.id}-${bpIdx}`} castShadow receiveShadow name={`Fault_${fault.id}`}>
            <tubeGeometry args={[curve, 2, tubeRadius, 6, false]} />
            <meshStandardMaterial color={fault.color} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
        );
      });
    });

    return traces;
  }, [faults, faultWidth, showFaults, topSurface, bottomSurface, gridWidth, gridHeight, clearanceTop, clearanceBottom, exaggeration, isTimeScale, averageVelocity, directionUp, referenceZ, bottomZFixed]);

  return (
    <group>
      <mesh geometry={finalGeometry} castShadow receiveShadow name={name}>
        <meshStandardMaterial 
          color={colorMap === 'none' ? color : '#ffffff'} 
          vertexColors={colorMap !== 'none'}
          roughness={0.7} 
          metalness={0.05} 
          side={THREE.DoubleSide} 
          wireframe={showWireframe}
          flatShading={false}
        />
      </mesh>
      {faultTraces}
    </group>
  );
}

export function Scene({ groupRef }: { groupRef: React.RefObject<THREE.Group> }) {
  const { t } = useTranslation();
  const { surfaces, surfaceNames, visibleSurfaces, visibleLayers, layerColors, gridWidth, gridHeight, isTimeScale, averageVelocity, verticalExaggeration, clearance, rotationX, rotationY, rotationZ, modelSizeMm, forceSquare, baseThicknessMm, cropXMin, cropXMax, cropYMin, cropYMax, showWireframe, explodedView, colorMap, smoothMesh, smoothIterations, showBasePlate, basePlateTitle, basePlateSubtitle, basePlateColor, basePlatePadding, basePlateThicknessMm, basePlateTextRelief, basePieceName, lightingIntensity, faults, faultWidth, showFaults, embossLabels, labelSize, labelThickness } = useAppStore();

  if (surfaces.length === 0) return null;

  // Apply Cropping
  const startX = Math.floor((cropXMin / 100) * (gridWidth - 1));
  const endX = Math.ceil((cropXMax / 100) * (gridWidth - 1));
  const startY = Math.floor((cropYMin / 100) * (gridHeight - 1));
  const endY = Math.ceil((cropYMax / 100) * (gridHeight - 1));

  const croppedGridWidth = Math.max(2, endX - startX + 1);
  const croppedGridHeight = Math.max(2, endY - startY + 1);

  const croppedSurfaces = surfaces.map(surface => {
    const cropped = [];
    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        cropped.push(surface[y * gridWidth + x]);
      }
    }
    return cropped;
  });

  // Recalculate dimensions for scaling based on cropped data
  const firstSurf = croppedSurfaces[0];
  const minX = Math.min(...firstSurf.map(p => p.x));
  const maxX = Math.max(...firstSurf.map(p => p.x));
  const minY = Math.min(...firstSurf.map(p => p.y));
  const maxY = Math.max(...firstSurf.map(p => p.y));
  
  const croppedDataWidth = maxX - minX;
  const croppedDataHeight = maxY - minY;
  const croppedDataMaxDim = Math.max(croppedDataWidth, croppedDataHeight);

  const scaleFactor = croppedDataMaxDim > 0 ? modelSizeMm / croppedDataMaxDim : 1;
  const scaleX = (forceSquare && croppedDataWidth > 0) ? (modelSizeMm / croppedDataWidth) : scaleFactor;
  const scaleY = (forceSquare && croppedDataHeight > 0) ? (modelSizeMm / croppedDataHeight) : scaleFactor;
  const scaleZ = scaleFactor;

  const rawClearance = clearance / scaleZ;
  const rawBaseThickness = baseThicknessMm / scaleZ;

  // Determine direction and reference Z for stable exaggeration
  const convertZRaw = (z: number) => {
    return isTimeScale ? (z * averageVelocity) / 2 : z;
  };
  const firstZ = convertZRaw(croppedSurfaces[0][0].z);
  const secondZ = convertZRaw(croppedSurfaces[1]?.[0]?.z ?? firstZ + 1);
  const directionUp = Math.sign(firstZ - secondZ) || -1;

  const lastSurf = croppedSurfaces[croppedSurfaces.length - 1];
  const refRawZ = directionUp < 0 
    ? Math.max(...lastSurf.map(p => p.z))
    : Math.min(...lastSurf.map(p => p.z));
  
  const exaggerationRefZ = refRawZ;
  const refDepth = isTimeScale ? (exaggerationRefZ * averageVelocity) / 2 : exaggerationRefZ;
  const refDepthConverted = refDepth * directionUp;

  // Prepare all surfaces including the flat base
  const allSurfaces = [...croppedSurfaces];
  
  // We want the bottom plane to be at a fixed distance from the reference point
  // regardless of exaggeration.
  // The reference point's exaggerated position is refDepthConverted.
  // In depth mode (directionUp < 0), "down" is negative Z.
  // In elevation mode (directionUp > 0), "down" is negative Z (relative to top).
  // Actually, we just want it to be below the last surface.
  const bottomZFixedValue = refDepthConverted - rawBaseThickness;
  
  // We still need a surface for the "bottom" to define the layer
  const flatBaseSurface = lastSurf.map(p => new THREE.Vector3(p.x, p.y, refRawZ));
  allSurfaces.push(flatBaseSurface);

  const layers = [];
  const numLayers = allSurfaces.length - 1;

  // Calculate best label positions and global max text size
  const labelPositions: { x: number, maxThickness: number }[] = [];
  let minOfMaxThicknesses = Infinity;

  if (embossLabels) {
    for (let i = 0; i < numLayers; i++) {
      if (i < visibleLayers.length && !visibleLayers[i]) {
        labelPositions.push({ x: (minX + maxX) / 2, maxThickness: Infinity });
        continue;
      }
      
      const topSurface = allSurfaces[i];
      const bottomSurface = allSurfaces[i+1];
      
      let bestX = (minX + maxX) / 2;
      let maxThickness = 0;
      
      // Sample along the South wall (y = maxY)
      const samples = 50;
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        // Leave a 15% margin on edges to avoid placing text too close to the corners
        const x = minX + (maxX - minX) * (0.15 + 0.7 * t);
        
        const szT = getSurfaceZAt(x, maxY, topSurface, croppedGridWidth, croppedGridHeight);
        const zT = convertZValue(szT, isTimeScale, averageVelocity, verticalExaggeration, directionUp, exaggerationRefZ) - (i === 0 ? 0 : rawClearance / 2);
        
        let zB;
        if (i === numLayers - 1) {
          zB = bottomZFixedValue;
        } else {
          const szB = getSurfaceZAt(x, maxY, bottomSurface, croppedGridWidth, croppedGridHeight);
          zB = convertZValue(szB, isTimeScale, averageVelocity, verticalExaggeration, directionUp, exaggerationRefZ) + (i === numLayers - 1 ? 0 : rawClearance / 2);
        }
        
        const thickness = Math.abs(zB - zT);
        if (thickness > maxThickness) {
          maxThickness = thickness;
          bestX = x;
        }
      }
      
      labelPositions.push({ x: bestX, maxThickness });
      if (maxThickness < minOfMaxThicknesses) {
        minOfMaxThicknesses = maxThickness;
      }
    }
  }
  
  const globalMaxTextSize = minOfMaxThicknesses === Infinity ? undefined : minOfMaxThicknesses * 0.6;

  for (let i = 0; i < numLayers; i++) {
    // A layer exists between allSurfaces[i] and allSurfaces[i+1]
    // Layer i is visible if visibleLayers[i] is true
    if (i < visibleLayers.length && !visibleLayers[i]) continue;
    
    const topSurface = allSurfaces[i];
    const bottomSurface = allSurfaces[i+1];
    
    // Top layer has no top clearance, bottom layer has no bottom clearance
    const clearanceTop = i === 0 ? 0 : rawClearance / 2;
    const clearanceBottom = i === numLayers - 1 ? 0 : rawClearance / 2;

    const isFlatBaseLayer = i === numLayers - 1;
    
    const layerColor = layerColors[i] || '#3b82f6';
    const layerName = isFlatBaseLayer ? `Layer_Base` : `Layer_${i + 1}`;
    
    let labelNumber: number | undefined = undefined;
    let labelX: number | undefined = undefined;
    if (embossLabels) {
      labelNumber = numLayers - i;
      labelX = labelPositions[i]?.x;
    }

    // Exploded view offset
    const explodedOffset = explodedView ? (numLayers - 1 - i) * (modelSizeMm * 0.2) / scaleZ : 0;

    layers.push(
      <group key={`layer-group-${i}`} position={[0, 0, explodedOffset]}>
        <PuzzleLayer
          key={`layer-${i}-${colorMap}-${layerColor}-${labelNumber}-${labelSize}-${labelThickness}-${labelX}-${globalMaxTextSize}`}
          name={layerName}
          labelNumber={labelNumber}
          labelSize={labelSize}
          labelThickness={labelThickness}
          labelX={labelX}
          globalMaxTextSize={globalMaxTextSize}
          scaleX={scaleX}
          scaleZ={scaleZ}
          topSurface={topSurface}
          bottomSurface={bottomSurface}
          gridWidth={croppedGridWidth}
          gridHeight={croppedGridHeight}
          clearanceTop={clearanceTop}
          clearanceBottom={clearanceBottom}
          exaggeration={verticalExaggeration}
          isTimeScale={isTimeScale}
          averageVelocity={averageVelocity}
          color={layerColor}
          smoothOptions={{
            enabled: smoothMesh,
            iterations: smoothIterations
          }}
          showWireframe={showWireframe}
          colorMap={colorMap}
          referenceZ={exaggerationRefZ}
          bottomZFixed={isFlatBaseLayer ? bottomZFixedValue : undefined}
          directionUp={directionUp}
          faults={faults}
          faultWidth={faultWidth}
          showFaults={showFaults}
          embossLabels={embossLabels}
        />
      </group>
    );
  }

  // Base Plate
  if (showBasePlate) {
    const userPaddingX = basePlatePadding / scaleX;
    const userPaddingY = basePlatePadding / scaleY;

    const textScale = 1 / scaleX; // Adjust text size to be readable
    const textRelief = basePlateTextRelief / scaleZ;

    const maxLegendNameLength = Math.max(0, ...surfaceNames.slice(0, visibleLayers.length).filter((_, i) => visibleLayers[i]).map(n => n.length));
    const requiredLegendWidth = (4 + maxLegendNameLength * 3 * 0.75 + 8) * textScale;
    const requiredLegendHeight = visibleLayers.filter(Boolean).length * 6 * textScale;

    const titleWidth = (basePlateTitle.length * 8 * 0.75) * textScale;
    const subtitleWidth = (basePlateSubtitle.length * 4 * 0.75) * textScale;
    const requiredTitleWidth = Math.max(titleWidth, subtitleWidth) + 8 * textScale;
    const requiredTitleHeight = (basePlateTitle ? 10 * textScale : 0) + (basePlateSubtitle ? 6 * textScale : 0);

    const actualPaddingTop = Math.max(userPaddingY, requiredLegendHeight + 8 * textScale);
    const actualPaddingBottom = Math.max(userPaddingY, requiredTitleHeight + 8 * textScale);
    
    // Ensure the base plate is wide enough for the text
    const minRequiredWidth = Math.max(requiredLegendWidth, requiredTitleWidth) + 8 * textScale;
    const currentWidth = croppedDataWidth + userPaddingX * 2;
    
    let actualPaddingLeft = userPaddingX;
    let actualPaddingRight = userPaddingX;
    
    if (currentWidth < minRequiredWidth) {
      const extra = minRequiredWidth - currentWidth;
      // Distribute extra width to keep puzzle centered if possible, or just add to right
      actualPaddingRight += extra;
    }

    const bpWidth = croppedDataWidth + actualPaddingLeft + actualPaddingRight;
    const bpHeight = croppedDataHeight + actualPaddingTop + actualPaddingBottom;
    const bpThickness = basePlateThicknessMm / scaleZ;
    
    const modelBaseTopSurface = allSurfaces[allSurfaces.length - 2];
    const modelBaseBottomSurface = allSurfaces[allSurfaces.length - 1];
    
    const convertZ = (z: number) => {
      let depth = isTimeScale ? (z * averageVelocity) / 2 : z;
      return (depth - refDepth) * verticalExaggeration + refDepth;
    };
    
    // The flat base has a constant Z (it's bottomZFixedValue)
    const baseZ = bottomZFixedValue!;
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const bpCenterX = centerX + (actualPaddingRight - actualPaddingLeft) / 2;
    const bpCenterY = centerY + (actualPaddingTop - actualPaddingBottom) / 2;
    
    const bpExplodedOffset = explodedView ? - (modelSizeMm * 0.2) / scaleZ : 0;
    
    // The base plate should always be below the model base
    const centerZ = baseZ - (bpThickness / 2) + bpExplodedOffset;

    const fontUrl = 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json';

    const textStartX = -bpWidth / 2 + 4 * textScale;
    const textZ = bpThickness / 2;

    layers.push(
      <group key="base-plate" position={[bpCenterX, bpCenterY, centerZ]}>
        <mesh receiveShadow castShadow name="Base_Suporte">
          <boxGeometry args={[bpWidth, bpHeight, bpThickness]} />
          <meshStandardMaterial color={basePlateColor} roughness={0.9} />
        </mesh>
        
        {/* Title Text */}
        {basePlateTitle && (
          <group position={[textStartX, -bpHeight / 2 + (basePlateSubtitle ? 10 * textScale : 4 * textScale), textZ]}>
            <Text3D 
              name="Texto_Titulo"
              font={fontUrl} 
              size={8 * textScale} 
              height={textRelief} 
              curveSegments={12}
              rotation={[0, 0, 0]}
            >
              {basePlateTitle}
              <meshStandardMaterial color="#ffffff" />
            </Text3D>
          </group>
        )}

        {/* Subtitle Text */}
        {basePlateSubtitle && (
          <group position={[textStartX, -bpHeight / 2 + 4 * textScale, textZ]}>
            <Text3D 
              name="Texto_Subtitulo"
              font={fontUrl} 
              size={4 * textScale} 
              height={textRelief} 
              curveSegments={12}
              rotation={[0, 0, 0]}
            >
              {basePlateSubtitle}
              <meshStandardMaterial color="#cccccc" />
            </Text3D>
          </group>
        )}
        
        {/* Legend */}
        <group position={[textStartX, bpHeight / 2 - 8 * textScale, textZ]}>
          {visibleLayers.map((visible, idx) => {
            if (!visible) return null;
            const isBaseLayer = idx === visibleLayers.length - 1;
            const name = isBaseLayer ? basePieceName : (surfaceNames[idx] || `${t('app.piece')} ${idx + 1}`);
            const color = layerColors[idx] || '#ffffff';
            
            return (
              <group key={`legend-${idx}`} position={[0, -idx * 6 * textScale, 0]}>
                <mesh position={[0, 2 * textScale, textRelief / 2]} name={`${t('app.legendColor')}_${idx + 1}`}>
                  <boxGeometry args={[4 * textScale, 4 * textScale, textRelief]} />
                  <meshStandardMaterial color={color} />
                </mesh>
                <Text3D 
                  name={`${t('app.legendText')}_${idx + 1}`}
                  font={fontUrl} 
                  size={3 * textScale} 
                  height={textRelief} 
                  position={[4 * textScale, 0, 0]}
                >
                  {name}
                  <meshStandardMaterial color="#ffffff" />
                </Text3D>
              </group>
            );
          })}
        </group>
      </group>
    );
  }

  return (
    <group ref={groupRef} rotation={[rotationX * Math.PI / 180, rotationY * Math.PI / 180, rotationZ * Math.PI / 180]} scale={[scaleX, scaleY, scaleZ]}>
      <Center>
        {layers}
      </Center>
    </group>
  );
}

function CameraController({ viewTrigger, viewType }: { viewTrigger: number, viewType: string }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);
  const { modelSizeMm, lastUpdate } = useAppStore();

  useEffect(() => {
    if (!controlsRef.current) return;
    
    // d is the distance from target (0,0,0)
    // We want the distance to be proportional to the model size.
    // A distance of 1.8x to 2x the model size is usually good for a full view.
    const d = modelSizeMm * 1.8;
    
    // With camera.up = [0, 0, 1], Z is the vertical axis.
    if (viewType === 'top') {
      // Looking down from +Z. Add tiny Y offset to avoid gimbal lock with Z-up.
      camera.position.set(0, 0.01, d);
    } else if (viewType === 'front') {
      // Looking from -Y axis, we see X-Z section.
      camera.position.set(0, -d, 0); 
    } else if (viewType === 'iso') {
      camera.position.set(d * 0.7, -d * 0.7, d * 0.7);
    }

    camera.lookAt(0, 0, 0);
    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, [viewTrigger, viewType, camera, modelSizeMm, lastUpdate]);

  return (
    <OrbitControls 
      ref={controlsRef} 
      makeDefault 
      enableDamping 
      dampingFactor={0.1} 
      rotateSpeed={0.8}
      minDistance={modelSizeMm * 0.2}
      maxDistance={modelSizeMm * 20}
    />
  );
}

const ViewerInternal = ({ groupRef }: { groupRef: React.RefObject<THREE.Group> }) => {
  const { t } = useTranslation();
  const [viewTrigger, setViewTrigger] = useState(0);
  const [viewType, setViewType] = useState('iso');
  const [showLightingSlider, setShowLightingSlider] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { theme, lightingIntensity, setLightingIntensity, basePlateColor, surfaces, lastUpdate } = useAppStore();

  const handleViewChange = (type: string) => {
    setViewType(type);
    setViewTrigger(prev => prev + 1);
  };

  const doExportSTL = () => handleExportSTL(groupRef);
  const doExport3MF = () => handleExport3MF(groupRef, basePlateColor);
  const doExportZIP = () => handleExportZIP(groupRef);

  return (
    <div className={`w-full flex-1 min-h-0 relative rounded-xl overflow-hidden shadow-inner border transition-colors duration-300 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'}`}>
      {/* Toolbar de Câmera */}
      <div className={`absolute top-4 right-4 z-10 flex flex-col gap-2 p-1.5 rounded-lg border backdrop-blur-sm shadow-lg transition-colors ${theme === 'dark' ? 'bg-zinc-800/90 border-zinc-700/50' : 'bg-white/90 border-zinc-200'}`}>
        <button onClick={() => handleViewChange('top')} className={`p-2 rounded transition-colors ${theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`} title={t('app.viewTop')}>
          <Square size={20} />
        </button>
        <button onClick={() => handleViewChange('front')} className={`p-2 rounded transition-colors ${theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`} title={t('app.viewFront')}>
          <div className="w-5 h-5 flex items-center justify-center">
            <div className="w-full h-1.5 bg-current rounded-sm" />
          </div>
        </button>
        <button onClick={() => handleViewChange('iso')} className={`p-2 rounded transition-colors ${theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`} title={t('app.viewIso')}>
          <Box size={20} />
        </button>
        
        <div className={`h-px my-1 mx-2 ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-200'}`} />
        
        <button onClick={doExport3MF} className="p-2 bg-blue-600 hover:bg-blue-500 rounded text-white transition-colors shadow-md flex items-center justify-center" title={t('app.export3mfDesc')}>
          <FileCode size={20} />
        </button>
        <button onClick={doExportZIP} className={`p-2 rounded transition-colors ${theme === 'dark' ? 'hover:bg-purple-900/40 text-purple-500 hover:text-purple-400' : 'hover:bg-purple-50 text-purple-600 hover:text-purple-700'}`} title={t('app.exportZipDesc')}>
          <Archive size={20} />
        </button>
        <button onClick={doExportSTL} className={`p-2 rounded transition-colors ${theme === 'dark' ? 'hover:bg-emerald-900/40 text-emerald-500 hover:text-emerald-400' : 'hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700'}`} title={t('app.exportStlDesc')}>
          <Download size={20} />
        </button>

        <div className={`h-px my-1 mx-2 ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-200'}`} />

        <div className="relative group/light">
          <button 
            onClick={() => setShowLightingSlider(!showLightingSlider)} 
            className={`p-2 rounded transition-colors ${showLightingSlider ? 'bg-amber-500/20 text-amber-500' : (theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900')}`}
            title={t('app.adjustLighting')}
          >
            <Sun size={20} />
          </button>
          
          {showLightingSlider && (
            <div className={`absolute right-full mr-4 top-0 p-3 rounded-lg border shadow-xl backdrop-blur-sm flex flex-col gap-2 min-w-[150px] transition-colors ${theme === 'dark' ? 'bg-zinc-800/95 border-zinc-700' : 'bg-white/95 border-zinc-200'}`}>
              <div className="flex justify-between items-center">
                <span className={`text-[10px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.brightness')}</span>
                <span className="text-[10px] font-mono text-amber-500">{Math.round(lightingIntensity * 100)}%</span>
              </div>
              <input 
                type="range" 
                min="0.1" 
                max="2" 
                step="0.1" 
                value={lightingIntensity} 
                onChange={(e) => setLightingIntensity(parseFloat(e.target.value))}
                className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-500 ${theme === 'dark' ? 'bg-zinc-700' : 'bg-zinc-200'}`}
              />
            </div>
          )}
        </div>

        <button 
          onClick={() => setShowHelp(true)} 
          className={`p-2 rounded transition-colors ${theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`}
          title={t('app.help')}
        >
          <HelpCircle size={20} />
        </button>
      </div>

      {/* Modal de Ajuda */}
      {showHelp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
          <div className={`border rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200 ${theme === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'}`}>
            <div className={`p-4 border-b flex justify-between items-center ${theme === 'dark' ? 'bg-zinc-800/50 border-zinc-800' : 'bg-zinc-50 border-zinc-100'}`}>
              <div className={`flex items-center gap-2 font-semibold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                <Info size={18} className="text-blue-400" />
                <span>{t('app.bambuGuide')}</span>
              </div>
              <button onClick={() => setShowHelp(false)} className={`p-1 rounded-full transition-colors ${theme === 'dark' ? 'hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100' : 'hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900'}`}>
                <X size={20} />
              </button>
            </div>
            
            <div className={`p-6 space-y-4 overflow-y-auto max-h-[70vh] ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}`}>
              <section className="space-y-2">
                <h4 className={`text-sm font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">1</div>
                  {t('app.recommendedExport')}
                </h4>
                <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`} dangerouslySetInnerHTML={{ __html: t('app.recommendedExportDesc') }} />
              </section>

              <section className="space-y-2">
                <h4 className={`text-sm font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">2</div>
                  {t('app.whenOpeningBambu')}
                </h4>
                <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {t('app.bambuAsk')} <br/>
                  <span className={`italic ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{t('app.loadAsSingle')}</span>
                </p>
                <div className={`p-3 border rounded-lg ${theme === 'dark' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'}`}>
                  <p className={`text-xs font-bold ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {t('app.selectNo')}
                  </p>
                  <p className={`text-[10px] mt-1 ${theme === 'dark' ? 'text-emerald-500/80' : 'text-emerald-600'}`}>
                    {t('app.autoArrangeDesc')}
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <h4 className={`text-sm font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-800'}`}>
                  <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">3</div>
                  {t('app.coloringLegend')}
                </h4>
                <p className={`text-xs leading-relaxed ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`} dangerouslySetInnerHTML={{ __html: t('app.splitToPartsDesc') }} />
              </section>
            </div>

            <div className={`p-4 border-t flex justify-end ${theme === 'dark' ? 'bg-zinc-800/30 border-zinc-800' : 'bg-zinc-50/50 border-zinc-100'}`}>
              <button 
                onClick={() => setShowHelp(false)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${theme === 'dark' ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-100' : 'bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-900'}`}
              >
                {t('app.gotIt')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Canvas 
        camera={{ position: [150, -150, 150], fov: 45, far: 50000, up: [0, 0, 1] }} 
        shadows={{ type: THREE.PCFShadowMap }}
        gl={{ antialias: true, toneMappingExposure: 1.0 }}
        style={{ width: '100%', height: '100%' }}
      >
        <color attach="background" args={[theme === 'dark' ? '#18181b' : '#f4f4f5']} />
        
        {/* Configuração de Iluminação Uniforme e Estática */}
        <ambientLight intensity={0.5 * lightingIntensity} />
        
        {/* Luz Principal (Frontal Direita Superior) */}
        <directionalLight 
          position={[300, 300, 400]} 
          intensity={1.2 * lightingIntensity} 
          castShadow 
          shadow-mapSize={[1024, 1024]}
        />
        
        {/* Luz de Preenchimento (Frontal Esquerda) */}
        <directionalLight 
          position={[-300, 200, 200]} 
          intensity={0.6 * lightingIntensity} 
        />
        
        {/* Luz de Contra (Traseira) */}
        <directionalLight 
          position={[0, -400, 100]} 
          intensity={0.4 * lightingIntensity} 
        />
        
        {/* Luz de Base (Inferior) */}
        <directionalLight 
          position={[0, 0, -300]} 
          intensity={0.3 * lightingIntensity} 
        />

        {/* Ponto de brilho extra para destacar texturas */}
        <pointLight 
          position={[100, 100, 500]} 
          intensity={0.5 * lightingIntensity} 
          distance={2000}
          decay={2}
        />
        
        <React.Suspense fallback={null}>
          <Scene key={`scene-${surfaces.length}-${lastUpdate}`} groupRef={groupRef} />
        </React.Suspense>
        
        <CameraController viewTrigger={viewTrigger} viewType={viewType} />
        <Environment preset={theme === 'dark' ? 'studio' : 'city'} />
      </Canvas>
    </div>
  );
}

export function Viewer(props: any) {
  const { t } = useTranslation();
  const { theme } = useAppStore();
  
  return (
    <div className={`w-full h-full flex flex-col transition-colors duration-300 ${theme === 'dark' ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
      <ErrorBoundary t={t}>
        <ViewerInternal {...props} />
      </ErrorBoundary>
    </div>
  );
}

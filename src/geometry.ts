import * as THREE from 'three';

import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function createLayerGeometry(
  gridWidth: number,
  gridHeight: number,
  pointsTop: THREE.Vector3[],
  pointsBottom: THREE.Vector3[],
  clearanceTop: number,
  clearanceBottom: number,
  exaggeration: number,
  isTimeScale: boolean,
  averageVelocity: number,
  smoothOptions?: { enabled: boolean; iterations: number },
  referenceZ?: number,
  bottomZFixed?: number,
  textureType?: string,
  directionUp: number = -1
) {
  const vertices = [];
  const uvs = [];
  const indices = [];

  const convertZ = (z: number) => {
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

  function getTactileDisplacement(x: number, y: number, z: number, type?: string): THREE.Vector3 {
    if (!type || type === 'none') return new THREE.Vector3(0, 0, 0);
    
    // Use normalized-ish coordinates for consistent pattern scale
    const nx = x * 0.8;
    const ny = y * 0.8;
    // Use a relative Z to keep pattern consistent across layers
    const nz = (z - (referenceZ || 0)) * 0.5;

    const amp = 2.5; 

    if (type === 'rough') {
      const noise = (Math.sin(nx * 1.5) * Math.cos(ny * 1.5) * Math.sin(nz * 1.5));
      return new THREE.Vector3(noise * amp * 0.5, noise * amp * 0.5, noise * amp * 0.5);
    }
    if (type === 'dotted') {
      const dot = Math.sin(nx) * Math.sin(ny) * Math.sin(nz);
      const val = dot > 0.3 ? amp : 0;
      return new THREE.Vector3(val * 0.4, val * 0.4, val * 0.8);
    }
    if (type === 'striped') {
      const val = Math.sin(nx + ny + nz) * amp;
      return new THREE.Vector3(val * 0.5, val * 0.5, val * 0.5);
    }
    if (type === 'grid') {
      const gX = Math.sin(nx);
      const gY = Math.sin(ny);
      const gZ = Math.sin(nz);
      const val = (Math.abs(gX) > 0.8 || Math.abs(gY) > 0.8 || Math.abs(gZ) > 0.8) ? amp * 0.6 : 0;
      return new THREE.Vector3(val * 0.4, val * 0.4, val * 0.4);
    }
    return new THREE.Vector3(0, 0, 0);
  }

  function smoothSurface(points: THREE.Vector3[], width: number, height: number, iterations: number) {
    let currentPoints = points.map(p => p.clone());
    for (let iter = 0; iter < iterations; iter++) {
      const nextPoints = currentPoints.map(p => p.clone());
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let sumZ = 0;
          let count = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                sumZ += currentPoints[ny * width + nx].z;
                count++;
              }
            }
          }
          nextPoints[y * width + x].z = sumZ / count;
        }
      }
      currentPoints = nextPoints;
    }
    return currentPoints;
  }

  const finalPointsTop = (smoothOptions?.enabled && smoothOptions.iterations > 0) 
    ? smoothSurface(pointsTop, gridWidth, gridHeight, smoothOptions.iterations)
    : pointsTop;
    
  const finalPointsBottom = (smoothOptions?.enabled && smoothOptions.iterations > 0)
    ? smoothSurface(pointsBottom, gridWidth, gridHeight, smoothOptions.iterations)
    : pointsBottom;

  const sign = directionUp < 0 ? -1 : 1;

  // Add Top Vertices
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x;
      const p = finalPointsTop[idx];
      const rawZ = convertZ(p.z) - sign * clearanceTop;
      const disp = getTactileDisplacement(x, y, rawZ, textureType);
      vertices.push(p.x + disp.x, p.y + disp.y, rawZ + disp.z);
      uvs.push(x / (gridWidth - 1), y / (gridHeight - 1));
    }
  }

  // Add Bottom Vertices
  const bottomOffset = vertices.length / 3;
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x;
      const p = finalPointsBottom[idx];
      const rawZ = bottomZFixed !== undefined ? bottomZFixed : convertZ(p.z) + sign * clearanceBottom;
      const disp = bottomZFixed !== undefined ? new THREE.Vector3(0, 0, 0) : getTactileDisplacement(x, y, rawZ, textureType);
      vertices.push(p.x + disp.x, p.y + disp.y, rawZ + disp.z);
      uvs.push(x / (gridWidth - 1), y / (gridHeight - 1));
    }
  }

  // Top faces
  for (let y = 0; y < gridHeight - 1; y++) {
    for (let x = 0; x < gridWidth - 1; x++) {
      const a = x + gridWidth * y;
      const b = x + 1 + gridWidth * y;
      const c = x + gridWidth * (y + 1);
      const d = x + 1 + gridWidth * (y + 1);
      indices.push(a, b, d);
      indices.push(a, d, c);
    }
  }

  // Bottom faces (reversed)
  for (let y = 0; y < gridHeight - 1; y++) {
    for (let x = 0; x < gridWidth - 1; x++) {
      const a = bottomOffset + x + gridWidth * y;
      const b = bottomOffset + x + 1 + gridWidth * y;
      const c = bottomOffset + x + gridWidth * (y + 1);
      const d = bottomOffset + x + 1 + gridWidth * (y + 1);
      indices.push(a, d, b);
      indices.push(a, c, d);
    }
  }

  // Side walls with vertical subdivision
  const wallSubdivisions = textureType !== 'none' ? 4 : 1;
  
  const addWall = (p1Top: THREE.Vector3, p2Top: THREE.Vector3, p1Bottom: THREE.Vector3, p2Bottom: THREE.Vector3, x1: number, y1: number, x2: number, y2: number) => {
    const wallStartIdx = vertices.length / 3;
    
    for (let s = 0; s <= wallSubdivisions; s++) {
      const t = s / wallSubdivisions;
      for (let i = 0; i < 2; i++) {
        const pTop = i === 0 ? p1Top : p2Top;
        const pBottom = i === 0 ? p1Bottom : p2Bottom;
        const curX = i === 0 ? x1 : x2;
        const curY = i === 0 ? y1 : y2;
        
        const rawZTop = convertZ(pTop.z) - sign * clearanceTop;
        const rawZBottom = bottomZFixed !== undefined ? bottomZFixed : convertZ(pBottom.z) + sign * clearanceBottom;
        
        const rawZ = rawZTop * (1 - t) + rawZBottom * t;
        const rawX = pTop.x * (1 - t) + pBottom.x * t;
        const rawY = pTop.y * (1 - t) + pBottom.y * t;
        
        const disp = (bottomZFixed !== undefined && t === 1) ? new THREE.Vector3(0, 0, 0) : getTactileDisplacement(curX, curY, rawZ, textureType);
        
        vertices.push(rawX + disp.x, rawY + disp.y, rawZ + disp.z);
        uvs.push(i, t);
      }
    }
    
    for (let s = 0; s < wallSubdivisions; s++) {
      const r0 = wallStartIdx + s * 2;
      const r1 = wallStartIdx + (s + 1) * 2;
      // CCW winding: bottom-left -> bottom-right -> top-right -> top-left
      // r1 is bottom (t=s+1), r0 is top (t=s)
      indices.push(r1, r1 + 1, r0 + 1);
      indices.push(r1, r0 + 1, r0);
    }
  };

  // Bottom edge (y = 0)
  for (let x = 0; x < gridWidth - 1; x++) {
    addWall(finalPointsTop[x], finalPointsTop[x+1], finalPointsBottom[x], finalPointsBottom[x+1], x, 0, x+1, 0);
  }
  // Top edge (y = gridHeight - 1)
  for (let x = 0; x < gridWidth - 1; x++) {
    const offsetRow = gridWidth * (gridHeight - 1);
    addWall(finalPointsTop[offsetRow + x + 1], finalPointsTop[offsetRow + x], finalPointsBottom[offsetRow + x + 1], finalPointsBottom[offsetRow + x], x+1, gridHeight-1, x, gridHeight-1);
  }
  // Left edge (x = 0)
  for (let y = 0; y < gridHeight - 1; y++) {
    addWall(finalPointsTop[gridWidth * (y + 1)], finalPointsTop[gridWidth * y], finalPointsBottom[gridWidth * (y + 1)], finalPointsBottom[gridWidth * y], 0, y+1, 0, y);
  }
  // Right edge (x = gridWidth - 1)
  for (let y = 0; y < gridHeight - 1; y++) {
    const offsetCol = gridWidth - 1;
    addWall(finalPointsTop[offsetCol + gridWidth * y], finalPointsTop[offsetCol + gridWidth * (y + 1)], finalPointsBottom[offsetCol + gridWidth * y], finalPointsBottom[offsetCol + gridWidth * (y + 1)], gridWidth-1, y, gridWidth-1, y+1);
  }

  let geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  
  // Merge vertices to ensure the mesh is manifold (watertight)
  // Use a slightly larger tolerance to handle potential floating point noise in large raw units
  geometry = BufferGeometryUtils.mergeVertices(geometry, 0.1);
  
  geometry.computeVertexNormals();

  return geometry;
}

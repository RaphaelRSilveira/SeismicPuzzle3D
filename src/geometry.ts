import * as THREE from 'three';

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
  bottomZFixed?: number
) {
  const vertices = [];
  const uvs = [];
  const indices = [];

  const convertZ = (z: number) => {
    let depth = isTimeScale ? (z * averageVelocity) / 2 : z;
    if (referenceZ !== undefined) {
      const refDepth = isTimeScale ? (referenceZ * averageVelocity) / 2 : referenceZ;
      return (depth - refDepth) * exaggeration + refDepth;
    }
    return depth * exaggeration;
  };

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

  // Add Top Vertices
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x;
      const p = finalPointsTop[idx];
      vertices.push(p.x, p.y, convertZ(p.z) - clearanceTop);
      uvs.push(x / (gridWidth - 1), y / (gridHeight - 1));
    }
  }

  // Add Bottom Vertices
  const offset = pointsTop.length;
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const idx = y * gridWidth + x;
      const p = finalPointsBottom[idx];
      const z = bottomZFixed !== undefined ? bottomZFixed : convertZ(p.z);
      vertices.push(p.x, p.y, z + clearanceBottom);
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
      const a = offset + x + gridWidth * y;
      const b = offset + x + 1 + gridWidth * y;
      const c = offset + x + gridWidth * (y + 1);
      const d = offset + x + 1 + gridWidth * (y + 1);

      indices.push(a, d, b);
      indices.push(a, c, d);
    }
  }

  // Side walls
  // Bottom edge (y = 0)
  for (let x = 0; x < gridWidth - 1; x++) {
    const t1 = x;
    const t2 = x + 1;
    const b1 = offset + x;
    const b2 = offset + x + 1;
    indices.push(t1, b1, b2);
    indices.push(t1, b2, t2);
  }

  // Top edge (y = gridHeight - 1)
  for (let x = 0; x < gridWidth - 1; x++) {
    const t1 = x + gridWidth * (gridHeight - 1);
    const t2 = x + 1 + gridWidth * (gridHeight - 1);
    const b1 = offset + x + gridWidth * (gridHeight - 1);
    const b2 = offset + x + 1 + gridWidth * (gridHeight - 1);
    indices.push(t1, t2, b2);
    indices.push(t1, b2, b1);
  }

  // Left edge (x = 0)
  for (let y = 0; y < gridHeight - 1; y++) {
    const t1 = gridWidth * y;
    const t2 = gridWidth * (y + 1);
    const b1 = offset + gridWidth * y;
    const b2 = offset + gridWidth * (y + 1);
    indices.push(t1, t2, b2);
    indices.push(t1, b2, b1);
  }

  // Right edge (x = gridWidth - 1)
  for (let y = 0; y < gridHeight - 1; y++) {
    const t1 = gridWidth - 1 + gridWidth * y;
    const t2 = gridWidth - 1 + gridWidth * (y + 1);
    const b1 = offset + gridWidth - 1 + gridWidth * y;
    const b2 = offset + gridWidth - 1 + gridWidth * (y + 1);
    indices.push(t1, b1, b2);
    indices.push(t1, b2, t2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

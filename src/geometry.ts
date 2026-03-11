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
  pinOptions?: { radius: number; height: number; show: boolean; scale: number; showPin?: boolean; showHole?: boolean },
  smoothOptions?: { enabled: boolean; iterations: number }
) {
  const vertices = [];
  const uvs = [];
  const indices = [];

  const convertZ = (z: number) => {
    let depth = isTimeScale ? (z * averageVelocity) / 2 : z;
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
      vertices.push(p.x, p.y, convertZ(p.z) + clearanceBottom);
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

  // Add Alignment Pins/Holes
  if (pinOptions?.show) {
    const { radius, height, scale, showPin = true, showHole = true } = pinOptions;
    
    // Position pins at the 4 corners (inset a bit)
    const inset = 0.15;
    const cornerIndices = [
      { x: Math.floor(gridWidth * inset), y: Math.floor(gridHeight * inset) },
      { x: Math.floor(gridWidth * (1 - inset)), y: Math.floor(gridHeight * inset) },
      { x: Math.floor(gridWidth * inset), y: Math.floor(gridHeight * (1 - inset)) },
      { x: Math.floor(gridWidth * (1 - inset)), y: Math.floor(gridHeight * (1 - inset)) }
    ];

    cornerIndices.forEach(corner => {
      const idx = corner.y * gridWidth + corner.x;
      const pTop = finalPointsTop[idx];
      const pBottom = finalPointsBottom[idx];
      
      const pinSegments = 16;
      const localThickness = Math.abs(convertZ(pTop.z) - convertZ(pBottom.z));
      
      // Limit pin/hole height to 60% of the local layer thickness to avoid piercing
      const maxSafeHeight = localThickness * 0.6;
      const nominalPinHeight = height / scale;
      const actualPinHeight = Math.min(nominalPinHeight, maxSafeHeight);
      const actualHoleHeight = actualPinHeight * 1.1;

      // 1. Add Pin to Top Surface (to fit into the piece above)
      if (showPin) {
        const pinRadius = radius / scale;
        const topZ = convertZ(pTop.z) - clearanceTop;
        
        const pinStartIdx = vertices.length / 3;
        
        // Create a simple cylinder at (pTop.x, pTop.y, topZ)
        for (let i = 0; i <= pinSegments; i++) {
          const theta = (i / pinSegments) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          
          // Bottom of pin
          vertices.push(pTop.x + cos * pinRadius, pTop.y + sin * pinRadius, topZ);
          uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
          
          // Top of pin
          vertices.push(pTop.x + cos * pinRadius, pTop.y + sin * pinRadius, topZ + actualPinHeight);
          uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
        }
        
        // Pin side faces
        for (let i = 0; i < pinSegments; i++) {
          const b1 = pinStartIdx + i * 2;
          const t1 = pinStartIdx + i * 2 + 1;
          const b2 = pinStartIdx + (i + 1) * 2;
          const t2 = pinStartIdx + (i + 1) * 2 + 1;
          indices.push(b1, b2, t2);
          indices.push(b1, t2, t1);
        }
        
        // Pin top cap
        const topCapCenterIdx = vertices.length / 3;
        vertices.push(pTop.x, pTop.y, topZ + actualPinHeight);
        uvs.push(0.5, 0.5);
        for (let i = 0; i < pinSegments; i++) {
          const t1 = pinStartIdx + i * 2 + 1;
          const t2 = pinStartIdx + (i + 1) * 2 + 1;
          indices.push(topCapCenterIdx, t1, t2);
        }
      }

      // 2. Add Hole to Bottom Surface (to receive pin from piece below)
      if (showHole) {
        const holeRadius = (radius / scale) * 1.15; // 15% larger for tolerance
        const bottomZ = convertZ(pBottom.z) + clearanceBottom;
        // Make hole entry slightly recessed to be visible in preview
        const holeEntryZ = bottomZ - 0.1; 
        
        const holeStartIdx = vertices.length / 3;
        
        for (let i = 0; i <= pinSegments; i++) {
          const theta = (i / pinSegments) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          
          // Bottom of hole (entry)
          vertices.push(pBottom.x + cos * holeRadius, pBottom.y + sin * holeRadius, holeEntryZ);
          uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
          
          // Top of hole (inside)
          vertices.push(pBottom.x + cos * holeRadius, pBottom.y + sin * holeRadius, bottomZ + actualHoleHeight);
          uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
        }
        
        // Hole side faces (inverted normals)
        for (let i = 0; i < pinSegments; i++) {
          const b1 = holeStartIdx + i * 2;
          const t1 = holeStartIdx + i * 2 + 1;
          const b2 = holeStartIdx + (i + 1) * 2;
          const t2 = holeStartIdx + (i + 1) * 2 + 1;
          indices.push(b1, t2, b2);
          indices.push(b1, t1, t2);
        }
        
        // Hole top cap (inside, inverted)
        const holeCapCenterIdx = vertices.length / 3;
        vertices.push(pBottom.x, pBottom.y, bottomZ + actualHoleHeight);
        uvs.push(0.5, 0.5);
        for (let i = 0; i < pinSegments; i++) {
          const t1 = holeStartIdx + i * 2 + 1;
          const t2 = holeStartIdx + (i + 1) * 2 + 1;
          indices.push(holeCapCenterIdx, t2, t1);
        }

        // Add a visible "rim" for the hole entry so it's noticeable in preview
        const rimStartIdx = vertices.length / 3;
        const rimRadius = holeRadius * 1.2;
        for (let i = 0; i <= pinSegments; i++) {
          const theta = (i / pinSegments) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          vertices.push(pBottom.x + cos * rimRadius, pBottom.y + sin * rimRadius, bottomZ);
          uvs.push(0.5 + cos * 0.5, 0.5 + sin * 0.5);
        }
        for (let i = 0; i < pinSegments; i++) {
          const r1 = rimStartIdx + i;
          const r2 = rimStartIdx + i + 1;
          const h1 = holeStartIdx + i * 2;
          const h2 = holeStartIdx + (i + 1) * 2;
          indices.push(r1, h1, h2);
          indices.push(r1, h2, r2);
        }
      }
    });
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
}

import * as THREE from 'three';

export interface ParsedSurface {
  points: THREE.Vector3[];
  minZ: number;
  maxZ: number;
  name?: string;
}

export function parseFile(text: string): ParsedSurface[] {
  const surfaces: ParsedSurface[] = [];
  
  // 1. GOCAD GSurf (Grid Surface)
  if (text.includes('GOCAD GSurf')) {
    const blocks = text.split('GOCAD GSurf');
    for (const block of blocks) {
      if (!block.trim() || !block.includes('DATA')) continue;
      const lines = block.split('\n');
      const points: THREE.Vector3[] = [];
      let minZ = Infinity, maxZ = -Infinity;
      let surfaceName = 'Horizon';
      let origin = new THREE.Vector3(0, 0, 0);
      let axisU = new THREE.Vector3(1, 0, 0), axisV = new THREE.Vector3(0, 1, 0);
      let axisN = { u: 1, v: 1 };
      let noDataValue = -1000000;
      let zInverted = false;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('name:')) surfaceName = trimmed.split('name:')[1].trim();
        else if (trimmed.startsWith('ZPOSITIVE Depth')) zInverted = true;
        else if (trimmed.startsWith('ORIGIN')) {
          const p = trimmed.split(/\s+/);
          origin.set(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
        } else if (trimmed.startsWith('AXIS_U')) {
          const p = trimmed.split(/\s+/);
          axisU.set(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
        } else if (trimmed.startsWith('AXIS_V')) {
          const p = trimmed.split(/\s+/);
          axisV.set(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
        } else if (trimmed.startsWith('AXIS_N')) {
          const p = trimmed.split(/\s+/);
          axisN.u = parseInt(p[1]); axisN.v = parseInt(p[2]);
        } else if (trimmed.startsWith('PROP_NO_DATA_VALUE')) {
          noDataValue = parseFloat(trimmed.split(/\s+/)[2]);
        } else if (trimmed.startsWith('DATA')) {
          const p = trimmed.split(/\s+/);
          const u = parseInt(p[1]), v = parseInt(p[2]), z = parseFloat(p[3]);
          if (z !== noDataValue && !isNaN(z)) {
            const uF = axisN.u > 1 ? u / (axisN.u - 1) : 0;
            const vF = axisN.v > 1 ? v / (axisN.v - 1) : 0;
            const x = origin.x + uF * axisU.x + vF * axisV.x;
            const y = origin.y + uF * axisU.y + vF * axisV.y;
            let realZ = origin.z + uF * axisU.z + vF * axisV.z + z;
            if (zInverted) realZ = -realZ;
            points.push(new THREE.Vector3(x, y, realZ));
            minZ = Math.min(minZ, realZ); maxZ = Math.max(maxZ, realZ);
          }
        }
      }
      if (points.length > 0) surfaces.push({ points, minZ, maxZ, name: surfaceName });
    }
    return surfaces;
  }

  // 2. GOCAD TSurf (Triangulated Surface)
  if (text.includes('GOCAD TSurf')) {
    const blocks = text.split('GOCAD TSurf');
    for (const block of blocks) {
      if (!block.trim() || !block.includes('VRTX')) continue;
      const lines = block.split('\n');
      const points: THREE.Vector3[] = [];
      let minZ = Infinity, maxZ = -Infinity;
      let surfaceName = 'Horizon';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('name:')) surfaceName = trimmed.split('name:')[1].trim();
        else if (trimmed.startsWith('VRTX')) {
          const p = trimmed.split(/\s+/);
          const x = parseFloat(p[2]), y = parseFloat(p[3]), z = parseFloat(p[4]);
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            points.push(new THREE.Vector3(x, y, z));
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          }
        }
      }
      if (points.length > 0) surfaces.push({ points, minZ, maxZ, name: surfaceName });
    }
    return surfaces;
  }

  // 3. IRAP ASCII GRID
  if (text.includes('IRAP ASCII GRID')) {
    const lines = text.split('\n');
    const header = lines[1].trim().split(/\s+/);
    const nx = parseInt(header[0]), ny = parseInt(header[1]);
    const xmin = parseFloat(header[2]), xmax = parseFloat(header[3]);
    const ymin = parseFloat(header[4]), ymax = parseFloat(header[5]);
    const noData = 9999999.000;
    const points: THREE.Vector3[] = [];
    let minZ = Infinity, maxZ = -Infinity;
    
    const dx = (xmax - xmin) / (nx - 1);
    const dy = (ymax - ymin) / (ny - 1);
    
    let currentLine = 2;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        while (currentLine < lines.length && !lines[currentLine].trim()) currentLine++;
        if (currentLine >= lines.length) break;
        const zValues = lines[currentLine].trim().split(/\s+/);
        for (const zStr of zValues) {
          const z = parseFloat(zStr);
          if (z < noData) {
            const x = xmin + i * dx;
            const y = ymin + j * dy;
            points.push(new THREE.Vector3(x, y, z));
            minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
          }
          i++;
          if (i >= nx) break;
        }
        i--; // Adjust for inner loop increment
        currentLine++;
      }
    }
    if (points.length > 0) surfaces.push({ points, minZ, maxZ });
    return surfaces;
  }

  // 4. ZMAP GRID
  if (text.includes('ZMAP GRID') || text.includes('! Z-MAP')) {
    const lines = text.split('\n');
    let nx = 0, ny = 0, xmin = 0, xmax = 0, ymin = 0, ymax = 0, noData = '1e30';
    let dataStart = 0;
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const l = lines[i].trim();
      if (l.startsWith('@GRID')) {
        const p = lines[i+1].split(/[\s,]+/);
        nx = parseInt(p[1]); ny = parseInt(p[2]);
      }
      if (l.startsWith('@EXTENTS')) {
        const p = lines[i+1].split(/[\s,]+/);
        xmin = parseFloat(p[0]); xmax = parseFloat(p[1]);
        ymin = parseFloat(p[2]); ymax = parseFloat(p[3]);
      }
      if (l.startsWith('@NO_DATA')) noData = lines[i+1].trim();
      if (l.startsWith('@DATA')) { dataStart = i + 1; break; }
    }
    if (nx > 0 && ny > 0) {
      const points: THREE.Vector3[] = [];
      let minZ = Infinity, maxZ = -Infinity;
      const dx = (xmax - xmin) / (nx - 1);
      const dy = (ymax - ymin) / (ny - 1);
      let count = 0;
      for (let i = dataStart; i < lines.length; i++) {
        const vals = lines[i].trim().split(/\s+/);
        for (const v of vals) {
          if (v !== noData) {
            const z = parseFloat(v);
            const ix = count % nx;
            const iy = Math.floor(count / nx);
            if (iy < ny) {
              const x = xmin + ix * dx;
              const y = ymin + iy * dy;
              points.push(new THREE.Vector3(x, y, z));
              minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
            }
          }
          count++;
        }
      }
      if (points.length > 0) surfaces.push({ points, minZ, maxZ });
      return surfaces;
    }
  }

  // 5. CPS3 GRID
  if (text.includes('CPS3') || text.includes('FSURF')) {
    // Basic CPS3 detection and parsing...
  }

  // Fallback: Generic ASCII (X Y Z or Inline Crossline X Y Z)
  const lines = text.split('\n');
  const points: THREE.Vector3[] = [];
  let minZ = Infinity, maxZ = -Infinity;
  let surfaceName = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Try to extract name from Petrel or other headers
    if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
      if (trimmed.toLowerCase().includes('name:')) {
        surfaceName = trimmed.split(/name:/i)[1].trim();
      }
      continue;
    }
    
    if (trimmed.startsWith('*')) continue;

    const p = trimmed.split(/[\s,;]+/);
    let x, y, z;
    
    // Detect column order if possible or use heuristics
    if (p.length >= 5) { // Likely: Inline Crossline X Y Z
      x = parseFloat(p[2]); y = parseFloat(p[3]); z = parseFloat(p[4]);
    } else if (p.length >= 3) { // Likely: X Y Z
      x = parseFloat(p[0]); y = parseFloat(p[1]); z = parseFloat(p[2]);
    } else continue;

    if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
      points.push(new THREE.Vector3(x, y, z));
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
  }
  if (points.length > 0) surfaces.push({ points, minZ, maxZ, name: surfaceName || undefined });
  return surfaces;
}

export function createCommonGrid(surfaces: THREE.Vector3[][], resolution = 60) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const surface of surfaces) {
    for (const p of surface) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  
  // Safety check for empty or invalid data
  if (minX === Infinity) return { griddedSurfaces: [], gridWidth: 0, gridHeight: 0 };

  const gridWidth = resolution;
  const gridHeight = resolution;
  
  const stepX = (maxX - minX) / (gridWidth - 1);
  const stepY = (maxY - minY) / (gridHeight - 1);
  
  const griddedSurfaces = surfaces.map(surface => {
    const grid: THREE.Vector3[] = [];
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const px = minX + x * stepX;
        const py = minY + y * stepY;
        grid.push(new THREE.Vector3(px, py, 0));
      }
    }
    
    // Use a spatial hash or simple grid binning for faster interpolation
    const cellSums = new Float32Array(gridWidth * gridHeight);
    const cellCounts = new Int32Array(gridWidth * gridHeight);
    
    for (const p of surface) {
      const cx = Math.round((p.x - minX) / stepX);
      const cy = Math.round((p.y - minY) / stepY);
      if (cx >= 0 && cx < gridWidth && cy >= 0 && cy < gridHeight) {
        const idx = cx + cy * gridWidth;
        cellSums[idx] += p.z;
        cellCounts[idx] += 1;
      }
    }
    
    for (let i = 0; i < grid.length; i++) {
      if (cellCounts[i] > 0) {
        grid[i].z = cellSums[i] / cellCounts[i];
      }
    }
    
    // Fill holes using a multi-pass approach or simple search
    const finalGrid = [...grid];
    const filled = new Uint8Array(grid.length);
    for(let i=0; i<grid.length; i++) if(cellCounts[i] > 0) filled[i] = 1;

    let holesToFill = grid.length - filled.reduce((a, b) => a + b, 0);
    let iterations = 0;
    
    while (holesToFill > 0 && iterations < 10) {
      const nextFilled = new Uint8Array(filled);
      for (let i = 0; i < grid.length; i++) {
        if (filled[i] === 0) {
          let sum = 0;
          let count = 0;
          const cx = i % gridWidth;
          const cy = Math.floor(i / gridWidth);
          
          // Check 8 neighbors
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = cx + dx;
              const ny = cy + dy;
              if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
                const nidx = nx + ny * gridWidth;
                if (filled[nidx] === 1) {
                  sum += finalGrid[nidx].z;
                  count++;
                }
              }
            }
          }
          
          if (count > 0) {
            finalGrid[i].z = sum / count;
            nextFilled[i] = 1;
            holesToFill--;
          }
        }
      }
      filled.set(nextFilled);
      iterations++;
    }
    
    // Final pass for any remaining large holes (global average or nearest)
    if (holesToFill > 0) {
        const avgZ = surface.reduce((s, p) => s + p.z, 0) / surface.length;
        for(let i=0; i<grid.length; i++) {
            if(filled[i] === 0) finalGrid[i].z = avgZ;
        }
    }

    return finalGrid;
  });
  
  return { griddedSurfaces, gridWidth, gridHeight };
}

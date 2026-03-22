import JSZip from 'jszip';
import * as THREE from 'three';

/**
 * Exports multiple geometries to a single 3MF file.
 * 3MF is a modern 3D printing format that supports multiple objects, 
 * units, and metadata, making it ideal for Bambu Studio.
 */
export async function exportTo3MF(geometries: THREE.BufferGeometry[], names: string[], colors: string[], groupIds?: number[]) {
  const zip = new JSZip();
  
  // 1. [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`);

  // 2. _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`);

  // 3. 3D/3dmodel.model
  const modelParts: string[] = [];
  modelParts.push(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">Seismic Puzzle 3D</metadata>
  <metadata name="Description">Exported from Seismic Puzzle 3D Viewer</metadata>
  <resources>`);

  // Define base materials for colors
  modelParts.push(`    <basematerials id="1">`);
  colors.forEach((color, idx) => {
    // Ensure color is in #RRGGBB format
    const hex = color.startsWith('#') ? color : `#${color}`;
    modelParts.push(`      <base name="Material ${idx}" displaycolor="${hex.toUpperCase()}" />`);
  });
  modelParts.push(`    </basematerials>`);

  // Find global min Z to translate model to bed (Z=0)
  let globalMinZ = Infinity;
  geometries.forEach(geom => {
    const pos = geom.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      if (z < globalMinZ) globalMinZ = z;
    }
  });

  if (globalMinZ === Infinity) globalMinZ = 0;

  geometries.forEach((geom, index) => {
    const name = names[index] || `Object ${index + 1}`;
    const position = geom.getAttribute('position');
    const indexAttr = geom.getIndex();
    const objectId = index + 2;
    const materialId = 1;
    const materialIndex = index;

    modelParts.push(`    <object id="${objectId}" type="model">
      <metadata name="Name">${name}</metadata>
      <mesh>
        <vertices>`);

    // Vertices
    const vertices: string[] = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i).toFixed(4);
      const y = position.getY(i).toFixed(4);
      const z = (position.getZ(i) - globalMinZ).toFixed(4);
      vertices.push(`          <vertex x="${x}" y="${y}" z="${z}" />`);
    }
    modelParts.push(vertices.join('\n'));

    modelParts.push(`        </vertices>
        <triangles>`);

    // Triangles with material assignment
    const triangles: string[] = [];
    if (indexAttr) {
      for (let i = 0; i < indexAttr.count; i += 3) {
        const v1 = Math.round(indexAttr.array[i]);
        const v2 = Math.round(indexAttr.array[i + 1]);
        const v3 = Math.round(indexAttr.array[i + 2]);
        triangles.push(`          <triangle v1="${v1}" v2="${v2}" v3="${v3}" pid="${materialId}" p1="${materialIndex}" />`);
      }
    } else {
      for (let i = 0; i < position.count; i += 3) {
        triangles.push(`          <triangle v1="${i}" v2="${i + 1}" v3="${i + 2}" pid="${materialId}" p1="${materialIndex}" />`);
      }
    }
    modelParts.push(triangles.join('\n'));

    modelParts.push(`        </triangles>
      </mesh>
    </object>`);
  });

  // Handle groups
  const nextObjectId = geometries.length + 2;
  const groups = new Map<number, number[]>();
  
  if (groupIds) {
    groupIds.forEach((groupId, index) => {
      if (groupId !== undefined && groupId !== null) {
        if (!groups.has(groupId)) {
          groups.set(groupId, []);
        }
        groups.get(groupId)!.push(index + 2); // objectId
      }
    });
  }

  let currentGroupId = nextObjectId;
  const groupObjectIds = new Map<number, number>();

  groups.forEach((objectIds, groupId) => {
    modelParts.push(`    <object id="${currentGroupId}" type="model">
      <metadata name="Name">Group ${groupId}</metadata>
      <components>`);
    
    objectIds.forEach(objId => {
      modelParts.push(`        <component objectid="${objId}" />`);
    });
    
    modelParts.push(`      </components>
    </object>`);
    
    groupObjectIds.set(groupId, currentGroupId);
    currentGroupId++;
  });

  modelParts.push(`  </resources>
  <build>`);

  geometries.forEach((_, index) => {
    const objId = index + 2;
    let isGrouped = false;
    
    if (groupIds && groupIds[index] !== undefined && groupIds[index] !== null) {
      isGrouped = true;
    }
    
    // Only add to build if it's not part of a group
    if (!isGrouped) {
      modelParts.push(`    <item objectid="${objId}" />`);
    }
  });

  // Add groups to build
  groupObjectIds.forEach((groupObjId) => {
    modelParts.push(`    <item objectid="${groupObjId}" />`);
  });

  modelParts.push(`  </build>
</model>`);

  zip.file('3D/3dmodel.model', modelParts.join('\n'));

  // Generate ZIP with DEFLATE compression for better compatibility
  const content = await zip.generateAsync({ 
    type: 'blob',
    compression: "DEFLATE",
    compressionOptions: {
      level: 6 // Balanced speed/size
    }
  });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = 'seismic_puzzle.3mf';
  link.click();
}

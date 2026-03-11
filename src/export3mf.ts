import JSZip from 'jszip';
import * as THREE from 'three';

export async function exportTo3MF(geometries: THREE.BufferGeometry[], names: string[]) {
  const zip = new JSZip();

  // 1. [Content_Types].xml
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
</Types>`;
  zip.file('[Content_Types].xml', contentTypes);

  // 2. _rels/.rels
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
  zip.file('_rels/.rels', rels);

  // 3. 3D/3dmodel.model
  const modelParts: string[] = [];
  modelParts.push(`<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Copyright">SeismicPuzzle3D</metadata>
  <resources>
`);

  geometries.forEach((geom, index) => {
    const position = geom.getAttribute('position');
    const indexAttr = geom.getIndex();
    if (!position || !indexAttr) return;

    const name = names[index] || `Layer ${index + 1}`;
    modelParts.push(`    <object id="${index + 1}" type="model" name="${name}">
      <mesh>
        <vertices>
`);
    
    for (let i = 0; i < position.count; i++) {
      modelParts.push(`          <vertex x="${position.getX(i).toFixed(4)}" y="${position.getY(i).toFixed(4)}" z="${position.getZ(i).toFixed(4)}" />\n`);
    }
    
    modelParts.push(`        </vertices>
        <triangles>
`);
    
    for (let i = 0; i < indexAttr.count; i += 3) {
      modelParts.push(`          <triangle v1="${indexAttr.getX(i)}" v2="${indexAttr.getX(i + 1)}" v3="${indexAttr.getX(i + 2)}" />\n`);
    }
    
    modelParts.push(`        </triangles>
      </mesh>
    </object>\n`);
  });

  modelParts.push(`  </resources>
  <build>
`);
  
  geometries.forEach((_, index) => {
    modelParts.push(`    <item objectid="${index + 1}" />\n`);
  });
  
  modelParts.push(`  </build>
</model>`);

  zip.file('3D/3dmodel.model', modelParts.join(''));

  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = 'seismic_puzzle.3mf';
  link.click();
}

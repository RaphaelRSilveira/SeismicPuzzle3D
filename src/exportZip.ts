import JSZip from 'jszip';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export async function exportToZIP(geometries: THREE.BufferGeometry[], names: string[]) {
  const zip = new JSZip();
  const exporter = new STLExporter();

  geometries.forEach((geom, index) => {
    const mesh = new THREE.Mesh(geom);
    mesh.updateMatrixWorld(true);
    
    const stlData = exporter.parse(mesh, { binary: true }) as DataView;
    
    // Sanitize name for filename
    let safeName = (names[index] || `Peca_${index + 1}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    // Use Uint8Array to safely get the correct slice of the buffer
    const uint8Array = new Uint8Array(stlData.buffer, stlData.byteOffset, stlData.byteLength);
    zip.file(`${safeName}.stl`, uint8Array);
  });

  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = 'seismic_puzzle_pecas.zip';
  link.click();
}

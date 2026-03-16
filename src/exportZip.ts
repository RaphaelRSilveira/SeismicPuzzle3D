import JSZip from 'jszip';
import * as THREE from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';

export async function exportToZIP(meshes: THREE.Mesh[], names: string[]) {
  const zip = new JSZip();
  const exporter = new STLExporter();

  meshes.forEach((mesh, index) => {
    // We need to clone the mesh to export it individually without affecting the scene
    const clone = mesh.clone();
    clone.applyMatrix4(mesh.matrixWorld);
    
    // Reset position/rotation/scale of the clone so it exports at the correct world position
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    clone.updateMatrixWorld(true);

    const stlData = exporter.parse(clone, { binary: true });
    
    // Sanitize name for filename
    let safeName = (names[index] || `Peca_${index + 1}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    zip.file(`${safeName}.stl`, stlData.buffer);
  });

  const content = await zip.generateAsync({ type: 'blob' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(content);
  link.download = 'seismic_puzzle_pecas.zip';
  link.click();
}

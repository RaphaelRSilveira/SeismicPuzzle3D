import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Evaluator, Brush, ADDITION } from 'three-bvh-csg';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { exportTo3MF } from './export3mf';
import { exportToZIP } from './exportZip';

function prepareGeometryForMerge(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  let geom = geometry.clone();
  
  // Remove all attributes except position and normal to ensure compatibility
  const attributesToRemove = [];
  for (const key in geom.attributes) {
    if (key !== 'position' && key !== 'normal') {
      attributesToRemove.push(key);
    }
  }
  for (const key of attributesToRemove) {
    geom.deleteAttribute(key);
  }
  
  if (!geom.getIndex()) {
    // mergeVertices generates an index if it doesn't exist
    geom = BufferGeometryUtils.mergeVertices(geom);
  }

  if (!geom.getAttribute('normal')) {
    geom.computeVertexNormals();
  }
  
  return geom;
}

export const handleExportSTL = async (groupRef: React.RefObject<THREE.Group>) => {
  if (!groupRef.current) return;
  
  // Ensure world matrices are up to date
  groupRef.current.updateWorldMatrix(true, true);
  
  const geometries: THREE.BufferGeometry[] = [];
  
  groupRef.current.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const geom = prepareGeometryForMerge(child.geometry);
      geom.applyMatrix4(child.matrixWorld);
      geometries.push(geom);
    }
  });

  if (geometries.length === 0) return;

  // For a single STL, we should ideally union everything to avoid non-manifold internal faces
  // but this can be very slow. We'll try to merge vertices at least.
  let finalGeom: THREE.BufferGeometry;
  
  if (geometries.length > 1) {
    // Try to union them if they are few, otherwise just merge
    if (geometries.length < 15) {
      try {
        const evaluator = new Evaluator();
        evaluator.useGroups = false;
        
        let resultBrush = new Brush(geometries[0]);
        for (let i = 1; i < geometries.length; i++) {
          const nextBrush = new Brush(geometries[i]);
          resultBrush = evaluator.evaluate(resultBrush, nextBrush, ADDITION);
        }
        finalGeom = resultBrush.geometry;
      } catch (err) {
        console.error("Full STL Union failed, falling back to merge", err);
        finalGeom = BufferGeometryUtils.mergeGeometries(geometries, false)!;
      }
    } else {
      finalGeom = BufferGeometryUtils.mergeGeometries(geometries, false)!;
    }
  } else {
    finalGeom = geometries[0];
  }

  if (!finalGeom) {
    console.error("Failed to merge geometries for STL export.");
    alert("Erro ao exportar STL: falha ao mesclar as geometrias.");
    return;
  }

  finalGeom = BufferGeometryUtils.mergeVertices(finalGeom, 0.1);
  finalGeom.computeVertexNormals();

  const exporter = new STLExporter();
  const result = exporter.parse(new THREE.Mesh(finalGeom), { binary: true });
  const blob = new Blob([result], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'seismic_puzzle_full.stl';
  link.click();
};

export const handleExport3MF = async (groupRef: React.RefObject<THREE.Group>, basePlateColor: string) => {
  if (!groupRef.current) return;
  
  // Ensure world matrices are up to date
  groupRef.current.updateWorldMatrix(true, true);
  
  const geometries: THREE.BufferGeometry[] = [];
  const names: string[] = [];
  const colors: string[] = [];
  const groupIds: number[] = [];
  
  groupRef.current.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      if (child.name.startsWith('Layer_')) {
        // Clone and apply world matrix to geometry for correct export
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        
        // Ensure manifold geometry
        const mergedGeom = BufferGeometryUtils.mergeVertices(geom, 0.1);
        mergedGeom.computeVertexNormals();
        
        geometries.push(mergedGeom);
        names.push(child.name);
        groupIds.push(0); // 0 means no group (or we can use undefined, but array needs to be aligned)
        
        if (child.material instanceof THREE.MeshStandardMaterial) {
          colors.push(child.material.color.getHexString());
        } else {
          colors.push('ffffff');
        }
      } else if (child.name.startsWith('Base_') || child.name.startsWith('Texto_') || child.name.startsWith('Legenda_')) {
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        
        const mergedGeom = BufferGeometryUtils.mergeVertices(geom, 0.1);
        mergedGeom.computeVertexNormals();
        
        geometries.push(mergedGeom);
        names.push(child.name);
        groupIds.push(1); // Group 1 is the Base Plate group
        
        if (child.material instanceof THREE.MeshStandardMaterial) {
          colors.push(child.material.color.getHexString());
        } else {
          colors.push(basePlateColor.replace('#', ''));
        }
      } else if (child.name.startsWith('Fault_')) {
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        
        const mergedGeom = BufferGeometryUtils.mergeVertices(geom, 0.1);
        mergedGeom.computeVertexNormals();
        
        geometries.push(mergedGeom);
        names.push(child.name);
        groupIds.push(0);
        
        if (child.material instanceof THREE.MeshStandardMaterial) {
          colors.push(child.material.color.getHexString());
        } else {
          colors.push('ff0000');
        }
      }
    }
  });

  if (geometries.length > 0) {
    // Map 0 to undefined for exportTo3MF
    const finalGroupIds = groupIds.map(id => id === 0 ? undefined : id) as number[];
    await exportTo3MF(geometries, names, colors, finalGroupIds);
  }
};

export const handleExportZIP = async (groupRef: React.RefObject<THREE.Group>) => {
  if (!groupRef.current) return;
  
  // Ensure world matrices are up to date
  groupRef.current.updateWorldMatrix(true, true);
  
  const geometries: THREE.BufferGeometry[] = [];
  const names: string[] = [];
  const baseGeometries: THREE.BufferGeometry[] = [];
  
  groupRef.current.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      if (child.name.startsWith('Layer_')) {
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        
        // Ensure manifold geometry
        let finalGeom = BufferGeometryUtils.mergeVertices(geom, 0.1);
        finalGeom.computeVertexNormals();
        
        // Center and ground each piece for individual printing
        finalGeom.computeBoundingBox();
        const bbox = finalGeom.boundingBox!;
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        finalGeom.translate(-center.x, -center.y, -bbox.min.z);
        
        geometries.push(finalGeom);
        names.push(child.name);
      } else if (child.name.startsWith('Base_') || child.name.startsWith('Texto_') || child.name.startsWith('Legenda_')) {
        const geom = prepareGeometryForMerge(child.geometry);
        geom.applyMatrix4(child.matrixWorld);
        baseGeometries.push(geom);
      } else if (child.name.startsWith('Fault_')) {
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        
        let finalGeom = BufferGeometryUtils.mergeVertices(geom, 0.1);
        finalGeom.computeVertexNormals();
        
        finalGeom.computeBoundingBox();
        const bbox = finalGeom.boundingBox!;
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        finalGeom.translate(-center.x, -center.y, -bbox.min.z);
        
        geometries.push(finalGeom);
        names.push(child.name);
      }
    }
  });

  if (baseGeometries.length > 0) {
    // Use CSG ADDITION for the base plate to ensure it's manifold and has no internal faces
    try {
      const evaluator = new Evaluator();
      evaluator.useGroups = false;
      
      let resultBrush = new Brush(baseGeometries[0]);
      for (let i = 1; i < baseGeometries.length; i++) {
        const nextBrush = new Brush(baseGeometries[i]);
        resultBrush = evaluator.evaluate(resultBrush, nextBrush, ADDITION);
      }
      
      let mergedBase = resultBrush.geometry;
      mergedBase = BufferGeometryUtils.mergeVertices(mergedBase, 0.1);
      mergedBase.computeVertexNormals();
      
      // Center and ground the base plate too
      mergedBase.computeBoundingBox();
      const bbox = mergedBase.boundingBox!;
      const center = new THREE.Vector3();
      bbox.getCenter(center);
      mergedBase.translate(-center.x, -center.y, -bbox.min.z);
      
      geometries.push(mergedBase);
      names.push('Base_Plate');
    } catch (err) {
      console.error("Base Plate CSG failed in ZIP export, falling back to merge", err);
      const mergedBase = BufferGeometryUtils.mergeGeometries(baseGeometries, false);
      if (mergedBase) {
        let finalBase = BufferGeometryUtils.mergeVertices(mergedBase, 0.1);
        finalBase.computeVertexNormals();
        
        finalBase.computeBoundingBox();
        const bbox = finalBase.boundingBox!;
        const center = new THREE.Vector3();
        bbox.getCenter(center);
        finalBase.translate(-center.x, -center.y, -bbox.min.z);
        
        geometries.push(finalBase);
        names.push('Base_Plate');
      }
    }
  }

  if (geometries.length > 0) {
    await exportToZIP(geometries, names);
  }
};

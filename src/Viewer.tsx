import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Center, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useAppStore } from './store';
import { createLayerGeometry } from './geometry';
import { LITHOLOGY_TEXTURES } from './textures';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { Box, Square, Download, FileCode } from 'lucide-react';
import { exportTo3MF } from './export3mf';

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
  textureUrl,
  pinOptions,
  showWireframe,
  colorMap,
  smoothOptions
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
  textureUrl?: string | null;
  pinOptions?: { radius: number; height: number; show: boolean; scale: number; showPin?: boolean; showHole?: boolean };
  showWireframe: boolean;
  colorMap: 'none' | 'rainbow' | 'viridis' | 'magma';
  smoothOptions?: { enabled: boolean; iterations: number };
}) {
  const texture = useMemo(() => {
    if (!textureUrl) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(textureUrl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    // Adjust repeat based on grid dimensions to keep texture square-ish
    const aspect = gridWidth / gridHeight;
    tex.repeat.set(8 * aspect, 8); 
    return tex;
  }, [textureUrl, gridWidth, gridHeight]);

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
      pinOptions,
      smoothOptions
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
          // Simplified viridis
          colorObj.setRGB(t, 1 - Math.abs(t - 0.5) * 2, 1 - t);
        } else {
          colorObj.setRGB(t, t * 0.5, 0.2);
        }
        
        colors.push(colorObj.r, colorObj.g, colorObj.b);
      }
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    return geom;
  }, [topSurface, bottomSurface, gridWidth, gridHeight, clearanceTop, clearanceBottom, exaggeration, isTimeScale, averageVelocity, pinOptions, colorMap]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial 
        color={colorMap === 'none' ? color : '#ffffff'} 
        map={colorMap === 'none' ? texture : null}
        vertexColors={colorMap !== 'none'}
        roughness={0.8} 
        metalness={0.0} 
        side={THREE.DoubleSide} 
        wireframe={showWireframe}
        flatShading={false}
      />
    </mesh>
  );
}

export function Scene({ groupRef }: { groupRef: React.RefObject<THREE.Group> }) {
  const { surfaces, visibleSurfaces, visibleLayers, surfaceColors, surfaceTextures, gridWidth, gridHeight, isTimeScale, averageVelocity, verticalExaggeration, clearance, rotationX, rotationY, rotationZ, modelSizeMm, forceSquare, hasFlatBase, baseThicknessMm, baseColor, cropXMin, cropXMax, cropYMin, cropYMax, showPins, pinRadiusMm, pinHeightMm, showWireframe, explodedView, colorMap, smoothMesh, smoothIterations } = useAppStore();

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

  // Prepare all surfaces including the flat base
  const allSurfaces = [...croppedSurfaces];
  if (hasFlatBase) {
    const lastSurface = croppedSurfaces[croppedSurfaces.length - 1];
    // convertZ in geometry.ts uses (z * averageVelocity) / 2 for time scale
    // So delta_convertZ = delta_z * (averageVelocity / 2) * exaggeration
    // We want delta_convertZ = rawBaseThickness
    // So delta_z = rawBaseThickness / ((averageVelocity / 2) * exaggeration)
    const zFactor = (isTimeScale ? (averageVelocity / 2) : 1) * verticalExaggeration;
    const minRawZ = Math.min(...lastSurface.map(p => p.z));
    const flatZ = minRawZ - (rawBaseThickness / zFactor);
    const flatBaseSurface = lastSurface.map(p => new THREE.Vector3(p.x, p.y, flatZ));
    allSurfaces.push(flatBaseSurface);
  }

  const layers = [];
  const numLayers = allSurfaces.length - 1;

  for (let i = 0; i < numLayers; i++) {
    // A layer exists between allSurfaces[i] and allSurfaces[i+1]
    // Layer i is visible if visibleLayers[i] is true
    // If it's the artificial base layer, it's always visible for now or we can add a toggle
    if (i < visibleLayers.length && !visibleLayers[i]) continue;
    
    // Also, a layer is only visible if its bounding surfaces are visible? 
    // Actually, let's stick to visibleLayers as the primary control for "pieces"
    
    const topSurface = allSurfaces[i];
    const bottomSurface = allSurfaces[i+1];
    
    // Top layer has no top clearance, bottom layer has no bottom clearance
    const clearanceTop = i === 0 ? 0 : rawClearance / 2;
    const clearanceBottom = i === numLayers - 1 ? 0 : rawClearance / 2;

    const isFlatBaseLayer = hasFlatBase && i === numLayers - 1;
    
    const layerColor = isFlatBaseLayer ? baseColor : (surfaceColors[i] || '#3b82f6');
    const textureKey = isFlatBaseLayer ? 'none' : (surfaceTextures[i] as keyof typeof LITHOLOGY_TEXTURES || 'none');
    const textureUrl = LITHOLOGY_TEXTURES[textureKey];

    // Exploded view offset
    const explodedOffset = explodedView ? (numLayers - 1 - i) * (modelSizeMm * 0.2) / scaleZ : 0;

    layers.push(
      <group key={`layer-group-${i}`} position={[0, 0, explodedOffset]}>
        <PuzzleLayer
          key={`layer-${i}-${colorMap}-${layerColor}-${textureKey}`}
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
          textureUrl={textureUrl}
          pinOptions={{
            show: showPins,
            radius: pinRadiusMm,
            height: pinHeightMm,
            scale: scaleZ,
            showPin: i > 0, // No pin on the very top of the model
            showHole: i < numLayers - 1 // No hole on the very bottom of the model
          }}
          smoothOptions={{
            enabled: smoothMesh,
            iterations: smoothIterations
          }}
          showWireframe={showWireframe}
          colorMap={colorMap}
        />
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

  useEffect(() => {
    if (!controlsRef.current) return;
    
    // d is the distance from target (0,0,0)
    // For a 100mm model, 300-400mm is a good distance for initial zoom.
    const d = 350;
    
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

    controlsRef.current.target.set(0, 0, 0);
    controlsRef.current.update();
  }, [viewTrigger, viewType, camera]);

  return <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.1} rotateSpeed={0.8} />;
}

export function Viewer({ groupRef }: { groupRef: React.RefObject<THREE.Group> }) {
  const [viewTrigger, setViewTrigger] = useState(0);
  const [viewType, setViewType] = useState('iso');

  const handleViewChange = (type: string) => {
    setViewType(type);
    setViewTrigger(prev => prev + 1);
  };

  const handleExportSTL = () => {
    if (!groupRef.current) return;
    const exporter = new STLExporter();
    const result = exporter.parse(groupRef.current, { binary: true });
    const blob = new Blob([result], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'seismic_puzzle.stl';
    link.click();
  };

  const handleExport3MF = async () => {
    if (!groupRef.current) return;
    const geometries: THREE.BufferGeometry[] = [];
    const names: string[] = [];
    
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        // Clone and apply world matrix to geometry for correct export
        const geom = child.geometry.clone();
        geom.applyMatrix4(child.matrixWorld);
        geometries.push(geom);
        names.push(child.name || 'Layer');
      }
    });

    if (geometries.length > 0) {
      await exportTo3MF(geometries, names);
    }
  };

  return (
    <div className="w-full h-full relative bg-zinc-900 rounded-xl overflow-hidden shadow-inner border border-zinc-800">
      {/* Toolbar de Câmera */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-zinc-800/90 p-1.5 rounded-lg border border-zinc-700/50 backdrop-blur-sm shadow-lg">
        <button onClick={() => handleViewChange('top')} className="p-2 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors" title="Vista Superior (Mapa)">
          <Square size={20} />
        </button>
        <button onClick={() => handleViewChange('front')} className="p-2 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors" title="Vista Frontal (Seção)">
          <div className="w-5 h-5 flex items-center justify-center">
            <div className="w-full h-1.5 bg-current rounded-sm" />
          </div>
        </button>
        <button onClick={() => handleViewChange('iso')} className="p-2 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-100 transition-colors" title="Vista Isométrica">
          <Box size={20} />
        </button>
        
        <div className="h-px bg-zinc-700 my-1 mx-2" />
        
        <button onClick={handleExportSTL} className="p-2 hover:bg-emerald-900/40 rounded text-emerald-500 hover:text-emerald-400 transition-colors" title="Exportar STL">
          <Download size={20} />
        </button>
        <button onClick={handleExport3MF} className="p-2 hover:bg-blue-900/40 rounded text-blue-500 hover:text-blue-400 transition-colors" title="Exportar 3MF (Bambu Studio)">
          <FileCode size={20} />
        </button>
      </div>

      <Canvas 
        camera={{ position: [250, -250, 250], fov: 45, far: 50000, up: [0, 0, 1] }} 
        shadows
        gl={{ antialias: true, toneMappingExposure: 1.0 }}
      >
        <color attach="background" args={['#18181b']} />
        <ambientLight intensity={0.5} />
        <hemisphereLight intensity={0.35} color="#ffffff" groundColor="#222222" />
        <pointLight position={[2000, 2000, 2000]} intensity={0.7} />
        <directionalLight position={[1000, 2000, 1000]} intensity={0.85} castShadow />
        <directionalLight position={[-1000, 1000, -1000]} intensity={0.4} />
        <directionalLight position={[0, -1000, 500]} intensity={0.25} />
        
        <Scene groupRef={groupRef} />
        
        <CameraController viewTrigger={viewTrigger} viewType={viewType} />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}

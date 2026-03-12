import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Center, Environment, Text3D } from '@react-three/drei';
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
  pinOptions?: { show: boolean; scale: number; showPin?: boolean; showHole?: boolean; pointsTopAbove?: THREE.Vector3[] };
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
  const { surfaces, surfaceNames, visibleSurfaces, visibleLayers, surfaceColors, surfaceTextures, gridWidth, gridHeight, isTimeScale, averageVelocity, verticalExaggeration, clearance, rotationX, rotationY, rotationZ, modelSizeMm, forceSquare, baseThicknessMm, cropXMin, cropXMax, cropYMin, cropYMax, showPins, showWireframe, explodedView, colorMap, smoothMesh, smoothIterations, showBasePlate, basePlateTitle, basePlateSubtitle, basePlateColor, basePlatePadding, basePlateTextRelief } = useAppStore();

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
  if (showBasePlate) {
    const lastSurface = croppedSurfaces[croppedSurfaces.length - 1];
    const zFactor = (isTimeScale ? (averageVelocity / 2) : 1) * verticalExaggeration;
    
    // Determine direction: if first surface Z < second surface Z, Z is depth (increases downwards)
    const convertZ = (z: number) => {
      let depth = isTimeScale ? (z * averageVelocity) / 2 : z;
      return depth * verticalExaggeration;
    };
    const firstZ = convertZ(croppedSurfaces[0][0].z);
    const secondZ = convertZ(croppedSurfaces[1]?.[0]?.z ?? firstZ + 1);
    const directionUp = Math.sign(firstZ - secondZ) || -1;
    
    let flatZ;
    if (directionUp < 0) {
      // Z is depth. "Below" means larger Z.
      const maxRawZ = Math.max(...lastSurface.map(p => p.z));
      flatZ = maxRawZ + (rawBaseThickness / zFactor);
    } else {
      // Z is elevation. "Below" means smaller Z.
      const minRawZ = Math.min(...lastSurface.map(p => p.z));
      flatZ = minRawZ - (rawBaseThickness / zFactor);
    }
    
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
    const topSurfaceAbove = i > 0 ? allSurfaces[i-1] : undefined;
    
    // Top layer has no top clearance, bottom layer has no bottom clearance
    const clearanceTop = i === 0 ? 0 : rawClearance / 2;
    const clearanceBottom = i === numLayers - 1 ? 0 : rawClearance / 2;

    const isFlatBaseLayer = showBasePlate && i === numLayers - 1;
    
    const layerColor = surfaceColors[i] || '#3b82f6';
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
            scale: scaleZ,
            showPin: i > 0, // No pin on the very top of the model
            showHole: showBasePlate ? true : i < numLayers - 1, // Hole on the bottom if there's a base plate
            pointsTopAbove: topSurfaceAbove
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

  // Base Plate
  if (showBasePlate) {
    const userPaddingX = basePlatePadding / scaleX;
    const userPaddingY = basePlatePadding / scaleY;

    const textScale = 1 / scaleX; // Adjust text size to be readable
    const textRelief = basePlateTextRelief / scaleZ;

    const maxLegendNameLength = Math.max(0, ...surfaceNames.slice(0, visibleLayers.length).filter((_, i) => visibleLayers[i]).map(n => n.length));
    const requiredLegendWidth = (4 + maxLegendNameLength * 3 * 0.75 + 8) * textScale;
    const titleWidth = (basePlateTitle.length * 8 * 0.75) * textScale;
    const subtitleWidth = (basePlateSubtitle.length * 4 * 0.75) * textScale;
    const requiredTitleWidth = Math.max(titleWidth, subtitleWidth) + 8 * textScale;

    const minPaddingX = Math.max(requiredLegendWidth, requiredTitleWidth);
    const actualPaddingLeft = Math.max(userPaddingX, minPaddingX);
    const actualPaddingRight = userPaddingX;

    const bpWidth = croppedDataWidth + actualPaddingLeft + actualPaddingRight;
    const bpHeight = croppedDataHeight + userPaddingY * 2;
    const bpThickness = 5 / scaleZ; // 5mm thick base plate
    
    const modelBaseTopSurface = allSurfaces[allSurfaces.length - 2];
    const modelBaseBottomSurface = allSurfaces[allSurfaces.length - 1];
    
    const convertZ = (z: number) => {
      let depth = isTimeScale ? (z * averageVelocity) / 2 : z;
      return depth * verticalExaggeration;
    };
    const firstZ = convertZ(croppedSurfaces[0][0].z);
    const secondZ = convertZ(croppedSurfaces[1]?.[0]?.z ?? firstZ + 1);
    const directionUp = Math.sign(firstZ - secondZ) || -1;
    
    // The flat base has a constant Z
    const baseZ = convertZ(modelBaseBottomSurface[0].z);
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    const bpCenterX = centerX + (actualPaddingRight - actualPaddingLeft) / 2;
    const bpCenterY = centerY;
    
    const bpExplodedOffset = explodedView ? - (modelSizeMm * 0.2) / scaleZ : 0;
    
    // If directionUp < 0 (depth), "below" is +Z. So centerZ is baseZ + bpThickness / 2
    // If directionUp > 0 (elevation), "below" is -Z. So centerZ is baseZ - bpThickness / 2
    const centerZ = baseZ - directionUp * (bpThickness / 2) + bpExplodedOffset;

    const fontUrl = 'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_regular.typeface.json';

    // Calculate dynamic pin height based on the thickness of the model base piece
    const nominalPinHeight = 4 / scaleZ;
    const nominalPinRadius = 2 / scaleZ;
    const pinRadius = nominalPinRadius;
    
    // Find the minimum thickness of the model base piece at the 4 corners to ensure pins don't bottom out
    const inset = 0.15;
    const cornerIndices = [
      { x: Math.floor(croppedGridWidth * inset), y: Math.floor(croppedGridHeight * inset) },
      { x: Math.floor(croppedGridWidth * (1 - inset)), y: Math.floor(croppedGridHeight * inset) },
      { x: Math.floor(croppedGridWidth * inset), y: Math.floor(croppedGridHeight * (1 - inset)) },
      { x: Math.floor(croppedGridWidth * (1 - inset)), y: Math.floor(croppedGridHeight * (1 - inset)) }
    ];
    
    let minLocalThickness = Infinity;
    cornerIndices.forEach(corner => {
      const idx = corner.y * croppedGridWidth + corner.x;
      const zTop = convertZ(modelBaseTopSurface[idx].z);
      const zBottom = convertZ(modelBaseBottomSurface[idx].z);
      const thickness = Math.abs(zTop - zBottom);
      if (thickness < minLocalThickness) minLocalThickness = thickness;
    });
    
    const maxSafeHeightForPin = minLocalThickness * 0.4;
    const pinHeight = Math.min(nominalPinHeight, maxSafeHeightForPin);
    
    const pinMargin = pinRadius * 3;
    
    // Pins are positioned relative to the model center, not the base plate center
    const localPinX1 = (minX + pinMargin) - bpCenterX;
    const localPinX2 = (maxX - pinMargin) - bpCenterX;
    const localPinY1 = (minY + pinMargin) - bpCenterY;
    const localPinY2 = (maxY - pinMargin) - bpCenterY;
    
    // The pins sit on top of the base plate
    const localPinZ = directionUp * (bpThickness / 2 + pinHeight / 2);

    const pinPositions = [
      [localPinX1, localPinY1],
      [localPinX2, localPinY1],
      [localPinX1, localPinY2],
      [localPinX2, localPinY2],
    ];

    const textStartX = -bpWidth / 2 + 4 * textScale;
    const textZ = directionUp > 0 ? bpThickness / 2 : -bpThickness / 2 - textRelief;

    layers.push(
      <group key="base-plate" position={[bpCenterX, bpCenterY, centerZ]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[bpWidth, bpHeight, bpThickness]} />
          <meshStandardMaterial color={basePlateColor} roughness={0.9} />
        </mesh>

        {/* Pins connecting to the last puzzle piece */}
        {showPins && pinPositions.map((pos, idx) => (
          <mesh key={`bp-pin-${idx}`} position={[pos[0], pos[1], localPinZ]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[pinRadius, pinRadius, pinHeight, 16]} />
            <meshStandardMaterial color={basePlateColor} roughness={0.9} />
          </mesh>
        ))}
        
        {/* Title Text */}
        {basePlateTitle && (
          <group position={[textStartX, -bpHeight / 2 + userPaddingY * 0.5, textZ]}>
            <Text3D 
              font={fontUrl} 
              size={8 * textScale} 
              height={textRelief} 
              curveSegments={12}
              rotation={[0, 0, 0]}
            >
              {basePlateTitle}
              <meshStandardMaterial color="#ffffff" />
            </Text3D>
          </group>
        )}

        {/* Subtitle Text */}
        {basePlateSubtitle && (
          <group position={[textStartX, -bpHeight / 2 + userPaddingY * 0.2, textZ]}>
            <Text3D 
              font={fontUrl} 
              size={4 * textScale} 
              height={textRelief} 
              curveSegments={12}
              rotation={[0, 0, 0]}
            >
              {basePlateSubtitle}
              <meshStandardMaterial color="#cccccc" />
            </Text3D>
          </group>
        )}
        
        {/* Legend */}
        <group position={[textStartX, bpHeight / 2 - userPaddingY * 0.5, textZ]}>
          {surfaceNames.slice(0, visibleLayers.length).map((name, idx) => {
            if (!visibleLayers[idx]) return null;
            const color = surfaceColors[idx] || '#ffffff';
            return (
              <group key={`legend-${idx}`} position={[0, -idx * 6 * textScale, 0]}>
                <mesh position={[0, 2 * textScale, textRelief / 2]}>
                  <boxGeometry args={[4 * textScale, 4 * textScale, textRelief]} />
                  <meshStandardMaterial color={color} />
                </mesh>
                <Text3D 
                  font={fontUrl} 
                  size={3 * textScale} 
                  height={textRelief} 
                  position={[4 * textScale, 0, 0]}
                >
                  {name}
                  <meshStandardMaterial color="#ffffff" />
                </Text3D>
              </group>
            );
          })}
        </group>
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
    <div className="w-full flex-1 relative bg-zinc-900 rounded-xl overflow-hidden shadow-inner border border-zinc-800">
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
        
        <React.Suspense fallback={null}>
          <Scene groupRef={groupRef} />
        </React.Suspense>
        
        <CameraController viewTrigger={viewTrigger} viewType={viewType} />
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}

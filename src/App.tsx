import React, { useRef, useState } from 'react';
import { useAppStore } from './store';
import { parseFile, createCommonGrid } from './parser';
import { Viewer } from './Viewer';
import { LITHOLOGY_LABELS } from './textures';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import JSZip from 'jszip';
import * as THREE from 'three';
import { Upload, Download, Settings, Trash2, Layers, Info, Eye, Box } from 'lucide-react';

export default function App() {
  const {
    surfaces,
    surfaceNames,
    visibleSurfaces,
    visibleLayers,
    isTimeScale,
    averageVelocity,
    verticalExaggeration,
    clearance,
    rotationX,
    rotationY,
    rotationZ,
    modelSizeMm,
    forceSquare,
    hasFlatBase,
    baseThicknessMm,
    baseColor,
    cropXMin,
    cropXMax,
    cropYMin,
    cropYMax,
    dataWidth,
    dataHeight,
    setSurfaces,
    toggleSurfaceVisibility,
    toggleLayerVisibility,
    setAverageVelocity,
    setVerticalExaggeration,
    setClearance,
    setRotation,
    setModelSizeMm,
    setForceSquare,
    setHasFlatBase,
    setBaseThicknessMm,
    setBaseColor,
    setCropX,
    setCropY,
    showPins,
    pinRadiusMm,
    pinHeightMm,
    setShowPins,
    setPinRadiusMm,
    setPinHeightMm,
    surfaceColors,
    setSurfaceColor,
    surfaceTextures,
    setSurfaceTexture,
    showWireframe,
    setShowWireframe,
    explodedView,
    setExplodedView,
    colorMap,
    setColorMap,
    smoothMesh,
    setSmoothMesh,
    smoothIterations,
    setSmoothIterations,
    generateExample,
    clear
  } = useAppStore();

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    setLoading(true);
    
    const newFiles = Array.from(e.target.files);
    
    try {
      const parsedSurfaces: THREE.Vector3[][] = [];
      const parsedNames: string[] = [];
      let globalMinZ = Infinity;
      let globalMaxZ = -Infinity;
      
      for (const file of newFiles) {
        const text = await file.text();
        const fileSurfaces = parseFile(text);
        
        for (const surf of fileSurfaces) {
          parsedSurfaces.push(surf.points);
          parsedNames.push(surf.name || file.name);
          if (surf.minZ < globalMinZ) globalMinZ = surf.minZ;
          if (surf.maxZ > globalMaxZ) globalMaxZ = surf.maxZ;
        }
      }
      
      if (parsedSurfaces.length > 0) {
        // Sort surfaces by average Z to ensure top-to-bottom order
        const surfacesWithNames = parsedSurfaces.map((s, i) => ({ surface: s, name: parsedNames[i] }));
        surfacesWithNames.sort((a, b) => {
          const avgA = a.surface.reduce((sum, p) => sum + p.z, 0) / a.surface.length;
          const avgB = b.surface.reduce((sum, p) => sum + p.z, 0) / b.surface.length;
          return avgB - avgA; // Higher Z is usually Top (if depth is negative, higher is closer to surface)
        });

        const sortedSurfaces = surfacesWithNames.map(s => s.surface);
        const sortedNames = surfacesWithNames.map(s => s.name);

        const { griddedSurfaces, gridWidth, gridHeight } = createCommonGrid(sortedSurfaces, 50);
        
        // Detect scale
        const maxAbsZ = Math.max(Math.abs(globalMinZ), Math.abs(globalMaxZ));
        const isTime = maxAbsZ < 20;
        
        const firstSurf = griddedSurfaces[0];
        const minX = Math.min(...firstSurf.map(p => p.x));
        const maxX = Math.max(...firstSurf.map(p => p.x));
        const minY = Math.min(...firstSurf.map(p => p.y));
        const maxY = Math.max(...firstSurf.map(p => p.y));
        const dataWidth = maxX - minX;
        const dataHeight = maxY - minY;
        const dataMaxDim = Math.max(dataWidth, dataHeight);
        
        setSurfaces(griddedSurfaces, sortedNames, gridWidth, gridHeight, isTime, dataMaxDim, dataWidth, dataHeight);
        setFiles(newFiles);
      }
    } catch (error) {
      console.error("Error parsing files:", error);
      alert("Erro ao processar os arquivos.");
    } finally {
      setLoading(false);
    }
  };

  const exportSTL = () => {
    if (!groupRef.current) return;
    const exporter = new STLExporter();
    const result = exporter.parse(groupRef.current, { binary: true });
    
    const blob = new Blob([result], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = 'seismic_puzzle.stl';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportAllSTLs = async () => {
    if (!groupRef.current) return;
    const exporter = new STLExporter();
    const zip = new JSZip();
    
    // Iterate through children (layers)
    const layers = groupRef.current.children;
    
    layers.forEach((layerGroup, idx) => {
      // Each layer is in a group (because of exploded view)
      // We need to temporarily reset its position for export
      const originalPos = layerGroup.position.clone();
      layerGroup.position.set(0, 0, 0);
      
      const result = exporter.parse(layerGroup, { binary: true }) as DataView;
      const name = `Peca_${idx + 1}.stl`;
      zip.file(name, result.buffer);
      
      layerGroup.position.copy(originalPos);
    });
    
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = 'pecas_quebra_cabeca.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Layers className="text-zinc-950" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">SeismicPuzzle3D</h1>
            <p className="text-xs text-zinc-400 font-medium">Horizons to 3D Puzzle Converter</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={generateExample}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-md text-sm font-medium transition-colors"
          >
            Gerar Exemplo
          </button>
          <button
            onClick={exportAllSTLs}
            disabled={visibleSurfaces.filter(Boolean).length < 2}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-200 rounded-md text-sm font-medium transition-colors flex items-center gap-2"
            title="Exportar todas as peças separadas em um arquivo ZIP"
          >
            <Download size={16} />
            ZIP (Todas Peças)
          </button>
          <button
            onClick={exportSTL}
            disabled={visibleSurfaces.filter(Boolean).length < 2}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 shadow-md shadow-emerald-900/20"
          >
            <Download size={16} />
            STL
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-zinc-900/50 border-r border-zinc-800 p-6 flex flex-col gap-8 overflow-y-auto">
          
          {/* Data Input */}
          <section className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Upload size={16} />
              Entrada de Dados
            </h2>
            
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-zinc-700 border-dashed rounded-xl cursor-pointer bg-zinc-800/50 hover:bg-zinc-800 hover:border-emerald-500/50 transition-all">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <Upload className="w-8 h-8 mb-3 text-zinc-500" />
                <p className="mb-2 text-sm text-zinc-400"><span className="font-semibold text-zinc-300">Clique para upload</span> ou arraste</p>
                <p className="text-xs text-zinc-500">.hor, .txt, .xyz, .dat</p>
              </div>
              <input type="file" multiple accept=".hor,.txt,.xyz,.dat" className="hidden" onChange={handleFileUpload} />
            </label>

            {loading && <p className="text-sm text-emerald-400 animate-pulse">Processando arquivos...</p>}

            {surfaces.length > 0 && (
              <div className="bg-zinc-800/80 rounded-lg p-4 border border-zinc-700/50">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-zinc-300">{surfaces.length} Superfícies</span>
                  <button onClick={clear} className="text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-2 mb-3">
                  {surfaceNames.map((name, idx) => (
                    <div key={idx} className="flex items-center justify-between group">
                      <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors flex-1 min-w-0">
                        <input 
                          type="checkbox" 
                          checked={visibleSurfaces[idx]} 
                          onChange={() => toggleSurfaceVisibility(idx)}
                          className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                        />
                        <span className="truncate" title={name}>{name}</span>
                      </label>
                      
                      <div className="flex items-center gap-2 ml-2">
                        <select
                          value={surfaceTextures[idx] || 'none'}
                          onChange={(e) => setSurfaceTexture(idx, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 text-zinc-400 text-[10px] rounded px-1 py-0.5 focus:ring-emerald-500 focus:border-emerald-500 outline-none hover:border-zinc-600 transition-colors"
                          title="Textura de Litologia"
                        >
                          {Object.entries(LITHOLOGY_LABELS).map(([key, label]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                        <input 
                          type="color" 
                          value={surfaceColors[idx] || '#3b82f6'} 
                          onChange={(e) => setSurfaceColor(idx, e.target.value)}
                          className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700 p-0 cursor-pointer bg-transparent hover:scale-110 transition-transform"
                          title="Escolher cor"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {isTimeScale && (
                  <div className="flex items-start gap-2 mt-3 text-xs text-amber-400/90 bg-amber-400/10 p-2 rounded border border-amber-400/20">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>Escala de Tempo detectada (|Z| &lt; 20). Ajuste a velocidade média abaixo.</p>
                  </div>
                )}
              </div>
            )}

            {surfaces.length > 0 && (
              <div className="bg-zinc-800/80 rounded-lg p-4 border border-zinc-700/50 mt-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Box size={14} />
                  Peças (Volumes)
                </h3>
                <div className="flex flex-col gap-2">
                  {visibleLayers.map((visible, idx) => {
                    const isBaseLayer = idx === surfaces.length - 1 && hasFlatBase;
                    const nameTop = surfaceNames[idx] || 'Superfície ' + idx;
                    const nameBottom = isBaseLayer ? 'Base Plana' : (surfaceNames[idx+1] || 'Superfície ' + (idx + 1));
                    
                    return (
                      <div key={idx} className="flex items-center justify-between group">
                        <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-zinc-200 transition-colors flex-1 min-w-0">
                          <input 
                            type="checkbox" 
                            checked={visible} 
                            onChange={() => toggleLayerVisibility(idx)}
                            className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                          />
                          <span className="truncate">
                            {isBaseLayer ? 'Peça Base' : `Peça ${idx + 1}`}: {nameTop} → {nameBottom}
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-zinc-500 mt-3 italic">
                  * As peças são os volumes físicos entre duas superfícies.
                </p>
              </div>
            )}
          </section>

          {/* Controls */}
          <section className="flex flex-col gap-6">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
              <Settings size={16} />
              Parâmetros
            </h2>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-300 font-medium flex justify-between">
                Tamanho do Modelo (mm)
                <span className="text-zinc-500 font-mono">{modelSizeMm}</span>
              </label>
              <input
                type="range"
                min="50"
                max="300"
                step="10"
                value={modelSizeMm}
                onChange={(e) => setModelSizeMm(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <label className="flex items-center gap-2 mt-1 text-sm text-zinc-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={forceSquare} 
                  onChange={(e) => setForceSquare(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                />
                Forçar formato quadrado (Distorcer X/Y)
              </label>
              <p className="text-xs text-zinc-500">Ignora a proporção real para criar um bloco perfeito.</p>
            </div>

            {isTimeScale && (
              <div className="flex flex-col gap-2">
                <label className="text-sm text-zinc-300 font-medium flex justify-between">
                  Velocidade Média (m/s)
                  <span className="text-zinc-500 font-mono">{averageVelocity}</span>
                </label>
                <input
                  type="range"
                  min="1500"
                  max="6000"
                  step="50"
                  value={averageVelocity}
                  onChange={(e) => setAverageVelocity(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-300 font-medium flex justify-between">
                Exagero Vertical
                <span className="text-zinc-500 font-mono">{verticalExaggeration}x</span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={verticalExaggeration}
                onChange={(e) => setVerticalExaggeration(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm text-zinc-300 font-medium flex justify-between">
                Folga (Clearance)
                <span className="text-zinc-500 font-mono">{clearance.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={clearance}
                onChange={(e) => setClearance(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="text-xs text-zinc-500">Espaço entre as peças para encaixe.</p>
            </div>
            
            <div className="pt-4 border-t border-zinc-800 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <Eye size={16} />
                Visualização
              </h2>

              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showWireframe} 
                  onChange={(e) => setShowWireframe(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                />
                Mostrar Wireframe (Malha)
              </label>

              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={explodedView} 
                  onChange={(e) => setExplodedView(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                />
                Vista Explodida (Separar Peças)
              </label>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400">Mapa de Cores (Z)</label>
                <select 
                  value={colorMap} 
                  onChange={(e) => setColorMap(e.target.value as any)}
                  className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2"
                >
                  <option value="none">Cores Sólidas (Personalizáveis)</option>
                  <option value="rainbow">Arco-Íris (Rainbow)</option>
                  <option value="viridis">Viridis (Geofísica)</option>
                  <option value="magma">Magma (Contraste)</option>
                </select>
                {colorMap !== 'none' && (
                  <p className="text-[10px] text-amber-500/80 italic">
                    * Cores individuais desativadas enquanto o Mapa de Cores estiver ativo.
                  </p>
                )}
              </div>

              <div className="pt-2 border-t border-zinc-800/50 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-zinc-300 cursor-pointer flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={smoothMesh} 
                      onChange={(e) => setSmoothMesh(e.target.checked)}
                      className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                    />
                    Suavizar Malha
                  </label>
                </div>
                
                {smoothMesh && (
                  <div className="flex flex-col gap-2 pl-6">
                    <label className="text-xs text-zinc-400 flex justify-between">
                      Intensidade
                      <span className="text-zinc-500 font-mono">{smoothIterations}x</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={smoothIterations}
                      onChange={(e) => setSmoothIterations(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                    <p className="text-[10px] text-zinc-500 italic">
                      Reduz ruído e suaviza ângulos bruscos na geometria.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-800 flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Recorte (Cropping)</h3>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400 flex justify-between">
                  Eixo X (Largura)
                  <span className="text-zinc-500 font-mono">{cropXMin}% - {cropXMax}%</span>
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0" max={cropXMax - 5} step="1" 
                    value={cropXMin} onChange={(e) => setCropX(Number(e.target.value), cropXMax)} 
                    className="w-1/2 accent-emerald-500" 
                  />
                  <input 
                    type="range" min={cropXMin + 5} max="100" step="1" 
                    value={cropXMax} onChange={(e) => setCropX(cropXMin, Number(e.target.value))} 
                    className="w-1/2 accent-emerald-500" 
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400 flex justify-between">
                  Eixo Y (Profundidade)
                  <span className="text-zinc-500 font-mono">{cropYMin}% - {cropYMax}%</span>
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0" max={cropYMax - 5} step="1" 
                    value={cropYMin} onChange={(e) => setCropY(Number(e.target.value), cropYMax)} 
                    className="w-1/2 accent-emerald-500" 
                  />
                  <input 
                    type="range" min={cropYMin + 5} max="100" step="1" 
                    value={cropYMax} onChange={(e) => setCropY(cropYMin, Number(e.target.value))} 
                    className="w-1/2 accent-emerald-500" 
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-zinc-800 flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Base do Modelo</h3>
              <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={hasFlatBase} 
                  onChange={(e) => setHasFlatBase(e.target.checked)}
                  className="rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500/50"
                />
                Adicionar Base Plana (Fictícia)
              </label>
              
              {hasFlatBase && (
                <div className="flex flex-col gap-4 pl-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs text-zinc-400 flex justify-between">
                      Espessura da Base (mm)
                      <span className="text-zinc-500 font-mono">{baseThicknessMm}</span>
                    </label>
                    <input
                      type="range"
                      min="2"
                      max="50"
                      step="1"
                      value={baseThicknessMm}
                      onChange={(e) => setBaseThicknessMm(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-zinc-400">Cor da Base</label>
                    <input 
                      type="color" 
                      value={baseColor} 
                      onChange={(e) => setBaseColor(e.target.value)}
                      className="w-6 h-6 rounded border border-zinc-700 p-0 cursor-pointer bg-transparent"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800 flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Quebra-Cabeça</h3>
              
              <label className="flex items-center gap-3 text-sm text-zinc-300 cursor-pointer group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showPins}
                    onChange={(e) => setShowPins(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-zinc-800 rounded-full peer peer-checked:bg-emerald-600 transition-colors"></div>
                  <div className="absolute left-1 top-1 w-3 h-3 bg-zinc-400 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-transform"></div>
                </div>
                Pinos de Alinhamento
              </label>

              {showPins && (
                <div className="flex flex-col gap-2 pl-6">
                  <label className="text-xs text-zinc-400 flex justify-between">
                    Raio do Pino (mm)
                    <span className="text-zinc-500 font-mono">{pinRadiusMm}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="5"
                    step="0.1"
                    value={pinRadiusMm}
                    onChange={(e) => setPinRadiusMm(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />

                  <label className="text-xs text-zinc-400 flex justify-between mt-2">
                    Altura do Pino (mm)
                    <span className="text-zinc-500 font-mono">{pinHeightMm}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="10"
                    step="0.1"
                    value={pinHeightMm}
                    onChange={(e) => setPinHeightMm(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-zinc-800 flex flex-col gap-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Rotação do Modelo</h3>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400 flex justify-between">
                  Eixo X
                  <span className="text-zinc-500 font-mono">{rotationX}°</span>
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotationX}
                  onChange={(e) => setRotation('x', Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400 flex justify-between">
                  Eixo Y
                  <span className="text-zinc-500 font-mono">{rotationY}°</span>
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotationY}
                  onChange={(e) => setRotation('y', Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className="text-xs text-zinc-400 flex justify-between">
                  Eixo Z
                  <span className="text-zinc-500 font-mono">{rotationZ}°</span>
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotationZ}
                  onChange={(e) => setRotation('z', Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
              </div>
              
              <button 
                onClick={() => { setRotation('x', 0); setRotation('y', 0); setRotation('z', 0); }}
                className="text-xs text-emerald-500 hover:text-emerald-400 text-left transition-colors"
              >
                Resetar Rotação
              </button>
            </div>
          </section>
        </aside>

        {/* 3D Viewport */}
        <section className="flex-1 p-6 relative">
          {visibleSurfaces.filter(Boolean).length < 2 && !loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Layers className="w-16 h-16 text-zinc-800 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-zinc-400 mb-2">Nenhum dado carregado</h3>
                <p className="text-zinc-500 text-sm">
                  Faça o upload de 2 ou mais arquivos de horizonte sísmico ou clique em "Gerar Exemplo" para visualizar o quebra-cabeça 3D.
                </p>
              </div>
            </div>
          ) : (
            <Viewer groupRef={groupRef} />
          )}

          {/* Scale Info Overlay */}
          {surfaces.length > 0 && (
            <div className="absolute bottom-10 left-10 bg-zinc-900/80 backdrop-blur-md border border-zinc-800 p-4 rounded-xl shadow-2xl pointer-events-none">
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <Info size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">Escala do Modelo</span>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-zinc-100">
                  Área Real: <span className="font-mono text-emerald-400">{(dataWidth / 1000).toFixed(2)}km x {(dataHeight / 1000).toFixed(2)}km</span>
                </p>
                <p className="text-xs text-zinc-400">
                  Tamanho Impressão: <span className="font-mono">{modelSizeMm}mm x {(modelSizeMm * (dataHeight / dataWidth)).toFixed(0)}mm</span>
                </p>
                <p className="text-[10px] text-zinc-500 italic mt-2">
                  * 1cm no modelo ≈ {(dataWidth / (modelSizeMm / 10)).toFixed(0)} metros reais.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

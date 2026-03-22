import React, { useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore, Fault } from './store';
import { parseFile, createCommonGrid } from './parser';
import { Viewer } from './Viewer';
import { handleExportSTL, handleExportZIP, handleExport3MF } from './exportUtils';
import * as THREE from 'three';
import { Upload, Download, Settings, Trash2, Layers, Info, Eye, Box, Activity, Save, FolderOpen, AlertTriangle, X, Sun, Moon } from 'lucide-react';

export default function App() {
  const { t, i18n } = useTranslation();
  const {
    surfaces,
    surfaceNames,
    setSurfaceName,
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
    baseThicknessMm,
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
    setBaseThicknessMm,
    setCropX,
    setCropY,
    layerColors,
    setLayerColor,
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
    showBasePlate,
    setShowBasePlate,
    basePlateTitle,
    setBasePlateTitle,
    basePlateSubtitle,
    setBasePlateSubtitle,
    basePlateColor,
    setBasePlateColor,
    basePlatePadding,
    setBasePlatePadding,
    basePlateThicknessMm,
    setBasePlateThicknessMm,
    basePlateTextRelief,
    setBasePlateTextRelief,
    embossLabels,
    setEmbossLabels,
    labelSize,
    setLabelSize,
    labelThickness,
    setLabelThickness,
    basePieceName,
    setBasePieceName,
    basePieceColor,
    setBasePieceColor,
    scaleMode,
    setScaleMode,
    metersPerCm,
    setMetersPerCm,
    faults,
    faultWidth,
    showFaults,
    setFaults,
    setFaultColor,
    toggleFaultVisibility,
    setFaultWidth,
    setShowFaults,
    generateExample,
    clear,
    exportProject,
    importProject,
    theme,
    setTheme
  } = useAppStore();

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    // Force document title update
    document.title = "Seismic Puzzle 3D";
  }, []);

  const [files, setFiles] = useState<File[]>([]);
  const [faultFiles, setFaultFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [showThinLineWarning, setShowThinLineWarning] = useState(false);
  const [thinFeatures, setThinFeatures] = useState<{ name: string; width: number }[]>([]);
  const [pendingExport, setPendingExport] = useState<(() => void) | null>(null);

  const checkThinLines = (onConfirm: () => void) => {
    const features: { name: string; width: number }[] = [];
    
    // 1. Faults
    if (showFaults && faults.length > 0) {
      // Physical diameter ≈ (faultWidth * modelSizeMm) / 2000
      const faultPhysicalWidth = (faultWidth * modelSizeMm) / 2000;
      if (faultPhysicalWidth < 0.4) {
        features.push({ name: t('app.faultLines'), width: faultPhysicalWidth });
      }
    }
    
    // 2. Labels
    if (embossLabels) {
      // Stroke width is roughly labelSize * 0.15
      const labelStrokeWidth = labelSize * 0.15;
      if (labelStrokeWidth < 0.4) {
        features.push({ name: t('app.partLabels'), width: labelStrokeWidth });
      }
    }

    if (features.length > 0) {
      setThinFeatures(features);
      setPendingExport(() => onConfirm);
      setShowThinLineWarning(true);
    } else {
      onConfirm();
    }
  };

  const autoFixThinLines = () => {
    // 1. Faults: faultWidth * modelSizeMm / 2000 = 0.4 => faultWidth = 800 / modelSizeMm
    if (showFaults && faults.length > 0) {
      const minFaultWidth = 800 / modelSizeMm;
      if (faultWidth < minFaultWidth) {
        setFaultWidth(Math.ceil(minFaultWidth));
      }
    }
    
    // 2. Labels: labelSize * 0.15 = 0.4 => labelSize = 0.4 / 0.15 = 2.67
    if (embossLabels) {
      if (labelSize < 2.7) {
        setLabelSize(2.7);
      }
    }
    
    setShowThinLineWarning(false);
    // Use a small timeout to allow state to update before exporting
    setTimeout(() => {
      if (pendingExport) pendingExport();
    }, 100);
  };
  const [activeTab, setActiveTab] = useState<'surfaces' | 'pieces' | 'faults' | 'settings'>('surfaces');
  const groupRef = useRef<THREE.Group>(null);

  const handleSaveProject = () => {
    const json = exportProject();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'projeto.sp3d';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        importProject(content);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

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
      alert(t('app.errorProcessingFiles'));
    } finally {
      setLoading(false);
    }
  };

  const doExportSTL = () => {
    if (groupRef.current) handleExportSTL(groupRef);
  };

  const doExportZIP = () => {
    if (groupRef.current) handleExportZIP(groupRef);
  };

  const doExport3MF = () => {
    if (groupRef.current) handleExport3MF(groupRef, useAppStore.getState().basePlateColor);
  };

  const handleFaultUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const newFiles = Array.from(e.target.files);
    setFaultFiles(prev => [...prev, ...newFiles]);
    
    const newFaults: Fault[] = [];
    const defaultColors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
    
    for (const file of newFiles) {
      const text = await file.text();
      const lines = text.split('\n');
      let currentStick: THREE.Vector3[] = [];
      let stickCount = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
          if (currentStick.length >= 2) {
            stickCount++;
            newFaults.push({
              id: `${file.name}-${stickCount}-${Date.now()}`,
              name: `${file.name.split('.')[0]} ${stickCount}`,
              points: currentStick,
              color: defaultColors[(faults.length + newFaults.length) % defaultColors.length],
              visible: true
            });
          }
          currentStick = [];
          continue;
        }
        
        const p = trimmed.split(/[\s,;]+/);
        if (p.length >= 3) {
          const x = parseFloat(p[0]), y = parseFloat(p[1]), z = parseFloat(p[2]);
          if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
            currentStick.push(new THREE.Vector3(x, y, z));
          }
        }
      }
      if (currentStick.length >= 2) {
        stickCount++;
        newFaults.push({
          id: `${file.name}-${stickCount}-${Date.now()}`,
          name: `${file.name.split('.')[0]} ${stickCount}`,
          points: currentStick,
          color: defaultColors[(faults.length + newFaults.length) % defaultColors.length],
          visible: true
        });
      }
    }
    
    if (newFaults.length > 0) {
      setFaults([...faults, ...newFaults]);
    }
  };

  return (
    <div className={`h-screen w-screen overflow-hidden ${theme === 'dark' ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'} flex flex-col font-sans`}>
      {/* Header */}
      <header className={`${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border-b px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Layers className="text-zinc-950" size={24} />
          </div>
          <div>
            <h1 className={`text-xl font-bold tracking-tight ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'} flex items-center gap-2`}>
              {t('app.title')}
              <span className={`text-[10px] font-normal ${theme === 'dark' ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : 'bg-zinc-100 text-zinc-400 border-zinc-200'} px-1.5 py-0.5 rounded border uppercase tracking-tighter`}>v1.0</span>
            </h1>
            <p className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'} font-medium`}>{t('app.subtitle')}</p>
            <span className="sr-only">Conhecido também como Seismic Puzzle 3D, SeismicPuzzle, Sesmic Puzzle, Seismic 3D, Seismic Puzle. Ferramenta para geologia e geofísica.</span>
          </div>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`p-2 rounded-md border transition-colors ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}`}
            title={theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <select 
            value={i18n.language} 
            onChange={(e) => i18n.changeLanguage(e.target.value)}
            className={`text-xs rounded border px-2 py-1 mr-2 outline-none focus:border-emerald-500 transition-colors ${theme === 'dark' ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-white text-zinc-700 border-zinc-200'}`}
          >
            <option value="en">🇺🇸 English</option>
            <option value="pt-BR">🇧🇷 Português</option>
            <option value="es">🇪🇸 Español</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="it">🇮🇹 Italiano</option>
          </select>
          <button
            onClick={handleSaveProject}
            disabled={surfaces.length === 0}
            className={`px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title={t('app.save')}
          >
            <Save size={16} />
            {t('app.save')}
          </button>
          <label 
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title={t('app.load')}
          >
            <FolderOpen size={16} />
            {t('app.load')}
            <input type="file" accept=".sp3d,.json" className="hidden" onChange={handleLoadProject} />
          </label>
          <div className={`w-px h-6 mx-1 self-center ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-200'}`}></div>
          <button
            onClick={generateExample}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
          >
            {t('app.loadExample')}
          </button>
          <button
            onClick={() => checkThinLines(doExport3MF)}
            disabled={visibleSurfaces.filter(Boolean).length < 2}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 shadow-md shadow-blue-900/20"
            title="Export 3MF"
          >
            <Download size={16} />
            {t('app.export3mf')}
          </button>
          <button
            onClick={() => checkThinLines(doExportZIP)}
            disabled={visibleSurfaces.filter(Boolean).length < 2}
            className={`px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="Export ZIP"
          >
            <Download size={16} />
            ZIP
          </button>
          <button
            onClick={() => checkThinLines(doExportSTL)}
            disabled={visibleSurfaces.filter(Boolean).length < 2}
            className={`px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${theme === 'dark' ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200' : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700'}`}
            title="Export STL"
          >
            <Download size={16} />
            {t('app.exportStl')}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 flex overflow-hidden ${theme === 'dark' ? 'bg-zinc-950' : 'bg-zinc-50'}`}>
        {/* Sidebar */}
        <aside className={`w-80 border-r p-6 flex flex-col gap-8 overflow-y-auto ${theme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-zinc-200'}`}>
          
          {/* Data Input */}
          <section className="flex flex-col gap-4">
            <h2 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              <Upload size={16} />
              {t('app.importHorizons')}
            </h2>
            
            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-emerald-500/50' : 'border-zinc-300 bg-zinc-100/50 hover:bg-zinc-100 hover:border-emerald-500/50'}`}>
              <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-2">
                <Upload className={`w-8 h-8 mb-3 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                <p className={`mb-2 text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{t('app.dropHorizons')}</p>
                <p className="text-xs text-zinc-500">.grs, .hor, .txt, .xyz, .dat</p>
              </div>
              <input type="file" multiple accept=".grs,.hor,.txt,.xyz,.dat" className="hidden" onChange={handleFileUpload} />
            </label>

            {loading && <p className="text-sm text-emerald-400 animate-pulse">Processando arquivos...</p>}

            {surfaces.length > 0 && (
              <div className={`rounded-lg p-4 border ${theme === 'dark' ? 'bg-zinc-800/80 border-zinc-700/50' : 'bg-white border-zinc-200 shadow-sm'}`}>
                <div className="flex justify-between items-center mb-3">
                  <span className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{surfaces.length} Superfícies</span>
                  <button onClick={() => { setFiles([]); setFaultFiles([]); clear(); }} className="text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="flex flex-col gap-2 mb-3">
                  {surfaceNames.map((name, idx) => (
                    <div key={idx} className="flex items-center justify-between group gap-2">
                      <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors shrink-0 ${theme === 'dark' ? 'text-zinc-400 hover:text-zinc-200' : 'text-zinc-500 hover:text-zinc-900'}`}>
                        <input 
                          type="checkbox" 
                          checked={visibleSurfaces[idx]} 
                          onChange={() => toggleSurfaceVisibility(idx)}
                          className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                        />
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setSurfaceName(idx, e.target.value)}
                        className={`bg-transparent border-b border-transparent focus:border-emerald-500 focus:outline-none text-sm flex-1 min-w-0 px-1 py-0.5 transition-colors ${theme === 'dark' ? 'hover:border-zinc-600 text-zinc-300' : 'hover:border-zinc-300 text-zinc-700'}`}
                        title={t('app.renameHorizon')}
                      />
                    </div>
                  ))}
                </div>

                {isTimeScale && (
                  <div className="flex items-start gap-2 mt-3 text-xs text-amber-400/90 bg-amber-400/10 p-2 rounded border border-amber-400/20">
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <p>{t('app.timeScaleDetected')}</p>
                  </div>
                )}
              </div>
            )}

            {surfaces.length > 0 && (
              <div className={`rounded-lg p-4 border mt-4 ${theme === 'dark' ? 'bg-zinc-800/80 border-zinc-700/50' : 'bg-white border-zinc-200 shadow-sm'}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  <Box size={14} />
                  {t('app.piecesVolumes')}
                </h3>
                <div className="flex flex-col gap-3">
                  {visibleLayers.map((visible, idx) => {
                    const isBaseLayer = idx === surfaces.length - 1 && showBasePlate;
                    const nameTop = surfaceNames[idx] || `${t('app.surface')} ${idx}`;
                    const nameBottom = isBaseLayer ? t('app.modelBaseName') : (surfaceNames[idx+1] || `${t('app.surface')} ${idx + 1}`);
                    
                    return (
                      <div key={idx} className={`flex flex-col gap-2 p-2 rounded border ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-700/30' : 'bg-zinc-50 border-zinc-200'}`}>
                        <div className="flex items-center justify-between group gap-2">
                          <label className={`flex items-center gap-2 text-sm cursor-pointer transition-colors flex-1 min-w-0 ${theme === 'dark' ? 'text-zinc-300 hover:text-zinc-100' : 'text-zinc-700 hover:text-zinc-900'}`}>
                            <input 
                              type="checkbox" 
                              checked={visible} 
                              onChange={() => toggleLayerVisibility(idx)}
                              className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                            />
                            <span className="truncate font-medium">
                              {isBaseLayer ? t('app.basePiece') : `${t('app.piece')} ${idx + 1}`}
                            </span>
                          </label>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            <input 
                              type="color" 
                              value={layerColors[idx] || '#3b82f6'} 
                              onChange={(e) => setLayerColor(idx, e.target.value)}
                              className={`w-5 h-5 rounded-full overflow-hidden border p-0 cursor-pointer bg-transparent hover:scale-110 transition-transform ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'}`}
                              title={t('app.chooseColor')}
                            />
                          </div>
                        </div>
                        
                        <div className={`flex items-center gap-1 text-[10px] ml-6 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                          <span className="truncate">{nameTop}</span>
                          <span className="px-1">→</span>
                          <span className="truncate">{nameBottom}</span>
                        </div>

                        {isBaseLayer && (
                          <div className="flex items-center gap-2 ml-6 mt-1">
                            <input
                              type="text"
                              value={basePieceName || t('app.modelBaseName')}
                              onChange={(e) => setBasePieceName(e.target.value)}
                              className={`bg-transparent border-b focus:border-emerald-500 focus:outline-none text-[10px] flex-1 min-w-0 px-1 py-0.5 transition-colors ${theme === 'dark' ? 'border-zinc-700 hover:border-zinc-600 text-zinc-400' : 'border-zinc-300 hover:border-zinc-400 text-zinc-600'}`}
                              placeholder={t('app.legendName')}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className={`text-[10px] mt-3 italic ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {t('app.piecesDesc')}
                </p>
              </div>
            )}
          </section>

          {/* Faults Input */}
          <section className="flex flex-col gap-4">
            <h2 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              <Activity size={16} />
              {t('app.faults')}
            </h2>
            
            <label className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-xl cursor-pointer transition-all ${theme === 'dark' ? 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 hover:border-red-500/50' : 'border-zinc-300 bg-zinc-100/50 hover:bg-zinc-100 hover:border-red-500/50'}`}>
              <div className="flex flex-col items-center justify-center pt-3 pb-3 text-center px-2">
                <Activity className={`w-6 h-6 mb-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`} />
                <p className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-600'}`}>{t('app.dropFaults')}</p>
                <p className="text-[10px] text-zinc-500">.grs, .txt, .xyz, .dat</p>
              </div>
              <input type="file" multiple accept=".grs,.txt,.xyz,.dat" className="hidden" onChange={handleFaultUpload} />
            </label>

            {faults.length > 0 && (
              <div className={`rounded-lg p-4 border ${theme === 'dark' ? 'bg-zinc-800/80 border-zinc-700/50' : 'bg-white border-zinc-200 shadow-sm'}`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={showFaults} 
                      onChange={(e) => setShowFaults(e.target.checked)}
                      className={`rounded focus:ring-red-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-red-500' : 'border-zinc-300 bg-white text-red-600'}`}
                    />
                    <span className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{faults.length} Falhas</span>
                  </div>
                  <button onClick={() => { setFaultFiles([]); setFaults([]); }} className="text-zinc-500 hover:text-red-400 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                    {faults.map((fault, idx) => (
                      <div key={fault.id} className={`flex items-center justify-between gap-2 p-1.5 rounded border group ${theme === 'dark' ? 'bg-zinc-900/40 border-zinc-700/30' : 'bg-zinc-50 border-zinc-200'}`}>
                        <label className={`flex items-center gap-2 text-[11px] cursor-pointer transition-colors flex-1 min-w-0 ${theme === 'dark' ? 'text-zinc-300 hover:text-zinc-100' : 'text-zinc-700 hover:text-zinc-900'}`}>
                          <input 
                            type="checkbox" 
                            checked={fault.visible} 
                            onChange={() => toggleFaultVisibility(idx)}
                            className={`rounded focus:ring-red-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-red-500' : 'border-zinc-300 bg-white text-red-600'}`}
                          />
                          <span className="truncate" title={fault.name}>{fault.name}</span>
                        </label>
                        <input 
                          type="color" 
                          value={fault.color} 
                          onChange={(e) => setFaultColor(idx, e.target.value)}
                          className="w-4 h-4 rounded-full overflow-hidden border border-zinc-700 p-0 cursor-pointer bg-transparent hover:scale-110 transition-transform"
                        />
                      </div>
                    ))}
                  </div>

                  <div className={`flex flex-col gap-2 pt-2 border-t ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
                    <label className={`text-[10px] uppercase tracking-wider flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      Espessura Global
                      <span className={theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}>{faultWidth}</span>
                    </label>
                    <input 
                      type="range" 
                      min="1" 
                      max="10" 
                      step="1" 
                      value={faultWidth} 
                      onChange={(e) => setFaultWidth(Number(e.target.value))}
                      className={`w-full accent-red-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Controls */}
          <section className="flex flex-col gap-6">
            <h2 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
              <Settings size={16} />
              {t('app.scaleAndDimensions')}
            </h2>

            <div className={`flex p-1 rounded-lg ${theme === 'dark' ? 'bg-zinc-800' : 'bg-zinc-100'}`}>
              <button 
                onClick={() => setScaleMode('size')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${scaleMode === 'size' ? (theme === 'dark' ? 'bg-zinc-700 text-emerald-400 shadow-sm' : 'bg-white text-emerald-600 shadow-sm') : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700')}`}
              >
                {t('app.fixedSize')}
              </button>
              <button 
                onClick={() => setScaleMode('scale')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${scaleMode === 'scale' ? (theme === 'dark' ? 'bg-zinc-700 text-emerald-400 shadow-sm' : 'bg-white text-emerald-600 shadow-sm') : (theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-500 hover:text-zinc-700')}`}
              >
                {t('app.realScale')}
              </button>
            </div>

            {scaleMode === 'size' ? (
              <div className="flex flex-col gap-2">
                <label className={`text-sm font-medium flex justify-between ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  {t('app.maxSize')}
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{modelSizeMm}</span>
                </label>
                <input
                  type="range"
                  min="50"
                  max="300"
                  step="10"
                  value={modelSizeMm}
                  onChange={(e) => setModelSizeMm(Number(e.target.value))}
                  className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className={`text-sm font-medium flex justify-between ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Escala (1cm = X metros)
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{metersPerCm}m</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">1:</span>
                  <input
                    type="number"
                    value={metersPerCm}
                    onChange={(e) => setMetersPerCm(Number(e.target.value))}
                    className={`border text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                  />
                </div>
                <p className={`text-[10px] italic ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  Tamanho resultante: {modelSizeMm.toFixed(1)}mm
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className={`flex items-center gap-2 mt-1 text-sm cursor-pointer ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                <input 
                  type="checkbox" 
                  checked={forceSquare} 
                  onChange={(e) => setForceSquare(e.target.checked)}
                  className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                />
                {t('app.forceSquare')}
              </label>
            </div>

            {isTimeScale && (
              <div className="flex flex-col gap-2">
                <label className={`text-sm font-medium flex justify-between ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                  Velocidade Média (m/s)
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{averageVelocity}</span>
                </label>
                <input
                  type="range"
                  min="1500"
                  max="6000"
                  step="50"
                  value={averageVelocity}
                  onChange={(e) => setAverageVelocity(Number(e.target.value))}
                  className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className={`text-sm font-medium flex justify-between ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                {t('app.verticalExaggeration')}
                <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{verticalExaggeration}x</span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                step="0.5"
                value={verticalExaggeration}
                onChange={(e) => setVerticalExaggeration(Number(e.target.value))}
                className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className={`text-sm font-medium flex justify-between ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                {t('app.clearance')}
                <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{clearance.toFixed(2)}</span>
              </label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={clearance}
                onChange={(e) => setClearance(Number(e.target.value))}
                className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
              />
              <p className={`text-xs ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.toleranceDesc')}</p>
            </div>
            
            <div className={`pt-4 border-t flex flex-col gap-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <h2 className={`text-sm font-semibold uppercase tracking-wider flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                <Eye size={16} />
                {t('app.visualization')}
              </h2>

              <label className={`flex items-center gap-2 text-sm cursor-pointer ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                <input 
                  type="checkbox" 
                  checked={showWireframe} 
                  onChange={(e) => setShowWireframe(e.target.checked)}
                  className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                />
                {t('app.showWireframe')}
              </label>

              <label className={`flex items-center gap-2 text-sm cursor-pointer ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                <input 
                  type="checkbox" 
                  checked={explodedView} 
                  onChange={(e) => setExplodedView(e.target.checked)}
                  className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                />
                {t('app.explodedView')}
              </label>

              <div className="flex flex-col gap-2">
                <label className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('app.colorMap')}</label>
                <select 
                  value={colorMap} 
                  onChange={(e) => setColorMap(e.target.value as any)}
                  className={`border text-xs rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                >
                  <option value="none">{t('app.colorMaps.none')}</option>
                  <option value="rainbow">{t('app.colorMaps.rainbow')}</option>
                  <option value="viridis">{t('app.colorMaps.viridis')}</option>
                  <option value="magma">{t('app.colorMaps.magma')}</option>
                </select>
              </div>

              <div className={`pt-2 border-t space-y-3 ${theme === 'dark' ? 'border-zinc-800/50' : 'border-zinc-200'}`}>
                <div className="flex items-center justify-between">
                  <label className={`text-sm cursor-pointer flex items-center gap-2 ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                    <input 
                      type="checkbox" 
                      checked={smoothMesh} 
                      onChange={(e) => setSmoothMesh(e.target.checked)}
                      className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                    />
                    {t('app.smoothMesh')}
                  </label>
                </div>
                
                {smoothMesh && (
                  <div className="flex flex-col gap-2 pl-6">
                    <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {t('app.smoothIterations')}
                      <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{smoothIterations}x</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="5"
                      step="1"
                      value={smoothIterations}
                      onChange={(e) => setSmoothIterations(Number(e.target.value))}
                      className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                    <p className={`text-[10px] italic ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                      Reduz ruído e suaviza ângulos bruscos na geometria.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className={`pt-4 border-t flex flex-col gap-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>Recorte (Cropping)</h3>
              
              <div className="flex flex-col gap-2">
                <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Eixo X (Largura)
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{cropXMin}% - {cropXMax}%</span>
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0" max={cropXMax - 5} step="1" 
                    value={cropXMin} onChange={(e) => setCropX(Number(e.target.value), cropXMax)} 
                    className={`w-1/2 accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`} 
                  />
                  <input 
                    type="range" min={cropXMin + 5} max="100" step="1" 
                    value={cropXMax} onChange={(e) => setCropX(cropXMin, Number(e.target.value))} 
                    className={`w-1/2 accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`} 
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  Eixo Y (Profundidade)
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{cropYMin}% - {cropYMax}%</span>
                </label>
                <div className="flex items-center gap-2">
                  <input 
                    type="range" min="0" max={cropYMax - 5} step="1" 
                    value={cropYMin} onChange={(e) => setCropY(Number(e.target.value), cropYMax)} 
                    className={`w-1/2 accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`} 
                  />
                  <input 
                    type="range" min={cropYMin + 5} max="100" step="1" 
                    value={cropYMax} onChange={(e) => setCropY(cropYMin, Number(e.target.value))} 
                    className={`w-1/2 accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`} 
                  />
                </div>
              </div>
            </div>
            
            <div className={`pt-4 border-t flex flex-col gap-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.basePlate')}</h3>
              
              <div className="flex flex-col gap-2">
                <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {t('app.baseThickness')}
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{baseThicknessMm}</span>
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="50"
                  step="0.1"
                  value={baseThicknessMm}
                  onChange={(e) => setBaseThicknessMm(Number(e.target.value))}
                  className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                />
                <p className={`text-[10px] italic ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  * A base plana é obrigatória para garantir a estabilidade do modelo.
                </p>
              </div>

              <label className={`flex items-center gap-2 text-sm cursor-pointer pt-2 border-t ${theme === 'dark' ? 'text-zinc-300 border-zinc-800/50' : 'text-zinc-700 border-zinc-200'}`}>
                <input 
                  type="checkbox" 
                  checked={showBasePlate} 
                  onChange={(e) => setShowBasePlate(e.target.checked)}
                  className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                />
                {t('app.showBasePlate')}
              </label>
              
              {showBasePlate && (
                <div className="flex flex-col gap-4 pl-6">
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('app.plateTitle')}</label>
                    <input
                      type="text"
                      value={basePlateTitle || ''}
                      onChange={(e) => setBasePlateTitle(e.target.value)}
                      className={`border text-xs rounded focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                      placeholder="Ex: Bacia de Campos"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('app.subtitleLabel')}</label>
                    <input
                      type="text"
                      value={basePlateSubtitle || ''}
                      onChange={(e) => setBasePlateSubtitle(e.target.value)}
                      className={`border text-xs rounded focus:ring-emerald-500 focus:border-emerald-500 block w-full p-2 ${theme === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-900'}`}
                      placeholder="Ex: Escala 1:1000"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {t('app.padding')}
                      <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{basePlatePadding || 0}mm</span>
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={basePlatePadding || 0}
                      onChange={(e) => setBasePlatePadding(Number(e.target.value))}
                      className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {t('app.thickness')}
                      <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{basePlateThicknessMm || 0}mm</span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={basePlateThicknessMm || 0}
                      onChange={(e) => setBasePlateThicknessMm(parseFloat(e.target.value))}
                      className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {t('app.textRelief')}
                      <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{basePlateTextRelief || 0}mm</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={basePlateTextRelief || 0}
                      onChange={(e) => setBasePlateTextRelief(Number(e.target.value))}
                      className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('app.plateColor')}</label>
                    <input 
                      type="color" 
                      value={basePlateColor || '#27272a'} 
                      onChange={(e) => setBasePlateColor(e.target.value)}
                      className={`w-6 h-6 rounded border p-0 cursor-pointer bg-transparent ${theme === 'dark' ? 'border-zinc-700' : 'border-zinc-300'}`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={`pt-4 border-t flex flex-col gap-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.partLabeling')}</h3>
              <label className={`flex items-center gap-2 text-sm cursor-pointer ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>
                <input 
                  type="checkbox" 
                  checked={embossLabels} 
                  onChange={(e) => setEmbossLabels(e.target.checked)}
                  className={`rounded focus:ring-emerald-500/50 ${theme === 'dark' ? 'border-zinc-600 bg-zinc-700 text-emerald-500' : 'border-zinc-300 bg-white text-emerald-600'}`}
                />
                {t('app.embossLabels')}
              </label>
              <p className={`text-xs ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                {t('app.labelingDesc')}
              </p>
              
              {embossLabels && (
                <div className="pl-6 flex flex-col gap-2">
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {t('app.labelSize')}
                      <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{labelSize}</span>
                    </label>
                    <input 
                      type="range" 
                      min="2" 
                      max={Math.max(10, Math.floor(modelSizeMm * 0.15 * Math.max(1, verticalExaggeration)))} 
                      step="1"
                      value={labelSize} 
                      onChange={(e) => setLabelSize(parseFloat(e.target.value))}
                      className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {t('app.labelThickness')}
                      <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{labelThickness}</span>
                    </label>
                    <input 
                      type="range" 
                      min="0.2" 
                      max="5" 
                      step="0.1"
                      value={labelThickness} 
                      onChange={(e) => setLabelThickness(parseFloat(e.target.value))}
                      className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className={`pt-4 border-t flex flex-col gap-4 ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <h3 className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.modelRotation')}</h3>
              
              <div className="flex flex-col gap-2">
                <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {t('app.axisX')}
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{rotationX}°</span>
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotationX}
                  onChange={(e) => setRotation('x', Number(e.target.value))}
                  className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {t('app.axisY')}
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{rotationY}°</span>
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotationY}
                  onChange={(e) => setRotation('y', Number(e.target.value))}
                  className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                />
              </div>
              
              <div className="flex flex-col gap-2">
                <label className={`text-xs flex justify-between ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {t('app.axisZ')}
                  <span className={`font-mono ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{rotationZ}°</span>
                </label>
                <input
                  type="range"
                  min="-180"
                  max="180"
                  step="1"
                  value={rotationZ}
                  onChange={(e) => setRotation('z', Number(e.target.value))}
                  className={`w-full accent-emerald-500 ${theme === 'light' ? 'opacity-80' : ''}`}
                />
              </div>
              
              <button 
                onClick={() => { setRotation('x', 0); setRotation('y', 0); setRotation('z', 0); }}
                className="text-xs text-emerald-500 hover:text-emerald-400 text-left transition-colors"
              >
                {t('app.resetRotation')}
              </button>
            </div>
          </section>

          {/* Footer / Author Info */}
          <section className={`mt-auto pt-6 border-t ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-200'}`}>
            <div className="flex flex-col gap-1">
              <p className={`text-[10px] uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.developedBy')}</p>
              <p className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>Raphael da Rocha Silveira</p>
              <p className={`text-[10px] mt-2 ${theme === 'dark' ? 'text-zinc-600' : 'text-zinc-400'}`}>© 2026 {t('app.allRightsReserved')}</p>
            </div>
          </section>
        </aside>

        {/* 3D Viewport */}
        <section className="flex-1 p-6 relative flex flex-col min-h-0 overflow-hidden">
          {visibleSurfaces.filter(Boolean).length < 2 && !loading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Layers className={`w-16 h-16 mx-auto mb-4 ${theme === 'dark' ? 'text-zinc-800' : 'text-zinc-200'}`} />
                <h3 className={`text-xl font-medium mb-2 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>{t('app.noDataLoaded')}</h3>
                <p className={`text-sm ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {t('app.uploadPrompt')}
                </p>
              </div>
            </div>
          ) : (
            <Viewer groupRef={groupRef} />
          )}

          {/* Scale Info Overlay */}
          {surfaces.length > 0 && (
            <div className={`absolute bottom-10 left-10 backdrop-blur-md border p-4 rounded-xl shadow-2xl pointer-events-none ${theme === 'dark' ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white/80 border-zinc-200 shadow-zinc-200/50'}`}>
              <div className="flex items-center gap-2 mb-2 text-emerald-400">
                <Info size={16} />
                <span className="text-xs font-bold uppercase tracking-widest">{t('app.modelScale')}</span>
              </div>
              <div className="space-y-1">
                <p className={`text-sm ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                  {t('app.realArea')}: <span className="font-mono text-emerald-400">{(dataWidth / 1000).toFixed(2)}km x {(dataHeight / 1000).toFixed(2)}km</span>
                </p>
                <p className={`text-xs ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  {t('app.printSize')}: <span className="font-mono">{modelSizeMm}mm x {(modelSizeMm * (dataHeight / dataWidth)).toFixed(0)}mm</span>
                </p>
                <p className={`text-[10px] italic mt-2 ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                  {t('app.cmToMetersWarning', { val: (dataWidth / (modelSizeMm / 10)).toFixed(0) })}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Thin Line Warning Modal */}
      {showThinLineWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border ${theme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
            <div className={`p-6 border-b flex justify-between items-center ${theme === 'dark' ? 'border-zinc-800' : 'border-zinc-100'}`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                  <AlertTriangle size={24} />
                </div>
                <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>{t('app.thinLinesWarning')}</h3>
              </div>
              <button 
                onClick={() => setShowThinLineWarning(false)}
                className={`transition-colors ${theme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className={`text-sm ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {t('app.thinLinesDetail1')}<span className={`${theme === 'dark' ? 'text-zinc-200' : 'text-zinc-800'} font-bold`}>0.4 mm</span>{t('app.thinLinesDetail2')}
              </p>
              
              <div className={`rounded-xl border p-4 space-y-3 ${theme === 'dark' ? 'bg-zinc-950/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
                {thinFeatures.map((feature, idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className={`text-sm font-medium ${theme === 'dark' ? 'text-zinc-300' : 'text-zinc-700'}`}>{feature.name}</span>
                    <span className="text-xs font-mono text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
                      {feature.width.toFixed(2)} mm
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <p className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>{t('app.howToFix')}</p>
                <ul className={`text-xs space-y-1 list-disc pl-4 ${theme === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                  <li dangerouslySetInnerHTML={{ __html: t('app.fixAutoFix') }} />
                  <li>{t('app.fixIncreaseSize')}</li>
                  <li>{t('app.fixSmallerNozzle')}</li>
                  <li dangerouslySetInnerHTML={{ __html: t('app.fixArachne') }} />
                </ul>
              </div>
            </div>

            <div className={`p-6 border-t flex gap-3 ${theme === 'dark' ? 'bg-zinc-950/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
              <button 
                onClick={autoFixThinLines}
                className={`flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg ${theme === 'dark' ? 'shadow-purple-900/20' : 'shadow-purple-200'} flex items-center justify-center gap-2`}
              >
                {t('app.autoFix')}
              </button>
              <button 
                onClick={() => {
                  setShowThinLineWarning(false);
                  if (pendingExport) pendingExport();
                }}
                className={`flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg ${theme === 'dark' ? 'shadow-emerald-900/20' : 'shadow-emerald-200'}`}
              >
                {t('app.exportAnyway')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

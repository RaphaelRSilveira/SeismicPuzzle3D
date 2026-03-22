import { create } from 'zustand';
import * as THREE from 'three';

export interface Fault {
  id: string;
  name: string;
  points: THREE.Vector3[];
  color: string;
  visible: boolean;
}

export interface AppState {
  surfaces: THREE.Vector3[][];
  surfaceNames: string[];
  visibleSurfaces: boolean[];
  visibleLayers: boolean[];
  layerColors: string[];
  gridWidth: number;
  gridHeight: number;
  isTimeScale: boolean;
  averageVelocity: number;
  verticalExaggeration: number;
  clearance: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  modelSizeMm: number;
  forceSquare: boolean;
  dataMaxDimension: number;
  dataWidth: number;
  dataHeight: number;
  baseThicknessMm: number;
  cropXMin: number;
  cropXMax: number;
  cropYMin: number;
  cropYMax: number;
  showWireframe: boolean;
  explodedView: boolean;
  colorMap: 'none' | 'rainbow' | 'viridis' | 'magma';
  smoothMesh: boolean;
  smoothIterations: number;
  showBasePlate: boolean;
  basePlateTitle: string;
  basePlateSubtitle: string;
  basePlateColor: string;
  basePlatePadding: number;
  basePlateThicknessMm: number;
  basePlateTextRelief: number;
  embossLabels: boolean;
  labelSize: number;
  labelThickness: number;
  basePieceName: string;
  basePieceColor: string;
  scaleMode: 'size' | 'scale';
  metersPerCm: number;
  lightingIntensity: number;
  faults: Fault[];
  faultWidth: number;
  showFaults: boolean;
  theme: 'dark' | 'light';
  lastUpdate: number;
  
  setSurfaces: (surfaces: THREE.Vector3[][], names: string[], width: number, height: number, isTime: boolean, dataMaxDim: number, dataWidth: number, dataHeight: number) => void;
  setSurfaceName: (index: number, name: string) => void;
  toggleSurfaceVisibility: (index: number) => void;
  toggleLayerVisibility: (index: number) => void;
  setLayerColor: (index: number, color: string) => void;
  setAverageVelocity: (v: number) => void;
  setVerticalExaggeration: (v: number) => void;
  setClearance: (c: number) => void;
  setRotation: (axis: 'x' | 'y' | 'z', value: number) => void;
  setModelSizeMm: (v: number) => void;
  setForceSquare: (v: boolean) => void;
  setBaseThicknessMm: (v: number) => void;
  setCropX: (min: number, max: number) => void;
  setCropY: (min: number, max: number) => void;
  setShowWireframe: (v: boolean) => void;
  setExplodedView: (v: boolean) => void;
  setColorMap: (v: 'none' | 'rainbow' | 'viridis' | 'magma') => void;
  setSmoothMesh: (v: boolean) => void;
  setSmoothIterations: (v: number) => void;
  setShowBasePlate: (v: boolean) => void;
  setBasePlateTitle: (v: string) => void;
  setBasePlateSubtitle: (v: string) => void;
  setBasePlateColor: (v: string) => void;
  setBasePlatePadding: (v: number) => void;
  setBasePlateThicknessMm: (v: number) => void;
  setBasePlateTextRelief: (v: number) => void;
  setEmbossLabels: (v: boolean) => void;
  setLabelSize: (v: number) => void;
  setLabelThickness: (v: number) => void;
  setBasePieceName: (v: string) => void;
  setBasePieceColor: (v: string) => void;
  setScaleMode: (v: 'size' | 'scale') => void;
  setMetersPerCm: (v: number) => void;
  setLightingIntensity: (v: number) => void;
  setFaults: (f: Fault[]) => void;
  setFaultColor: (index: number, color: string) => void;
  toggleFaultVisibility: (index: number) => void;
  setFaultWidth: (v: number) => void;
  setShowFaults: (v: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  generateExample: () => void;
  clear: () => void;
  exportProject: () => string;
  importProject: (jsonData: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  surfaces: [],
  surfaceNames: [],
  visibleSurfaces: [],
  visibleLayers: [],
  layerColors: [],
  gridWidth: 0,
  gridHeight: 0,
  isTimeScale: false,
  averageVelocity: 2000,
  verticalExaggeration: 1,
  clearance: 0.20,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  modelSizeMm: 100,
  forceSquare: false,
  dataMaxDimension: 1,
  dataWidth: 1,
  dataHeight: 1,
  baseThicknessMm: 0.2,
  cropXMin: 0,
  cropXMax: 100,
  cropYMin: 0,
  cropYMax: 100,
  showWireframe: false,
  explodedView: false,
  colorMap: 'none',
  smoothMesh: false,
  smoothIterations: 1,
  showBasePlate: false,
  basePlateTitle: 'Seismic Puzzle 3D',
  basePlateSubtitle: 'Escala: 1:1000',
  basePlateColor: '#27272a',
  basePlatePadding: 20,
  basePlateThicknessMm: 5,
  basePlateTextRelief: 1,
  embossLabels: false,
  labelSize: 2,
  labelThickness: 0.2,
  basePieceName: 'Base do Modelo',
  basePieceColor: '#4b5563',
  scaleMode: 'size',
  metersPerCm: 5000,
  lightingIntensity: 0.7,
  faults: [],
  faultWidth: 2,
  showFaults: true,
  theme: 'dark',
  lastUpdate: Date.now(),

  setSurfaces: (surfaces, names, gridWidth, gridHeight, isTimeScale, dataMaxDimension, dataWidth, dataHeight) => {
    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const numLayers = Math.max(0, surfaces.length);
    const colors = new Array(numLayers).fill('').map((_, i) => defaultColors[i % defaultColors.length]);
    
    const newState: any = { 
      surfaces, 
      surfaceNames: names, 
      visibleSurfaces: new Array(surfaces.length).fill(true), 
      visibleLayers: new Array(numLayers).fill(true),
      layerColors: colors,
      gridWidth, 
      gridHeight, 
      isTimeScale, 
      dataMaxDimension, 
      dataWidth, 
      dataHeight, 
      rotationX: 0, 
      rotationY: 0, 
      rotationZ: 0, 
      cropXMin: 0, 
      cropXMax: 100, 
      cropYMin: 0, 
      cropYMax: 100,
      faults: [], // Clear faults when new surfaces are loaded
      showBasePlate: false, // Reset base plate when new data is loaded
      lastUpdate: Date.now()
    };

    if (get().scaleMode === 'scale' && dataWidth > 0) {
      newState.modelSizeMm = (dataWidth / get().metersPerCm) * 10;
    }

    set(newState);
  },
  
  setSurfaceName: (index, name) => set((state) => {
    const newNames = [...state.surfaceNames];
    newNames[index] = name;
    return { surfaceNames: newNames };
  }),

  toggleSurfaceVisibility: (index) => set((state) => {
    const newVisible = [...state.visibleSurfaces];
    newVisible[index] = !newVisible[index];
    return { visibleSurfaces: newVisible };
  }),

  toggleLayerVisibility: (index) => set((state) => {
    const newVisible = [...state.visibleLayers];
    newVisible[index] = !newVisible[index];
    return { visibleLayers: newVisible };
  }),

  setLayerColor: (index, color) => set((state) => {
    const newColors = [...state.layerColors];
    newColors[index] = color;
    return { layerColors: newColors };
  }),

  setAverageVelocity: (averageVelocity) => set({ averageVelocity }),
  setVerticalExaggeration: (verticalExaggeration) => set({ verticalExaggeration }),
  setClearance: (clearance) => set({ clearance }),
  setRotation: (axis, value) => set((state) => ({
    ...state,
    [axis === 'x' ? 'rotationX' : axis === 'y' ? 'rotationY' : 'rotationZ']: value
  })),
  setModelSizeMm: (modelSizeMm) => set({ modelSizeMm }),
  setForceSquare: (forceSquare) => set({ forceSquare }),
  setBaseThicknessMm: (baseThicknessMm) => set({ baseThicknessMm: Math.max(0.2, baseThicknessMm) }),
  setCropX: (min, max) => set({ cropXMin: min, cropXMax: max }),
  setCropY: (min, max) => set({ cropYMin: min, cropYMax: max }),
  setShowWireframe: (showWireframe) => set({ showWireframe }),
  setExplodedView: (explodedView) => set({ explodedView }),
  setColorMap: (colorMap) => set({ colorMap }),
  setSmoothMesh: (smoothMesh) => set({ smoothMesh }),
  setSmoothIterations: (smoothIterations) => set({ smoothIterations }),
  setShowBasePlate: (showBasePlate) => set({ showBasePlate }),
  setBasePlateTitle: (basePlateTitle) => set({ basePlateTitle }),
  setBasePlateSubtitle: (basePlateSubtitle) => set({ basePlateSubtitle }),
  setBasePlateColor: (basePlateColor) => set({ basePlateColor }),
  setBasePlatePadding: (basePlatePadding) => set({ basePlatePadding }),
  setBasePlateThicknessMm: (basePlateThicknessMm) => set({ basePlateThicknessMm }),
  setBasePlateTextRelief: (basePlateTextRelief) => set({ basePlateTextRelief }),
  setEmbossLabels: (embossLabels) => set({ embossLabels }),
  setLabelSize: (labelSize) => set({ labelSize: Math.max(2, labelSize) }),
  setLabelThickness: (labelThickness) => set({ labelThickness: Math.max(0.2, labelThickness) }),
  setBasePieceName: (basePieceName) => set({ basePieceName }),
  setBasePieceColor: (basePieceColor) => set({ basePieceColor }),
  setScaleMode: (scaleMode) => set((state) => {
    if (scaleMode === 'scale' && state.dataWidth > 0) {
      const modelSizeMm = (state.dataWidth / state.metersPerCm) * 10;
      return { scaleMode, modelSizeMm };
    }
    return { scaleMode };
  }),
  setMetersPerCm: (metersPerCm) => set((state) => {
    if (state.scaleMode === 'scale' && state.dataWidth > 0) {
      const modelSizeMm = (state.dataWidth / metersPerCm) * 10;
      return { metersPerCm, modelSizeMm };
    }
    return { metersPerCm };
  }),
  setLightingIntensity: (lightingIntensity) => set({ lightingIntensity }),
  setFaults: (faults) => set({ faults }),
  setFaultColor: (index, color) => set((state) => {
    const newFaults = [...state.faults];
    newFaults[index] = { ...newFaults[index], color };
    return { faults: newFaults };
  }),
  toggleFaultVisibility: (index) => set((state) => {
    const newFaults = [...state.faults];
    newFaults[index] = { ...newFaults[index], visible: !newFaults[index].visible };
    return { faults: newFaults };
  }),
  setFaultWidth: (faultWidth) => set({ faultWidth }),
  setShowFaults: (showFaults) => set({ showFaults }),
  setTheme: (theme) => set({ theme }),
  
  generateExample: () => {
    const gridWidth = 50;
    const gridHeight = 50;
    const minX = 0, maxX = 1000;
    const minY = 0, maxY = 1000;
    
    const stepX = (maxX - minX) / (gridWidth - 1);
    const stepY = (maxY - minY) / (gridHeight - 1);
    
    const top: THREE.Vector3[] = [];
    const middle: THREE.Vector3[] = [];
    const base: THREE.Vector3[] = [];
    
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const px = minX + x * stepX;
        const py = minY + y * stepY;
        
        const zTop = Math.sin(px/200) * 50 + Math.cos(py/200) * 50 - 100;
        const zMid = Math.sin(px/150) * 40 + Math.cos(py/250) * 60 - 300;
        const zBase = Math.sin(px/300) * 30 + Math.cos(py/100) * 40 - 500;
        
        top.push(new THREE.Vector3(px, py, zTop));
        middle.push(new THREE.Vector3(px, py, zMid));
        base.push(new THREE.Vector3(px, py, zBase));
      }
    }

    // Create a sample fault stick (a vertical-ish plane crossing the model)
    const faultStick: Fault = {
      id: 'example-fault-1',
      name: 'Falha Principal',
      points: [
        new THREE.Vector3(-100, 200, 100),
        new THREE.Vector3(200, 300, 0),
        new THREE.Vector3(500, 500, -200),
        new THREE.Vector3(800, 700, -400),
        new THREE.Vector3(1100, 800, -600),
      ],
      color: '#ff0000',
      visible: true
    };

    const faultStick2: Fault = {
      id: 'example-fault-2',
      name: 'Falha Secundária',
      points: [
        new THREE.Vector3(800, -100, 50),
        new THREE.Vector3(700, 200, -150),
        new THREE.Vector3(600, 500, -350),
        new THREE.Vector3(500, 800, -550),
        new THREE.Vector3(400, 1100, -750),
      ],
      color: '#00ffff',
      visible: true
    };
    
    const dataWidth = 1000;
    const dataHeight = 1000;
    const newState: any = {
      surfaces: [top, middle, base],
      surfaceNames: ['Topo', 'Meio', 'Base'],
      visibleSurfaces: [true, true, true],
      visibleLayers: [true, true, true],
      layerColors: ['#3b82f6', '#10b981', '#f59e0b'],
      layerTextures: ['none', 'none', 'none'],
      gridWidth,
      gridHeight,
      isTimeScale: false,
      dataMaxDimension: 1000,
      dataWidth,
      dataHeight,
      faults: [faultStick, faultStick2],
      showFaults: true,
      verticalExaggeration: 1,
      clearance: 0.20,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      cropXMin: 0,
      cropXMax: 100,
      cropYMin: 0,
      cropYMax: 100,
      colorMap: 'none',
      showBasePlate: true
    };

    if (get().scaleMode === 'scale') {
      newState.modelSizeMm = (dataWidth / get().metersPerCm) * 10;
    }

    set(newState);
  },
  
  clear: () => set({ 
    surfaces: [], 
    surfaceNames: [], 
    visibleSurfaces: [], 
    gridWidth: 0, 
    gridHeight: 0, 
    rotationX: 0, 
    rotationY: 0, 
    rotationZ: 0, 
    dataMaxDimension: 1, 
    dataWidth: 1, 
    dataHeight: 1, 
    cropXMin: 0, 
    cropXMax: 100, 
    cropYMin: 0, 
    cropYMax: 100,
    faults: [],
    embossLabels: false,
    labelSize: 2,
    labelThickness: 0.2,
    baseThicknessMm: 0.2
  }),

  exportProject: () => {
    const state = get();
    // Filter out functions and complex objects we need to serialize manually
    const serializableState = Object.fromEntries(
      Object.entries(state).filter(([key, value]) => typeof value !== 'function' && key !== 'surfaces' && key !== 'faults')
    );
    
    const payload = {
      version: 1,
      ...serializableState,
      surfaces: state.surfaces.map(layer => layer.map(p => ({ x: p.x, y: p.y, z: p.z }))),
      faults: state.faults.map(f => ({ ...f, points: f.points.map(p => ({ x: p.x, y: p.y, z: p.z })) }))
    };
    
    return JSON.stringify(payload);
  },

  importProject: (jsonData: string) => {
    try {
      const payload = JSON.parse(jsonData);
      if (!payload.version) throw new Error("Invalid project file");
      
      const { version, surfaces, faults, ...restState } = payload;
      
      const parsedSurfaces = surfaces.map((layer: any[]) => layer.map(p => new THREE.Vector3(p.x, p.y, p.z)));
      const parsedFaults = faults.map((f: any) => ({
        ...f,
        points: f.points.map((p: any) => new THREE.Vector3(p.x, p.y, p.z))
      }));
      
      set({
        ...restState,
        surfaces: parsedSurfaces,
        faults: parsedFaults,
        lastUpdate: Date.now()
      });
    } catch (error) {
      console.error("Failed to import project:", error);
      alert("Erro ao carregar o projeto. O arquivo pode estar corrompido ou em um formato inválido.");
    }
  }
}));

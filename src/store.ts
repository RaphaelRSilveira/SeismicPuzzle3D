import { create } from 'zustand';
import * as THREE from 'three';

export interface AppState {
  surfaces: THREE.Vector3[][];
  surfaceNames: string[];
  visibleSurfaces: boolean[];
  visibleLayers: boolean[];
  surfaceColors: string[];
  surfaceTextures: string[];
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
  
  setSurfaces: (surfaces: THREE.Vector3[][], names: string[], width: number, height: number, isTime: boolean, dataMaxDim: number, dataWidth: number, dataHeight: number) => void;
  setSurfaceName: (index: number, name: string) => void;
  toggleSurfaceVisibility: (index: number) => void;
  toggleLayerVisibility: (index: number) => void;
  setSurfaceColor: (index: number, color: string) => void;
  setSurfaceTexture: (index: number, texture: string) => void;
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
  generateExample: () => void;
  clear: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  surfaces: [],
  surfaceNames: [],
  visibleSurfaces: [],
  visibleLayers: [],
  surfaceColors: [],
  surfaceTextures: [],
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
  baseThicknessMm: 10,
  cropXMin: 0,
  cropXMax: 100,
  cropYMin: 0,
  cropYMax: 100,
  showWireframe: false,
  explodedView: false,
  colorMap: 'none',
  smoothMesh: false,
  smoothIterations: 1,
  showBasePlate: true,
  basePlateTitle: 'SeismicPuzzle3D',
  basePlateSubtitle: 'Escala: 1:1000',
  basePlateColor: '#27272a',
  basePlatePadding: 20,
  basePlateThicknessMm: 5,
  basePlateTextRelief: 1,

  setSurfaces: (surfaces, names, gridWidth, gridHeight, isTimeScale, dataMaxDimension, dataWidth, dataHeight) => {
    const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];
    const colors = names.map((_, i) => defaultColors[i % defaultColors.length]);
    set({ 
      surfaces, 
      surfaceNames: names, 
      visibleSurfaces: new Array(surfaces.length).fill(true), 
      visibleLayers: new Array(Math.max(0, surfaces.length - 1 + (get().showBasePlate ? 1 : 0))).fill(true),
      surfaceColors: colors,
      surfaceTextures: new Array(surfaces.length).fill('none'),
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
      cropYMax: 100 
    });
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

  setSurfaceColor: (index, color) => set((state) => {
    const newColors = [...state.surfaceColors];
    newColors[index] = color;
    return { surfaceColors: newColors };
  }),

  setSurfaceTexture: (index, texture) => set((state) => {
    const newTextures = [...state.surfaceTextures];
    newTextures[index] = texture;
    return { surfaceTextures: newTextures };
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
  setBaseThicknessMm: (baseThicknessMm) => set({ baseThicknessMm }),
  setCropX: (min, max) => set({ cropXMin: min, cropXMax: max }),
  setCropY: (min, max) => set({ cropYMin: min, cropYMax: max }),
  setShowWireframe: (showWireframe) => set({ showWireframe }),
  setExplodedView: (explodedView) => set({ explodedView }),
  setColorMap: (colorMap) => set({ colorMap }),
  setSmoothMesh: (smoothMesh) => set({ smoothMesh }),
  setSmoothIterations: (smoothIterations) => set({ smoothIterations }),
  setShowBasePlate: (showBasePlate) => set((state) => {
    const newVisibleLayers = [...state.visibleLayers];
    if (showBasePlate && state.surfaces.length > 0 && newVisibleLayers.length < state.surfaces.length) {
      newVisibleLayers.push(true);
    } else if (!showBasePlate && newVisibleLayers.length === state.surfaces.length) {
      newVisibleLayers.pop();
    }
    return { showBasePlate, visibleLayers: newVisibleLayers };
  }),
  setBasePlateTitle: (basePlateTitle) => set({ basePlateTitle }),
  setBasePlateSubtitle: (basePlateSubtitle) => set({ basePlateSubtitle }),
  setBasePlateColor: (basePlateColor) => set({ basePlateColor }),
  setBasePlatePadding: (basePlatePadding) => set({ basePlatePadding }),
  setBasePlateThicknessMm: (basePlateThicknessMm) => set({ basePlateThicknessMm }),
  setBasePlateTextRelief: (basePlateTextRelief) => set({ basePlateTextRelief }),
  
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
    
    set({
      surfaces: [top, middle, base],
      surfaceNames: ['Topo', 'Meio', 'Base'],
      visibleSurfaces: [true, true, true],
      visibleLayers: [true, true],
      surfaceColors: ['#3b82f6', '#10b981', '#f59e0b'],
      surfaceTextures: ['none', 'none', 'none'],
      gridWidth,
      gridHeight,
      isTimeScale: false,
      verticalExaggeration: 1,
      clearance: 0.20,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      dataMaxDimension: 1000,
      dataWidth: 1000,
      dataHeight: 1000,
      cropXMin: 0,
      cropXMax: 100,
      cropYMin: 0,
      cropYMax: 100,
      colorMap: 'none'
    });
  },
  
  clear: () => set({ surfaces: [], surfaceNames: [], visibleSurfaces: [], gridWidth: 0, gridHeight: 0, rotationX: 0, rotationY: 0, rotationZ: 0, dataMaxDimension: 1, dataWidth: 1, dataHeight: 1, cropXMin: 0, cropXMax: 100, cropYMin: 0, cropYMax: 100 })
}));

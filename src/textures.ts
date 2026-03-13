
export const TACTILE_TEXTURES = {
  none: 'Lisa (Padrão)',
  rough: 'Rugosa (Áspera)',
  dotted: 'Pontilhada (Relevo)',
  striped: 'Listrada (Ranhuras)',
  grid: 'Quadriculada (Grid)'
};

export type TactileTextureType = keyof typeof TACTILE_TEXTURES;

export const LITHOLOGY_TEXTURES = {
  none: null,
  rough: null,
  dotted: null,
  striped: null,
  grid: null
};

export const LITHOLOGY_LABELS: Record<string, string> = TACTILE_TEXTURES;

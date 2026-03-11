
export const LITHOLOGY_TEXTURES = {
  none: null,
  salt: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/lava/lavatile.jpg', // Placeholder, will replace with better ones
  sandstone: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/grasslight-big.jpg',
  shale: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg',
  limestone: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/brick_diffuse.jpg',
  igneous: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/terrain/backgrounddetailed6.jpg'
};

export type LithologyType = keyof typeof LITHOLOGY_TEXTURES;

export const LITHOLOGY_LABELS: Record<LithologyType, string> = {
  none: 'Nenhuma',
  salt: 'Sal (Halita)',
  sandstone: 'Arenito',
  shale: 'Folhelho',
  limestone: 'Calcário',
  igneous: 'Ígnea'
};

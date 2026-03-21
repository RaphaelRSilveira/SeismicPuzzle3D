import { FontLoader, Font } from 'three/addons/loaders/FontLoader.js';

let cachedFont: Font | null = null;
let fontPromise: Promise<Font> | null = null;

export async function loadFont(): Promise<Font> {
  if (cachedFont) return cachedFont;
  if (fontPromise) return fontPromise;

  const loader = new FontLoader();
  fontPromise = new Promise((resolve, reject) => {
    loader.load(
      'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
      (font) => {
        cachedFont = font;
        resolve(font);
      },
      undefined,
      (err) => reject(err)
    );
  });

  return fontPromise;
}

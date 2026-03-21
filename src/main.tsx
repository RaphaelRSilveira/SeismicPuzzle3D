import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log(
  "%c SeismicPuzzle3D %c Developed by Raphael da Rocha Silveira %c © 2026 All Rights Reserved ",
  "background: #10b981; color: #fff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
  "background: #18181b; color: #fff; padding: 4px 8px;",
  "background: #27272a; color: #a1a1aa; padding: 4px 8px; border-radius: 0 4px 4px 0;"
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

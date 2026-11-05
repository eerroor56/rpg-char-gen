import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { registerSW } from './ui/Install';
import { initSelectPop } from './ui/selectPop';

registerSW();
initSelectPop();   // выпадающие списки в стиле сайта (на компьютере)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

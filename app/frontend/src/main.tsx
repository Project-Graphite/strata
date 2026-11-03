import { startTransition, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import { AuthProvider } from './auth';
import './styles/global.css';

function measureScrollbar() {
  document.documentElement.style.setProperty('--scrollbar-width', `${window.innerWidth - document.documentElement.getBoundingClientRect().width}px`);
}

function holdPageBehindMenu(event: WheelEvent | TouchEvent) {
  if (!document.querySelector('.MuiPopover-root')) return;
  for (let element = event.target instanceof Element ? event.target : null; element?.closest('.MuiPopover-paper, .nested-menu-flyout'); element = element.parentElement) {
    if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) return;
  }
  event.preventDefault();
}

measureScrollbar();
window.addEventListener('resize', measureScrollbar);
document.addEventListener('wheel', holdPageBehindMenu, { passive: false });
document.addEventListener('touchmove', holdPageBehindMenu, { passive: false });

startTransition(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  ),
);

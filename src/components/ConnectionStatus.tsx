import { useEffect, useRef, useState } from 'react';
export default function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const banner = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.allgoOffline = String(!online);
    const measure = () => document.documentElement.style.setProperty('--allgo-offline-height', `${banner.current?.getBoundingClientRect().height || 0}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (banner.current) observer.observe(banner.current);
    return () => { observer.disconnect(); delete document.documentElement.dataset.allgoOffline; document.documentElement.style.removeProperty('--allgo-offline-height'); };
  }, [online]);
  return online ? null : <aside ref={banner} role="alert" className="allgo-offline">You’re offline. Order and payment status may be out of date. Reconnect before booking or paying.</aside>;
}

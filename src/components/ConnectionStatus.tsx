import { useEffect, useState } from 'react';
export default function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online ? null : <aside role="alert" className="fixed inset-x-0 top-0 z-[100] bg-amber-100 p-3 text-center text-sm text-amber-950">You’re offline. Order and payment status may be out of date. Reconnect before booking or paying.</aside>;
}

'use client';
import { createContext, useContext, useState, PropsWithChildren, useCallback } from 'react';

type Toast = { id: number; text: string; kind?: 'ok'|'error' };
const Ctx = createContext<{ push:(t:Omit<Toast,'id'>)=>void }>({ push: () => {} });

export function ToastProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast,'id'>) => {
    const id = Date.now() + Math.random();
    setToasts(v => [...v, { id, ...t }]);
    setTimeout(() => setToasts(v => v.filter(x => x.id !== id)), 2800);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {toasts.map(t => (
          <div key={t.id}
            className={`px-3 py-2 rounded shadow text-sm ${t.kind==='error' ? 'bg-red-600 text-white' : 'bg-black/80 text-white'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

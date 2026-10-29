import type { ReactNode } from 'react';

export function DialogActions({ children, start }: { children: ReactNode; start?: ReactNode }) {
  return (
    <div className="dialog-actions mt-1 flex flex-wrap items-center justify-end gap-3">
      {start && <div className="mr-auto">{start}</div>}
      {children}
    </div>
  );
}

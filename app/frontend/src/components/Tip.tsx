import Tooltip from '@mui/material/Tooltip';
import type { ReactElement, ReactNode } from 'react';

export function Tip({ children, placement = 'top', title }: { children: ReactElement; placement?: 'top' | 'bottom' | 'left' | 'right'; title: ReactNode }) {
  return (
    <Tooltip disableInteractive enterDelay={300} enterNextDelay={100} placement={placement} title={title}>
      {children}
    </Tooltip>
  );
}

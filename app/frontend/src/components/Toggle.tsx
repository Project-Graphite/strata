import Switch from '@mui/material/Switch';
import { useId, type ReactNode } from 'react';

export function Toggle({ checked, description, disabled = false, label, onChange }: { checked: boolean; description?: ReactNode; disabled?: boolean; label: ReactNode; onChange: (checked: boolean) => void }) {
  const labelId = useId();
  return (
    <div className={`toggle-row ${disabled ? 'opacity-55' : ''}`}>
      <span>
        <span className="block" id={labelId}>
          {label}
        </span>
        {description && <span className="text-small text-muted">{description}</span>}
      </span>
      <Switch checked={checked} disabled={disabled} edge="end" onChange={(event) => onChange(event.target.checked)} slotProps={{ input: { 'aria-labelledby': labelId } }} />
    </div>
  );
}

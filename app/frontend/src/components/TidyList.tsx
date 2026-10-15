export function Choice({ checked, detail, label, onToggle }: { checked: boolean; detail: string; label: string; onToggle: () => void }) {
  return (
    <li>
      <label className="panel-row flex cursor-pointer items-center gap-3">
        <input checked={checked} onChange={onToggle} type="checkbox" />
        <span className="min-w-0 flex-1 truncate text-ink">{label || 'Untitled'}</span>
        <span className="mono-sm shrink-0 text-faint">{detail}</span>
      </label>
    </li>
  );
}


export function EyeGlyph({ filled = false }: { filled?: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" fill={filled ? 'currentColor' : 'none'} r="3" />
    </svg>
  );
}

export function ExpandGlyph() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />
    </svg>
  );
}

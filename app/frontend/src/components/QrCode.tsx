import { encode } from 'uqr';

export function QrCode({ label, value }: { label: string; value: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  const path = data
    .flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : '')))
    .join('');
  return (
    <svg
      aria-label={label}
      className="h-48 w-48 rounded-lg"
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${size} ${size}`}
    >
      <rect fill="#fff" height={size} width={size} />
      <path d={path} fill="#0c0c0e" />
    </svg>
  );
}

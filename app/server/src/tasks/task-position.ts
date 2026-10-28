export const positionGap = 1024;

export function positionBetween(previous: number | null, next: number | null) {
  if (previous === null) return next === null ? null : next - positionGap;
  if (next === null) return previous + positionGap;
  const middle = (previous + next) / 2;
  return middle > previous && middle < next ? middle : null;
}

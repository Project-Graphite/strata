export const builtInTaskTypes = ['task', 'idea'];

export function taskType(name: string) {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  return builtInTaskTypes.find((type) => type === trimmed.toLowerCase()) ?? trimmed;
}

export interface Note {
  id: string;
  spaceId: string;
  title: string;
  parentId: string | null;
  position: number;
  icon: string | null;
  pinnedAt: string | null;
  template: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteDetails extends Note {
  editable: boolean;
  path: { id: string; title: string }[];
}

export interface NoteBranch {
  note: Note;
  depth: number;
}

export function flattenTree(notes: Note[]) {
  const children = new Map<string | null, Note[]>();
  const known = new Set(notes.map((note) => note.id));
  for (const note of notes) {
    const parent = note.parentId && known.has(note.parentId) ? note.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), note]);
  }
  const branches: NoteBranch[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const note of children.get(parent) ?? []) {
      branches.push({ note, depth });
      visit(note.id, depth + 1);
    }
  };
  visit(null, 0);
  return branches;
}

export function realtimeUrl() {
  return `${window.location.origin.replace(/^http/, 'ws')}/api/v1/realtime`;
}

export const builtInTemplates = [
  ['meeting', 'Meeting notes'],
  ['journal', 'Journal'],
  ['project', 'Project brief'],
  ['recipe', 'Recipe'],
] as const;

export const noteTitle = (note: { title: string }) => note.title || 'Untitled';

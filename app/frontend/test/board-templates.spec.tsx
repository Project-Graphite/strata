import { describe, expect, it } from 'vitest';
import { boardTemplates } from '../src/components/board-templates';

describe('Board templates', () => {
  it('builds every template, with arrows that point at shapes in it', () => {
    expect(boardTemplates.map((template) => template.label)).toEqual(['Kanban', 'Retro', 'Mind map', 'Flowchart', 'Weekly planner', 'Mood board']);
    for (const template of boardTemplates) {
      const skeletons = template.build();
      expect(skeletons.length).toBeGreaterThan(2);
      const ids = new Set(skeletons.flatMap((skeleton) => ('id' in skeleton && skeleton.id ? [skeleton.id] : [])));
      for (const skeleton of skeletons) {
        if (skeleton.type !== 'arrow') continue;
        const ends = skeleton as { start?: { id?: string }; end?: { id?: string } };
        expect(ids.has(ends.start!.id!)).toBe(true);
        expect(ids.has(ends.end!.id!)).toBe(true);
      }
    }
    expect(boardTemplates.find((template) => template.id === 'kanban')!.build().filter((skeleton) => skeleton.type === 'text').map((skeleton) => (skeleton as { text: string }).text)).toEqual([
      'To do',
      'Doing',
      'Done',
    ]);
  });
});

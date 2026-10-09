import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform';

type Skeleton = ExcalidrawElementSkeleton;

const note = (x: number, y: number, text: string, backgroundColor = '#fff3bf'): Skeleton => ({
  type: 'rectangle',
  x,
  y,
  width: 200,
  height: 90,
  backgroundColor,
  fillStyle: 'solid',
  strokeColor: '#1e1e1e',
  roundness: { type: 3 },
  label: { text, fontSize: 18 },
});

function columns(titles: string[], colors: string[], height: number, sample?: string): Skeleton[] {
  return titles.flatMap((title, index): Skeleton[] => {
    const x = index * 260;
    return [
      { type: 'text', x: x + 10, y: 0, text: title, fontSize: 28 },
      { type: 'rectangle', x, y: 50, width: 240, height, strokeColor: '#adb5bd', strokeStyle: 'dashed', roundness: { type: 3 } },
      ...(index === 0 && sample ? [note(x + 20, 80, sample, colors[index])] : []),
    ];
  });
}

function mindMap(): Skeleton[] {
  const branches = ['Idea', 'Question', 'Next step', 'Resource'];
  const spots = [
    [-320, -160],
    [320, -160],
    [-320, 160],
    [320, 160],
  ] as const;
  return [
    { type: 'ellipse', id: 'centre', x: -110, y: -50, width: 220, height: 100, backgroundColor: '#d0bfff', fillStyle: 'solid', label: { text: 'Main idea', fontSize: 24 } },
    ...branches.flatMap((text, index): Skeleton[] => {
      const [x, y] = spots[index]!;
      return [
        { type: 'ellipse', id: `branch-${index}`, x: x - 90, y: y - 40, width: 180, height: 80, backgroundColor: '#e7f5ff', fillStyle: 'solid', label: { text } },
        { type: 'arrow', x: 0, y: 0, start: { id: 'centre' }, end: { id: `branch-${index}` }, endArrowhead: null },
      ];
    }),
  ];
}

function flowchart(): Skeleton[] {
  return [
    { type: 'ellipse', id: 'start', x: 0, y: 0, width: 180, height: 70, backgroundColor: '#b2f2bb', fillStyle: 'solid', label: { text: 'Start' } },
    { type: 'rectangle', id: 'step', x: 0, y: 140, width: 180, height: 80, label: { text: 'Do something' } },
    { type: 'diamond', id: 'check', x: -10, y: 290, width: 200, height: 120, backgroundColor: '#ffec99', fillStyle: 'solid', label: { text: 'Done?' } },
    { type: 'ellipse', id: 'end', x: 0, y: 480, width: 180, height: 70, backgroundColor: '#ffc9c9', fillStyle: 'solid', label: { text: 'End' } },
    { type: 'arrow', x: 0, y: 0, start: { id: 'start' }, end: { id: 'step' } },
    { type: 'arrow', x: 0, y: 0, start: { id: 'step' }, end: { id: 'check' } },
    { type: 'arrow', x: 0, y: 0, start: { id: 'check' }, end: { id: 'end' }, label: { text: 'yes' } },
  ];
}

export const boardTemplates: { id: string; label: string; build: () => Skeleton[] }[] = [
  { id: 'kanban', label: 'Kanban', build: () => columns(['To do', 'Doing', 'Done'], ['#fff3bf'], 520, 'A first card') },
  { id: 'retro', label: 'Retro', build: () => columns(['Went well', 'To improve', 'Actions'], ['#b2f2bb'], 520, 'Something that worked') },
  { id: 'mind-map', label: 'Mind map', build: mindMap },
  { id: 'flowchart', label: 'Flowchart', build: flowchart },
  { id: 'week', label: 'Weekly planner', build: () => columns(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ['#e7f5ff'], 420, 'Plan') },
  {
    id: 'mood',
    label: 'Mood board',
    build: () => [
      { type: 'text', x: 0, y: 0, text: 'Mood board', fontSize: 32 },
      ...[0, 1, 2, 3, 4, 5].map(
        (index): Skeleton => ({
          type: 'rectangle',
          x: (index % 3) * 260,
          y: 70 + Math.floor(index / 3) * 220,
          width: 240,
          height: 200,
          strokeColor: '#adb5bd',
          strokeStyle: 'dashed',
          label: { text: 'Drop an image', fontSize: 16, strokeColor: '#868e96' },
        }),
      ),
    ],
  },
];

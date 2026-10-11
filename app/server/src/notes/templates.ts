import { BadRequestException } from '@nestjs/common';
import * as Y from 'yjs';

export type Block = ['heading', string] | ['paragraph', string] | ['bullets', string[]] | ['numbers', string[]] | ['tasks', string[]];

export const builtInTemplates = {
  meeting: [
    ['heading', 'Attendees'],
    ['bullets', ['']],
    ['heading', 'Agenda'],
    ['bullets', ['']],
    ['heading', 'Notes'],
    ['paragraph', ''],
    ['heading', 'Actions'],
    ['tasks', ['']],
  ],
  journal: [
    ['heading', 'Today'],
    ['paragraph', ''],
    ['heading', 'Grateful for'],
    ['bullets', ['']],
    ['heading', 'Tomorrow'],
    ['tasks', ['']],
  ],
  project: [
    ['heading', 'Goal'],
    ['paragraph', ''],
    ['heading', 'Scope'],
    ['bullets', ['']],
    ['heading', 'Milestones'],
    ['tasks', ['']],
    ['heading', 'Risks'],
    ['bullets', ['']],
  ],
  recipe: [
    ['heading', 'Ingredients'],
    ['bullets', ['']],
    ['heading', 'Steps'],
    ['numbers', ['']],
    ['heading', 'Notes'],
    ['paragraph', ''],
  ],
} satisfies Record<string, Block[]>;

export type BuiltInTemplate = keyof typeof builtInTemplates;

function element(name: string, children: (Y.XmlElement | Y.XmlText)[], attributes: Record<string, number | boolean> = {}) {
  const node = new Y.XmlElement(name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value as never);
  node.insert(0, children);
  return node;
}

const paragraph = (text: string) => element('paragraph', text ? [new Y.XmlText(text)] : []);

function list(name: string, itemName: string, lines: string[], attributes: Record<string, number | boolean> = {}) {
  return element(
    name,
    lines.map((line) => element(itemName, [paragraph(line)], attributes)),
  );
}

export function blocksDocument(blocks: Block[]) {
  const document = new Y.Doc();
  document.getXmlFragment('default').push(
    blocks.map(([kind, content]) => {
      if (kind === 'heading') return element('heading', [new Y.XmlText(content)], { level: 2 });
      if (kind === 'paragraph') return paragraph(content);
      if (kind === 'bullets') return list('bulletList', 'listItem', content);
      if (kind === 'numbers') return list('orderedList', 'listItem', content);
      return list('taskList', 'taskItem', content, { checked: false });
    }),
  );
  return document;
}

export function templateDocument(template: BuiltInTemplate) {
  return blocksDocument(builtInTemplates[template]);
}

export function importedDocument(state: string) {
  const document = new Y.Doc();
  try {
    Y.applyUpdate(document, Buffer.from(state, 'base64'));
  } catch {
    throw new BadRequestException('That page could not be read');
  }
  return document;
}

export function textDocument(text: string) {
  return blocksDocument(
    text
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .map((line): Block => ['paragraph', line]),
  );
}

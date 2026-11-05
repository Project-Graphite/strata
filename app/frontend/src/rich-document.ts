export type RichNode = { type?: string; text?: string; content?: RichNode[] };

const blank = (node: RichNode) => node.type === 'paragraph' && (node.content ?? []).every((child) => child.type === 'hardBreak' || (child.type === 'text' && !child.text?.trim()));

export function withoutTrailingLines(document: RichNode): Record<string, unknown> | null {
  const content = [...(document.content ?? [])];
  while (content.length > 0 && blank(content.at(-1)!)) content.pop();
  const last = content.at(-1);
  if (last?.type === 'paragraph' && last.content) {
    const inline = [...last.content];
    while (inline.at(-1)?.type === 'hardBreak') inline.pop();
    content[content.length - 1] = { ...last, content: inline };
  }
  return content.length > 0 ? { ...document, content } : null;
}

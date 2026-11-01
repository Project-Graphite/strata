import type { JSONContent } from '@tiptap/core';

const alerts: Record<string, string> = { info: '[!NOTE]', success: '[!TIP]', warning: '[!WARNING]', danger: '[!CAUTION]' };

const escape = (text: string) => text.replace(/([\\`*_[\]<>~])/g, '\\$1');

function codeSpan(text: string) {
  const ticks = '`'.repeat(Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length)) + 1);
  return /^`|`$/.test(text) ? `${ticks} ${text} ${ticks}` : `${ticks}${text}${ticks}`;
}

function wrap(text: string, before: string, after = before) {
  const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? [];
  return core ? `${lead}${before}${core}${after}${trail}` : text;
}

const textOf = (node: JSONContent): string => node.text ?? (node.content ?? []).map(textOf).join('');

const prefixed = (text: string, first: string, rest = ' '.repeat(first.length)) =>
  text
    .split('\n')
    .map((line, index) => `${index === 0 ? first : line ? rest : rest.trimEnd()}${line}`)
    .join('\n');

export function pageMarkdown(doc: JSONContent, { title, pageUrl }: { title: string; pageUrl: string }) {
  const origin = new URL(pageUrl).origin;
  const headings: { level: number; text: string }[] = [];
  const collect = (node: JSONContent) => {
    if (node.type === 'heading' && textOf(node).trim()) headings.push({ level: Number(node.attrs?.level ?? 1), text: textOf(node).trim() });
    else node.content?.forEach(collect);
  };
  collect(doc);
  const top = Math.min(...headings.map((heading) => heading.level));
  const at = (node: JSONContent) => (typeof node.attrs?.id === 'string' ? `${pageUrl}#block-${node.attrs.id}` : pageUrl);

  function inline(nodes: JSONContent[] = []): string {
    return nodes
      .map((node) => {
        if (node.type === 'hardBreak') return '\\\n';
        if (node.type === 'mention') {
          const label = escape(String(node.attrs?.label ?? node.attrs?.id ?? ''));
          const href = typeof node.attrs?.href === 'string' && node.attrs.href.startsWith('/') ? `${origin}${node.attrs.href}` : undefined;
          return href ? `[${label}](${href})` : label;
        }
        if (node.type === 'personMention') return `@${escape(String(node.attrs?.label ?? ''))}`;
        if (node.type !== 'text' || !node.text) return '';
        const has = (name: string) => node.marks?.find((mark) => mark.type === name);
        let text = has('code') ? codeSpan(node.text) : escape(node.text);
        if (has('bold')) text = wrap(text, '**');
        if (has('italic')) text = wrap(text, '_');
        if (has('strike')) text = wrap(text, '~~');
        const link = has('link')?.attrs?.href;
        if (typeof link === 'string') text = `[${text}](${link})`;
        return text;
      })
      .join('');
  }

  function list(node: JSONContent) {
    const start = Number(node.attrs?.start ?? 1);
    return (node.content ?? [])
      .map((item, index) => {
        const marker = node.type === 'orderedList' ? `${start + index}. ` : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : '- ';
        return prefixed(blocks(item.content) || '', marker, ' '.repeat(node.type === 'taskList' ? 2 : marker.length));
      })
      .join('\n');
  }

  function table(node: JSONContent) {
    const rows = (node.content ?? []).map((row) => (row.content ?? []).map((cell) => blocks(cell.content).replace(/\n+/g, ' ').replace(/\|/g, '\\|') || ' '));
    const width = Math.max(...rows.map((row) => row.length));
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? ' ').join(' | ')} |`;
    return [line(rows[0] ?? []), line(Array.from({ length: width }, () => '---')), ...rows.slice(1).map(line)].join('\n');
  }

  function block(node: JSONContent): string {
    switch (node.type) {
      case 'paragraph':
        return inline(node.content).replace(/^(#{1,6}\s|[-+]\s|\d+[.)]\s)/, '\\$1');
      case 'heading':
        return `${'#'.repeat(Number(node.attrs?.level ?? 1))} ${inline(node.content)}`;
      case 'blockquote':
        return prefixed(blocks(node.content), '> ', '> ');
      case 'callout': {
        const alert = alerts[String(node.attrs?.tint)];
        return prefixed(alert ? `${alert}\n${blocks(node.content)}` : blocks(node.content), '> ', '> ');
      }
      case 'codeBlock': {
        const text = textOf(node);
        const fence = text.includes('```') ? '~~~~' : '```';
        return `${fence}${node.attrs?.language ?? ''}\n${text}\n${fence}`;
      }
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return list(node);
      case 'horizontalRule':
        return '---';
      case 'details': {
        const summary = node.content?.find((child) => child.type === 'detailsSummary');
        const body = node.content?.find((child) => child.type === 'detailsContent');
        return `<details>\n<summary>${escape(textOf(summary ?? {}))}</summary>\n\n${blocks(body?.content)}\n\n</details>`;
      }
      case 'table':
        return table(node);
      case 'columns':
        return (node.content ?? []).map((column) => blocks(column.content)).filter(Boolean).join('\n\n');
      case 'image': {
        const caption = typeof node.attrs?.caption === 'string' && node.attrs.caption ? `\n_${escape(node.attrs.caption)}_` : '';
        return `[Image: ${escape(String(node.attrs?.alt || 'image'))}](${at(node)})${caption}`;
      }
      case 'fileAttachment':
        return `[Attachment: ${escape(String(node.attrs?.name || 'file'))}](${at(node)})`;
      case 'linkCard': {
        const url = String(node.attrs?.url ?? '');
        const description = node.attrs?.description ? `\n${escape(String(node.attrs.description))}` : '';
        return `[${escape(String(node.attrs?.title || url))}](${url})${description}`;
      }
      case 'youtube':
        return `[YouTube video](${String(node.attrs?.src ?? '')})`;
      case 'boardEmbed':
        return `[Board](${origin}/boards/${String(node.attrs?.boardId ?? '')})`;
      case 'childPage':
        return `[Page](${origin}/notes/${String(node.attrs?.pageId ?? '')})`;
      case 'tableOfContents':
        return headings.map((heading) => `${'  '.repeat(heading.level - top)}- ${escape(heading.text)}`).join('\n');
      default:
        return blocks(node.content);
    }
  }

  function blocks(nodes: JSONContent[] = []): string {
    return nodes.map(block).filter((text) => text !== '').join('\n\n');
  }

  return `# ${escape(title)}\n\n${blocks(doc.content)}\n`;
}

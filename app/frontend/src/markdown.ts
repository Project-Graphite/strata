export type ImageFileId = (src: string) => string | undefined;

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escape = (text: string) => text.replace(/[&<>"]/g, (character) => entities[character]!);

const fencePattern = /^\s*(```|~~~)/;
const headingPattern = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const rulePattern = /^\s*([-*_])(\s*\1){2,}\s*$/;
const quotePattern = /^\s*>\s?/;
const itemPattern = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const tableDivider = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const imagePattern = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/;

export function imageSources(markdown: string) {
  return [...markdown.matchAll(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((match) => match[1]!);
}

function webLink(href: string) {
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

function formatted(text: string) {
  return escape(text)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, alt: string, src: string) =>
      webLink(src) ? `<a href="${src}">${alt || 'Image'}</a>` : alt,
    )
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_match, label: string, href: string) => (webLink(href) ? `<a href="${href}">${label}</a>` : label))
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*|(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)/g, (_match, stars: string, lines: string) => `<strong>${stars ?? lines}</strong>`)
    .replace(/\*(?=\S)(.+?)(?<=\S)\*|(?<!\w)_(?=\S)(.+?)(?<=\S)_(?!\w)/g, (_match, star: string, line: string) => `<em>${star ?? line}</em>`)
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<s>$1</s>');
}

function inline(text: string) {
  return text
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? `<code>${escape(part.slice(1, -1))}</code>` : formatted(part)))
    .join('');
}

const indentOf = (line: string) => line.match(/^\s*/)![0].replace(/\t/g, '    ').length;

function startsBlock(line: string) {
  return fencePattern.test(line) || headingPattern.test(line) || rulePattern.test(line) || quotePattern.test(line) || itemPattern.test(line) || /^\s*<\/?aside>/.test(line);
}

function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

function list(lines: string[], start: number): { html: string; next: number } {
  const indent = indentOf(lines[start]!);
  const ordered = /\d/.test(itemPattern.exec(lines[start]!)![2]!);
  const tasks = /^\[[ xX]\]\s/.test(itemPattern.exec(lines[start]!)![3]!);
  const items: string[] = [];
  let index = start;
  while (index < lines.length) {
    const match = itemPattern.exec(lines[index]!);
    if (!match || indentOf(lines[index]!) !== indent) break;
    const task = /^\[([ xX])\]\s+(.*)$/.exec(match[3]!);
    const text = [task ? task[2]! : match[3]!];
    let nested = '';
    index += 1;
    while (index < lines.length) {
      const line = lines[index]!;
      if (!line.trim()) {
        const following = lines.slice(index + 1).find((candidate) => candidate.trim());
        if (following === undefined || indentOf(following) <= indent) break;
        index += 1;
        continue;
      }
      if (indentOf(line) <= indent) break;
      if (itemPattern.test(line)) {
        const inner = list(lines, index);
        nested += inner.html;
        index = inner.next;
      } else {
        text.push(line.trim());
        index += 1;
      }
    }
    const body = `<p>${inline(text.join(' '))}</p>${nested}`;
    items.push(tasks ? `<li data-type="taskItem" data-checked="${task?.[1]?.toLowerCase() === 'x'}">${body}</li>` : `<li>${body}</li>`);
  }
  const tag = tasks ? 'ul data-type="taskList"' : ordered ? 'ol' : 'ul';
  return { html: `<${tag}>${items.join('')}</${tag.split(' ')[0]}>`, next: index };
}

export function markdownToHtml(markdown: string, image: ImageFileId): string {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = fencePattern.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith(fence[1]!)) code.push(lines[index++]!);
      out.push(`<pre><code>${escape(code.join('\n'))}</code></pre>`);
      index += 1;
      continue;
    }
    const heading = headingPattern.exec(line);
    if (heading) {
      out.push(`<h${heading[1]!.length}>${inline(heading[2]!)}</h${heading[1]!.length}>`);
      index += 1;
      continue;
    }
    if (rulePattern.test(line)) {
      out.push('<hr>');
      index += 1;
      continue;
    }
    if (/^\s*<aside>/.test(line)) {
      const inside: string[] = [line.replace(/^\s*<aside>/, '')];
      index += 1;
      while (index < lines.length && !/<\/aside>/.test(lines[index]!)) inside.push(lines[index++]!);
      if (index < lines.length) inside.push(lines[index++]!.replace(/<\/aside>.*/, ''));
      const text = inside.map((part) => part.trim()).filter(Boolean);
      out.push(`<div data-callout>${(text.length ? text : ['']).map((part) => `<p>${inline(part)}</p>`).join('')}</div>`);
      continue;
    }
    if (quotePattern.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && quotePattern.test(lines[index]!)) quoted.push(lines[index++]!.replace(quotePattern, ''));
      out.push(`<blockquote>${markdownToHtml(quoted.join('\n'), image) || '<p></p>'}</blockquote>`);
      continue;
    }
    if (itemPattern.test(line)) {
      const parsed = list(lines, index);
      out.push(parsed.html);
      index = parsed.next;
      continue;
    }
    if (line.includes('|') && tableDivider.test(lines[index + 1] ?? '')) {
      const header = cells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && lines[index]!.includes('|') && lines[index]!.trim()) rows.push(cells(lines[index++]!));
      const row = (values: string[], tag: string) => `<tr>${header.map((_, column) => `<${tag}><p>${inline(values[column] ?? '')}</p></${tag}>`).join('')}</tr>`;
      out.push(`<table><tbody>${row(header, 'th')}${rows.map((values) => row(values, 'td')).join('')}</tbody></table>`);
      continue;
    }
    const picture = imagePattern.exec(line.trim());
    if (picture) {
      const fileId = image(picture[2]!);
      const src = webLink(picture[2]!);
      out.push(fileId ? `<img alt="${escape(picture[1]!)}" data-file-id="${fileId}" src="">` : src ? `<p><a href="${escape(src)}">${escape(picture[1]! || 'Image')}</a></p>` : '');
      index += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() && !startsBlock(lines[index]!) && !imagePattern.test(lines[index]!.trim())) paragraph.push(lines[index++]!.trim());
    if (paragraph.length === 0) paragraph.push(lines[index++]!.trim());
    out.push(`<p>${inline(paragraph.join(' '))}</p>`);
  }
  return out.join('');
}

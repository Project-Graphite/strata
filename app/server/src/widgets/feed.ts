interface FeedItem {
  title: string;
  link: string;
  published: string | null;
}

export interface Feed {
  title: string;
  items: FeedItem[];
}

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function unwrapCdata(raw: string) {
  let unwrapped = '';
  let from = 0;
  for (;;) {
    const start = raw.indexOf('<![CDATA[', from);
    const end = start < 0 ? -1 : raw.indexOf(']]>', start + 9);
    if (end < 0) return unwrapped + raw.slice(from);
    unwrapped += raw.slice(from, start) + raw.slice(start + 9, end);
    from = end + 3;
  }
}

function text(raw: string) {
  return unwrapCdata(raw)
    .replace(/<[^<>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
      if (name[0] === '#') {
        const code = name[1]?.toLowerCase() === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      }
      return entities[name.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function tagged(source: string, name: string, from = 0) {
  const open = new RegExp(`<${name}[\\s>]`, 'gi');
  open.lastIndex = from;
  const start = open.exec(source);
  const opened = start ? source.indexOf('>', start.index) : -1;
  if (!start || opened < 0) return null;
  const close = new RegExp(`</${name}>`, 'gi');
  close.lastIndex = opened;
  const end = close.exec(source);
  return end ? { start: start.index, inner: source.slice(opened + 1, end.index), end: close.lastIndex } : null;
}

function element(block: string, name: string) {
  const found = tagged(block, name);
  return found ? text(found.inner) : '';
}

function blocks(xml: string, name: string) {
  const found: string[] = [];
  for (let block = tagged(xml, name); block; block = tagged(xml, name, block.end)) found.push(xml.slice(block.start, block.end));
  return found;
}

function webLink(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function atomLink(block: string) {
  const links = [...block.matchAll(/<link\b([^<>]*)>/gi)].map(([, attributes]) => ({
    href: attributes!.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? '',
    rel: attributes!.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] ?? 'alternate',
  }));
  return text(links.find((link) => link.rel === 'alternate')?.href ?? links[0]?.href ?? '');
}

function date(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function parseFeed(xml: string, limit = 20): Feed {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const head = xml.slice(0, xml.search(atom ? /<entry\b/i : /<item\b/i) >>> 0);
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml)) throw new Error('That address is not an RSS or Atom feed');
  return {
    title: element(head, 'title'),
    items: blocks(xml, atom ? 'entry' : 'item')
      .map((block) => ({
        title: element(block, 'title') || 'Untitled',
        link: webLink(atom ? atomLink(block) : element(block, 'link') || element(block, 'guid')),
        published: date(element(block, atom ? 'updated' : 'pubDate') || element(block, 'published') || element(block, 'dc:date')),
      }))
      .filter((item) => item.link)
      .slice(0, limit),
  };
}

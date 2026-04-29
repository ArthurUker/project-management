export interface MindmapBlockMatch {
  index: number;
  fullMatch: string;
  content: string;
  start: number;
  end: number;
}

export interface MarkdownTableMatch {
  index: number;
  fullMatch: string;
  tableText: string;
  start: number;
  end: number;
}

const MINDMAP_BLOCK_RE = /:::mindmap\s*\n([\s\S]*?)\n:::/g;
const TABLE_SEP_RE = /^\|[\s\-:|]+\|\s*$/;
const TABLE_MERGE_META_RE = /^\s*<!--\s*VTABLE_MERGE\s+(\{.*\})\s*-->\s*$/;

export function findMindmapBlocks(text: string): MindmapBlockMatch[] {
  const matches: MindmapBlockMatch[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = MINDMAP_BLOCK_RE.exec(text)) !== null) {
    matches.push({
      index,
      fullMatch: match[0],
      content: match[1].trim(),
      start: match.index,
      end: match.index + match[0].length,
    });
    index += 1;
  }
  MINDMAP_BLOCK_RE.lastIndex = 0;
  return matches;
}

export function extractMindmapBlock(text: string, index = 0): string | null {
  return findMindmapBlocks(text)[index]?.content ?? null;
}

export function replaceMindmapBlock(text: string, index: number, blockContent: string): string {
  const blocks = findMindmapBlocks(text);
  const target = blocks[index];
  const normalized = `:::mindmap\n${blockContent.trim()}\n:::`;
  if (!target) return `${text.trimEnd()}\n\n${normalized}\n`;
  return `${text.slice(0, target.start)}${normalized}${text.slice(target.end)}`;
}

export function upsertFirstMindmapBlock(text: string, blockContent: string): string {
  return replaceMindmapBlock(text, 0, blockContent);
}

export function appendMindmapBlock(text: string, blockContent: string): string {
  const normalized = `:::mindmap\n${blockContent.trim()}\n:::`;
  return `${text.trimEnd()}\n\n${normalized}\n`;
}

export function findMarkdownTables(text: string): MarkdownTableMatch[] {
  const lines = text.split('\n');
  const lineOffsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    lineOffsets.push(cursor);
    cursor += line.length + 1;
  }

  const tables: MarkdownTableMatch[] = [];
  let tableIndex = 0;

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1].trim();
    if (!line.startsWith('|') || !TABLE_SEP_RE.test(next)) continue;

    const headerStart = i;
    let start = headerStart;
    if (headerStart > 0 && TABLE_MERGE_META_RE.test(lines[headerStart - 1])) {
      start = headerStart - 1;
    }

    let end = i + 2;
    while (end < lines.length && lines[end].trim().startsWith('|')) end += 1;

    const startOffset = lineOffsets[start];
    const endOffset = end < lines.length ? lineOffsets[end] : text.length;
    const fullMatch = text.slice(startOffset, endOffset);
    const tableText = lines.slice(headerStart, end).join('\n');

    tables.push({
      index: tableIndex,
      fullMatch,
      tableText,
      start: startOffset,
      end: endOffset,
    });

    tableIndex += 1;
    i = end - 1;
  }

  return tables;
}

export function replaceMarkdownTable(text: string, index: number, blockContent: string): string {
  const tables = findMarkdownTables(text);
  const target = tables[index];
  const normalized = blockContent.trim();
  if (!target) return `${text.trimEnd()}\n\n${normalized}\n`;
  return `${text.slice(0, target.start)}${normalized}${text.slice(target.end)}`;
}

export function hasMarkdownTable(text: string): boolean {
  return findMarkdownTables(text).length > 0;
}
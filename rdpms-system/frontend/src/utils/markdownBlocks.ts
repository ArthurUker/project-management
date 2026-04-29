export interface MindmapBlockMatch {
  index: number;
  fullMatch: string;
  content: string;
  start: number;
  end: number;
}

const MINDMAP_BLOCK_RE = /:::mindmap\s*\n([\s\S]*?)\n:::/g;

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

export function hasMarkdownTable(text: string): boolean {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith('|') && /^\|[\s\-:|]+\|\s*$/.test(lines[i + 1].trim())) {
      return true;
    }
  }
  return false;
}
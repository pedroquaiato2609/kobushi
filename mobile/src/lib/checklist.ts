// Mirror exato de web/src/lib/checklist.ts.
export interface ListLine { checked: boolean | null; text: string } // checked null = linha comum

const ITEM = /^\s*[-*]\s*\[( |x|X)\]\s?(.*)$/;

export function parseList(content: string): ListLine[] {
  const trimmed = content.replace(/\n+$/, '');
  if (!trimmed) return [];
  return trimmed.split('\n').map((line) => {
    const m = ITEM.exec(line);
    return m ? { checked: m[1].toLowerCase() === 'x', text: m[2] } : { checked: null, text: line };
  });
}

export const serializeList = (lines: ListLine[]) =>
  lines.map((l) => (l.checked === null ? l.text : `- [${l.checked ? 'x' : ' '}] ${l.text}`)).join('\n');

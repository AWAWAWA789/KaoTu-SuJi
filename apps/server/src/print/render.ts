/**
 * 卡片 payload → 可打印纯文本
 * 用于排版引擎测量（前后端共用纯函数）
 */
import type { CardPayload } from '@kaotu/shared';

export function renderCardText(
  type: string,
  payload: CardPayload,
  side: 'front' | 'back',
): string {
  if (type === 'qa' || payload.type === 'qa') {
    const p = payload as { type: 'qa'; question: string; answer: string };
    return side === 'front' ? p.question : p.answer;
  }
  if (type === 'cloze' || payload.type === 'cloze') {
    const p = payload as {
      type: 'cloze';
      text: string;
      blanks: { token: string; hint?: string }[];
    };
    if (side === 'front') return p.text;
    return p.blanks.map((b) => b.token).join(' / ');
  }
  if (type === 'mindmap' || payload.type === 'mindmap') {
    const p = payload as { type: 'mindmap'; root: MindMapNode };
    if (side === 'front') return p.root.text;
    return flattenMindMap(p.root, 0);
  }
  return '';
}

interface MindMapNode {
  text: string;
  children?: MindMapNode[];
}

function flattenMindMap(node: MindMapNode, depth: number): string {
  const prefix = depth === 0 ? '' : `${'  '.repeat(depth - 1)}${depth === 1 ? '├─ ' : '└─ '}`;
  const lines = [`${prefix}${node.text}`];
  if (node.children) {
    for (const c of node.children) {
      lines.push(flattenMindMap(c, depth + 1));
    }
  }
  return lines.join('\n');
}

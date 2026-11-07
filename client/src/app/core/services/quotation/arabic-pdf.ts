// pdfmake has no per-glyph font fallback, so any Arabic text is split into runs and
// those runs are rendered with an Arabic-capable font. Non-Arabic text is left untouched.
export const ARABIC_FONT = 'NotoNaskhArabic';

const HAS_ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
// Arabic letters, plus spaces/digits/punctuation sitting between Arabic letters, stay in one run.
const ARABIC_RUN = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+(?:[\s\d.,:;()\-/\u200B]+[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+)*/g;

export function hasArabic(value: unknown): boolean {
  return typeof value === 'string' && HAS_ARABIC.test(value);
}

export function splitArabicRuns(value: string): any[] {
  const runs: any[] = [];
  let last = 0;
  for (const m of value.matchAll(ARABIC_RUN)) {
    const start = m.index ?? 0;
    if (start > last) runs.push({ text: value.slice(last, start) });
    // pdfmake lays text out left-to-right: fontkit shapes letters inside a word RTL, but word order must be flipped.
    const visual = m[0].replace(/​/g, '').split(/\s+/).reverse().join(' ');
    runs.push({ text: visual, font: ARABIC_FONT });
    last = start + m[0].length;
  }
  if (last < value.length) runs.push({ text: value.slice(last) });
  return runs;
}

// Walks a pdfmake content tree in place, converting string `text` nodes that contain Arabic into runs.
export function applyArabicFont(node: any): void {
  if (Array.isArray(node)) { node.forEach(applyArabicFont); return; }
  if (!node || typeof node !== 'object') return;
  if (typeof node.text === 'string') {
    if (hasArabic(node.text)) node.text = splitArabicRuns(node.text);
  } else if (Array.isArray(node.text)) {
    node.text = node.text.flatMap((part: any) => {
      if (typeof part === 'string') return hasArabic(part) ? splitArabicRuns(part) : [part];
      if (part && typeof part.text === 'string' && !part.font && hasArabic(part.text)) {
        return splitArabicRuns(part.text).map(r => ({ ...part, ...r }));
      }
      return [part];
    });
  }
  for (const key of ['table', 'ul', 'ol', 'stack', 'columns', 'body', 'content']) {
    if (node[key]) applyArabicFont(node[key]);
  }
}

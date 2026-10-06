/**
 * Word-level diff of two short texts (resume bullets), for highlighting what
 * an AI rewrite changed. Longest-common-subsequence over word tokens; bullets
 * are a few dozen words, so the quadratic table is trivially small.
 */

export interface DiffSegment {
  text: string;
  changed: boolean;
}

/** Words with their trailing whitespace, so joining segments restores the text. */
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

const bare = (token: string) => token.trim().toLowerCase();

function push(segments: DiffSegment[], text: string, changed: boolean): void {
  const last = segments[segments.length - 1];
  if (last && last.changed === changed) last.text += text;
  else segments.push({ text, changed });
}

export function diffWords(
  beforeText: string,
  afterText: string,
): { before: DiffSegment[]; after: DiffSegment[] } {
  const a = tokenize(beforeText);
  const b = tokenize(afterText);

  // lcs[i][j] = length of the LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] =
        bare(a[i]) === bare(b[j])
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const before: DiffSegment[] = [];
  const after: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (bare(a[i]) === bare(b[j])) {
      push(before, a[i++], false);
      push(after, b[j++], false);
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(before, a[i++], true);
    } else {
      push(after, b[j++], true);
    }
  }
  while (i < a.length) push(before, a[i++], true);
  while (j < b.length) push(after, b[j++], true);

  return { before, after };
}

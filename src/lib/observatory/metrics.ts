export function normalizeTranscript(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}'\s]/gu, " ").replace(/\s+/g, " ").trim();
}

export function wordErrorRate(reference: string, hypothesis: string) {
  const expected = normalizeTranscript(reference).split(" ").filter(Boolean);
  const actual = normalizeTranscript(hypothesis).split(" ").filter(Boolean);
  if (!expected.length) return null;

  const rows = Array.from({ length: expected.length + 1 }, () => Array<number>(actual.length + 1).fill(0));
  for (let i = 0; i <= expected.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= actual.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= expected.length; i += 1) {
    for (let j = 1; j <= actual.length; j += 1) {
      rows[i][j] = expected[i - 1] === actual[j - 1]
        ? rows[i - 1][j - 1]
        : Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + 1);
    }
  }
  return { errors: rows[expected.length][actual.length], referenceWords: expected.length, value: rows[expected.length][actual.length] / expected.length };
}

export function transcriptDiff(left: string, right: string) {
  const a = normalizeTranscript(left).split(" ").filter(Boolean);
  const b = normalizeTranscript(right).split(" ").filter(Boolean);
  const max = Math.max(a.length, b.length);
  return Array.from({ length: max }, (_, index) => ({ index, left: a[index] ?? "—", right: b[index] ?? "—", match: a[index] === b[index] }));
}

/** Nummerierung für TOC-Einträge (1., 1.1, …). */
export function withHeadingNumbering(headings: { level: number; text: string; id: string }[]) {
  const counters = [0, 0, 0, 0, 0, 0];
  return headings.map((heading) => {
    const idx = Math.min(Math.max(heading.level, 1), 6) - 1;
    counters[idx] += 1;
    for (let i = idx + 1; i < counters.length; i += 1) counters[i] = 0;
    const parts = counters.slice(0, idx + 1).filter((n) => n > 0);
    const numbering = parts.length <= 1 ? `${parts[0]}.` : parts.join('.');
    return {
      ...heading,
      numbering,
    };
  });
}

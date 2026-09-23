export function buildPageList(current: number, total: number) {
  const candidates = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...candidates].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  let previous = 0;
  for (const p of pages) {
    if (p - previous > 1) result.push("ellipsis");
    result.push(p);
    previous = p;
  }
  return result;
}
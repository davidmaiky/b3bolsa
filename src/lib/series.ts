// Pure helpers shared by server and client code (no database or network imports).
export interface Close { date: string; close: number }

/** Last known value at or before each date (null before the first observation). */
export function forwardFill(series: Close[], dates: string[]): (number | null)[] {
  const s = [...series].sort((a, b) => a.date.localeCompare(b.date));
  let i = 0;
  let last: number | null = null;
  return dates.map((d) => {
    while (i < s.length && s[i].date <= d) last = s[i++].close;
    return last;
  });
}

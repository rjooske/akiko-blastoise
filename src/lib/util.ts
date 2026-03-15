export function assert(b: boolean, message = "Assertion failed"): asserts b {
  if (!b) throw new Error(message);
}

export function unreachable(_: never): never {
  throw new Error("Should be unreachable");
}

export function strictParseInt(s: string): number | undefined {
  if (!/^\-?[0-9]+$/.test(s)) return undefined;
  const n = parseInt(s);
  if (!isNaN(n)) return n;
}

export function strictParseFloat(s: string): number | undefined {
  if (!/^\-?[0-9]*(\.[0-9]+)?$/.test(s)) return undefined;
  const n = parseFloat(s);
  if (!isNaN(n)) return n;
}

export function exactlyOne<T>(ts: Iterable<T>): T | undefined {
  let res: T | undefined;
  for (const t of ts) {
    if (res !== undefined) return undefined;
    res = t;
  }
  return res;
}

export function* filterMap<T, U>(
  ts: Iterable<T>,
  f: (t: T) => U | undefined,
): Generator<U, void, void> {
  for (const t of ts) {
    const u = f(t);
    if (u !== undefined) yield u;
  }
}

export function* dedupe<T>(
  ts: Iterable<T>,
  equal: (a: T, b: T) => boolean,
): Generator<T, void, void> {
  let lastT: T | undefined;
  for (const t of ts) {
    if (lastT === undefined || !equal(lastT, t)) yield t;
    lastT = t;
  }
}

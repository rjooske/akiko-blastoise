export function assert(b: boolean, message = "Assertion failed"): asserts b {
  if (!b) {
    throw new Error(message);
  }
}

export function unreachable(_: never): never {
  throw new Error("Should be unreachable");
}

export function strictParseInt(s: string): number | undefined {
  if (!/^\-?[0-9]+$/.test(s)) {
    return undefined;
  }
  const n = parseInt(s);
  if (!isNaN(n)) {
    return n;
  }
}

export function strictParseFloat(s: string): number | undefined {
  if (!/^\-?[0-9]*(\.[0-9]+)?$/.test(s)) {
    return undefined;
  }
  const n = parseFloat(s);
  if (!isNaN(n)) {
    return n;
  }
}

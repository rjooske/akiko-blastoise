import { exactlyOne, unreachable } from "./util";

declare const nominalIdentifier: unique symbol;
type Nominal<T, Identifier> = T & { [nominalIdentifier]: Identifier };

export type Term =
  | "spring-a"
  | "spring-b"
  | "spring-c"
  | "spring"
  | "summer-break"
  | "autumn-a"
  | "autumn-b"
  | "autumn-c"
  | "autumn"
  | "spring-break"
  | "all-year";

const TERM_ORDER: { [K in Term]: number } = {
  "spring-a": 0,
  "spring-b": 1,
  "spring-c": 2,
  spring: 3,
  "summer-break": 4,
  "autumn-a": 5,
  "autumn-b": 6,
  "autumn-c": 7,
  autumn: 8,
  "spring-break": 9,
  "all-year": 10,
};

export function termCompare(a: Term, b: Term): number {
  return TERM_ORDER[a] - TERM_ORDER[b];
}

export function termToString(t: Term): string {
  switch (t) {
    case "spring-a":
      return "春A";
    case "spring-b":
      return "春B";
    case "spring-c":
      return "春C";
    case "autumn-a":
      return "秋A";
    case "autumn-b":
      return "秋B";
    case "autumn-c":
      return "秋C";
    case "spring":
      return "春学期";
    case "autumn":
      return "秋学期";
    case "spring-break":
      return "春季休業中";
    case "summer-break":
      return "夏季休業中";
    case "all-year":
      return "通年";
    default:
      unreachable(t);
  }
}

export type Dow = "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

const DOW_ORDER: { [K in Dow]: number } = {
  mon: 0,
  tue: 1,
  wed: 2,
  thu: 3,
  fri: 4,
  sat: 5,
};

export function dowCompare(a: Dow, b: Dow): number {
  return DOW_ORDER[a] - DOW_ORDER[b];
}

export function dowsCompare(a: Dow[], b: Dow[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = dowCompare(a[i], b[i]);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

const WHEN_KIND_ORDER: { [K in When["kind"]]: number } = {
  regular: 0,
  intensive: 1,
  zuiji: 2,
  oudan: 3,
  nt: 4,
};

export function whenCompare(a: When, b: When): number {
  const kindDiff = WHEN_KIND_ORDER[a.kind] - WHEN_KIND_ORDER[b.kind];
  if (kindDiff !== 0) return kindDiff;
  if (a.kind === "regular" && b.kind === "regular") {
    return dowCompare(a.dow, b.dow) || a.period - b.period;
  }
  return 0;
}

export function dowToString(d: Dow): string {
  switch (d) {
    case "mon":
      return "月";
    case "tue":
      return "火";
    case "wed":
      return "水";
    case "thu":
      return "木";
    case "fri":
      return "金";
    case "sat":
      return "土";
    default:
      unreachable(d);
  }
}

export type When =
  | { kind: "regular"; dow: Dow; period: number }
  | { kind: "intensive" }
  | { kind: "zuiji" }
  | { kind: "oudan" }
  | { kind: "nt" };

export function whenToString(w: When): string {
  switch (w.kind) {
    case "regular":
      return dowToString(w.dow) + w.period;
    case "intensive":
      return "集中";
    case "zuiji":
      return "随時";
    case "oudan":
      return "応談";
    case "nt":
      return "NT";
    default:
      unreachable(w);
  }
}

export type TermSet = Term[];

export function termSetCompare(a: TermSet, b: TermSet): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = termCompare(a[i], b[i]);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function termSetEqual(a: TermSet, b: TermSet): boolean {
  return termSetCompare(a, b) === 0;
}

export type WhenSet = When[];

export function whenSetCompare(a: WhenSet, b: WhenSet): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = whenCompare(a[i], b[i]);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function whenSetEqual(a: WhenSet, b: WhenSet): boolean {
  return whenSetCompare(a, b) === 0;
}

export type Slot = { term: Term; when: When };

export function slotCompare(a: Slot, b: Slot): number {
  const t = termCompare(a.term, b.term);
  if (t !== 0) return t;
  return whenCompare(a.when, b.when);
}

export function slotToString(s: Slot): string {
  return termToString(s.term) + " " + whenToString(s.when);
}

export function createSlots(
  termSets: TermSet[],
  whenSets: WhenSet[],
): Slot[] | undefined {
  const slots: Slot[] = [];
  if (termSets.length === 1) {
    const termSet = termSets[0];
    for (const whenSet of whenSets) {
      for (const term of termSet) {
        for (const when of whenSet) {
          slots.push({ term, when });
        }
      }
    }
  } else if (whenSets.length === 1) {
    const whenSet = whenSets[0];
    for (const termSet of termSets) {
      for (const term of termSet) {
        for (const when of whenSet) {
          slots.push({ term, when });
        }
      }
    }
  } else if (termSets.length === whenSets.length) {
    for (let i = 0; i < termSets.length; i++) {
      const termSet = termSets[i];
      const whenSet = whenSets[i];
      for (const term of termSet) {
        for (const when of whenSet) {
          slots.push({ term, when });
        }
      }
    }
  } else {
    return undefined;
  }
  return slots;
}

export type CourseId = Nominal<string, "CourseId">;

export function isCourseId(s: string): s is CourseId {
  return /^[A-Z0-9]{7}$/.test(s);
}

export function isExpectedYear(n: number): boolean {
  return Number.isInteger(n) && 1 <= n && n <= 6;
}

/**
 * Availability condition
 */
export type Acond =
  | { kind: "unavailable-in"; year: number }
  | { kind: "odd-year-only" }
  | { kind: "even-year-only" }
  | { kind: "principally-biennial" }
  | { kind: "biennial" }
  | { kind: "closed-after"; year: number }
  | { kind: "periodic"; startYear: number; interval: number };

const ACOND_KIND_ORDER: { [K in Acond["kind"]]: number } = {
  "unavailable-in": 0,
  "odd-year-only": 1,
  "even-year-only": 2,
  "principally-biennial": 3,
  biennial: 4,
  "closed-after": 5,
  periodic: 6,
};

export function acondCompare(a: Acond, b: Acond): number {
  const kindDiff = ACOND_KIND_ORDER[a.kind] - ACOND_KIND_ORDER[b.kind];
  if (kindDiff !== 0) return kindDiff;
  switch (a.kind) {
    case "unavailable-in":
      return a.year - (b as typeof a).year;
    case "odd-year-only":
    case "even-year-only":
    case "principally-biennial":
    case "biennial":
      return 0;
    case "closed-after":
      return a.year - (b as typeof a).year;
    case "periodic":
      return (
        a.startYear - (b as typeof a).startYear ||
        a.interval - (b as typeof a).interval
      );
    default:
      unreachable(a);
  }
}

export function acondEqual(a: Acond, b: Acond): boolean {
  return acondCompare(a, b) === 0;
}

export function acondsCompare(a: Acond[], b: Acond[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = acondCompare(a[i], b[i]);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

export function acondsEqual(a: Acond[], b: Acond[]): boolean {
  return acondsCompare(a, b) === 0;
}

export type Availability = "available" | "unavailable" | "indeterminable";

export function getAvailability(aconds: Acond[], year: number): Availability {
  const onlyOne = exactlyOne(aconds);
  if (
    onlyOne !== undefined &&
    (onlyOne.kind === "principally-biennial" || onlyOne.kind === "biennial")
  )
    return "indeterminable";

  for (const a of aconds) {
    switch (a.kind) {
      case "unavailable-in":
        if (year === a.year) return "unavailable";
        break;
      case "odd-year-only":
        if (year % 2 === 0) return "unavailable";
        break;
      case "even-year-only":
        if (year % 2 !== 0) return "unavailable";
        break;
      case "closed-after":
        if (year > a.year) return "unavailable";
        break;
      case "periodic":
        if (!(year >= a.startYear && (year - a.startYear) % a.interval === 0))
          return "unavailable";
        break;
      case "principally-biennial":
      case "biennial":
        break;
      default:
        unreachable(a);
    }
  }

  return "available";
}

export type Course = {
  id: string;
  name: string;
  credit: string;
  expects: string;
  term: string;
  when: string;
  remark: string;
  parsedId: CourseId | undefined;
  parsedCredit: number | undefined;
  parsedExpects: number[] | undefined;
  parsedTermSets: TermSet[] | undefined;
  parsedWhenSets: WhenSet[] | undefined;
  parsedSlots: Slot[] | undefined;
  parsedAconds: Acond[] | undefined;
};

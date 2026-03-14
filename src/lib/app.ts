import { exactlyOne, unreachable } from "./util";

declare const nominalIdentifier: unique symbol;
type Nominal<T, Identifier> = T & { [nominalIdentifier]: Identifier };

export type Term =
  | "spring-a"
  | "spring-b"
  | "spring-c"
  | "autumn-a"
  | "autumn-b"
  | "autumn-c"
  | "spring"
  | "autumn"
  | "spring-break"
  | "summer-break"
  | "all-year";

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

export type Slot = { term: Term; when: When };

export function slotToString(s: Slot): string {
  return termToString(s.term) + " " + whenToString(s.when);
}

export function createSlots(
  termSets: Term[][],
  whenSets: When[][],
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

// Availability condition
export type Acond =
  | { kind: "unavailable-in"; year: number }
  | { kind: "odd-year-only" }
  | { kind: "even-year-only" }
  | { kind: "principally-biennial" }
  | { kind: "biennial" }
  | { kind: "closed-after"; year: number }
  | { kind: "periodic"; startYear: number; interval: number };

export function acondsToString(aconds: Acond[]): string {
  if (aconds.length === 0) {
    return "毎年";
  }

  return aconds
    .map((a) => {
      switch (a.kind) {
        case "unavailable-in":
          return `${a.year}年度休講`;
        case "odd-year-only":
          return "奇数年";
        case "even-year-only":
          return "偶数年";
        case "principally-biennial":
          return "原則隔年";
        case "biennial":
          return "隔年";
        case "closed-after":
          return `${a.year}年度で閉講`;
        case "periodic":
          return `${a.startYear}年度より${a.interval}年おき`;
        default:
          unreachable(a);
      }
    })
    .join(", ");
}

export function isAvailableIn(
  aconds: Acond[],
  year: number,
): boolean | undefined {
  const onlyOne = exactlyOne(aconds);
  if (
    onlyOne !== undefined &&
    (onlyOne.kind === "principally-biennial" || onlyOne.kind === "biennial")
  )
    return undefined;

  for (const a of aconds) {
    switch (a.kind) {
      case "unavailable-in":
        if (year === a.year) return false;
        break;
      case "odd-year-only":
        if (year % 2 === 0) return false;
        break;
      case "even-year-only":
        if (year % 2 !== 0) return false;
        break;
      case "closed-after":
        if (year > a.year) return false;
        break;
      case "periodic":
        if (!(year >= a.startYear && (year - a.startYear) % a.interval === 0))
          return false;
        break;
      case "principally-biennial":
      case "biennial":
        break;
      default:
        unreachable(a);
    }
  }

  return true;
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
  parsedTermSets: Term[][] | undefined;
  parsedWhenSets: When[][] | undefined;
  parsedSlots: Slot[] | undefined;
  parsedAconds: Acond[] | undefined;
};

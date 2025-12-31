import {
  createSlots,
  isCourseId,
  isExpectedYear,
  type Course,
  type Dow,
  type Term,
  type When,
} from "./app";
import { assert, strictParseFloat, strictParseInt, unreachable } from "./util";
import type { Cell, Worksheet } from "exceljs";

type Position = { row: number; col: number };

function findCellWithTextTrimmed(
  w: Worksheet,
  text: string,
): [Cell, Position] | undefined {
  for (let row = 1; row <= w.rowCount; row++) {
    for (let col = 1; col <= w.columnCount; col++) {
      const cell = w.findCell(row, col);
      if (cell !== undefined && cell.text.trim() === text) {
        return [cell, { row, col }];
      }
    }
  }
}

function parseCredit(s: string): number | undefined {
  if (s === "-") {
    return 0;
  }
  return strictParseFloat(s);
}

function parseExpects(s: string): number[] | undefined {
  if (s === "—" /* Em dash */) {
    return [];
  }

  const n = strictParseInt(s);
  if (n !== undefined && isExpectedYear(n)) {
    return [n];
  }

  if (s.includes("・")) {
    const expects: number[] = [];
    for (const chunk of s.split("・")) {
      const n = strictParseInt(chunk.trim());
      if (n === undefined || !isExpectedYear(n)) {
        return undefined;
      }
      expects.push(n);
    }
    expects.sort((a, b) => a - b);
    return expects;
  }

  if (s.includes("-" /* Hyphen */)) {
    const range: number[] = [];
    for (const chunk of s.split("-")) {
      const n = strictParseInt(chunk.trim());
      if (n === undefined || !isExpectedYear(n)) {
        return undefined;
      }
      range.push(n);
    }
    if (range.length !== 2) {
      return undefined;
    }
    const [first, last] = range;
    if (first >= last) {
      return undefined;
    }
    const expects: number[] = [];
    for (let i = first; i <= last; i++) {
      expects.push(i);
    }
    return expects;
  }
}

function parseTermSet(s: string): Term[] | undefined {
  type Token =
    | "spring-break"
    | "summer-break"
    | "spring-term"
    | "autumn-term"
    | "all-year"
    | "spring"
    | "autumn"
    | "a"
    | "b"
    | "c";
  const TOKEN_DEFINITIONS: [Token, string[]][] = [
    ["spring-break", ["春", "季", "休", "業", "中"]],
    ["summer-break", ["夏", "季", "休", "業", "中"]],
    ["spring-term", ["春", "学", "期"]],
    ["autumn-term", ["秋", "学", "期"]],
    ["all-year", ["通", "年"]],
    ["spring", ["春"]],
    ["autumn", ["秋"]],
    ["a", ["A"]],
    ["b", ["B"]],
    ["c", ["C"]],
  ];

  const tokens: Token[] = [];
  const chars = Array.from(s);
  chars: for (let i = 0; i < chars.length; ) {
    token: for (const [token, wantChars] of TOKEN_DEFINITIONS) {
      if (i + wantChars.length - 1 >= chars.length) {
        continue;
      }
      for (let j = 0; j < wantChars.length; j++) {
        if (chars[i + j] !== wantChars[j]) {
          continue token;
        }
      }
      tokens.push(token);
      i += wantChars.length;
      continue chars;
    }
    return undefined;
  }

  const parseTerm = (i: number): [number, Term[]] | undefined => {
    if (i >= tokens.length) {
      return undefined;
    }
    const first = tokens[i];
    switch (first) {
      case "spring-break":
        return [i + 1, ["spring-break"]];
      case "summer-break":
        return [i + 1, ["summer-break"]];
      case "spring-term":
        return [i + 1, ["spring"]];
      case "autumn-term":
        return [i + 1, ["autumn"]];
      case "all-year":
        return [i + 1, ["all-year"]];
      case "spring": {
        i++;
        const terms: Term[] = [];
        if (i < tokens.length && tokens[i] === "a") {
          terms.push("spring-a");
          i++;
        }
        if (i < tokens.length && tokens[i] === "b") {
          terms.push("spring-b");
          i++;
        }
        if (i < tokens.length && tokens[i] === "c") {
          terms.push("spring-c");
          i++;
        }
        if (terms.length !== 0) {
          return [i, terms];
        }
      }
      case "autumn": {
        i++;
        const terms: Term[] = [];
        if (i < tokens.length && tokens[i] === "a") {
          terms.push("autumn-a");
          i++;
        }
        if (i < tokens.length && tokens[i] === "b") {
          terms.push("autumn-b");
          i++;
        }
        if (i < tokens.length && tokens[i] === "c") {
          terms.push("autumn-c");
          i++;
        }
        if (terms.length !== 0) {
          return [i, terms];
        }
      }
      case "a":
      case "b":
      case "c":
        return undefined;
      default:
        unreachable(first);
    }
  };

  const terms: Term[] = [];
  let i = 0;
  while (i < tokens.length) {
    const result = parseTerm(i);
    if (result === undefined) {
      return undefined;
    }
    const [newI, newTerms] = result;
    i = newI;
    for (const t of newTerms) {
      terms.push(t);
    }
  }
  return terms;
}

function parseTermSets(s: string): Term[][] | undefined {
  const sets: Term[][] = [];
  for (const chunk of s.split("\n")) {
    const set = parseTermSet(chunk.trim());
    if (set === undefined) {
      return undefined;
    }
    sets.push(set);
  }
  return sets;
}

function parseWhenSet(s: string): When[] | undefined {
  type Token =
    | "mon"
    | "tue"
    | "wed"
    | "thu"
    | "fri"
    | "sat"
    | "intensive"
    | "zuiji"
    | "oudan"
    | "nt"
    | "comma"
    | "dot"
    | "hyphen"
    | number;

  function tokenToDow(t: Token): Dow | undefined {
    switch (t) {
      case "mon":
      case "tue":
      case "wed":
      case "thu":
      case "fri":
      case "sat":
        return t;
    }
  }

  const tokens: Token[] = [];
  const chars = Array.from(s);
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === "月") {
      tokens.push("mon");
    } else if (c === "火") {
      tokens.push("tue");
    } else if (c === "水") {
      tokens.push("wed");
    } else if (c === "木") {
      tokens.push("thu");
    } else if (c === "金") {
      tokens.push("fri");
    } else if (c === "土") {
      tokens.push("sat");
    } else if (c === ",") {
      tokens.push("comma");
    } else if (c === "・") {
      tokens.push("dot");
    } else if (c === "-") {
      tokens.push("hyphen");
    } else if (c === "集") {
      if (i < chars.length - 1 && chars[i + 1] === "中") {
        tokens.push("intensive");
        i++;
      }
    } else if (c === "随") {
      if (i < chars.length - 1 && chars[i + 1] === "時") {
        tokens.push("zuiji");
        i++;
      }
    } else if (c === "応") {
      if (i < chars.length - 1 && chars[i + 1] === "談") {
        tokens.push("oudan");
        i++;
      }
    } else if (c === "N") {
      if (i < chars.length - 1 && chars[i + 1] === "T") {
        tokens.push("nt");
        i++;
      }
    } else if (/^[1-8]$/.test(c)) {
      const digit = strictParseInt(c);
      assert(digit !== undefined);
      tokens.push(digit);
    } else {
      return undefined;
    }
  }

  let i = 0;

  const parsePeriodRange = (): [number, number] | undefined => {
    if (i + 2 >= tokens.length) {
      return undefined;
    }
    const from = tokens[i];
    const hyphen = tokens[i + 1];
    const to = tokens[i + 2];
    if (
      typeof from === "number" &&
      hyphen === "hyphen" &&
      typeof to === "number" &&
      from < to
    ) {
      i += 3;
      return [from, to];
    }
  };

  const parsePeriods = (): number[] | undefined => {
    if (i >= tokens.length) {
      return undefined;
    }
    const first = tokens[i];
    if (typeof first !== "number") {
      return undefined;
    }
    i++;
    const periods: number[] = [first];
    while (i + 1 < tokens.length) {
      const comma = tokens[i];
      const next = tokens[i + 1];
      if (!(comma === "comma" && typeof next === "number")) {
        break;
      }
      periods.push(next);
      i += 2;
    }
    return periods;
  };

  const parseDows = (): Dow[] | undefined => {
    if (i >= tokens.length) {
      return undefined;
    }
    const first = tokenToDow(tokens[i]);
    if (first === undefined) {
      return undefined;
    }
    i++;
    const dows: Dow[] = [first];
    while (i + 1 < tokens.length) {
      const dot = tokens[i];
      const next = tokenToDow(tokens[i + 1]);
      if (!(dot === "dot" && next !== undefined)) {
        break;
      }
      dows.push(next);
      i += 2;
    }
    return dows;
  };

  const parseNonRegularWhenKind = ():
    | "intensive"
    | "zuiji"
    | "oudan"
    | "nt"
    | undefined => {
    if (i >= tokens.length) {
      return undefined;
    }
    const t = tokens[i];
    if (t !== "intensive" && t !== "zuiji" && t !== "oudan" && t !== "nt") {
      return undefined;
    }
    i++;
    return t;
  };

  const parseWhenSet = (): When[] | undefined => {
    if (i >= tokens.length) {
      return undefined;
    }
    const lastI = i;
    const kind = parseNonRegularWhenKind();
    if (kind !== undefined) {
      return [{ kind }];
    }
    const dows = parseDows();
    if (dows === undefined) {
      i = lastI;
      return undefined;
    }
    let periods: number[] | undefined;
    const range = parsePeriodRange();
    if (range !== undefined) {
      const [from, to] = range;
      periods = [];
      for (let i = from; i <= to; i++) {
        periods.push(i);
      }
    } else {
      periods = parsePeriods();
    }
    if (periods === undefined) {
      i = lastI;
      return undefined;
    }
    const set: When[] = [];
    for (const dow of dows) {
      for (const period of periods) {
        set.push({ kind: "regular", dow, period });
      }
    }
    return set;
  };

  const parse = (): When[] | undefined => {
    const first = parseWhenSet();
    if (first === undefined) {
      return undefined;
    }
    const set: When[] = first;
    while (true) {
      if (!(i < tokens.length && tokens[i] === "comma")) {
        break;
      }
      i++;
      const next = parseWhenSet();
      if (next === undefined) {
        break;
      }
      for (const w of next) {
        set.push(w);
      }
    }
    return set;
  };

  return parse();
}

function parseWhenSets(s: string): When[][] | undefined {
  const sets: When[][] = [];
  for (const chunk of s.split("\n")) {
    const set = parseWhenSet(chunk.trim());
    if (set === undefined) {
      return undefined;
    }
    sets.push(set);
  }
  return sets;
}

export function parseCourses(worksheet: Worksheet): Course[] | undefined {
  const headers = [
    "科目番号",
    "科目名",
    "単位数",
    "標準履修年次",
    "実施学期",
    "曜時限",
  ];
  let headerRow: number | undefined;
  const headerCols: number[] = [];
  for (const header of headers) {
    const maybeCell = findCellWithTextTrimmed(worksheet, header);
    if (maybeCell === undefined) {
      return undefined;
    }
    const [, { row, col }] = maybeCell;
    if (headerRow === undefined) {
      headerRow = row;
    } else if (headerRow !== row) {
      return undefined;
    }
    headerCols.push(col);
  }
  assert(headerRow !== undefined);

  const courses: Course[] = [];
  for (let row = headerRow + 1; row <= worksheet.rowCount; row++) {
    const texts: string[] = [];
    for (const col of headerCols) {
      const cell = worksheet.findCell(row, col);
      if (cell === undefined) {
        return undefined;
      }
      texts.push(cell.text.trim().replaceAll("\r\n", "\n"));
    }
    const [id, name, credit, expects, term, when] = texts;
    const parsedId = isCourseId(id) ? id : undefined;
    const parsedCredit = parseCredit(credit);
    const parsedExpects = parseExpects(expects);
    const parsedTermSets = parseTermSets(term);
    const parsedWhenSets = parseWhenSets(when);
    courses.push({
      id,
      name,
      credit,
      expects,
      term,
      when,
      parsedId,
      parsedCredit,
      parsedExpects,
      parsedTermSets,
      parsedWhenSets,
      parsedSlots:
        parsedTermSets !== undefined && parsedWhenSets !== undefined
          ? createSlots(parsedTermSets, parsedWhenSets)
          : undefined,
    });
  }

  return courses;
}

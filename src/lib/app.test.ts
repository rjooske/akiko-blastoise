import { describe, expect, it } from "vitest";
import { slotsToString, type Dow, type Slot } from "./app";

function reg(dow: Dow, period: number): Slot["when"] {
  return { kind: "regular", dow, period };
}

describe("slotsToString", () => {
  it("empty slots → empty string", () => {
    expect(slotsToString([])).toBe("");
  });

  it("single slot", () => {
    const slots: Slot[] = [{ term: "spring-a", when: reg("fri", 1) }];
    expect(slotsToString(slots)).toBe("春A金1");
  });

  // period formatting

  it("two consecutive periods → comma", () => {
    const slots: Slot[] = [
      { term: "autumn-c", when: reg("thu", 5) },
      { term: "autumn-c", when: reg("thu", 6) },
    ];
    expect(slotsToString(slots)).toBe("秋C木5,6");
  });

  it("three consecutive periods → hyphen range", () => {
    const slots: Slot[] = [
      { term: "spring-b", when: reg("tue", 3) },
      { term: "spring-b", when: reg("tue", 4) },
      { term: "spring-b", when: reg("tue", 5) },
    ];
    expect(slotsToString(slots)).toBe("春B火3-5");
  });

  it("non-consecutive periods → comma-separated without range", () => {
    const slots: Slot[] = [
      { term: "autumn-a", when: reg("wed", 1) },
      { term: "autumn-a", when: reg("wed", 3) },
    ];
    expect(slotsToString(slots)).toBe("秋A水1,3");
  });

  // dow merging

  it("two dows with the same periods → dows concatenated", () => {
    const slots: Slot[] = [
      { term: "autumn-c", when: reg("mon", 3) },
      { term: "autumn-c", when: reg("mon", 4) },
      { term: "autumn-c", when: reg("thu", 3) },
      { term: "autumn-c", when: reg("thu", 4) },
    ];
    expect(slotsToString(slots)).toBe("秋C月木3,4");
  });

  it("two dows with different periods → not merged", () => {
    const slots: Slot[] = [
      { term: "spring-a", when: reg("mon", 1) },
      { term: "spring-a", when: reg("mon", 2) },
      { term: "spring-a", when: reg("wed", 3) },
      { term: "spring-a", when: reg("wed", 4) },
    ];
    expect(slotsToString(slots)).toBe("春A月1,2水3,4");
  });

  // term merging

  it("two terms with the same when → term letters merged", () => {
    const slots: Slot[] = [
      { term: "spring-a", when: reg("mon", 2) },
      { term: "spring-b", when: reg("mon", 2) },
    ];
    expect(slotsToString(slots)).toBe("春AB月2");
  });

  it("out-of-order slots are sorted before merging", () => {
    const slots: Slot[] = [
      { term: "autumn-b", when: reg("mon", 2) },
      { term: "autumn-a", when: reg("mon", 2) },
    ];
    expect(slotsToString(slots)).toBe("秋AB月2");
  });

  it("two terms × two periods → merged", () => {
    const slots: Slot[] = [
      { term: "autumn-a", when: reg("fri", 3) },
      { term: "autumn-a", when: reg("fri", 4) },
      { term: "autumn-b", when: reg("fri", 3) },
      { term: "autumn-b", when: reg("fri", 4) },
    ];
    expect(slotsToString(slots)).toBe("秋AB金3,4");
  });

  it("three terms × two dows × two periods → 秋ABC水3,4金5,6", () => {
    const slots: Slot[] = [];
    for (const term of ["autumn-a", "autumn-b", "autumn-c"] as const) {
      for (const period of [3, 4]) slots.push({ term, when: reg("wed", period) });
      for (const period of [5, 6]) slots.push({ term, when: reg("fri", period) });
    }
    expect(slotsToString(slots)).toBe("秋ABC水3,4金5,6");
  });

  it("terms with different whens → separate space-separated groups", () => {
    const slots: Slot[] = [
      { term: "autumn-a", when: reg("mon", 3) },
      { term: "autumn-a", when: reg("mon", 4) },
      { term: "autumn-a", when: reg("mon", 5) },
      { term: "autumn-b", when: reg("mon", 3) },
      { term: "autumn-b", when: reg("mon", 4) },
      { term: "autumn-b", when: reg("mon", 5) },
      { term: "autumn-c", when: reg("mon", 3) },
      { term: "autumn-c", when: reg("mon", 4) },
    ];
    expect(slotsToString(slots)).toBe("秋AB月3-5 秋C月3,4");
  });

  // non-regular whens

  it("all-year oudan → 通年応談", () => {
    const slots: Slot[] = [{ term: "all-year", when: { kind: "oudan" } }];
    expect(slotsToString(slots)).toBe("通年応談");
  });

  it("summer-break intensive → 夏休み集中", () => {
    const slots: Slot[] = [
      { term: "summer-break", when: { kind: "intensive" } },
    ];
    expect(slotsToString(slots)).toBe("夏休み集中");
  });

  it("four terms all oudan → 春ABC秋A応談", () => {
    const slots: Slot[] = [
      { term: "spring-a", when: { kind: "oudan" } },
      { term: "spring-b", when: { kind: "oudan" } },
      { term: "spring-c", when: { kind: "oudan" } },
      { term: "autumn-a", when: { kind: "oudan" } },
    ];
    expect(slotsToString(slots)).toBe("春ABC秋A応談");
  });
});

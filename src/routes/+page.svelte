<script lang="ts">
  import { dev } from "$app/environment";
  import {
    slotToString,
    termToString,
    whenToString,
    getAvailability,
    type Acond,
    type Course,
    type CourseId,
  } from "$lib/app";
  import { parseCourses } from "$lib/input";
  import { assert, unreachable } from "$lib/util";
  import * as exceljs from "exceljs";
  import { z } from "zod";

  const FAILED = "(解析失敗)";
  const NO_DATA = "(データなし)";

  // ── Syllabus JSON schema ───────────────────────────────────────────────────

  const TermSchema = z.enum([
    "spring-a", "spring-b", "spring-c",
    "autumn-a", "autumn-b", "autumn-c",
    "spring", "autumn", "spring-break", "summer-break", "all-year",
  ]);

  const DowSchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat"]);

  const WhenSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("regular"), dow: DowSchema, period: z.number() }),
    z.object({ kind: z.literal("intensive") }),
    z.object({ kind: z.literal("zuiji") }),
    z.object({ kind: z.literal("oudan") }),
    z.object({ kind: z.literal("nt") }),
  ]);

  const SlotSchema = z.object({ term: TermSchema, when: WhenSchema });

  const CourseIdSchema = z.string().regex(/^[A-Z0-9]{7}$/);

  const SyllabusCourseSchema = z.object({
    id: CourseIdSchema,
    name: z.string(),
    credit: z.number(),
    expects: z.array(z.number()),
    slots: z.array(SlotSchema),
  });

  const SyllabusDataSchema = z.object({
    courses: z.array(SyllabusCourseSchema),
    noSyllabus: z.array(CourseIdSchema),
    badSyllabus: z.array(CourseIdSchema),
  });

  type SyllabusCourse = z.infer<typeof SyllabusCourseSchema>;
  type SyllabusData = z.infer<typeof SyllabusDataSchema>;

  type SyllabusLookup =
    | {
        courseMap: Map<string, SyllabusCourse>;
        noSet: Set<string>;
        badSet: Set<string>;
      }
    | undefined;

  // ── Column keys ────────────────────────────────────────────────────────────

  type ColumnKey =
    | "id"
    | "credit"
    | "expects"
    | "termSets"
    | "whenSets"
    | "aconds"
    | "availability"
    | "slots"
    | "syllabusStatus";

  const ALL_COLS: ColumnKey[] = [
    "id",
    "credit",
    "expects",
    "termSets",
    "whenSets",
    "aconds",
    "availability",
    "slots",
    "syllabusStatus",
  ];

  const testFiles = dev
    ? import.meta.glob<string>(["../excel/*.xlsx", "!../excel/~$*.xlsx"], {
        eager: true,
        query: "?base64",
        import: "default",
      })
    : {};

  function createSyllabusUrl(year: string, courseId: string): string {
    return `https://kdb.tsukuba.ac.jp/syllabi/${year}/${courseId}/jpn`;
  }

  function getAcademicYear(d: Date): number {
    if (d.getMonth() <= 2) {
      return d.getFullYear() - 1;
    } else {
      return d.getFullYear();
    }
  }

  function acondsToString(aconds: Acond[]): string {
    if (aconds.length === 0) return "（空）";
    return aconds
      .map((a) => {
        switch (a.kind) {
          case "unavailable-in":
            return `${a.year}年度開講せず`;
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

  function courseColumnValue(
    c: Course,
    col: ColumnKey,
    year: number,
    syllabus: SyllabusLookup,
  ): string {
    switch (col) {
      case "id":
        return c.parsedId ?? FAILED;
      case "credit":
        return c.parsedCredit !== undefined ? String(c.parsedCredit) : FAILED;
      case "expects":
        return c.parsedExpects !== undefined
          ? c.parsedExpects.join(", ")
          : FAILED;
      case "termSets":
        return c.parsedTermSets !== undefined
          ? c.parsedTermSets
              .map((s) => s.map(termToString).join(" "))
              .join(" / ")
          : FAILED;
      case "whenSets":
        return c.parsedWhenSets !== undefined
          ? c.parsedWhenSets
              .map((s) => s.map(whenToString).join(" "))
              .join(" / ")
          : FAILED;
      case "aconds":
        return c.parsedAconds !== undefined
          ? acondsToString(c.parsedAconds)
          : FAILED;
      case "availability": {
        if (c.parsedAconds === undefined) return FAILED;
        const a = getAvailability(c.parsedAconds, year);
        switch (a) {
          case "available":
            return "✅ 開講";
          case "unavailable":
            return "❌ 非開講";
          case "indeterminable":
            return "❓ 不明";
          default:
            unreachable(a);
        }
      }
      case "slots":
        return c.parsedSlots !== undefined
          ? c.parsedSlots.map(slotToString).join(", ")
          : FAILED;
      case "syllabusStatus": {
        if (syllabus === undefined) return NO_DATA;
        if (syllabus.noSet.has(c.id)) return "シラバスなし";
        if (syllabus.badSet.has(c.id)) return "解析失敗";
        if (syllabus.courseMap.has(c.id)) return "あり";
        return "不明";
      }
      default:
        unreachable(col);
    }
  }

  let courses = $state.raw<Course[] | undefined>();
  let loading = $state(false);
  let showRaw = $state(false);
  let filterIdPrefix = $state("");
  let filterNameQuery = $state("");
  let year = $state(getAcademicYear(new Date()));
  let syllabusData = $state.raw<SyllabusData | undefined>(undefined);
  type Tab = "inspect" | "fix";
  let activeTab = $state<Tab>("inspect");
  const COL_LABELS: Record<ColumnKey, string> = {
    id: "科目番号",
    credit: "単位数",
    expects: "標準履修年次",
    termSets: "実施学期",
    whenSets: "曜時限",
    aconds: "開講状況",
    availability: "今年度開講",
    slots: "実施学期＋曜時限",
    syllabusStatus: "シラバス状況",
  };

  const syllabusLookup = $derived.by((): SyllabusLookup => {
    if (syllabusData === undefined) return undefined;
    const courseMap = new Map(syllabusData.courses.map((c) => [c.id, c]));
    const noSet = new Set(syllabusData.noSyllabus);
    const badSet = new Set(syllabusData.badSyllabus);
    return { courseMap, noSet, badSet };
  });

  let hiddenColumnValues = $state(new Map<ColumnKey, Set<string>>());
  let openFilterColumn = $state<ColumnKey | undefined>(undefined);
  let dialogEl = $state<HTMLDialogElement | undefined>(undefined);
  let ignoreGraduateCourses = $state(true);

  $effect(() => {
    if (openFilterColumn !== undefined) {
      if (!dialogEl?.open) dialogEl?.showModal();
    } else {
      dialogEl?.close();
    }
  });

  // Only compute distinct values for the column whose dialog is currently open.
  const openColumnValues = $derived.by((): string[] => {
    if (courses === undefined || openFilterColumn === undefined) return [];
    const seen = new Set<string>();
    for (const c of courses) {
      seen.add(courseColumnValue(c, openFilterColumn, year, syllabusLookup));
    }
    return [...seen].sort();
  });

  function columnValues(col: ColumnKey): string[] {
    if (courses === undefined) return [];
    const seen = new Set<string>();
    for (const c of courses) {
      seen.add(courseColumnValue(c, col, year, syllabusLookup));
    }
    return [...seen];
  }

  function checkAllVisibility() {
    hiddenColumnValues = new Map();
  }

  function uncheckAllVisibility() {
    hiddenColumnValues = new Map(ALL_COLS.map((col) => [col, new Set(columnValues(col))]));
  }

  function hasFilter(col: ColumnKey): boolean {
    const h = hiddenColumnValues.get(col);
    return h !== undefined && h.size > 0;
  }

  function toggleColumnValue(col: ColumnKey, value: string): void {
    const next = new Set(hiddenColumnValues.get(col) ?? []);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    hiddenColumnValues = new Map(hiddenColumnValues).set(col, next);
  }

  function checkAllColumn(col: ColumnKey): void {
    const next = new Map(hiddenColumnValues);
    next.delete(col);
    hiddenColumnValues = next;
  }

  function uncheckAllColumn(col: ColumnKey): void {
    hiddenColumnValues = new Map(hiddenColumnValues).set(col, new Set(columnValues(col)));
  }

  let rowLimit = $state(100);

  let visibleCourses = $derived.by(() => {
    if (courses === undefined) {
      return undefined;
    }

    const idPrefix = filterIdPrefix.trim().toLowerCase();
    const nameQuery = filterNameQuery.trim().toLowerCase();

    return courses.filter((c) => {
      if (idPrefix && !c.id.toLowerCase().startsWith(idPrefix)) return false;
      if (nameQuery && !c.name.toLowerCase().includes(nameQuery)) return false;
      for (const [col, hidden] of hiddenColumnValues) {
        if (hidden.size > 0 && hidden.has(courseColumnValue(c, col, year, syllabusLookup)))
          return false;
      }
      return true;
    });
  });

  const displayedCourses = $derived(visibleCourses?.slice(0, rowLimit));

  async function loadFile(bytes: ArrayBuffer): Promise<void> {
    loading = true;
    const w = new exceljs.Workbook();
    await w.xlsx.load(bytes);
    let cs = parseCourses(w.worksheets[0]);
    if (cs === undefined) {
      window.alert("ファイルの読み込みに失敗しました");
    }
    if (cs !== undefined && ignoreGraduateCourses) {
      cs = cs.filter((c) => !c.id.startsWith("0"));
    }
    courses = cs;
    hiddenColumnValues = new Map();
    loading = false;
  }

  async function handleFileInput(input: HTMLInputElement): Promise<void> {
    assert(input.files !== null);
    if (input.files.length === 0) {
      return;
    }
    const bytes = await input.files[0].bytes();
    await loadFile(bytes.buffer);
  }

  async function loadFromBase64(base64: string): Promise<void> {
    const bytesString = window.atob(base64);
    const bytes = new Uint8Array(bytesString.length);
    for (let i = 0; i < bytesString.length; i++) {
      bytes[i] = bytesString[i].charCodeAt(0);
    }
    await loadFile(bytes.buffer);
  }

  async function handleJsonInput(input: HTMLInputElement): Promise<void> {
    if (input.files === null || input.files.length === 0) return;
    const text = await input.files[0].text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      window.alert("JSONの解析に失敗しました");
      return;
    }
    const result = SyllabusDataSchema.safeParse(json);
    if (!result.success) {
      window.alert("JSONの形式が正しくありません\n" + result.error.message);
      return;
    }
    syllabusData = result.data;
  }

  function handleCopyOutput(): void {
    if (courses === undefined) {
      return;
    }
    let elements = "";
    const coursesWithoutSlots: CourseId[] = [];
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i];
      if (
        !(
          course.parsedId !== undefined &&
          course.parsedCredit !== undefined &&
          course.parsedExpects !== undefined &&
          course.parsedAconds !== undefined
        )
      ) {
        window.alert("TODO");
        return;
      }
      const slots = course.parsedSlots ?? [];
      if (slots.length === 0) {
        coursesWithoutSlots.push(course.parsedId);
      }
      elements +=
        JSON.stringify({
          id: course.parsedId,
          name: course.name,
          credit: course.parsedCredit,
          expects: course.parsedExpects,
          term: course.term,
          when: course.when,
          slots,
          availability: getAvailability(course.parsedAconds, year),
        }) + ",\n";
    }
    window.alert(
      `以下の科目の実施学期＋曜時限がありません\n${coursesWithoutSlots.join("\n")}`,
    );
    const output = `// @ts-nocheck
import type { KnownCourse } from "$lib/akiko";
export const knownCourseYear = ${year};
export const knownCourses = [
${elements}] as KnownCourse[];`;
    window.navigator.clipboard.writeText(output);
  }

  function handleCopyIds(): void {
    if (courses === undefined) return;
    window.navigator.clipboard.writeText(courses.map((c) => c.id).join("\n"));
  }
</script>


<div class="page">
  <header>
    <h1>
      <img src="akiko_blastoise.png" alt="あきこカメックス" />
      <span>あきこカメックス</span>
    </h1>
    <nav class="tabs">
      <button class:active={activeTab === "inspect"} onclick={() => (activeTab = "inspect")}>一覧</button>
      <button class:active={activeTab === "fix"} onclick={() => (activeTab = "fix")}>修正</button>
    </nav>
  </header>

  <aside class="sidebar">
    <section>
      <span class="section-label">ファイル</span>
      <label class="col">
        科目一覧
        <input type="file" accept=".xlsx" oninput={(e) => handleFileInput(e.currentTarget)} />
      </label>
      <label class="col">
        シラバスJSON
        <input type="file" accept=".json" oninput={(e) => handleJsonInput(e.currentTarget)} />
      </label>
      <label>
        <input type="checkbox" bind:checked={ignoreGraduateCourses} />
        院の科目を除く
      </label>
      {#if loading}
        <span class="loading">読み込み中…</span>
      {/if}
      {#if dev}
        <div class="test-files">
          {#each Object.entries(testFiles) as [path, base64]}
            <button onclick={() => loadFromBase64(base64)}>
              {path.split("/").pop()}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <section>
      <span class="section-label">設定</span>
      <label class="col">
        年度
        <input type="number" bind:value={year} />
      </label>
      <label>
        <input type="checkbox" bind:checked={showRaw} />
        元データを表示
      </label>
    </section>

    <section>
      <span class="section-label">フィルター</span>
      <label class="col">
        科目番号
        <input type="text" bind:value={filterIdPrefix} placeholder="前方一致" />
      </label>
      <label class="col">
        科目名
        <input
          type="text"
          bind:value={filterNameQuery}
          placeholder="部分一致"
        />
      </label>
      <div class="button-row">
        <button onclick={checkAllVisibility}>全てチェック</button>
        <button onclick={uncheckAllVisibility}>全て外す</button>
      </div>
    </section>

    <section>
      <span class="section-label">表示</span>
      <label class="col">
        上限
        <input type="number" bind:value={rowLimit} min="1" />
      </label>
      {#if visibleCourses !== undefined}
        <div class="count">
          {displayedCourses?.length} / {visibleCourses.length} 件
        </div>
      {/if}
    </section>

    <section>
      <button disabled={courses === undefined} onclick={handleCopyOutput}>
        出力をコピー
      </button>
      <button disabled={courses === undefined} onclick={handleCopyIds}>
        科目番号を全てコピー
      </button>
    </section>
  </aside>

  <main
    class:hidden={activeTab !== "inspect"}
    onscroll={(e) => {
      const el = e.currentTarget;
      if (
        el.scrollTop + el.clientHeight >= el.scrollHeight - 1 &&
        (visibleCourses?.length ?? 0) > rowLimit
      )
        rowLimit += 100;
    }}
  >
    <table class="courses">
      <thead>
        <tr>
          <th>
            科目番号
            <button
              class="filter-btn"
              class:active={hasFilter("id")}
              onclick={() => (openFilterColumn = "id")}
            >▾</button>
          </th>
          <th>科目名</th>
          <th>
            単位数
            <button
              class="filter-btn"
              class:active={hasFilter("credit")}
              onclick={() => (openFilterColumn = "credit")}
            >▾</button>
          </th>
          <th>
            標準履修年次
            <button
              class="filter-btn"
              class:active={hasFilter("expects")}
              onclick={() => (openFilterColumn = "expects")}
            >▾</button>
          </th>
          <th>
            実施学期
            <button
              class="filter-btn"
              class:active={hasFilter("termSets")}
              onclick={() => (openFilterColumn = "termSets")}
            >▾</button>
          </th>
          <th>
            曜時限
            <button
              class="filter-btn"
              class:active={hasFilter("whenSets")}
              onclick={() => (openFilterColumn = "whenSets")}
            >▾</button>
          </th>
          <th>備考</th>
          <th>
            開講状況
            <button
              class="filter-btn"
              class:active={hasFilter("aconds")}
              onclick={() => (openFilterColumn = "aconds")}
            >▾</button>
          </th>
          <th>
            今年度開講
            <button
              class="filter-btn"
              class:active={hasFilter("availability")}
              onclick={() => (openFilterColumn = "availability")}
            >▾</button>
          </th>
          <th>
            実施学期＋曜時限
            <button
              class="filter-btn"
              class:active={hasFilter("slots")}
              onclick={() => (openFilterColumn = "slots")}
            >▾</button>
          </th>
          <th>
            シラバス状況
            <button
              class="filter-btn"
              class:active={hasFilter("syllabusStatus")}
              onclick={() => (openFilterColumn = "syllabusStatus")}
            >▾</button>
          </th>
        </tr>
      </thead>
      <tbody class:show-raw={showRaw}>
        {#each displayedCourses ?? [] as c (c.id)}
          <tr class="raw">
            <td><pre>{c.id}</pre></td>
            <td></td>
            <td><pre>{c.credit}</pre></td>
            <td><pre>{c.expects}</pre></td>
            <td><pre>{c.term}</pre></td>
            <td><pre>{c.when}</pre></td>
            <td><pre class="remark">{c.remark}</pre></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
          </tr>
          <tr class="parsed">
            <td>
              {#if c.parsedId !== undefined}
                {c.parsedId}
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              <a
                href={createSyllabusUrl(year.toString(), c.id)}
                target="_blank"
                rel="noreferrer"
              >
                {c.name}
              </a>
            </td>
            <td>
              {#if c.parsedCredit !== undefined}{c.parsedCredit}{:else}<div class="cross">❌</div>{/if}
            </td>
            <td>
              {#if c.parsedExpects !== undefined}{c.parsedExpects.join(", ")}{:else}<div class="cross">❌</div>{/if}
            </td>
            <td>
              {#if c.parsedTermSets !== undefined}
                <ul class="term-set">
                  {#each c.parsedTermSets as set}
                    <li>
                      <ul class="term">
                        {#each set as term}
                          <li>{termToString(term)}</li>
                        {/each}
                      </ul>
                    </li>
                  {/each}
                </ul>
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              {#if c.parsedWhenSets !== undefined}
                <ul class="when-set">
                  {#each c.parsedWhenSets as set}
                    <li>
                      <ul class="when">
                        {#each set as when}
                          <li>{whenToString(when)}</li>
                        {/each}
                      </ul>
                    </li>
                  {/each}
                </ul>
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              <span class="remark">{c.remark}</span>
            </td>
            <td>
              {#if c.parsedAconds !== undefined}
                {acondsToString(c.parsedAconds)}
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              {#if c.parsedAconds !== undefined}
                {@const available = getAvailability(c.parsedAconds, year)}
                {#if available === "available"}
                  ✅
                {:else if available === "unavailable"}
                  ❌
                {:else}
                  ❓
                {/if}
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              {#if c.parsedSlots !== undefined}
                <ul class="slot">
                  {#each c.parsedSlots as s}<li>{slotToString(s)}</li>{/each}
                </ul>
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              {#if syllabusLookup === undefined}
                <span class="no-data">—</span>
              {:else if syllabusLookup.noSet.has(c.id)}
                シラバスなし
              {:else if syllabusLookup.badSet.has(c.id)}
                解析失敗
              {:else if syllabusLookup.courseMap.has(c.id)}
                あり
              {:else}
                不明
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </main>

  {#if activeTab === "fix"}
    <div class="fix-placeholder">（準備中）</div>
  {/if}

  <dialog
    bind:this={dialogEl}
    onclose={() => (openFilterColumn = undefined)}
    onclick={(e) => {
      if (e.target === e.currentTarget) openFilterColumn = undefined;
    }}
  >
    {#if openFilterColumn !== undefined}
      <div class="filter-dialog-header">
        <strong>{COL_LABELS[openFilterColumn]}</strong>
        <button onclick={() => (openFilterColumn = undefined)}>✕</button>
      </div>
      <div class="filter-dialog-actions">
        <button onclick={() => checkAllColumn(openFilterColumn!)}>全てチェック</button>
        <button onclick={() => uncheckAllColumn(openFilterColumn!)}>全て外す</button>
      </div>
      <div class="filter-dialog-list">
        {#each openColumnValues as value}
          <label>
            <input
              type="checkbox"
              checked={!hiddenColumnValues.get(openFilterColumn)?.has(value)}
              onchange={() => toggleColumnValue(openFilterColumn!, value)}
            />
            {value}
          </label>
        {/each}
      </div>
    {/if}
  </dialog>
</div>

<style lang="scss">
  :global(body) {
    font-family: sans-serif;
    font-size: 14px;
    line-height: 1.5;
    margin: 0;
    overflow: hidden;
  }

  // ── Page layout ────────────────────────────────
  .page {
    display: grid;
    grid-template-columns: 240px 1fr;
    grid-template-rows: auto 1fr;
    height: 100dvh;
  }

  // ── Header ─────────────────────────────────────
  header {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 20px;
    border-bottom: 1px solid oklch(88% 0 0);
    background: white;

    h1 {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 1rem;

      img {
        width: 28px;
      }
    }
  }

  .tabs {
    display: flex;
    gap: 4px;

    button {
      padding: 4px 14px;
      font-size: 0.85rem;
      border: 1px solid oklch(82% 0 0);
      border-radius: 4px;
      background: transparent;
      cursor: pointer;
      color: oklch(45% 0 0);

      &.active {
        background: oklch(25% 0 0);
        color: white;
        border-color: oklch(25% 0 0);
      }

      &:not(.active):hover {
        background: oklch(94% 0 0);
      }
    }
  }

  // ── Sidebar ────────────────────────────────────
  .sidebar {
    grid-row: 2;
    border-right: 1px solid oklch(88% 0 0);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    background: oklch(99% 0 0);

    section {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 7px;
      border-bottom: 1px solid oklch(93% 0 0);
    }

    .section-label {
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: oklch(62% 0 0);
    }

    label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      cursor: pointer;

      &.col {
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
      }
    }

    input[type="number"],
    input[type="text"] {
      width: 80px;
      padding: 3px 6px;
      font-size: 0.85rem;
      border: 1px solid oklch(82% 0 0);
      border-radius: 4px;
    }

    input[type="text"] {
      width: 100%;
      box-sizing: border-box;
    }

    input[type="file"] {
      font-size: 0.78rem;
      max-width: 100%;
    }

    .button-row {
      display: flex;
      gap: 6px;

      button {
        flex: 1;
        font-size: 0.8rem;
        padding: 4px 0;
      }
    }

    .count {
      font-size: 0.85rem;
      color: oklch(45% 0 0);
      font-variant-numeric: tabular-nums;
    }

    .loading {
      font-size: 0.8rem;
      color: oklch(52% 0.1 240);
      animation: pulse 1.4s ease-in-out infinite;
    }

    .test-files {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;

      button {
        padding: 2px 6px;
        font-size: 0.75rem;
      }
    }

    button {
      font-size: 0.85rem;
      padding: 5px 10px;
      cursor: pointer;
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }

  // ── Main / Table ───────────────────────────────
  main {
    grid-row: 2;
    overflow: auto;

    &.hidden {
      display: none;
    }
  }

  .fix-placeholder {
    grid-row: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    color: oklch(60% 0 0);
    font-size: 1rem;
  }

  table.courses {
    border-collapse: collapse;
    font-size: 13px;
    white-space: nowrap;

    // Column widths
    th:nth-child(1),
    td:nth-child(1) {
      width: 110px;
    } // 科目番号
    th:nth-child(2),
    td:nth-child(2) {
      width: 200px;
      white-space: normal;
    } // 科目名
    th:nth-child(3),
    td:nth-child(3) {
      width: 56px;
    } // 単位数
    th:nth-child(4),
    td:nth-child(4) {
      width: 90px;
    } // 標準履修年次
    th:nth-child(5),
    td:nth-child(5) {
      width: 130px;
      white-space: normal;
    } // 実施学期
    th:nth-child(6),
    td:nth-child(6) {
      width: 130px;
      white-space: normal;
    } // 曜時限
    th:nth-child(7),
    td:nth-child(7) {
      width: 200px;
    } // 備考
    th:nth-child(8),
    td:nth-child(8) {
      width: 130px;
      white-space: normal;
    } // 開講状況
    th:nth-child(9),
    td:nth-child(9) {
      width: 80px;
    } // 今年度開講
    th:nth-child(10),
    td:nth-child(10) {
      width: 160px;
      white-space: normal;
    } // 実施学期＋曜時限
    th:nth-child(11),
    td:nth-child(11) {
      width: 90px;
    } // シラバス状況
  }

  thead tr {
    position: sticky;
    top: 0;
    z-index: 5;
    background: oklch(97% 0 0);
  }

  th {
    padding: 8px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    color: oklch(40% 0 0);
    border: 1px solid oklch(83% 0 0);
    text-align: left;
    vertical-align: top;
  }

  td {
    padding: 6px 10px;
    border: 1px solid oklch(90% 0 0);
    vertical-align: middle;
  }

  // Raw rows: hidden by default, visible via tbody.show-raw
  tbody tr.raw {
    display: none;

    td {
      background-color: oklch(97% 0 0);
      color: oklch(58% 0 0);
      font-size: 0.8rem;
      border-bottom: none;
    }
  }

  tbody.show-raw tr.raw {
    display: table-row;
  }

  tbody.show-raw tr.raw + tr.parsed td {
    border-top: none;
  }

  tr.parsed td {
    border-bottom: 1px solid oklch(83% 0 0);
  }

  pre {
    margin: 0;
    padding: 0;
    font-family: monospace;
    font-size: 0.8rem;
    background: transparent;
    border: none;
    color: inherit;
  }

  .cross {
    text-align: center;
  }

  .no-data {
    color: oklch(72% 0 0);
  }

  .filter-btn {
    margin-left: 4px;
    padding: 1px 4px;
    font-size: 0.7rem;
    cursor: pointer;
    border: 1px solid oklch(78% 0 0);
    border-radius: 3px;
    background: transparent;

    &.active {
      background: oklch(25% 0 0);
      color: white;
    }
  }

  dialog {
    border: none;
    border-radius: 8px;
    padding: 0;
    width: 420px;
    max-width: 90vw;
    max-height: 80vh;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    &::backdrop {
      background: rgba(0, 0, 0, 0.35);
    }
  }

  .filter-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid oklch(88% 0 0);
    flex-shrink: 0;

    strong {
      font-size: 0.9rem;
    }

    button {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      padding: 2px 6px;
      color: oklch(50% 0 0);
      line-height: 1;
    }
  }

  .filter-dialog-actions {
    display: flex;
    gap: 6px;
    padding: 8px 16px;
    border-bottom: 1px solid oklch(92% 0 0);
    flex-shrink: 0;
  }

  .filter-dialog-list {
    overflow-y: auto;
    padding: 8px 16px;
    display: flex;
    flex-direction: column;

    label {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      font-size: 0.85rem;
      font-weight: normal;
      cursor: pointer;
    }
  }


  ul.term-set,
  ul.when-set {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;

    & > li {
      &:not(:first-child) {
        padding-top: 8px;
      }

      &:not(:last-child) {
        padding-bottom: 8px;
        border-bottom: 1px solid oklch(90% 0 0);
      }
    }
  }

  ul.term,
  ul.when,
  ul.slot {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    white-space: normal;

    & > li {
      text-wrap: nowrap;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 0.8rem;
    }
  }

  ul {
    $l: 95%;
    $c: 5%;
    $bl: 86%;
    $bc: 10%;

    &.term > li {
      background-color: oklch($l $c 0);
      border: 1px solid oklch($bl $bc 0);
    }

    &.when > li {
      background-color: oklch($l $c 120);
      border: 1px solid oklch($bl $bc 120);
    }

    &.slot > li {
      background-color: oklch($l $c 240);
      border: 1px solid oklch($bl $bc 240);
    }
  }

  .remark {
    max-width: 200px;
    overflow-x: auto;
    word-break: break-all;
    white-space: normal;
  }

  span.remark {
    display: block;
  }
</style>

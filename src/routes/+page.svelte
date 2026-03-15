<script lang="ts">
  import { dev } from "$app/environment";
  import {
    slotToString,
    termToString,
    whenToString,
    getAvailability,
    acondsCompare,
    acondsEqual,
    type Acond,
    type Course,
    type Slot,
    type TermSet,
    type WhenSet,
    type CourseId,
  } from "$lib/app";
  import { parseCourses } from "$lib/input";
  import { assert, unreachable, filterMap, dedupe } from "$lib/util";
  import SlotSelector from "./SlotSelector.svelte";
  import * as exceljs from "exceljs";
  import { SvelteMap } from "svelte/reactivity";

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

  function compareStringArrays(a: string[], b: string[]): number {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] < b[i]) return -1;
      if (a[i] > b[i]) return 1;
    }
    return a.length - b.length;
  }

  function termSetsCompare(a: TermSet[], b: TermSet[]): number {
    const aFlat = a.map((set) => set.join(","));
    const bFlat = b.map((set) => set.join(","));
    return compareStringArrays(aFlat, bFlat);
  }

  function termSetsEqual(a: TermSet[], b: TermSet[]): boolean {
    return termSetsCompare(a, b) === 0;
  }

  function whenSetsCompare(a: WhenSet[], b: WhenSet[]): number {
    const aFlat = a.map((set) => set.map(whenToString).join(","));
    const bFlat = b.map((set) => set.map(whenToString).join(","));
    return compareStringArrays(aFlat, bFlat);
  }

  function whenSetsEqual(a: WhenSet[], b: WhenSet[]): boolean {
    return whenSetsCompare(a, b) === 0;
  }

  let courses = $state.raw<Course[] | undefined>();
  let loading = $state(false);
  let showRaw = $state(false);
  let filterIdPrefix = $state("");
  let filterNameQuery = $state("");
  let activeTab = $state<"table" | "stats">("table");
  let allAconds = $state.raw<Acond[][]>([]);
  let allTermSets = $state.raw<TermSet[][]>([]);
  let allWhenSets = $state.raw<WhenSet[][]>([]);
  let courseIdToSlots = $state(new SvelteMap<string, Slot[]>());
  let year = $state(getAcademicYear(new Date()));
  let showAvailable = $state(true);
  let showUnavailable = $state(true);
  let showIndeterminable = $state(true);
  let showFailedId = $state(true);
  let showFailedCredit = $state(true);
  let showFailedExpects = $state(true);
  let showFailedTermSets = $state(true);
  let showFailedWhenSets = $state(true);
  let showFailedSlots = $state(true);
  let showFailedAconds = $state(true);
  let showSuccessId = $state(true);
  let showSuccessCredit = $state(true);
  let showSuccessExpects = $state(true);
  let showSuccessTermSets = $state(true);
  let showSuccessWhenSets = $state(true);
  let showSuccessAconds = $state(true);
  let showSuccessSlots = $state(true);
  let ignoreGraduateCourses = $state(true);

  function checkAllVisibility() {
    showAvailable = true;
    showUnavailable = true;
    showIndeterminable = true;
    showFailedId = true;
    showFailedCredit = true;
    showFailedExpects = true;
    showFailedTermSets = true;
    showFailedWhenSets = true;
    showFailedSlots = true;
    showFailedAconds = true;
    showSuccessId = true;
    showSuccessCredit = true;
    showSuccessExpects = true;
    showSuccessTermSets = true;
    showSuccessWhenSets = true;
    showSuccessAconds = true;
    showSuccessSlots = true;
  }

  function uncheckAllVisibility() {
    showAvailable = false;
    showUnavailable = false;
    showIndeterminable = false;
    showFailedId = false;
    showFailedCredit = false;
    showFailedExpects = false;
    showFailedTermSets = false;
    showFailedWhenSets = false;
    showFailedSlots = false;
    showFailedAconds = false;
    showSuccessId = false;
    showSuccessCredit = false;
    showSuccessExpects = false;
    showSuccessTermSets = false;
    showSuccessWhenSets = false;
    showSuccessAconds = false;
    showSuccessSlots = false;
  }

  let rowLimit = $state(100);

  const filteredCourses = $derived.by(() => {
    if (courses === undefined) {
      return undefined;
    }
    if (ignoreGraduateCourses) {
      return courses.filter((c) => !c.id.startsWith("0"));
    }
    return courses;
  });

  let visibleCourses = $derived.by(() => {
    if (filteredCourses === undefined) {
      return undefined;
    }

    const idPrefix = filterIdPrefix.trim().toLowerCase();
    const nameQuery = filterNameQuery.trim().toLowerCase();

    return filteredCourses.filter((c) => {
      if (idPrefix && !c.id.toLowerCase().startsWith(idPrefix)) return false;
      if (nameQuery && !c.name.toLowerCase().includes(nameQuery)) return false;
      if (c.parsedId !== undefined ? !showSuccessId : !showFailedId)
        return false;
      if (c.parsedCredit !== undefined ? !showSuccessCredit : !showFailedCredit)
        return false;
      if (
        c.parsedExpects !== undefined ? !showSuccessExpects : !showFailedExpects
      )
        return false;
      if (
        c.parsedTermSets !== undefined
          ? !showSuccessTermSets
          : !showFailedTermSets
      )
        return false;
      if (
        c.parsedWhenSets !== undefined
          ? !showSuccessWhenSets
          : !showFailedWhenSets
      )
        return false;
      if (c.parsedSlots !== undefined ? !showSuccessSlots : !showFailedSlots)
        return false;
      if (c.parsedAconds !== undefined ? !showSuccessAconds : !showFailedAconds)
        return false;

      if (c.parsedAconds !== undefined) {
        const available = getAvailability(c.parsedAconds, year);
        if (available === "available" && !showAvailable) return false;
        if (available === "unavailable" && !showUnavailable) return false;
        if (available === "indeterminable" && !showIndeterminable) return false;
      }

      return true;
    });
  });

  const displayedCourses = $derived(visibleCourses?.slice(0, rowLimit));

  async function loadFile(bytes: ArrayBuffer): Promise<void> {
    loading = true;
    const w = new exceljs.Workbook();
    await w.xlsx.load(bytes);
    const cs = parseCourses(w.worksheets[0]);
    if (cs === undefined) {
      window.alert("ファイルの読み込みに失敗しました");
    }
    courses = cs;
    courseIdToSlots.clear();
    loading = false;

    if (cs !== undefined) {
      let aconds = Array.from(filterMap(cs, (c) => c.parsedAconds));
      aconds.sort(acondsCompare);
      aconds = Array.from(dedupe(aconds, acondsEqual));
      allAconds = aconds;

      let termSets = Array.from(filterMap(cs, (c) => c.parsedTermSets));
      termSets.sort(termSetsCompare);
      termSets = Array.from(dedupe(termSets, termSetsEqual));
      allTermSets = termSets;

      let whenSets = Array.from(filterMap(cs, (c) => c.parsedWhenSets));
      whenSets.sort(whenSetsCompare);
      whenSets = Array.from(dedupe(whenSets, whenSetsEqual));
      allWhenSets = whenSets;
    } else {
      allAconds = [];
      allTermSets = [];
      allWhenSets = [];
    }
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

  function handleCopyOutput(): void {
    if (filteredCourses === undefined) {
      return;
    }
    let elements = "";
    const coursesWithoutSlots: CourseId[] = [];
    for (let i = 0; i < filteredCourses.length; i++) {
      const course = filteredCourses[i];
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
      let slots: Slot[];
      if (course.parsedSlots !== undefined) {
        slots = course.parsedSlots;
      } else {
        const s = courseIdToSlots.get(course.id);
        if (s === undefined) {
          coursesWithoutSlots.push(course.parsedId);
          slots = [];
        } else {
          slots = s;
        }
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
</script>

<div class="page">
  <header>
    <h1>
      <img src="akiko_blastoise.png" alt="あきこカメックス" />
      <span>あきこカメックス</span>
    </h1>
    <nav class="tabs">
      <button
        class:active={activeTab === "table"}
        onclick={() => (activeTab = "table")}
      >
        表
      </button>
      <button
        class:active={activeTab === "stats"}
        onclick={() => (activeTab = "stats")}
      >
        統計
      </button>
    </nav>
  </header>

  <aside class="sidebar">
    <section>
      <span class="section-label">ファイル</span>
      <label class="col">
        科目一覧
        <input type="file" oninput={(e) => handleFileInput(e.currentTarget)} />
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
        <input type="checkbox" bind:checked={ignoreGraduateCourses} />
        院の科目を除く
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
    </section>
  </aside>

  <main
    class:hidden={activeTab !== "table"}
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
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessId} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedId} />
                ❌
              </label>
            </div>
          </th>
          <th>科目名</th>
          <th>
            単位数
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessCredit} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedCredit} />
                ❌
              </label>
            </div>
          </th>
          <th>
            標準履修年次
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessExpects} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedExpects} />
                ❌
              </label>
            </div>
          </th>
          <th>
            実施学期
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessTermSets} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedTermSets} />
                ❌
              </label>
            </div>
          </th>
          <th>
            曜時限
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessWhenSets} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedWhenSets} />
                ❌
              </label>
            </div>
          </th>
          <th>備考</th>
          <th>
            開講状況
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessAconds} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedAconds} />
                ❌
              </label>
            </div>
          </th>
          <th>
            今年度開講
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showAvailable} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showUnavailable} />
                ❌
              </label>
              <label>
                <input type="checkbox" bind:checked={showIndeterminable} />
                ❓
              </label>
            </div>
          </th>
          <th>
            実施学期＋曜時限
            <div class="col-filter">
              <label>
                <input type="checkbox" bind:checked={showSuccessSlots} />
                ✅
              </label>
              <label>
                <input type="checkbox" bind:checked={showFailedSlots} />
                ❌
              </label>
            </div>
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
              {#if c.parsedCredit !== undefined}
                {c.parsedCredit}
              {:else}
                <div class="cross">❌</div>
              {/if}
            </td>
            <td>
              {#if c.parsedExpects !== undefined}
                {c.parsedExpects.join(", ")}
              {:else}
                <div class="cross">❌</div>
              {/if}
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
                  {#each c.parsedSlots as s}
                    <li>{slotToString(s)}</li>
                  {/each}
                </ul>
              {:else}
                {@const slots = courseIdToSlots.get(c.id)}
                {#if slots !== undefined && slots.length > 0}
                  <ul class="slot">
                    {#each slots as s, j}
                      <li>
                        {slotToString(s)}
                        <button onclick={() => slots.splice(j, 1)}>⨯</button>
                      </li>
                    {/each}
                  </ul>
                {/if}
                <div class="slot-selector">
                  <SlotSelector
                    handleSlotAdd={(s) => {
                      let slots = courseIdToSlots.get(c.id);
                      if (slots === undefined) {
                        const s = $state([]);
                        slots = s;
                      }
                      slots.push(s);
                      courseIdToSlots.set(c.id, slots);
                    }}
                  />
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </main>

  {#if activeTab === "stats"}
    <div class="stats">
      <section>
        <h2>実施学期パターン</h2>
        {#if allTermSets.length === 0}
          <p class="empty">データなし</p>
        {:else}
          <ul class="pattern-list">
            {#each allTermSets as termSets}
              <li>
                <ul class="term-set">
                  {#each termSets as set}
                    <li>
                      <ul class="term">
                        {#each set as term}
                          <li>{termToString(term)}</li>
                        {/each}
                      </ul>
                    </li>
                  {/each}
                </ul>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      <section>
        <h2>曜時限パターン</h2>
        {#if allWhenSets.length === 0}
          <p class="empty">データなし</p>
        {:else}
          <ul class="pattern-list">
            {#each allWhenSets as whenSets}
              <li>
                <ul class="when-set">
                  {#each whenSets as set}
                    <li>
                      <ul class="when">
                        {#each set as when}
                          <li>{whenToString(when)}</li>
                        {/each}
                      </ul>
                    </li>
                  {/each}
                </ul>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
      <section>
        <h2>開講状況パターン</h2>
        {#if allAconds.length === 0}
          <p class="empty">データなし</p>
        {:else}
          <ul class="pattern-list">
            {#each allAconds as aconds}
              <li>{acondsToString(aconds)}</li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {/if}
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

  .stats {
    grid-column: 2;
    grid-row: 2;
    overflow-y: auto;
    display: flex;
    align-items: flex-start;

    section {
      flex: 1;
      padding: 16px 20px;
      border-right: 1px solid oklch(88% 0 0);

      &:last-child {
        border-right: none;
      }
    }

    h2 {
      margin: 0 0 12px;
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: oklch(62% 0 0);
    }

    .empty {
      font-size: 0.85rem;
      color: oklch(62% 0 0);
    }
  }

  ul.pattern-list {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 6px;

    > li {
      padding: 8px;
      border: 1px solid oklch(85% 0 0);
      border-radius: 4px;
      background: oklch(98% 0 0);

      &:nth-child(even) {
        background: oklch(96% 0 0);
      }
    }
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

  .col-filter {
    display: flex;
    gap: 5px;
    margin-top: 5px;
    font-weight: normal;
    font-size: 0.8rem;
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

  * + .slot-selector {
    margin-top: 8px;
  }
</style>

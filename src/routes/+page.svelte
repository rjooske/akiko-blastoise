<script lang="ts">
  import { dev } from "$app/environment";
  import {
    slotToString,
    termToString,
    whenToString,
    acondsToString,
    getAvailability,
    type Course,
    type Slot,
  } from "$lib/app";
  import { parseCourses } from "$lib/input";
  import { assert } from "$lib/util";
  import SlotSelector from "./SlotSelector.svelte";
  import * as exceljs from "exceljs";
  import { SvelteMap } from "svelte/reactivity";

  const testFiles = dev
    ? import.meta.glob<string>(["../excel/*.xlsx", "!../excel/~*.xlsx"], {
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

  let courses = $state.raw<Course[] | undefined>();
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
  }

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

    return filteredCourses.filter((c) => {
      if (c.parsedId === undefined && showFailedId) return true;
      if (c.parsedCredit === undefined && showFailedCredit) return true;
      if (c.parsedExpects === undefined && showFailedExpects) return true;
      if (c.parsedTermSets === undefined && showFailedTermSets) return true;
      if (c.parsedWhenSets === undefined && showFailedWhenSets) return true;
      if (c.parsedSlots === undefined && showFailedSlots) return true;
      if (c.parsedAconds === undefined && showFailedAconds) return true;

      if (c.parsedAconds !== undefined) {
        const available = getAvailability(c.parsedAconds, year);
        if (available === "available" && showAvailable) return true;
        if (available === "unavailable" && showUnavailable) return true;
        if (available === "indeterminable" && showIndeterminable) return true;
      }

      return false;
    });
  });

  async function loadFile(bytes: ArrayBuffer): Promise<void> {
    const w = new exceljs.Workbook();
    await w.xlsx.load(bytes);
    const cs = parseCourses(w.worksheets[0]);
    if (cs === undefined) {
      window.alert("ファイルの読み込みに失敗しました");
    }
    courses = cs;
    courseIdToSlots.clear();
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
    for (let i = 0; i < filteredCourses.length; i++) {
      const course = filteredCourses[i];
      if (
        !(
          course.parsedId !== undefined &&
          course.parsedCredit !== undefined &&
          course.parsedExpects !== undefined
        )
      ) {
        window.alert("TODO");
        return;
      }
      let slots: Slot[];
      if (course.parsedSlots !== undefined) {
        slots = course.parsedSlots;
      } else {
        slots = courseIdToSlots.get(course.id) ?? [];
      }
      elements +=
        JSON.stringify({
          id: course.parsedId,
          name: course.name,
          credit: course.parsedCredit,
          slots,
          aconds: course.parsedAconds,
        }) + "\n";
    }
    const output = `import { KnownCourse } from "../akiko";
export const knownCourses = [
${elements}] as KnownCourse[];`;
    window.navigator.clipboard.writeText(output);
  }
</script>

<header>
  <h1>
    <img src="akiko_blastoise.png" alt="あきこカメックス" />
    <span>あきこカメックス</span>
  </h1>
</header>

<label>
  科目一覧：
  <input type="file" oninput={(e) => handleFileInput(e.currentTarget)} />
</label>
{#if dev}
  <span class="test-files">
    {#each Object.entries(testFiles) as [path, base64]}
      <button onclick={() => loadFromBase64(base64)}>
        {path.split("/").pop()}
      </button>
    {/each}
  </span>
{/if}
<br />
<label>
  年度：
  <input type="number" bind:value={year} />
</label>
<br />
<fieldset>
  <legend>表示設定</legend>
  <button onclick={checkAllVisibility}>全てチェック</button>
  <button onclick={uncheckAllVisibility}>全て外す</button>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedId} />
    科目番号のパースに失敗した科目を表示
  </label>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedCredit} />
    単位数のパースに失敗した科目を表示
  </label>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedExpects} />
    標準履修年次のパースに失敗した科目を表示
  </label>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedTermSets} />
    実施学期のパースに失敗した科目を表示
  </label>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedWhenSets} />
    曜時限のパースに失敗した科目を表示
  </label>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedSlots} />
    実施学期＋曜時限のパースに失敗した科目を表示
  </label>
  <br />
  <label>
    <input type="checkbox" bind:checked={showFailedAconds} />
    開講状況(備考)のパースに失敗した科目を表示
  </label>
</fieldset>
<br />
<label>
  <input type="checkbox" bind:checked={ignoreGraduateCourses} />
  院の科目を除く
</label>
<br />
<button disabled={courses === undefined} onclick={handleCopyOutput}>
  出力をコピー
</button>
<br />
<br />

<table class="courses">
  <thead>
    <tr>
      <th>科目番号</th>
      <th>科目名</th>
      <th>単位数</th>
      <th>標準履修年次</th>
      <th>実施学期</th>
      <th>曜時限</th>
      <th>備考</th>
      <th>開講状況</th>
      <th>
        今年度開講
        <div class="availability-filter">
          <label><input type="checkbox" bind:checked={showAvailable} />〇</label>
          <label><input type="checkbox" bind:checked={showUnavailable} />❌</label>
          <label><input type="checkbox" bind:checked={showIndeterminable} />❓</label>
        </div>
      </th>
      <th>実施学期＋曜時限</th>
    </tr>
  </thead>
  <tbody>
    {#each visibleCourses as c (c.id)}
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
          <span class="remark">
            {c.remark}
          </span>
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
              〇
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

<style lang="scss">
  :global(body) {
    font-family: sans-serif;
  }

  header {
    & > h1 {
      display: flex;
      align-items: center;
      gap: 20px;

      & > img {
        width: 50px;
      }
    }
  }

  table,
  th,
  td {
    border: 1px solid black;
    border-collapse: collapse;
  }
  th {
    text-wrap: nowrap;
  }
  th,
  td {
    padding: 10px;
  }
  table.courses {
    width: 100%;
  }

  tr.raw > td {
    border-bottom: 1px solid oklch(85% 0 0);
  }
  tr.parsed > td {
    border-top: none;
  }

  td:not(:last-child) {
    border-right: 1px solid oklch(85% 0 0);
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
        padding-top: 10px;
      }

      &:not(:last-child) {
        padding-bottom: 10px;
        border-bottom: 1px solid oklch(85% 0 0);
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
    gap: 5px;

    & > li {
      display: inline;
      text-wrap: nowrap;
      border: 1px solid gray;
      padding: 5px;
    }
  }

  ul {
    $l: 95%;
    $c: 8%;
    $bl: 87%;
    $bc: 15%;
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

  pre {
    margin: 0;
    padding: 5px;
    background-color: oklch(95% 0 0);
    border: 1px solid oklch(85% 0 0);
  }

  .cross {
    width: fit-content;
    margin: auto;
  }

  * + .slot-selector {
    margin-top: 10px;
  }

  .remark {
    max-width: 30vh;
    overflow-x: auto;
  }

  span.remark {
    display: block;
  }

  .availability-filter {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-weight: normal;
  }

  .test-files {
    margin-left: 10px;
    display: inline-flex;
    gap: 5px;

    & > button {
      padding: 2px 5px;
      font-size: 0.8rem;
    }
  }
</style>

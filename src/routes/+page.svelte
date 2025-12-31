<script lang="ts">
  import { browser } from "$app/environment";
  import {
    slotToString,
    termToString,
    whenToString,
    type Course,
  } from "$lib/app";
  import { parseCourses } from "$lib/input";
  import { assert } from "$lib/util";
  // import testExcelFile from "../kdb_20251010212030.xlsx?base64";
  import testExcelFile from "../test.xlsx?base64";
  import * as exceljs from "exceljs";

  let courses = $state.raw<Course[] | undefined>();
  let onlyShowFailed = $state(false);

  let visibleCourses = $derived.by(() => {
    if (courses === undefined) {
      return undefined;
    }

    if (!onlyShowFailed) {
      return courses;
    }

    const cs = courses.filter(
      (c) =>
        c.parsedId === undefined ||
        c.parsedCredit === undefined ||
        c.parsedExpects === undefined ||
        c.parsedTermSets === undefined ||
        c.parsedWhenSets === undefined ||
        c.parsedSlots === undefined,
    );
    return cs;
  });

  async function a() {
    const bytesString = window.atob(testExcelFile);
    const bytes = new Uint8Array(bytesString.length);
    for (let i = 0; i < bytesString.length; i++) {
      bytes[i] = bytesString[i].codePointAt(0) ?? 0;
    }

    const w = new exceljs.Workbook();
    await w.xlsx.load(bytes.buffer);
    const cs = parseCourses(w.worksheets[0]);
    assert(cs !== undefined);
    courses = cs;
  }

  if (browser) {
    a();
  }
</script>

<header>
  <h1>
    <img src="akiko_blastoise.png" alt="あきこカメックス" />
    <span>あきこカメックス</span>
  </h1>
</header>

<label>
  <input type="checkbox" bind:checked={onlyShowFailed} />
  パースに失敗した授業のみ表示
</label>
<br />
<br />

<table>
  <thead>
    <tr>
      <th>科目番号</th>
      <th>科目名</th>
      <th>単位数</th>
      <th>標準履修年次</th>
      <th>実施学期</th>
      <th>曜時限</th>
      <th>実施学期＋曜時限</th>
    </tr>
  </thead>
  <tbody>
    {#each visibleCourses as c (c.id)}
      <tr class="raw">
        <td><pre>{c.id}</pre></td>
        <td><pre>{c.name}</pre></td>
        <td><pre>{c.credit}</pre></td>
        <td><pre>{c.expects}</pre></td>
        <td><pre>{c.term}</pre></td>
        <td><pre>{c.when}</pre></td>
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
        <td>{c.name}</td>
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
          {#if c.parsedSlots !== undefined}
            <ul class="slot">
              {#each c.parsedSlots as s}
                <li>{slotToString(s)}</li>
              {/each}
            </ul>
          {:else}
            TODO
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
</style>

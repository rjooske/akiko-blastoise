<script lang="ts" module>
  import {
    termToString,
    whenToString,
    type Slot,
    type Term,
    type When,
  } from "$lib/app";

  const TERMS: Term[] = [
    "spring-a",
    "spring-b",
    "spring-c",
    "autumn-a",
    "autumn-b",
    "autumn-c",
    "spring",
    "autumn",
    "spring-break",
    "summer-break",
    "all-year",
  ];

  const WHENS: When[] = [
    { kind: "regular", dow: "mon", period: 1 },
    { kind: "regular", dow: "mon", period: 2 },
    { kind: "regular", dow: "mon", period: 3 },
    { kind: "regular", dow: "mon", period: 4 },
    { kind: "regular", dow: "mon", period: 5 },
    { kind: "regular", dow: "mon", period: 6 },
    { kind: "regular", dow: "mon", period: 7 },
    { kind: "regular", dow: "mon", period: 8 },

    { kind: "regular", dow: "tue", period: 1 },
    { kind: "regular", dow: "tue", period: 2 },
    { kind: "regular", dow: "tue", period: 3 },
    { kind: "regular", dow: "tue", period: 4 },
    { kind: "regular", dow: "tue", period: 5 },
    { kind: "regular", dow: "tue", period: 6 },
    { kind: "regular", dow: "tue", period: 7 },
    { kind: "regular", dow: "tue", period: 8 },

    { kind: "regular", dow: "wed", period: 1 },
    { kind: "regular", dow: "wed", period: 2 },
    { kind: "regular", dow: "wed", period: 3 },
    { kind: "regular", dow: "wed", period: 4 },
    { kind: "regular", dow: "wed", period: 5 },
    { kind: "regular", dow: "wed", period: 6 },
    { kind: "regular", dow: "wed", period: 7 },
    { kind: "regular", dow: "wed", period: 8 },

    { kind: "regular", dow: "thu", period: 1 },
    { kind: "regular", dow: "thu", period: 2 },
    { kind: "regular", dow: "thu", period: 3 },
    { kind: "regular", dow: "thu", period: 4 },
    { kind: "regular", dow: "thu", period: 5 },
    { kind: "regular", dow: "thu", period: 6 },
    { kind: "regular", dow: "thu", period: 7 },
    { kind: "regular", dow: "thu", period: 8 },

    { kind: "regular", dow: "fri", period: 1 },
    { kind: "regular", dow: "fri", period: 2 },
    { kind: "regular", dow: "fri", period: 3 },
    { kind: "regular", dow: "fri", period: 4 },
    { kind: "regular", dow: "fri", period: 5 },
    { kind: "regular", dow: "fri", period: 6 },
    { kind: "regular", dow: "fri", period: 7 },
    { kind: "regular", dow: "fri", period: 8 },

    { kind: "regular", dow: "sat", period: 1 },
    { kind: "regular", dow: "sat", period: 2 },
    { kind: "regular", dow: "sat", period: 3 },
    { kind: "regular", dow: "sat", period: 4 },
    { kind: "regular", dow: "sat", period: 5 },
    { kind: "regular", dow: "sat", period: 6 },
    { kind: "regular", dow: "sat", period: 7 },
    { kind: "regular", dow: "sat", period: 8 },

    { kind: "intensive" },
    { kind: "zuiji" },
    { kind: "oudan" },
    { kind: "nt" },
  ];
</script>

<script lang="ts">
  let { handleSlotAdd }: { handleSlotAdd: (s: Slot) => void } = $props();
  let term = $state(TERMS[0]);
  let when = $state(WHENS[0]);
</script>

<select bind:value={term}>
  {#each TERMS as t}
    <option value={t}>{termToString(t)}</option>
  {/each}
</select>
<select bind:value={when}>
  {#each WHENS as w}
    <option value={w}>{whenToString(w)}</option>
  {/each}
</select>
<button onclick={() => handleSlotAdd({ term, when })}>追加</button>

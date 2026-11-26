<script setup lang="ts">
const props=defineProps<{name:string}>()
const paths:Record<string,string>={
 fan:'M12 2a5 5 0 0 1 4.7 6.7A5 5 0 1 1 15 18a5 5 0 1 1-6 0A5 5 0 1 1 7.3 8.7 5 5 0 0 1 12 2Zm0 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
 monitor:'M3 3h18v14H3z M7 21h10 M12 17v4 M5 11h4l2-4 3 6 2-2h3',
 dns:'M3 3h18v7H3z M3 14h18v7H3z M7 6.5h.01 M7 17.5h.01 M11 6.5h6 M11 17.5h6',
 extension:'M4 4h6a3 3 0 1 1 6 0h4v6a3 3 0 1 1 0 6v4h-6a3 3 0 1 0-6 0H4v-6a3 3 0 1 0 0-6Z',
 history:'M3 12a9 9 0 1 0 3-6.7 M3 4v6h6 M12 7v5l4 2',
 event:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
 update:'M20 12a8 8 0 0 1-14 5.3 M4 12a8 8 0 0 1 14-5.3 M20 4v6h-6 M4 20v-6h6',
 power:'M12 2v10 M7 5a9 9 0 1 0 10 0',
 menu:'M3 6h18 M3 12h18 M3 18h18',
 sun:'M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5 19 19 M5 19l1.5-1.5 M17.5 6.5 19 5 M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10',
 moon:'M20.5 14.2A9 9 0 0 1 9.8 3.5 9 9 0 1 0 20.5 14.2Z',
 logout:'M10 4H4v16h6 M10 12h11 M17 8l4 4-4 4',
 search:'M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15 M16 16l5 5',
 info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 11v5 M12 7h.01'
}
</script>
<template><svg viewBox="0 0 24 24" class="md-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="paths[props.name]??paths.info"/></svg></template>

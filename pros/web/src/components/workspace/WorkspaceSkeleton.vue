<template>
  <div class="skel" aria-hidden="true">
    <div class="row">
      <span v-for="n in 4" :key="n" class="card" />
    </div>
    <span class="panel" />
    <div class="row">
      <span class="panel" />
      <span class="panel" />
    </div>
  </div>
</template>

<style scoped>
.skel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.row:first-child {
  grid-template-columns: repeat(4, 1fr);
}

.card,
.panel {
  display: block;
  border-radius: 16px;
  background: linear-gradient(90deg, #f1f3f4 25%, #f8f9fa 37%, #f1f3f4 63%);
  background-size: 400% 100%;
  animation: shine 1.2s ease infinite;
}

.card { height: 108px; }
.panel { height: 220px; }

@keyframes shine {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

@media (max-width: 980px) {
  .row,
  .row:first-child { grid-template-columns: 1fr 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .panel { animation: none; }
}
</style>

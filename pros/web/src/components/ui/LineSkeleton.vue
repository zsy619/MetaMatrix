<template>
  <div class="lines" role="status" aria-label="正在加载">
    <span />
    <span />
    <span />
  </div>
</template>

<style scoped>
.lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
span {
  display: block;
  height: 14px;
  border-radius: 7px;
  background: linear-gradient(90deg, #f1f3f4 25%, #f8f9fa 37%, #f1f3f4 63%);
  background-size: 400% 100%;
  animation: shine 1.2s ease infinite;
}
span:nth-child(2) { width: 86%; }
span:nth-child(3) { width: 64%; }

@keyframes shine {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  span { animation: none; }
}
</style>

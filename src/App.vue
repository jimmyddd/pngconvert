<script setup>
import { computed, ref } from "vue";

const formatOptions = ["webp", "png", "jpg", "jpeg", "bmp", "gif"];
const selectedDir = ref("");
const converting = ref(false);
const result = ref(null);
const errorMessage = ref("");
const targetFormat = ref("png");
const sourceFormats = ref(["webp"]);

const failedCount = computed(() => result.value?.failed?.length ?? 0);

async function chooseDirectory() {
  errorMessage.value = "";
  const path = await window.electronApi.pickDirectory();
  if (path) {
    selectedDir.value = path;
  }
}

async function startConvert() {
  if (!selectedDir.value || converting.value || sourceFormats.value.length === 0) {
    return;
  }

  converting.value = true;
  errorMessage.value = "";
  result.value = null;

  try {
    result.value = await window.electronApi.convertImages({
      directoryPath: selectedDir.value,
      sourceFormats: sourceFormats.value,
      targetFormat: targetFormat.value,
    });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "转换失败";
  } finally {
    converting.value = false;
  }
}

function resetForm() {
  selectedDir.value = "";
  converting.value = false;
  result.value = null;
  errorMessage.value = "";
  targetFormat.value = "png";
  sourceFormats.value = ["webp"];
}

function toggleFormat(format) {
  if (converting.value) {
    return;
  }
  if (sourceFormats.value.includes(format)) {
    sourceFormats.value = sourceFormats.value.filter((item) => item !== format);
    return;
  }
  sourceFormats.value = [...sourceFormats.value, format];
}
</script>

<template>
  <main class="page">
    <h1>图片批量格式转换</h1>
    <p class="tip">选择目录（递归子目录），将指定来源格式统一转换为目标格式。</p>

    <section class="panel">
      <div class="row">
        <button type="button" @click="chooseDirectory">选择目录</button>
        <span class="dir">{{ selectedDir || "未选择目录" }}</span>
      </div>

      <div class="config">
        <div class="label">来源格式（可多选）</div>
        <div class="formats">
          <button
            v-for="format in formatOptions"
            :key="format"
            type="button"
            class="chip"
            :class="{ selected: sourceFormats.includes(format) }"
            :disabled="converting"
            @click="toggleFormat(format)"
          >
            .{{ format }}
          </button>
        </div>
      </div>

      <div class="config">
        <label class="label" for="targetFormat">目标格式</label>
        <select id="targetFormat" v-model="targetFormat" :disabled="converting">
          <option value="png">.png</option>
          <option value="jpg">.jpg</option>
          <option value="webp">.webp</option>
        </select>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary"
          :disabled="!selectedDir || converting || sourceFormats.length === 0"
          @click="startConvert"
        >
          {{ converting ? "转换中..." : "开始批量转换" }}
        </button>
        <button type="button" class="secondary" :disabled="converting" @click="resetForm">
          重置
        </button>
      </div>
    </section>

    <section v-if="errorMessage" class="error">
      {{ errorMessage }}
    </section>

    <section v-if="result" class="result">
      <div>扫描到文件: {{ result.total }}</div>
      <div>成功转换: {{ result.converted }}</div>
      <div>跳过（原本就是目标格式）: {{ result.skipped }}</div>
      <div>失败数量: {{ failedCount }}</div>

      <ul v-if="failedCount > 0">
        <li v-for="item in result.failed" :key="item.file">{{ item.file }} - {{ item.reason }}</li>
      </ul>
    </section>
  </main>
</template>

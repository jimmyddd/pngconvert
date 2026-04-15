const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");
const { pathToFileURL } = require("url");
const webp = require("webp-converter");

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 920,
    height: 680,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    return;
  }

  win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

async function collectWebpFiles(directory, result = []) {
  return collectImageFiles(directory, new Set(["webp"]), result);
}

async function collectImageFiles(directory, allowedExtensions, result = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectImageFiles(fullPath, allowedExtensions, result);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).slice(1).toLowerCase();
    if (allowedExtensions.has(ext)) {
      result.push(fullPath);
    }
  }
  return result;
}

async function loadNativeImage(inputPath) {
  const inputBuffer = await fs.readFile(inputPath);
  let image = nativeImage.createFromBuffer(inputBuffer);
  if (image.isEmpty()) {
    image = nativeImage.createFromPath(pathToFileURL(inputPath).toString());
  }
  return image;
}

async function convertWebpToPngTemp(inputPath) {
  const tempPngPath = path.join(
    os.tmpdir(),
    `pngconvert-${Date.now()}-${Math.random().toString(16).slice(2)}.png`,
  );
  const response = await webp.dwebp(inputPath, tempPngPath, "-o");
  if (typeof response === "string" && response.toLowerCase().includes("error")) {
    throw new Error(response);
  }
  return tempPngPath;
}

async function convertImage(inputPath, outputPath, targetFormat) {
  if (targetFormat === "webp") {
    const response = await webp.cwebp(inputPath, outputPath, "-q 90");
    if (typeof response === "string" && response.toLowerCase().includes("error")) {
      throw new Error(response);
    }
    return;
  }

  let image = await loadNativeImage(inputPath);
  if (image.isEmpty()) {
    const ext = path.extname(inputPath).slice(1).toLowerCase();
    if (ext === "webp") {
      const tempPngPath = await convertWebpToPngTemp(inputPath);
      try {
        image = await loadNativeImage(tempPngPath);
      } finally {
        await fs.unlink(tempPngPath).catch(() => {});
      }
    }
  }
  if (image.isEmpty()) {
    throw new Error("无法解码该图片");
  }

  if (targetFormat === "png") {
    await fs.writeFile(outputPath, image.toPNG());
    return;
  }

  if (targetFormat === "jpg" || targetFormat === "jpeg") {
    await fs.writeFile(outputPath, image.toJPEG(90));
    return;
  }

  throw new Error(`不支持的目标格式: ${targetFormat}`);
}

ipcMain.handle("pick-directory", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });

  if (canceled || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
});

ipcMain.handle("convert-images", async (_, payload) => {
  const directoryPath = payload?.directoryPath;
  const sourceFormats = Array.isArray(payload?.sourceFormats) ? payload.sourceFormats : [];
  const targetFormat = String(payload?.targetFormat || "").toLowerCase();

  if (!directoryPath || !sourceFormats.length || !targetFormat) {
    throw new Error("请选择目录");
  }
  const allowed = new Set(sourceFormats.map((item) => String(item).toLowerCase()));
  const files = await collectImageFiles(directoryPath, allowed);
  let converted = 0;
  let skipped = 0;
  const failed = [];

  for (const inputPath of files) {
    const inputExt = path.extname(inputPath).slice(1).toLowerCase();
    if (inputExt === targetFormat) {
      skipped += 1;
      continue;
    }

    const outputPath = inputPath.replace(/\.[^.]+$/, `.${targetFormat}`);
    try {
      await fs.unlink(outputPath).catch((error) => {
        if (error && error.code !== "ENOENT") {
          throw error;
        }
      });
      await convertImage(inputPath, outputPath, targetFormat);
      await fs.unlink(inputPath);
      converted += 1;
    } catch (error) {
      failed.push({
        file: inputPath,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  return {
    total: files.length,
    converted,
    skipped,
    failed,
  };
});

app.whenReady().then(() => {
  webp.grant_permission();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

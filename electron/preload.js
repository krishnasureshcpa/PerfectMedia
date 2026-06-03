const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // ── Setup / First Launch ─────────────────────────────────────────────────
  isFirstLaunch:       ()           => ipcRenderer.invoke("app:isFirstLaunch"),
  markSetupComplete:   ()           => ipcRenderer.invoke("app:markSetupComplete"),
  resetSetup:          ()           => ipcRenderer.invoke("app:resetSetup"),
  getSystemInfo:       ()           => ipcRenderer.invoke("system:info"),
  checkAllDeps:        ()           => ipcRenderer.invoke("setup:checkAll"),
  installTools:        (tools)      => ipcRenderer.invoke("setup:install", { tools }),
  onSetupProgress:     (cb)         => { ipcRenderer.on("setup:progress", (_, d) => cb(d)); },

  // ── Folder / File ────────────────────────────────────────────────────────
  selectFolder:        ()                     => ipcRenderer.invoke("folder:select"),
  selectOutputDir:     ()                     => ipcRenderer.invoke("folder:selectOutput"),
  selectFile:          (opts)                 => ipcRenderer.invoke("folder:selectFile", opts),
  scanFolder:          (p)                    => ipcRenderer.invoke("folder:scan", p),
  revealInFinder:      (p)                    => ipcRenderer.invoke("finder:reveal", p),

  // ── Convert ──────────────────────────────────────────────────────────────
  convertFiles:        (files, fmt, codec, out, id)             => ipcRenderer.invoke("convert:run",      { files, format:fmt, codec, outputSettings:out, jobId:id }),

  // ── Subtitles ────────────────────────────────────────────────────────────
  generateSubs:        (files, model, lang, tgtLang, tr, burn, out, id) => ipcRenderer.invoke("subs:run", { files, model, lang, targetLang:tgtLang, translate:tr, burnIn:burn, outputSettings:out, jobId:id }),

  // ── Hollywood Dub ────────────────────────────────────────────────────────
  dubFiles:            (files, srcLang, tgtLang, whisperModel, preserveBg, lipSync, quality, out, id) =>
                        ipcRenderer.invoke("dub:run", { files, srcLang, tgtLang, whisperModel, preserveBg, lipSync, quality, outputSettings:out, jobId:id }),
  checkDubDeps:        ()                     => ipcRenderer.invoke("dub:checkDeps"),

  // ── Remaster ─────────────────────────────────────────────────────────────
  remasterFiles:       (files, opts, out, id) => ipcRenderer.invoke("remaster:run",   { files, opts, outputSettings:out, jobId:id }),

  // ── Frame Interpolation ──────────────────────────────────────────────────
  interpolateFiles:    (files, multiplier, method, out, id) => ipcRenderer.invoke("interpolate:run", { files, multiplier, method, outputSettings:out, jobId:id }),

  // ── Automate ─────────────────────────────────────────────────────────────
  runAutomation:       (rules, folder, out, id) => ipcRenderer.invoke("automate:run", { rules, folder, outputSettings:out, jobId:id }),

  // ── Jobs ─────────────────────────────────────────────────────────────────
  cancelJob:           (id)                   => ipcRenderer.invoke("job:cancel", id),
  checkDeps:           ()                     => ipcRenderer.invoke("deps:check"),

  // ── Listeners ────────────────────────────────────────────────────────────
  onProgress:          (cb) => { ipcRenderer.on("job:progress", (_, d) => cb(d)); },
  removeListeners:     ()   => {
    ipcRenderer.removeAllListeners("job:progress");
    ipcRenderer.removeAllListeners("setup:progress");
  },
});

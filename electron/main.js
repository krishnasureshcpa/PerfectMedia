const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFile, exec } = require("child_process");

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_EXTS = new Set([".mkv",".avi",".mov",".wmv",".flv",".webm",".m4v",".ts",".mp4",".m2ts",".mxf",".mpg",".mpeg",".3gp",".f4v",".rm",".rmvb"]);
const IS_WIN = process.platform === "win32";
const IS_MAC = process.platform === "darwin";
const activeJobs = new Map();

// Scripts directory
const SCRIPTS_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "scripts")
  : path.join(__dirname, "../scripts");

// ─── Window ───────────────────────────────────────────────────────────────────

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 860,
    minHeight: 580,
    titleBarStyle: IS_MAC ? "hiddenInset" : "default",
    backgroundColor: "#06080C",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
    },
    icon: path.join(__dirname, "../assets/icon.png"),
  });
  mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (!IS_MAC) app.quit(); });
app.on("activate", () => { if (!mainWindow) createWindow(); });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

function expandPath() {
  const extra = IS_WIN ? "" : [
    "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin",
    "/usr/sbin", "/sbin",
    process.env.HOME ? `${process.env.HOME}/.local/bin` : "",
    process.env.HOME ? `${process.env.HOME}/.pyenv/shims` : "",
  ].filter(Boolean).join(":");
  return IS_WIN ? process.env.PATH : [process.env.PATH, extra].filter(Boolean).join(":");
}

const ENV = () => ({ ...process.env, PATH: expandPath() });

function which(cmd) {
  return new Promise(r => {
    exec(IS_WIN?`where ${cmd}`:`which ${cmd}`, { env: ENV() }, err => r(!err));
  });
}

function pyCheck(mod) {
  const py = python3Bin();
  return new Promise(r => exec(`"${py}" -c "import ${mod}"`, { env: ENV() }, err => r(!err)));
}

function ffmpegBin() {
  const bundled = path.join(process.resourcesPath || "", "ffmpeg" + (IS_WIN?".exe":""));
  if (fs.existsSync(bundled)) return bundled;
  for (const p of IS_WIN
    ? ["C:\\ffmpeg\\bin\\ffmpeg.exe","C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe"]
    : ["/opt/homebrew/bin/ffmpeg","/usr/local/bin/ffmpeg","/usr/bin/ffmpeg"]) {
    if (fs.existsSync(p)) return p;
  }
  return IS_WIN ? "ffmpeg.exe" : "ffmpeg";
}

function python3Bin() {
  if (IS_WIN) {
    for (const p of ["C:\\Python311\\python.exe","C:\\Python310\\python.exe",
      `C:\\Users\\${os.userInfo().username}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`]) {
      if (fs.existsSync(p)) return p;
    }
    return "python";
  }
  for (const p of [
    "/opt/homebrew/bin/python3.14", "/usr/local/bin/python3.14",
    "/opt/homebrew/bin/python3.13", "/usr/local/bin/python3.13",
    "/opt/homebrew/bin/python3.12", "/usr/local/bin/python3.12",
    "/opt/homebrew/bin/python3",    "/usr/local/bin/python3",
    "/usr/bin/python3",
  ]) {
    if (fs.existsSync(p)) return p;
  }
  return "python3";
}

function getDuration(filePath) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(0), 8000);
    execFile(ffmpegBin(), ["-v","quiet","-print_format","json","-show_format",filePath],
      { env: ENV() }, (err, stdout) => {
        clearTimeout(timer);
        try { resolve(parseFloat(JSON.parse(stdout).format.duration||"0")); }
        catch { resolve(0); }
      });
  });
}

function parseFfmpegTime(str) {
  const m = str.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? parseInt(m[1])*3600 + parseInt(m[2])*60 + parseFloat(m[3]) : 0;
}

function ensureDir(p) { try { fs.mkdirSync(p,{recursive:true}); } catch {} return p; }

function outPath(inputPath, suffix, ext, outputSettings) {
  const dir = outputSettings?.location==="custom"&&outputSettings?.customPath
    ? outputSettings.customPath : path.dirname(inputPath);
  ensureDir(dir);
  const base = path.basename(inputPath, path.extname(inputPath));
  const outExt = ext || path.extname(inputPath).slice(1);
  return path.join(dir, `${base}${suffix}.${outExt}`);
}

function walkDir(dir) {
  const results = [];
  function walk(d) {
    try {
      for (const e of fs.readdirSync(d,{withFileTypes:true})) {
        if (e.name.startsWith(".")) continue;
        const full = path.join(d, e.name);
        try {
          if (e.isDirectory()) { walk(full); }
          else {
            const ext = path.extname(e.name).toLowerCase();
            if (VIDEO_EXTS.has(ext)) {
              const srt = full.replace(/\.[^.]+$/,".srt");
              const stat = fs.statSync(full);
              results.push({path:full,name:e.name,ext:ext.slice(1),size:stat.size,selected:false,hasSrt:fs.existsSync(srt)});
            }
          }
        } catch {}
      }
    } catch {}
  }
  walk(dir);
  return results;
}

// Run a Python script with JSON args, streaming stdout as JSON progress lines
function runPyScript(scriptName, args, jobId, progressChannel = "job:progress") {
  const py = python3Bin();
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const argsJson = JSON.stringify(args);

  return new Promise(resolve => {
    const proc = spawn(py, [scriptPath, argsJson], { env: ENV() });
    activeJobs.set(jobId, proc);

    proc.stdout.on("data", raw => {
      for (const line of raw.toString().split("\n").filter(Boolean)) {
        try {
          const d = JSON.parse(line);
          send(progressChannel, {
            jobId,
            progress: d.progress || 0,
            log: d.msg || "",
            status: d.error ? "error" : d.stage === "done" ? "done" : "running",
          });
        } catch {
          send(progressChannel, { jobId, progress: 0, log: line, status: "running" });
        }
      }
    });

    proc.stderr.on("data", d => {
      const line = d.toString().trim().split("\n").pop() || "";
      if (line) send(progressChannel, { jobId, progress: 0, log: line, status: "running" });
    });

    proc.on("error", err => {
      activeJobs.delete(jobId);
      send(progressChannel, { jobId, progress: 0, log: `Cannot start Python: ${err.message}`, status: "error" });
      resolve(false);
    });

    proc.on("close", code => {
      activeJobs.delete(jobId);
      resolve(code === 0 || code === null);
    });
  });
}

// ─── First-launch / setup ─────────────────────────────────────────────────────

const SETUP_FLAG = path.join(app.getPath("userData"), ".setup-complete-v2");

ipcMain.handle("app:isFirstLaunch", async () => !fs.existsSync(SETUP_FLAG));
ipcMain.handle("app:markSetupComplete", async () => {
  fs.writeFileSync(SETUP_FLAG, JSON.stringify({ ts: Date.now(), platform: process.platform }));
});
ipcMain.handle("app:resetSetup", async () => { try { fs.unlinkSync(SETUP_FLAG); } catch {} });

ipcMain.handle("system:info", async () => ({
  platform:   process.platform,
  arch:       process.arch,
  os:         `${os.type()} ${os.release()}`,
  shell:      process.env.SHELL || (IS_WIN?"PowerShell":"/bin/zsh"),
  shellName:  path.basename(process.env.SHELL || (IS_WIN?"powershell":"zsh")),
  cpus:       os.cpus().length,
  totalMem:   os.totalmem(),
  freeMem:    os.freemem(),
  nodeVersion: process.version,
  electronVersion: process.versions.electron,
}));

ipcMain.handle("setup:checkAll", async () => {
  const [hasBrew, hasWinget, hasChoco, hasFFmpeg, hasPython,
         hasWhisper, hasTTS, hasDemucs, hasTransformers, hasArgos,
         hasEsrgan, hasSoundfile, hasLibrosa] = await Promise.all([
    IS_WIN ? Promise.resolve(false) : which("brew"),
    IS_WIN ? which("winget") : Promise.resolve(false),
    IS_WIN ? which("choco") : Promise.resolve(false),
    which("ffmpeg").then(ok=>ok||["/opt/homebrew/bin/ffmpeg","/usr/local/bin/ffmpeg"].some(p=>fs.existsSync(p))),
    IS_WIN ? which("python") : which("python3"),
    pyCheck("whisper"),
    pyCheck("TTS"),
    pyCheck("demucs"),
    pyCheck("transformers"),
    pyCheck("argostranslate"),
    pyCheck("realesrgan"),
    pyCheck("soundfile"),
    pyCheck("librosa"),
  ]);

  const getVer = cmd => new Promise(r => exec(cmd, {env:ENV()}, (_,o)=>r(o?.trim()?.split("\n")[0]||null)));
  const [ffmpegVer, pyVer, brewVer] = await Promise.all([
    hasFFmpeg ? getVer(`${ffmpegBin()} -version 2>&1`).then(o=>o?.match(/ffmpeg version ([^\s]+)/)?.[1]||"installed") : Promise.resolve(null),
    hasPython ? getVer(`${python3Bin()} --version`).then(o=>o?.replace("Python ","")) : Promise.resolve(null),
    hasBrew   ? getVer("brew --version").then(o=>o?.replace("Homebrew ","")) : Promise.resolve(null),
  ]);

  return {
    platform:     { ok:true,     version:os.release(),  required:true,  name:"System",          desc:`${os.type()} ${process.arch}` },
    brew:         { ok:hasBrew,  version:brewVer,        required:IS_MAC,name:"Homebrew",        desc:"macOS package manager" },
    winpkg:       { ok:hasWinget||hasChoco, version:hasWinget?"winget":hasChoco?"choco":null, required:IS_WIN, name:"winget / choco", desc:"Windows package manager" },
    ffmpeg:       { ok:hasFFmpeg,version:ffmpegVer,      required:true,  name:"ffmpeg",          desc:"Video processing engine" },
    python:       { ok:hasPython,version:pyVer,          required:true,  name:"Python 3",        desc:"Required runtime for all AI tools" },
    whisper:      { ok:hasWhisper,version:null,          required:false, name:"openai-whisper",  desc:"AI transcription — subtitles & dubbing" },
    demucs:       { ok:hasDemucs,version:null,           required:false, name:"demucs",          desc:"Vocal separation (Hollywood dubbing)" },
    tts:          { ok:hasTTS,   version:null,           required:false, name:"Coqui TTS (XTTS v2)",desc:"Voice cloning for dubbing" },
    transformers: { ok:hasTransformers,version:null,     required:false, name:"transformers (NLLB-200)",desc:"200-language AI translation" },
    argos:        { ok:hasArgos, version:null,           required:false, name:"argostranslate",  desc:"Offline translation (fallback)" },
    esrgan:       { ok:hasEsrgan,version:null,           required:false, name:"Real-ESRGAN",     desc:"AI 4K/8K upscaling" },
    soundfile:    { ok:hasSoundfile,version:null,        required:false, name:"soundfile + librosa",desc:"Audio processing for dubbing" },
  };
});

ipcMain.handle("setup:install", async (_, { tools }) => {
  const log = (msg, status="running") => send("setup:progress", { msg, status });
  const py = python3Bin();

  const spawnLog = (cmd, args, label) => new Promise(resolve => {
    log(`▶ ${label}`);
    const proc = spawn(cmd, args, { env: ENV(), shell: IS_WIN });
    proc.stdout?.on("data", d => { const l=d.toString().trim().split("\n").pop()||""; if(l) log(`  ${l}`); });
    proc.stderr?.on("data", d => { const l=d.toString().trim().split("\n").pop()||""; if(l) log(`  ${l}`); });
    proc.on("error", err => { log(`  ✖ ${label}: ${err.message}`,"warn"); resolve(false); });
    proc.on("close", code => resolve(code===0||code===null));
  });

  if (IS_MAC) {
    if (tools.includes("brew")) {
      log("Installing Homebrew…");
      await spawnLog("/bin/bash",["-c",'NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'],"Homebrew");
    }
    const brew = fs.existsSync("/opt/homebrew/bin/brew")?"/opt/homebrew/bin/brew":"/usr/local/bin/brew";
    if (tools.includes("ffmpeg")) { log("Installing ffmpeg…"); await spawnLog(brew,["install","ffmpeg"],"ffmpeg"); }
    if (tools.includes("python"))  { const ok=await which("python3"); if(!ok){ log("Installing Python 3…"); await spawnLog(brew,["install","python3"],"python3"); } }
    const pipInstall = pkgs => spawnLog(py,["-m","pip","install","--user","--quiet",...pkgs],pkgs[0]);
    if (tools.includes("whisper"))      { log("Installing openai-whisper…"); await pipInstall(["openai-whisper"]); }
    if (tools.includes("demucs"))       { log("Installing Demucs (vocal separation)…"); await pipInstall(["demucs"]); }
    if (tools.includes("tts"))          { log("Installing Coqui TTS (XTTS v2) — this may take a few minutes…"); await pipInstall(["TTS"]); }
    if (tools.includes("transformers")) { log("Installing NLLB-200 translation engine…"); await pipInstall(["transformers","sentencepiece","sacremoses"]); }
    if (tools.includes("argos"))        { log("Installing Argos Translate…"); await pipInstall(["argostranslate"]); }
    if (tools.includes("esrgan"))       { log("Installing Real-ESRGAN…"); await pipInstall(["realesrgan","basicsr"]); }
    if (tools.includes("soundfile"))    { log("Installing audio libraries…"); await pipInstall(["soundfile","librosa","pyttsx3"]); }
  }

  if (IS_WIN) {
    const hasWinget = await which("winget");
    const pkg = hasWinget?"winget":"choco";
    if (tools.includes("ffmpeg"))  { if(hasWinget) await spawnLog("winget",["install","--id","Gyan.FFmpeg","-e","--accept-source-agreements","--accept-package-agreements"],"ffmpeg"); else await spawnLog("choco",["install","ffmpeg","-y"],"ffmpeg"); }
    if (tools.includes("python"))  { if(hasWinget) await spawnLog("winget",["install","--id","Python.Python.3.11","-e","--accept-source-agreements","--accept-package-agreements"],"python"); else await spawnLog("choco",["install","python3","-y"],"python3"); }
    const pipI = pkgs => spawnLog("python",["-m","pip","install","--quiet",...pkgs],pkgs[0]);
    if (tools.includes("whisper"))      { await pipI(["openai-whisper"]); }
    if (tools.includes("demucs"))       { await pipI(["demucs"]); }
    if (tools.includes("tts"))          { await pipI(["TTS"]); }
    if (tools.includes("transformers")) { await pipI(["transformers","sentencepiece","sacremoses"]); }
    if (tools.includes("argos"))        { await pipI(["argostranslate"]); }
    if (tools.includes("esrgan"))       { await pipI(["realesrgan","basicsr"]); }
    if (tools.includes("soundfile"))    { await pipI(["soundfile","librosa","pyttsx3"]); }
  }

  log("✓ All installations complete.", "done");
});

// ─── IPC: Folder ─────────────────────────────────────────────────────────────

ipcMain.handle("folder:select",       async () => { const r=await dialog.showOpenDialog(mainWindow,{properties:["openDirectory"],title:"Select Media Folder"}); return r.canceled?null:r.filePaths[0]; });
ipcMain.handle("folder:selectOutput", async () => { const r=await dialog.showOpenDialog(mainWindow,{properties:["openDirectory","createDirectory"],title:"Select Output Folder"}); return r.canceled?null:r.filePaths[0]; });
ipcMain.handle("folder:selectFile",   async (_,{title,filters}) => { const r=await dialog.showOpenDialog(mainWindow,{properties:["openFile"],title:title||"Select File",filters:filters||[]}); return r.canceled?null:r.filePaths[0]; });
ipcMain.handle("finder:reveal",       async (_,p) => { shell.showItemInFolder(p); });
ipcMain.handle("folder:scan",         async (_,p) => walkDir(p));

// ─── IPC: Convert ─────────────────────────────────────────────────────────────

ipcMain.handle("convert:run", async (_, { files, format, codec, outputSettings, jobId }) => {
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const input = files[i];
    const output = outPath(input,"_converted",format,outputSettings);
    const dur = await getDuration(input);
    send("job:progress",{jobId,progress:Math.round((i/total)*100),log:`Converting: ${path.basename(input)}`,status:"running"});
    await new Promise(resolve => {
      const proc = spawn(ffmpegBin(),["-i",input,"-c:v",codec,"-c:a","aac","-movflags","+faststart","-y",output],{env:ENV()});
      activeJobs.set(jobId,proc);
      proc.stderr.on("data",d=>{ const s=d.toString(),m=s.match(/time=(\S+)/); if(m&&dur>0){const e=parseFfmpegTime(m[1]),fp=Math.min(100,Math.round((e/dur)*100)),ov=Math.round(((i+fp/100)/total)*100); send("job:progress",{jobId,progress:ov,log:s.trim().split("\n").pop(),status:"running"});} });
      proc.on("error",err=>{activeJobs.delete(jobId);send("job:progress",{jobId,progress:0,log:`Error: ${err.message}`,status:"error"});resolve();});
      proc.on("close",code=>{activeJobs.delete(jobId);if(code!==0&&code!==null)send("job:progress",{jobId,progress:0,log:`ffmpeg exit ${code}`,status:"error"});resolve();});
    });
  }
  send("job:progress",{jobId,progress:100,log:`Done! ${total} file${total!==1?"s":""} converted.`,status:"done"});
});

// ─── IPC: Subtitles ───────────────────────────────────────────────────────────

ipcMain.handle("subs:run", async (_, { files, model, lang, targetLang, translate, burnIn, outputSettings, jobId }) => {
  const total = files.length;
  const py = python3Bin();
  for (let i = 0; i < total; i++) {
    const input = files[i];
    const name = path.basename(input);
    const srtDir = outputSettings?.location==="custom"&&outputSettings?.customPath ? outputSettings.customPath : path.dirname(input);
    ensureDir(srtDir);
    send("job:progress",{jobId,progress:Math.round((i/total)*100),log:`Transcribing: ${name}`,status:"running"});
    // Determine task: translate to English, or transcribe
    const task = (translate || (targetLang && targetLang!==lang && targetLang!=="auto")) ? "translate" : "transcribe";
    const whisperArgs = ["-m","whisper",input,"--model",model,"--output_format","srt","--output_dir",srtDir,"--task",task];
    if (lang && lang!=="auto") whisperArgs.push("--language",lang);
    let failed = false;
    await new Promise(resolve => {
      const proc = spawn(py,whisperArgs,{env:ENV()});
      activeJobs.set(jobId,proc);
      const logLine = d => { const l=d.toString().trim().split("\n").pop()||""; if(l) send("job:progress",{jobId,progress:Math.round(((i+0.5)/total)*100),log:l,status:"running"}); };
      proc.stdout.on("data",logLine);
      proc.stderr.on("data",d=>{ const s=d.toString(); if(s.toLowerCase().includes("no module")||s.toLowerCase().includes("error")) failed=true; logLine(d); });
      proc.on("error",err=>{ failed=true; send("job:progress",{jobId,progress:0,log:`Whisper error: ${err.message}`,status:"error"}); resolve(); });
      proc.on("close",()=>{ activeJobs.delete(jobId); resolve(); });
    });
    if(failed){ send("job:progress",{jobId,progress:0,log:`Whisper failed on ${name}. Check Settings.`,status:"error"}); return; }
    if (burnIn) {
      const srtPath = path.join(srtDir, path.basename(input).replace(/\.[^.]+$/,".srt"));
      if (fs.existsSync(srtPath)) {
        const output = outPath(input,"_subtitled","mp4",outputSettings);
        const esc = srtPath.replace(/\\/g,"/").replace(/:/g,"\\:").replace(/'/g,"\\'").replace(/\[/g,"\\[").replace(/\]/g,"\\]");
        await new Promise(r=>{ const p=spawn(ffmpegBin(),["-i",input,"-vf",`subtitles='${esc}'`,"-c:a","copy","-y",output],{env:ENV()}); p.on("error",()=>r()); p.on("close",()=>{activeJobs.delete(jobId);r();}); });
      }
    }
  }
  send("job:progress",{jobId,progress:100,log:`Subtitles done — ${total} file${total!==1?"s":""}.`,status:"done"});
});

// ─── IPC: Hollywood Dubbing ───────────────────────────────────────────────────

ipcMain.handle("dub:run", async (_, { files, srcLang, tgtLang, whisperModel, preserveBg, lipSync, quality, outputSettings, jobId }) => {
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const input = files[i];
    const outputDir = outputSettings?.location==="custom"&&outputSettings?.customPath ? outputSettings.customPath : path.dirname(input);
    ensureDir(outputDir);
    const base = path.basename(input, path.extname(input));
    const output = path.join(outputDir, `${base}_dubbed_${tgtLang}.mp4`);

    send("job:progress",{jobId,progress:Math.round((i/total)*100),log:`Dubbing: ${path.basename(input)}`,status:"running"});

    const ok = await runPyScript("dub_pipeline.py", {
      input, output, srcLang, tgtLang, whisperModel: whisperModel||"base",
      preserveBg: preserveBg!==false, lipSync: lipSync!==false, quality: quality||"balanced",
    }, jobId);

    if (!ok) {
      send("job:progress",{jobId,progress:0,log:`Dubbing failed for ${path.basename(input)}`,status:"error"});
      return;
    }
  }

  send("job:progress",{jobId,progress:100,log:`Hollywood dub complete — ${total} file${total!==1?"s":""}.`,status:"done"});
});

ipcMain.handle("dub:checkDeps", async () => {
  const [whisper, demucs, tts, transformers, argos, soundfile, librosa] = await Promise.all([
    pyCheck("whisper"),
    pyCheck("demucs"),
    pyCheck("TTS"),
    pyCheck("transformers"),
    pyCheck("argostranslate"),
    pyCheck("soundfile"),
    pyCheck("librosa"),
  ]);
  return { whisper, demucs, tts, transformers, argos, soundfile, librosa };
});

// ─── IPC: Remaster ────────────────────────────────────────────────────────────

ipcMain.handle("remaster:run", async (_, { files, opts, outputSettings, jobId }) => {
  const { model, targetRes, denoiseLevel, colorRestore, scratchRemoval, hdr } = opts;
  const total = files.length;
  const targetW = targetRes==="8k"?7680:targetRes==="4k"?3840:1920;
  const targetH = targetRes==="8k"?4320:targetRes==="4k"?2160:1080;
  const py = python3Bin();
  const esrganModel = {general:"RealESRGAN_x4plus",anime:"RealESRGAN_x4plus_anime_6B",face:"RealESRGAN_x4plus",film:"RealESRGAN_x4plus"}[model];
  const hasEsrgan = await new Promise(r => exec(`"${py}" -c "import realesrgan"`,{env:ENV()},err=>r(!err)));

  for (let i = 0; i < total; i++) {
    const input = files[i];
    const output = outPath(input,`_remastered_${targetRes}`,"mp4",outputSettings);
    const dur = await getDuration(input);
    send("job:progress",{jobId,progress:Math.round((i/total)*100),log:`Remastering: ${path.basename(input)}`,status:"running"});

    const filters = [];
    if(denoiseLevel>0) filters.push(`hqdn3d=${denoiseLevel}:${denoiseLevel}:${denoiseLevel*4}:${denoiseLevel*4}`);
    if(scratchRemoval) filters.push("tmedian=radius=1");
    filters.push(`scale=${targetW}:${targetH}:flags=lanczos+accurate_rnd:sws_dither=none`);
    filters.push("unsharp=5:5:1.0:5:5:0.0");
    if(colorRestore){ filters.push("curves=all='0/0 0.1/0.15 0.9/0.85 1/1'"); filters.push("eq=brightness=0.01:saturation=1.12:contrast=1.05"); }
    const hdrFlags = hdr?["-color_primaries","bt2020","-color_trc","smpte2084","-colorspace","bt2020nc","-pix_fmt","yuv420p10le"]:[];

    if (hasEsrgan && model!=="general") {
      const framesDir=path.join(os.tmpdir(),`pm_fr_${jobId}_${i}`),upscDir=path.join(os.tmpdir(),`pm_up_${jobId}_${i}`),audioFile=path.join(os.tmpdir(),`pm_audio_${jobId}_${i}.aac`);
      let done=false; const cleanup=()=>{if(done)return;done=true;try{fs.rmSync(framesDir,{recursive:true,force:true});}catch{}try{fs.rmSync(upscDir,{recursive:true,force:true});}catch{}try{if(fs.existsSync(audioFile))fs.unlinkSync(audioFile);}catch{}};
      try {
        ensureDir(framesDir);ensureDir(upscDir);
        await new Promise(r=>{const p=spawn(ffmpegBin(),["-i",input,"-vn","-c:a","copy","-y",audioFile],{env:ENV()});p.on("error",()=>r());p.on("close",r);});
        await new Promise(r=>{const vfPre=filters.slice(0,filters.findIndex(f=>f.startsWith("scale"))).filter(Boolean).join(",")||"null";const p=spawn(ffmpegBin(),["-i",input,"-vf",vfPre,`${framesDir}/frame%06d.png`],{env:ENV()});p.stderr.on("data",d=>{const m=d.toString().match(/frame=\s*(\d+)/);if(m)send("job:progress",{jobId,progress:Math.round(((i+0.3)/total)*100),log:`Extracting frame ${m[1]}`,status:"running"});});p.on("error",()=>r());p.on("close",r);});
        const esrArgs=["-m","realesrgan.inference_realesrgan","-n",esrganModel,"-i",framesDir,"-o",upscDir,"--suffix",""];if(model==="face")esrArgs.push("--face_enhance");
        await new Promise(r=>{const p=spawn(py,esrArgs,{env:ENV()});p.stderr.on("data",d=>send("job:progress",{jobId,progress:Math.round(((i+0.7)/total)*100),log:d.toString().trim().split("\n").pop()||"",status:"running"}));p.on("error",()=>r());p.on("close",r);});
        const postF=["unsharp=5:5:1.0"];if(colorRestore)postF.push("curves=all='0/0 0.1/0.15 0.9/0.85 1/1'","eq=brightness=0.01:saturation=1.12:contrast=1.05");
        await new Promise(r=>{const p=spawn(ffmpegBin(),["-framerate","24","-i",`${upscDir}/frame%06d.png`,"-i",audioFile,"-vf",postF.join(","),"-c:v","libx265","-crf","16","-b:v","80M","-maxrate","120M","-c:a","copy",...hdrFlags,"-y",output],{env:ENV()});p.stderr.on("data",d=>{const m=d.toString().match(/time=(\S+)/);if(m&&dur>0)send("job:progress",{jobId,progress:Math.round(((i+0.9)/total)*100),log:d.toString().trim().split("\n").pop()||"",status:"running"});});p.on("error",err=>{send("job:progress",{jobId,progress:0,log:`Error: ${err.message}`,status:"error"});r();});p.on("close",r);});
      }catch(e){send("job:progress",{jobId,progress:0,log:`Error: ${e.message}`,status:"error"});}finally{cleanup();}
    } else {
      await new Promise(resolve=>{
        const proc=spawn(ffmpegBin(),["-i",input,"-vf",filters.join(","),"-c:v","libx265","-crf","16","-b:v","80M","-maxrate","120M","-bufsize","160M","-c:a","copy",...hdrFlags,"-y",output],{env:ENV()});
        activeJobs.set(jobId,proc);
        proc.stderr.on("data",d=>{const s=d.toString(),m=s.match(/time=(\S+)/);if(m&&dur>0){const e=parseFfmpegTime(m[1]),fp=Math.min(100,Math.round((e/dur)*100));send("job:progress",{jobId,progress:Math.round(((i+fp/100)/total)*100),log:s.trim().split("\n").pop()||"",status:"running"});}});
        proc.on("error",err=>{activeJobs.delete(jobId);send("job:progress",{jobId,progress:0,log:`Error: ${err.message}`,status:"error"});resolve();});
        proc.on("close",code=>{activeJobs.delete(jobId);if(code!==0&&code!==null)send("job:progress",{jobId,progress:0,log:`Remaster failed (exit ${code})`,status:"error"});resolve();});
      });
    }
  }
  send("job:progress",{jobId,progress:100,log:`Remaster complete — ${total} file${total!==1?"s":""}.`,status:"done"});
});

// ─── IPC: Frame Interpolation ─────────────────────────────────────────────────

ipcMain.handle("interpolate:run", async (_, { files, multiplier, method, outputSettings, jobId }) => {
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const input = files[i];
    const output = outPath(input,`_${multiplier}x_smooth`,"mp4",outputSettings);
    send("job:progress",{jobId,progress:Math.round((i/total)*100),log:`Interpolating: ${path.basename(input)}`,status:"running"});
    await runPyScript("interpolate.py",{input,output,multiplier:multiplier||2,method:method||"rife"},jobId);
  }
  send("job:progress",{jobId,progress:100,log:`Frame interpolation complete — ${total} file${total!==1?"s":""}.`,status:"done"});
});

// ─── IPC: Automate ────────────────────────────────────────────────────────────

ipcMain.handle("automate:run", async (_, { rules, folder, outputSettings, jobId }) => {
  send("job:progress",{jobId,progress:5,log:"Scanning folder…",status:"running"});
  const files = walkDir(folder);
  let step=10; const py=python3Bin();
  if (rules.autoConvert) {
    const targets=files.filter(f=>f.ext!=="mp4");
    if(targets.length){ send("job:progress",{jobId,progress:step,log:`Converting ${targets.length} files…`,status:"running"});
      for(const f of targets){const output=outPath(f.path,"_converted","mp4",outputSettings);await new Promise(r=>{const p=spawn(ffmpegBin(),["-i",f.path,"-c:v","libx264","-c:a","aac","-movflags","+faststart","-y",output],{env:ENV()});p.on("error",()=>r());p.on("close",r);});step=Math.min(55,step+45/targets.length);send("job:progress",{jobId,progress:Math.round(step),log:`Converted: ${f.name}`,status:"running"});}
    }
  }
  if (rules.autoSubs) {
    const targets=files.filter(f=>!f.hasSrt);
    if(targets.length){ send("job:progress",{jobId,progress:60,log:`Subtitles for ${targets.length} files…`,status:"running"});
      for(const f of targets){const srtDir=outputSettings?.location==="custom"&&outputSettings?.customPath?outputSettings.customPath:path.dirname(f.path);ensureDir(srtDir);await new Promise(r=>{const p=spawn(py,["-m","whisper",f.path,"--model","base","--output_format","srt","--output_dir",srtDir,"--task",rules.autoTranslate?"translate":"transcribe"],{env:ENV()});p.on("error",()=>r());p.on("close",r);});step=Math.min(95,step+35/targets.length);send("job:progress",{jobId,progress:Math.round(step),log:`Subtitled: ${f.name}`,status:"running"});}
    }
  }
  send("job:progress",{jobId,progress:100,log:"Automation complete!",status:"done"});
});

// ─── IPC: Cancel / Deps ───────────────────────────────────────────────────────

ipcMain.handle("job:cancel", async (_,jobId) => { const p=activeJobs.get(jobId); if(p){p.kill("SIGTERM");activeJobs.delete(jobId);} });

ipcMain.handle("deps:check", async () => {
  const [ffmpeg,whisper,demucs,tts,transformers,esrgan] = await Promise.all([
    which("ffmpeg").then(ok=>ok||["/opt/homebrew/bin/ffmpeg","/usr/local/bin/ffmpeg"].some(p=>fs.existsSync(p))),
    pyCheck("whisper"), pyCheck("demucs"), pyCheck("TTS"), pyCheck("transformers"), pyCheck("realesrgan"),
  ]);
  return { ffmpeg, whisper, demucs, tts, transformers, esrgan };
});

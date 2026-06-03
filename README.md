# PerfectMedia

> AI-powered offline video conversion, subtitle generation, and 4K/8K cinematic upscaling — for macOS and Windows.

![Platform](https://img.shields.io/badge/macOS-arm64-black?logo=apple) ![Platform](https://img.shields.io/badge/Windows-x64-blue?logo=windows) ![Electron](https://img.shields.io/badge/Electron-31-00D4FF) ![Next.js](https://img.shields.io/badge/Next.js-15-white) ![License](https://img.shields.io/badge/license-MIT-00C896)

---

## What it does

| Feature | Description |
|---------|-------------|
| **Convert** | Batch convert MKV / AVI / WebM / MOV → MP4 / MKV / MOV. One-click "All Non-MP4 → MP4". H.264, H.265, VP9, stream copy. |
| **Subtitles** | Whisper AI transcription — 20 languages, translate to English, burn into video or export as SRT. Fully offline. |
| **AI Remaster** | Upscale any video to 4K or 8K. Four models: General HD, Anime/CGI, Faces, Film Restoration. Color restoration, scratch removal, HDR output. |
| **Automate** | Apply convert + subtitle + translate to your entire media folder in one run. |
| **Jobs** | Live progress, log viewer, cancel any running job. |
| **Settings** | Output folder, keep-originals, system tool status, one-click dependency installer. |

100% offline — no accounts, no cloud, no telemetry.

---

## Install (Mac — Apple Silicon)

> **Requires macOS 12+, Apple Silicon (M1 or later)**

### Option A — Download the DMG (recommended)

1. Download **`PerfectMedia.dmg`** from the [`releases/`](releases/) folder (or from [GitHub Releases](../../releases))
2. Open the DMG → drag **PerfectMedia** to **Applications**
3. Right-click the app in Applications → **Open** (first launch only, bypasses Gatekeeper for unsigned build)
4. The app opens a **first-launch setup wizard** automatically — it scans your system, shows what's installed, and offers to install anything missing

### Option B — Build from source

```bash
git clone https://github.com/YOUR_USERNAME/PerfectMedia.git
cd PerfectMedia
npm install
npm run dist:mac
# Output: dist/PerfectMedia-1.0.0-arm64.dmg
# App:    dist/mac-arm64/PerfectMedia.app
```

---

## Install (Windows — x64)

> **Requires Windows 10 or later, 64-bit**

### Option A — Build from source

```bash
git clone https://github.com/YOUR_USERNAME/PerfectMedia.git
cd PerfectMedia
npm install
npm run dist:win
# Output: dist/PerfectMedia Setup 1.0.0.exe
```

Run the `.exe` installer → it creates a Start Menu shortcut and installs to `Program Files`.

### Option B — Portable (no installer)

```bash
npm run dist:win
# Also creates: dist/PerfectMedia 1.0.0.exe  (portable, no install needed)
```

---

## First-Launch Setup Wizard

When you open PerfectMedia for the first time, it automatically:

1. **Detects your OS, shell (zsh/bash/PowerShell), and architecture**
2. **Scans for all required tools** — shows a live checklist with ✓/✗ status
3. **Lets you select what to install** — pre-selects only what's missing
4. **Installs using your system's package manager**:
   - macOS: Homebrew → `brew install ffmpeg`, `pip3 install openai-whisper`
   - Windows: winget or Chocolatey → `winget install Gyan.FFmpeg`, etc.
5. **Shows a live terminal log** — you see every command and its output in real time
6. **Proceeds to the main app** once setup is complete

You can re-run the wizard any time from **Settings → Re-run First-Launch Setup Wizard**.

---

## Runtime Dependencies

These are installed automatically by the setup wizard, or manually as shown:

| Tool | macOS | Windows | Required for |
|------|-------|---------|-------------|
| **ffmpeg** | `brew install ffmpeg` | `winget install Gyan.FFmpeg` | Convert, Remaster, Subtitle burn-in |
| **python3** | `brew install python3` | `winget install Python.Python.3.11` | Required for AI tools |
| **openai-whisper** | `pip3 install openai-whisper` | `pip install openai-whisper` | AI subtitle generation |
| **Real-ESRGAN** *(optional)* | `pip3 install realesrgan basicsr` | `pip install realesrgan basicsr` | AI 4K/8K frame enhancement |

> **Note:** Real-ESRGAN is optional. The AI Remaster feature falls back to a high-quality FFmpeg-only upscaling pipeline if it's not installed.

---

## Output Files

All outputs save alongside the source file by default (configurable in Settings):

| Operation | Output |
|-----------|--------|
| Convert | `filename_converted.mp4` |
| Subtitles (SRT) | `filename.srt` |
| Subtitles (burn-in) | `filename_subtitled.mp4` |
| Remaster 4K | `filename_remastered_4k.mp4` |
| Remaster 8K | `filename_remastered_8k.mp4` |

---

## Build Scripts

```bash
npm run build        # Build Next.js static export only
npm run dist:mac     # Build macOS DMG (arm64, requires macOS)
npm run dist:win     # Build Windows NSIS installer + portable (x64)
npm run dist:all     # Build both platforms
npm run release      # dist:mac + copies DMG to releases/PerfectMedia.dmg
```

---

## Project Structure

```
PerfectMedia/
├── releases/
│   └── PerfectMedia.dmg        ← Pre-built Mac app (Git LFS)
├── src/app/
│   ├── page.tsx                 ← Full app UI + Setup Wizard (inline styles)
│   ├── layout.tsx               ← HTML shell
│   └── globals.css              ← Minimal reset + keyframe animations
├── electron/
│   ├── main.js                  ← Main process: IPC handlers, setup installer
│   └── preload.js               ← Context bridge (exposes electronAPI)
├── assets/
│   ├── icon.icns                ← macOS app icon
│   ├── icon.png                 ← Windows / fallback icon
│   └── icon_*.png               ← All sizes 16 → 1024
├── entitlements.mac.plist       ← macOS hardened runtime entitlements
├── .gitattributes               ← Git LFS tracking for binary releases
├── next.config.ts               ← Static export config
└── package.json                 ← Build config for Mac + Windows
```

---

## Git LFS (required for DMG in repo)

The `releases/PerfectMedia.dmg` file is tracked with Git LFS (it exceeds GitHub's 100 MB limit).

To clone with the DMG included:

```bash
# Install Git LFS first (one-time)
git lfs install

# Then clone as normal
git clone https://github.com/YOUR_USERNAME/PerfectMedia.git
```

Without Git LFS, the clone still works — the DMG will be a pointer file. Build from source instead.

---

## Privacy

- Zero network requests during app operation
- All AI processing runs locally (Whisper on-device, Real-ESRGAN on-device)
- No analytics, no telemetry, no crash reporting, no cloud upload

---

## License

MIT — built with [ffmpeg](https://ffmpeg.org), [Whisper](https://github.com/openai/whisper), [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), [Electron 31](https://electronjs.org), [Next.js 15](https://nextjs.org).

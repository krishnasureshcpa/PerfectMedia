#!/usr/bin/env python3
"""
PerfectMedia Hollywood Dubbing Pipeline
Stage pipeline: extract → separate → transcribe → translate → clone+synthesize → lipsync → render

Progress is streamed as JSON lines to stdout for the Electron main process to consume.
"""

import sys, os, json, shutil, tempfile, subprocess, time, re
from pathlib import Path

# ─── Progress reporting ───────────────────────────────────────────────────────

def log(msg, stage="info", progress=0, error=False):
    print(json.dumps({
        "msg": msg,
        "stage": stage,
        "progress": progress,
        "error": error,
        "ts": time.time(),
    }), flush=True)

def fatal(msg):
    log(msg, stage="error", progress=0, error=True)
    sys.exit(1)

# ─── FFmpeg helpers ───────────────────────────────────────────────────────────

def ffmpeg(*args, check=True):
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", *args],
        capture_output=True, text=True
    )
    if check and result.returncode != 0:
        raise RuntimeError(f"ffmpeg: {result.stderr}")
    return result

def ffprobe_duration(path):
    r = subprocess.run(
        ["ffprobe","-v","quiet","-print_format","json","-show_format", path],
        capture_output=True, text=True
    )
    try:
        return float(json.loads(r.stdout)["format"]["duration"])
    except Exception:
        return 0.0

# ─── Main pipeline ────────────────────────────────────────────────────────────

def main():
    try:
        args = json.loads(sys.argv[1])
    except Exception:
        fatal("Invalid arguments. Expected JSON as first argument.")

    input_file  = args["input"]
    output_file = args["output"]
    src_lang    = args.get("srcLang", "auto")     # "auto" = Whisper detects
    tgt_lang    = args.get("tgtLang", "en")        # XTTS language code
    whisper_model = args.get("whisperModel", "base")
    preserve_bg   = args.get("preserveBg", True)   # Keep background music
    lip_sync      = args.get("lipSync", True)       # Apply Wav2Lip
    quality       = args.get("quality", "balanced") # fast/balanced/studio

    if not os.path.exists(input_file):
        fatal(f"Input file not found: {input_file}")

    tmp = tempfile.mkdtemp(prefix="pm_dub_")
    log(f"Working directory: {tmp}", "init", 1)

    try:
        # ── Stage 1: Extract audio ─────────────────────────────────────────────
        log("Extracting audio from video…", "extract", 5)
        audio_wav = os.path.join(tmp, "audio.wav")
        ffmpeg("-i", input_file,
               "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1",
               "-y", audio_wav)
        duration = ffprobe_duration(audio_wav)
        log(f"Audio duration: {duration:.1f}s", "extract", 8)

        # ── Stage 2: Source separation (Demucs) ────────────────────────────────
        log("Separating vocals from background (Demucs)…", "separate", 10)
        try:
            import demucs.separate
            sep_out = os.path.join(tmp, "separated")
            result = subprocess.run(
                [sys.executable, "-m", "demucs",
                 "--two-stems", "vocals",
                 "-o", sep_out,
                 "--mp3",
                 audio_wav],
                capture_output=True, text=True
            )
            # Find output files
            htdemucs_dir = os.path.join(sep_out, "htdemucs")
            track_name = Path(audio_wav).stem
            vocals_file   = os.path.join(htdemucs_dir, track_name, "vocals.mp3")
            background_file = os.path.join(htdemucs_dir, track_name, "no_vocals.mp3")
            # Convert separated files to wav for processing
            vocals_wav = os.path.join(tmp, "vocals.wav")
            bg_wav     = os.path.join(tmp, "background.wav")
            if os.path.exists(vocals_file):
                ffmpeg("-i", vocals_file, "-ar", "16000", "-ac", "1", "-y", vocals_wav)
            else:
                shutil.copy(audio_wav, vocals_wav)
            if os.path.exists(background_file):
                ffmpeg("-i", background_file, "-ar", "44100", "-ac", "2", "-y", bg_wav)
            else:
                bg_wav = None
            log("Vocal separation complete", "separate", 18)
        except Exception as e:
            log(f"Demucs not available, using raw audio: {e}", "separate", 18)
            vocals_wav  = audio_wav
            bg_wav      = None

        # ── Stage 3: Transcribe (Whisper) ──────────────────────────────────────
        wmodel_name = {"fast":"tiny","balanced":"base","studio":"large-v3"}.get(quality, whisper_model)
        log(f"Loading Whisper model '{wmodel_name}'…", "transcribe", 20)
        try:
            import whisper
            w = whisper.load_model(wmodel_name)
            log(f"Transcribing in {'auto-detect' if src_lang=='auto' else src_lang}…", "transcribe", 25)
            transcription = w.transcribe(
                vocals_wav,
                language=None if src_lang == "auto" else src_lang,
                task="transcribe",
                verbose=False,
                word_timestamps=True,
            )
            segments        = transcription["segments"]
            detected_lang   = transcription.get("language", src_lang)
            full_text       = transcription["text"]
            log(f"Transcribed {len(segments)} segments, detected: {detected_lang}", "transcribe", 35)
        except Exception as e:
            fatal(f"Whisper transcription failed: {e}")

        # ── Stage 4: Translate (NLLB-200 or Argos Translate) ──────────────────
        lang_map = {
            "en":"eng_Latn","es":"spa_Latn","fr":"fra_Latn","de":"deu_Latn",
            "it":"ita_Latn","pt":"por_Latn","ru":"rus_Cyrl","ja":"jpn_Jpan",
            "ko":"kor_Hang","zh":"zho_Hans","ar":"arb_Arab","hi":"hin_Deva",
            "nl":"nld_Latn","sv":"swe_Latn","pl":"pol_Latn","tr":"tur_Latn",
            "vi":"vie_Latn","th":"tha_Thai","id":"ind_Latn","uk":"ukr_Cyrl",
            "he":"heb_Hebr","fa":"pes_Arab","cs":"ces_Latn","ro":"ron_Latn",
            "hu":"hun_Latn","fi":"fin_Latn","da":"dan_Latn","no":"nob_Latn",
            "bg":"bul_Cyrl","hr":"hrv_Latn","sk":"slk_Latn","lt":"lit_Latn",
            "lv":"lav_Latn","et":"est_Latn","sl":"slv_Latn","ca":"cat_Latn",
        }

        translated_segments = segments
        if tgt_lang != detected_lang:
            log(f"Translating {detected_lang} → {tgt_lang} using NLLB-200…", "translate", 40)
            translated_segments = _translate_segments(segments, detected_lang, tgt_lang, lang_map, log)
        else:
            for seg in segments:
                seg["translated"] = seg["text"]
            log("Source and target language match — skipping translation", "translate", 45)

        # ── Stage 5: Voice cloning + synthesis (XTTS v2) ──────────────────────
        log("Initializing XTTS v2 voice cloning engine…", "synthesize", 50)
        dubbed_audio = os.path.join(tmp, "dubbed.wav")
        try:
            _synthesize_xtts(translated_segments, vocals_wav, tgt_lang, dubbed_audio, duration, tmp, log)
        except Exception as e:
            fatal(f"Voice synthesis failed: {e}")

        # ── Stage 6: Lip sync (Wav2Lip) ───────────────────────────────────────
        if lip_sync:
            log("Applying neural lip sync (Wav2Lip)…", "lipsync", 78)
            lip_out = os.path.join(tmp, "lip_synced.mp4")
            try:
                _wav2lip(input_file, dubbed_audio, lip_out, log)
                video_src = lip_out if os.path.exists(lip_out) else input_file
                log("Lip sync complete", "lipsync", 85)
            except Exception as e:
                log(f"Lip sync skipped (Wav2Lip not available): {e}", "lipsync", 85)
                video_src = input_file
        else:
            video_src = input_file

        # ── Stage 7: Mix and render final video ───────────────────────────────
        log("Mixing audio tracks and rendering final video…", "render", 88)
        if preserve_bg and bg_wav and os.path.exists(bg_wav):
            # Mix dubbed voice + original background music
            ffmpeg(
                "-i", video_src,
                "-i", dubbed_audio,
                "-i", bg_wav,
                "-filter_complex",
                "[1:a]volume=1.0[dub];[2:a]volume=0.35[bg];[dub][bg]amix=inputs=2:duration=longest[a]",
                "-map", "0:v",
                "-map", "[a]",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-y", output_file
            )
        else:
            ffmpeg(
                "-i", video_src,
                "-i", dubbed_audio,
                "-map", "0:v",
                "-map", "1:a",
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                "-y", output_file
            )

        log(f"Dubbing complete → {Path(output_file).name}", "done", 100)

    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ─── Translation helpers ──────────────────────────────────────────────────────

def _translate_segments(segments, src, tgt, lang_map, log_fn):
    """Translate using NLLB-200 (best offline option, 200 languages)."""
    translated = list(segments)  # copy

    # Try NLLB-200 first
    try:
        from transformers import pipeline as hf_pipeline
        src_code = lang_map.get(src, f"{src}_Latn")
        tgt_code = lang_map.get(tgt, f"{tgt}_Latn")
        log_fn("Loading NLLB-200 translation model…", "translate", 42)
        translator = hf_pipeline(
            "translation",
            model="facebook/nllb-200-distilled-600M",
            src_lang=src_code,
            tgt_lang=tgt_code,
            max_length=512,
            device=-1,  # CPU; use 0 for GPU
        )
        texts = [s["text"] for s in segments]
        results = translator(texts, batch_size=8)
        for i, (seg, res) in enumerate(zip(translated, results)):
            seg["translated"] = res["translation_text"]
            if i % 10 == 0:
                log_fn(f"Translated {i+1}/{len(segments)} segments…", "translate", 42 + int(6*(i+1)/len(segments)))
        return translated
    except Exception as e:
        log_fn(f"NLLB-200 not available, trying Argos: {e}", "translate", 44)

    # Fallback: Argos Translate
    try:
        import argostranslate.package, argostranslate.translate
        argostranslate.package.update_package_index()
        available = argostranslate.package.get_available_packages()
        pkg = next((p for p in available if p.from_code==src and p.to_code==tgt), None)
        if pkg:
            argostranslate.package.install_from_path(pkg.download())
        installed = argostranslate.translate.get_installed_languages()
        from_lang = next((l for l in installed if l.code==src), None)
        to_lang   = next((l for l in installed if l.code==tgt), None)
        if from_lang and to_lang:
            tr = from_lang.get_translation(to_lang)
            for seg in translated:
                seg["translated"] = tr.translate(seg["text"])
            return translated
    except Exception as e:
        log_fn(f"Argos not available: {e}", "translate", 45)

    # Last resort: Whisper translate task (to English only)
    log_fn("Using Whisper translation (English only fallback)…", "translate", 45)
    import whisper
    w = whisper.load_model("base")
    result = w.transcribe(segments[0].get("_audio_path", ""), task="translate")
    for i, seg in enumerate(translated):
        seg["translated"] = result["segments"][i]["text"] if i < len(result["segments"]) else seg["text"]
    return translated


# ─── Voice synthesis (XTTS v2) ───────────────────────────────────────────────

def _synthesize_xtts(segments, speaker_wav, tgt_lang, output_path, total_duration, tmp, log_fn):
    """
    Clone the speaker's voice and synthesize each segment in the target language.
    Assembles into a single timed audio file matching the original video timing.
    """
    # XTTS language codes
    xtts_lang_map = {
        "en":"en","es":"es","fr":"fr","de":"de","it":"it","pt":"pt",
        "ru":"ru","ja":"ja","ko":"ko","zh":"zh-cn","ar":"ar","hi":"hi",
        "nl":"nl","tr":"tr","pl":"pl","cs":"cs","hu":"hu","ro":"ro",
    }
    lang_code = xtts_lang_map.get(tgt_lang, "en")

    try:
        from TTS.api import TTS
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        log_fn(f"Loading XTTS v2 on {device}…", "synthesize", 52)
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

        import numpy as np
        import soundfile as sf

        sr = 24000  # XTTS v2 output sample rate
        total_samples = int(total_duration * sr)
        track = np.zeros(total_samples, dtype=np.float32)

        for i, seg in enumerate(segments):
            text = seg.get("translated") or seg.get("text", "")
            if not text.strip():
                continue
            seg_path = os.path.join(tmp, f"synth_{i:05d}.wav")
            tts.tts_to_file(
                text=text,
                speaker_wav=speaker_wav,
                language=lang_code,
                file_path=seg_path,
            )
            data, file_sr = sf.read(seg_path)
            if data.ndim > 1:
                data = data.mean(axis=1)
            if file_sr != sr:
                import librosa
                data = librosa.resample(data, orig_sr=file_sr, target_sr=sr)
            start = int(seg["start"] * sr)
            end   = min(start + len(data), total_samples)
            track[start:end] += data[:end-start]
            prog = 52 + int(25 * (i+1) / len(segments))
            log_fn(f"Synthesized segment {i+1}/{len(segments)}: {text[:60]}…", "synthesize", prog)

        # Normalize and export
        peak = np.abs(track).max()
        if peak > 0:
            track = track / peak * 0.92
        sf.write(output_path, track, sr)
        log_fn("Voice synthesis complete", "synthesize", 78)

    except ImportError as e:
        # Fallback to gTTS or espeak if XTTS not available
        log_fn(f"XTTS v2 not installed, using pyttsx3 fallback: {e}", "synthesize", 52)
        _synthesize_fallback(segments, tgt_lang, output_path, total_duration, tmp, log_fn)


def _synthesize_fallback(segments, tgt_lang, output_path, total_duration, tmp, log_fn):
    """Fallback TTS using pyttsx3 (no voice cloning, but works offline)."""
    try:
        import pyttsx3, numpy as np, soundfile as sf
        engine = pyttsx3.init()
        sr = 22050
        track = np.zeros(int(total_duration * sr), dtype=np.float32)
        for i, seg in enumerate(segments):
            text = seg.get("translated") or seg.get("text", "")
            if not text.strip():
                continue
            seg_path = os.path.join(tmp, f"fallback_{i:05d}.wav")
            engine.save_to_file(text, seg_path)
            engine.runAndWait()
            if os.path.exists(seg_path):
                data, file_sr = sf.read(seg_path)
                if data.ndim > 1: data = data.mean(axis=1)
                start = int(seg["start"] * sr)
                end   = min(start + len(data), int(total_duration * sr))
                track[start:end] += data[:end-start]
        sf.write(output_path, track, sr)
    except Exception as e:
        log_fn(f"All TTS failed: {e}", "synthesize", 78, error=True)


# ─── Lip sync (Wav2Lip) ───────────────────────────────────────────────────────

def _wav2lip(video, audio, output, log_fn):
    """Run Wav2Lip for neural lip sync. Requires wav2lip to be installed."""
    import importlib.util

    # Try finding Wav2Lip
    wav2lip_dir = None
    for candidate in [
        os.path.expanduser("~/wav2lip"),
        os.path.expanduser("~/.local/share/wav2lip"),
        "/opt/wav2lip",
    ]:
        if os.path.exists(os.path.join(candidate, "inference.py")):
            wav2lip_dir = candidate
            break

    if not wav2lip_dir:
        raise RuntimeError("Wav2Lip not found. Install it from https://github.com/Rudrabha/Wav2Lip")

    checkpoint = os.path.join(wav2lip_dir, "checkpoints", "wav2lip_gan.pth")
    if not os.path.exists(checkpoint):
        checkpoint = os.path.join(wav2lip_dir, "checkpoints", "wav2lip.pth")
    if not os.path.exists(checkpoint):
        raise RuntimeError("Wav2Lip checkpoint not found")

    result = subprocess.run(
        [sys.executable,
         os.path.join(wav2lip_dir, "inference.py"),
         "--checkpoint_path", checkpoint,
         "--face", video,
         "--audio", audio,
         "--outfile", output,
         "--resize_factor", "1",
         "--pads", "0 15 0 0",  # top=0, bottom=15, left=0, right=0 (improve chin coverage)
         "--nosmooth",
         ],
        capture_output=True, text=True,
        cwd=wav2lip_dir,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:] if result.stderr else "Wav2Lip failed")


if __name__ == "__main__":
    main()

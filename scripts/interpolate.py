#!/usr/bin/env python3
"""
PerfectMedia Frame Interpolation Pipeline
Uses RIFE (Real-Time Intermediate Flow Estimation) to multiply frame rate.
Falls back to minterpolate (FFmpeg-native) if RIFE not available.
"""

import sys, os, json, shutil, tempfile, subprocess, time
from pathlib import Path

def log(msg, stage="info", progress=0, error=False):
    print(json.dumps({"msg":msg,"stage":stage,"progress":progress,"error":error,"ts":time.time()}), flush=True)

def ffmpeg(*args, check=True, cwd=None):
    r = subprocess.run(["ffmpeg","-hide_banner","-loglevel","error",*args],
                       capture_output=True, text=True, cwd=cwd)
    if check and r.returncode != 0:
        raise RuntimeError(f"ffmpeg: {r.stderr}")
    return r

def ffprobe_info(path):
    r = subprocess.run(
        ["ffprobe","-v","quiet","-print_format","json","-show_streams","-show_format",path],
        capture_output=True, text=True
    )
    return json.loads(r.stdout)

def main():
    args = json.loads(sys.argv[1])
    input_file  = args["input"]
    output_file = args["output"]
    multiplier  = int(args.get("multiplier", 2))  # 2x, 4x, 8x
    method      = args.get("method", "rife")       # rife | minterpolate | blend

    info = ffprobe_info(input_file)
    video_stream = next((s for s in info["streams"] if s["codec_type"]=="video"), None)
    if not video_stream:
        log("No video stream found", error=True); sys.exit(1)

    # Parse source FPS
    fps_str = video_stream.get("r_frame_rate","24/1")
    num, den = map(int, fps_str.split("/"))
    src_fps = num / den
    tgt_fps = src_fps * multiplier
    log(f"Source: {src_fps:.2f}fps → Target: {tgt_fps:.2f}fps ({multiplier}x)", "init", 2)

    tmp = tempfile.mkdtemp(prefix="pm_interp_")

    try:
        if method == "rife":
            _rife_interpolate(input_file, output_file, multiplier, src_fps, tgt_fps, tmp, log)
        else:
            _minterpolate(input_file, output_file, tgt_fps, log)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _rife_interpolate(input_file, output_file, multiplier, src_fps, tgt_fps, tmp, log_fn):
    """Use RIFE for high-quality neural frame interpolation."""
    # Find RIFE installation
    rife_dir = None
    for candidate in [
        os.path.expanduser("~/ECCV2022-RIFE"),
        os.path.expanduser("~/rife"),
        os.path.expanduser("~/.local/share/rife"),
    ]:
        if os.path.exists(os.path.join(candidate, "inference_video.py")):
            rife_dir = candidate
            break

    if not rife_dir:
        log_fn("RIFE not found, using FFmpeg minterpolate…", "interpolate", 5)
        _minterpolate(input_file, output_file, tgt_fps, log_fn)
        return

    frames_dir = os.path.join(tmp, "frames")
    out_dir    = os.path.join(tmp, "out_frames")
    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)

    # Extract audio
    log_fn("Extracting audio…", "interpolate", 5)
    audio_file = os.path.join(tmp, "audio.aac")
    ffmpeg("-i", input_file, "-vn", "-acodec", "copy", "-y", audio_file, check=False)

    # Extract frames
    log_fn("Extracting video frames…", "interpolate", 10)
    ffmpeg("-i", input_file, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
           f"{frames_dir}/frame%08d.png", check=True)

    # Run RIFE
    log_fn(f"Running RIFE {multiplier}x interpolation…", "interpolate", 30)
    exp = {2:1, 4:2, 8:3}.get(multiplier, 1)
    result = subprocess.run(
        [sys.executable, "inference_img.py",
         "--img", frames_dir,
         "--exp", str(exp),
         "--output", out_dir,
        ],
        capture_output=True, text=True, cwd=rife_dir
    )
    if result.returncode != 0:
        log_fn(f"RIFE failed: {result.stderr[-200:]}, falling back to minterpolate", "interpolate", 30)
        _minterpolate(input_file, output_file, tgt_fps, log_fn)
        return

    # Re-encode
    log_fn("Encoding interpolated video…", "interpolate", 80)
    if os.path.exists(audio_file):
        ffmpeg("-framerate", str(tgt_fps),
               "-i", f"{out_dir}/img%08d.png",
               "-i", audio_file,
               "-c:v", "libx264", "-crf", "15", "-preset", "slow",
               "-c:a", "copy", "-map", "0:v", "-map", "1:a",
               "-y", output_file)
    else:
        ffmpeg("-framerate", str(tgt_fps),
               "-i", f"{out_dir}/img%08d.png",
               "-c:v", "libx264", "-crf", "15", "-preset", "slow",
               "-y", output_file)

    log_fn(f"Frame interpolation complete → {Path(output_file).name}", "done", 100)


def _minterpolate(input_file, output_file, tgt_fps, log_fn):
    """FFmpeg-native motion interpolation (no external deps needed)."""
    log_fn(f"FFmpeg minterpolate → {tgt_fps:.2f}fps…", "interpolate", 10)
    ffmpeg(
        "-i", input_file,
        "-filter:v", f"minterpolate=fps={tgt_fps:.3f}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1",
        "-c:v", "libx264", "-crf", "15", "-preset", "slow",
        "-c:a", "copy",
        "-y", output_file
    )
    log_fn(f"Frame interpolation complete → {Path(output_file).name}", "done", 100)


if __name__ == "__main__":
    main()

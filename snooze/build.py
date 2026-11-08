"""build.py - one command to rebuild the whole film.

    python3 -m snooze.build                 # everything (long: ~45 min)
    python3 -m snooze.build --steps audio   # just the soundtrack
    python3 -m snooze.build --steps plates,blend
    python3 -m snooze.build --steps render --workers 2

Steps
  plates   render one key plate per shot for the Blender project
  blend    assemble output/SNOOZE_project.blend (needs the `bpy` module)
  audio    synthesise output/snooze_audio.wav
  render   render 2880 frames to H.264 segments and mux the final MP4
  sheet    one finished frame per beat -> output/SNOOZE_contactsheet.png
  verify   check duration / resolution / frame count / loop
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'output')
VIDEO = os.path.join(OUT, 'snooze.mp4')
AUDIO = os.path.join(OUT, 'snooze_audio.wav')
BLEND = os.path.join(OUT, 'SNOOZE_project.blend')


def run(cmd, **kw):
    print('+', ' '.join(cmd), flush=True)
    return subprocess.run(cmd, check=True, **kw)


def step_plates():
    run([sys.executable, '-m', 'snooze.plates'], cwd=ROOT)


def step_blend():
    """Build the .blend with the `bpy` module (may need a GL library stub on
    headless machines: Blender still links libGL/libEGL even when only writing
    a file)."""
    env = dict(os.environ)
    stub = env.get('SNOOZE_GL_STUB', '/tmp/stub2')
    if stub and os.path.isdir(stub):
        env['LD_LIBRARY_PATH'] = stub + (':' + env['LD_LIBRARY_PATH']
                                        if env.get('LD_LIBRARY_PATH') else '')
    run([sys.executable, os.path.join(ROOT, 'blender', 'build_snooze_blend.py')],
        cwd=ROOT, env=env)


def step_audio():
    run([sys.executable, '-m', 'snooze.audio'], cwd=ROOT)


def step_render(workers=2):
    from snooze.gfx import FRAMES
    half = FRAMES // 2
    segs = [(0, half), (half, FRAMES)][:max(1, workers)]
    procs = []
    for i, (a, b) in enumerate(segs):
        out = os.path.join(OUT, f'seg{chr(65 + i)}.mp4')
        cmd = [sys.executable, '-m', 'snooze.render', '--segment', str(a),
               str(b), '--out', out, '--crf', '18']
        print('+', ' '.join(cmd), flush=True)
        procs.append((out, subprocess.Popen(cmd, cwd=ROOT)))
    for out, p in procs:
        if p.wait() != 0:
            raise SystemExit(f'render failed: {out}')
    # concat + mux the original score
    lst = os.path.join(OUT, 'segments.txt')
    with open(lst, 'w') as f:
        for out, _ in procs:
            f.write(f"file '{out}'\n")
    run([_ffmpeg(), '-y', '-hide_banner', '-loglevel', 'error',
         '-f', 'concat', '-safe', '0', '-i', lst,
         '-i', AUDIO, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
         '-shortest', '-movflags', '+faststart', VIDEO])


def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'


def step_sheet():
    """One finished frame per beat -> output/SNOOZE_contactsheet.png."""
    from PIL import Image
    from snooze.render import Renderer
    times = [1.2, 8.0, 16.0, 26.0, 44.0, 47.6, 66.0, 80.0, 92.0, 104.6, 112.0, 119.5]
    r = Renderer()
    tw, th, pad, cols = 360, 640, 8, 4
    rows = (len(times) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (tw + pad) + pad, rows * (th + pad) + pad),
                      (18, 18, 24))
    for i, t in enumerate(times):
        im = Image.fromarray(r.frame(t)[:, :, :3]).resize((tw, th), Image.LANCZOS)
        x = pad + (i % cols) * (tw + pad)
        y = pad + (i // cols) * (th + pad)
        sheet.paste(im, (x, y))
    out = os.path.join(OUT, 'SNOOZE_contactsheet.png')
    sheet.save(out)
    print('wrote', out)
    return out


def step_verify():
    from snooze.verify import verify
    ok = verify(VIDEO)
    print('verify:', 'PASS' if ok else 'FAIL')
    return ok


STEPS = {'plates': step_plates, 'blend': step_blend, 'audio': step_audio,
         'render': step_render, 'sheet': step_sheet, 'verify': step_verify}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--steps', default='plates,blend,audio,render,sheet,verify')
    ap.add_argument('--workers', type=int, default=2)
    a = ap.parse_args()
    order = ['plates', 'blend', 'audio', 'render', 'sheet', 'verify']
    wanted = [s.strip() for s in a.steps.split(',') if s.strip()]
    for s in order:
        if s not in wanted:
            continue
        print(f'=== {s} ===', flush=True)
        t0 = time.time()
        if s == 'render':
            STEPS[s](a.workers)
        elif s == 'verify':
            if not STEPS[s]():
                raise SystemExit(1)
        else:
            STEPS[s]()
        print(f'=== {s} done in {time.time() - t0:.0f}s ===', flush=True)


if __name__ == '__main__':
    main()

"""Render every lesson's two-voice spoken version (.tl-listen-script) to a small audio file.

Free and local: uses the open-source Kokoro TTS model (Apache-2.0), no API key, no per-character fee.
Output: theory-lab/audio/<slug>.m4a (AAC, mono, 32 kbps, about 0.25 MB per minute) and
theory-lab/audio/manifest.json with, per lesson, the text hash and each line's start time, so the page can
highlight the line being spoken. Lessons whose dialogue text is unchanged are skipped, so the script is
resumable and re-running it after editing one dialogue re-renders only that lesson.

Setup (once):  pip install kokoro-onnx soundfile ; ffmpeg must be on PATH
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx
  curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
Run:           python3 education/tools/build_audio.py --models DIR [slug …]
The page (assets/vark.js) plays the file when the manifest hash matches the dialogue on the page, and falls
back to the browser's own voices otherwise. js/lessonAudio.test.mjs reports any stale or missing file.
"""
import argparse, html, json, os, re, subprocess, sys, tempfile, time
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
LESSONS = os.path.join(ROOT, 'theory-lab', 'lessons')
OUT = os.path.join(ROOT, 'theory-lab', 'audio')
VOICES = {'Trader': 'bm_george', 'Quant': 'bf_emma'}   # British male / British female
GAP = 0.35                                               # seconds of silence between lines


def dialogue(path):
    """[(who, text)] exactly as the page shows it (tags stripped, entities decoded, whitespace collapsed)."""
    s = open(path, encoding='utf-8').read()
    m = re.search(r'<div class="tl-listen-script">(.*?)</div>', s, re.S)
    if not m: return []
    return [(w, re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', t))).strip())
            for w, t in re.findall(r'<p data-who="(\w+)">(.*?)</p>', m.group(1), re.S)]


def fnv1a(text):
    """32-bit FNV-1a over UTF-16 code units, matching the JS in assets/vark.js."""
    h = 0x811c9dc5
    for ch in text.encode('utf-16-le').decode('utf-16-le'):
        for unit in ([ord(ch)] if ord(ch) < 0x10000 else [0xD800 + ((ord(ch) - 0x10000) >> 10), 0xDC00 + ((ord(ch) - 0x10000) & 0x3FF)]):
            h ^= unit; h = (h * 0x01000193) & 0xFFFFFFFF
    return '%08x' % h


def key(lines): return fnv1a('\n'.join(w + ': ' + t for w, t in lines))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--models', default='.'); ap.add_argument('slugs', nargs='*')
    a = ap.parse_args()
    import numpy as np, soundfile as sf
    from kokoro_onnx import Kokoro
    K = Kokoro(os.path.join(a.models, 'kokoro-v1.0.int8.onnx'), os.path.join(a.models, 'voices-v1.0.bin'))
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    slugs = a.slugs or sorted(f[:-5] for f in os.listdir(LESSONS) if f.endswith('.html') and '-micro' not in f)
    for slug in slugs:
        lines = dialogue(os.path.join(LESSONS, slug + '.html'))
        if not lines: continue
        k = key(lines); dst = os.path.join(OUT, slug + '.m4a')
        if man.get(slug, {}).get('hash') == k and os.path.exists(dst): continue
        t0 = time.time(); parts, starts, t, sr = [], [], 0.0, 24000
        for who, text in lines:
            audio, sr = K.create(text, voice=VOICES.get(who, 'bf_emma'), speed=1.0, lang='en-gb')
            starts.append(round(t, 2)); parts += [audio, np.zeros(int(sr * GAP), dtype=audio.dtype)]
            t += len(audio) / sr + GAP
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp: wav = tmp.name
        sf.write(wav, np.concatenate(parts), sr)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-c:a', 'aac', '-b:a', '32k',
                        '-movflags', '+faststart', dst], check=True)
        os.remove(wav)
        man[slug] = {'hash': k, 'seconds': round(t, 1), 'starts': starts, 'voices': VOICES}
        json.dump(man, open(mpath, 'w'), indent=0, sort_keys=True)   # after every lesson, so a stop loses nothing
        print(f'ok {slug}: {t:.0f}s audio in {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()

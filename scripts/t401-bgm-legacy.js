#!/usr/bin/env node
// === scripts/t401-bgm-legacy.js — T401 계측기(러너 밖) ==============================
//
// ★무엇을 재나: 배포 BGM 13곡 가운데 **11곡은 07-30 판**이고(T391 §ⓐ-4·ⓐ-6) 그 판을 구운 코드는
//   어디에도 없다. 남은 것은 07-31 스냅숏 둘(`public/assets/audio/bgm/코드백업.zip`·`코드백업_최신.zip`)뿐.
//   이 도구는 **두 팔**로 11곡을 다시 구워 배포 파일에 맞댄다(배포 파일은 읽기만 한다 · 새 소리 배포 0).
//
//   팔 ①  `0731` — zip 의 `tracks2.py`·`render2.py`·`garak.py`(파일 시각 07-30 그대로)와 07-31 라이브러리
//          (`gugak`·`compose`·`motif`·`sampler`)로 굽는다. 씨앗이 `abs(hash((scene, mood)))` 라
//          **`PYTHONHASHSEED` 를 훑는다**(`--seeds`) — 새 수가 아니라 찾는 것이다.
//          `--layers` 로 **층만 남긴** 판도 굽는다(나머지 층은 **부르되 0** — 샘플러의 공용 rr 차례와 난수 차례를
//          그대로 두려면 부르지 않으면 안 된다 · T401 실측). 층이 배포본 안에 **같은 모양으로** 들어 있으면
//          ρ(배포, 층) ≈ ρ(제 전곡, 층) 이다 — 그 비가 "어느 층이 07-30 판과 같은가" 의 자다.
//   팔 ②  `now`  — 지금 레포 파이프라인(`compose.py`·`arirang.py` → `gugak.py` + 샘플러)으로 **같은 이름**을
//          굽는다. 작곡하지 않는다 — 두 파일에 있는 악보만(없으면 "악보 없음"으로 적는다).
//
// ★판정 자(카드 T401 ①): 같은 곡 = vorbis 패킷 ≥ 99% · 같은 씨 다른 환경 = 패킷 < 99% 이고 SNR ≥ 16 dB ·
//   다른 곡 = SNR < 16 dB. ⚠카드의 "16~22" 는 07-30 **미리듣기**(mp3 80k · 바닥 20.3 dB) 자다 — 여기 자는
//   WAV ↔ 배포 ogg 라 코덱 바닥이 23~28 dB(T391 실측)로 더 높다 ⇒ 위 끝은 열어 둔다(22 를 넘어도 같은 씨다).
//
// ★대조군(자명 통과 금지): `compare` 는 먼저 **자기 대조** 넷을 찍는다 —
//   ⓐ 배포 ogg 디코드를 그대로 넣으면 SNR ∞(SNR 자가 선다) · ⓑ 그 디코드를 **다시 싸면** 패킷은 ~0%(같은 소리 ≠ 같은
//   패킷 — 패킷 자는 원본 WAV 만 통과시킨다) · ⓒ `--known <wav>=<곡>` 으로 원본을 아는 곡(T391 이 되살린 둘)을 넣으면
//   패킷 100% · ⓓ 다른 곡끼리는 SNR 0 dB 아래(자가 아무거나 안 문다). T401 실측: ⓐ ∞ · ⓑ 0.00% · ⓒ 100.00%×2 · ⓓ −3.62 dB.
//
// 실행(러너 밖 · @regress/@nightly 표 없음 — 카드 T401 의 계측기이고 하네스가 아니다):
//   node scripts/t401-bgm-legacy.js bake --arm 0731 --code <코드백업 푼 폴더> --banks <samples_* 폴더들의 부모>
//        [--python <numpy 2.3+ 파이썬>] [--seeds 0,1,2,3] [--layers full,acc,mel] [--tracks a,b] [--jobs 2] --out <폴더>
//   node scripts/t401-bgm-legacy.js bake --arm now --banks <…> [--python …] [--tracks …] --out <폴더>
//   node scripts/t401-bgm-legacy.js compare --out <폴더> [--json <경로>]
//   (뱅크는 T391 레시피대로: bk_* 12 → 12:22판 `sampler.py` 로 스캔한 조각 · numpy 2.3 이상 — 그래야 T391 의
//    두 곡이 바이트까지 같았다. 이 도구는 뱅크를 풀지 않는다 — 풀린 폴더를 받는다.)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BGM = path.join(ROOT, 'public', 'assets', 'audio', 'bgm');
const argv = process.argv.slice(2);
const CMD = argv[0];
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const list = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : null);

// ── 11곡 — `tracks2.py` 의 `SCENES × MOODS`(그 파일의 두 줄 그대로) 에서 **07-31 에 갈아 끼운 한 곡**을 뺀다.
//    `village_day_trad` 는 07-31 에 `render_score.py` 판으로 바뀌었고(T391 · 07-30 미리듣기 114.0초 ↔ 배포 108.28초),
//    그 곡과 `village_day_jeongak` 은 T391 이 바이트까지 되살렸다. 이름을 손으로 고르지 않는다 — 두 줄에서 만든다.
const SCENES = ['village_day', 'village_night', 'battle', 'journey'];
const MOODS = ['trad', 'amb', 'ari'];
const REPLACED = new Set(['village_day_trad']);
const ELEVEN = SCENES.flatMap((s) => MOODS.map((m) => `${s}_${m}`)).filter((n) => !REPLACED.has(n));

// ── 파이썬 굽는 손 둘 — 실행 때 작업 폴더에 적는다(레포엔 이 문자열뿐) ─────────────────────────
const PY_0731 = String.raw`
import os, sys, json
sys.dont_write_bytecode = True
sys.path.insert(0, os.getcwd())   # 굽는 폴더(코드·뱅크 링크)가 먼저 — 이 파일 옆이 아니라
import numpy as np
import gugak as G, sampler as S, compose as C
import motif, garak, tracks2 as T, render2 as R2
name, out, layer = sys.argv[1], sys.argv[2], sys.argv[3]
scene, mood = name.rsplit("_", 1)
roots = [r for r in R2.ROOTS if os.path.exists(os.path.join(r, "_index.json"))]
missing = [r for r in R2.ROOTS if r not in roots]
bank = S.Bank(roots)
used = S.install(bank, [C, T])
cnt = {"sigim": 0}
_sg = motif.sigim
def _count(*a, **k):
    cnt["sigim"] += 1
    return _sg(*a, **k)
motif.sigim = _count; garak.sigim = _count
class _Null:
    def add(self, *a, **k):
        pass
_null = _Null()
def mute_mix(mod, attr):          # 첫 인자(mix)만 빈 믹서로 — 안에서 부르는 악기·난수는 그대로
    orig = getattr(mod, attr)
    setattr(mod, attr, lambda mix, *a, **k: orig(_null, *a, **k))
def mute_call(mod, attr):         # 부르되 결과만 0 — 공용 rr·난수 차례를 그대로 둔다
    orig = getattr(mod, attr)
    def f(*a, **k):
        y = orig(*a, **k)
        return np.zeros_like(y)
    setattr(mod, attr, f)
ACC = {"gaya_bed": (mute_mix, T), "geo_bass": (mute_mix, T), "play_jangdan": (mute_mix, C),
       "wind": (mute_call, G), "water": (mute_call, G), "crickets": (mute_call, G),
       "jing": (mute_call, T), "kkwaenggwari": (mute_call, T)}
KEEP = {"full": None, "acc": set(ACC), "mel": {"sing"},
        "janggu": {"play_jangdan"}, "geo": {"geo_bass"}, "gaya": {"gaya_bed"},
        "amb": {"wind", "water", "crickets"}, "perc2": {"jing", "kkwaenggwari"}}[layer]
if KEEP is not None:
    if "sing" not in KEEP:
        mute_mix(T, "sing")
    for k, (how, mod) in ACC.items():
        if k not in KEEP:
            how(mod, k)
h = abs(hash((scene, mood)))
y = T.TRACKS[name]["fn"]()
G.write_wav(out, y)
print(json.dumps(dict(name=name, layer=layer, hashseed=os.environ.get("PYTHONHASHSEED"),
                      garak_seed=h % (1 << 20), rng_seed=h % (1 << 30), sigim=cnt["sigim"],
                      frames=int(y.shape[1]), roots=roots, missing=missing, source=used,
                      numpy=np.__version__), ensure_ascii=False))
`;
const PY_NOW = String.raw`
import os, sys, json
sys.dont_write_bytecode = True
sys.path.insert(0, os.getcwd())   # 굽는 폴더(코드·뱅크 링크)가 먼저 — 이 파일 옆이 아니라
import numpy as np
import gugak as G, sampler as S, compose as C, arirang as A
name, out = sys.argv[1], sys.argv[2]
SANJO = ["samples_gaya", "samples_daegeum", "samples_piri", "samples_danso", "samples_geomungo", "samples_janggu"]
roots = [r for r in SANJO if os.path.exists(os.path.join(r, "_index.json"))]
bank = S.Bank(roots)
used = S.install(bank, [C, A])
allt = {**C.TRACKS, **A.ARI_TRACKS}
if name not in allt:
    print(json.dumps(dict(name=name, score=None)))
    sys.exit(3)
spec = allt[name]
y = spec["fn"](spec)
G.write_wav(out, y)
print(json.dumps(dict(name=name, score=f"{spec['fn'].__module__}.{spec['fn'].__name__}",
                      frames=int(y.shape[1]), roots=roots, source=used, numpy=np.__version__), ensure_ascii=False))
`;

// ── 작은 도구 ───────────────────────────────────────────────────────────────
const sh = (cmd, args, opt) => execFileSync(cmd, args, { maxBuffer: 1 << 30, ...(opt || {}) });
function readWav(p) {                      // int16 · 채널 수는 머리에서 읽는다
  const b = fs.readFileSync(p);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`WAV 아님: ${p}`);
  let i = 12, ch = 0, bits = 0, rate = 0, data = null;
  while (i + 8 <= b.length) {
    const id = b.toString('ascii', i, i + 4), n = b.readUInt32LE(i + 4);
    if (id === 'fmt ') { ch = b.readUInt16LE(i + 10); rate = b.readUInt32LE(i + 12); bits = b.readUInt16LE(i + 22); }
    if (id === 'data') { data = b.subarray(i + 8, i + 8 + n); break; }
    i += 8 + n + (n & 1);
  }
  if (!data || bits !== 16 || ch !== 2 || rate !== 44100) throw new Error(`int16·2ch·44.1k 아님: ${p}`);
  return new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.length));
}
function decodeOgg(p) {
  const raw = sh('ffmpeg', ['-v', 'error', '-i', p, '-f', 's16le', '-acodec', 'pcm_s16le', '-ac', '2', '-ar', '44100', '-']);
  return new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
}
function packets(p) {
  return sh('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_packets', '-show_data_hash', 'sha256',
    '-show_entries', 'packet=size,data_hash', '-of', 'csv=p=0', p]).toString().split('\n').filter(Boolean);
}
function metrics(dep, c) {                 // dep·c: 인터리브 int16 스테레오
  const n = Math.min(dep.length, c.length);
  let ed = 0, ec = 0, ee = 0, x = 0, cm = 0, dm = 0, cc = 0;
  for (let i = 0; i < n; i += 2) {
    const d0 = dep[i], d1 = dep[i + 1], c0 = c[i], c1 = c[i + 1];
    ed += d0 * d0 + d1 * d1; ec += c0 * c0 + c1 * c1;
    ee += (d0 - c0) * (d0 - c0) + (d1 - c1) * (d1 - c1);
    const dmo = (d0 + d1) / 2, cmo = (c0 + c1) / 2;
    x += dmo * cmo; dm += dmo * dmo; cm += cmo * cmo;
  }
  for (let i = n; i < c.length; i++) cc += c[i] * c[i];
  const db = (v, m) => 10 * Math.log10(v / m + 1e-30);
  const FS = 32767 * 32767;
  return {
    snr: ee === 0 ? Infinity : db(ed, ee),
    rmsDep: db(ed / (n / 2 * 2), FS), rmsCand: db((ec + cc) / (c.length), FS),
    corr: x / Math.sqrt(dm * cm + 1e-30),
    lenDiff: (c.length - dep.length) / 2,
  };
}
function corrMono(a, b) {
  const n = Math.min(a.length, b.length);
  let x = 0, aa = 0, bb = 0;
  for (let i = 0; i < n; i += 2) { const u = (a[i] + a[i + 1]) / 2, v = (b[i] + b[i + 1]) / 2; x += u * v; aa += u * u; bb += v * v; }
  return x / Math.sqrt(aa * bb + 1e-30);
}
function winCorr(a, b, win = 44100) {        // 1초 창 상관(모노) — 층 b 가 거의 조용한 창(최대 창 에너지의 −40 dB 밑)은 뺀다
  const n = Math.min(a.length, b.length) / 2 | 0, rows = [];
  let emax = 0; const es = [];
  for (let w = 0; w + win <= n; w += win) {
    let e = 0; for (let i = w; i < w + win; i++) { const v = (b[2 * i] + b[2 * i + 1]) / 2; e += v * v; }
    es.push(e); if (e > emax) emax = e;
  }
  for (let k = 0, w = 0; w + win <= n; w += win, k++) {
    if (es[k] < emax * 1e-4) continue;
    let x = 0, aa = 0, bb = 0;
    for (let i = w; i < w + win; i++) { const u = (a[2 * i] + a[2 * i + 1]) / 2, v = (b[2 * i] + b[2 * i + 1]) / 2; x += u * v; aa += u * u; bb += v * v; }
    rows.push(x / Math.sqrt(aa * bb + 1e-30));
  }
  rows.sort((p, q) => p - q);
  const q = (f) => (rows.length ? rows[Math.min(rows.length - 1, Math.floor(f * rows.length))] : NaN);
  return { n: rows.length, p50: q(0.5), p90: q(0.9) };
}
function verdict(m, pk) {
  if (pk !== null && pk >= 0.99) return '같은 곡';
  if (m.snr >= 16) return '같은 씨 다른 환경';
  return '다른 곡';
}

// ── bake ─────────────────────────────────────────────────────────────────────
async function bake() {
  const arm = arg('--arm');
  const out = path.resolve(arg('--out', ''));
  const banks = path.resolve(arg('--banks', ''));
  const py = arg('--python', 'python3');
  const jobs = +arg('--jobs', '2');
  const tracks = list(arg('--tracks')) || ELEVEN;
  if (!['0731', 'now'].includes(arm) || !out || !fs.existsSync(banks)) {
    console.error('bake --arm 0731|now --banks <dir> --out <dir> [--code <dir>] …'); process.exit(2);
  }
  const code = arm === '0731' ? path.resolve(arg('--code', '')) : BGM;
  if (arm === '0731' && !fs.existsSync(path.join(code, 'tracks2.py'))) { console.error(`tracks2.py 없음: ${code}`); process.exit(2); }
  const seeds = arm === '0731' ? (list(arg('--seeds')) || ['0']) : [null];
  const layers = arm === '0731' ? (list(arg('--layers')) || ['full']) : ['full'];
  const work = path.join(out, '_work');
  fs.mkdirSync(path.join(out, arm), { recursive: true });
  fs.mkdirSync(work, { recursive: true });
  const drv = path.join(work, `_drv_${arm}.py`);
  fs.writeFileSync(drv, arm === '0731' ? PY_0731 : PY_NOW);
  const bankDirs = fs.readdirSync(banks).filter((d) => /^samples_/.test(d) && fs.existsSync(path.join(banks, d, '_index.json')));
  // 07-30 엔 정악 뱅크(jdae·jgaya)가 아직 없었다(07-31 12:12·13:01) — 산조 판 두 팔에는 싣지 않는다
  const SANJO_ONLY = bankDirs.filter((d) => !/^samples_(jdae|jgaya)$/.test(d));
  const todo = [];
  for (const t of tracks) for (const s of seeds) for (const L of layers) todo.push({ t, s, L });
  console.log(`[bake ${arm}] ${todo.length}판 · 뱅크 ${SANJO_ONLY.join(' ')} · 코드 ${path.relative(ROOT, code) || code} · python ${py}`);
  let k = 0;
  const runOne = ({ t, s, L }) => new Promise((resolve) => {
    const tag = arm === '0731' ? `${t}__s${s}__${L}` : t;
    const wav = path.join(out, arm, `${tag}.wav`), meta = path.join(out, arm, `${tag}.json`);
    if (fs.existsSync(wav) && fs.existsSync(meta)) { console.log(`  · ${tag} (있음 · 건너뜀)`); return resolve(); }
    const wd = fs.mkdtempSync(path.join(work, `${arm}_`));
    for (const f of fs.readdirSync(code).filter((x) => x.endsWith('.py'))) fs.symlinkSync(path.join(code, f), path.join(wd, f));
    for (const d of SANJO_ONLY) fs.symlinkSync(path.join(banks, d), path.join(wd, d));
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
    if (s !== null) env.PYTHONHASHSEED = String(s);
    const t0 = Date.now();
    const p = spawn(py, [drv, t, wav, L], { cwd: wd, env });
    let so = '', se = '';
    p.stdout.on('data', (b) => { so += b; }); p.stderr.on('data', (b) => { se += b; });
    p.on('close', (rc) => {
      const line = so.trim().split('\n').filter((x) => x.startsWith('{')).pop();
      if (rc === 0 && line) fs.writeFileSync(meta, line + '\n');
      else fs.writeFileSync(meta.replace(/\.json$/, '.err'), `rc=${rc}\n${so}\n${se}`);
      console.log(`  ${rc === 0 ? '✓' : '✗'} ${tag}  ${((Date.now() - t0) / 1000).toFixed(0)}s  (${++k}/${todo.length})`);
      resolve();
    });
  });
  const q = todo.slice();
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => { while (q.length) await runOne(q.shift()); }));
}

// ── compare ──────────────────────────────────────────────────────────────────
function compare() {
  const out = path.resolve(arg('--out', ''));
  const jsonOut = arg('--json', null);
  const cache = path.join(out, '_dep');
  fs.mkdirSync(cache, { recursive: true });
  const depOf = {}, depPk = {};
  const dep = (n) => {
    if (!depOf[n]) {
      const c = path.join(cache, `${n}.s16`);
      if (!fs.existsSync(c)) fs.writeFileSync(c, Buffer.from(decodeOgg(path.join(BGM, `${n}.ogg`)).buffer));
      const b = fs.readFileSync(c);
      depOf[n] = new Int16Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
      depPk[n] = packets(path.join(BGM, `${n}.ogg`));
    }
    return depOf[n];
  };
  const tmp = path.join(out, '_work', '_enc.ogg');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  const pkRate = (wav, n) => {
    sh('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libvorbis', '-q:a', '4', tmp]);   // 배포 인코더(T391: q4)
    const a = packets(tmp), b = depPk[n];
    let same = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] === b[i]) same++;
    return same / b.length;
  };
  const res = { selftest: [], r0731: [], now: [], layers: [] };

  // ⓪ 자기 대조 — 자가 서는지 · 아무거나 안 무는지(자명 통과 금지)
  //   ⓐ SNR 자: 배포 디코드를 그대로 넣으면 ∞ · ⓓ 다른 곡이면 0 dB 아래
  //   ⓑ 패킷 자 음성 대조: 배포를 **디코드해 다시 싸면** 패킷은 거의 안 맞는다 — 같은 소리 ≠ 같은 패킷(자가 엄하다)
  //   ⓒ 패킷 자 양성 대조(`--known <wav>=<곡>` · 여럿): 원본 WAV 를 아는 곡이면 100% 여야 한다(T391 의 두 곡)
  {
    const n0 = ELEVEN[0], n1 = ELEVEN[1];
    const selfWav = path.join(out, '_work', '_self.wav');
    sh('ffmpeg', ['-v', 'error', '-y', '-i', path.join(BGM, `${n0}.ogg`), '-c:a', 'pcm_s16le', selfWav]);
    const m = metrics(dep(n0), readWav(selfWav));
    const other = metrics(dep(n0), dep(n1));
    res.selftest.push({ what: `ⓐ ${n0} 디코드 그대로`, snr: m.snr });
    res.selftest.push({ what: `ⓑ ${n0} 디코드를 다시 싼 것(음성 대조)`, pk: pkRate(selfWav, n0) });
    for (const kv of argv.filter((x, i) => argv[i - 1] === '--known')) {
      const [w, n] = kv.split('=');
      const km = metrics(dep(n), readWav(w));
      res.selftest.push({ what: `ⓒ ${n} ← ${path.basename(w)}(양성 대조)`, snr: km.snr, pk: pkRate(w, n) });
    }
    res.selftest.push({ what: `ⓓ ${n0} ↔ ${n1}`, snr: other.snr, corr: other.corr });
  }
  const fmt = (x, d = 2) => (x === Infinity ? '∞' : Number.isFinite(x) ? x.toFixed(d) : '—');
  console.log('\n⓪ 자기 대조');
  for (const r of res.selftest) console.log(`   ${r.what}:${r.snr != null ? ` SNR ${fmt(r.snr)} dB` : ''}${r.pk != null ? ` · 패킷 ${(r.pk * 100).toFixed(2)}%` : ''}${r.corr != null ? ` · 상관 ${fmt(r.corr, 3)}` : ''}`);

  // ① 07-31 재굽기(전곡)
  const d0731 = path.join(out, '0731');
  if (fs.existsSync(d0731)) {
    console.log('\n① 07-31 코드 재굽기 — 곡 × 씨앗(PYTHONHASHSEED)');
    console.log('| 곡 | 씨 | garak 씨 | 길이 차(표본) | SNR dB | 상관 | RMS 차 dB | 패킷 | 판정 |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    for (const f of fs.readdirSync(d0731).filter((x) => /__full\.wav$/.test(x)).sort()) {
      const [n, sPart] = f.replace(/\.wav$/, '').split('__');
      const meta = JSON.parse(fs.readFileSync(path.join(d0731, f.replace(/\.wav$/, '.json')), 'utf8'));
      const c = readWav(path.join(d0731, f)), m = metrics(dep(n), c), pk = m.lenDiff === 0 ? pkRate(path.join(d0731, f), n) : null;
      const v = verdict(m, pk);
      res.r0731.push({ name: n, seed: sPart.slice(1), garak_seed: meta.garak_seed, sigim: meta.sigim, ...m, pk, verdict: v,
        missing: meta.missing, numpy: meta.numpy });
      console.log(`| ${n} | ${sPart.slice(1)} | ${meta.garak_seed} | ${m.lenDiff} | ${fmt(m.snr)} | ${fmt(m.corr, 3)} | ${fmt(m.rmsCand - m.rmsDep)} | ${pk == null ? '—' : (pk * 100).toFixed(2) + '%'} | ${v} |`);
    }
    // 층 — ρ(배포, 층) / ρ(제 전곡, 층)
    const layerFiles = fs.readdirSync(d0731).filter((x) => /\.wav$/.test(x) && !/__full\.wav$/.test(x)).sort();
    if (layerFiles.length) {
      // 전곡 상관 ρ 는 "나머지 층" 의 세기에 흔들린다(배포의 선율이 조용하면 비가 1 을 넘는다 — T401 실측).
      // 그래서 **1초 창** 상관의 위쪽 끝(p90)을 같이 본다: 그 층이 다른 층 없이 드러나는 창에서
      // 제 전곡은 1 에 붙는다(같은 판이니까) — 배포도 붙으면 그 층은 07-30 판과 **같은 파형**이다.
      console.log('\n①-층 어느 층이 07-30 판과 같은가 — 전곡 ρ(배포,층)·ρ(제 전곡,층) + 1초 창 상관 p90(배포 / 제 전곡)');
      console.log('| 곡 | 씨 | 층 | ρ 배포 | ρ 제 전곡 | 창 p90 배포 | 창 p90 제 전곡 | 창 수 |');
      console.log('|---|---|---|---|---|---|---|---|');
      for (const f of layerFiles) {
        const [n, sPart, L] = f.replace(/\.wav$/, '').split('__');
        const full = path.join(d0731, `${n}__${sPart}__full.wav`);
        if (!fs.existsSync(full)) continue;
        const st = readWav(path.join(d0731, f)), fu = readWav(full);
        const rd = corrMono(dep(n), st), rs = corrMono(fu, st);
        const wd = winCorr(dep(n), st), ws = winCorr(fu, st);
        res.layers.push({ name: n, seed: sPart.slice(1), layer: L, rhoDep: rd, rhoSelf: rs, p90Dep: wd.p90, p90Self: ws.p90, windows: wd.n });
        console.log(`| ${n} | ${sPart.slice(1)} | ${L} | ${fmt(rd, 3)} | ${fmt(rs, 3)} | ${fmt(wd.p90, 3)} | ${fmt(ws.p90, 3)} | ${wd.n} |`);
      }
    }
  }
  // ② 지금 파이프라인
  const dnow = path.join(out, 'now');
  if (fs.existsSync(dnow)) {
    console.log('\n② 지금 파이프라인(compose.py·arirang.py → gugak.py + 샘플러) — 같은 이름');
    console.log('| 곡 | 악보 | 길이 초(지금/배포) | SNR dB | 상관 | RMS 차 dB | 판정 |');
    console.log('|---|---|---|---|---|---|---|');
    for (const n of ELEVEN) {
      const w = path.join(dnow, `${n}.wav`), j = path.join(dnow, `${n}.json`);
      if (!fs.existsSync(w)) { res.now.push({ name: n, score: null }); console.log(`| ${n} | **악보 없음** | — | — | — | — | — |`); continue; }
      const meta = JSON.parse(fs.readFileSync(j, 'utf8'));
      const c = readWav(w), m = metrics(dep(n), c), v = verdict(m, null);
      res.now.push({ name: n, score: meta.score, secsNow: c.length / 2 / 44100, secsDep: dep(n).length / 2 / 44100, ...m, verdict: v });
      console.log(`| ${n} | \`${meta.score}\` | ${(c.length / 2 / 44100).toFixed(2)} / ${(dep(n).length / 2 / 44100).toFixed(2)} | ${fmt(m.snr)} | ${fmt(m.corr, 3)} | ${fmt(m.rmsCand - m.rmsDep)} | ${v} |`);
    }
  }
  if (jsonOut) { fs.writeFileSync(jsonOut, JSON.stringify(res, (k, v) => (v === Infinity ? 'inf' : v), 1)); console.log(`\n· JSON → ${jsonOut}`); }
}

(async () => {
  if (CMD === 'bake') await bake();
  else if (CMD === 'compare') compare();
  else { console.error('쓰임: t401-bgm-legacy.js bake|compare … (머리말 참조)'); process.exit(2); }
})();

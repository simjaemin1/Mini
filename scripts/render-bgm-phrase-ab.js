#!/usr/bin/env node
// === render-bgm-phrase-ab — R&D-01 블라인드 청취 WAV ===========================
//
// `DurangoBGM.renderAriPreview()`가 실제 Chromium OfflineAudioContext에서 만든
// 4마디 AudioBuffer를 표준 44.1 kHz stereo PCM16 WAVE로 내보낸다. 기본 출력은
// gitignore된 `_bgm_rnd/` 아래이고 A/B 정체는 출력물이나 기본 콘솔에 남기지 않는다.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { randomInt } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = +(process.env.PORT || 0) || (4010 + (process.pid % 120));

function usage() {
  console.log(`
사용법:
  CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
    node scripts/render-bgm-phrase-ab.js [--out <directory>] [--seed <integer>] [--swap] [--reveal]

실제 DurangoBGM OfflineAudioContext 렌더로 아리랑 첫 4마디를 44.1 kHz stereo
PCM16 WAV A/B로 만듭니다. 기본 출력은 다음처럼 gitignore된 곳입니다.
  _bgm_rnd/phrase-ab-YYYYMMDD-HHMMSS-mmm/A.wav
  _bgm_rnd/phrase-ab-YYYYMMDD-HHMMSS-mmm/B.wav

옵션:
  --out <directory>  빈 출력 폴더를 지정합니다. 기존 파일은 덮어쓰지 않습니다.
  --seed <integer>   같은 score/noise 조건을 위한 seed (기본 20260924)
  --swap              이번 실행에서 무작위로 뽑은 A/B 배치를 뒤집습니다.
  --reveal            **이번 실행의** A/B 매핑을 완료 뒤 즉시 출력합니다.
  --help, -h          이 도움말을 봅니다.

기본 실행마다 Node crypto의 난수로 A/B 배치를 새로 뽑으며, 판별 정보는 출력·파일명·
manifest에 남기지 않습니다. 따라서 블라인드 청취의 운영자는 **생성할 때** '--reveal'을
붙여 그 실행의 매핑을 별도 비공개 기록해야 합니다. 나중에 다시 실행한 '--reveal'은 새
난수를 뽑으므로 이전 A/B를 복원하지 않습니다. 청취용 레벨은 더 큰 쪽만 작은 쪽의 stereo
RMS까지 감쇠한 RMS match입니다. LUFS/지각적 loudness match를 뜻하지는 않습니다. 감쇠 전
원 기술 A/B와 trace 검증은 node scripts/e2e-bgm-phrase.js에 남아 있습니다. Chrome 경로는
CHROMIUM_PATH를 우선 쓰며, 비우면 Playwright의 Chromium 탐색 규칙을 따릅니다.
`);
}

function parseArgs(argv) {
  const opts = { seed: 20260924, out: null, swap: false, reveal: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--swap') opts.swap = true;
    else if (arg === '--reveal') opts.reveal = true;
    else if (arg === '--out' || arg === '--seed') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} 뒤에 값이 필요합니다.`);
      if (arg === '--out') opts.out = value;
      else {
        const seed = Number(value);
        if (!Number.isSafeInteger(seed)) throw new Error('--seed는 안전한 정수여야 합니다.');
        opts.seed = seed;
      }
    } else if (arg.startsWith('--out=')) {
      opts.out = arg.slice('--out='.length);
      if (!opts.out) throw new Error('--out 뒤에 폴더가 필요합니다.');
    } else if (arg.startsWith('--seed=')) {
      const seed = Number(arg.slice('--seed='.length));
      if (!Number.isSafeInteger(seed)) throw new Error('--seed는 안전한 정수여야 합니다.');
      opts.seed = seed;
    } else throw new Error(`알 수 없는 옵션: ${arg} (--help 참조)`);
  }
  return opts;
}

function stamp(d) {
  const p = (n, width) => String(n).padStart(width, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1, 2)}${p(d.getDate(), 2)}-`
    + `${p(d.getHours(), 2)}${p(d.getMinutes(), 2)}${p(d.getSeconds(), 2)}-${p(d.getMilliseconds(), 3)}`;
}

function defaultOutDir() {
  return path.join(ROOT, '_bgm_rnd', `phrase-ab-${stamp(new Date())}`);
}

function assertOutputAvailable(outDir) {
  if (!fs.existsSync(outDir)) return;
  if (!fs.statSync(outDir).isDirectory()) throw new Error(`출력 경로가 폴더가 아닙니다: ${outDir}`);
  const entries = fs.readdirSync(outDir);
  if (entries.length) throw new Error(`출력 폴더가 비어 있지 않아 덮어쓰지 않습니다: ${outDir}`);
}

function chooseBlindMapping(swap) {
  // crypto.randomInt()은 OS CSPRNG를 쓴다. mapping은 이 process 안에서만 살아 있고
  // 파일/기본 출력에는 남기지 않는다. --swap은 그 한 번의 무작위 결과만 반전한다.
  let a = randomInt(2) === 0 ? 'legacy' : 'phrase';
  if (swap) a = a === 'legacy' ? 'phrase' : 'legacy';
  const b = a === 'legacy' ? 'phrase' : 'legacy';
  return [{ label: 'A', variant: a }, { label: 'B', variant: b }];
}

function loadChromium() {
  // 기존 e2e와 같은 관례: CI면 playwright, 로컬 R&D면 임시 playwright-core도 된다.
  try { return require('playwright').chromium; }
  catch (first) {
    try { return require('playwright-core').chromium; }
    catch (second) {
      throw new Error('playwright 또는 playwright-core가 필요합니다. package.json에는 새 의존성을 추가하지 않습니다.');
    }
  }
}

function startServer() {
  return http.createServer((req, res) => {
    let rel;
    try { rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || '__bgm-rnd.html'; }
    catch (_) { res.writeHead(400); return res.end(); }
    if (rel === '__bgm-rnd.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><meta charset="utf-8"><script src="/assets/audio/bgm/bgm.js"></script>');
    }
    const file = path.resolve(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    res.writeHead(200, { 'content-type': path.extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function verifyWav(wav, label, expected) {
  const ascii = (at, text) => wav.subarray(at, at + text.length).toString('ascii') === text;
  if (wav.length < 44 || !ascii(0, 'RIFF') || !ascii(8, 'WAVE') || !ascii(12, 'fmt ') || !ascii(36, 'data')) {
    throw new Error(`${label}.wav의 RIFF/WAVE 헤더가 올바르지 않습니다.`);
  }
  const riffSize = wav.readUInt32LE(4);
  const fmtBytes = wav.readUInt32LE(16);
  const format = wav.readUInt16LE(20);
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const byteRate = wav.readUInt32LE(28);
  const blockAlign = wav.readUInt16LE(32);
  const bits = wav.readUInt16LE(34);
  const dataBytes = wav.readUInt32LE(40);
  if (riffSize !== wav.length - 8 || fmtBytes !== 16 || format !== 1 || channels !== 2
      || sampleRate !== 44100 || byteRate !== 176400 || blockAlign !== 4 || bits !== 16
      || dataBytes !== wav.length - 44 || dataBytes % blockAlign !== 0) {
    throw new Error(`${label}.wav의 PCM16/stereo/44.1kHz 형식 검증에 실패했습니다.`);
  }
  const frames = dataBytes / blockAlign;
  if (frames !== expected.frames || expected.channels !== channels || expected.sampleRate !== sampleRate) {
    throw new Error(`${label}.wav의 header와 AudioBuffer 길이가 일치하지 않습니다.`);
  }
}

function formatRevealStats(label, variant, stats) {
  return `  ${label}=${variant} · pre peak ${stats.pre.peak.toFixed(4)} · pre RMS ${stats.pre.rms.toFixed(5)} · `
    + `gain ${stats.gain.toFixed(6)} · post peak ${stats.post.peak.toFixed(4)} · `
    + `post RMS ${stats.post.rms.toFixed(5)} · clamp ${stats.post.clamped}`;
}

async function renderInBrowser(page, orderedVariants, seed) {
  return page.evaluate(async ({ orderedVariants, seed }) => {
    function ascii(view, offset, text) {
      for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
    }
    function inspectBuffer(buffer) {
      if (buffer.numberOfChannels !== 2 || buffer.sampleRate !== 44100) {
        throw new Error(`expected 44.1kHz stereo AudioBuffer, got ${buffer.sampleRate}Hz/${buffer.numberOfChannels}ch`);
      }
      const frames = buffer.length;
      const channels = buffer.numberOfChannels;
      let peak = 0, energy = 0, samples = 0, outOfRange = 0;
      for (let ch = 0; ch < channels; ch++) {
        const data = buffer.getChannelData(ch);
        for (let frame = 0; frame < frames; frame++) {
          const raw = data[frame];
          if (!Number.isFinite(raw)) throw new Error(`non-finite sample at frame ${frame}, channel ${ch}`);
          const abs = Math.abs(raw);
          if (abs > peak) peak = abs;
          if (abs > 1) outOfRange++;
          energy += raw * raw; samples++;
        }
      }
      return { duration: buffer.duration, frames, channels, sampleRate: buffer.sampleRate,
        peak, rms: Math.sqrt(energy / Math.max(1, samples)), outOfRange };
    }
    async function toPcm16Wave(buffer, gain, pre) {
      if (!Number.isFinite(gain) || gain <= 0 || gain > 1) throw new Error(`invalid attenuation gain: ${gain}`);
      const frames = pre.frames;
      const channels = pre.channels;
      const dataBytes = frames * channels * 2;
      const wave = new ArrayBuffer(44 + dataBytes);
      const view = new DataView(wave);
      ascii(view, 0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); ascii(view, 8, 'WAVE');
      ascii(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
      view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
      view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true);
      view.setUint16(34, 16, true); ascii(view, 36, 'data'); view.setUint32(40, dataBytes, true);

      let peak = 0, energy = 0, samples = 0, clamped = 0;
      for (let frame = 0, at = 44; frame < frames; frame++) {
        for (let ch = 0; ch < channels; ch++, at += 2) {
          const raw = buffer.getChannelData(ch)[frame];
          if (!Number.isFinite(raw)) throw new Error(`non-finite sample at frame ${frame}, channel ${ch}`);
          const scaled = raw * gain;
          const sample = Math.max(-1, Math.min(1, scaled));
          if (sample !== scaled) clamped++;
          const pcm = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
          view.setInt16(at, pcm, true);
          // WAVE에 실제로 들어간 PCM 표본으로 post RMS를 재서 matching을 증명한다.
          const decoded = pcm < 0 ? pcm / 0x8000 : pcm / 0x7fff;
          const abs = Math.abs(decoded);
          if (abs > peak) peak = abs;
          energy += decoded * decoded; samples++;
        }
      }
      const bytes = new Uint8Array(wave);
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('WAV base64 변환 실패'));
        reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
        reader.readAsDataURL(new Blob([bytes], { type: 'audio/wav' }));
      });
      return {
        wav: base64,
        stats: { pre, gain, post: { duration: buffer.duration, frames, channels, sampleRate: buffer.sampleRate,
          peak, rms: Math.sqrt(energy / Math.max(1, samples)), clamped } }
      };
    }
    // 반드시 둘을 모두 원 상태로 렌더한 뒤 같은 lower-RMS target으로 맞춘다.
    // quiet 쪽을 올리지 않아 clipping을 부르지 않고, louder 쪽만 attenuate한다.
    const buffers = [];
    for (const variant of orderedVariants) {
      buffers.push(await DurangoBGM.renderAriPreview({ variant, bars: 4, seed, sampleRate: 44100, volume: 0.9 }));
    }
    const raw = buffers.map(inspectBuffer);
    if (raw.some((stats) => stats.outOfRange !== 0)) {
      throw new Error('raw render contains out-of-range samples; refusing to hide clipping with matching');
    }
    const targetRms = Math.min(...raw.map((stats) => stats.rms));
    if (!Number.isFinite(targetRms) || targetRms <= 0) throw new Error('cannot RMS-match silent render');
    const rendered = [];
    for (let i = 0; i < buffers.length; i++) {
      const gain = Math.min(1, targetRms / raw[i].rms);
      rendered.push(await toPcm16Wave(buffers[i], gain, raw[i]));
    }
    return rendered;
  }, { orderedVariants, seed });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();
  const outDir = path.resolve(opts.out || defaultOutDir());
  assertOutputAvailable(outDir);
  const mapping = chooseBlindMapping(opts.swap);
  const chromium = loadChromium();
  const server = startServer();
  let browser;
  try {
    await listen(server);
    browser = await chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required']
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
    await page.goto(`http://127.0.0.1:${PORT}/__bgm-rnd.html`, { waitUntil: 'load', timeout: 30000 });
    const renders = await renderInBrowser(page, mapping.map((x) => x.variant), opts.seed);
    if (errors.length) throw new Error(`browser page error: ${errors.join(' | ')}`);
    if (!Array.isArray(renders) || renders.length !== 2) throw new Error('A/B renderer가 두 AudioBuffer를 돌려주지 않았습니다.');

    const files = renders.map((render, i) => {
      const label = mapping[i].label;
      const wav = Buffer.from(render.wav, 'base64');
      verifyWav(wav, label, render.stats.post);
      if (render.stats.pre.outOfRange !== 0 || render.stats.post.clamped !== 0) {
        throw new Error(`${label}.wav의 PCM 범위 검증에 실패했습니다.`);
      }
      return { label, wav, stats: render.stats };
    });
    const duration = files[0].stats.post.duration;
    if (files.some((file) => Math.abs(file.stats.post.duration - duration) > 1 / 44100)) {
      throw new Error('A/B의 rendered duration이 일치하지 않습니다.');
    }
    // PCM16 양자화 뒤에도 RMS 차이는 한 LSB보다 훨씬 작아야 한다.
    const matchedRmsDelta = Math.abs(files[0].stats.post.rms - files[1].stats.post.rms);
    if (matchedRmsDelta > 2e-5) throw new Error(`PCM16 stereo RMS match 실패 (Δ ${matchedRmsDelta})`);
    fs.mkdirSync(outDir, { recursive: true });
    for (const file of files) fs.writeFileSync(path.join(outDir, `${file.label}.wav`), file.wav, { flag: 'wx' });

    console.log('\n=== BGM phrase A/B WAV (blind) ===');
    console.log(`output  ${outDir}`);
    console.log(`files   A.wav · B.wav · ${duration.toFixed(3)} s · 44.1 kHz stereo PCM16`);
    console.log('level   attenuation-only stereo RMS match 완료 (LUFS/지각적 loudness match 아님)');
    console.log('검증  RIFF/WAVE · PCM16 · stereo · 44100 Hz · finite sample · clamp 0');
    console.log('raw 기술 A/B·trace는 node scripts/e2e-bgm-phrase.js에서 확인할 수 있습니다.');
    console.log('매핑은 memory-only로 숨겼습니다. 블라인드 운영자는 생성 시 --reveal 출력을 비공개로 기록해야 합니다.');
    if (opts.reveal) {
      console.log(`reveal (this run only)  ${mapping.map((x) => `${x.label}=${x.variant}`).join(' · ')}`);
      for (const file of files) {
        console.log(formatRevealStats(file.label, mapping.find((x) => x.label === file.label).variant, file.stats));
      }
    }
  } finally {
    await browser?.close().catch(() => {});
    await closeServer(server).catch(() => {});
  }
}

main().catch((err) => {
  console.error(`render-bgm-phrase-ab: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
});

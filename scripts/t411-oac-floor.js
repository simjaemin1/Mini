#!/usr/bin/env node
// === scripts/t411-oac-floor.js — 이 상자의 OfflineAudioContext **떨림 바닥**을 잰다 [T411 2026-09-26 · 세션8] ===
//
// 러너 밖(표 없음 · `@regress` 아님). `e2e-bgm-phrase` ⑦⑧ 의 자를 **어디서 유도했나**를 다시 재는 계측기다.
//
//   ① 왜 떨리나 — 한 자리에 모이는 항의 수만 바꾼 최소 그래프를 6번씩 굽는다(쌍 15).
//      노드 입력(GainNode 한 개에 발진기 k개) · AudioParam 입력(반송파 주파수에 변조 k개).
//   ② 바닥 — `DurangoBGM.renderAriPreview` 4마디를 판마다 N번(legacy · phrase · 반주 legacy · 반주 phrase)
//      굽고 같은 판 쌍의 차(RMS · Δmax), 반주 교차 쌍(legacy×phrase), 미끼(다른 씨 · 다른 판 · 대금 켬)를 적는다.
//   ③ 자 셋의 판정 — 같은 분포로 **옛 자**(GPT `Δmax ≤ 1.5e-6 · RMS ≤ 1e-7`) · **반주 자기 바닥**(반주 두 번) ·
//      **⑦ 의 바닥**(두 판의 같은 판 두 번 중 큰 쪽)을 문턱으로 쓰면 반주 교차 쌍이 몇 %나 넘는가.
//
// 실행: node scripts/t411-oac-floor.js [--n 16] [--json <경로>]      (CHROMIUM_PATH 로 다른 브라우저)
// 쓰는 것: `public/assets/audio/bgm/bgm.js` 하나(읽기만) · 네트워크 0(127.0.0.1 정적 서버) · 파일 쓰기 0(--json 말고)
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (first) {
  try { ({ chromium } = require('playwright-core')); }
  catch (second) { throw new Error('playwright 또는 playwright-core 가 필요하다'); }
}

const ROOT = path.resolve(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const N = Math.max(3, +arg('--n', 16) | 0);
const JSON_OUT = arg('--json', null);
// ★옛 자 — GPT 가 `e2e-bgm-phrase` ⑦⑧ 에 적었던 허용치(그 상자 관측 1.01e-6 · 4e-8 위의 여유). 대조로만 쓴다.
const OLD = { maxDelta: 1.5e-6, rmsDelta: 1e-7 };

const srv = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || '__floor.html';
  if (rel === '__floor.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end('<!doctype html><meta charset="utf-8"><script src="/assets/audio/bgm/bgm.js"></script>');
  }
  const file = path.join(ROOT, 'public', rel);
  if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { 'content-type': 'text/javascript' }); fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--mute-audio'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/__floor.html`, { waitUntil: 'load' });
  const version = browser.version();

  // ── ① 왜 떨리나 ─────────────────────────────────────────────────────────────
  const fanin = await page.evaluate(async () => {
    const SR = 44100, LEN = SR * 2, REP = 6;
    const FREQS = [220, 331.7, 447.3, 563.9, 681.1];
    async function once(k, where) {
      const ctx = new OfflineAudioContext(1, LEN, SR);
      if (where === 'node') {
        const sum = ctx.createGain();
        for (let i = 0; i < k; i++) { const o = ctx.createOscillator(); o.frequency.value = FREQS[i]; o.connect(sum); o.start(0); }
        sum.connect(ctx.destination);
      } else {
        const car = ctx.createOscillator(); car.frequency.value = 440;
        for (let i = 0; i < k; i++) {
          const o = ctx.createOscillator(); o.frequency.value = FREQS[i] / 50;
          const g = ctx.createGain(); g.gain.value = 3; o.connect(g); g.connect(car.frequency); o.start(0);
        }
        car.connect(ctx.destination); car.start(0);
      }
      return (await ctx.startRendering()).getChannelData(0).slice();
    }
    const rows = [];
    for (const where of ['node', 'param']) for (const k of [1, 2, 3, 5]) {
      const b = []; for (let i = 0; i < REP; i++) b.push(await once(k, where));
      let differ = 0, pairs = 0, maxDelta = 0;
      for (let i = 0; i < REP; i++) for (let j = i + 1; j < REP; j++) {
        let d = 0; for (let t = 0; t < LEN; t++) { const x = Math.abs(b[i][t] - b[j][t]); if (x > d) d = x; }
        pairs++; if (d > 0) differ++; if (d > maxDelta) maxDelta = d;
      }
      rows.push({ where, k, terms: where === 'param' ? k + 1 : k, differ, pairs, maxDelta });
    }
    return rows;
  });

  // ── ② 바닥 ──────────────────────────────────────────────────────────────────
  const floor = await page.evaluate(async (N) => {
    const R = (variant, extra) => DurangoBGM.renderAriPreview(Object.assign({ variant, bars: 4, seed: 20260924, sampleRate: 44100, volume: .9 }, extra || {}));
    const rms = (a) => { let e = 0, n = 0; for (let ch = 0; ch < a.numberOfChannels; ch++) { const x = a.getChannelData(ch); for (let i = 0; i < x.length; i++) { e += x[i] * x[i]; n++; } } return Math.sqrt(e / n); };
    const cmp = (a, b) => {
      let mx = 0, e = 0, n = 0;
      for (let ch = 0; ch < a.numberOfChannels; ch++) {
        const x = a.getChannelData(ch), y = b.getChannelData(ch);
        for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); if (d > mx) mx = d; e += d * d; n++; }
      }
      return { maxDelta: mx, rmsDelta: Math.sqrt(e / n) };
    };
    const BUILDS = { legacy: ['legacy'], phrase: ['phrase'], accLegacy: ['legacy', { lead: false }], accPhrase: ['phrase', { lead: false }] };
    const bufs = {}; const t0 = performance.now();
    for (const [k, a] of Object.entries(BUILDS)) { bufs[k] = []; for (let i = 0; i < N; i++) bufs[k].push(await R(...a)); }
    const msPerRender = (performance.now() - t0) / (4 * N);
    const signal = {}; for (const k of Object.keys(bufs)) signal[k] = rms(bufs[k][0]);
    const within = {};
    for (const k of Object.keys(bufs)) { within[k] = []; for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) within[k].push(cmp(bufs[k][i], bufs[k][j])); }
    const cross = []; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) cross.push(cmp(bufs.accLegacy[i], bufs.accPhrase[j]));
    // 무리 — Δmax 가 **가장 작은 같은 판 쌍의 열 배**보다 작으면 한 무리로 잇는다(설명용 · 판정 아님)
    const groups = (arr, ws) => {
      const base = Math.min(...ws.map((w) => w.maxDelta)) * 10;
      const par = [...Array(arr.length).keys()]; const f = (x) => (par[x] === x ? x : (par[x] = f(par[x])));
      let p = 0; for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) { if (ws[p++].maxDelta < base) par[f(i)] = f(j); }
      const c = {}; for (let i = 0; i < arr.length; i++) c[f(i)] = (c[f(i)] || 0) + 1;
      return Object.values(c).sort((a, b) => b - a);
    };
    const classes = {}; for (const k of Object.keys(bufs)) classes[k] = groups(bufs[k], within[k]);
    const bait = {
      '다른 씨(legacy)': cmp(bufs.legacy[0], await R('legacy', { seed: 20260925 })),
      '다른 판(legacy↔phrase)': cmp(bufs.legacy[0], bufs.phrase[0]),
      '반주 다른 씨': cmp(bufs.accLegacy[0], await R('legacy', { lead: false, seed: 20260925 })),
      '대금 켬(반주 phrase↔phrase)': cmp(bufs.accPhrase[0], bufs.phrase[0]),
    };
    return { msPerRender, signal, within, cross, classes, bait };
  }, N);

  // ── ③ 자 셋의 판정 ────────────────────────────────────────────────────────────
  const W = floor.within, C = floor.cross;
  const oldRed = (x) => !(x.maxDelta <= OLD.maxDelta && x.rmsDelta <= OLD.rmsDelta);
  const judge = {
    '옛 자 — 같은 판 쌍이 빨강': Object.fromEntries(Object.entries(W).map(([k, v]) => [k, `${v.filter(oldRed).length}/${v.length}`])),
    '옛 자 — 반주 교차 쌍이 빨강': `${C.filter(oldRed).length}/${C.length}`,
  };
  // 반주 자기 바닥: 반주 같은 판 쌍 하나를 문턱으로 교차 쌍 하나를 잰다(모든 조합의 평균)
  {
    const th = [...W.accLegacy, ...W.accPhrase].map((x) => x.rmsDelta);
    let over = 0; for (const t of th) for (const c of C) if (c.rmsDelta > t) over++;
    judge['반주 자기 바닥 — 교차 쌍이 넘는 비율'] = `${(100 * over / (th.length * C.length)).toFixed(1)}%`;
  }
  // ⑦ 의 바닥: legacy 쌍 하나 × phrase 쌍 하나의 큰 쪽을 문턱으로(모든 조합)
  {
    let over = 0, n = 0, minTh = Infinity;
    for (const a of W.legacy) for (const b of W.phrase) {
      const t = Math.max(a.rmsDelta, b.rmsDelta); if (t < minTh) minTh = t;
      for (const c of C) { n++; if (c.rmsDelta > t) over++; }
    }
    const worstCross = Math.max(...C.map((c) => c.rmsDelta));
    judge['⑦ 의 바닥 — 교차 쌍이 넘는 비율'] = `${(100 * over / n).toFixed(3)}% (${over}/${n})`;
    judge['⑦ 의 바닥 — 가장 낮은 문턱 ↔ 가장 큰 교차'] = `${minTh.toExponential(2)} ↔ ${worstCross.toExponential(2)} (${(20 * Math.log10(minTh / worstCross)).toFixed(1)} dB)`;
    const minBait = Math.min(...Object.values(floor.bait).map((b) => b.rmsDelta));
    const maxTh = Math.max(...W.legacy.map((x) => x.rmsDelta), ...W.phrase.map((x) => x.rmsDelta));
    judge['⑦ 의 바닥 — 가장 높은 문턱 ↔ 가장 작은 미끼'] = `${maxTh.toExponential(2)} ↔ ${minBait.toExponential(2)} (${(20 * Math.log10(minBait / maxTh)).toFixed(1)} dB)`;
  }

  // ── 찍기 ─────────────────────────────────────────────────────────────────────
  const q = (arr, f) => { const v = arr.map(f).sort((a, b) => a - b); return [v[0], v[v.length >> 1], v[v.length - 1]]; };
  const e2 = (v) => v.toExponential(2);
  console.log(`=== t411-oac-floor — ${version} · 판마다 ${N}번 · ${floor.msPerRender.toFixed(0)} ms/판 ===\n`);
  console.log('① 한 자리에 모이는 항 수 → 같은 그래프 6번의 쌍 15 중 다른 쌍');
  console.log('| 자리 | 입력 | 더하는 항 | 다른 쌍 | Δmax |\n|---|---|---|---|---|');
  for (const r of fanin) console.log(`| ${r.where === 'node' ? '노드 입력' : 'AudioParam'} | ${r.k} | ${r.terms} | ${r.differ}/${r.pairs} | ${r.maxDelta ? e2(r.maxDelta) : '0'} |`);
  console.log('\n② 같은 판 쌍 · 반주 교차 쌍 (최소 ~ 중앙 ~ 최대)');
  console.log('| 무엇 | 쌍 | RMS 차 | 신호 대비 dB | Δmax | 무리 |\n|---|---|---|---|---|---|');
  const row = (name, arr, sig, cls) => {
    const r = q(arr, (x) => x.rmsDelta), m = q(arr, (x) => x.maxDelta);
    const d = r.map((v) => (20 * Math.log10(v / sig)).toFixed(1));
    console.log(`| ${name} | ${arr.length} | ${r.map(e2).join(' ~ ')} | ${d.join(' ~ ')} | ${m.map(e2).join(' ~ ')} | ${cls ? cls.join('/') : '—'} |`);
  };
  for (const k of Object.keys(W)) row(`같은 판 ${k}`, W[k], floor.signal[k], floor.classes[k]);
  row('반주 교차 legacy×phrase', C, floor.signal.accLegacy, null);
  console.log('\n미끼');
  for (const [k, v] of Object.entries(floor.bait)) console.log(`  ${k.padEnd(22)} RMS ${e2(v.rmsDelta)} · Δmax ${e2(v.maxDelta)}`);
  console.log('\n③ 자 셋');
  for (const [k, v] of Object.entries(judge)) console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ version, N, fanin, floor, judge }, null, 0));
    console.log(`\n  · JSON → ${JSON_OUT}`);
  }
  await browser.close();
  srv.close();
})().catch((e) => { console.error(e); process.exit(1); });

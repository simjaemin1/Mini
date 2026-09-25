#!/usr/bin/env node
// === scripts/t386-bgm-hash.js — T386 계측기(러너 밖) ==============================
//
// ★무엇을 재나: GPT BGM R&D 착지(`462b4acc`)가 `bgm.js` 의 **기본(legacy) 경로**를 움직였나.
//   착지 전(`450c6e44`)과 착지 후의 `bgm.js` 를 같은 Chromium 에 올려 **두 자**로 맞댄다.
//
// ★★자 ① — **Web Audio 명령 기록(trace)**. 엔진이 브라우저에 내리는 명령을 전부 적는다:
//   노드 만들기 · 속성 쓰기(`type`·`buffer`·`curve`…) · AudioParam 값/자동화 · connect · start/stop.
//   수는 `String(x)`(배정밀도 왕복 정확)로 적고, 노드는 만든 차례 번호로 부른다.
//   두 판의 기록이 같으면 **어떤 결정적 엔진에서도 소리가 같다** — 엔진에 기대지 않는 증명이다.
//   ⚠착지 후엔 Program 마다 **무음 버스 하나**(`wetOut`)가 더 생긴다(입력 0 · `state.wet` 로만 나간다).
//     그래서 기록을 둘로 낸다: 날것(그대로) · 걸러 낸 것(입력이 하나도 없는 GainNode 와 그 명령을 빼고
//     번호를 다시 매긴 것). "무음 버스 하나 말고 다른 명령 차이 0" 이 이 자가 말하려는 문장이다.
//
// ★★자 ② — **표본**. OfflineAudioContext 렌더의 표본 차이를 **잡음 바닥**에 댄다.
//   ⚠이 상자의 Chromium 은 이 그래프를 **비트 재현하지 않는다**(T386 실측: 같은 판·같은 씨를 두 번
//     구워도 12/12 가 다르고 Δmax ~1e-5 · 압축기·리미터·잔향을 빼도 남는다 · 노드 한 종씩은 결정적이다).
//     GPT 자기 e2e-bgm-phrase ⑦⑧ 도 이 상자에서 같은 까닭으로 빨강이다. ⇒ "바이트 동일" 은 못 잰다.
//     대신 **전/후 차이의 분포가 같은 판 두 번 차이의 분포와 같은 띠에 있나**를 **적기만** 한다.
//   ★★자 ② 는 **판정 자가 아니다**(1차 판이 그렇게 썼다가 틀렸다 — T386 실측): "전후 Δmax ≤ 바닥 Δmax 의
//     최댓값" 을 판정으로 두자 12 중 1(battle·ari · Δmax 2.9e-4)이 넘었는데, 그 조합의 **명령 기록은 전후가
//     같았다**. 바닥 자체가 조합마다 Δmax 1.5e-5~1.8e-4 로 열 배 흔들리는 꼬리 긴 분포라, 한 번 재서 최댓값에
//     대면 **우연히 넘는다**. 판정은 정확한 자(①)가 하고, ② 는 띠(중앙값·범위)만 적는다.
//
// ★씨를 둘 준다 — 엔진 씨(`seed`)와 **`Math.random` 씨**. legacy 는 숨소리 `noiseSrc` 와 `pad` LFO 에서
//   `Math.random()` 을 부른다. 호출 수도 센다(전/후 소비 수가 같아야 한다).
//
// ★대조군(자명 통과 금지):
//   ⓐ 같은 판 두 번 → 기록 해시 **같아야** 한다(명령은 결정적이다 — 안 같으면 이 자가 없다)
//   ⓑ `Math.random` 씨만 바꾸면 → 기록이 **달라야** 한다(씨가 명령에 닿는다)
//   ⓒ `performancePhrases` 를 켜면(village_day·ari) → 기록도 표본도 **달라야** 한다(새 길을 밟을 수 있다)
//
// 실행: node scripts/t386-bgm-hash.js [--secs 40] [--json <경로>] [--before <rev>] [--after <rev>]
//   러너 밖이다(@regress/@nightly 표 없음) — 카드 T386 의 계측기이고 **하네스가 아니다**.
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const REL = 'public/assets/audio/bgm/bgm.js';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BEFORE = arg('--before', '450c6e44');
const AFTER = arg('--after', '462b4acc');
const SECS = +arg('--secs', '40');
const JSON_OUT = arg('--json', null);
const SR = 44100;
const ENGINE_SEED = 1234;           // `create()` 의 기본 씨 그대로(새 수 아님)
const RAND_SEED = 20260925;         // `Math.random` 갈음 씨 — 값 자체는 뜻이 없다(대조군 ⓑ 가 그걸 잰다)
const SCENES = ['village_day', 'village_night', 'battle', 'journey'];   // bgm.js 머리말의 넷
const MOODS = ['trad', 'amb', 'ari'];                                  // bgm.js 머리말의 셋

const gitShow = (rev) => execFileSync('git', ['show', `${rev}:${REL}`], { cwd: ROOT, maxBuffer: 1 << 26 }).toString('utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SRC = { before: gitShow(BEFORE), after: gitShow(AFTER) };
const WORK = fs.readFileSync(path.join(ROOT, REL), 'utf8');

// 페이지 머리 — 씨 있는 Math.random(호출 수) + Web Audio 명령 기록기. bgm.js 보다 **먼저** 선다.
const PAGE = `<!doctype html><meta charset="utf-8"><script>
(function(){
  let a = 0, n = 0;
  function next(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  window.__seedRandom = function(s){ a = s | 0; n = 0; Math.random = function(){ n++; return next(); }; };
  window.__randCount = function(){ return n; };

  const LOG = []; let ON = false;
  const ids = new WeakMap(); let nid = 0;
  const pid = new WeakMap();                         // AudioParam → "노드#이름"
  const idOf = (x) => { if (x instanceof AudioParam) return pid.get(x) || '?param'; if (!ids.has(x)) ids.set(x, 'n' + (nid++)); return ids.get(x); };
  const fmt = (v) => (typeof v === 'number') ? String(v)
    : (v instanceof AudioNode || v instanceof AudioParam) ? idOf(v)
    : (v instanceof AudioBuffer) ? 'buf(' + v.numberOfChannels + 'x' + v.length + '@' + v.sampleRate + ')'
    : (v instanceof Float32Array) ? 'f32[' + v.length + ']' : JSON.stringify(v);
  window.__trace = { start(){ LOG.length = 0; nid = 0; ON = true; }, stop(){ ON = false; return LOG.slice(); } };
  const rec = (s) => { if (ON) LOG.push(s); };

  const BAC = BaseAudioContext.prototype;
  for (const k of Object.getOwnPropertyNames(BAC)) {
    if (!/^create/.test(k) || typeof BAC[k] !== 'function') continue;
    const f = BAC[k];
    BAC[k] = function(){
      const node = f.apply(this, arguments);
      if (node instanceof AudioNode) {
        const me = idOf(node);
        rec(me + '=' + k + '(' + Array.from(arguments).map(fmt).join(',') + ')');
        for (const pk of Object.keys(Object.getPrototypeOf(node)).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(node)))) {
          let v; try { v = node[pk]; } catch (e) { continue; }
          if (v instanceof AudioParam) pid.set(v, me + '.' + pk);
        }
      }
      return node;
    };
  }
  const wrap = (proto, name, tag) => { const f = proto[name]; if (typeof f !== 'function') return;
    proto[name] = function(){ rec(idOf(this) + '.' + (tag || name) + '(' + Array.from(arguments).map(fmt).join(',') + ')'); return f.apply(this, arguments); }; };
  ['connect', 'disconnect'].forEach((m) => wrap(AudioNode.prototype, m));
  ['start', 'stop'].forEach((m) => wrap(AudioScheduledSourceNode.prototype, m));
  ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime',
   'setValueCurveAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime'].forEach((m) => wrap(AudioParam.prototype, m));
  const setters = (proto, props) => props.forEach((p) => {
    const d = Object.getOwnPropertyDescriptor(proto, p); if (!d || !d.set) return;
    Object.defineProperty(proto, p, Object.assign({}, d, { set(v){ rec(idOf(this) + '.' + p + '=' + fmt(v)); return d.set.call(this, v); } }));
  });
  setters(AudioParam.prototype, ['value']);
  setters(OscillatorNode.prototype, ['type']);
  setters(BiquadFilterNode.prototype, ['type']);
  setters(AudioBufferSourceNode.prototype, ['buffer', 'loop', 'loopStart', 'loopEnd']);
  setters(ConvolverNode.prototype, ['buffer', 'normalize']);
  setters(WaveShaperNode.prototype, ['curve', 'oversample']);
  setters(OscillatorNode.prototype.__proto__, []);
})();
</script>`;

function serve() {
  return http.createServer((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/' || u === '/p.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE); }
    const m = /^\/(before|after)\.js$/.exec(u);
    // 판마다 `DurangoBGM` 을 제 이름으로 붙든다 — 한 페이지에 두 판을 싣고 **같은 자리에서** 굽기 위해서다
    //   (표본을 Node 로 옮기면 3.5M 개 수를 JSON 으로 나르느라 한 조합에 2분이 걸렸다 — 1차 판 실측).
    if (m) { res.writeHead(200, { 'content-type': 'text/javascript' });
             return res.end(SRC[m[1]] + `\n;window.__BGM_${m[1]} = window.DurangoBGM; window.DurangoBGM = undefined;\n`); }
    res.writeHead(404); res.end();
  });
}

// 기록에서 **입력이 하나도 없는 GainNode**(무음 버스)와 그 명령을 빼고 번호를 다시 매긴다.
function filterSilent(log) {
  const made = new Map(), inputs = new Map();
  for (const s of log) {
    let m = /^(n\d+)=createGain\(/.exec(s); if (m) made.set(m[1], true);
    m = /^(n\d+)\.connect\((n\d+)/.exec(s); if (m) inputs.set(m[2], (inputs.get(m[2]) || 0) + 1);
  }
  const silent = new Set([...made.keys()].filter((k) => !inputs.get(k)));
  const keep = log.filter((s) => { const m = /^(n\d+)/.exec(s); return !(m && silent.has(m[1])); });
  const ren = new Map(); let k = 0;
  const out = keep.map((s) => s.replace(/\bn(\d+)\b/g, (w) => { if (!ren.has(w)) ren.set(w, 'm' + (k++)); return ren.get(w); }));
  return { out, silent: silent.size };
}

// 한 조합 — 전 판 한 번 · 후 판 두 번(잡음 바닥) · 필요하면 대조군 한 번. 기록은 페이지 안에서 해시하고
//   무음 버스를 걸러 다시 해시한다. 표본 대조도 페이지 안에서 한다(나르는 것은 수 몇 개뿐).
async function runCombo(page, c, extra) {
  return page.evaluate(async (args) => {
    const enc = new TextEncoder();
    const hex = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s))))
      .map((x) => x.toString(16).padStart(2, '0')).join('');
    function filterSilent(log) {
      const made = new Set(), inputs = new Map();
      for (const s of log) {
        let m = /^(n\d+)=createGain\(/.exec(s); if (m) made.add(m[1]);
        m = /^(n\d+)\.connect\((n\d+)/.exec(s); if (m) inputs.set(m[2], (inputs.get(m[2]) || 0) + 1);
      }
      const silent = new Set([...made].filter((k) => !inputs.get(k)));
      const keep = log.filter((s) => { const m = /^(n\d+)/.exec(s); return !(m && silent.has(m[1])); });
      const ren = new Map(); let k = 0;
      return { out: keep.map((s) => s.replace(/\bn(\d+)\b/g, (w) => { if (!ren.has(w)) ren.set(w, 'm' + (k++)); return ren.get(w); })),
               silent: silent.size };
    }
    async function one(which, j) {
      const B = window['__BGM_' + which];
      window.__seedRandom(j.rand);
      window.__trace.start();
      const o = { scene: j.scene, mood: j.mood, seconds: args.secs, seed: args.seed, sampleRate: args.sr };
      if (j.phrase) o.performancePhrases = { villageDayAriDaegeum: true };
      const b = await B.renderOffline(o);
      const log = window.__trace.stop();
      const f = filterSilent(log);
      const L = b.getChannelData(0), R = b.getChannelData(1);
      let e = 0; for (const ch of [L, R]) for (let i = 0; i < ch.length; i++) e += ch[i] * ch[i];
      return { raw: await hex(log.join('\n')), filt: await hex(f.out.join('\n')), silent: f.silent, cmd: log.length,
               calls: window.__randCount(), pcm: [L.slice(), R.slice()], rms: Math.sqrt(e / (2 * b.length)),
               firstDiff: null, flog: f.out };
    }
    function pcmDiff(x, y) {
      let mx = 0, e = 0, s = 0, n = 0;
      for (let ch = 0; ch < 2; ch++) for (let i = 0; i < x.pcm[ch].length; i++) {
        const d = x.pcm[ch][i] - y.pcm[ch][i]; const ad = d < 0 ? -d : d; if (ad > mx) mx = ad;
        e += d * d; s += x.pcm[ch][i] * x.pcm[ch][i]; n++;
      }
      return { max: mx, db: 10 * Math.log10((e / n) / (s / n) + 1e-30) };
    }
    const c = args.c;
    const b = await one('before', c), a1 = await one('after', c), a2 = await one('after', c);
    const row = { scene: c.scene, mood: c.mood, traceSame: b.filt === a1.filt, traceRawSame: b.raw === a1.raw,
      traceFloor: a1.raw === a2.raw, cmdBefore: b.cmd, cmdAfter: a1.cmd, silentBefore: b.silent, silentAfter: a1.silent,
      callsBefore: b.calls, callsAfter: a1.calls, traceHash: a1.filt.slice(0, 16),
      rmsDb: 20 * Math.log10(a1.rms + 1e-12) };
    const fl = pcmDiff(a1, a2), cr = pcmDiff(b, a1);
    Object.assign(row, { floorMax: fl.max, floorDb: fl.db, crossMax: cr.max, crossDb: cr.db });
    if (!row.traceSame) { const i = b.flog.findIndex((s, j) => s !== a1.flog[j]); row.firstDiff = { at: i, before: b.flog[i], after: a1.flog[i] }; }
    // 대조군
    let ctl = null;
    if (args.extra === 'reseed') { const r = await one('after', Object.assign({}, c, { rand: c.rand + 1 })); ctl = { kind: 'reseed', traceDiffers: r.raw !== a1.raw }; }
    if (args.extra === 'phrase') { const p = await one('after', Object.assign({}, c, { phrase: true }));
      const d = pcmDiff(a1, p); ctl = { kind: 'phrase', traceDiffers: p.filt !== a1.filt, pcmDb: d.db, pcmMax: d.max, cmd: p.cmd,
        rmsDbPhrase: 20 * Math.log10(p.rms + 1e-12), rmsDbLegacy: 20 * Math.log10(a1.rms + 1e-12) }; }
    return { row, ctl };
  }, { c, extra, secs: SECS, seed: ENGINE_SEED, sr: SR });
}

(async () => {
  console.log(`=== T386 계측 — bgm.js legacy 경로 · ${BEFORE} ↔ ${AFTER} · ${SECS}s × ${SR}Hz ===`);
  console.log(`  소스 sha256  전 ${sha(SRC.before).slice(0, 12)} · 후 ${sha(SRC.after).slice(0, 12)} · 작업트리 ${sha(WORK).slice(0, 12)}` +
              `  (작업트리 = 후 : ${sha(WORK) === sha(SRC.after)})`);
  const srv = serve();
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--mute-audio'] });
  const page = await browser.newPage();
  page.__base = `http://127.0.0.1:${srv.address().port}`;
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  const t0 = Date.now();

  await page.goto(page.__base + '/p.html', { waitUntil: 'load' });
  await page.addScriptTag({ url: page.__base + '/before.js' });
  await page.addScriptTag({ url: page.__base + '/after.js' });
  const ready = await page.evaluate(() => [typeof window.__BGM_before, typeof window.__BGM_after]);
  if (ready.join() !== 'object,object') throw new Error('두 판을 못 실었다: ' + ready.join());

  const combos = [];
  for (const s of SCENES) for (const m of MOODS) combos.push({ scene: s, mood: m, rand: RAND_SEED });
  const rows = [];
  let controlB = null, controlC = null;
  for (const c of combos) {
    const k = `${c.scene}_${c.mood}`;
    const extra = k === 'village_day_trad' ? 'reseed' : k === 'village_day_ari' ? 'phrase' : null;
    const { row, ctl } = await runCombo(page, c, extra);
    rows.push(row);
    if (ctl && ctl.kind === 'reseed') controlB = { differs: ctl.traceDiffers };
    if (ctl && ctl.kind === 'phrase') controlC = ctl;
    const f = (x) => x.toExponential(1);
    console.log(`  ${c.scene.padEnd(13)} ${c.mood.padEnd(5)} 명령 ${String(row.cmdBefore).padStart(6)}→${String(row.cmdAfter).padEnd(6)}` +
      ` 무음버스 ${row.silentBefore}→${row.silentAfter}  기록(거른 것) ${row.traceSame ? '같다' : '다르다'} · 날것 ${row.traceRawSame ? '같다' : '다르다'}` +
      ` · 같은판두번 ${row.traceFloor ? '같다' : '다르다'}  난수 ${row.callsBefore}/${row.callsAfter}` +
      `  표본 바닥 ${f(row.floorMax)}(${row.floorDb.toFixed(0)}dB) 전후 ${f(row.crossMax)}(${row.crossDb.toFixed(0)}dB)`);
  }
  await browser.close(); srv.close();

  const n = rows.length;
  const same = rows.filter((r) => r.traceSame).length, floorOk = rows.filter((r) => r.traceFloor).length;
  const callsEq = rows.filter((r) => r.callsBefore === r.callsAfter).length;
  const med = (xs) => { const v = xs.slice().sort((p, q) => p - q); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };
  const band = (xs, f) => `중앙값 ${f(med(xs))} · 범위 ${f(Math.min(...xs))} ~ ${f(Math.max(...xs))}`;
  const dbf = (x) => x.toFixed(1) + 'dB', exf = (x) => x.toExponential(1);
  const crossAbove = rows.filter((r) => r.crossDb > r.floorDb).length;   // 적기만 한다(판정 아님)
  console.log(`\n  ★자 ① 명령 기록 — 무음 버스를 거르면 전/후 같음 ${same}/${n} · 같은 판 두 번 같음 ${floorOk}/${n} · Math.random 소비 같음 ${callsEq}/${n}`);
  console.log(`         무음 버스 — 전 ${rows.map((r) => r.silentBefore).join('·')} · 후 ${rows.map((r) => r.silentAfter).join('·')}`);
  console.log(`  ★자 ② 표본(적기만 · 판정 아님) — 차이 RMS(신호 대비): 같은 판 두 번 ${band(rows.map((r) => r.floorDb), dbf)} / 전후 ${band(rows.map((r) => r.crossDb), dbf)}`);
  console.log(`         Δmax: 같은 판 두 번 ${band(rows.map((r) => r.floorMax), exf)} / 전후 ${band(rows.map((r) => r.crossMax), exf)} · 전후 RMS 가 제 조합 바닥보다 큰 조합 ${crossAbove}/${n}`);
  console.log(`  대조군 ⓑ Math.random 씨만 바꾸면 기록이 달라지나: ${controlB && controlB.differs ? '달라진다' : '안 달라진다 — 자가 헛것'}`);
  console.log(`  대조군 ⓒ phrase 를 켜면(village_day·ari): 기록 ${controlC && controlC.traceDiffers ? '달라진다' : '안 달라진다'} · 표본 차이 ${controlC ? controlC.pcmDb.toFixed(1) + 'dB' : '-'}` +
              (controlC ? ` · RMS legacy ${controlC.rmsDbLegacy.toFixed(2)} / phrase ${controlC.rmsDbPhrase.toFixed(2)} dBFS` : ''));
  console.log(`  페이지 오류 ${errs.length}${errs.length ? ' — ' + errs.join(' | ') : ''} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const verdict = same === n && floorOk === n && callsEq === n && controlB && controlB.differs && controlC && controlC.traceDiffers && errs.length === 0;
  console.log(`\n  결론: ${verdict ? `legacy 명령 ${n}/${n} 같다(무음 버스 하나 말고) — 대조군 셋이 섰다` : '결론이 안 선다 — 위 표를 보라'}`);
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ before: BEFORE, after: AFTER, secs: SECS, sr: SR,
    srcSha: { before: sha(SRC.before), after: sha(SRC.after), work: sha(WORK) }, rows, controlB, controlC, errs }, null, 1));
  process.exit(verdict ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });

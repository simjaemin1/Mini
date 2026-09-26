#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly B ← OfflineAudioContext/Chromium을 써서 야간 묶음에서 잰다
// === e2e-bgm-phrase — R&D-01 실제 Web Audio graph =============================
//
// 단위 하네스는 score → expression 계획을 재고, 이 하네스는 실제 OfflineAudioContext
// 에서 legacy/phrase 두 판을 4마디씩 렌더한다. mock AudioNode가 아니라 브라우저가
// 만든 oscillator 수·표본 유한성으로 opt-in graph를 검증한다.
//
// ★[T411 2026-09-26 · 세션8] ⑦⑧ 의 자를 **이 상자의 떨림 바닥**에서 유도한다(물려받은 빨강 10/2 → 12/0).
//   · 무엇을 재나 — ⑦ = **같은 판 두 번**(같은 variant·seed · 같은 페이지) · ⑧ = feature-off ↔ on 의
//     **반주**(legacy·phrase 둘 다 `lead:false`). 착지 전후 차가 아니다.
//   · 옛 허용치 `Δmax ≤ 1.5e-6 · RMS ≤ 1e-7` 은 GPT 상자의 관측(max 1.01e-6 · RMS < 4e-8) 위에 **지어 붙인
//     여유**였다. 이 상자(Chromium 141 headless)의 같은 판 두 번은 Δmax 8.7e-6~3.7e-4 · RMS 1.5e-6~7.6e-6
//     (`scripts/t411-oac-floor.js` · 판마다 16번 · 480쌍)이라 **480/480** 넘는다 — ⑦⑧ 은 거짓 빨강이었다.
//   · 왜 떨리나(실측 — T386 의 "압축기·잔향을 빼도 남는다"를 이었다): **한 자리에 셋 이상이 더해지면** 더하는
//     순서가 판마다 다르다. 노드 입력 1·2 개는 늘 같고(0/15 · 다섯 번 잼) 3 개부터 9~12/15 · 5 개 14~15/15 가
//     다르다 · AudioParam 은 제 값까지 세어 항이 셋(입력 둘)부터 0~8/15 · 넷이면 12~14/15. 끝자리 차가
//     필터·위상 적분을 지나 ~1e-5 로 자란다. phrase 판은 그 순서가 **여러 무리**로 갈린다(같은 판 쌍의 RMS 차가
//     3.0·5.0·6.5·7.5e-6 네 층) — "compressor/convolver LSB drift" 귀속은 안 선다.
//   · 자 — 바닥 = ⑦ 이 잰 **같은 판 두 번의 차(RMS)** 중 큰 쪽 · **문턱 = 그 바닥 자체**(계수 0 · 새 수 0).
//     ⑦ 은 그 바닥이 자로 설 수 있나를 잰다: 기록(trace) 정확히 같다 · preview 가 native `Math.random` 을
//     **0 번** 부른다(옛 허용치가 파형으로 지키려던 것을 **센다**) · 미끼(다른 씨 · 다른 판)는 바닥을 **넘는다**.
//     ⑧ 은 반주 차가 그 바닥 **안**이고 미끼(반주 다른 씨 · 대금 켠 판)는 넘는다.
//   · ⚠반주 **자기** 바닥(반주 두 번)을 문턱으로 쓰면 **동전**이다 — 교차 쌍이 넘는 비율 50.0%(반주 교차 256쌍과
//     같은 판 240쌍이 한 분포 · T386 §ⓐ-3 이 겪은 그 꼴). 두 판(반주 + 대금)은 더하는 자리가 더 많아 바닥이 늘
//     위다 ⇒ ⑧ 의 문턱은 ⑦ 의 바닥이다: 교차 쌍이 넘는 조합 0/3,686,400 · 가장 낮은 문턱 ↔ 가장 큰 교차 +4.5 dB ·
//     가장 높은 문턱 ↔ 가장 작은 미끼 +80.3 dB. 바닥이 미끼만큼 부풀면 ⑦ 과 ⑧ 이 **둘 다** 빨갛다.
//   · Δmax 는 **적기만** 한다 — 한 표본의 꼬리라 같은 판 두 번에서도 28배 흔들린다(phrase 1.3e-5~3.7e-4).
//   · 자명 통과 반례 `--selftest` — 셋을 주입하고 **기대한 절만** 빨개지는지 본다(새는 난수 → ⑦ ·
//     바닥 부풀림 → ⑦⑧ · 반주 음량 → ⑧). 주입의 음량 .01 은 ⑩⑪ 의 값이다(새 수 0).
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
// CI의 기존 e2e 관례는 `playwright`다. R&D worktree에서는 package.json을
// 건드리지 않고 temporary `playwright-core` + 시스템 Chrome으로도 재볼 수 있다.
let chromium;
try { ({ chromium } = require('playwright')); }
catch (first) {
  try { ({ chromium } = require('playwright-core')); }
  catch (second) { throw new Error('playwright 또는 playwright-core가 필요하다 (새 package dependency는 추가하지 않는다)'); }
}
const ROOT = path.resolve(__dirname, '..');
const PORT = +(process.env.PORT || 0) || (3900 + (process.pid % 120));
let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (detail ? `  ${detail}` : ''));
}

function startServer() {
  return http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || '__bgm-rnd.html';
    if (rel === '__bgm-rnd.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><meta charset="utf-8"><script src="/assets/audio/bgm/bgm.js"></script>');
    }
    const file = path.join(ROOT, 'public', rel);
    if (!file.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); return res.end();
    }
    const mime = path.extname(file) === '.js' ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200, { 'content-type': mime }); fs.createReadStream(file).pipe(res);
  });
}

// ★[T411] --selftest — 자명 통과 반례. 주입마다 **기대한 절만** 빨개야 자가 살아 있다(나머지는 초록).
//   음량 .01 은 이 파일 ⑩⑪ 의 값이고, 기록(trace)에는 master 음량이 안 들어간다 ⇒ 파형 자만 문다.
//   `floor` 는 ⑦·⑧ **둘 다** 물어야 한다 — ⑧ 의 문턱이 ⑦ 의 바닥이라, 부푼 바닥 뒤에 ⑧ 이 숨으면 안 된다
//   (⑧ 의 미끼가 부푼 바닥을 못 넘어 빨개진다).
const SELFTEST = process.argv.includes('--selftest');
const INJECTIONS = [
  { id: 'random', expect: ['⑦'], what: '두 번째 legacy 판 안에서 Math.random 한 번(새는 난수 · 파형 무관 — 카운터만 문다)' },
  { id: 'floor', expect: ['⑦', '⑧'], what: '두 번째 phrase 판을 음량 .01 로(바닥이 미끼만큼 부푼다 · 기록은 같다)' },
  { id: 'acc', expect: ['⑧'], what: 'phrase 반주 판을 음량 .01 로(기록은 같고 파형만 다르다)' },
];

// 한 판 — 절 12 를 모아 돌려준다(찍는 것은 부르는 쪽)
async function runOnce(page, errors, inject) {
  const checks = [];
  const ok = (cond, label, detail) => checks.push({ cond: !!cond, label, detail });
  const e0 = errors.length;
  try {
    const result = await page.evaluate(async (inject) => {
      const proto = OfflineAudioContext.prototype;
      const original = proto.createOscillator;
      const nativeRandom = Math.random;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      function compareBuffer(a, b) {
        if (a.numberOfChannels !== b.numberOfChannels || a.length !== b.length || a.sampleRate !== b.sampleRate) {
          return { equal: false, maxDelta: Infinity, differing: Infinity, rmsDelta: Infinity };
        }
        let maxDelta = 0, differing = 0, deltaEnergy = 0, samples = 0;
        for (let ch = 0; ch < a.numberOfChannels; ch++) {
          const x = a.getChannelData(ch), y = b.getChannelData(ch);
          for (let i = 0; i < x.length; i++) {
            const delta = Math.abs(x[i] - y[i]);
            if (delta) differing++;
            if (delta > maxDelta) maxDelta = delta;
            deltaEnergy += delta * delta; samples++;
          }
        }
        return { equal: differing === 0, maxDelta, differing,
          rmsDelta: Math.sqrt(deltaEnergy / Math.max(1, samples)) };
      }
      function measure(b, oscillators) {
        let peak = 0, finite = true, energy = 0, tailEnergy = 0, lastAbs = 0;
        const tailN = Math.max(1, Math.floor(b.sampleRate * .03));
        for (let ch = 0; ch < b.numberOfChannels; ch++) {
          const d = b.getChannelData(ch);
          for (let i = 0; i < d.length; i++) {
            const x = d[i];
            if (!Number.isFinite(x)) finite = false;
            const a = Math.abs(x); if (a > peak) peak = a;
            energy += x * x;
            if (i >= d.length - tailN) tailEnergy += x * x;
          }
          lastAbs = Math.max(lastAbs, Math.abs(d[d.length - 1]));
        }
        return { oscillators, seconds: b.duration, peak, finite, energy,
          rms: Math.sqrt(energy / Math.max(1, b.length * b.numberOfChannels)),
          tailRms: Math.sqrt(tailEnergy / (tailN * b.numberOfChannels)), lastAbs };
      }
      async function render(variant, extra, leak) {
        let oscillators = 0, randomCalls = 0;
        const trace = [];
        proto.createOscillator = function () { oscillators++; return original.apply(this, arguments); };
        // ★[T411] preview 는 씨 있는 `renderRandom` 만 쓴다 — native `Math.random` 호출은 **0** 이어야 한다.
        //   옛 ⑦ 이 파형 허용치로 지키려던 것(위 주석 "do not retain native Math.random()")을 **센다**.
        Math.random = function () { randomCalls++; return nativeRandom.apply(Math, arguments); };
        try {
          if (leak) Math.random();   // --selftest 주입(random) — 새는 난수 한 번
          const b = await DurangoBGM.renderAriPreview(Object.assign({
            variant, bars: 4, seed: 20260924, sampleRate: 44100, volume: .9, _renderTrace: trace
          }, extra || {}));
          return { buffer: b, stats: measure(b, oscillators), trace, randomCalls };
        } finally {
          proto.createOscillator = original;
          Math.random = nativeRandom;
        }
      }

      // fixed same-seed render equality proves preview-only noise source choices do
      // not retain native Math.random(). `lead:false` then proves that the complete
      // accompaniment graph stays identical when the tested daegeum is removed.
      // ★[T411] 앞 문장은 이제 **호출 수 0**(정확한 자)이 증명한다 — 파형 비교는 바닥을 재는 데만 쓴다.
      const legacyRun = await render('legacy');
      const legacyAgain = await render('legacy', null, inject === 'random');
      const phraseRun = await render('phrase');
      const phraseAgain = await render('phrase', inject === 'floor' ? { volume: .01 } : null);
      const accompanimentLegacy = await render('legacy', { lead: false });
      const accompanimentPhrase = await render('phrase', inject === 'acc' ? { lead: false, volume: .01 } : { lead: false });
      const phraseNineRun = await render('phrase', { bars: 9 });
      // ★[T411] 미끼 — 같은 자로 재면 바닥을 **넘어야** 한다(자가 산 증거). 씨 20260925 는 ⑪ 의 씨다.
      const baitSeedRun = await render('legacy', { seed: 20260925 });
      const baitAccSeedRun = await render('legacy', { lead: false, seed: 20260925 });
      const scoreOnly = (trace) => trace.map((x) => ({ bar: x.bar, score: x.score }));
      const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const runs = [legacyRun, legacyAgain, phraseRun, phraseAgain, accompanimentLegacy,
        accompanimentPhrase, phraseNineRun, baitSeedRun, baitAccSeedRun];

      async function sceneLifecycle() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return { supported: false, error: 'AudioContext 없음' };
        const ctx = new AC();
        try {
          const bgm = DurangoBGM.create({ context: ctx, scene: 'village_day', mood: 'ari', volume: .01,
            performancePhrases: { villageDayAriDaegeum: true }, seed: 20260924 });
          await bgm.start(); await sleep(150);
          const old = bgm._state.programs.find((p) => !p.dying);
          const phrase = old && old.daegeumPhrase;
          if (!old || !phrase) return { supported: true, hadPhrase: false };
          // The initial 1.2s start fade would obscure a sampled wet gain. Normalise
          // this test-only node, then verify scene switch actually ramps that node.
          old.wetOut.gain.cancelScheduledValues(ctx.currentTime);
          old.wetOut.gain.setValueAtTime(1, ctx.currentTime);
          bgm.setScene('village_night', .12);
          const retired = old.dying && phrase.closed && !!old.wetOut;
          await sleep(75);
          const wetFading = old.wetOut.gain.value < .95;
          await sleep(150);
          const removed = !bgm._state.programs.includes(old);
          bgm.stop(.03); await sleep(140);
          return { supported: true, hadPhrase: true, retired, wetFading, removed };
        } catch (e) {
          return { supported: true, error: String(e && e.message) };
        } finally {
          await ctx.close().catch(() => {});
        }
      }

      async function stopLifecycle() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return { supported: false, error: 'AudioContext 없음' };
        const ctx = new AC();
        try {
          const bgm = DurangoBGM.create({ context: ctx, scene: 'village_day', mood: 'ari', volume: .01,
            performancePhrases: { villageDayAriDaegeum: true }, seed: 20260925 });
          await bgm.start(); await sleep(150);
          const p = bgm._state.programs.find((x) => !x.dying);
          const phrase = p && p.daegeumPhrase;
          bgm.stop(.04);
          // 게임의 day/night·mood 갱신이 stop fade와 같은 frame에 들어와도
          // terminal stop은 새 Program/phrase를 열어서는 안 된다.
          const countAtStop = bgm._state.programs.length;
          bgm.setScene('village_night', .04); bgm.setMood('trad', .04);
          const noNewProgram = bgm._state.programs.length === countAtStop
            && bgm._state.programs.every((x) => x.dying);
          const retiredNow = !!p && p.dying && !!phrase && phrase.closed && !!p.wetOut;
          await sleep(160);
          return { supported: true, hadPhrase: !!phrase, retiredNow,
            noNewProgram, stopped: !bgm.running && bgm._state.programs.length === 0 };
        } catch (e) {
          return { supported: true, error: String(e && e.message) };
        } finally {
          await ctx.close().catch(() => {});
        }
      }

      return {
        legacy: legacyRun.stats, phrase: phraseRun.stats, phraseNine: phraseNineRun.stats,
        accompaniment: accompanimentLegacy.stats,
        sameLegacy: compareBuffer(legacyRun.buffer, legacyAgain.buffer),
        samePhrase: compareBuffer(phraseRun.buffer, phraseAgain.buffer),
        sameAccompaniment: compareBuffer(accompanimentLegacy.buffer, accompanimentPhrase.buffer),
        baitSeed: compareBuffer(legacyRun.buffer, baitSeedRun.buffer),
        baitVariant: compareBuffer(legacyRun.buffer, phraseRun.buffer),
        baitAccSeed: compareBuffer(accompanimentLegacy.buffer, baitAccSeedRun.buffer),
        baitAccLead: compareBuffer(accompanimentPhrase.buffer, phraseRun.buffer),
        randomCalls: runs.reduce((s, x) => s + x.randomCalls, 0),
        sameLegacyTrace: sameJson(legacyRun.trace, legacyAgain.trace),
        samePhraseTrace: sameJson(phraseRun.trace, phraseAgain.trace),
        sameAccompanimentTrace: sameJson(accompanimentLegacy.trace, accompanimentPhrase.trace),
        sameFeatureOffScore: sameJson(scoreOnly(legacyRun.trace), scoreOnly(phraseRun.trace)),
        scene: await sceneLifecycle(), stop: await stopLifecycle()
      };
    }, inject || null);
    ok(result.legacy.finite && result.phrase.finite, '① legacy/phrase 표본이 모두 유한하다');
    ok(result.legacy.energy > 0 && result.phrase.energy > 0, '② 두 판 모두 실제로 소리가 난다',
       `legacy ${result.legacy.energy.toFixed(1)} · phrase ${result.phrase.energy.toFixed(1)}`);
    ok(result.legacy.peak < 1 && result.phrase.peak < 1, '③ 두 판 모두 limiter 뒤 클리핑 0',
       `${result.legacy.peak.toFixed(4)} / ${result.phrase.peak.toFixed(4)}`);
    ok(Math.abs(result.legacy.seconds - 8.810) < .002 && Math.abs(result.phrase.seconds - 8.810) < .002,
       '④ A/B가 아리랑 첫 4마디(8.690s)와 안전 tail(0.120s)만 렌더한다', `${result.phrase.seconds.toFixed(3)}s`);
    const saved = result.legacy.oscillators - result.phrase.oscillators;
    ok(saved >= 100, '⑤ phrase는 대금 oscillator/LFO를 음마다 다시 열지 않는다',
       `legacy ${result.legacy.oscillators} − phrase ${result.phrase.oscillators} = ${saved}`);
    ok(result.legacy.tailRms < .002 && result.phrase.tailRms < .002
       && result.legacy.lastAbs < .002 && result.phrase.lastAbs < .002,
       '⑥ preview 끝은 열린 phrase 파형을 자르지 않고 fade한다',
       `tail RMS ${result.legacy.tailRms.toFixed(5)} / ${result.phrase.tailRms.toFixed(5)}`);
    // ★[T411] 자 — **바닥 = 같은 판 두 번의 차(RMS)** 중 큰 쪽 · **문턱 = 바닥 자체**(계수 0 · 새 수 0).
    //   옛 줄의 `max 1.5e-6 · RMS 1e-7` 은 GPT 상자 관측(1.01e-6 · 4e-8) 위의 여유였다 — 이 상자는 늘 넘는다.
    //   "compressor/convolver 의 LSB drift" 귀속도 안 선다: 떨림은 **셋 이상이 더해지는 자리**의 순서다(머리말).
    const floor = Math.max(result.sameLegacy.rmsDelta, result.samePhrase.rmsDelta);
    const bites = (x) => x.rmsDelta > floor;               // 미끼는 바닥을 **넘어야** 한다
    const e2 = (v) => (Number.isFinite(v) ? v.toExponential(2) : String(v));
    const db = (v, ref) => (Number.isFinite(v) && v > 0 ? (20 * Math.log10(v / ref)).toFixed(1) : '-∞') + 'dB';
    const bitW = (x) => (bites(x) ? '문다' : '못 문다');
    ok(result.sameLegacyTrace && result.samePhraseTrace && result.randomCalls === 0
       && bites(result.baitSeed) && bites(result.baitVariant),
       '⑦ 같은 variant·seed는 score/control trace가 정확히 같고(Math.random 0) waveform 차는 이 상자의 바닥이다 — 다른 씨·다른 판은 그 바닥을 넘는다',
       `바닥 RMS legacy ${e2(result.sameLegacy.rmsDelta)}(${db(result.sameLegacy.rmsDelta, result.legacy.rms)}) · phrase ${e2(result.samePhrase.rmsDelta)}(${db(result.samePhrase.rmsDelta, result.phrase.rms)}) → 문턱 ${e2(floor)}`
       + ` · 미끼 다른 씨 ${e2(result.baitSeed.rmsDelta)}(${bitW(result.baitSeed)}) · 다른 판 ${e2(result.baitVariant.rmsDelta)}(${bitW(result.baitVariant)}) · Math.random ${result.randomCalls}`
       + ` · 기록 ${result.sameLegacyTrace && result.samePhraseTrace ? '같다' : '다르다'} · Δmax ${e2(result.sameLegacy.maxDelta)} / ${e2(result.samePhrase.maxDelta)}(적기만)`);
    ok(result.sameFeatureOffScore && result.sameAccompanimentTrace
       && result.sameAccompaniment.rmsDelta <= floor
       && bites(result.baitAccSeed) && bites(result.baitAccLead),
       '⑧ feature-off score와 lead:false accompaniment reference는 보존된다 — 반주 차는 ⑦ 의 바닥 안 · 다른 씨·대금 켠 판은 넘는다',
       `반주 차 RMS ${e2(result.sameAccompaniment.rmsDelta)}(${db(result.sameAccompaniment.rmsDelta, result.accompaniment.rms)}) ${result.sameAccompaniment.rmsDelta <= floor ? '≤' : '>'} 문턱 ${e2(floor)}`
       + ` · 미끼 다른 씨 ${e2(result.baitAccSeed.rmsDelta)}(${bitW(result.baitAccSeed)}) · 대금 켬 ${e2(result.baitAccLead.rmsDelta)}(${bitW(result.baitAccLead)})`
       + ` · 기록 ${result.sameFeatureOffScore && result.sameAccompanimentTrace ? '같다' : '다르다'} · Δmax ${e2(result.sameAccompaniment.maxDelta)}(적기만)`);
    ok(result.phraseNine.finite && Math.abs(result.phraseNine.seconds - 19.610) < .002
       && result.phraseNine.tailRms < .002,
       '⑨ 9마디 실제 phrase render도 쉼 뒤 9마디까지 안정적으로 끝난다',
       `${result.phraseNine.seconds.toFixed(3)}s · tail ${result.phraseNine.tailRms.toFixed(5)}`);
    ok(result.scene.supported && result.scene.hadPhrase && result.scene.retired
       && result.scene.wetFading && result.scene.removed,
       '⑩ scene 전환은 phrase와 Program-local wet send를 함께 retire한다', JSON.stringify(result.scene));
    ok(result.stop.supported && result.stop.hadPhrase && result.stop.retiredNow
       && result.stop.noNewProgram && result.stop.stopped,
       '⑪ stop은 외부 scene/mood 갱신 뒤에도 phrase 재생성을 막는다', JSON.stringify(result.stop));
    const errs = errors.slice(e0);
    ok(errs.length === 0, '⑫ 렌더·lifecycle 중 페이지 오류 0', errs.slice(0, 2).join(' | ') || '없다');
  } catch (e) {
    ok(false, '하네스가 A/B 렌더를 끝냈다', String(e && e.message).slice(0, 180));
  }
  return checks;
}

(async () => {
  console.log('=== e2e-bgm-phrase — 4마디 Web Audio A/B ===\n');
  const srv = startServer();
  await new Promise((resolve) => srv.listen(PORT, resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 180)));
  let selftestOk = true;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/__bgm-rnd.html`, { waitUntil: 'load', timeout: 30000 });
    if (!SELFTEST) {
      for (const c of await runOnce(page, errors, null)) ok(c.cond, c.label, c.detail);
    } else {
      console.log('[--selftest] 주입 셋 — 주입마다 **기대한 절만** 빨개야 한다(나머지는 초록)\n');
      for (const inj of INJECTIONS) {
        const checks = await runOnce(page, errors, inj.id);
        const red = checks.filter((c) => !c.cond).map((c) => c.label.split(' ')[0]);
        const bit = red.join(' ') === inj.expect.join(' ');
        if (!bit) selftestOk = false;
        console.log(`  ${bit ? '✓' : '✗'} 주입 ${inj.id} — ${inj.what}`);
        console.log(`      빨강 [${red.join(' ') || '없음'}] · 기대 [${inj.expect.join(' ')}]`);
        for (const k of inj.expect) {
          const hit = checks.find((c) => c.label.startsWith(k));
          if (hit) console.log(`      ${k} ${hit.detail}`);
        }
      }
    }
  } catch (e) {
    ok(false, '하네스가 A/B 렌더를 끝냈다', String(e && e.message).slice(0, 180));
    selftestOk = false;
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  if (SELFTEST) {
    console.log('\n결과: ' + (selftestOk && !fail ? 'PASS(주입 셋을 그 절이 물었다)' : 'FAIL(자명 통과 — 주입을 못 물었거나 딴 절이 빨갛다)'));
    process.exit(selftestOk && !fail ? 0 : 1);
  }
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();

#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// @nightly B ← OfflineAudioContext/Chromium을 써서 야간 묶음에서 잰다
// === e2e-bgm-phrase — R&D-01 실제 Web Audio graph =============================
//
// 단위 하네스는 score → expression 계획을 재고, 이 하네스는 실제 OfflineAudioContext
// 에서 legacy/phrase 두 판을 4마디씩 렌더한다. mock AudioNode가 아니라 브라우저가
// 만든 oscillator 수·표본 유한성으로 opt-in graph를 검증한다.
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
  try {
    await page.goto(`http://127.0.0.1:${PORT}/__bgm-rnd.html`, { waitUntil: 'load', timeout: 30000 });
    const result = await page.evaluate(async () => {
      const proto = OfflineAudioContext.prototype;
      const original = proto.createOscillator;
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      function compareBuffer(a, b) {
        if (a.numberOfChannels !== b.numberOfChannels || a.length !== b.length || a.sampleRate !== b.sampleRate) {
          return { equal: false, maxDelta: Infinity, differing: Infinity };
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
          tailRms: Math.sqrt(tailEnergy / (tailN * b.numberOfChannels)), lastAbs };
      }
      async function render(variant, extra) {
        let oscillators = 0;
        const trace = [];
        proto.createOscillator = function () { oscillators++; return original.apply(this, arguments); };
        try {
          const b = await DurangoBGM.renderAriPreview(Object.assign({
            variant, bars: 4, seed: 20260924, sampleRate: 44100, volume: .9, _renderTrace: trace
          }, extra || {}));
          return { buffer: b, stats: measure(b, oscillators), trace };
        } finally {
          proto.createOscillator = original;
        }
      }

      // fixed same-seed render equality proves preview-only noise source choices do
      // not retain native Math.random(). `lead:false` then proves that the complete
      // accompaniment graph stays identical when the tested daegeum is removed.
      const legacyRun = await render('legacy');
      const legacyAgain = await render('legacy');
      const phraseRun = await render('phrase');
      const phraseAgain = await render('phrase');
      const accompanimentLegacy = await render('legacy', { lead: false });
      const accompanimentPhrase = await render('phrase', { lead: false });
      const phraseNineRun = await render('phrase', { bars: 9 });
      const scoreOnly = (trace) => trace.map((x) => ({ bar: x.bar, score: x.score }));
      const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
        sameLegacy: compareBuffer(legacyRun.buffer, legacyAgain.buffer),
        samePhrase: compareBuffer(phraseRun.buffer, phraseAgain.buffer),
        sameAccompaniment: compareBuffer(accompanimentLegacy.buffer, accompanimentPhrase.buffer),
        sameLegacyTrace: sameJson(legacyRun.trace, legacyAgain.trace),
        samePhraseTrace: sameJson(phraseRun.trace, phraseAgain.trace),
        sameAccompanimentTrace: sameJson(accompanimentLegacy.trace, accompanimentPhrase.trace),
        sameFeatureOffScore: sameJson(scoreOnly(legacyRun.trace), scoreOnly(phraseRun.trace)),
        scene: await sceneLifecycle(), stop: await stopLifecycle()
      };
    });
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
    // Chrome native OfflineAudioContext의 compressor/convolver는 같은 graph도 반복
    // render에서 LSB-scale float drift가 난다(실측 max 1.01327896e-6, RMS < 4e-8).
    // 따라서 score/control trace는 exact 비교하고, waveform은 그 관측 상한보다 조금
    // 큰 max 1.5e-6 · RMS 1e-7만 허용한다. 랜덤 차이는 이보다 훨씬 크게 난다.
    const withinRendererTolerance = (x) => x.maxDelta <= 1.5e-6 && x.rmsDelta <= 1e-7;
    ok(result.sameLegacyTrace && result.samePhraseTrace
       && withinRendererTolerance(result.sameLegacy) && withinRendererTolerance(result.samePhrase),
       '⑦ 같은 variant·seed는 score/control trace가 정확히 같고 waveform은 OAC LSB 범위다',
       `Δmax ${result.sameLegacy.maxDelta.toExponential(2)} / ${result.samePhrase.maxDelta.toExponential(2)} · RMS ${result.sameLegacy.rmsDelta.toExponential(2)} / ${result.samePhrase.rmsDelta.toExponential(2)}`);
    ok(result.sameFeatureOffScore && result.sameAccompanimentTrace
       && withinRendererTolerance(result.sameAccompaniment),
       '⑧ feature-off score와 lead:false accompaniment reference는 보존된다',
       `Δmax ${result.sameAccompaniment.maxDelta.toExponential(2)} · RMS ${result.sameAccompaniment.rmsDelta.toExponential(2)}`);
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
    ok(errors.length === 0, '⑫ 렌더·lifecycle 중 페이지 오류 0', errors.slice(0, 2).join(' | ') || '없다');
  } catch (e) {
    ok(false, '하네스가 A/B 렌더를 끝냈다', String(e && e.message).slice(0, 180));
  } finally {
    await browser.close().catch(() => {});
    srv.close();
  }
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})();

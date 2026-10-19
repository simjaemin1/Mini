// (@regress 없음 — 러너 밖 · T791 계측기 · 제품 무변)
// === scripts/t791-lines.js — 존 preload: 걸음 몸통(`npcStep`) 표본 해부 — 감싸기 없이 V8 표본기로 =====================
//   t646 자가 `--lines` 로 싣는다(T646 자 · 판 창 = t646 의 낮 · 밤 창). 혼자 쓰려면:
//     T791_LINES=<out.jsonl> T791_NPCSTEP_LINE=<사본 zone.js 의 `function npcStep` 줄> node --require scripts/t791-lines.js server/zone.js
//   ★왜 표본인가 — 함수를 감싸 재면 감싸기 몫(부름마다 ≈ 25~60 ns)이 걸음 몸통에 얹혀 "잰 갈래 밖 몫"과 섞인다(T780 ③).
//     표본기는 코드 모양을 안 바꾼다. 몸통 안 몫은 V8 이 노드마다 주는 줄 표(`positionTicks` — 자기 시간 표본의 줄)로 가르고,
//     몸통이 부른 함수는 표본 사슬에서 `npcStep` 바로 아래 틀(부른 함수 이름 · 줄)로 가른다.
//   ★15초마다 표본을 멈춰 그 토막을 센다: 표본 수 · 결정 문 고리(`_decOne`) 포함 · 제품 `npcStep` 포함 · 몸통 자기 줄 표 · 부른 함수 표 · 토막 시각(단조 µs).
//     t646 이 창마다 단조 시각을 적어 두면 표가 창 안 토막만 모은다(낮 · 밤).
'use strict';
if (process.env.T791_LINES && require('worker_threads').isMainThread) {
  const inspector = require('inspector'), fs = require('fs');
  const S = new inspector.Session(); S.connect();
  const OUT = process.env.T791_LINES, NL = +process.env.T791_NPCSTEP_LINE || 0, IV = +(process.env.T791_IV || 250);
  const post = (m, p) => new Promise((res, rej) => S.post(m, p || {}, (e, r) => (e ? rej(e) : res(r))));
  const isStep = (cf) => cf.functionName === 'npcStep' && /server\/zone\.js$/.test(cf.url) && cf.lineNumber + 1 === NL;
  function analyze(P) {
    const par = new Map(), byId = new Map();
    for (const n of P.nodes) { byId.set(n.id, n); if (n.children) for (const c of n.children) par.set(c, n.id); }
    const self = {}, call = {}; let tot = 0, dec = 0, ns = 0, nsSelf = 0;
    for (const n of P.nodes) if (isStep(n.callFrame) && n.positionTicks) for (const t of n.positionTicks) self[t.line] = (self[t.line] || 0) + t.ticks;
    //   ★[T791 ①-b] 몸통이 부른 함수 안쪽 — npcStep 아래 나무의 노드마다 자기 줄 표(함수 이름@정의 줄 · 줄) · 두 층 부름 사슬(포함 표본)
    const deep = {}, call2 = {};
    const walk = (id, d) => { const nd = byId.get(id); if (!nd) return; const cf = nd.callFrame;
      if (d > 0 && nd.positionTicks) { const fk = (cf.functionName || '(anon)') + '@' + (cf.url || '').replace(/^.*\//, '') + ':' + (cf.lineNumber + 1);
        const o = deep[fk] || (deep[fk] = {}); for (const t of nd.positionTicks) o[t.line] = (o[t.line] || 0) + t.ticks; }
      if (nd.children) for (const c of nd.children) walk(c, d + 1); };
    for (const n of P.nodes) if (isStep(n.callFrame) && n.children) for (const c of n.children) walk(c, 1);
    for (const id0 of P.samples) {
      tot++;
      let id = id0, below = null, below2 = null, hitStep = false, hitDec = false, cat = null;
      while (id != null) {
        const nd = byId.get(id); if (!nd) break; const cf = nd.callFrame;
        if (!hitStep && isStep(cf)) { hitStep = true; cat = below ? (below.functionName || '(anon)') + ':' + (below.lineNumber + 1) : null;
          if (below && below2) { const k2 = cat + '>' + (below2.functionName || '(anon)') + ':' + (below2.lineNumber + 1); call2[k2] = (call2[k2] || 0) + 1; } }
        below2 = below;
        if (cf.functionName === '_decOne') hitDec = true;
        below = cf; id = par.get(id);
      }
      if (hitDec) dec++;
      if (hitStep) { ns++; if (cat === null) nsSelf++; else call[cat] = (call[cat] || 0) + 1; }
    }
    return { t0: P.startTime, t1: P.endTime, iv: IV, tot, dec, ns, nsSelf, self, call, deep, call2 };
  }
  let busy = false;
  async function cycle() {
    if (busy) return; busy = true;
    try { const r = await post('Profiler.stop'); fs.appendFileSync(OUT, JSON.stringify(analyze(r.profile)) + '\n'); await post('Profiler.start'); }
    catch (e) { try { fs.appendFileSync(OUT, JSON.stringify({ err: String(e && e.message) }) + '\n'); } catch (e2) {} }
    busy = false;
  }
  (async () => { try { await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: IV }); await post('Profiler.start'); } catch (e) {} })();
  setInterval(cycle, 15000).unref();
}

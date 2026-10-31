#!/usr/bin/env node
// === scripts/t1014-table.js — 클라 1시간 판 마감 표(T1014) · `t926-mem-hour --first` 결과 읽기 · 러너 밖 계측 자 ===========================
//
//   태그마다(`<out>/<tag>-samples.jsonl` · `<tag>-meta.json`):
//     첫 접속 — 눌림 → welcome 받음 · 첫 그림 · 첫 입력 · 가라앉음 · 그 사이 긴 프레임(>50ms) 수 · 막은 ms (`--first` 갈고리 — 제품 표시 없이 옛 트리에도 같은 자)
//     프레임 — 바퀴 1..N(입장 표본 0 은 뺀다) 바퀴 p50 · p95 의 가운데 · p95 최대 · 긴 프레임(>50 · >100ms) 수 합 · 막은 ms 합 · 판 수 합
//     메모리 — 표본 분(5 · 30 · 60 — 없으면 가장 가까운 앞 표본)마다 JS 힙(강제 GC 뒤 · 크롬) · 렌더러 RSS(크롬 renderer · WebKit web) ·
//              크롬 memory-infra 렌더러 canvas · malloc(MB)
// 실행: node scripts/t1014-table.js [--out /tmp/t1014/out] [--at 5,30,60] [--laps N] 태그…
'use strict';
const fs = require('fs');
const path = require('path');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const OUT = opt('--out', '/tmp/t1014/out');
const AT = String(opt('--at', '5,30,60')).split(',').map(Number);
const LAPS = +opt('--laps', '0');   // 0 = 다 · N = 바퀴 1..N 만(짧은 판과 같은 창으로 견줄 때)
const tags = argv;
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const mb = (b) => (b == null ? null : +(b / 1048576).toFixed(1));
for (const tag of tags) {
  const f = path.join(OUT, `${tag}-samples.jsonl`);
  if (!fs.existsSync(f)) { console.log(`${tag}: 표본 없음`); continue; }
  const S = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(OUT, `${tag}-meta.json`), 'utf8')); } catch (e) {}
  const laps = S.filter((r) => r.k >= 1 && (!LAPS || r.k <= LAPS));
  const fr = { laps: laps.length, n: laps.reduce((a, r) => a + r.frame.n, 0), p50: med(laps.map((r) => r.frame.p50)), p95: med(laps.map((r) => r.frame.p95)),
    p95max: Math.max(...laps.map((r) => r.frame.p95 || 0)), long50: laps.reduce((a, r) => a + (r.frame.long50 || 0), 0), long100: laps.reduce((a, r) => a + (r.frame.long100 || 0), 0),
    longMs: laps.reduce((a, r) => a + (r.frame.longMs || 0), 0), max: Math.max(...laps.map((r) => r.frame.max || 0)) };
  const pick = (m) => { let best = null; for (const r of S) if (r.atMin <= m + 0.5) best = r; return best; };
  const mem = AT.map((m) => {
    const r = pick(m); if (!r) return { at: m };
    const rss = r.rss || {}; const rend = rss['cr.renderer'] != null ? rss['cr.renderer'] : rss['wk.web'];
    let can = null, mal = null;
    if (r.mdump && r.mdump.procs) for (const [p, v] of Object.entries(r.mdump.procs)) if (/^Renderer/.test(p)) { can = v.canvas; mal = v.malloc; }
    return { at: m, atMin: r.atMin, heapGC: r.cdp ? mb(r.cdp.usedGC) : null, rendRSS: rend != null ? +(rend / 1024).toFixed(0) : null, canvasMB: can, mallocMB: mal, cvLivePx: +(r.cv.livePx / 1e6).toFixed(1) };
  });
  let F = meta.first || null;
  if (!F) { try { const L = fs.readFileSync(path.join(path.dirname(OUT), `${tag}.txt`), 'utf8').match(/\[T1014\] 첫 접속 (\{.*\})/); F = L ? JSON.parse(L[1]) : {}; } catch (e) { F = {}; } }   // 판이 덜 끝났으면 로그 줄에서
  const longTxt = F.settle == null ? '(가라앉음 없음 — 긴 프레임 수는 읽은 때까지라 뺀다)' : `그 사이 긴 프레임 ${F.longN}판 ${F.longMs}ms`;
  console.log(`\n== ${tag} · ${meta.browser || '-'} · ${meta.min || '-'}분 · 손잡이 ${JSON.stringify(meta.knobs || [])} · 오류 ${(meta.errs || []).length}`);
  console.log(`  첫 접속: welcome 기다림 ${F.wait} · welcome 처리 ${F.wProc} · 첫 그림 ${F.firstDraw} · 첫 입력 ${F.firstInput} · 가라앉음 ${F.settle} ms · ${longTxt}`);
  console.log(`  프레임(바퀴 ${fr.laps}): ${fr.n}판 · p50 가운데 ${fr.p50} · p95 가운데 ${fr.p95} · p95 최대 ${fr.p95max} · 최대 ${fr.max} · >50ms ${fr.long50}판 · >100ms ${fr.long100}판 · 막은 ${(fr.longMs / 1000).toFixed(0)}초`);
  for (const m of mem) console.log(`  ${String(m.at).padStart(2)}분(표본 ${m.atMin}): JS 힙(GC 뒤) ${m.heapGC} MB · 렌더러 RSS ${m.rendRSS} MB · canvas ${m.canvasMB} · malloc ${m.mallocMB} MB · 산 캔버스 ${m.cvLivePx}M화소`);
  if (process.env.T1014_JSON) fs.writeFileSync(path.join(OUT, `${tag}-table.json`), JSON.stringify({ tag, first: F, frame: fr, mem }, null, 1));
}

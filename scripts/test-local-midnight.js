#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-local-midnight.js — 경도 하루 2단계: 마을 현지 자정 정산(동 → 서) · econ 씨 흐름 가르기 (T731) ==================
//
// ★재민 10-13: 마을 정산 = 그 마을 현지 00:00 · 한 실제 시각에 여럿이 넘으면 **동쪽 먼저**.
//   정본 식은 `server/zone-config.js localMidDay`(= floor((t − 기점) ÷ 하루 + λ) · λ = `lonOf`) 하나다. 서버 `_t731LD` · 랩 `_t731LD` 가 같은 식이다.
//
// ★이 하네스가 지키는 계약:
//   ① **현지 자정 날** — 현지 시각(`localTod`)이 0 을 지나는 1초 창에서 하나 는다 · 해 뜸 날(`localDay`)보다 해 뜸 몫(¼일)만큼 먼저 바뀐다.
//   ② **동쪽 먼저** — 같은 날 D 로 넘는 실제 시각이 x 가 클수록(동쪽) 이르다 · 한반도 존 폭의 퍼짐 = 존 폭 ÷ 세계 폭 × 하루(유도 · 새 수 0).
//   ③ **econ 씨 흐름 가르기** — 손잡이 켬이면 마을 조각 차례(정 · 역)를 바꿔도 세계 지문이 같다 · 끔은 갈린다(미끼 — 공유 흐름).
//   ④ **끔 = 아무도 안 부른다** — ★[T792] env 없음 = 켬 기본 · `=0` 이면 손잡이 거짓 · 서버 창 · 장부 날 · 부팅 증인을 부르는 줄은 모두 손잡이 뒤(소스 검사) · 랩도 env 칸 뒤.
//
// 실행: node scripts/test-local-midnight.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const codeOnly = require('./code-only.js');

const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));
const W = ZC.WORLD.worldWidth, DAY = ZC.WORLD.dayLengthMs, EP = ZC.WORLD.worldEpoch;
const T0 = Date.UTC(2026, 9, 14, 5, 11, 0);

say('\n=== 경도 하루 2단계 — 마을 현지 자정 정산 (T731) ===');

say('\n① 현지 자정 날 — 현지 00:00 에서 하나 는다');
{ const H = ZC.ZONES.hanbando;
  let bad = 0, n = 0;
  for (const fx of [0.05, 0.3, 0.5, 0.77]) { const x = H.worldOffsetX + fx * H.zoneWidth; let t = T0, found = null;
    for (let i = 0; i < DAY / 1000 + 2; i++, t += 1000) if (ZC.localTod(x, t + 1000) < ZC.localTod(x, t)) { found = t; break; }
    n++; if (found === null || ZC.localMidDay(x, found + 1000) !== ZC.localMidDay(x, found) + 1) bad++; }
  ok(n === 4 && bad === 0, '★현지 시각이 0 을 지나는 1초 창에서 현지 자정 날이 하나 는다(한반도 넷 자리)', `어김 ${bad}/${n}`);
  let md = 0; for (let i = 0; i < 97; i++) { const t = T0 + Math.round(i * DAY * 0.7317); for (const x of [0, W * 0.3, W * 0.7, W]) if (ZC.localMidDay(x, t) !== ZC.localDay(x, t + DAY * ZC.SUNRISE_FRAC)) md++; }
  ok(md === 0, '현지 자정 날(t) = 해 뜸 날(t + 해 뜸 몫) — 둘은 해 뜸 몫만 다르다', `다름 ${md}`); }

say('\n② 동쪽 먼저 — 같은 날로 넘는 실제 시각');
{ const H = ZC.ZONES.hanbando, D = ZC.localMidDay(H.worldOffsetX, T0) + 1;
  const at = (x) => EP + (D - ZC.lonOf(x)) * DAY;   // 서버 `_t731Due0` 와 같은 식
  const xs = []; for (let i = 0; i <= 64; i++) xs.push(H.worldOffsetX + (i / 64) * (H.zoneWidth - 1));
  let mono = true; for (let i = 1; i < xs.length; i++) if (!(at(xs[i]) < at(xs[i - 1]))) mono = false;
  ok(mono, '★동쪽(x 큰 쪽)일수록 먼저 넘는다');
  let ldOk = true; for (const x of xs) { if (ZC.localMidDay(x, at(x) + 1) !== D || ZC.localMidDay(x, at(x) - 1) !== D - 1) ldOk = false; }
  ok(ldOk, '넘는 시각 앞뒤 1ms 의 현지 자정 날 = D − 1 · D(식 둘이 한 몸)');
  const span = (at(xs[0]) - at(xs[xs.length - 1])) / 1000, want = (H.zoneWidth - 1) / W * DAY / 1000;
  ok(Math.abs(span - want) < 1e-6 && span > 160 && span < 170, '한반도 존의 자정 퍼짐 = 존 폭 ÷ 세계 폭 × 하루(실초)', span.toFixed(1)); }

say('\n③ econ 씨 흐름 가르기 — 마을 조각 차례와 무관(켬) · 미끼(끔)');
{ const kid = `const path=require('path'),crypto=require('crypto');const _l=console.log;console.log=()=>{};
const v2=require(path.join(${JSON.stringify(ROOT)},'sim','economy-sim-v2.js'));const REV=process.argv[1]==='1';
const w=v2.createWorldV2({seed:7,villageCount:8});
for(let d=0;d<40;d++){const P=v2.tickWorldV2Parts(w);P.head();const L=w.villages.slice();if(REV)L.reverse();for(const v of L)P.village(v);P.trade();P.caravans();P.tail();}
const s=w.villages.map(v=>JSON.stringify([v.name,Object.keys(v.storage).sort().map(k=>[k,+(+v.storage[k]).toFixed(6)]),v.npcs.map(n=>[n.id,+(+n.age).toFixed(4),n.currentJob])])).join('\\n');
console.log=_l;console.log(crypto.createHash('sha1').update(s).digest('hex').slice(0,12));`;
  const run = (on, rev) => execFileSync(process.execPath, ['-e', kid, rev ? '1' : '0'], { env: Object.assign({}, process.env, { T731_LOCAL_MIDNIGHT: on ? '1' : '0' }), encoding: 'utf8', maxBuffer: 1 << 24 }).trim().split('\n').pop();
  const offN = run(0, 0), offR = run(0, 1), onN = run(1, 0), onR = run(1, 1);
  ok(offN !== offR, '미끼 — 끔(세계 하나의 흐름)은 차례를 뒤집으면 40일 지문이 갈린다', `${offN} ≠ ${offR}`);
  ok(onN === onR, '★켬(마을마다 흐름)은 차례를 뒤집어도 40일 지문이 같다', `${onN} = ${onR}`);
  ok(onN !== offN, '켬은 수열이 바뀐다(같은 판이 아니다 — 끔 바이트는 ④ · 3시드 자)', `${onN} ≠ ${offN}`); }

say('\n④ 끔 = 아무도 안 부른다');
{ const env0 = Object.assign({}, process.env); delete env0.T731_LOCAL_MIDNIGHT;
  const probe = (env) => execFileSync(process.execPath, ['-e', `const E=require(${JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'))});console.log(JSON.stringify([E.T731_LOCAL_MIDNIGHT,Object.keys(E.rngState()).length]))`], { env, encoding: 'utf8' }).trim().split('\n').pop();
  const off = JSON.parse(probe(Object.assign({}, env0, { T731_LOCAL_MIDNIGHT: '0' }))), on = JSON.parse(probe(env0));   // ★[T792] 켬 기본 — env 없음 = 켬 · `=0` = 끔
  ok(off[0] === false && off[1] === 3, '★끔 탐침 — `T731_LOCAL_MIDNIGHT=0` → econ 손잡이 끔 · 난수 상태 칸 셋(종전)', JSON.stringify(off));
  ok(on[0] === true && on[1] === 4, '★[T792] env 없음 → 켬 기본 · 세계 씨 칸이 는다(손잡이가 실제로 읽힌다)', JSON.stringify(on));
  const V = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8')).split('\n');
  //   부르는 줄(정의 줄 · 켬 판만 도는 `_t731Boot` 안의 첫 줄은 뺀다 — 그 함수를 부르는 줄이 손잡이 뒤다)
  const hit = V.filter((l) => /_t731Tick\(|_t731Boot\(|_ledgerDay\(vil|_t731Due\(now\)|_t731Lam\(ccx\)|_t731Lam\(vil\.ccx\)/.test(l) && !/^\s*function /.test(l) && !/vil\._lonMid == null\) vil\._lonMid = _t731Lam/.test(l));
  ok(hit.length >= 12 && hit.every((l) => /T731_ON/.test(l)), '서버 — 창 · 장부 날 · 부팅 증인 · 경도 몫을 부르는 줄이 모두 손잡이 뒤', `${hit.filter((l) => /T731_ON/.test(l)).length}/${hit.length}`);
  const od = V.filter((l) => /_openDayJobs\(now(?:, \{|\))/.test(l));
  ok(od.length >= 2 && od.some((l) => /_openDayJobs\(now\);/.test(l)), '서버 — 종전 경계는 `_openDayJobs(now)`(T 없음 = 종전 차례)', od.length);
  const E = codeOnly(fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8'));
  ok(/function useVillageStream\(v\) \{ if \(!T731_LOCAL_MIDNIGHT\) return;/.test(E), 'econ — 마을 흐름 문은 끔이면 첫 줄에서 돌아간다');
  const L = codeOnly(fs.readFileSync(path.join(ROOT, 'lab', '전쟁실험실.html'), 'utf8'));
  // ★[T1004] 랩도 서버 기본(T792 · `!== '0'`)과 같다 — 칸 없음 = 켬 · `?T731_LOCAL_MIDNIGHT=0` = 끔(재민 09-03 "랩 = 서버와 같아야").
  //   옛 글자(`==='1'` = 칸이 있어야 켜짐)가 돌아오면 빨강이다 — 단언은 그대로 둘(정의 줄 · 두 부르는 자리), 글자만 새 세계로.
  ok(/const L_T731=\(typeof window!=='undefined'&&window\.LAB_ENV&&window\.LAB_ENV\.T731_LOCAL_MIDNIGHT!=='0'/.test(L) && !/LAB_ENV\.T731_LOCAL_MIDNIGHT==='1'/.test(L) && /if\(L_T731\)_t731Step\(/.test(L) && /if\(L_T731\)\{_t731Step\(/.test(L),
    '랩 — 서버 기본과 같다(칸 없음 = 켬 · `=0` 만 끔) · 프레임 · 헤드리스 하루 둘 다 손잡이 뒤'); }

say(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-crop-cal.js — T594 작물 철 고증: 표 · 유도 · 손잡이 · 랩 거울 ==========================
//
// ★잰다: ① 34종이 표(고증 16) + 빠진 까닭(18)으로 빈틈없이 덮이나 ② 표에 원문 글자만 있나(새 수 0)
//   ③ 순(旬) 글자 → 날 ④ **정의 — 파종창 가운데날에 심으면 수확창 가운데날에 익는다**(켬 · 월동은 T99 셈 그대로)
//   ⑤ 끔 = 카탈로그 그대로(34종 · 클라 페이로드까지) ⑥ 켬 = 고증 표만 바뀐다 ⑦ 달력 끔이면 갈래도 꺼진다
//   ⑧ 재민 문장 — "벼 10월 · 보리·밀은 겨울을 나서 5~6월" ⑨ 랩 두 벌 거울(구운 블록 = 정본 · 같은 날 익는다 · 끔 = 랩 그대로)
//   ⑩ 돌연변이 셋 — 손잡이 무시 · 춘화 빼고 셈 · 표 한 칸 바꿈 ⇒ 빨강이어야 한다(이빨)
//
// ★손잡이는 로드 때 한 번 읽힌다 ⇒ 켬/끔은 **자식 프로세스**로 정본을 통째로 다시 싣는다(test-crops ⑫ⓗ 와 같은 규약 —
//   모듈 밖에서 export 를 갈아 끼우는 건 통제군이 아니다).
// 실행: node scripts/test-crop-cal.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

const CROPS_JS = path.join(ROOT, 'server', 'crops.js');
const CAL_JS = path.join(ROOT, 'server', 'crop-cal.js');
const Crops = require(CROPS_JS);           // 이 프로세스 = 기본 env(손잡이 끔)
const CC = require(CAL_JS);
const Cal = require(path.join(ROOT, 'server', 'calendar'));
const CATALOG = require(path.join(ROOT, 'server', 'crops.json')).crops;

// 자식 프로세스 — env 를 걸고 정본을 새로 싣는다. `pre` 는 crops 를 싣기 전에 도는 줄(돌연변이 주입용).
function child(env, expr, preCode) {
  const code = `const path=require('path'),fs=require('fs'),Module=require('module');${preCode || ''}`
    + `const C=require(${JSON.stringify(CROPS_JS)}),CC=require(${JSON.stringify(CAL_JS)}),Cal=require(${JSON.stringify(path.join(ROOT, 'server', 'calendar'))});`
    + `process.stdout.write('@@'+JSON.stringify(${expr}));`;
  const e = Object.assign({}, process.env);
  delete e.T594_CROP_CAL; delete e.T570_CALENDAR;
  const out = execFileSync(process.execPath, ['-e', code], { env: Object.assign(e, env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.lastIndexOf('@@') + 2));
}
// 돌연변이 주입 — 정본 파일의 소스를 바꿔 **그 파일 이름으로** 컴파일해 require 캐시에 꽂는다(임시 파일 0).
const mutate = (file, from, to) => `{const F=${JSON.stringify(file)};const S=fs.readFileSync(F,'utf8');const T=S.split(${JSON.stringify(from)}).join(${JSON.stringify(to)});`
  + `if(T===S)throw new Error('MUT_MISS');const m=new Module(F,null);m.filename=F;m.paths=Module._nodeModulePaths(path.dirname(F));m._compile(T,F);m.loaded=true;require.cache[F]=m;}`;
const fmt = (d) => { if (d == null) return '—'; const t = Cal.dateOf(d); return `${t.month}/${t.dom}`; };

console.log('\n=== T594 작물 철 고증 — 표 · 유도 · 손잡이 · 랩 거울 ===');
pre(Cal.ON, '달력 정본 켬(T570 · 게임일 0 = 1년 3월 1일)', `dateOf(0) = ${fmt(0)}`);
pre(Crops.T594_CROP_CAL === false, '이 프로세스는 손잡이 끔(기본 env)');

// ── ① 덮개 ─────────────────────────────────────────────────────────────────────────────
console.log('\n① 34종 = 고증 표 + 빠진 까닭');
{
  const rows = CC.ids(), miss = Object.keys(CC.NOT_IN_TABLE);
  const all = new Set([...rows, ...miss]);
  pre(Crops.IDS.length === 34, '카탈로그 34종', Crops.IDS.length);
  ok(rows.length === new Set(rows).size, '① 표 id 겹침 0', rows.length);
  ok(rows.every((id) => !miss.includes(id)), '① 표와 빠진 까닭이 서로 겹치지 않는다');
  ok(all.size === Crops.IDS.length && Crops.IDS.every((id) => all.has(id)), '★① 34종 전부가 표 또는 빠진 까닭에 있다(빈틈 0)', `표 ${rows.length} + 빠짐 ${miss.length}`);
  const per = Crops.IDS.filter((id) => Crops.isPerennial(id));
  ok(per.every((id) => /다년생/.test(CC.NOT_IN_TABLE[id] || '')), '① 다년생 넷은 표 밖(재생 주기는 별도 축)', per.join(','));
}

// ── ② 원문만 ───────────────────────────────────────────────────────────────────────────
console.log('\n② 표에 원문 글자만(새 수 0)');
{
  const KEYS = new Set(['id', 'kind', 'region', 'from', 'sow', 'harvest', 'src', 'note']);
  const extra = CC.ROWS.filter((r) => Object.keys(r).some((k) => !KEYS.has(k)));
  ok(extra.length === 0, '★② 줄마다 열이 원문 칸뿐이다(성장일·날수 칸 0)', extra.map((r) => r.id).join(',') || '');
  ok(CC.ROWS.every((r) => Array.isArray(r.src) && r.src.length && r.src.every((u) => /^https:\/\/www\.nongsaro\.go\.kr\//.test(u))), '② 출처는 전부 농사로(1차)');
  ok(CC.ROWS.every((r) => typeof r.sow === 'string' && typeof r.harvest === 'string'), '② 파종창·수확창은 글자다');
  const SRC = fs.readFileSync(CAL_JS, 'utf8');
  ok(!/growDays\s*:/.test(SRC), '② crop-cal.js 에 `growDays:` 칸이 없다(성장일은 crops.js 가 유도)');
  ok(CATALOG.rice.growDays === 78 && CATALOG.barley.growDays === 88, '② 카탈로그(crops.json)는 그대로 — 쌀 78 · 보리 88');
}

// ── ③ 순 글자 ─────────────────────────────────────────────────────────────────────────
console.log('\n③ 순(旬) 글자 → 날');
{
  const s = (t) => { const p = CC.parseSpan(t); return `${p.from[0]}/${p.from[1]}~${p.to[0]}/${p.to[1]}`; };
  ok(s('5월 하순') === '5/21~5/31', '③ 하순 = 21일~말일', s('5월 하순'));
  ok(s('6월 상순~6월 중순') === '6/1~6/20', '③ 상순~중순', s('6월 상순~6월 중순'));
  ok(s('10월~11월 상순') === '10/1~11/10', '③ 달만 = 그 달 전체', s('10월~11월 상순'));
  ok(s('5.15~6.10') === '5/15~6/10', '③ 날짜 표기', s('5.15~6.10'));
  ok(s('2월 하순') === '2/21~2/28', '③ 2월 하순 = 평년 28일', s('2월 하순'));
  let threw = false; try { CC.parseSpan('6월 상~중순'); } catch (e) { threw = true; }
  ok(threw, '③ 끝에 달이 없는 줄임 글자는 거절한다(표는 풀어 적는다)');
  const bad = CC.ROWS.filter((r) => { const sp = CC.spanOf(r); return !(sp.s0 <= sp.s1 && sp.h0 <= sp.h1 && sp.hMid > sp.sMid); });
  ok(bad.length === 0, '③ 16줄 모두 파종 ≤ 끝 · 수확 ≤ 끝 · 수확 가운데 > 파종 가운데', bad.map((r) => r.id).join(','));
}

// ── ④ 정의 ─────────────────────────────────────────────────────────────────────────────
console.log('\n④ 정의 — 파종창 가운데날에 심으면 수확창 가운데날에 익는다(켬)');
const ON = child({ T594_CROP_CAL: '1' }, `CC.ids().map(id=>{const sp=CC.spanOf(CC.rowOf(id));return {id,s:sp.sDay,h:sp.hDay,rd:C.readyDay(id,sp.sDay),g:C.growDaysOf(id),cal:C.calDaysOf(id),w:C.isWinterCrop(id)};})`);
{
  pre(ON.length === CC.ids().length, '켬 자식 프로세스가 16줄을 돌려줬다', ON.length);
  const bad = ON.filter((r) => r.rd !== r.h);
  ok(bad.length === 0, '★★④ 16종 전부 readyDay(가운데 파종) = 가운데 수확', bad.map((r) => `${r.id} ${fmt(r.rd)}≠${fmt(r.h)}`).join(' · '));
  const W = ON.filter((r) => r.w);
  pre(W.length === 3, '월동 셋이 표에 있다(보리·밀·마늘)', W.map((r) => r.id).join(','));
  ok(W.every((r) => r.g < r.h - r.s - 90), '★④ 월동 셋의 성장일은 달력 간격보다 훨씬 짧다 = 가을·겨울을 안 센다(T99 춘화 셈)', W.map((r) => `${r.id} ${r.g} ≪ ${r.h - r.s}`).join(' · '));
  const A = ON.filter((r) => !r.w);
  ok(A.every((r) => r.g === r.h - r.s), '④ 1년생 13종의 성장일 = 두 가운데날 사이 날수(휴면 없음)', A.length);
}

// ── ⑤ 끔 = 카탈로그 ─────────────────────────────────────────────────────────────────────
console.log('\n⑤ 끔 = 카탈로그 그대로');
const OFF = child({}, `({flag:C.T594_CROP_CAL,g:C.IDS.map(id=>[id,C.growDaysOf(id)]),pay:C.payload().map(p=>[p.id,p.growDays]),cal:C.IDS.map(id=>[id,C.calDaysOf(id)])})`);
{
  const scale = parseFloat(process.env.CROP_GROW_SCALE); const S = Number.isFinite(scale) ? scale : 1;
  const want = (id) => Math.max(1, Math.round(CATALOG[id].growDays * S));
  pre(OFF.flag === false, '끔 자식 프로세스의 손잡이 = 거짓');
  ok(OFF.g.every(([id, g]) => g === want(id)), '★★⑤ 34종 성장일 = 카탈로그 그대로(비트 동일 갈래)', OFF.g.length);
  ok(OFF.pay.every(([id, g]) => g === want(id)), '⑤ 클라 페이로드 growDays 도 카탈로그 그대로');
  const onCal = new Map(ON.map((r) => [r.id, r.cal]));
  ok(OFF.cal.every(([id, c]) => (onCal.has(id) ? c === onCal.get(id) : c === null)), '⑤ calDaysOf 는 손잡이와 무관한 순수 유도(끔·켬 같은 수 · 표 밖 null)');
}

// ── ⑥ 켬 ────────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 켬 = 고증 표만 바뀐다');
const ONALL = child({ T594_CROP_CAL: '1' }, `({flag:C.T594_CROP_CAL,g:C.IDS.map(id=>[id,C.growDaysOf(id),C.calDaysOf(id)]),pay:C.payload().filter(p=>p.id==='rice').map(p=>p.growDays)[0]})`);
{
  pre(ONALL.flag === true, '켬 자식 프로세스의 손잡이 = 참');
  const inT = new Set(CC.ids());
  ok(ONALL.g.every(([id, g, c]) => (inT.has(id) ? g === c : g === CATALOG[id].growDays)), '★⑥ 표 16종 = 유도값 · 나머지 18종 = 카탈로그', ONALL.g.filter(([id]) => inT.has(id)).map(([id, g]) => `${id} ${g}`).join(' · '));
  ok(ONALL.g.filter(([id]) => inT.has(id)).every(([id, g]) => g !== CATALOG[id].growDays), '⑥ 표 16종은 전부 카탈로그와 다르다(고친 작물 16)');
  ok(ONALL.pay === ONALL.g.find(([id]) => id === 'rice')[1], '⑥ 클라 페이로드도 같은 수(벼)', ONALL.pay);
}

// ── ⑦ 달력 끔 ───────────────────────────────────────────────────────────────────────────
console.log('\n⑦ 달력 끔(T570_CALENDAR=0) + 켬 ⇒ 갈래 꺼짐');
{
  const r = child({ T594_CROP_CAL: '1', T570_CALENDAR: '0' }, `C.IDS.map(id=>[id,C.growDaysOf(id),C.calDaysOf(id)])`);
  ok(r.every(([id, g, c]) => g === CATALOG[id].growDays && c === null), '★⑦ 날짜가 뜻이 없는 판에서는 34종 카탈로그 그대로 · 유도 null');
}

// ── ⑧ 재민 문장 ─────────────────────────────────────────────────────────────────────────
console.log('\n⑧ 재민 문장 — "벼 10월 · 보리·밀은 겨울을 나서 5~6월"');
{
  const Q = `['rice','barley','wheat','garlic'].map(id=>{const p=id==='rice'?Cal.dayOf(1,6,1):Cal.dayOf(1,10,1);const r=C.readyDay(id,p);const t=Cal.dateOf(r);return [id,t.month,t.dom];})`;
  const on = child({ T594_CROP_CAL: '1' }, Q), off = child({}, Q);
  const m = (a, id) => a.find((x) => x[0] === id);
  ok(m(on, 'rice')[1] === 10, '★★⑧ 켬: 벼 6월 1일 심기 → 10월에 익는다', `${m(on, 'rice')[1]}/${m(on, 'rice')[2]}`);
  ok(m(off, 'rice')[1] === 8, '⑧ 끔(통제군): 같은 벼가 8월에 익는다', `${m(off, 'rice')[1]}/${m(off, 'rice')[2]}`);
  ok([5, 6].includes(m(on, 'barley')[1]) && [5, 6].includes(m(on, 'wheat')[1]), '★⑧ 켬: 보리·밀 10월 1일 심기 → 5~6월', `보리 ${m(on, 'barley')[1]}/${m(on, 'barley')[2]} · 밀 ${m(on, 'wheat')[1]}/${m(on, 'wheat')[2]}`);
  ok(m(off, 'barley')[1] === 5 && m(off, 'wheat')[1] === 5, '⑧ 끔도 보리·밀은 이미 5월(T99 춘화 — T583 표의 12월은 춘화를 안 센 식)', `보리 ${m(off, 'barley')[1]}/${m(off, 'barley')[2]} · 밀 ${m(off, 'wheat')[1]}/${m(off, 'wheat')[2]}`);
  ok(m(on, 'wheat')[1] === 6 && m(on, 'wheat')[2] >= 5 && m(on, 'wheat')[2] <= 20, '⑧ 켬: 밀은 원문 수확창(6.5~6.20) 안', `${m(on, 'wheat')[1]}/${m(on, 'wheat')[2]}`);
}

// ── ⑨ 랩 거울 ───────────────────────────────────────────────────────────────────────────
console.log('\n⑨ 랩 두 벌 — 구운 블록 = 정본 · 같은 날 익는다 · 끔 = 랩 그대로');
{
  let chk = 0;
  try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't594-lab-cropcal.js'), '--check'], { stdio: 'pipe' }); } catch (e) { chk = e.status || 1; }
  ok(chk === 0, '★⑨ `t594-lab-cropcal.js --check` — 두 랩의 구운 블록이 정본과 같다');
  for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    const H = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const yl = (H.match(/const L_YEAR=365, L_MOSTART=\[[^\]]*\]/) || [])[0];
    const a = H.indexOf('// ▼T594-CROPCAL'), b = H.indexOf('// ▲T594-CROPCAL');
    const ci = H.indexOf('const CROPS=['), cj = H.indexOf('];', ci);
    pre(!!yl && a > 0 && b > a && ci > 0, `${path.basename(f)}: 랩 달력 줄 · T594 블록 · CROPS 표를 찾았다`);
    if (!(yl && a > 0 && b > a && ci > 0)) continue;
    const L = new Function(`${yl};${H.slice(ci, cj + 2)}\n${H.slice(a, b)}\nreturn {L_YEAR,L_MOSTART,CROPS,L_CROPCAL_T,cropGrowAt,set:(v)=>{L_CROPCAL=v;}};`)();
    // 끔: 랩 표 그대로
    L.set(false);
    ok(L.CROPS.every((c) => [0, 100, 300].every((d) => L.cropGrowAt(c, d) === c.grow)), `⑨ ${path.basename(f)}: 끔 = 랩 표 grow 그대로(30종)`);
    // 켬: 서버와 같은 날 익는다(랩 달력 1월 1일 기점 → 날짜로 견준다)
    L.set(true);
    const labDay = (m, dom) => L.L_MOSTART[m - 1] + dom - 1;
    const labDate = (d) => { const y = Math.floor(d / L.L_YEAR), doy = d - y * L.L_YEAR; let m = 11; while (m > 0 && L.L_MOSTART[m] > doy) m--; return `${m + 1}/${doy - L.L_MOSTART[m] + 1}`; };
    const diffs = [];
    for (const r of ON) {
      const ko = Crops.koOf(r.id), cands = [ko, ko.replace(/\(.*\)/, ''), (/\(([^)]*)\)/.exec(ko) || [])[1]];
      const cr = L.CROPS.find((c) => cands.includes(c.id)); if (!cr) { diffs.push(r.id + ' 랩 표에 없음'); continue; }
      const t = Cal.dateOf(r.s), p = labDay(t.month, t.dom);
      const got = labDate(p + L.cropGrowAt(cr, p)), want = fmt(r.rd);
      if (got !== want) diffs.push(`${r.id} 랩 ${got} ≠ 서버 ${want}`);
    }
    ok(diffs.length === 0, `★⑨ ${path.basename(f)}: 켬 — 16종이 서버와 **같은 날** 익는다(월동 = 다음 3월 1일 + 활동일)`, diffs.join(' · '));
    const uses = (H.match(/\(e\.g\|\|e\.crop\.grow\)/g) || []).length, bare = (H.replace(/\(e\.g\|\|e\.crop\.grow\)/g, '').match(/e\.crop\.grow/g) || []).length;
    ok(uses === 6 && bare === 0 && /g:cropGrowAt\(cr,day\)/.test(H), `⑨ ${path.basename(f)}: 상태기 여섯 자리가 밭마다의 성장일(e.g)을 읽고 · 심을 때 한 번 정한다`, `읽기 ${uses} · 맨 grow ${bare}`);
  }
}

// ── ⑩ 돌연변이 ─────────────────────────────────────────────────────────────────────────
console.log('\n⑩ 돌연변이 셋 — 빨강이어야 한다');
{
  // ⓐ 손잡이를 무시(늘 켬) ⇒ ⑤ 가 빨개진다
  const a = child({}, `C.growDaysOf('rice')`, mutate(CROPS_JS, "const T594_CROP_CAL = _num('T594_CROP_CAL', 0) !== 0;", 'const T594_CROP_CAL = true;'));
  ok(a !== CATALOG.rice.growDays, '★★⑩ⓐ 손잡이 무시(늘 켬) ⇒ 끈 판 벼가 카탈로그가 아니다 = ⑤ 에 이빨이 있다', `벼 ${a}`);
  // ⓑ 유도에서 춘화를 뺀다(심은 날부터 센다) ⇒ ④ 월동이 빨개진다
  const b = child({ T594_CROP_CAL: '1' }, `(()=>{const sp=CC.spanOf(CC.rowOf('barley'));return [C.readyDay('barley',sp.sDay),sp.hDay];})()`,
    mutate(CROPS_JS, 'const a = vernalDay(id, sp.sDay), b = sp.hDay;', 'const a = sp.sDay, b = sp.hDay;'));
  ok(b[0] !== b[1], '★★⑩ⓑ 유도에서 춘화를 빼면 ⇒ 보리가 가운데날에 안 익는다 = ④ 에 이빨이 있다', `${fmt(b[0])} ≠ ${fmt(b[1])}`);
  // ⓒ 표 한 칸(벼 수확창)을 9월로 ⇒ ⑧ 이 빨개진다
  const c = child({ T594_CROP_CAL: '1' }, `Cal.dateOf(C.readyDay('rice',Cal.dayOf(1,6,1))).month`,
    mutate(CAL_JS, "harvest: '10월 상순~10월 중순', src: [WS(30697), RICE_HARVEST]", "harvest: '9월 상순~9월 중순', src: [WS(30697), RICE_HARVEST]"));
  ok(c !== 10, '★★⑩ⓒ 표의 벼 수확창을 9월로 바꾸면 ⇒ 벼가 10월에 안 익는다 = ⑧ 에 이빨이 있다', `${c}월`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-crop-cal.js — T594 작물 철 고증: 표 · 유도 · 손잡이 · 랩 거울 ==========================
//
// ★잰다: ① 34종이 표(고증 16) + 빠진 까닭(18)으로 빈틈없이 덮이나 ② 표에 원문 글자만 있나(새 수 0)
//   ③ 순(旬) 글자 → 날 ④ **정의 — 파종창 가운데날에 심으면 수확창 가운데날에 익는다**(켬 · 월동은 T99 셈 그대로)
//   ⑤ 끔 = 카탈로그 그대로(34종 · 클라 페이로드까지) ⑥ 켬 = 고증 표만 바뀐다 ⑦ 달력 끔이면 갈래도 꺼진다
//   ⑧ 재민 문장 — "벼 10월 · 보리·밀은 겨울을 나서 5~6월" ⑨ 랩 두 벌 거울(구운 블록 = 정본 · 기본 켬 · 같은 날 익는다 · 끔 = 랩 그대로)
//   ⑩ 돌연변이 넷 — 손잡이 무시 · 춘화 빼고 셈 · 표 한 칸 바꿈 · 기본을 끔으로 되돌림 ⇒ 빨강이어야 한다(이빨)
//   ⑪ [T648] 랩 밭 겨울 휴면 — 휴면 중 일감 0 · 품질 무변 · 병충해 0(월동 셋 · 다년생 둘) · 봄엔 돈다 · 끔 = 종전 · 문 = 서버 술어 · 미끼(문을 빼면 빨강)
// ★★[T634 2026-10-04] **기본 켬** — ⓪ 손잡이 없음 = 켬 · `T594_CROP_CAL=0` = 옛 판(카탈로그) · `1` = 켬(기본과 같은 수).
//   그래서 끔 통제군은 이제 `{T594_CROP_CAL:'0'}` 이고, 켬 쪽은 **기본 env**(`{}`)로 잰다(배포가 실제로 받는 판).
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
const Crops = require(CROPS_JS);           // 이 프로세스 = 부른 env 그대로 — 여기선 손잡이와 무관한 칸만 읽는다(켬/끔은 자식 프로세스)
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

// ── ⓪ 기본 = 켬(T634) ────────────────────────────────────────────────────────────────────
console.log('\n⓪ 기본 = 켬(T634) — 손잡이 없음 = 켬 · `0` = 옛 판 · `1` = 켬');
{
  const Q = `({flag:C.T594_CROP_CAL,g:C.IDS.map(id=>[id,C.growDaysOf(id)])})`;
  const DEF = child({}, Q), ZERO = child({ T594_CROP_CAL: '0' }, Q), ONE = child({ T594_CROP_CAL: '1' }, Q);
  ok(DEF.flag === true, '★★⓪ 손잡이 없음 = **켬**(T634 기본)', `flag ${DEF.flag}`);
  ok(ZERO.flag === false && ONE.flag === true, '★⓪ `T594_CROP_CAL=0` = 끔(옛 판 · 되돌림 한 손잡이) · `1` = 켬');
  ok(JSON.stringify(DEF.g) === JSON.stringify(ONE.g), '⓪ 기본 판 성장일 = `1` 판(34종 같은 수)', DEF.g.length);
  ok(JSON.stringify(DEF.g) !== JSON.stringify(ZERO.g), '⓪ 기본 판 ≠ `0` 판(되돌림이 실제로 무언가를 되돌린다)');
}

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
console.log('\n④ 정의 — 파종창 가운데날에 심으면 수확창 가운데날에 익는다(켬 = 기본)');
const ON = child({}, `CC.ids().map(id=>{const sp=CC.spanOf(CC.rowOf(id));return {id,s:sp.sDay,h:sp.hDay,rd:C.readyDay(id,sp.sDay),g:C.growDaysOf(id),cal:C.calDaysOf(id),w:C.isWinterCrop(id)};})`);
{
  pre(ON.length === CC.ids().length, '기본(켬) 자식 프로세스가 16줄을 돌려줬다', ON.length);
  const bad = ON.filter((r) => r.rd !== r.h);
  ok(bad.length === 0, '★★④ 16종 전부 readyDay(가운데 파종) = 가운데 수확', bad.map((r) => `${r.id} ${fmt(r.rd)}≠${fmt(r.h)}`).join(' · '));
  const W = ON.filter((r) => r.w);
  pre(W.length === 3, '월동 셋이 표에 있다(보리·밀·마늘)', W.map((r) => r.id).join(','));
  ok(W.every((r) => r.g < r.h - r.s - 90), '★④ 월동 셋의 성장일은 달력 간격보다 훨씬 짧다 = 가을·겨울을 안 센다(T99 춘화 셈)', W.map((r) => `${r.id} ${r.g} ≪ ${r.h - r.s}`).join(' · '));
  const A = ON.filter((r) => !r.w);
  ok(A.every((r) => r.g === r.h - r.s), '④ 1년생 13종의 성장일 = 두 가운데날 사이 날수(휴면 없음)', A.length);
}

// ── ⑤ 끔 = 카탈로그 ─────────────────────────────────────────────────────────────────────
console.log('\n⑤ 끔(`T594_CROP_CAL=0`) = 카탈로그 그대로');
const OFF = child({ T594_CROP_CAL: '0' }, `({flag:C.T594_CROP_CAL,g:C.IDS.map(id=>[id,C.growDaysOf(id)]),pay:C.payload().map(p=>[p.id,p.growDays]),cal:C.IDS.map(id=>[id,C.calDaysOf(id)])})`);
{
  const scale = parseFloat(process.env.CROP_GROW_SCALE); const S = Number.isFinite(scale) ? scale : 1;
  const want = (id) => Math.max(1, Math.round(CATALOG[id].growDays * S));
  pre(OFF.flag === false, '끔(`0`) 자식 프로세스의 손잡이 = 거짓');
  ok(OFF.g.every(([id, g]) => g === want(id)), '★★⑤ 34종 성장일 = 카탈로그 그대로(비트 동일 갈래)', OFF.g.length);
  ok(OFF.pay.every(([id, g]) => g === want(id)), '⑤ 클라 페이로드 growDays 도 카탈로그 그대로');
  const onCal = new Map(ON.map((r) => [r.id, r.cal]));
  ok(OFF.cal.every(([id, c]) => (onCal.has(id) ? c === onCal.get(id) : c === null)), '⑤ calDaysOf 는 손잡이와 무관한 순수 유도(끔·켬 같은 수 · 표 밖 null)');
}

// ── ⑥ 켬 ────────────────────────────────────────────────────────────────────────────────
console.log('\n⑥ 켬(기본) = 고증 표만 바뀐다');
const ONALL = child({}, `({flag:C.T594_CROP_CAL,g:C.IDS.map(id=>[id,C.growDaysOf(id),C.calDaysOf(id)]),pay:C.payload().filter(p=>p.id==='rice').map(p=>p.growDays)[0]})`);
{
  pre(ONALL.flag === true, '기본(켬) 자식 프로세스의 손잡이 = 참');
  const inT = new Set(CC.ids());
  ok(ONALL.g.every(([id, g, c]) => (inT.has(id) ? g === c : g === CATALOG[id].growDays)), '★⑥ 표 16종 = 유도값 · 나머지 18종 = 카탈로그', ONALL.g.filter(([id]) => inT.has(id)).map(([id, g]) => `${id} ${g}`).join(' · '));
  ok(ONALL.g.filter(([id]) => inT.has(id)).every(([id, g]) => g !== CATALOG[id].growDays), '⑥ 표 16종은 전부 카탈로그와 다르다(고친 작물 16)');
  ok(ONALL.pay === ONALL.g.find(([id]) => id === 'rice')[1], '⑥ 클라 페이로드도 같은 수(벼)', ONALL.pay);
}

// ── ⑦ 달력 끔 ───────────────────────────────────────────────────────────────────────────
console.log('\n⑦ 달력 끔(T570_CALENDAR=0) + 켬(기본) ⇒ 갈래 꺼짐');
{
  const r = child({ T570_CALENDAR: '0' }, `C.IDS.map(id=>[id,C.growDaysOf(id),C.calDaysOf(id)])`);
  ok(r.every(([id, g, c]) => g === CATALOG[id].growDays && c === null), '★⑦ 날짜가 뜻이 없는 판에서는 34종 카탈로그 그대로 · 유도 null');
}

// ── ⑧ 재민 문장 ─────────────────────────────────────────────────────────────────────────
console.log('\n⑧ 재민 문장 — "벼 10월 · 보리·밀은 겨울을 나서 5~6월"');
{
  const Q = `['rice','barley','wheat','garlic'].map(id=>{const p=id==='rice'?Cal.dayOf(1,6,1):Cal.dayOf(1,10,1);const r=C.readyDay(id,p);const t=Cal.dateOf(r);return [id,t.month,t.dom];})`;
  const on = child({}, Q), off = child({ T594_CROP_CAL: '0' }, Q);   // ★[T634] 켬 = 기본 · 끔 = `0`
  const m = (a, id) => a.find((x) => x[0] === id);
  ok(m(on, 'rice')[1] === 10, '★★⑧ 켬(기본): 벼 6월 1일 심기 → 10월에 익는다', `${m(on, 'rice')[1]}/${m(on, 'rice')[2]}`);
  ok(m(off, 'rice')[1] === 8, '⑧ 끔(`0` · 통제군): 같은 벼가 8월에 익는다', `${m(off, 'rice')[1]}/${m(off, 'rice')[2]}`);
  ok([5, 6].includes(m(on, 'barley')[1]) && [5, 6].includes(m(on, 'wheat')[1]), '★⑧ 켬: 보리·밀 10월 1일 심기 → 5~6월', `보리 ${m(on, 'barley')[1]}/${m(on, 'barley')[2]} · 밀 ${m(on, 'wheat')[1]}/${m(on, 'wheat')[2]}`);
  ok(m(off, 'barley')[1] === 5 && m(off, 'wheat')[1] === 5, '⑧ 끔도 보리·밀은 이미 5월(T99 춘화 — T583 표의 12월은 춘화를 안 센 식)', `보리 ${m(off, 'barley')[1]}/${m(off, 'barley')[2]} · 밀 ${m(off, 'wheat')[1]}/${m(off, 'wheat')[2]}`);
  ok(m(on, 'wheat')[1] === 6 && m(on, 'wheat')[2] >= 5 && m(on, 'wheat')[2] <= 20, '⑧ 켬: 밀은 원문 수확창(6.5~6.20) 안', `${m(on, 'wheat')[1]}/${m(on, 'wheat')[2]}`);
}

// ── ⑨ 랩 거울 ───────────────────────────────────────────────────────────────────────────
console.log('\n⑨ 랩 두 벌 — 구운 블록 = 정본 · 기본 켬 · 같은 날 익는다 · 끔 = 랩 그대로');
{
  let chk = 0;
  try { execFileSync(process.execPath, [path.join(ROOT, 'scripts', 't594-lab-cropcal.js'), '--check'], { stdio: 'pipe' }); } catch (e) { chk = e.status || 1; }
  ok(chk === 0, '★⑨ `t594-lab-cropcal.js --check` — 두 랩의 구운 블록이 정본과 같다');
  for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    const H = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const yl = (H.match(/const L_YEAR=365, L_MOSTART=\[[^\]]*\], L_SEASONS=\[[^\]]*\], L_START=\d+;/) || [])[0];   // ★[T641] 계절 표·자리 차(L_START)까지 — 거울이 달력 정본으로 센다
    const a = H.indexOf('// ▼T594-CROPCAL'), b = H.indexOf('// ▲T594-CROPCAL');
    const ci = H.indexOf('const CROPS=['), cj = H.indexOf('];', ci);
    pre(!!yl && a > 0 && b > a && ci > 0, `${path.basename(f)}: 랩 달력 줄 · T594 블록 · CROPS 표를 찾았다`);
    if (!(yl && a > 0 && b > a && ci > 0)) continue;
    const mkL = (blk, loc) => new Function('EconEngine', 'location', `${yl}\n${H.slice(ci, cj + 2)}\n${blk}\nreturn {L_START,CROPS,L_CROPCAL_T,cropGrowAt,get:()=>L_CROPCAL,set:(v)=>{L_CROPCAL=v;}};`)({ Calendar: Cal }, loc);   // 랩이 부르는 달력 = 번들 정본(T641) · location = URL 손잡이(T634)
    const mk = (loc) => mkL(H.slice(a, b), loc);
    const L = mk(undefined);
    // ★[T634] 기본 켬 — URL 없음 = 켬 · `?cropcal=0` = 끔 · 패널 칸이 처음부터 체크(블록 기본과 칸이 같은 말)
    ok(L.get() === true && mk({ search: '' }).get() === true, `★★⑨ ${path.basename(f)}: 랩 손잡이 **기본 켬**(URL 없음 · 빈 URL)`);
    ok(mk({ search: '?cropcal=0' }).get() === false && mk({ search: '?cropcal=1' }).get() === true, `⑨ ${path.basename(f)}: \`?cropcal=0\` = 끔 · \`?cropcal=1\` = 켬(기본과 같다)`);
    const box = (H.match(/<input type="checkbox" id="cropCal"[^>]*>/g) || []);
    ok(box.length === 1 && / checked[ >]/.test(box[0]), `⑨ ${path.basename(f)}: 패널 '작물 철 고증' 칸이 처음부터 체크(기본 켬)`, box.join(''));
    // 끔: 랩 표 그대로
    L.set(false);
    ok(L.CROPS.every((c) => [0, 100, 300].every((d) => L.cropGrowAt(c, d) === c.grow)), `⑨ ${path.basename(f)}: 끔 = 랩 표 grow 그대로(30종)`);
    // 켬: 서버와 같은 날 익는다 — ★[T641] 랩 날 = econ 날 + `L_START`(T599 가 랩 달을 달력 정본으로 옮긴 뒤의 자리 · 랩 `lMonth` 와 같은 셈).
    //   종전 이 줄은 랩 **1월 기점 달력**(`L_MOSTART`)으로 날짜를 견줬다 — 거울도 같은 옛 달력으로 셌으니 **둘이 같이 틀려 통과**했다
    //   (랩 화면·파종 달은 이미 달력 정본이라 켬 판 보리·밀·마늘이 서버보다 61일 일찍 익었다 — T641 이 잡음).
    L.set(true);
    const cmpOn = (LL) => {
      const diffs = [];
      for (const r of ON) {
        const ko = Crops.koOf(r.id), cands = [ko, ko.replace(/\(.*\)/, ''), (/\(([^)]*)\)/.exec(ko) || [])[1]];
        const cr = LL.CROPS.find((c) => cands.includes(c.id)); if (!cr) { diffs.push(r.id + ' 랩 표에 없음'); continue; }
        const p = r.s + LL.L_START;
        const got = fmt(r.s + LL.cropGrowAt(cr, p)), want = fmt(r.rd);
        if (got !== want) diffs.push(`${r.id} 랩 ${got} ≠ 서버 ${want}`);
      }
      return diffs;
    };
    const diffs = cmpOn(L);
    ok(diffs.length === 0, `★⑨ ${path.basename(f)}: 켬 — 16종이 서버와 **같은 날** 익는다(월동 = 그 겨울이 끝난 3월 1일 + 활동일)`, diffs.join(' · '));
    // [자명 통과 금지 · T641] T641 전 옛 거울 줄(랩 1월 기점 달력)을 끼우면 월동 셋이 갈린다 — 위 비교가 실제로 문다
    {
      const OLD = "function cropGrowAt(cr,day){const t=L_CROPCAL&&L_CROPCAL_T[cr.id];if(!t)return cr.grow;if(!t.v)return t.g;const y=Math.floor(day/L_YEAR),doy=day-y*L_YEAR,m3=L_MOSTART[2];return (doy<m3?y*L_YEAR+m3:(y+1)*L_YEAR+m3)-day+t.g;}";
      const blk = H.slice(a, b), mut = blk.replace(/function cropGrowAt\(cr,day\)\{[^\n]*?\}(?=   \/\/)/, OLD);
      let bit = false, d0 = [];
      if (mut !== blk) { const M = mkL(mut); M.set(true); d0 = cmpOn(M); bit = d0.length === 3; }
      ok(bit, `⑨ ${path.basename(f)}: [자명 통과 금지] 옛 줄(1월 기점 달력)을 끼우면 월동 셋이 갈린다`, d0.join(' · '));
    }
    const uses = (H.match(/\(e\.g\|\|e\.crop\.grow\)/g) || []).length, bare = (H.replace(/\(e\.g\|\|e\.crop\.grow\)/g, '').match(/e\.crop\.grow/g) || []).length;
    ok(uses === 6 && bare === 0 && /g:cropGrowAt\(cr,day\)/.test(H), `⑨ ${path.basename(f)}: 상태기 여섯 자리가 밭마다의 성장일(e.g)을 읽고 · 심을 때 한 번 정한다`, `읽기 ${uses} · 맨 grow ${bare}`);
  }
}

// ── ⑩ 돌연변이 ─────────────────────────────────────────────────────────────────────────
console.log('\n⑩ 돌연변이 넷 — 빨강이어야 한다');
{
  const KNOB = "const T594_CROP_CAL = process.env.T594_CROP_CAL !== '0';";   // ★[T634] 기본 켬 줄(정본 글자 그대로 — 바뀌면 MUT_MISS 로 빨강)
  // ⓐ 손잡이를 무시(늘 켬) ⇒ ⑤ 가 빨개진다
  const a = child({ T594_CROP_CAL: '0' }, `C.growDaysOf('rice')`, mutate(CROPS_JS, KNOB, 'const T594_CROP_CAL = true;'));
  ok(a !== CATALOG.rice.growDays, '★★⑩ⓐ 손잡이 무시(늘 켬) ⇒ `0` 판 벼가 카탈로그가 아니다 = ⑤ 에 이빨이 있다', `벼 ${a}`);
  // ⓑ 유도에서 춘화를 뺀다(심은 날부터 센다) ⇒ ④ 월동이 빨개진다
  const b = child({}, `(()=>{const sp=CC.spanOf(CC.rowOf('barley'));return [C.readyDay('barley',sp.sDay),sp.hDay];})()`,
    mutate(CROPS_JS, 'const a = vernalDay(id, sp.sDay), b = sp.hDay;', 'const a = sp.sDay, b = sp.hDay;'));
  ok(b[0] !== b[1], '★★⑩ⓑ 유도에서 춘화를 빼면 ⇒ 보리가 가운데날에 안 익는다 = ④ 에 이빨이 있다', `${fmt(b[0])} ≠ ${fmt(b[1])}`);
  // ⓒ 표 한 칸(벼 수확창)을 9월로 ⇒ ⑧ 이 빨개진다
  const c = child({}, `Cal.dateOf(C.readyDay('rice',Cal.dayOf(1,6,1))).month`,
    mutate(CAL_JS, "harvest: '10월 상순~10월 중순', src: [WS(30697), RICE_HARVEST]", "harvest: '9월 상순~9월 중순', src: [WS(30697), RICE_HARVEST]"));
  ok(c !== 10, '★★⑩ⓒ 표의 벼 수확창을 9월로 바꾸면 ⇒ 벼가 10월에 안 익는다 = ⑧ 에 이빨이 있다', `${c}월`);
  // ⓓ ★[T634] 기본을 끔으로 되돌림(T594 착지 때의 읽기 — `1` 이어야만 켬) ⇒ ⓪ 이 빨개진다
  const d = child({}, `C.T594_CROP_CAL`, mutate(CROPS_JS, KNOB, "const T594_CROP_CAL = process.env.T594_CROP_CAL === '1';"));
  ok(d === false, '★★⑩ⓓ 기본을 끔으로 되돌리면 ⇒ 손잡이 없는 판이 끔 = ⓪ 에 이빨이 있다', `flag ${d}`);
}

// ── ⑪ 랩 밭 겨울 휴면(T648) ─────────────────────────────────────────────────────────────
//   서버 T99 ②(휴면 중 돌봄·품질 정지) · ③(다년생 휴면)을 랩 상태기 세 자리(`cellTask` · `doTask` · 하루 작물 진화)에 —
//   술어는 번들이 싣는 서버 정본 `crops.dormantAt` 그대로(`EconEngine.Crops` · 구운 블록의 `cropDormant` 가 부른다 · 사본 0).
//   랩 조각(상수 줄 · CROPS 표 · 구운 블록 · cropRipe/cellTask/doTask · 하루 작물 진화 줄)을 그 랩 글자 그대로 떠서 브라우저 꼴 번들과 같이 돌린다.
console.log('\n⑪ 랩 밭 겨울 휴면(T648) — 휴면 중 일감 0 · 품질 무변 · 술어 = 번들의 서버 정본');
{
  const vm = require('vm');
  const win = {}, quiet = { log() {}, info() {}, warn() {}, error() {} };
  try { vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8'), { window: win, console: quiet }); } catch (e) { win.err = e.message; }
  const E = win.EconEngine;
  pre(!!(E && E.Crops && E.Calendar), '번들을 브라우저 꼴로(require·__dirname 없이) 실었다 — EconEngine.Crops · Calendar', win.err || '');
  if (E && E.Crops) {
    let n = 0, same = 0;
    for (const id of Crops.IDS) for (let d = 0; d < 1461; d++) { n++; if (E.Crops.dormantAt(id, d) === Crops.dormantAt(id, d)) same++; }
    ok(n > 0 && same === n, '★⑪ⓐ 번들 `EconEngine.Crops.dormantAt` = 서버 `crops.dormantAt`(34종 × econ 날 1,461 · 윤년 하나)', `${same}/${n}`);
  }
  const fnText = (H, sig) => {   // `function <sig>(…){…}` 한 덩이(중괄호 짝 · 글자 그대로)
    const i = H.indexOf(sig); if (i < 0) return null;
    const j = H.indexOf('{', i); let d = 0, k = j;
    for (; k < H.length; k++) { const c = H[k]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) break; } }
    return H.slice(i, k + 1);
  };
  const build = (H, mut) => {   // 랩 조각 → 미시 상태기(그 랩 글자 그대로 · mut 는 [자명 통과 금지] 사본)
    const g = (re) => (H.match(re) || [])[0] || null;
    const parts = [g(/const L_YEAR=365, L_MOSTART=\[[^\]]*\], L_SEASONS=\[[^\]]*\], L_START=\d+;/), g(/const L_TENDOK=[^;\n]*;/), g(/const L_WALK=[^;\n]*;/),
      g(/const L_MAXSK=[^;\n]*;/), g(/const L_SKP=[^;\n]*;/), g(/const L_WEEDNM=\[[^\]]*\];/)];
    const ci = H.indexOf('const CROPS=['), cj = H.indexOf('];', ci), a = H.indexOf('// ▼T594-CROPCAL'), b = H.indexOf('// ▲T594-CROPCAL');
    const ti = H.indexOf('let sp=0;for(const[k,e]of s.crop){'), tj = H.indexOf('s.spoiled=sp;', ti);
    const fns = ['function cropRipe(', 'function cellTask(', 'function doTask('].map((sg) => fnText(H, sg));
    if (parts.some((x) => !x) || ci < 0 || !(b > a && a > 0) || !(tj > ti && ti > 0) || fns.some((x) => !x)) return null;
    let body = `${parts.join('\n')}\n${H.slice(ci, cj + 2)}\n${H.slice(a, b)}\nlet life=null;const V={fert:1};const pkey=(x,y)=>x+','+y,ckey=c=>pkey(c.cx,c.cy);function villageCropFor(){return null;}function lMonth(){return 0;}\n`
      + `${fns.join('\n')}\nfunction tick(s,day){${H.slice(ti, tj)}\nreturn sp;}\n`
      + 'return {L_START,CROPS,cellTask,doTask,tick,cropDormant,cropGrowAt,L_CROPSID,setLife:(x)=>{life=x;},setCal:(v)=>{L_CROPCAL=v;}};';
    if (mut) body = mut(body);
    return new Function('EconEngine', 'location', body)(E, undefined);
  };
  const field = (L, lid, pe, st) => {   // 한 칸을 심는다(econ 날 pe) · 랩 날 = econ 날 + L_START
    const crop = L.CROPS.find((c) => c.id === lid), P = pe + L.L_START;
    const s = { crop: new Map(), food: 0 }, c = { cx: 7, cy: 9 };
    const e = Object.assign({ crop, planted: P, tended: P, watered: P, weeds: 0, pest: 0, q: 1, cx: 7, cy: 9, g: L.cropGrowAt(crop, P) }, st || {});
    s.crop.set('7,9', e); L.setLife(s);
    return { s, c, e, plot: { field: crop.field }, a: { plot: { field: crop.field }, skill: 0, fert: 1, action: '' } };
  };
  const withRand = (v, fn) => { const r0 = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r0; } };
  const OCT1 = Cal.dayOf(1, 10, 1), NOV1 = Cal.dayOf(1, 11, 1), DEC1 = Cal.dayOf(1, 12, 1), JAN10 = Cal.dayOf(2, 1, 10), MAR20 = Cal.dayOf(2, 3, 20);
  // 한 칸의 겨울 하루: 일감 · 수행 · 하루 진화(병충해 주사위 = 0 → 돌면 반드시 붙는다)
  const winterDay = (L, lid, pe, day) => {
    const F = field(L, lid, pe), D = day + L.L_START;
    const t = L.cellTask(F.plot, F.c, D);
    const before = JSON.stringify([F.e.weeds, F.e.watered, F.e.pest, F.e.q, F.e.tended]);
    const did = L.doTask(F.a, F.c, D);
    const afterDo = JSON.stringify([F.e.weeds, F.e.watered, F.e.pest, F.e.q, F.e.tended]);
    const q0 = F.e.q; withRand(0, () => L.tick(F.s, D));
    return { t, did, same: before === afterDo, dq: q0 - F.e.q, pest: F.e.pest };
  };
  for (const f of ['lab/마을실험실.html', 'lab/전쟁실험실.html']) {
    const H = fs.readFileSync(path.join(ROOT, f), 'utf8'), nm = path.basename(f);
    const L = E && build(H);
    pre(!!L, `${nm}: 랩 조각(상수 줄 · CROPS · 구운 블록 · cropRipe/cellTask/doTask · 하루 작물 진화 줄)을 떴다`);
    if (!L) continue;
    // ⓑ 월동(보리 논 · 밀 밭 · 마늘 밭) 겨울 하루 — 일감 0 · 수행 0 · 품질 무변 · 병충해 0
    const W = ['보리', '밀', '마늘'].map((lid) => [lid, winterDay(L, lid, OCT1, JAN10)]);
    ok(W.every(([, r]) => r.t === 0 && r.did === false && r.same && r.dq === 0 && r.pest === 0),
      `★★⑪ⓑ ${nm}: 월동 셋 겨울 하루(10/1 심음 · 1/10) — 일감 0 · 수행 0 · 품질 무변 · 병충해 0(주사위 0 이어도)`, W.map(([l, r]) => `${l} 일감 ${r.t} · 감점 ${r.dq.toFixed(2)} · 병 ${r.pest}`).join(' / '));
    // ⓒ 같은 밭 봄 하루 — 문은 겨울만 막는다(일감이 서고 하루 진화가 돈다)
    const S = ['보리', '밀', '마늘'].map((lid) => [lid, winterDay(L, lid, OCT1, MAR20)]);
    ok(S.every(([, r]) => r.t > 0 && (r.dq > 0 || r.pest === 1)), `⑪ⓒ ${nm}: 같은 밭 봄 하루(3/20) — 일감이 서고 하루 진화가 돈다(문은 겨울만 막는다)`, S.map(([l, r]) => `${l} 일감 ${r.t}`).join(' / '));
    // ⓓ 다년생(부추 · 미나리 · 12/1 심음 — 1/10 엔 아직 안 익었다) 겨울 하루 — 일감 0(T99 ③) · 1년생(상추 11/1 심음)은 겨울에도 돌본다(서버도 휴면 아님)
    //   ⚠익은 칸은 겨울에도 거둔다(서버 `cropTaskOf` 순서 그대로 — 수확 5 가 휴면보다 앞). 랩 다년생은 겨울에도 자라므로(성장 휴면은 이 카드 밖 — 보고 회부)
    //     11/1 에 심으면 1/10 엔 이미 익어 수확 일감이 선다 — 그래서 아직 안 익은 칸으로 잰다.
    const P = ['부추', '미나리'].map((lid) => [lid, winterDay(L, lid, DEC1, JAN10)]), A = winterDay(L, '상추', NOV1, JAN10);
    ok(P.every(([, r]) => r.t === 0 && r.same && r.dq === 0 && r.pest === 0), `★⑪ⓓ ${nm}: 다년생 겨울 하루 — 일감 0 · 품질 무변(서버 T99 ③ — 휴면 축 = 월동 + 다년생)`, P.map(([l, r]) => `${l} 일감 ${r.t}`).join(' / '));
    ok(A.t > 0 && !Crops.dormantAt('lettuce', JAN10), `⑪ⓓ ${nm}: 1년생(상추)은 겨울에도 돌본다 — 서버 dormantAt 도 거짓(술어가 작물을 가른다)`, `상추 일감 ${A.t}`);
    // ⓔ 끔(?cropcal=0) = 랩 종전 — 겨울에도 일감 · 감점(문이 늘 거짓)
    L.setCal(false);
    const O = winterDay(L, '보리', OCT1, JAN10);
    ok(O.t > 0 && (O.dq > 0 || O.pest === 1) && L.cropDormant({ crop: { id: '보리' } }, JAN10 + L.L_START) === false, `⑪ⓔ ${nm}: 끔(?cropcal=0) — 문이 늘 거짓 = 랩 종전(보리 겨울에도 일감 ${O.t})`);
    L.setCal(true);
    // ⓕ 문 = 서버 술어(랩 30종 × econ 날 1,461)
    let n = 0, same = 0; const ex = [];
    for (const [lid, sid] of Object.entries(L.L_CROPSID)) for (let d = 0; d < 1461; d++) {
      n++; const x = L.cropDormant({ crop: { id: lid } }, d + L.L_START), y = Crops.dormantAt(sid, d);
      if (x === y) same++; else if (ex.length < 2) ex.push(`${lid}@${d}`);
    }
    ok(n > 0 && same === n && Object.keys(L.L_CROPSID).length === L.CROPS.length, `★⑪ⓕ ${nm}: 문(cropDormant) = 서버 crops.dormantAt — 랩 ${L.CROPS.length}종 × econ 날 1,461`, `${same}/${n}${ex.length ? ' · ' + ex.join(' ') : ''}`);
    // ⓖ [자명 통과 금지] 이식을 끈 사본(세 자리의 문을 뺀다) ⇒ 겨울 일감이 서고 품질이 깎인다 — ⓑ 가 문다
    const M = build(H, (src) => src.replace('if(cropDormant(e,day))return 0;', '').replace('if(cropDormant(e,day))return false;', '').replace('else if(!cropDormant(e,day)){', 'else{'));
    const MW = M ? winterDay(M, '보리', OCT1, JAN10) : null;
    ok(!!MW && MW.t > 0 && (MW.dq > 0 || MW.pest === 1), `⑪ⓖ ${nm}: [자명 통과 금지] 세 자리 문을 뺀 사본 — 보리 겨울 일감 ${MW ? MW.t : '?'} · 감점 ${MW ? MW.dq.toFixed(2) : '?'} · 병 ${MW ? MW.pest : '?'} ⇒ ⓑ 가 빨개진다`);
    // ⓗ 세 자리가 문을 실제로 부른다(글자) · 문은 번들 정본을 부른다
    const sites = (H.match(/if\(cropDormant\(e,day\)\)return 0;|if\(cropDormant\(e,day\)\)return false;|else if\(!cropDormant\(e,day\)\)\{/g) || []).length;
    ok(sites === 3 && /function cropDormant\(e,day\)\{[^\n]*EconEngine\.Crops\.dormantAt\(sid,day-L_START\)/.test(H), `⑪ⓗ ${nm}: 상태기 세 자리(cellTask · doTask · 하루 진화)가 문을 부르고 · 문은 번들의 서버 정본을 부른다`, `자리 ${sites}`);
  }
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1179-crop-season.js — 작물 철 손잡이 `T1179_CROP_SEASON` [T1179 · ★재민 11-05] ===
//   잰다: ① 손잡이(끔 기본 · `=1` 켬)
//         ② 고르기 정본 — 작물 정본 `crops.villageCropPick` = 생활층 `_villageCropFor`(옮긴 몸이 같은 답 · 시드 × 달 × 자리 전부)
//         ③ 켬 — 농부 먹을 것이 곳간이 아니라 밭에 선다 · 밭에 든 누계 = 곳간에 든 누계 + 밭에 선 것(새는 것 0)
//         ④ 켬 — 곳간에 드는 날 = 작물이 익는 날뿐(그날 그 작물 `readyDay`) · 겨울(12 ~ 2월)엔 새로 심지 않고 겨울 수확은 가을에 심은 끝물뿐
//         ⑤ 켬 — 두 해에 걸쳐 실제로 거둔다(수확 ≥ 4 · 곳간에 든 것 > 0 — 아래가 자명 통과가 아니다)
//         ⑥ 끔 = 무동작(밭 칸이 안 선다 · 같은 마을 하루가 켬과 갈린다 — 손잡이가 실제로 문다)
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null ? `  ${x}` : '')); };

if (process.env.T1179_CHILD) {
  const E = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
  const C = require(path.join(__dirname, '..', 'server', 'crops'));
  const CAL = require(path.join(__dirname, '..', 'server', 'calendar'));
  const v = E.createVillage({ name: '작물마을', initialPop: 20, fertility: 1.2, arable: 1, game: 0.5, wood: 1, stone: 0.5, ore: 0.1 });
  v.housing = 400; v._mapBeds = 400;
  const days = [], ripeHit = [], badWinter = [], winterSow = [];
  let err = null;
  try {
    for (let d = 0; d < 730; d++) {
      v._world = { day: d };
      const before = v._t1179F ? v._t1179F.s.map((s) => ({ c: s.c, pd: s.pd, rd: s.rd })) : null;
      E.tickVillage(v, d);
      if ((v._t1179InToday || 0) > 0) {
        days.push(d);
        const got = (before || []).filter((s) => s.c && s.rd <= d);
        ripeHit.push(got.length > 0);
        const m = CAL.dateOf(d).month;
        if (m === 12 || m <= 2) for (const s of got) badWinter.push([d, s.c, CAL.dateOf(s.pd).month]);   // 겨울에 든 수확 — 그 작물을 심은 달
      }
      if (v._t1179F) for (const s of v._t1179F.s) if (s.c && s.pd === d) { const m = CAL.dateOf(d).month; if (m === 12 || m <= 2) winterSow.push([d, s.c]); }
    }
  } catch (e) { err = String(e && e.stack || e).slice(0, 400); }
  const F = v._t1179F || null;
  console.log(JSON.stringify({ knob: E.T1179_CROP_SEASON, err, hasF: !!F, acc: F ? F.acc : 0, inTot: F ? F.inTot : 0, stand: E.t1179Standing(v), harv: F ? F.harv : 0,
    days: days.length, ripeAll: ripeHit.every(Boolean), badWinter, winterSow, food: +(v.storage.food || 0).toFixed(6), n: v.npcs.length,
    pick: (() => { const out = []; for (const seed of [0, 1, 7, 42, 1020, 123456789]) for (let mo = 1; mo <= 12; mo++) for (const [f, p] of [['논', 0], ['밭', 0], ['밭', 1]]) out.push(C.villageCropPick(seed, f, mo, p)); return out; })() }));
  process.exit(0);
}

const go = (env) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1179_CHILD: '1' }, env), encoding: 'utf8', maxBuffer: 1 << 25 }).trim().split('\n').pop());
console.log('\n=== T1179 작물 철 하네스 ===\n');
const off = go({ T1179_CROP_SEASON: '' }), on = go({ T1179_CROP_SEASON: '1' });
ok(off.knob === false && on.knob === true, '① 끔 기본 · `=1` 켬', JSON.stringify([off.knob, on.knob]));
// ② 생활층 `_villageCropFor` 와 같은 답(옮긴 몸)
{
  const V = require(path.join(__dirname, '..', 'server', 'villages.js'));
  const F = typeof V.__farmBind === 'function' ? V.__farmBind() : null;
  const vcf = (F && F._villageCropFor) || null;
  let same = 0, tot = 0, diff = null;
  if (vcf) {
    let i = 0;
    for (const seed of [0, 1, 7, 42, 1020, 123456789]) for (let mo = 1; mo <= 12; mo++) for (const [f, p] of [['논', 0], ['밭', 0], ['밭', 1]]) {
      const a = vcf({ dbId: seed }, f, mo, p), b = on.pick[i++]; tot++; if (a === b) same++; else if (!diff) diff = [seed, f, mo, p, a, b];
    }
  }
  ok(vcf && tot === 216 && same === tot, '② 고르기 한 벌 — 생활층 `_villageCropFor` 와 econ 이 부르는 `crops.villageCropPick` 이 같은 답(시드 6 × 달 12 × 자리 3 · 옮기기 전 몸과의 대조는 보고 §0)', vcf ? `${same}/${tot}${diff ? ' · 첫 갈림 ' + JSON.stringify(diff) : ''}` : '생활층 함수를 못 찾음');
}
ok(!on.err && !off.err, '전제 — 마을 두 해가 선다', on.err || off.err || '');
ok(on.hasF && on.acc > 0 && Math.abs(on.acc - (on.inTot + on.stand)) <= 1e-6 * Math.max(1, on.acc), '★③ 켬 — 밭에 든 누계 = 곳간에 든 누계 + 밭에 선 것(새는 것 0)', `든 ${on.acc.toFixed(1)} = 곳간 ${on.inTot.toFixed(1)} + 밭 ${on.stand.toFixed(1)}`);
ok(on.days > 0 && on.ripeAll, '★④ 켬 — 곳간에 드는 날은 작물이 익은 날뿐', `드는 날 ${on.days} · 모두 익은 날 ${on.ripeAll}`);
ok(on.winterSow.length === 0 && on.badWinter.every((x) => x[2] >= 9 && x[2] <= 11), '★④ 켬 — 겨울(12 ~ 2월)엔 새로 심지 않는다 · 겨울에 드는 수확은 가을(9 ~ 11월)에 심은 것의 끝물뿐(달력 · 작물 정본)', `겨울 심기 ${on.winterSow.length} · 겨울 수확 ${JSON.stringify(on.badWinter)}`);
ok(on.harv >= 4 && on.inTot > 0, '⑤ 켬 — 두 해에 실제로 거둔다(아래 위가 자명 통과가 아니다)', `수확 ${on.harv} · 곳간에 든 ${on.inTot.toFixed(1)}`);
ok(!off.hasF && off.stand === 0 && (off.food !== on.food || off.n !== on.n), '⑥ 끔 = 밭 칸이 안 선다 · 같은 마을 하루가 켬과 갈린다(손잡이가 실제로 문다)', `끔 식량 ${off.food} · 사람 ${off.n} ↔ 켬 ${on.food} · ${on.n}`);
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);

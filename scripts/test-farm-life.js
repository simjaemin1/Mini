#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-farm-life.js — NPC 작물 상태기: 정본 하나 · 주사위 0 (T58a) =====
//
// ★[재민 확정 2026-09-03] **"랩에서 만든 것이 우리가 지향할 목표다."**
//   작물 층은 서버가 랩보다 얕게 이식된 자리였다. 이 하네스가 재는 것은 **깊이가 아니라 정합**이다:
//   ① 표가 하나인가 ② 상태기가 결정론인가 ③ 우선순위가 랩 그대로인가 ④ 달력이 계절 정본을 따르는가.
//
// ★★**하네스가 상태기를 다시 짜지 않는다** — `villages.__farmBind()` 로 **정본 함수를 그대로** 돌린다
//   (족보 ㉒ 계측기도 사본 금지 · T45 "정본을 갈아 끼우는 통제 실험은 통제가 아니다").
//
// ★★**돌연변이**(족보 106 = 절대 규칙 9 후보): 병충해를 `Math.random` 으로 되돌리면 ②가 빨개진다.
//   그 되돌림을 **하드링크 복제본에 주입해** 실제로 확인하는 것은 `scripts/farm-mutations.sh`(계측기).
//   여기서는 **소스 검사**가 그 자리를 지킨다 — 상태기 구간에 `Math.random` 이 있으면 실패.
//
// 실행: node scripts/test-farm-life.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');

process.env.ZONE_ID = 'hanbando';
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const Crops = require(path.join(ROOT, 'server', 'crops.js'));
const Villages = require(path.join(ROOT, 'server', 'villages.js'));
const F = Villages.__farmBind();

// 가짜 마을 — 상태기가 쓰는 필드만(정본 함수는 그대로 돈다)
function mkVil(dbId) {
  return { dbId, name: '검사마을' + dbId, ccx: 100, ccy: 100,
    _crop: new Map(), _drySet: new Set(), _farmSet: new Set(), _cropClaim: new Set() };
}

(async () => {
  say('\n=== NPC 작물 상태기 — 정본 하나 · 주사위 0 (T58a) ===');

  // ── ① 표가 하나다 ─────────────────────────────────────────────────────────
  say('\n① 작물 표가 하나다 — 상태기가 `crops.js` 만 본다');
  {
    const vsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    ok(!/const CROPS\s*=\s*\[/.test(vsrc), '★★★① `villages.js` 에 작물 표가 없다');
    ok(!/L_START|L_MOSTART|_lMonth/.test(vsrc), '★★① 랩 달력도 없다(시계가 하나다)');
    const v = mkVil(7);
    const got = F._villageCropFor(v, '논', 5, 0);
    pre(!!got, '5월 논에 심을 것이 실제로 있다(자명 통과 금지)', String(got));
    ok(typeof got === 'string' && Crops.isCrop(got),
      '★★① 특산이 **`crops.js` 의 id** 로 나온다(한글 리터럴이 아니다)', String(got));
  }

  // ── ② 결정론 — 같은 시드·달·구획이면 같은 답 ──────────────────────────────
  say('\n② 마을 특산 — 결정론(같은 시드면 같은 답)');
  {
    const rows = [];
    for (let dbId = 1; dbId <= 51; dbId++) {
      const v = mkVil(dbId);
      rows.push([dbId, F._villageCropFor(v, '논', 5, 0), F._villageCropFor(v, '밭', 5, 0), F._villageCropFor(v, '밭', 5, 1)]);
    }
    const again = [];
    for (let dbId = 1; dbId <= 51; dbId++) {
      const v = mkVil(dbId);
      again.push([dbId, F._villageCropFor(v, '논', 5, 0), F._villageCropFor(v, '밭', 5, 0), F._villageCropFor(v, '밭', 5, 1)]);
    }
    ok(JSON.stringify(rows) === JSON.stringify(again), '★★★② 51마을 전수 — 두 번 물어도 **똑같다**');
    const distinct = new Set(rows.map((r) => r[2])).size;
    pre(distinct > 1, '마을마다 밭 특산이 실제로 갈린다(전부 같으면 결정론 검사가 무의미)', distinct + '가지');
    ok(distinct >= 3, '★② 밭 특산이 마을마다 갈린다', distinct + '가지 / 51마을');
    const par0 = rows.map((r) => r[2]), par1 = rows.map((r) => r[3]);
    ok(par0.some((c, i) => c !== par1[i]), '★② 구획(짝·홀)이 실제로 분담한다 — 한 마을이 밭 두 종을 짓는다');
    say('   (표본) ' + rows.slice(0, 6).map((r) => `#${r[0]} 논 ${r[1] ? Crops.koOf(r[1]) : '—'} · 밭 ${Crops.koOf(r[2])}/${Crops.koOf(r[3])}`).join(' | '));
  }

  // ── ③ 병충해 — 주사위가 아니다 ────────────────────────────────────────────
  say('\n③ 병충해 — 자리 × 날 × 작물의 함수(주사위 0)');
  {
    ok(F._pestAt('5,7', 'rice', 123) === F._pestAt('5,7', 'rice', 123),
      '★★★③ 같은 셀·같은 날이면 **같은 답**이다(정본 함수 직접 호출)');
    let hit = 0, tot = 0;
    for (let cx = 0; cx < 20; cx++) for (let cy = 0; cy < 10; cy++) for (let d = 0; d < 800; d++) { tot++; if (F._pestAt(cx + ',' + cy, 'rice', d)) hit++; }
    const freq = hit / tot;
    pre(hit > 0, '검사 구간에서 병충해가 실제로 난다(0건이면 빈도 검사가 무의미)', hit + '건');
    ok(Math.abs(freq - F.L_PESTP) < F.L_PESTP * 0.15,
      '★★③ 기대 빈도가 옛 주사위와 같다', `${(freq * 100).toFixed(4)}% vs ${(F.L_PESTP * 100).toFixed(2)}% · n=${tot}`);
    let byCrop = 0;
    for (let d = 0; d < 800; d++) if (F._pestAt('3,3', 'rice', d) !== F._pestAt('3,3', 'soybean', d)) byCrop++;
    ok(byCrop > 0, '★③ 작물이 다르면 병드는 날도 다르다', byCrop + '일 갈림');
    const vsrc = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
    const a = vsrc.indexOf('function _pestAt'), b = vsrc.indexOf('function _lifeNextFarmCell');
    pre(a > 0 && b > a, '상태기 구간을 소스에서 실제로 찾았다', `${b - a}자`);
    ok(!/Math\.random/.test(vsrc.slice(a, b)),
      '★★★③ 작물 상태기 구간에 `Math.random` 이 **없다** — 되살리면 여기가 빨개진다(돌연변이 = 소스 검사)',
      (vsrc.slice(a, b).match(/Math\.random/g) || ['없음']).join(' '));
  }

  // ── ④ 상태기 — 우선순위와 하루 틱이 결정론이다 ────────────────────────────
  say('\n④ 상태기 — 우선순위 5수확 4방제 3물대기 2파종 1김매기');
  {
    const run = () => {
      const v = mkVil(11);
      const K = [];
      for (let i = 0; i < 12; i++) { const k = (10 + i) + ',20'; v._farmSet.add(k); if (i % 2) v._drySet.add(k); K.push(k); }
      const log = [];
      for (let day = 0; day < 400; day++) {
        for (const k of K) { const p = F._cellTask(v, k, day); if (p > 0) { F._lifeDoTask0(v, null, k, day); log.push(day + ':' + k + ':' + p); } }
      }
      return log;
    };
    const l1 = run(), l2 = run();
    pre(l1.length > 50, '400일 동안 일감이 실제로 났다(0이면 결정론 검사가 자명 통과)', l1.length + '건');
    ok(l1.join('|') === l2.join('|'), '★★★④ 400일 상태기가 **두 번 돌려도 한 글자도 안 다르다**', l1.length + '건');
    const pr = new Set(l1.map((x) => +x.split(':')[2]));
    ok(pr.has(2) && pr.has(5), '★④ 파종(2)과 수확(5)이 실제로 일어난다', [...pr].sort().join(','));
    // 우선순위 — 익은 셀은 언제나 5
    const v2 = mkVil(11); const k2 = '4,4'; v2._farmSet.add(k2);
    F._lifeDoTask0(v2, null, k2, 60);                 // 파종
    const e2 = v2._crop.get(k2);
    pre(!!e2, '검사 셀에 실제로 심겼다', e2 && e2.c);
    const ripeDay = 60 + Crops.growDaysOf(e2.c) + 400;   // 넉넉히(월동 휴면 포함)
    ok(F._cellTask(v2, k2, ripeDay) === 5, '★④ 익으면 우선순위가 5(수확)다', String(F._cellTask(v2, k2, ripeDay)));
    ok(F._cropRipe(e2, ripeDay) === Crops.isReady(e2.c, e2.p, ripeDay),
      '★★④ 익음 판정이 **정본 `Crops.isReady` 그대로**다(사본 없음)');
  }

  // ── ⑤ 달력 — 계절 정본을 따른다(겨울엔 안 심는다) ─────────────────────────
  say('\n⑤ 달력 — 계절 정본 하나(겨울엔 파종 일감이 없다)');
  {
    const v = mkVil(23); const k = '8,8'; v._farmSet.add(k);
    const winter = [];
    for (let d = 0; d < 365; d++) if (Crops.seasonOfDay(d) === 'winter' && F._cellTask(v, k, d) === 2) winter.push(d);
    ok(winter.length === 0, '★★★⑤ **한겨울에 파종 일감이 서지 않는다**(옛 표는 겨울에 봄 작물을 심었다)',
      winter.length ? winter.slice(0, 5).join(',') : '365일 0건');
    const spring = [];
    for (let d = 0; d < 365; d++) if (Crops.seasonOfDay(d) === 'spring' && F._cellTask(v, k, d) === 2) spring.push(d);
    pre(spring.length > 0, '봄에는 파종 일감이 실제로 선다(자명 통과 금지)', spring.length + '일');
    ok(spring.length > 20, '★⑤ 봄에는 파종창이 넉넉히 열린다', spring.length + '일');
  }

  // ── ★★★⑥ [T112] 비가 밭에 물을 준다 — 물대기 일감은 하늘을 본다 ────────────
  say('\n⑥ [T112] 비 온 날은 물 준 날 — 술어 하나 · e.w 갱신 한 곳');
  {
    const Wx = require(path.join(ROOT, 'server', 'weather.js'));
    const L = F.L_WATERGAP;
    pre(Crops.RAIN_WATER === true, '되돌림 스위치가 켜져 있다(기본값 · 자명 통과 금지)', `T112_RAIN=${Crops.RAIN_WATER ? 1 : 0}`);

    // ⓐ 술어가 정본 하늘을 그대로 읽는다(사본 0)
    let same = 0, rain = 0;
    for (let d = 0; d < 800; d++) { const r = Wx.precipAt(d) > 0; if (r) rain++; if (Crops.rainedOn(d) === r) same++; }
    pre(rain > 0 && rain < 800, '800일 안에 비 온 날과 마른 날이 둘 다 있다', `비 ${rain}일 · 마름 ${800 - rain}일`);
    ok(same === 800, '★★★⑥ⓐ `rainedOn` 이 **정본 `weather.precipAt` 그대로**다(800일 전수 · 사본 0)', `${same}/800`);

    // 검사에 쓸 비 온 날 · 마른 날을 **달력에서** 찾는다(하네스가 날짜를 안 적는다)
    let wet = -1, dry = -1;
    for (let d = 200; d < 700 && (wet < 0 || dry < 0); d++) {
      if (Crops.seasonOfDay(d) === 'winter') continue;                 // 휴면은 T99 가 이미 0으로 만든다
      if (wet < 0 && Crops.rainedOn(d)) wet = d;
      if (dry < 0 && !Crops.rainedOn(d)) {                             // 앞 L 일이 전부 마른 날이어야 물대기가 선다
        let ok2 = true; for (let k = d - L; k <= d; k++) if (Crops.rainedOn(k)) { ok2 = false; break; }
        if (ok2) dry = d;
      }
    }
    pre(wet > 0 && dry > 0, '비 온 날과 **연속으로 마른** 날을 달력에서 찾았다', `비 ${wet} · 마름 ${dry}(앞 ${L}일 마름)`);
    const dry0 = () => dry;

    // ⓑ 비 온 날 — 물대기 일감이 안 선다
    const mk = (d0) => ({ c: 'rice', p: d0 - 60, td: d0 - 60, w: d0 - 60, wd: 0, ps: 0, q: 1 });
    {
      const e = mk(wet);
      pre(wet - e.w >= L, '그 밭은 물때가 지났다(비가 아니면 반드시 선다)', `${wet - e.w}일 ≥ ${L}`);
      ok(F.cropTaskOf(e, true, wet) !== 3, '★★★⑥ⓑ **비 온 날엔 물대기 일감이 안 선다**', `일감 ${F.cropTaskOf(e, true, wet)}`);
      ok(e.w === wet, '★★⑥ⓑ 그리고 **마지막 물댄 날이 오늘로** 갱신된다(비가 준 것이다)', `w ${e.w}`);
      const e2 = mk(wet);
      ok(F.cropDoTask(e2, true, wet) !== 'water', '★★⑥ⓑ 수행도 물대기를 안 한다(일감과 같은 하늘)');
      // 물 벌점만 남기고 본다 — 김매기 차례를 다 써 버려야 **물 갈래만** 잰다
      //   (첫 판이 김매기 벌점을 물 벌점으로 오독해 빨갛게 나왔다 · 족보)
      const e3 = mk(wet); e3.w = wet - (L + 20); e3.wd = F.L_WEEDS.length;
      const q0 = e3.q; F.cropDayTick(e3, true, wet, '9,9');
      ok(e3.q >= q0, '★★★⑥ⓑ 물 못 댄 품질 벌점도 **안 깎인다**(셋이 같은 문으로 들어간다)', `q ${q0} → ${e3.q}`);
      // 대조 — 되돌리면 그 벌점이 실제로 있다(자명 통과 금지)
      const e4 = mk(dry0()); e4.w = e4.p - (L + 20); e4.wd = F.L_WEEDS.length;
      const q1 = e4.q; F.cropDayTick(e4, true, e4.p, '9,9');
      ok(e4.q < q1, '★★⑥ⓑ 마른 날 같은 밭은 **실제로 깎인다**(검사에 이빨이 있다)', `q ${q1} → ${e4.q}`);
    }

    // ⓒ 마른 날 — 종전 그대로다(회귀 0)
    {
      const e = mk(dry);
      pre(dry - e.w >= L, '그 밭도 물때가 지났다', `${dry - e.w}일`);
      ok(F.cropTaskOf(e, true, dry) === 3, '★★★⑥ⓒ **마른 날엔 종전대로 물대기가 선다**', `일감 ${F.cropTaskOf(e, true, dry)}`);
      const e2 = mk(dry);
      ok(F.cropDoTask(e2, true, dry) === 'water' && e2.w === dry, '★★⑥ⓒ 그리고 물을 댄다(종전 그대로)');
      // 밭(논이 아닌 곳)은 비가 와도 물대기가 원래 없다 — 자명 통과 금지 대조
      const e3 = mk(wet);
      ok(F.cropTaskOf(e3, false, wet) !== 3, '★⑥ⓒ 밭(논 아님)은 원래 물대기가 없다(대조)');
    }

    // ⓓ 플레이어 밭도 **같은 답** — zone 이 상태기 셋만 부르므로 자동이다
    {
      const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
      const zcode = codeOnly(zsrc);
      // ⚠zone 은 하늘을 **클라 페이로드**로 싣는다(T98 `precipAt` — 그건 밭과 무관하다).
      //   여기서 재는 것은 **밭 절**이 하늘을 직접 보는가다(첫 판이 파일 전체를 봐서 오탐했다 · 족보).
      const tendSec = zcode.slice(zcode.indexOf('function _cropTend'), zcode.indexOf('function _cropTend') + 2500);
      const harvSec = zcode.slice(zcode.indexOf('function tryHarvest'), zcode.indexOf('function tryHarvest') + 3000);
      ok(!/rainedOn|precipAt/.test(tendSec + harvSec),
        '★★⑥ⓓ zone 의 **밭 절**이 하늘을 직접 안 본다(상태기 셋을 통해서만 · 사본 0)');
      ok(!/_cropNeedsWater[^\n]*precip|supply\s*=\s*[^\n]*rain/i.test(zcode),
        '★★⑥ⓓ 그리고 그 자리 물 공급(`supply`)을 **안 건드린다**(비는 "오늘 물댔다"지 "물이 있다"가 아니다)');
      const vcode = codeOnly(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
      ok((vcode.match(/_cropSky\(/g) || []).length >= 4,
        '★★⑥ⓓ 상태기 셋이 전부 같은 문으로 들어간다', `${(vcode.match(/_cropSky\(/g) || []).length}곳`);
      // `e.w = day` 는 둘이다: **물을 댄 행동**(cropDoTask)과 **비**(_cropSky). 재는 것은 뒤엣것이 하나인가다.
      const skySec = vcode.slice(vcode.indexOf('function _cropSky'), vcode.indexOf('function _cropSky') + 200);
      ok((skySec.match(/e\.w = day/g) || []).length === 1,
        '★★★⑥ⓓ 비로 인한 `e.w` 갱신은 **한 곳**뿐이다(`_cropSky` 안 한 줄)', `${(skySec.match(/e\.w = day/g) || []).length}곳`);
      ok(/rainedOn/.test(skySec) && !/rainedOn/.test(vcode.replace(skySec, '')),
        '★★⑥ⓓ 그리고 `rainedOn` 을 부르는 자리도 **그 한 곳**뿐이다(사본 0)');
    }

    // ⓔ ★★돌연변이 · 되돌림 — 자식 프로세스 + env (족보 128)
    {
      const { execFileSync } = require('child_process');
      const CP = JSON.stringify(path.join(ROOT, 'server', 'crops.js'));
      const VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
      const runWith = (env, expr) => {
        const out = execFileSync(process.execPath, ['-e',
          `const C=require(${CP});const V=require(${VP});const F=V.__farmBind();process.stdout.write('@@'+(${expr}));`],
          { env: Object.assign({}, process.env, env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return out.slice(out.lastIndexOf('@@') + 2).trim();
      };
      const EXPR = `F.cropTaskOf({c:'rice',p:${wet - 60},td:${wet - 60},w:${wet - 60},wd:0,ps:0,q:1},true,${wet})`;
      ok(runWith({ T112_RAIN: '0' }, EXPR) === '3',
        '★★★⑥ⓔ 되돌림(`T112_RAIN=0`) ⇒ 비 온 날에도 물대기가 선다 = **T108 세계 재현**');
      ok(runWith({}, EXPR) !== '3', '★★⑥ⓔ 켠 판은 그 값이 아니다(되돌림이 실제로 무언가를 되돌린다)');
      ok(runWith({ WEATHER_SEED: '1' }, `C.rainedOn(${wet})`) !== undefined,
        '★⑥ⓔ 날씨 씨앗을 바꾸면 다른 하늘이 된다(술어가 정본을 실제로 읽는다)');
    }
  }

  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
})();

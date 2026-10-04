#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T634 붕괴 셋 ⓒ · 제품 무변)
// === scripts/t634-player-harvest.js — 플레이어 밭 하나: 심고 첫 수확까지 게임 날 · 실제 분 — 끔 ↔ 켬 =====================
//   정본 길 그대로(사본 0):
//     · 씨앗 = 덤불 야생 채종 `crops.wildSeedAt(cx, cy, day)` — 그 철 `sowableIn(season)` 에서 자리 해시로 하나(주사위 0)
//       ⇒ 갓 들어온 플레이어가 그 철에 손에 쥘 수 있는 씨앗 = 그 철 풀 전체(어느 덤불이냐에 따라 하나)
//     · 심기 = `zone.js doPlant` 의 문 — `canSowOn(id, today)`(철) · 익음 = `isReady`/`readyDay`(활동일 · T99 휴면·춘화)
//     · 실제 분 = 게임일 × `zone-config WORLD.dayLengthMs`(정본 하루 24분)
//   심는 날 = 새 세계 0일(1년 3월 1일 — 봄 첫날) · 여름 첫날 · 가을 첫날(겨울은 아무것도 못 심는다) + 한 해 아무 날 평균.
//   값은 자식 node 로 정본을 통째로 다시 실어 얻는다(끔 = `T594_CROP_CAL=0` · 켬 = 기본 env — 손잡이는 로드 때 한 번 읽힌다).
//   쓰는 법: node scripts/t634-player-harvest.js [--json]
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

const CODE = `
const path=require('path');const R=(p)=>require(path.join(${JSON.stringify(ROOT)},p));
const C=R('server/crops'),Cal=R('server/calendar'),W=R('server/zone-config').WORLD;
const days=[];const KO={spring:'봄',summer:'여름',autumn:'가을',winter:'겨울'};
const firstOf=(s)=>{for(let d=0;d<365;d++)if(C.seasonOfDay(d)===s)return d;return null;};
const at=(p)=>{const pool=C.sowableIn(C.seasonOfDay(p));return pool.filter(id=>C.canSowOn(id,p)).map(id=>{const r=C.readyDay(id,p);return [id,C.koOf(id),r==null?null:r-p];});};
const rows=['spring','summer','autumn'].map(s=>{const p=firstOf(s);return {season:KO[s],day:p,date:Cal.dateOf(p),crops:at(p)};});
const year=[];for(let p=0;p<365;p++){const c=at(p).map(x=>x[2]).filter(x=>x!=null);if(c.length)year.push([p,Math.min(...c),c.reduce((a,b)=>a+b,0)/c.length]);}
let chk=0,bad=0;for(const id of C.IDS)for(let p=0;p<365;p++){if(!C.canSowOn(id,p))continue;const r=C.readyDay(id,p);chk++;if(r==null||C.isReady(id,p,r-1)||!C.isReady(id,p,r))bad++;}
process.stdout.write('@@'+JSON.stringify({flag:C.T594_CROP_CAL,dayMin:W.dayLengthMs/60000,rows,year,chk,bad}));`;
function arm(env) {
  const e = Object.assign({}, process.env); delete e.T594_CROP_CAL;
  const out = execFileSync(process.execPath, ['-e', CODE], { env: Object.assign(e, env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out.slice(out.lastIndexOf('@@') + 2));
}
const OFF = arm({ T594_CROP_CAL: '0' }), ON = arm({});
if (OFF.flag !== false || ON.flag !== true) { console.error('손잡이 상황이 틀렸다', OFF.flag, ON.flag); process.exit(1); }
const M = ON.dayMin;   // 정본 하루(분)
const med = (a) => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const hm = (d) => { if (d == null) return '—'; const m = Math.round(d * M); return m >= 60 ? `${m}분(${(m / 60).toFixed(m % 60 ? 1 : 0)}시간)` : `${m}분`; };
const out = { dayMin: M, seasons: [], year: null };
if (!process.argv.includes('--json')) {
  console.log(`\n=== T634 ⓒ 플레이어 밭 하나 — 심고 첫 수확까지(게임 날 · 실제 분 · 정본 하루 ${M}분) — 끔(T594_CROP_CAL=0) ↔ 켬(기본) ===`);
  // 표의 날 = 플레이어 수확 문(`zone.js tryHarvest` 의 `Crops.isReady`)이 처음 참인 날인가 — 심을 수 있는 (작물 · 날) 쌍 전부
  console.log(`  정합: readyDay = 수확 문(isReady) 첫 날 — 끔 ${OFF.chk}쌍 어긋남 ${OFF.bad} · 켬 ${ON.chk}쌍 어긋남 ${ON.bad}`);
  if (OFF.bad || ON.bad) process.exitCode = 1;
}
for (let i = 0; i < ON.rows.length; i++) {
  const a = OFF.rows[i], b = ON.rows[i];
  const da = a.crops.map((x) => x[2]).filter((x) => x != null), db = b.crops.map((x) => x[2]).filter((x) => x != null);
  const fa = a.crops.filter((x) => x[2] === Math.min(...da)).map((x) => x[1]), fb = b.crops.filter((x) => x[2] === Math.min(...db)).map((x) => x[1]);
  const S = { season: b.season, day: b.day, date: `${b.date.month}/${b.date.dom}`, n: b.crops.length,
    off: { min: Math.min(...da), minBy: fa, med: med(da), mean: +mean(da).toFixed(1) }, on: { min: Math.min(...db), minBy: fb, med: med(db), mean: +mean(db).toFixed(1) },
    crops: b.crops.map((x, k) => ({ id: x[0], ko: x[1], off: a.crops[k][2], on: x[2] })) };
  out.seasons.push(S);
  if (process.argv.includes('--json')) continue;
  console.log(`\n■ ${S.season} 첫날(게임일 ${S.day} · ${S.date}) — 그 철 씨앗 풀 ${S.n}종`);
  console.log(`  가장 빠른 첫 수확: 끔 ${S.off.min}일 ${hm(S.off.min)} (${fa.join('·')}) → 켬 ${S.on.min}일 ${hm(S.on.min)} (${fb.join('·')})`);
  console.log(`  풀 가운데: 끔 ${S.off.med}일 ${hm(S.off.med)} → 켬 ${S.on.med}일 ${hm(S.on.med)} · 풀 평균(덤불 하나에서 아무 씨앗): 끔 ${S.off.mean}일 → 켬 ${S.on.mean}일`);
  console.log('  | 작물 | 끔 | 켬 | 바뀜 |');
  console.log('  |---|---|---|---|');
  for (const c of S.crops) console.log(`  | ${c.ko} | ${c.off}일 · ${hm(c.off)} | ${c.on}일 · ${hm(c.on)} | ${c.on === c.off ? '' : (c.on > c.off ? '+' : '') + (c.on - c.off)} |`);
}
const ya = OFF.year, yb = ON.year;
out.year = { days: yb.length, off: { min: +mean(ya.map((x) => x[1])).toFixed(1), pool: +mean(ya.map((x) => x[2])).toFixed(1) }, on: { min: +mean(yb.map((x) => x[1])).toFixed(1), pool: +mean(yb.map((x) => x[2])).toFixed(1) } };
if (process.argv.includes('--json')) { process.stdout.write(JSON.stringify(out)); process.exit(0); }
console.log(`\n■ 한 해 아무 날(심을 수 있는 ${yb.length}일 — 겨울 제외)에 들어온 플레이어 평균`);
console.log(`  그 철 가장 빠른 씨앗: 끔 ${out.year.off.min}일 ${hm(out.year.off.min)} → 켬 ${out.year.on.min}일 ${hm(out.year.on.min)}`);
console.log(`  덤불 하나에서 아무 씨앗(풀 평균): 끔 ${out.year.off.pool}일 ${hm(out.year.off.pool)} → 켬 ${out.year.on.pool}일 ${hm(out.year.on.pool)}`);

#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1187-names.js — 마을 이름: 한반도는 한국식 · 닛폰은 일본식 · 근처 지형 이름 · 이름이 경제를 바꾸지 않게 [T1187 · ★재민 11-05] ===
//   잰다(손잡이는 모듈 상수라 팔마다 아이 프로세스):
//   ① 손잡이 둘 — `T1187_NAMES`(시딩 이름) · `T1187_NAME_FREE`(이름 해시 끊기) 끔 기본 · `'1'` 만 켬
//   ② 이름 규칙(`server/village-names.js` 정본) — 한반도 51 · 닛폰 50 · 겹침 0 · 지형 이름과 같음 0 · 옛 이름 남음 0 · 한반도 이름은 한글만 ·
//      줄기는 근처 지형 이름에서(그 나라 꼴만 — 닛폰 절의 한국어 이름 · 숫자 · 나라 이름 줄기 0) · 결정론 · 자리 규칙(후보를 옮기면 그 자리로 다시 짓는다)
//   ③ 이름과 경제 — 켬: 이름만 다른 두 마을의 동원 목표 · 주석 부존 · 도적 보호기 끝 날이 같다 · 호전 = 묵은 원한(`_grudgeMax ≥ war-core WAR_FEUD_TH`)
//      미끼: 끔이면 이름만 바꿔도 셋이 갈린다(이 자가 잡는다)
//   ④ 정적 — 다리 후보 찾기가 후보 이름(`_seedName`)으로도 찾는다 · 시딩 켬 = 홀 데이터에 `seedName`
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? `  ${x}` : '')); };
const child = (env, code) => {
  const e = Object.assign({}, process.env, { ENABLE_VILLAGES: '0' }); delete e.T1187_NAMES; delete e.T1187_NAME_FREE; Object.assign(e, env);
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { env: e, cwd: ROOT, encoding: 'utf8' }).trim().split('\n').pop());
};

console.log('① 손잡이');
const K = (v) => child(v == null ? {} : { T1187_NAMES: v, T1187_NAME_FREE: v }, `const fs=require('fs');const V=fs.readFileSync('server/villages.js','utf8');
  console.log(JSON.stringify({ names: /const T1187_NAMES = process\\.env\\.T1187_NAMES === '1';/.test(V), econ: require('./sim/economy-sim.js') && true }))`);
ok(K(null).names, "시딩 이름 손잡이 글자는 `=== '1'` 하나(끔 기본)", '');
const ES = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8'), BS = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8');
ok(/const T1187_NAME_FREE = \(typeof process !== 'undefined' && !!process\.env && process\.env\.T1187_NAME_FREE === '1'\);/.test(ES)
  && /const T1187_NAME_FREE = process\.env\.T1187_NAME_FREE === '1';/.test(BS), "이름 끊기 손잡이 글자는 econ · 도적 둘 다 `=== '1'` 하나(끔 기본)", '');

console.log('② 이름 규칙');
const N = require(path.join(ROOT, 'server', 'village-names.js'));
const TJ = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'hanbando-terrain.json'), 'utf8'));
const V0 = (() => { process.env.ENABLE_VILLAGES = '0'; return require(path.join(ROOT, 'server', 'villages.js')); })();
const SCAN = V0.LAND_SCAN_R;
ok(SCAN === 140, '[상황] 자원권 반경 = villages `LAND_SCAN_R`(내보냄)', String(SCAN));
const Z = {};
for (const z of ['hanbando', 'nippon']) {
  const rows = N.nameZone(z, TJ[z], SCAN), names = rows.map((r) => r.name), feat = new Set();
  for (const k of ['rivers', 'ridges', 'lakes', 'forests', 'valleys', 'passes']) for (const f of (TJ[z][k] || [])) feat.add(f.name);
  const olds = new Set(rows.map((r) => r.old));
  Z[z] = rows;
  ok(rows.length === (TJ[z].villages || []).length && new Set(names).size === names.length, `${z} — 후보 ${rows.length} 모두 이름 · 겹침 0`, `${new Set(names).size}/${names.length}`);
  ok(names.filter((n) => feat.has(n)).length === 0 && names.filter((n) => olds.has(n)).length === 0, `${z} — 지형 이름과 같음 0 · 옛 이름 남음 0`, '');
  ok(rows.every((r) => r.feature && r.stem && String(r.feature).startsWith(r.stem)), `${z} — 이름 줄기는 근처 지형 이름의 머리다(근거 지형 칸이 다 찼다)`, `자원권 안 ${rows.filter((r) => r.inRange).length}`);
  const again = N.nameZone(z, JSON.parse(JSON.stringify(TJ[z])), SCAN).map((r) => r.name);
  ok(JSON.stringify(again) === JSON.stringify(names), `${z} — 결정론(같은 지형 · 같은 후보 = 같은 이름)`, '');
}
ok(Z.hanbando.every((r) => /^[가-힣]+$/.test(r.name)) && Z.hanbando.every((r) => !/닛폰|한반도/.test(r.name)), '한반도 이름은 한글 낱말만 · 나라 이름 줄기 0', '');
const KO_TAIL = new Set(Object.values(N.KO.tail)), JA_TAIL = new Set(Object.values(N.JA.tail));
ok(Z.hanbando.every((r) => !r.tail || KO_TAIL.has(r.tail)) && Z.nippon.every((r) => JA_TAIL.has(r.tail)), '꼬리는 갈래 표의 것만(한반도 말 · 나루 · 골 · 터 / 닛폰 다 · 츠 · 사와 · 오카)', '');
const koFeat = Z.nippon.filter((r) => /(천|산맥|숲|령|호)$/.test(r.feature) && !/^[^천산숲령]+(가와|야마|모리|호)$/.test(r.feature));
ok(koFeat.length === 0, '닛폰 이름은 닛폰 꼴 지형(가와 · 야마 · 모리)에서만 줄기를 딴다(달재천 · 매산맥 · 닭밭호 같은 한국어 지형 0)', koFeat.map((r) => r.feature).join(' · '));
ok(N.stemOf('ja', 'rivers', '아카키요가와', new Set(['아카', '키요', '아카키요'])) === null && N.stemOf('ko', 'rivers', '닛폰대천', new Set()) === null && N.stemOf('ko', 'lakes', '광산6 방죽', new Set()) === null,
  '줄기 거름 — 어근 둘 이은 줄기 · 나라 이름 · 마을을 딴 방죽은 안 쓴다', '');
{ // 자리 규칙 — 후보 하나를 다른 지형 곁으로 옮기면 그 지형 줄기로 다시 짓는다 · 나머지는 겹침이 없으면 그대로
  const zt = JSON.parse(JSON.stringify(TJ.hanbando)), i = 0, f = zt.forests.find((x) => x.name === '덕미수해');
  zt.villages[i] = Object.assign({}, zt.villages[i], { x: f.center[0], y: f.center[1] });
  const a = N.nameZone('hanbando', zt, SCAN), b = Z.hanbando;
  const others = a.filter((r, j) => j !== i && r.name !== b[j].name);
  ok(a[i].stem === '덕미' && a[i].name !== b[i].name, '자리 규칙 — 광산1 후보를 덕미수해 한가운데로 옮기면 덕미 줄기로 다시 짓는다', `${b[i].name} → ${a[i].name}`);
  ok(others.length <= 1, '그 밖의 후보는 그대로(겹침이 생긴 하나만 다음 지형으로)', others.map((r) => r.old + ' ' + r.name).join(' · '));
}

console.log('③ 이름과 경제(아이 프로세스 · 팔마다)');
const ECON = `const E=require('./sim/economy-sim.js');const B=require('./server/bandits.js');
const mk=(name,g)=>({name,_grudgeMax:g,npcs:new Array(100).fill({}),tradeStats:{caravansSent:10,caravansRaided:5,tradersKilled:1}});
const H=(s)=>{let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}h^=h>>>16;h=Math.imul(h,2246822507)>>>0;h^=h>>>13;h=Math.imul(h,3266489909)>>>0;h^=h>>>16;return (h>>>0)/4294967296;};
let hot=null,cold=null;for(let i=0;i<500&&!(hot&&cold);i++){const n='마을'+i;if(H('warlike|'+n)>0.72){if(!hot)hot=n;}else if(!cold)cold=n;}
const wt=[E.warriorTarget(mk(hot,0)),E.warriorTarget(mk(cold,0)),E.warriorTarget(mk(cold,0.5)),E.warriorTarget(mk(hot,0.1))];
const tin=(n)=>E.createVillage({ore:1.4,name:n,initialPop:10}).land.tin;let tA=null,tB=null;for(let i=0;i<300;i++){const a=tin('광맥'+i);if(tA==null)tA=a;else if(a!==tA){tB=a;break;}}
const tinNames=[tin('한울골'),tin('광산1'),tin('너덜골')];
const od=[B.t1187OpenDay({name:'광산1',ccx:100,ccy:200}),B.t1187OpenDay({name:'한울골',ccx:100,ccy:200}),B.t1187OpenDay({name:'광산1',ccx:300,ccy:50})];
const st=(n,x)=>{E.setSeed(1020);const v={name:n,coord:{x,y:200}};E.useVillageStream(v);const r=[E.srand(),E.srand()];E.useVillageStream(null);return r.map(q=>q.toFixed(9)).join(',');};
const strm=[st('광산1',100),st('한울골',100),st('광산1',102.5)];
console.log(JSON.stringify({hot,cold,wt,tinFlip:tB!=null,tinNames,od,strm,feud:require('./sim/war-core.js').WAR_FEUD_TH}));`;
const OFF = child({}, ECON), ON = child({ T1187_NAME_FREE: '1' }, ECON);
ok(OFF.hot && OFF.cold, '[상황] 끔 해시로 호전 이름 · 아닌 이름을 찾았다', `${OFF.hot} · ${OFF.cold}`);
ok(OFF.wt[0] !== OFF.wt[1], '미끼(끔) — 이름만 다른 두 마을의 동원 목표가 갈린다(이름이 경제를 정한다 · 종전)', `${OFF.wt[0]} ↔ ${OFF.wt[1]}`);
ok(ON.wt[0] === ON.wt[1], '켬 — 이름만 다른 두 마을의 동원 목표가 같다(이름 무관)', `${ON.wt[0]} = ${ON.wt[1]}`);
ok(ON.wt[2] > ON.wt[1] && ON.wt[3] === ON.wt[1] && ON.feud > 0, `켬 — 호전 = 묵은 원한: 원한 0.5(≥ ${ON.feud}) 마을만 크게 동원 · 원한 0.1 은 종전 크기`, `원한 0 ${ON.wt[1]} · 0.5 ${ON.wt[2]} · 0.1 ${ON.wt[3]}`);
ok(OFF.tinFlip && ON.tinNames[0] === ON.tinNames[1] && ON.tinNames[1] === ON.tinNames[2] && ON.tinNames[0] > 0, '주석 부존(광종 비율 없는 부름 · 광량 1.4 = 문턱 1.28 을 지터가 넘나드는 자리) — 끔은 이름에 따라 갈리고 · 켬은 이름 무관', `켬 ${ON.tinNames.join(' · ')}`);
ok(OFF.od[0] !== OFF.od[1] && ON.od[0] === ON.od[1] && ON.od[0] !== ON.od[2], '도적 보호기 끝 날 — 끔은 이름으로 · 켬은 마을 자리(같은 자리 = 같은 날 · 다른 자리 = 다른 날)', `끔 ${OFF.od.slice(0, 2).join('/')} · 켬 ${ON.od.join('/')}`);

ok(OFF.strm[0] !== OFF.strm[1] && ON.strm[0] === ON.strm[1] && ON.strm[0] !== ON.strm[2], '마을 주사위 흐름 씨(T731 · T744) — 끔은 이름으로 · 켬은 마을 자리(같은 자리 = 같은 흐름 · 다른 자리 = 다른 흐름)', `켬 ${ON.strm[0].slice(0, 11)} = ${ON.strm[1].slice(0, 11)} ≠ ${ON.strm[2].slice(0, 11)}`);

console.log('④ 정적');
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
ok(/sites\.find\(\(s\) => !s\.done && \(s\.v\.indexOf\(vil\.name\) >= 0 \|\| \(vil\._seedName && s\.v\.indexOf\(vil\._seedName\) >= 0\)\)\)/.test(VS), '다리 후보 찾기 — 이름 또는 후보 이름(`_seedName`)', '');
ok(/_t1187 \? \{ typeLabel: layout\.type, dock: layout\.dock \|\| null, land: lp, seedType: hv\.type, bnd: territoryBoundary\(layout\.territory, c\.ccx, c\.ccy\), seedName: hv\.name \}/.test(VS)
  && /if \(hallData && hallData\.seedName\) state\.villages\[state\.villages\.length - 1\]\._seedName = String\(hallData\.seedName\);/.test(VS), '시딩 켬 = 홀 데이터에 후보 이름 · 부팅이 `_seedName` 으로 되읽는다', '');
ok((ES.match(/_hashStr\('warlike\|'/g) || []).length === 1 && (BS.match(/_t577Hash\(/g) || []).length === 2, '이름 해시를 부르는 자리는 종전 그대로 하나씩(끔 갈래)', '');
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);

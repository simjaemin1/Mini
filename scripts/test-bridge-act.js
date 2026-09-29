#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-bridge-act.js — 다리도 행위다 (T527) · 표 · 착공 후보 · 크루 하루 · 존 콜라이더 · 클라 미러 ===========
//
// ★이 하네스가 지키는 계약:
//   ① 표 하나 — `server/bridge-stages.js` · 수는 출토 보고의 수(테스트우드 청동기 다리)에서 **유도**(말뚝 143 ÷ 22 m = 물 1 m 당 6.5 · 널 = 다리 칸당 판자 1 =
//      존 `floor` 설치 비용) · 원자재는 움집·곳간 레시피 그대로(기둥 = 통나무 3 · 판자 2 = 통나무 1)
//   ② 착공 후보 = 존 설정 `bridgeSites` — 폭 2셀 · 축 4방(대각선 0) · 이어진 한 줄 · 시딩 다리와 안 겹친다 · 섬 마을이 짓는 이
//   ③ 손잡이 하나(econ 한 자리 `T527_BRIDGE_ACT`) · 기본 끔 · 끄면 크루 0 · 곳간 출구 0 · 다리 셀 집합 = 존 설정 그대로(해시)
//   ④ 켬 — 여유 크루가 곳간 → 손 → 걸음 → 다리 터 · 자재가 모자라면 기다린다 · 마지막 단계에 **그 순간** 다리가 선다(`deps.addBridgeCells`)
//   ⑤ 존 — `addBridgeCells` 가 단일 술어(`isTerrainBlockedLocal`)의 다리 집합에 더한다 · welcome `bridgePayload()` · 끔 = 같은 참조
//   ⑥ 클라 미러 — `bridges_add` 가 welcome 과 같은 두 집합(렌더 · 콜라이더)에 더한다
// 실행: node scripts/test-bridge-act.js
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lastJson = (s) => JSON.parse(s.toString().split('\n').filter((l) => l.startsWith('{')).pop());
const probe = (env, js) => lastJson(execFileSync(process.execPath, ['-e', js],
  { env: Object.assign({}, process.env, { ENABLE_VILLAGES: '0' }, env), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }));
const B = require(path.join(ROOT, 'server', 'bridge-stages.js'));
const HUT = require(path.join(ROOT, 'server', 'hut-stages.js'));
const GRA = require(path.join(ROOT, 'server', 'granary-stages.js'));
const REC = Object.assign({}, HUT.HUT_RECIPES, GRA.GRANARY_RECIPES);
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
const ZSRC = rd('server/zone.js'), VSRC = rd('server/villages.js'), ESRC = rd('sim/economy-sim.js');
const hashFlat = (f) => { const a = []; for (let i = 0; i + 1 < (f || []).length; i += 2) a.push(f[i] + '_' + f[i + 1]); a.sort(); return crypto.createHash('sha1').update(a.join(',')).digest('hex').slice(0, 12); };

console.log('\n=== 다리도 행위다 (T527) ===');
console.log('\n① 표 하나 — `server/bridge-stages.js`');
{
  const S = B.BRIDGE_SRC;
  ok(S.timbers === 143 && S.stakeRunM === 22 && S.lengthM === 26 && S.stakeRows === 2 && S.widthM.join(',') === '1.5,2' && S.stone === 0,
    '① 출토 보고의 수 — 테스트우드 다리 26 m · 폭 1.5~2 m · 말뚝 두 줄 22 m · 목재 143 · 돌 0');
  ok(B.STAKES_PER_M === 143 / 22 && B.stakesFor(22) === 143, '① 말뚝 수는 **유도** — 물 1 m 당 143 ÷ 22 = 6.5 · 22 m 면 143(출토 그 수로 되돌아간다)', String(B.STAKES_PER_M));
  const fl = (ZSRC.match(/\n\s*floor:\s*\{\s*plank:\s*(\d+)/) || [])[1];
  ok(+fl === B.DECK_PER_CELL.plank && Object.keys(B.DECK_PER_CELL).join() === 'plank', '① 널 = 다리 칸당 판자 1 = 존 `floor` 설치 비용(바닥 한 칸 · 새 수 0)', `floor plank ${fl}`);
  const st = B.bridgeStages(43, 90);
  ok(st.length === 2 && st[0].need.pillar === 280 && st[1].need.plank === 90, '① 공정 둘 — ① 말뚝 박기(기둥 280 = ⌈6.5 × 43⌉) · ② 널 깔기(판자 90)');
  ok(JSON.stringify(B.bridgeRaw(43, 90, REC)) === '{"wood":885}', '① 원자재 = 통나무 885(기둥 280 × 3 + 판자 90 ÷ 2 · 움집·곳간 레시피 그대로)', JSON.stringify(B.bridgeRaw(43, 90, REC)));
  ok(!/require\(/.test(rd('server/bridge-stages.js').replace(/\/\/[^\n]*/g, '')), '① 순수 모듈(require 0)');
  ok(!/pillar:\s*\{\s*from|plank:\s*\{\s*from/.test(rd('server/bridge-stages.js')), '① 레시피 사본 0(부르는 쪽이 움집·곳간 표를 넘긴다)');
}

console.log('\n② 착공 후보 — 존 설정 `bridgeSites`(계획기 v2 셀 그대로)');
{
  let sites = 0, bad = [], overlap = 0;
  for (const [zid, Z] of Object.entries(ZONES)) {
    const seeded = new Set(); for (let i = 0; i + 1 < (Z.bridges || []).length; i += 2) seeded.add(Z.bridges[i] + '_' + Z.bridges[i + 1]);
    for (const s of (Z.bridgeSites || [])) {
      sites++;
      const c = s.cells || [], xs = new Set(), ys = new Set(); let over = 0;
      for (let i = 0; i + 1 < c.length; i += 2) { xs.add(c[i]); ys.add(c[i + 1]); if (seeded.has(c[i] + '_' + c[i + 1])) over++; }
      const n = c.length / 2;
      const axX = xs.size === 2 && ys.size === n / 2, axY = ys.size === 2 && xs.size === n / 2;   // 폭 2 × 길이 — 한 축으로 곧게
      const span2 = [...(axX ? xs : ys)].sort((a, b) => a - b), line = [...(axX ? ys : xs)].sort((a, b) => a - b);
      const contig = span2[1] - span2[0] === 1 && line.every((v, i) => i === 0 || v - line[i - 1] === 1);
      overlap += over;
      if (!((axX || axY) && contig && n === 2 * (s.span + 2) && over <= 2 && Array.isArray(s.v) && s.v.length)) bad.push(`${zid}:${(s.v || []).join(',')}`);
    }
  }
  ok(sites >= 1 && bad.length === 0, '② ★불변식 — 폭 2셀 · 축 4방(대각선 0) · 이어진 한 줄 · 칸 = 2 × (물 칸 + 착지 2) · 짓는 마을 있음 · 시딩 다리와 겹침은 착지 한 줄(≤2칸)뿐', `후보 ${sites} · 어긋남 ${bad.join(' ') || 0} · 겹침 ${overlap}칸(섬 쪽 착지 칸이 옛 다리 끝이다 — 더할 때 건너뛴다)`);
  const hb = (ZONES.hanbando.bridgeSites || [])[0] || {};
  ok(JSON.stringify(hb.v) === '["어촌6"]' && hb.span === 43 && hb.cells[0] === 2029 && hb.cells[1] === 3937, '② 한반도 후보 = 계획기 v2 의 그 한 섬(어촌6 · 물 43칸 · 섬 해안 (2029,3937) 에서)');
  ok(/bridgeSites 형/.test(rd('scripts/plan-bridges-v2.js')) && !/bridgeSites/.test(rd('server/terrain.js')), '② 계획기가 이 줄의 모양을 낸다(출력만 · 규칙 0줄)');
}

console.log('\n③ 손잡이 하나 · 기본 끔 — 다리 셀 집합 비트 동일');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T527_BRIDGE_ACT === false && E.actFromGranary({ storage: { wood: 9 } }, 'wood', 3) === 0, '③ ★★기본 **끔** · 곳간 출구 0');
  const all = ['sim', 'server', 'public/client'].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js') && !/economy-engine\.browser/.test(f)).map((f) => rd(d + '/' + f)));
  const nKnob = all.reduce((a, s) => a + (s.match(/process\.env\.T527_BRIDGE_ACT/g) || []).length, 0);
  ok(nKnob === 1 && /const T527_BRIDGE_ACT = process\.env\.T527_BRIDGE_ACT === '1';/.test(ESRC), '③ 손잡이 한 자리(econ)', `env 읽기 ${nKnob}`);
  ok(/_lifeEcon\(\)\.T527_BRIDGE_ACT/.test(VSRC) && /if \(_t527On\(\)\) \{ try \{ _t527BridgeDay\(vil\);/.test(VSRC), '③ 생활층은 econ 손잡이를 읽는다 · 하루 절에 한 줄(집 크루 줄 바로 뒤 · 관측자 문 앞)');
  const body = VSRC.slice(VSRC.indexOf('function _t527On()'), VSRC.indexOf('const G_CAP = 2500'));
  ok(body.length > 1500 && !/anyViewerNear|Math\.random/.test(body), '③ 관측자 0 · 주사위 0');
}

// 자식 세계 — T400 하네스와 같은 작은 세계(마을 하나 · 곳간 하나) · 존 id 한반도(후보 표를 읽는다)
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js')), VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
const WORLD = (opt) => `
const V=require(${VP}), E=require(${EP}), P=V.__labProbe._t400Probe, Q=V.__labProbe._t527Probe;
const players=new Map(); ['fisher','farmer','hunter','forager','miner','lumberjack'].forEach((j,i)=>players.set('n'+i,{pid:'n'+i,simJob:j,inventory:{}}));
const DAY=600000; let now=DAY*10+1; const built=[];
P.setup({deps:{players,moveSpeed:120,dayPhaseRatio:0.7,broadcast(){},addBridgeCells:(f)=>{built.push(f.length/2);return f.length/2;},anyViewerNear:()=>false},db:null,dayMs:DAY,epoch:0,zoneId:'hanbando',tickCtx:{get now(){return now}}});
P.setup({ta:{isBlocked:()=>false,isWater:()=>false},world:{day:0}});
const S0=(Q.sites()||[])[0]||null;
const mk=(name,wood)=>({dbId:1,name,ccx:S0?S0.cells[0]:0,ccy:S0?S0.cells[1]+6:0,npcPids:[...players.keys()],econ:{storage:{wood}},_granList:[{cx:S0?S0.cells[0]+4:0,cy:S0?S0.cells[1]+4:0}],_site:null,_granPend:null});
`;
console.log('\n③′ 끔 — 크루 0 · 후보 표 안 섬(자식 프로세스)');
{
  const off = probe({ T527_BRIDGE_ACT: '' }, WORLD({}) + `const vil=mk('어촌6',900); const d=Q.day(vil); process.stdout.write(JSON.stringify({k:E.T527_BRIDGE_ACT,sites:Q.sites(),d,w:vil.econ.storage.wood,built}));`);
  ok(off.k === false && off.sites === null && off.d === null && off.w === 900 && off.built.length === 0, '③′ ★끔 — 후보 표가 서지 않는다 · 곳간 무변 · 다리 0', JSON.stringify(off));
}

console.log('\n④ 켬 — 섬 마을 크루가 날라 짓는다');
{
  const on = probe({ T527_BRIDGE_ACT: '1', T400_BUILD_ACT: '1' }, WORLD({}) + `
const vil=mk('어촌6',100); const other=mk('어촌5',900);
const crew=Q.crew(vil); const n0=Q.need(S0,0), n1=Q.need(S0,1);
const d1=JSON.parse(JSON.stringify(Q.day(vil))); const mat1=JSON.parse(JSON.stringify(S0.mat)); const w1=vil.econ.storage.wood;
const dOther=Q.day(other);
let days=1; while(!S0.done && days<400){ vil.econ.storage.wood+=100; now+=DAY; Q.day(vil); days++; }
vil._site={cx:1,cy:1,stage:1}; const crewH=Q.crew(vil);
process.stdout.write(JSON.stringify({crew,crewH,n0,n1,d1,mat1,w1,dOther,done:S0.done,stage:S0.stage,days,built,sum:vil._t527Sum,hands:[...players.values()].map(p=>p.inventory.wood||0),w:vil.econ.storage.wood}));`);
  ok(JSON.stringify(on.n0) === '{"wood":840}' && JSON.stringify(on.n1) === '{"wood":45}', '④ 단계 자재(econ) = 표에서 — ① 통나무 840 · ② 통나무 45', `${JSON.stringify(on.n0)} ${JSON.stringify(on.n1)}`);
  ok(JSON.stringify(on.crew) === '["n0","n1"]' && JSON.stringify(on.crewH) === '["n2","n3"]', '④ 여유 크루 — 집터가 없으면 앞 둘 · 집 크루가 있으면 그다음 둘', `${on.crew} / ${on.crewH}`);
  ok(on.d1 && on.d1.trips > 0 && on.w1 === 100 - on.mat1.wood && on.mat1.wood > 0 && on.d1.adv === 0, '④ 첫날 — 곳간 → 손 → 다리 터(재고 100 에서 놓은 만큼 빠짐) · 자재가 모자라 단계 0', `놓음 ${on.mat1.wood} · 왕복 ${on.d1.trips}`);
  ok(on.dOther === null, '④ 미끼 — 후보의 짓는 이가 아닌 마을은 안 짓는다');
  ok(on.done === true && on.stage === 2 && JSON.stringify(on.built) === '[90]', '④ ★마지막 단계에 **그 순간** 다리가 선다 — 후보 90칸을 존에 넘긴다(`deps.addBridgeCells`)', `${on.days}일`);
  ok(on.sum && on.sum.built === 1 && on.sum.stallDays >= 1 && Math.abs(on.sum.took - 885) < 1e-6, '④ 누계 — 꺼낸 통나무 885(표 그대로) · 곳간이 비어 기다린 날 있음', JSON.stringify(on.sum));
  ok(JSON.stringify(on.hands) === '[0,0,0,0,0,0]', '④ 손은 날을 넘겨 들지 않는다');
}

console.log('\n⑤ 존 — 단일 술어의 다리 집합 · welcome · 끔 = 같은 참조(자식 프로세스 · 존 부팅)');
{
  const ZJ = (env) => probe(Object.assign({ ZONE_ID: 'hanbando', PORT: String(38700 + (process.pid % 200)), DB_PATH: `/tmp/test-bridge-act-${process.pid}-${Math.random().toString(36).slice(2)}.db`,
    ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' }, env), `
const _l=console.log; console.log=()=>{}; console.warn=()=>{}; console.error=()=>{};
const Z=require(${JSON.stringify(path.join(ROOT, 'server', 'zone.js'))}); const H=Z.__testBind(); const {ZONES}=require(${JSON.stringify(path.join(ROOT, 'server', 'zone-config.js'))});
const ZC=ZONES.hanbando, S=ZC.bridgeSites[0]; const px=(c)=>c*32+16;
const flat=ZC.bridges; let seen=0; for(let i=0;i+1<flat.length;i+=2) if(H.isBridgeTileLocal(px(flat[i]),px(flat[i+1]))) seen++;
const cnt0=H.bridgeCellCount(); const same=H.bridgePayload()===ZC.bridges;
let wet=null; for(let i=0;i+1<S.cells.length;i+=2){ const x=px(S.cells[i]),y=px(S.cells[i+1]); if(H.isWaterTileLocal(x,y)&&!H.isBridgeTileLocal(x,y)){ wet=[x,y]; break; } }
const blk0=H.isTerrainBlockedLocal(wet[0],wet[1]);
const n=H.addBridgeCells(S.cells); const n2=H.addBridgeCells(S.cells);
const blk1=H.isTerrainBlockedLocal(wet[0],wet[1]); const pl=H.bridgePayload();
console.log=_l; process.stdout.write(String.fromCharCode(10)+JSON.stringify({seen,cfg:flat.length/2,cnt0,same,blk0,blk1,n,n2,cnt1:H.bridgeCellCount(),plN:pl.length/2,plHead:pl.slice(0,flat.length).join()===flat.join(),dup:ZC.bridgeSites[0].cells.length/2-n})+String.fromCharCode(10));
setTimeout(()=>process.exit(0),10);`);
  const z = ZJ({});
  ok(z.seen === z.cfg && z.cnt0 === z.cfg && z.same === true, '⑤ ★끔(부팅 그대로) — 다리 셀 집합 = 존 설정 그대로 · welcome 은 **같은 배열 참조**', `${z.cnt0}/${z.cfg} · 해시 ${hashFlat(ZONES.hanbando.bridges)}`);
  ok(z.blk0 === true && z.n === 90 - z.dup && z.dup <= 2 && z.n2 === 0 && z.blk1 === false && z.cnt1 === z.cfg + z.n, '⑤ 완공 — 후보의 물 칸이 막힘 → 통행(단일 술어) · 새 칸만 더함(옛 다리 끝과 겹친 칸은 건너뜀) · 두 번 더해도 0', JSON.stringify({ blk0: z.blk0, blk1: z.blk1, n: z.n, n2: z.n2 }));
  ok(z.plN === z.cfg + z.n && z.plHead === true, '⑤ welcome — 시딩 다리 뒤에 지은 다리를 붙인다(클라가 새로 들어와도 본다)');
  ok(/const _terrBlocked0[\s\S]{0,400}if \(isWaterTileLocal\(x, y\)\) return !isBridgeTileLocal\(x, y\);/.test(ZSRC.replace(/function _terrBlocked0/, 'const _terrBlocked0')), '⑤ 통행 판정은 여전히 한 줄(물 → 다리면 통행) — 새 술어 0');
  ok(/function addBridgeCells\(flat\)[\s\S]{0,600}_BLK_BITS\) _BLK_BITS\.fill\(0\)[\s\S]{0,80}_WW\.clearTerrain\(\)[\s\S]{0,120}type: 'bridges_add'/.test(ZSRC), '⑤ 유도 비트(T356·T461) 영점 · `bridges_add` 방송');
  ok(/addBridgeCells,\s+\/\/ ★\[T527\]/.test(ZSRC) && /invalidateTradeDistances\(\)/.test(VSRC.slice(VSRC.indexOf('function _t527Complete'), VSRC.indexOf('function _t527BridgeDay'))), '⑤ 생활층에 문 하나(`deps.addBridgeCells`) · 완공 = 교역 거리·캐러밴 격자 무효화(벽·울타리와 같은 훅)');
}

console.log('\n⑥ 클라 미러 — `bridges_add`');
{
  const C = rd('public/client/30-n-net.js');
  const i = C.indexOf("msg.type === 'bridges_add'"), blk = C.slice(i, i + 700);
  ok(i > 0 && /c\.bridges\.add\(cells\[i\] \+ ',' \+ cells\[i \+ 1\]\)/.test(blk) && /_bridgeAbs\.add\(/.test(blk), '⑥ 렌더 집합(`c.bridges`)과 콜라이더 미러(`_bridgeAbs`) 둘 다에 더한다(welcome 과 같은 키)');
  const W = C.slice(C.indexOf('c.bridges = new Set();'), C.indexOf('c.bridges = new Set();') + 600);
  ok(/msg\.zone\.worldOffsetX \/ CL_BUILDING_SIZE\) \+ msg\.bridges\[i\]/.test(W) && /worldOffsetX \|\| 0\) \/ CL_BUILDING_SIZE \+ cells\[i\]/.test(blk), '⑥ 절대 셀 = 존 오프셋 ÷ 셀 + 칸(welcome 과 같은 식)');
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
process.exit(fail ? 1 : 0);

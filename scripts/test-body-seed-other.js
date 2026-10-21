#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-body-seed-other.js — 마을 밖 몸의 주사위 신원(T841 · T822 회부 3 · 손잡이 `T822_BODY_SEED` 안 · 새 손잡이 0) ==========
//
// ★왜 [지시 T841] 존 결정 문(`_shOf` — `decideNpcBehavior` · `unstuckNpc`)은 몸의 신원 해시 `_sh` 를 굴림 씨로 쓴다. 비었으면 `playerId`
//   (`npc_<존>_<연번>_<Math.random 네 자>`)로 굽는다 ⇒ 같은 씨 두 판의 몸 주사위가 갈린다. T822 가 마을 몸만 판 씨로 묶었다.
//   도적 몸(`bandits.js syncBodies` — 존 `spawnNpc` · AI 켬)도 같은 문을 지난다 → 같은 꼴(판 씨 + `bandit_<단>_<몸 번호>`).
//   지키는 것: ⓐ 정적(T822 안 · 호스트 문 · 도적 줄 · 마을 몸 열쇠 글자 그대로 · 새 수 0) ·
//             ⓑ 도적 실체화(운영 `syncBodies` · 아이 프로세스) — 켬 = 같은 씨 두 판의 몸 주사위 신원 같음 · 다른 씨는 다름 · 몸마다 다름 ·
//                끔 = 신원 칸 무접촉(존이 `playerId` 꼬리로 굽는다 → 두 판 갈림 — 종전) · 표시 이름 · `playerId` 무접촉
// ⚠존을 부팅하지 않는다 — 호스트 정본(`__p3Bind` · `banditHost`)과 도적 층 정본(`syncBodies`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-body-seed-other.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CV = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const CB = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8'));

console.log('\n=== 마을 밖 몸의 주사위 신원(T841) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — T822 안 · 호스트 문 · 도적 줄 · 마을 몸 열쇠 그대로 · 새 수 0');
{
  ok(/bodySh: T822_BODY_SEED \? _t841Sh : null,/.test(CV), '호스트 문 — `banditHost().bodySh` 는 T822 켬에서만(끔 = null · 새 손잡이 0)');
  ok(/function _t841Sh\(key\) \{ return _pidHash\(`\$\{_t822S0\(\)\}_\$\{key\}`\); \}/.test(CV), '열쇠 = 판 씨(T822 그 칸 `_t822S0`) + 키 · 해시 = `pidHash`(종전 그 함수)');
  //   [PM 착지 10-22] T833 이 마을 몸 열쇠를 몸 번호(pid) → 명부 자리(i)로 바꿨다(켬 기본) — 같은 꼴 `<판 씨>_simvil_<마을>_<번호>` 의 글자를 그 판으로 본다.
  ok(/b\._sh = _pidHash\(`\$\{s0\}_simvil_\$\{vil\.dbId\}_\$\{i\}`\)/.test(CV), '마을 몸 열쇠 글자 그대로(T822 · T833 — `<판 씨>_simvil_<마을>_<명부 자리>`)');
  ok(/if \(S\.host\.bodySh\) p\._sh = S\.host\.bodySh\(`bandit_\$\{g\.id\}_\$\{p\.pid\}`\);/.test(CB), '도적 줄 — 호스트 문이 있을 때만 · 열쇠 `bandit_<단 번호>_<몸 번호>`');
  const i = CB.indexOf('if (S.host.bodySh)'), j = CB.indexOf("p.simJob = 'bandit';");
  ok(i > j && j > 0 && CB.indexOf('name: \'도적\'') < j, '자리 — 존 `spawnNpc` 뒤 · 표시 이름(`도적`) · `playerId` 무접촉');
  ok(!/[^\w.](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(CB.slice(i, CB.indexOf('\n', i))), '새 수 0');
}

// ── ⓑ 도적 실체화 — 아이 프로세스(손잡이는 모듈을 싣는 순간 읽는다) ──────────────────────
console.log('\n[ⓑ] 도적 실체화(운영 `syncBodies`) — 같은 씨 두 판 · 다른 씨 · 끔');
const child = (knob, seed) => {
  const env = Object.assign({}, process.env); env.T822_BODY_SEED = knob ? '1' : '0';   // [PM 착지 10-22] T833 켬 기본 — 끔은 `=0` 으로
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}),B=require(${JSON.stringify(path.join(ROOT, 'server', 'bandits.js'))}),SR=require(${JSON.stringify(path.join(ROOT, 'server', 'seed-rand.js'))});`
    + `const players=new Map(),npcs=new Set();let serial=0,pid=0;`
    //   존 `spawnNpc` 의 몸 꼴(신원 글자에 무작위 꼬리 · zone.js npc playerId) — 여기선 그 글자만 흉내 낸다
    + `const spawnNpc=(o)=>{const p={pid:'p'+(++pid),playerId:'npc_t_'+(serial++)+'_'+Math.random().toString(36).slice(2,6),name:o.name,x:o.x,y:o.y,isNpc:true};players.set(p.pid,p);npcs.add(p.pid);return p;};`
    + `const H=V.__p3Bind({ready:true,econ:{rngState:()=>({s0:${seed}})},villageSeed:${seed},villages:[],world:{},deps:{players,npcs,broadcast(){},spawnNpc}});`
    + `const host=H.banditHost();B._t765Probe.setHost(host);`
    + `B.gangs().push({id:4,n:3,camp:{cx:40,cy:50}},{id:9,n:2,camp:{cx:90,cy:20}});B._t765Probe.syncBodies();`
    //   존 결정 문이 보는 신원(`_shOf` — `_sh` 가 있으면 그것 · 없으면 `playerId` 를 해시)
    + `const sh=(p)=>p._sh!==undefined?p._sh:SR.pidHash(p.playerId||p.pid||'');const out=[];`
    + `for(const [gid,pids] of B._t765Probe.bodies())for(const k of pids){const p=players.get(k);out.push([gid,k,sh(p),p._sh===undefined?0:1,p.name,p.playerId.split('_').length]);}`
    + `process.stdout.write(JSON.stringify({bodySh:host.bodySh?1:0,out}));`;
  const o = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(o.slice(o.indexOf('{')));
};
{
  const a = child(true, 1020), b = child(true, 1020), c = child(true, 7), x = child(false, 1020), y = child(false, 1020);
  const ids = (r) => r.out.map((q) => q[2]).join(',');
  ok(a.bodySh === 1 && a.out.length === 5 && a.out.every((q) => q[3] === 1), '켬 — 호스트 문이 서고 도적 몸 다섯(단 4 · 3 + 단 9 · 2)이 신원 칸을 받는다', `${a.out.length}몸`);
  ok(ids(a) === ids(b), '켬 — 같은 씨 두 판: 몸 주사위 신원 다섯 다 같다(`playerId` 꼬리는 달라도)', ids(a));
  ok(ids(a) !== ids(c) && new Set(a.out.map((q) => q[2])).size === a.out.length, '켬 — 다른 씨면 다르고 · 한 판 안에서 몸마다 다르다');
  ok(x.bodySh === 0 && x.out.every((q) => q[3] === 0) && ids(x) !== ids(y), '끔 — 호스트 문 null · 신원 칸 무접촉(존이 `playerId` 꼬리로 굽는다 → 같은 씨 두 판 갈림 = 종전)', `${ids(x).slice(0, 24)}… ≠ ${ids(y).slice(0, 24)}…`);
  ok(a.out.every((q) => q[4] === '도적' && q[5] === 4), '켬 — 표시 이름(`도적`) · `playerId` 글자 꼴 무접촉');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);

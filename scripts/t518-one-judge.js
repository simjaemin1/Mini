#!/usr/bin/env node
// === scripts/t518-one-judge.js — 한 몸 한 판정: 떠난 몸의 껍데기를 떠나는 존이 또 재는가(T518 ② · 러너 밖) ================
//   node scripts/t518-one-judge.js            → central + 한반도 존을 **두 판**(T518_ONE_JUDGE 기본 켬 · =0 끔) 띄우고 비교 표를 낸다.
//   한 판 안: 손님 하나가 붙는다 → 존 안(아래 예비 적재 겉옷)에서 그 몸에 네 가지를 한다 —
//     ⓐ 화살(주인 없음 · 속도 0)을 몸 한가운데 놓는다 · `handingOff=false`(대조)   ⓑ 같은 것 · `handingOff=true`(떠난 몸의 껍데기 · 남에겐 안 보인다 `:13465`)
//     ⓒ `/cross_damage`(안 문 · 127.0.0.1) · `handingOff=false`                     ⓓ 같은 것 · `handingOff=true`
//   각 경우 hp 가 깎였는가(Δhp). 한 몸 한 판정이면 ⓑ·ⓓ 는 0 이어야 한다(몸은 이미 페이로드로 도착 존에 있다).
//   이 파일은 **예비 적재 겸용**이다 — `T518_JUDGE_OUT` 가 있고 main 이 아니면 zone.js 뒤에 겉옷을 덧붙인다(t512-probe 문법).
'use strict';
const path = require('path');
if (require.main !== module) {
  if (!process.env.T518_JUDGE_OUT) return;
  const Module = require('module');
  const _compile = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('server', 'zone.js'))) content += `
;(function () {
  const fs = require('fs');
  const OUT = process.env.T518_JUDGE_OUT;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};
  const iv = setInterval(async () => {
    let p = null; for (const q of players.values()) if (!q.isNpc && q.ws) { p = q; break; }
    if (!p) return; clearInterval(iv);
    await sleep(1500);
    const hp0 = () => p.hp;
    const arrowCase = async (ho) => {
      p.hp = p.maxHp || 100; p.isDown = false; p.handingOff = ho; const b = p.hp;
      arrows.set('t518a', { aid: 't518a', x: p.x, y: p.y, vx: 0, vy: 0, ownerPid: '__none', ownerId: 't518', dmg: 7, ttl: 400 });
      await sleep(450); const a = p.hp; p.handingOff = false; arrows.delete('t518a'); return b - a;
    };
    const crossCase = async (ho, dmg = 7) => {
      p.hp = p.maxHp || 100; p.isDown = false; p.handingOff = ho; const b = p.hp;
      try { await postJSON('127.0.0.1', PORT, '/cross_damage', { targetId: p.playerId, dmg, attackerId: 't518' }); } catch (e) { res.err = String(e.message); }
      await sleep(100); const a = p.hp; p.handingOff = false; return b - a;
    };
    res.arm = T518_ONE_JUDGE ? 1 : 0;
    res.a_ctrl = await arrowCase(false); res.b_ho = await arrowCase(true);
    res.c_ctrl = await crossCase(false); res.d_ho = await crossCase(true);
    res.e_ho_kill = await crossCase(true, 999); res.e_down = !!p.isDown || p.hp <= 0;   // ⓔ 떠나는 중인 껍데기에 치명타 — 떠나는 존이 죽음 경로를 밟는가
    p.hp = p.maxHp || 100; p.isDown = false;
    fs.writeFileSync(OUT, JSON.stringify(res));
  }, 200);
})();
`;
    return _compile.call(this, content, filename);
  };
  return;
}
// ── 본판 ──────────────────────────────────────────────────────────────────────────────
const { spawn } = require('child_process');
const fs = require('fs');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitH = async (u) => { for (let i = 0; i < 120; i++) { try { const r = await fetch(u + '/health', { signal: AbortSignal.timeout(2000) }); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; };
async function one(arm) {
  const tmp = fs.mkdtempSync('/tmp/t518j-'); const out = path.join(tmp, 'res.json');
  const base = { ...process.env, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0' };
  delete base.CENTRAL_SECRET;
  const c = spawn('node', ['server/central.js'], { cwd: ROOT, env: { ...base, PORT: '3710', DB_PATH: tmp + '/c.db', PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', ZONE_HOST_HANBANDO: '127.0.0.1', ZONE_PORT_HANBANDO: '3720' }, stdio: ['ignore', fs.openSync(tmp + '/c.log', 'w'), fs.openSync(tmp + '/c.log', 'a')] });
  await sleep(1500);
  const zenv = { ...base, PORT: '3720', ZONE_ID: 'hanbando', DB_PATH: tmp + '/h.db', CENTRAL_HOST: '127.0.0.1', CENTRAL_PORT: '3710', PUBLIC_HOST: 'localhost', T518_JUDGE_OUT: out, NODE_OPTIONS: '--require=' + __filename };
  if (arm === 0) zenv.T518_ONE_JUDGE = '0';
  const z = spawn('node', ['server/zone.js'], { cwd: ROOT, env: zenv, stdio: ['ignore', fs.openSync(tmp + '/z.log', 'w'), fs.openSync(tmp + '/z.log', 'a')] });
  let r = null;
  try {
    if (!(await waitH('http://127.0.0.1:3720'))) throw new Error('존 안 뜸 ' + tmp);
    const ws = new WebSocket('ws://127.0.0.1:3720/?username=&name=judge&color=%23ffffff');
    ws.on('error', () => {});
    for (let i = 0; i < 150 && !fs.existsSync(out); i++) await sleep(200);
    r = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : { err: '결과 없음 ' + tmp };
    try { ws.close(); } catch (e) {}
  } finally { z.kill(); c.kill(); await sleep(800); }
  return r;
}
(async () => {
  const on = await one(1), off = await one(0);
  const row = (k, t) => `| ${t} | ${off[k]} | ${on[k]} |`;
  console.log('| 경우 | 끔 `T518_ONE_JUDGE=0` Δhp | 켬(기본) Δhp |\n|---|---|---|');
  console.log(row('a_ctrl', 'ⓐ 화살 · 몸 여기 있음(대조)'));
  console.log(row('b_ho', 'ⓑ 화살 · 몸 떠나는 중(handingOff)'));
  console.log(row('c_ctrl', 'ⓒ `/cross_damage` · 몸 여기 있음(대조)'));
  console.log(row('d_ho', 'ⓓ `/cross_damage` · 몸 떠나는 중'));
  console.log(`| ⓔ \`/cross_damage\` 999 · 몸 떠나는 중 → 떠나는 존이 쓰러뜨림 | ${off.e_down ? '쓰러짐' : '안 쓰러짐'} (Δhp ${off.e_ho_kill}) | ${on.e_down ? '쓰러짐' : '안 쓰러짐'} (Δhp ${on.e_ho_kill}) |`);
  const ok = off.a_ctrl > 0 && off.b_ho > 0 && off.c_ctrl > 0 && off.d_ho > 0 && on.a_ctrl > 0 && on.b_ho === 0 && on.c_ctrl > 0 && on.d_ho === 0 && !on.e_down;
  console.log(`=== 한 몸 한 판정 ${ok ? 'PASS' : 'FAIL'} (끔 = 넷 다 깎임 · 켬 = 대조만 깎임) ===`);
  if (on.err || off.err) console.log('err', on.err, off.err);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

// === scripts/slicer-seed.js — 일틱 계열 하네스의 **씨앗 DB 정본** ==================
//
// ★왜 이 파일이 생겼나 [T49 2026-09-02]
//   `test-site-memo` 가 `test-tick-slicer` 가 만들어 둔 씨앗 DB(`/tmp/slicer-seed-*.db`)에
//   기대고 있었다. 러너는 **이름순**으로 도는데 `site-memo` 가 `tick-slicer` 보다 앞이라,
//   **신선한 러너에서는 영원히 못 통과했다**(`✗ 씨앗 DB 없음 — … 를 먼저 한 번 돌려라`).
//   족보 ㊾("앞 절이 상태를 남기면 뒤 절이 깨진다")의 **러너판**이다.
//
//   ⇒ 고치는 길 둘 중 **권장안**을 골랐다: 순서를 규약으로 못 박는 대신
//     **씨앗을 자기 픽스처로 독립**시킨다. 누가 먼저 돌든 없으면 자기가 만든다.
//   ⇒ 그런데 시딩 코드를 양쪽에 복사하면 그게 사본이다(이 레포의 제1 금기).
//     그래서 **한 곳**에 두고 둘이 같은 함수를 부른다.
//
// ★씨앗은 /tmp 에 캐시된다. 한 번 만들면(수 분) 그 뒤 실행은 곧바로 시작한다.
//   지우고 싶으면: rm -f /tmp/slicer-seed-*.db*
//
// 쓰는 법:
//   const { SEED_C, SEED_Z, ensureSeed } = require('./slicer-seed.js');
//   const r = await ensureSeed();      // { ok, built, why }
//   if (!r.ok) { …실패 처리… }
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
// ★경로도 **여기가 정본**이다 — 하네스는 이 상수를 import 해서 쓴다(옮겨 적지 않는다).
const SEED_C = '/tmp/slicer-seed-central.db';
const SEED_Z = '/tmp/slicer-seed-zone.db';
// ★[T49 2026-09-02] 하네스마다 **자기 크기의 씨앗**이 필요할 수 있다.
//   `test-site-memo` 가 그 예다 — "집터를 못 찾는 헛수고"를 재려면 마을이 제 땅을 다 쓸 만큼
//   자란 세계여야 하는데, 기본 씨앗(20초 성장)은 너무 어려서 **빈손이 0** 이다.
//   ⇒ tag 를 주면 그 tag 의 씨앗을 따로 캐시한다(기본 씨앗은 안 건드린다).
const seedPaths = (tag) => (tag
  ? { c: `/tmp/slicer-seed-${tag}-central.db`, z: `/tmp/slicer-seed-${tag}-zone.db` }
  : { c: SEED_C, z: SEED_Z });
const CPORT = parseInt(process.env.SLICER_SEED_CPORT || '3010', 10);
const ZPORT = parseInt(process.env.SLICER_SEED_ZPORT || '3020', 10);
// 마을이 좀 자라야 단계별 비용이 드러난다(원래 tick-slicer 가 쓰던 값 그대로).
const GROW_MS = parseInt(process.env.SLICER_SEED_GROW_MS || '20000', 10);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cp = (src, dst) => {
  for (const sfx of ['', '-wal', '-shm']) {
    try { fs.copyFileSync(src + sfx, dst + sfx); }
    catch (e) { try { fs.unlinkSync(dst + sfx); } catch (e2) {} }
  }
};

async function ensureSeed(opts) {
  const log = (opts && opts.log) || ((s) => console.log(s));
  const tag = (opts && opts.tag) || '';
  const growMs = (opts && opts.growMs) || GROW_MS;
  const P = seedPaths(tag);
  if (fs.existsSync(P.z)) return { ok: true, built: false, why: '이미 있다', c: P.c, z: P.z };

  log(`  씨앗 DB 없음${tag ? `(${tag})` : ''} — 한 번 시딩한다(성장 ${(growMs / 1000).toFixed(0)}초 · 첫 실행만 수 분).`);
  const CDB = `/tmp/slicer-seed0${tag ? '-' + tag : ''}-c.db`, ZDB = `/tmp/slicer-seed0${tag ? '-' + tag : ''}-z.db`;
  for (const f of [CDB, ZDB]) for (const sfx of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + sfx); } catch (e) {} }

  const procs = [];
  const boot = (file, env) => {
    const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], {
      cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
    p._died = null; p._err = '';
    p.stdout.on('data', () => {});
    // ★stderr 를 버리지 않는다 — 시딩이 실패하면 그 이유가 유일한 단서다(T10-① 교훈).
    p.stderr.on('data', (b) => { p._err = (p._err + String(b)).slice(-2000); });
    p.on('exit', (c, s) => { p._died = `code=${c} sig=${s}`; });
    procs.push(p); return p;
  };
  const killAll = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; };
  const waitUp = async (p, url, n) => {
    for (let i = 0; i < n; i++) {
      if (p._died) {
        log(`  ✗ 씨앗 ${p.spawnargs[1].split('/').pop()} 가 떠보지도 못하고 죽었다 (${p._died})`);
        const t = p._err.trim().split('\n').filter(Boolean).slice(-3).join(' | ');
        if (t) log(`      stderr: ${t.slice(0, 250)}`);
        return false;
      }
      try { const r = await fetch(url); if (r.ok) return true; } catch (e) {}
      await sleep(1000);
    }
    return false;
  };

  try {
    const cpp = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
    if (!await waitUp(cpp, `http://localhost:${CPORT}/zones`, 120)) { killAll(); return { ok: false, built: false, why: 'central 기동 실패' }; }
    const zpp = boot('zone.js', {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB,
      CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CPORT), CENTRAL_URL: `http://localhost:${CPORT}`,
      VILLAGE_DAY_MS: '3000', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    });
    if (!await waitUp(zpp, `http://localhost:${ZPORT}/health`, 900)) { killAll(); return { ok: false, built: false, why: 'zone 기동 실패' }; }
    await sleep(growMs);
    killAll();
    await sleep(4000);            // 포트 반납 + DB 플러시
    cp(CDB, P.c); cp(ZDB, P.z);
    if (!fs.existsSync(P.z)) return { ok: false, built: false, why: '씨앗 복사 실패' };
    log('  씨앗 DB 저장 — 다음 실행부터는 곧바로 시작한다');
    return { ok: true, built: true, why: '새로 만들었다', c: P.c, z: P.z };
  } catch (e) {
    killAll();
    return { ok: false, built: false, why: `예외: ${e && e.message}` };
  }
}

module.exports = { SEED_C, SEED_Z, seedPaths, ensureSeed };

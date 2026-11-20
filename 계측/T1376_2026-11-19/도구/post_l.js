'use strict';
// T1376 300날 판 뒤처리 — 사슬이 판 하나를 끝내면(status_<목록>.json done) 곧장 `t1292-xzone-live.js analyze`(고정 포트 안 기다림 · nohold.js)로
//   an_<표지>.json 을 쓰고, 그 판의 존 DB(z_<표지>_*.db* · c_<표지>.db* — 판마다 1.4GB)를 지운다(분석이 DB 메타 행을 읽은 뒤 · 상자 디스크가 판 넷을 못 담는다).
//   node post_l.js L7 L42 LB1020
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const D = __dirname, RUNS = path.join(D, 'runs'), TAGS = process.argv.slice(2);
const doneTags = () => { const s = new Set(); for (const f of fs.readdirSync(D).filter((x) => /^status_final\d+\.json$/.test(x))) { try { for (const d of JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')).done || []) s.add(d.tag); } catch (e) {} } return s; };
const log = (m) => fs.appendFileSync(path.join(D, 'post_l.log'), `${new Date().toISOString()} ${m}\n`);
const left = new Set(TAGS);
const t = setInterval(() => {
  const dn = doneTags();
  for (const tag of [...left]) {
    if (!dn.has(tag)) continue;
    left.delete(tag);
    const wt = tag.startsWith('LB') ? path.join(D, 'wl') : path.join(D, 'wtf2');
    const r = spawnSync(process.execPath, ['-r', path.join(D, 'nohold.js'), 'scripts/t1292-xzone-live.js', 'analyze', RUNS, tag], { cwd: wt, encoding: 'utf8', maxBuffer: 1 << 28 });
    fs.writeFileSync(path.join(RUNS, `an_${tag}.json`), r.stdout || '');
    let ok = false; try { ok = JSON.parse(r.stdout).tag === tag; } catch (e) {}
    log(`${tag} analyze rc=${r.status} bytes=${(r.stdout || '').length} ok=${ok}`);
    if (ok) {
      let n = 0, b = 0;
      for (const f of fs.readdirSync(RUNS)) if (new RegExp(`^(z_${tag}_.*\\.db|c_${tag}\\.db)`).test(f)) { const p = path.join(RUNS, f); b += fs.statSync(p).size; fs.unlinkSync(p); n++; }
      log(`${tag} DB 지움 ${n} · ${(b / 1e9).toFixed(2)}GB`);
    }
  }
  if (!left.size) { clearInterval(t); log('끝'); }
}, 20000);

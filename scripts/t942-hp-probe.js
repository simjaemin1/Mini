// (@regress 없음 — 러너 밖 · T942 계측기 · 제품 무변 · 읽기만 · 판정 0)
// === scripts/t942-hp-probe.js — **마을 몸 HP 관찰자**: 하루 경계마다 NPC 몸 hp 지문 + (문이 있는 트리면) 마을 몸 HP 문 부름 셈 ===
//   쓰는 법(전쟁 자 · 판 자 · 기준선 자 · 다시 뜬 판 탐침): NODE_OPTIONS="--require <이 파일>" … (아이 존 · `T577_OUT` 이 있을 때만 · 주 스레드만)
//     ⇒ `${T942_DIR || dirname(T577_OUT)}/${basename(T577_OUT)}.t942.json` (판 이름은 `T942_TAG` 로 앞에 붙일 수 있다)
//   ★잰다:
//     · 부팅 순간(마을 `init` 끝 — 다시 뜬 판 몸 복원 뒤 · 첫 틱 전 · 날 칸 'init') + 하루 경계(서버 장부 `scanDay` — t577 훅 · t790 · sbc 훅과 같은 문 · 장부를 감싸 같은 인수 · 같은 반환)마다 존 NPC 몸 전부
//       (`pid:hp:isDown` · pid 차례) sha1 앞 12자리 · 몸 수 · hp 합 — 두 트리(문 앞 main ↔ 문 뒤 가지)의 몸 hp 가 날마다 같은가.
//     · 문이 있는 트리(마을 deps 에 `setHp` 가 있다 — T942)면 그 deps 의 문을 같은 인수 · 같은 반환으로 감싸 낱말마다 셈:
//       부름 · 실제로 바뀜 · 같은 값이라 안 씀 · 0 밑(문이 0 으로 깎는다) · maxHp 위(문이 깎는다) · NaN — 깎기가 몇 번 무는지가 곧 "값이 갈릴 수 있었던 자리" 수다.
//   ★관찰만 한다 — 몸 · 세계 값을 안 쓴다(마을 `init` 을 감싸 deps 의 문 하나만 같은 함수로 넘기는 덮개를 씌운다 · 장부 `createLedger` 만 감싼다).
'use strict';
const OUT0 = process.env.T577_OUT || '';
const MAIN = (() => { try { return require('worker_threads').isMainThread; } catch (e) { return true; } })();
if (OUT0 && MAIN) {
  const fs = require('fs'); const path = require('path'); const crypto = require('crypto'); const Module = require('module');
  const OUT = path.join(process.env.T942_DIR || path.dirname(OUT0), (process.env.T942_TAG ? process.env.T942_TAG + '-' : '') + path.basename(OUT0) + '.t942.json');
  const H12 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
  let VIL = null, DEPS = null, door = false;
  const cnt = {}, days = [];
  const sample = (world) => {
    const P = DEPS && DEPS.players; if (!P) return;
    const rows = [];
    let sum = 0;
    for (const [pid, p] of P) { if (!p || !p.isNpc) continue; rows.push(`${pid}:${p.hp}:${p.isDown ? 1 : 0}`); if (Number.isFinite(p.hp)) sum += p.hp; }
    rows.sort();
    days.push([world && world.day != null ? world.day : days.length, rows.length, H12(rows.join('|')), Math.round(sum * 1e6) / 1e6]);
  };
  const dump = () => { try { fs.writeFileSync(OUT, JSON.stringify({ at: Date.now(), door, cnt, days })); } catch (e) {} };
  const _load = Module._load;
  Module._load = function () {
    const m = _load.apply(this, arguments);
    try {
      if (m && typeof m.createLedger === 'function' && !m.__t942s) {
        m.__t942s = true; const mk = m.createLedger;
        m.createLedger = function () { const L = mk.apply(this, arguments); const sd = L.scanDay; L.scanDay = function (world) { try { sample(world); } catch (e) {} return sd.apply(this, arguments); }; return L; };
      }
      if (m && !VIL && m.__p3Bind && typeof m.villageOfCell === 'function' && typeof m.init === 'function') {
        VIL = m; const init0 = m.init;
        m.init = function (deps) {
          DEPS = deps || null;
          if (deps && typeof deps.setHp === 'function') {
            door = true; const D = deps.setHp;
            deps.setHp = function (p, v, why) {
              const c = cnt[why] || (cnt[why] = { n: 0, write: 0, same: 0, lo: 0, hi: 0, nan: 0 });
              const prev = p ? p.hp : undefined, mx = (p && p.maxHp) || 100;
              c.n++; if (Number.isNaN(v)) c.nan++; else if (v < 0) c.lo++; else if (v > mx) c.hi++;
              const r = D.apply(this, arguments);
              if (p && p.hp !== prev) c.write++; else c.same++;
              return r;
            };
          }
          const r = init0.apply(this, arguments);
          try { sample({ day: 'init' }); } catch (e) {}   // 부팅 순간(init 끝 — 다시 뜬 판 몸 복원 뒤 · 첫 틱 전)
          return r;
        };
      }
    } catch (e) {}
    return m;
  };
  process.on('exit', dump);
}

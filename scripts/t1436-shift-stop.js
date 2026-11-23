'use strict';
// (@regress 없음 — 러너 밖 · T1436 판 자 프리로드 · 제품 무변 · 판정 0)
// === scripts/t1436-shift-stop.js — 이어 도는 판 자(`t1308-long-run.js`)의 마디 끝 **멈추는 때만** 하루 경계에서 그날 안 한 점(낮 · 밤)으로 민다 ===
//   `t1308-long-run` 은 마디 끝을 t722 멈춤 팔(`T722_STOP_DAY=S` — S 날 장부 문 = 하루 경계)로만 낸다. 그 자를 고치지 않고
//   부르는 쪽 `NODE_OPTIONS="-r scripts/t1436-shift-stop.js"` 로 얹는다(자의 프리로드 t745 · t722 · t740 · t1308-keep 뒤에 실린다).
//   T1436_STOP_FRAC=f (0 < f < 1) 일 때만 일한다 — 없으면 **아무것도 안 한다**(모듈 하나 읽고 끝 · 판 무변 확인은 보고 T1436 §2):
//     ① t722 가 S 날 장부 문에서 부르는 `__t740Pause` · 자기에게 보내는 SIGTERM 을 **한 번** 붙잡아 미룬다(덤프는 t722 가 이미 썼다).
//     ② 가상 시계의 다음 목표 시각 = (지금 마을 날의 머리 + f × 하루) — 지났으면 하루 뒤 — 에 한 번짜리 타이머를 건다.
//     ③ 그 시각: 원래 `__t740Pause` → t722 덤프(`T722_DUMP`)의 `at` 을 지금 V 로 고쳐 쓴다(+ `t1436` 칸: 목표 · 실제 V · 마을 날 · 하늘 몫) →
//        원래 `process.kill(SIGTERM)`(t745 가 위상을 쓰고 · 제품 종료 문 = T728 종료 저장 · t577 누계 · keep 은 exit 에).
//   다음 마디는 `t1308-long-run` 이 그 덤프의 `at` 을 V0 로 받아 이어 간다(날 뜀 0 고정). 이 훅은 세계 칸을 읽기만 한다(날 · 시계).
//   ⇒ 덤프 `t1436` 칸 · 로그 한 줄 `[t1436] 멈춤 밂 …`
const F = Number(process.env.T1436_STOP_FRAC);
if (!(F > 0 && F < 1) || !process.env.T722_STOP_DAY) return;
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const VILL = path.join(ROOT, 'server', 'villages.js');
const DUMP = process.env.T722_DUMP || '';
const realPause = global.__t740Pause;
const realKill = process.kill;
let held = false, fired = false;
global.__t740Pause = function () { if (!held && !fired) return; if (realPause) return realPause.apply(this, arguments); };
process.kill = function (pid, sig) {
  if (pid === process.pid && sig === 'SIGTERM' && !held && !fired) {
    held = true;
    let st = null; try { const V = require(VILL); st = V.__t740 ? V.__t740() : (V.__t722 ? V.__t722() : null); } catch (e) { st = null; }
    const now = Date.now(), dayMs = st && st.dayMs ? st.dayMs : 1440000, ep = st && st.epoch != null ? st.epoch : 0;
    let tgt = ep + (Math.floor((now - ep) / dayMs) + F) * dayMs; let rolled = 0;
    while (tgt <= now) { tgt += dayMs; rolled++; }
    console.log(`[t1436] 멈춤 밂 — 경계 V ${now} → 목표 V ${tgt}(+${tgt - now}ms · 하루 ${dayMs} · 몫 ${F} · 넘김 ${rolled})`);
    setTimeout(() => {
      fired = true;
      let st2 = null; try { const V = require(VILL); st2 = V.__t740 ? V.__t740() : (V.__t722 ? V.__t722() : null); } catch (e) { st2 = null; }
      if (realPause) realPause();
      const at = Date.now();
      let sky = null; try { const W = require(path.join(ROOT, 'server', 'zone-config')).WORLD; sky = +(((at - (W.worldEpoch || 0)) % W.dayLengthMs) / W.dayLengthMs).toFixed(4); } catch (e) {}
      if (DUMP) try { const o = JSON.parse(fs.readFileSync(DUMP, 'utf8')); o.t1436 = { frac: F, boundaryAt: o.at, target: tgt, at, rolled, worldDay: st2 && st2.world ? st2.world.day : null, tickJobs: !!(st2 && st2.tickJobs), sky }; o.at = at; fs.writeFileSync(DUMP, JSON.stringify(o)); } catch (e) { console.error('[t1436] 덤프 고치기 실패', e.message); }
      console.log(`[t1436] 멈춤 — V ${at} · 마을 날 ${st2 && st2.world ? st2.world.day : '?'} · 하늘 몫 ${sky} · 틱 일 ${!!(st2 && st2.tickJobs)} · SIGTERM`);
      realKill.call(process, process.pid, 'SIGTERM');
    }, tgt - now);
    return true;
  }
  return realKill.apply(this, arguments);
};

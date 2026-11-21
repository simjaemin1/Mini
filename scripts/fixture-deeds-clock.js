'use strict';
// (@regress 없음 — 러너 밖 · T1403 프리로드 · 제품 무변)
// === scripts/fixture-deeds-clock.js — 띄운 존의 **사유지 시계**를 내리지 않고 민다 [T1403 · land1087 PM 덧붙임 셋 · T1402 회부 2] ============
//   왜: 재민 11-20 판정 13(서버가 꺼진 시간은 빚으로 안 센다 · T1402) 뒤, "존을 내렸다 시계를 민 채 다시 띄우는" 판은 "꺼진 채 보름"을 잰다.
//     "켜진 채 보름"을 재려면 존을 띄운 채 사유지 시계만 밀어야 한다 — T1402 가 쓴 그 길(`_t1332SetClock(f)` · 넣은 시계는 물림 없이 그대로 쓴다).
//   쓰는 법(존 프로세스에 싣는다): `NODE_OPTIONS="--require <이 파일>"` + `T1403_DEEDS_CLOCK_FILE=<파일>`.
//     하네스가 그 파일에 민 날(소수 가능)을 쓰고 존에 `SIGUSR2` 를 보내면, 존의 사유지 시계 = (켜진 시간 시계) + 민 날. 0 이면 되돌린다.
//     다 하면 `<파일>.ack` 에 민 날을 쓴다(하네스가 기다릴 자리).
//   ⚠사유지 시계만 민다 — 벽시계 · 날씨 · 경제 시계는 그대로(종전 `clock-shift.js` 는 프로세스 벽시계를 통째로 민다 — 다시 띄우는 판 몫).
const f = process.env.T1403_DEEDS_CLOCK_FILE;
if (f) {
  const fs = require('fs');
  process.on('SIGUSR2', () => {
    let days = 0; try { days = +String(fs.readFileSync(f, 'utf8')).trim() || 0; } catch (e) { days = 0; }
    let done = false;
    try {
      //   프리로드의 `require.main` 은 싣던 때 값(없음)이라 주 모듈은 지금 읽는다
      const mm = process.mainModule || require.main, m = mm && mm.exports, H = m && typeof m.__testBind === 'function' ? m.__testBind() : null;
      if (H && typeof H._t1332SetClock === 'function' && typeof H._t1402Uptime === 'function') {
        const up = H._t1402Uptime, ms = days * 86400000;
        H._t1332SetClock(ms ? () => up() + ms : undefined);
        done = true;
      }
    } catch (e) { done = false; }
    try { fs.writeFileSync(f + '.ack', done ? String(days) : 'none'); } catch (e) {}
  });
}

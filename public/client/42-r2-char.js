// @@split:42-r2-char — R2 — 캐릭터 스프라이트 상태기계·drawCharSprite·drawPlayerIso (T53 ②)
  // Phase 14.35: 걷기 + 공격 모션
  // - moving: walking bob (sin wave) + 다리 교차
  // - attackPhase 0~1: 무기 휘두름 (앞으로 lunge + 회복)
  // ═══════════════ [캐릭터 스프라이트 2026-08-30] 애니 상태기계 ═══════════════
  //   ★재민 확정: **게임엔 3D 가 아니라 스프라이트로 들어간다**(좀보이드 구빌드·디아블로 방식).
  //   시트·메타는 `scripts/char_render.py` 산물(`/assets/char/`). **클라는 규격을 하드코딩하지 않는다** —
  //   프레임 크기·앵커·행/열 순서·클립 fps 를 전부 `char_meta.json` 에서 읽는다.
  //
  //   ★입력은 **이미 오는 값에서 유도**한다(애니를 위한 새 네트워크 필드 0):
  //     · 속도  — 나: 이동 모델 상태 `myVel` / 남: tick 의 `vx,vy`      → idle / walk / run
  //     · 방향  — 나: `myFacingVx/Vy`(조준 중엔 커서) / 남: `_fvx/_fvy`  → 시트 행
  //     · 공격  — `myLastAttackAt` / `others[].lastAttackAt`(기존 broadcast) → swing 원샷
  //     · 조준  — 나: `_aiming`.  ⚠남의 조준은 **네트워크에 없다** → 남은 aim 자세가 안 나온다(회부).
  //   ★프레임 진행은 렌더 프레임(rAF) 기준, 상태는 서버 권위 값에서 유도 — 이 둘을 섞지 않는다.
  let _charMeta = null, _charMetaTried = false;
  const _charImg = new Map();        // key -> {img, ok}
  const _charAnim = new Map();       // pid -> {clip, t, one, oneT, lastAtk, lastT}

  function charMeta() {
    if (_charMeta || _charMetaTried) return _charMeta;
    _charMetaTried = true;
    fetch('/assets/char/char_meta.json').then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (!j || !j.frameW) return;
        _charMeta = j; window.__charMeta = j;
        // ★★전 시트를 **한꺼번에** 미리 받는다. 클립을 처음 쓸 때 게으르게 받으면
        //   ⓐ 그 순간 스프라이트가 도형으로 튀고 ⓑ 상태는 이미 진행했는데 그림만 안 나가
        //   진단 훅이 **낡은 값을 들고 있게** 된다(1차 실행에서 실제로 그렇게 오독했다).
        for (const key of Object.keys(j.sheets || {})) charSheet(key);
      })
      .catch(() => {});
    return null;
  }

  function charSheet(key) {
    let e = _charImg.get(key);
    if (e) return e.ok ? e.img : null;
    const img = new Image();
    e = { img, ok: false };
    _charImg.set(key, e);
    img.onload = () => { e.ok = true; };
    img.onerror = () => { e.ok = false; };
    img.src = '/assets/char/' + key + '.png';
    return null;
  }

  // 월드 방향 → 시트 행. ★메타가 정의한 그 식 그대로(눈대중 금지 — 족보 74).
  function charDirRow(fx, fy) {
    if (!fx && !fy) return 0;
    let d = Math.round(Math.atan2(fy, fx) / (Math.PI / 4));
    return ((d % 8) + 8) % 8;
  }

  // ★★[T81 2026-09-03] **옷 층** — 입은 옷의 재질이 곧 층 이름이다(`clothes_<mat>`).
  //   표는 서버가 보낸 `equipmentMeta.clothes`(정본 `server/clothes.js`) 하나다 — 클라에 사본을 안 둔다.
  //   시트 유무는 `char_meta.json` 의 `layers` 로 확인한다(그것도 서버가 구운 정본이지 사본이 아니다).
  //   ⚠**표 밖 값·시트 없음 → 삼베.** 알몸 금지 규약(고증: 서민 삼베 한 벌)이 여기서도 산다.
  function clothLayerOf(mat) {
    if (!mat) return 'clothes_hemp';
    const tbl = (equipmentMeta && equipmentMeta.clothes) || null;
    if (!tbl || !tbl.some((c) => c && c.id === mat)) return 'clothes_hemp';
    const m = charMeta();
    const key = 'clothes_' + mat;
    return (m && Array.isArray(m.layers) && m.layers.indexOf(key) >= 0) ? key : 'clothes_hemp';
  }
  // 내 옷은 내 장비에서 읽는다(남의 것은 tick 이 실어 온다 — `30-n-net.js`).
  function myClothMat() {
    if (!equipSlots || !equipSlots.clothes) return null;
    const ci = (equipment || []).find((q) => q.id === equipSlots.clothes);
    return ci && ci.mat ? String(ci.mat) : null;
  }
  // 내가 손에 든 것 = **도구 인스턴스 정본**(`getEquippedInstance`) 우선, 없으면 장비 무기 슬롯.
  function myToolType() {
    const ti = getEquippedInstance();
    if (ti && ti.type) return String(ti.type);
    if (equipSlots && equipSlots.weapon) {
      const wi = (equipment || []).find((q) => q.id === equipSlots.weapon);
      if (wi && wi.type) return String(wi.type);
    }
    return '';
  }
  // ★★[T87 2026-09-03] **착장 세 축을 한 함수가 고른다** — 자기든 남이든 **같은 판정**이다.
  //   종전엔 `if (!isMe) return L` 로 남은 옷에서 끊겼다(도구·지게가 네트워크에 없어서였다).
  //   이제 셋 다 온다(`makeEntry` — 옷 재질 · 도구 type · 지게 1비트) ⇒ 갈래를 없앤다.
  //   ★값을 어디서 읽느냐만 갈린다: 나는 내 장비에서, 남은 tick 이 실어 온 값에서. **규칙은 하나다.**
  //   ★그리는 순서 = 몸 → 옷 → 등짐 → 손. 깊이는 시트를 구울 때 홀드아웃(몸)이 이미 잡았다 —
  //     등을 보이는 방향에선 지게가 온전히, 앞을 보는 방향에선 어깨끈만 남는다(굽기가 판정한다).
  //   시트 실루엣은 둘뿐이다: 자루+날(axe) / 긴 장대(rod). 종류 확장은 목록 한 줄 + 재렌더.
  //   ★★[T125 2026-09-05] **주민도 이 함수를 탄다** — `npcCharLayers` 는 지웠다(사본 −1).
  //     종전엔 주민만 별도 함수였고 그래서 **옷이 언제나 삼베로 못 박혀** 있었다. 이제 옷은
  //     `o.clothes`(= 마을 곳간이 정한 재질) 하나에서 오고, 사람도 주민도 **같은 줄**을 지난다.
  //     ⓐ **맨몸이 그려진다** — 곳간이 빈 마을의 주민은 `o.clothes === null` 이고 `o.job` 이 있다.
  //        그때만 옷 층을 **뺀다**(`clothLayerOf(null)` 은 삼베라 그 함수로는 맨몸을 못 그린다).
  //        사람은 벗어도 삼베다(종전 계약 — 장비 없는 몸은 기본 베옷).
  //     ⓑ **도구는 두 출처가 한 자리에서 만난다**: 사람은 `o.tool`(실루엣 둘), 주민은 직업표
  //        (`NPC_JOB_TOOL` — 다섯 실루엣). 직업표를 `tool` 문자열로 접지 **않는다**: 그러면
  //        괭이·채반·창·망치가 도끼/장대 둘로 뭉개진다(§0-ⓑ 표 — 통일이 정보를 줄이는 자리다).
  function charLayersFor(isMe, o) {
    const job = (!isMe && o) ? o.job : null;
    const L = ['body'];
    if (!(job && o && !o.clothes)) L.push(clothLayerOf(isMe ? myClothMat() : (o && o.clothes)));
    const back = isMe ? !!(equipSlots && equipSlots.back) : !!(o && o.carrier);
    if (back && hasCharLayer('back_carrier')) L.push('back_carrier');
    const jt = job ? NPC_JOB_TOOL[job] : null;
    if (jt) { if (hasCharLayer(jt)) L.push(jt); return L; }
    const t = isMe ? myToolType() : String((o && o.tool) || '');
    if (t) L.push(/rod|fish|낚/i.test(t) ? 'tool_rod' : 'tool_axe');
    return L;
  }
  // 시트가 실제로 구워져 있나 — 없는 층을 넣으면 `drawCharSprite` 가 통째로 도형으로 떨어진다.
  function hasCharLayer(key) {
    const m = charMeta();
    return !!(m && Array.isArray(m.layers) && m.layers.indexOf(key) >= 0);
  }

  function charState(pid, speed, aiming, attackAt, dtSec) {
    let st = _charAnim.get(pid);
    if (!st) { st = { clip: 'idle', t: 0, one: null, oneT: 0, lastAtk: attackAt || 0 }; _charAnim.set(pid, st); }
    const m = _charMeta;
    // 공격 트리거 = lastAttackAt 이 **커졌을 때** 한 번(에지). 값 자체가 아니라 변화를 본다.
    if (attackAt && attackAt > st.lastAtk) { st.lastAtk = attackAt; st.one = 'swing'; st.oneT = 0; }
    if (st.one) {
      const c = m.clips[st.one];
      st.oneT += dtSec;
      if (st.oneT * c.fps >= c.frames) st.one = null;   // 원샷 끝 → 이전 상태 복귀
    }
    let clip = 'idle';
    if (speed > (uiCfg.charRunMin || 102)) clip = 'run';
    else if (speed > (uiCfg.charWalkMin || 4)) clip = 'walk';
    if (aiming && clip === 'idle') clip = 'aim';
    if (st.clip !== clip) { st.clip = clip; st.t = 0; }
    st.t += dtSec;
    const active = st.one || st.clip;
    const c = m.clips[active];
    let fi;
    if (st.one) fi = Math.min(c.frames - 1, Math.floor(st.oneT * c.fps));
    else fi = Math.floor(st.t * c.fps) % c.frames;
    return { clip: active, frame: fi };
  }

  /** 스프라이트로 그린다. 성공하면 true — 실패(시트 미로딩·플래그 OFF)면 false 로 도형 경로에 넘긴다. */
  function drawCharSprite(x, y, isMe, opts) {
    if (!uiCfg.charSprite) return false;
    const m = charMeta();
    if (!m) return false;
    // ★[T125] 사람이든 주민이든 **한 함수**다(옛 `npcCharLayers` 갈래는 없앴다 — 사본 0).
    const layers = charLayersFor(isMe, opts);
    // ★한 장이라도 안 떠 있으면 **아무것도 안 그린다** — 반쪽 합성(몸만·옷만)이 화면에 나가면
    //   "픽셀 정렬 0px" 계약이 지켜지는지 눈으로 볼 수 없다. 다 뜰 때까지 도형으로 버틴다.
    const st0 = _charAnim.get(opts.pid);
    const now = performance.now();
    const dtSec = st0 && st0.lastT ? Math.min(0.25, (now - st0.lastT) / 1000) : 0;
    const stt = charState(opts.pid, opts.speed || 0, !!opts.aiming, opts.attackAt || 0, dtSec);
    _charAnim.get(opts.pid).lastT = now;
    const imgs = [];
    for (const L of layers) {
      const img = charSheet(L + '_' + stt.clip);
      if (!img) {
        // ★훅은 여기서도 갱신한다 — 안 그러면 "안 그려짐"이 "낡은 값"으로 위장한다.
        if (!window.__charDbg) window.__charDbg = {};
        window.__charDbg[opts.pid] = { on: false, why: 'sheet:' + L + '_' + stt.clip,
                                       clip: stt.clip, isMe: !!isMe, t: performance.now() };
        return false;
      }
      imgs.push(img);
    }
    const row = charDirRow(opts.fvx, opts.fvy);
    // ★그리는 순서는 몸→옷→도구로 **고정**이다. 깊이는 시트를 구울 때 홀드아웃이 이미 잡았다
    //   (`scripts/char_render.py` 의 set_visible 주석). 한때 메타의 순서표를 프레임마다 읽어
    //   뒤집었는데(2026-08-31 오전), 그건 부분해였고 3차에서 홀드아웃으로 대체됐다.
    const fw = m.frameW, fh = m.frameH;
    const sx = stt.frame * fw, sy = row * fh;
    const dx = Math.round(x - m.anchorX), dy = Math.round(y - m.anchorY);
    // 발밑 그림자 — 도형 경로와 같은 자리·같은 크기(시트가 바뀌어도 접지감은 유지)
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
    for (const img of imgs) ctx.drawImage(img, sx, sy, fw, fh, dx, dy, fw, fh);
    // ★진단 훅은 **pid 별**이다 — 마지막에 그린 하나만 남기면 "타 플레이어도 같은 애니"를 못 잰다.
    if (!window.__charDbg) window.__charDbg = {};
    window.__charDbg[opts.pid] = { on: true, clip: stt.clip, frame: stt.frame, row,
                         layers: layers.slice(),
                         job: opts.job || null,      // ★[T13] NPC 직업 — 하네스가 표식을 판정하는 재료
                         clothes: opts.clothes || null,   // ★[T125] 서버가 실어 온 옷 재질(주민은 마을 곳간)

                         speed: +(opts.speed || 0).toFixed(2),
                         aiming: !!opts.aiming, isMe: !!isMe, fw, fh,
                         facing: [+(opts.fvx || 0).toFixed(4), +(opts.fvy || 0).toFixed(4)],
                         anchor: [m.anchorX, m.anchorY], t: performance.now() };
    return true;
  }

  function drawPlayerIso(x, y, name, color, isMe = false, opts = {}) {
    const t = performance.now() * 0.01;
    const moving = opts.moving || false;
    const isDown = !!opts.isDown; // Phase 14.41
    const attackP = Math.max(0, opts.attackPhase || 0); // 0=쉼, 1=시작, 0.5=중간
    // §18 3파: 포로 표식 — 발치 회색 테두리 링(호송·억류. 서버 makeEntry cap 1비트)
    if (opts.cap) { ctx.strokeStyle = 'rgba(200,200,200,0.85)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y + 4, 11, 4.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    // Phase 14.41: 다운 — 누워있는 모습 (옆으로 길게)
    if (isDown) {
      // 그림자 크게
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath(); ctx.ellipse(x, y + 4, 14, 4, 0, 0, Math.PI * 2); ctx.fill();
      // 몸통 (옆으로 누움)
      ctx.fillStyle = color;
      ctx.fillRect(x - 12, y - 2, 22, 7);
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(x - 12, y - 2, 22, 7);
      // 머리 (한쪽 끝)
      ctx.beginPath(); ctx.arc(x + 12, y + 1, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f0d8b8'; ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
      // X 눈 (다운)
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x + 10, y - 1); ctx.lineTo(x + 13, y + 2);
      ctx.moveTo(x + 13, y - 1); ctx.lineTo(x + 10, y + 2); ctx.stroke();
      // 이름 + 💀
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8888';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
      ctx.strokeText('× ' + name, x, y - 12);
      ctx.fillText('× ' + name, x, y - 12);
      ctx.textAlign = 'start';
      return;
    }
    // §4-4 P4: 전쟁 병사 전투 스타일 — 기존 휴머노이드 경로(서버 위치 보간·걷기)를 유지하고
    //   병종색(bt)·진영 테두리(bs)·궤주 반투명(br)·지휘관 금테(bc)만 덧입힘("전투 스타일 분기만 추가").
    const isWar = !!opts.war;
    const bodyColor = isWar ? (WAR_BT_COL[opts.bt | 0] || color) : color;
    const _aSave = ctx.globalAlpha;
    if (isWar && opts.br) ctx.globalAlpha = _aSave * 0.45;   // 궤주=반투명
    // Phase 14.37: facing — vx/vy를 iso 화면 방향으로 변환
    // world(vx,vy) → iso 화면 dx,dy: dx = vx-vy, dy = (vx+vy)/2
    const fvx = opts.fvx || 0, fvy = opts.fvy || 0;
    const fdx = fvx - fvy;
    const fdy = (fvx + fvy) * 0.5;
    const flen = Math.hypot(fdx, fdy) || 1;
    const facingX = fdx / flen, facingY = fdy / flen; // 화면상 방향 unit vector
    // walk bob (위아래 살짝)
    const bob = moving ? Math.sin(t * 1.3) * 1.6 : 0;
    // attack lunge (앞으로 살짝 — 화면상 동남 방향)
    const lungeAmt = Math.sin(attackP * Math.PI) * 5;
    const lx = x + lungeAmt * 0.5;
    const ly = y + lungeAmt * 0.3;

    // 그림자 — 발이 움직일 때도 그림자 고정
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

    // 다리 (걷기 시 좌우 교차)
    const legSwing = moving ? Math.sin(t * 1.8) * 2 : 0;
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(lx - 4, ly + 3, 3, 5 - legSwing);
    ctx.fillRect(lx + 1, ly + 3, 3, 5 + legSwing);

    // 몸통 (bob 적용) — 전쟁 병사는 병종색
    ctx.fillStyle = bodyColor;
    ctx.fillRect(lx - 5, ly - 6 + bob, 10, 12);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1;
    ctx.strokeRect(lx - 5, ly - 6 + bob, 10, 12);
    if (isWar) { ctx.strokeStyle = WAR_SIDE_COL[opts.bs | 0] || '#fff'; ctx.lineWidth = 2; ctx.strokeRect(lx - 6, ly - 7 + bob, 12, 14); }   // 진영 테두리(0공격 파랑·1방어 빨강)

    // 팔 + 슬래시 (공격 시 앞쪽으로 휘두름)
    if (attackP > 0) {
      // 팔
      ctx.strokeStyle = '#f0d8b8'; ctx.lineWidth = 2;
      const swing = Math.sin(attackP * Math.PI);
      const armX = lx + facingX * 8 + swing * facingX * 6;
      const armY = ly - 2 + bob + facingY * 4 + swing * facingY * 3;
      ctx.beginPath();
      ctx.moveTo(lx + facingX * 2, ly + bob + facingY * 1);
      ctx.lineTo(armX, armY);
      ctx.stroke();
      // Phase 14.38: 슬래시 호 — facing 방향 앞쪽에 짧은 흰 arc (반투명)
      const slashR = 16;
      const slashCx = lx + facingX * 10;
      const slashCy = ly + bob + facingY * 6;
      const baseAng = Math.atan2(facingY, facingX);
      // 호 각도: attackP 0→1 진행 따라 -π/3 → +π/3 회전 (휘두름)
      const sweep = (attackP - 0.5) * (Math.PI * 0.8);
      ctx.strokeStyle = `rgba(255, 255, 255, ${attackP * 0.7})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(slashCx, slashCy, slashR, baseAng + sweep - 0.4, baseAng + sweep + 0.4);
      ctx.stroke();
    }

    // 머리 (bob 적용)
    const hx = lx, hy = ly - 11 + bob;
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#f0d8b8'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    // Phase 14.37: 눈 (facing 방향) — 작은 검은 점 2개
    if (fvx !== 0 || fvy !== 0) {
      const eyeOX = facingX * 2.5, eyeOY = facingY * 1.5;
      // 두 눈 (좌우 분리) — facing에 수직인 방향
      const perpX = -facingY, perpY = facingX;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(hx + eyeOX + perpX * 1.5, hy + eyeOY + perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(hx + eyeOX - perpX * 1.5, hy + eyeOY - perpY * 1.5, 0.9, 0, Math.PI*2); ctx.fill();
    }

    // §4-4 P4: 지휘관 금테 + ★ (bc) — 발치 금색 링 + 머리 위 별.
    if (isWar && opts.bc) {
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(lx, ly + 6, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe14d'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★', hx, hy - 8); ctx.textAlign = 'start';
    }
    if (isWar) ctx.globalAlpha = _aSave;   // 알파 복원 — 이름표는 정상 가시(궤주여도 라벨 판독)

    // 이름표 — ★[T57 2026-09-03] **함수 하나로 뺐다.** 아래 `drawNameTag` 참조.
    drawNameTag(x, y, name, isMe, opts.act);
  }

  // ★★[T57 2026-09-03] **이름표·행동 라벨은 그리기 경로가 둘이어도 함수 하나다.**
  //   결함 기전: 이 블록은 옛 도형 경로(`drawPlayerIso`) **안에** 있었다. 시트 배치(T13)가
  //   들어와 `drawCharSprite` 가 성공하면 호출자가 `if (!_spriteOk) drawPlayerIso(...)` 로
  //   도형 경로를 **안 부르므로**, 사람 머리 위 이름이 통째로 사라졌다
  //   (`34-m-renderloop.js` — HP 바·말풍선은 호출자에 있어 살아남았고 이름표만 빠졌다).
  //   ⇒ 블록을 **옮긴다**(복사가 아니다 — 이 레포의 제1 금기). 두 경로가 같은 함수를 부른다.
  //   ⚠NPC 도 이 함수를 탄다. 도형 경로가 종전에 NPC 에 무엇을 찍었는지 실측했다:
  //     호출자가 넘기는 `name` 은 `displayName`(= 직업 이모지 + [부족] + 이름)이고
  //     `simJob` 은 그 이모지로 이미 들어가 있다(`34-m-renderloop.js` `_sjEmoji`).
  //     ⇒ **종전 그대로** 둔다. 새 표시를 발명하지 않는다(다르게 하려면 회부).
  function drawNameTag(x, y, name, isMe, act) {
    if (!name) return;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isMe ? '#fff' : '#cdd6e3';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, x, y - 22);
    ctx.fillText(name, x, y - 22);
    // ★[액션 라벨 — 생활 층 100% 가시화] 이름 위 작은 행동 라벨(모내기·잠행·추적·개간·건축·취침…) — 서버 makeEntry e.act
    if (act && !isMe) {
      ctx.font = '9px sans-serif';
      ctx.fillStyle = '#ffd77a';
      ctx.lineWidth = 2.5;
      ctx.strokeText(act, x, y - 33);
      ctx.fillText(act, x, y - 33);
    }
    ctx.textAlign = 'start';
  }


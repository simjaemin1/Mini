// @@split:51-s-side — S 사회스킬 — 스킬·클레임·컨테이너

  // 14.49-e7an: 스킬 패널 프로토타입 (UI only, hardcoded values)
  const PROTO_SKILLS = {
    production: [
      { id: 'farming',   name: '농사', icon: '🌾', level: 1, exp: 0 },
      { id: 'foraging',  name: '채집', icon: '🌿', level: 1, exp: 0 },
      { id: 'fishing',   name: '낚시', icon: '🎣', level: 1, exp: 0 },
      { id: 'mining',    name: '채광', icon: '⛏️', level: 1, exp: 0 },
      { id: 'carpentry', name: '목공', icon: '🪚', level: 1, exp: 0 },
      { id: 'medicine',  name: '의료', icon: '💊', level: 1, exp: 0 },
    ],
    combat: [
      { id: 'sword',  name: '검술', icon: '⚔️', level: 1, exp: 0 },
      { id: 'spear',  name: '창술', icon: '🔱', level: 1, exp: 0 },
      { id: 'bow',    name: '궁술', icon: '🏹', level: 1, exp: 0 },
      { id: 'axe',    name: '도끼', icon: '🪓', level: 1, exp: 0 },
      { id: 'shield', name: '방패', icon: '🛡️', level: 1, exp: 0 },
    ],
  };
  const PROTO_TALENT = { used: 0, max: 30 };

  function expForLevel(lv) { return 50 + lv * lv * 25; } // 1→100, 2→200, 3→375...

  function renderSkillsPanel(body) {
    const totalLevel = [...PROTO_SKILLS.production, ...PROTO_SKILLS.combat].reduce((s, k) => s + k.level, 0);
    function skillRow(s) {
      const need = expForLevel(s.level);
      const pct = Math.min(100, Math.floor(s.exp / need * 100));
      return `<div class="skill-row">
        <span class="skill-icon">${s.icon}</span>
        <span class="skill-name">${s.name}</span>
        <span class="skill-lv">Lv ${s.level}</span>
        <div class="skill-bar"><div class="skill-bar-fill" style="width:${pct}%"></div><span class="skill-bar-text">${s.exp}/${need}</span></div>
        <button class="skill-talent-btn" data-skill="${s.id}" title="특성 (분야 ${s.level}개까지 가능)">⭐ 0/${s.level}</button>
      </div>`;
    }
    body.innerHTML = `
      <style>
        .skill-section-head { color:#f0c674; font-size:13px; font-weight:bold; padding:8px 4px 4px; }
        .skill-row { display:flex; align-items:center; gap:6px; padding:5px 4px; border-bottom:1px solid #2a3038; }
        .skill-icon { font-size:18px; width:24px; text-align:center; }
        .skill-name { width:46px; color:#cfd6dd; font-size:12px; }
        .skill-lv { width:42px; color:#8a93a0; font-size:11px; }
        .skill-bar { flex:1; height:14px; background:#1a1f25; border:1px solid #2a3038; position:relative; overflow:hidden; border-radius:2px; }
        .skill-bar-fill { height:100%; background:linear-gradient(90deg,#3a7a3a,#5aa55a); transition:width 0.3s; }
        .skill-bar-text { position:absolute; top:0; left:0; right:0; bottom:0; text-align:center; color:#cfd6dd; font-size:10px; line-height:14px; text-shadow:0 0 2px #000; }
        .skill-talent-btn { background:#2a3038; color:#cfd6dd; border:1px solid #3a4048; padding:2px 6px; font-size:10px; cursor:pointer; border-radius:2px; }
        .skill-talent-btn:hover { background:#3a4048; }
        .skill-pool { background:#1a1f25; padding:8px; border:1px solid #2a3038; border-radius:3px; margin:8px 4px; text-align:center; }
        .skill-pool-bar { height:10px; background:#0a0e12; border:1px solid #2a3038; margin-top:4px; border-radius:2px; overflow:hidden; }
        .skill-pool-fill { height:100%; background:linear-gradient(90deg,#5a7ad8,#9aafe0); }
        .skill-hint { color:#6c7686; font-size:10px; padding:4px; text-align:center; }
      </style>
      <div class="skill-pool">
        <div style="color:#cfd6dd;font-weight:bold">⭐ 특성 포인트 ${PROTO_TALENT.used}/${PROTO_TALENT.max}</div>
        <div class="skill-pool-bar"><div class="skill-pool-fill" style="width:${PROTO_TALENT.used/PROTO_TALENT.max*100}%"></div></div>
        <div style="color:#8a93a0;font-size:10px;margin-top:3px">총 레벨 ${totalLevel}</div>
      </div>
      <div class="skill-section-head">🛠️ 생산</div>
      ${PROTO_SKILLS.production.map(skillRow).join('')}
      <div class="skill-section-head" style="margin-top:8px">⚔️ 전투</div>
      ${PROTO_SKILLS.combat.map(skillRow).join('')}
      <div class="skill-hint">프로토타입 — 활동 시 자동으로 exp 쌓이는 시스템은 다음 단계</div>
    `;
    body.querySelectorAll('.skill-talent-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showNotice(`${btn.dataset.skill} 특성 트리 — 다음 단계에서 구현`);
      });
    });
  }

  // Phase 14.26: 사유지 패널 — 내 claim 목록 + 해제 + 위치 텔레포트 안내
  function renderClaimsPanel(body) {
    const KIND_ICON = { personal: '🏠', temporary: '⛺', guild: '🏛️' };
    const KIND_NAME = { personal: '개인', temporary: '임시', guild: '길드영토' };
    const my = [];
    for (const c of conns.values()) {
      for (const cl of c.claims.values()) {
        if (cl.ownerPid !== (myPlayerId || myUsername)) continue;   // ★[배치 13] 영속 신원으로 대조 — 게스트도 제 사유지를 제 것으로 본다
        my.push(cl);
      }
    }
    my.sort((a, b) => (a.kind || 'z').localeCompare(b.kind || 'z') || (a.createdAt - b.createdAt));
    const counts = { personal: 0, temporary: 0, guild: 0 };
    for (const cl of my) counts[cl.kind || 'personal']++;
    const list = my.length === 0
      ? '<div style="color:#6c7686;padding:14px;text-align:center">설치한 사유지가 없습니다</div>'
      : my.map(cl => {
          const k = cl.kind || 'personal';
          return `<div class="sp-list-row">
            <span>${KIND_ICON[k]} ${KIND_NAME[k]} @ (${cl.x},${cl.y})</span>
            <button class="craft-btn" data-unclaim="${cl.id}" style="background:#b03030;padding:3px 8px">해제</button>
          </div>`;
        }).join('');
    body.innerHTML = `
      <div class="hint">슬롯 사용: 개인 ${counts.personal}/9 · 임시 ${counts.temporary}/4 · 길드영토 ${counts.guild}/50</div>
      <div class="hint" style="font-size:11px;opacity:0.7;margin-bottom:10px">
        <b>C</b>=개인 사유지 (길드 영토 안만) · <b>T</b>=임시 (어디든) · <b>Shift+C</b>=길드 영토 (멤버만)<br/>
        해제하면 슬롯 회수. 자원은 환불 안 됨. 다른 위치 가서 다시 설치 가능.
      </div>
      <div class="inv-col-head">내 사유지 목록 (${my.length}개)</div>
      ${list}
    `;
    body.querySelectorAll('[data-unclaim]').forEach(btn => btn.onclick = () => {
      if (!confirm('이 사유지를 해제하시겠습니까? (자원 환불 X)')) return;
      sendPrimary({ type: 'unclaim', claimId: btn.dataset.unclaim });
      setTimeout(() => renderClaimsPanel(body), 200);
    });
  }

  // Phase 14.20: 깜빡 fix — 패널 갱신 빈도 3초로 (이전 1초). content hash 비교는 다음 sprint.
  // 길드 패널: 사용자가 입력 안 했으면 안 갱신 (fetch 깜빡 방지). 옛 1초 setInterval 폐기.
  let lastSideRenderAt = 0;
// @@moved:14155

  // === Phase 14.21: 좀보이드 정통 인벤 — 좌(내인벤) | 가운데(활성 컨테이너) | 우(컨테이너 탭) ===
  const ITEM_CAT = {
    wood: '자재', stone: '자재', ore: '자재', pillar: '자재', rafter: '자재', thatch: '자재',
    berry: '음식', meat_raw: '음식', meat_cooked: '음식', berry_jam: '음식', herb: '약초',
    food: '음식', food_cooked: '음식', fish: '음식', fish_cooked: '음식',   // ★[곡물 품목화]
    twig: '자재', pebble: '자재',   // ★[빈손 시작] 줍는 재료
    water_bottle: '음료',
    fiber: '잡화', seed_berry: '씨앗', hide: '잡화',
    axe: '도구', pickaxe: '도구', sword: '도구',
    // ★[2026-08-02] 야금 — 인벤 창은 분류로 정렬한다. 분류가 없으면 'zzz' 로 밀려 잡동사니 뒤에 섞인다.
    ore_chunk: '야금', iron_ore: '야금', charcoal: '야금',
    iron: '야금', copper: '야금', tin: '야금', lead: '야금', silver: '야금', gold: '야금',
    nickel: '야금', meteoric_iron: '야금', coal: '야금', jade_raw: '야금', marble: '자재', tungsten: '야금',
  };

  // 근처 모든 chest (120px 반경)
  function nearbyContainers() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const b of pc.buildings.values()) {
      if (b.type !== 'chest' && b.type !== 'guild_granary') continue;   // ★길드 곳간=대형 공유 컨테이너(chest 경로 공용)
      const absX = ox + b.x, absY = oy + b.y;
      const d = Math.hypot(absX - myAbsPredicted.x, absY - myAbsPredicted.y);
      if (d <= 120) list.push({ b, d, absX, absY });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  // 활성 컨테이너 (사용자 선택 또는 가까운 거 자동)
  let activeContainerId = null;
  // 외부에서 호출: chest 클릭하면 인벤 열고 그 chest 선택
  window.openInvWithContainer = function openInvWithContainer(chestId) {
    activeContainerId = chestId;
    openInv();
  };

  // Phase 14.25: 내 사유지 카운트 (kind별)
  function countMyClaimsClient() {
    let p = 0, t = 0, g = 0;
    for (const c of conns.values()) {
      for (const cl of c.claims.values()) {
        if (cl.ownerPid !== (myPlayerId || myUsername)) continue;   // ★[배치 13] 영속 신원으로 대조 — 게스트도 제 사유지를 제 것으로 본다
        if (cl.kind === 'temporary') t++;
        else if (cl.kind === 'guild') g++;
        else p++;
      }
    }
    return `개인 ${p}/9 · 임시 ${t}/4 · 길드영토 ${g}/50`;
  }

  // 근처 ground items (80px 반경) — 바닥 pseudo-container 내용
  function nearbyGroundItems() {
    const list = [];
    if (!primaryZoneId) return list;
    const pc = conns.get(primaryZoneId);
    if (!pc || !pc.meta || !pc.groundItems) return list;
    const ox = pc.meta.worldOffsetX || 0, oy = pc.meta.worldOffsetY || 0;
    for (const gi of pc.groundItems.values()) {
      const absX = ox + gi.x, absY = oy + gi.y;
      const d = Math.hypot(absX - myAbsPredicted.x, absY - myAbsPredicted.y);
      if (d <= 100) list.push({ gi, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ★★[정비 배치 2026-08-30 재민 확정] **목록은 한 벌이다.**
  //
  //   실기 1차가 잡은 결함: 바닥은 드롭 인스턴스마다 한 줄, 인벤은 품목마다 한 줄 —
  //   **같은 물건인데 목록의 종류가 달랐다.** 재민 원문: *"바닥에 떨어진 아이템 목록과
  //   인벤토리 안의 아이템 목록이 같은 종류의 인스턴스가 아닌가봐?"* 맞다. 원인은 UI 취향이 아니라
  //   **두 벌로 짜인 코드**였다(전리품 표가 두 벌이라 플레이어와 NPC가 다른 걸 줍던 그 사고의 UI판).
  //
  //   재민이 준 답(좀보이드 문법): *"기본적으로 한 줄로 나오되, 펼칠 수 있게. 펼칠 수 있어지면
  //   각 줄을 따로 드롭도 가능하고, 원래 한 줄을 드래그하면 모든 아이템이 드롭되고."*
  //
  //   규칙:
  //     · 같은 품목은 **기본 접힘** — "물고기 ×3 · 4.2kg"
  //     · 펼칠 것이 **둘 이상**일 때만 ▶ 가 돋는다(하나면 펼쳐도 같은 줄이라 뜻이 없다)
  //     · 하위 줄 = 개체(개별 kg) 또는 로트(취득일·나이) — **어느 쪽인지는 서버 페이로드가 정한다**
  //     · 무기한 벌크(잔가지·섬유)는 하위 줄이 없다 = ▶ 없음 (무게 3층 캐논 그대로)
  //     · 버튼 = 1개 · 드래그 = 그 줄 전부(부모면 전량)
  //
  //   ★클라는 "무엇이 개체형인가" 표를 **들지 않는다.** 원장이 실려 오면 펼치고, 안 오면 못 펼친다.
  //     표를 클라에 두는 순간 그게 사본이고, 어종이 늘면 갈린다.
  // ═══════════════════════════════════════════════════════════════════════════

  const ULK = (col, item) => col + '|' + item;
  const _ulEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const _ulN = (n) => (Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''));

  // 이 품목 n개의 실제 무게 — 원장이 있으면 **원장 합**, 없으면 표준 kg × 수량.
  //   (원장이 개수보다 짧을 일은 서버 쓸개가 없앴지만, 옛 페이로드가 섞여도 안 틀리게 남겨 둔다.)
  function ulKg(item, n) {
    const led = myLedger && myLedger[item];
    const std = (itemWeights && itemWeights[item]) || 0;
    if (Array.isArray(led) && led.length) {
      let s = 0; for (const e of led) s += e.kg || 0;
      if (led.length < n) s += (n - led.length) * std;
      return s;
    }
    return std ? std * n : null;
  }

  // ── 컬럼별 줄 만들기 — **모양은 하나**다: { item, count, kg, kids, drag } ──
  // ★★[인벤 마무리 2026-08-30 재민 확정] **도구도 같은 목록에 선다.**
  //   종전엔 도구만 딴 표(`toolRowsHtml`)였다 — 착용·단축키 버튼이 있어서였는데,
  //   그 때문에 "같은 물건인데 목록이 둘"이라는 **비대칭이 도구 쪽에 남아 있었다**.
  //   이제 도구도 접힘/펼침/드롭을 그대로 받는다. 착용·단축키는 **하위 줄의 우클릭**으로 간다.
  //   도구는 태생이 개체라 하위 줄이 곧 그 도구다(원장이 필요 없다 — 무게 3층의 1층).
  function ulRowsTools() {
    const by = new Map();
    for (const t of (toolItems || [])) {
      if (!t || !t.type) continue;
      if (!by.has(t.type)) by.set(t.type, []);
      by.get(t.type).push(t);
    }
    const out = [];
    for (const [type, list] of by) {
      const w = (itemWeights && itemWeights[type]) || 0;
      const kids = list.length >= 2 ? list.map((t) => ({
        k: 't' + t.id,
        label: `내구 ${t.d}/${t.max}` + (equipped === t.id ? ' <span class="ul-age">✓장착</span>' : '')
             + (hotkey1 === t.id ? ' <span class="ul-age">⌨1</span>' : ''),
        drag: { kind: 'mine', item: type, toolId: t.id, n: 1 },
      })) : null;
      out.push({ item: type, count: list.length, kg: w ? w * list.length : null, kids, tool: true,
        badge: list.some((t) => equipped === t.id) ? '✓' : '',
        drag: { kind: 'mine', item: type, toolId: list[0].id, n: 1, toolIds: list.map((t) => t.id) } });
    }
    return out;
  }

  function ulRowsMine(inv) {
    const out = [];
    for (const [item, v] of Object.entries(inv || {})) {
      const n = Math.floor(Number(v) || 0);
      if (n <= 0 || item === 'floor' || item === 'tribe_id' || item === 'sim' || item === 'kind') continue;
      const led = myLedger && myLedger[item], lot = myLots && myLots[item];
      let kids = null;
      if (Array.isArray(led) && led.length >= 2) {
        // 개체 — 낱개마다 제 무게가 있다. 지목 드롭은 원장 id 로 간다.
        kids = led.map((e) => ({
          k: 'i' + e.id,
          // 나이는 **있을 때만** 적는다 — "0일째"는 뜻 없는 소음이고, 로트 줄과 말투도 맞춘다.
          label: `${e.kg.toFixed(2)}kg` + (() => {
            const age = Number.isFinite(e.d) ? Math.max(0, (window.__evGameDay | 0) - e.d) : 0;
            return age > 0 ? ` <span class="ul-age">${age}일 전</span>` : '';
          })(),
          drag: { kind: 'mine', item, ids: [e.id], n: 1 },
        }));
      } else if (Array.isArray(lot) && (lot.length >= 2 || lot.some((l) => l.stage && l.stage !== 'fresh'))) {
        // ★★[부패 배치 2026-08-31] 로트 — 취득일이 다르면 다른 몫이다. **파 둔 자리에 신선도 칸을 채운다**
        //   (새 컴포넌트 0 · 값은 전부 서버가 준 것 — 클라가 곡선을 다시 계산하면 그게 사본이다).
        //   ★펼침 조건이 `>= 2` 였다: 로트가 하나면 접혀서 **시들어 가는 걸 볼 수가 없었다.**
        //     이제 **성하지 않은 로트가 하나라도 있으면** 편다 — 상하는 중인 건 보여야 한다.
        kids = lot.map((l) => ({
          k: 'l' + l.day,
          label: `${_ulN(l.n)}개 <span class="ul-age">${l.ageDays}일 전</span>`
            + (l.stage ? ` <span class="ul-age" style="color:${PRESERVE_STAGE_COLOR[l.stage] || '#8a93a0'}">${PRESERVE_STAGE_EMO[l.stage] || ''}${PRESERVE_STAGE_KO[l.stage] || ''}${l.stage === 'spoiled' ? '' : ` ${Math.round((l.fresh || 0) * 100)}%`}</span>` : '')
            + (l.coalesced ? ' <span class="ul-age">(묶임)</span>' : ''),
          drag: { kind: 'mine', item, lotDay: l.day, n: Math.max(1, Math.floor(l.n)) },
        }));
      }
      out.push({ item, count: n, kg: ulKg(item, n), kids, drag: { kind: 'mine', item, n } });
    }
    return out;
  }
  function ulRowsGround(gItems) {
    const by = new Map();
    for (const { gi } of gItems) { if (!by.has(gi.item)) by.set(gi.item, []); by.get(gi.item).push(gi); }
    const out = [];
    for (const [item, gis] of by) {
      const count = gis.reduce((s, g) => s + (g.count || 0), 0);
      let kg = 0, anyKg = false;
      for (const g of gis) { if (g.kg > 0) { kg += g.kg; anyKg = true; } else { const w = (itemWeights && itemWeights[item]) || 0; kg += w * (g.count || 0); if (w) anyKg = true; } }
      // 바닥은 **덩이가 둘 이상일 때** 펼친다 — 실제로 서로 다른 더미가 둘이라는 사실 그대로다.
      const kids = gis.length >= 2 ? gis.map((g) => ({
        k: 'g' + g.id,
        label: `×${g.count}` + (g.kg > 0 ? ` · ${g.kg.toFixed(2)}kg` : ''),
        drag: { kind: 'ground', item, giIds: [g.id], n: g.count },
      })) : null;
      out.push({ item, count, kg: anyKg ? kg : null, kids, drag: { kind: 'ground', item, giIds: gis.map((g) => g.id), n: count } });
    }
    return out;
  }
  function ulRowsChest(data, cid) {
    const out = [];
    // ★★[상자 원장 2026-08-30] 상자도 개체를 담는다 — `data._led[item] = [{kg,d?}]`.
    //   그래서 상자 줄도 **펼쳐진다**. 종전엔 "하위 줄이 없는 게 사실"이었지만 이제 아니다.
    const led = (data && data._led && typeof data._led === 'object') ? data._led : null;
    for (const [item, v] of Object.entries(data || {})) {
      const n = Math.floor(Number(v) || 0);
      if (n <= 0 || item === 'floor' || item === 'tribe_id' || item.startsWith('_')) continue;
      const w = (itemWeights && itemWeights[item]) || 0;
      const arr = led && Array.isArray(led[item]) ? led[item] : null;
      let kg = w ? w * n : null;
      if (arr && arr.length) {
        let sum = 0; for (const e of arr) sum += e.kg || 0;
        if (arr.length < n) sum += (n - arr.length) * w;
        kg = sum;
      }
      // ★상자 안 개체는 **주소가 없다**(원장 id 를 상자에 안 싣는다 — FIFO 로만 나온다).
      //   그래서 하위 줄은 **보여 주기만** 한다(개별 인출은 회부 — 그 줄엔 드래그 짐을 안 단다).
      const kids = (arr && arr.length >= 2) ? arr.map((e, i) => ({
        k: 'c' + i, label: `${(e.kg || 0).toFixed(2)}kg`, drag: null,
      })) : null;
      out.push({ item, count: n, kg, kids, drag: { kind: 'chest', item, cid, n } });
    }
    return out;
  }

  // ── 한 벌뿐인 렌더러 ────────────────────────────────────────────────────────
  //   세 컬럼이 이 함수를 쓴다. e2e 가 DOM 구조 동일성(.ul-row/.ul-sub/.ul-caret)을 지킨다.
  function ulRenderRows(rows, col, opts) {
    opts = opts || {};
    if (!rows.length) return `<tr class="ul-empty"><td colspan="4" style="color:#6c7686;text-align:center;padding:20px">${opts.empty || '(비어있음)'}</td></tr>`;
    rows.sort((a, b) => {
      const ca = ITEM_CAT[a.item] || 'zzz', cb = ITEM_CAT[b.item] || 'zzz';
      return ca.localeCompare(cb) || a.item.localeCompare(b.item);
    });
    return rows.map((r) => {
      const key = ULK(col, r.item);
      const open = ulOpen.has(key);
      const nKids = r.kids ? r.kids.length : 0;
      const icon = itemIconHtml(r.item, 22);
      const label = itemKo(r.item);   // ★[T55] 인벤 행 — 정본 우선(`oyster`·`brine` 이 영문으로 뜨던 자리)
      const cat = ITEM_CAT[r.item] || '기타';
      const kgTxt = (r.kg != null && r.kg > 0) ? ` <span class="it-kg">${r.kg.toFixed(1)}kg</span>` : '';
      const caret = nKids >= 2
        ? `<span class="ul-caret${open ? ' open' : ''}" data-ul-toggle="${key}" title="${open ? '접기' : '펼치기'}">${open ? '▼' : '▶'}</span>`
        : `<span class="ul-caret ul-none"></span>`;
      const btn = opts.act ? `<button class="ul-act" data-ul-act="1" title="${opts.actTitle || ''}">${opts.act}</button>` : '';
      const dragAttr = _ulEsc(JSON.stringify(r.drag));
      const eqTxt = r.badge ? ` <span class="ul-age">${r.badge}장착</span>` : '';
      // ★도구 줄도 **클래스는 같다**(`ul-row`) — `e2e-inv` ④의 DOM 구조 지문이 클래스로 동일성을 재기
      //   때문이다. 도구임은 `data-tool` 로만 표시한다(구조가 아니라 성질이다).
      let h = `<tr class="ul-row" draggable="true" data-col="${col}" data-item="${r.item}" data-ulkey="${key}" data-kids="${nKids}"${r.tool ? ' data-tool="1"' : ''} data-drag='${dragAttr}'>`
        + `<td class="it-icon">${icon}</td>`
        + `<td class="it-name">${caret}${label} <span class="it-count">×${r.count}</span>${kgTxt}${eqTxt}</td>`
        + `<td class="it-cat">${cat}</td><td class="it-action">${btn}</td></tr>`;
      if (nKids >= 2) {
        for (const c of r.kids) {
          const cd = c.drag ? ` draggable="true" data-drag='${_ulEsc(JSON.stringify(c.drag))}'` : '';
          h += `<tr class="ul-sub" data-col="${col}" data-item="${r.item}" data-ulparent="${key}"${cd}${open ? '' : ' hidden'}>`
            + `<td class="it-icon"></td>`
            + `<td class="it-name ul-subname">└ ${c.label}</td>`
            + `<td class="it-cat"></td><td class="it-action">${c.drag ? btn : ''}</td></tr>`;
        }
      }
      return h;
    }).join('');
  }

  function renderInvPanel(body) {
    // 14.53-e: 재렌더 전 각 컬럼의 scrollTop 저장 (mine + chest)
    const _savedScroll = {};
    body.querySelectorAll('.inv-col [style*="overflow:auto"]').forEach((el, i) => {
      const tgt = el.closest('.inv-col')?.dataset.dropTarget || `c${i}`;
      _savedScroll[tgt] = el.scrollTop;
    });
    const conts = nearbyContainers();
    // 바닥 탭 항상 마지막에. activeContainerId === 'ground' 면 바닥 표시
    if (activeContainerId && activeContainerId !== 'ground' && !conts.find(c => c.b.id === activeContainerId)) activeContainerId = null;
    if (!activeContainerId) activeContainerId = conts.length > 0 ? conts[0].b.id : 'ground';
    const activeC = (activeContainerId !== 'ground' && activeContainerId) ? conts.find(c => c.b.id === activeContainerId)?.b : null;
    const isGround = (activeContainerId === 'ground');
    const gItems = nearbyGroundItems();

    const myCount = Object.values(inventory).filter(v => v > 0).length + (toolItems ? toolItems.length : 0);
    // 14.53: toolItems row (각 instance 별 행)
    // ★도구·장비는 **이미 개체**라 원장이 필요 없다(무게 3층의 1층에 원래부터 있었다).
    //   equip/단축키 같은 제 affordance 가 있어 통일 목록에 억지로 밀어 넣지 않는다(회부: 도구 줄 통합).
    const TOOL_ICON_MAP = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨' };
    // ★[인벤 마무리 2026-08-30] 옛 `toolRowsHtml`(도구 전용 표)은 **삭제**됐다.
    //   도구는 이제 `ulRowsTools()` 로 통일 목록에 선다. 착용·단축키는 아래 결선에서
    //   **줄 우클릭**이 맡는다(버튼 칸을 도구만 다르게 쓰면 그게 다시 두 벌이다).

    // 좌: 내 인벤 (toolItems 먼저, 그다음 통일 목록)
    const mineTgt = activeC ? activeC.id : (isGround ? 'ground' : null);
    const myTable = `<div class="inv-col" data-drop-target="mine" data-ul-col="mine">
      <div class="inv-col-head">🎒 내 인벤토리<span class="col-count">(${myCount}종)</span></div>
      <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
        <table class="inv-table">
          <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
          <tbody>${ulRenderRows(ulRowsTools().concat(ulRowsMine(inventory)), 'mine', { act: mineTgt ? '↓' : '', actTitle: '1개 옮기기' })}</tbody>
        </table>
      </div></div>`;

    // 가운데: 활성 컨테이너 내용 — **같은 컴포넌트**로 그린다(두 벌 금지)
    let chestTable;
    if (isGround) {
      chestTable = `<div class="inv-col" data-drop-target="ground" data-ul-col="ground">
        <div class="inv-col-head">🌍 바닥 (근처 ${gItems.length}덩이)</div>
        <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
          <table class="inv-table">
            <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
            <tbody>${ulRenderRows(ulRowsGround(gItems), 'ground', { act: '↑', actTitle: '줍기', empty: '(바닥에 아이템 없음 — 드롭하면 여기에 표시됩니다)' })}</tbody>
          </table>
        </div></div>`;
    } else if (activeC) {
      const chestRows = ulRowsChest(activeC.data || {}, activeC.id);
      chestTable = `<div class="inv-col" data-drop-target="${activeC.id}" data-ul-col="chest">
        <div class="inv-col-head">📦 ${activeC.ownerName || '?'}<span class="col-count">(${chestRows.length}종)</span></div>
        <div style="flex:1;overflow:auto;background:#0e1217;border-radius:4px">
          <table class="inv-table">
            <thead><tr><th></th><th>아이템</th><th>분류</th><th></th></tr></thead>
            <tbody>${ulRenderRows(chestRows, 'chest', { act: '↑', actTitle: '1개 꺼내기' })}</tbody>
          </table>
        </div></div>`;
    } else {
      chestTable = `<div class="inv-col"><div class="inv-col-head">컨테이너</div><div style="flex:1"></div></div>`;
    }

    // 우측 탭 — chest들 + 바닥 (항상)
    const chestTabs = conts.map(({ b, d }) => {
      const total = Object.values(b.data || {}).reduce((s, v) => s + v, 0);
      const isActive = b.id === activeContainerId ? 'active' : '';
      return `<div class="cont-tab ${isActive}" data-cid="${b.id}" title="${b.ownerName || '?'} · ${d.toFixed(0)}px">
        <div class="ct-icon">📦</div>
        <div class="ct-count">${total}</div>
      </div>`;
    }).join('');
    const groundTab = `<div class="cont-tab ${isGround ? 'active' : ''}" data-cid="ground" title="근처 바닥 아이템">
      <div class="ct-icon">🌍</div>
      <div class="ct-count">${gItems.length}</div>
    </div>`;
    const tabsCol = `<div class="cont-tabs">${chestTabs}${groundTab}</div>`;

    body.innerHTML = `<div class="inv-three-col" style="height:100%">${myTable}${chestTable}${tabsCol}</div>`;
    // 14.53-e: scrollTop 복원
    body.querySelectorAll('.inv-col [style*="overflow:auto"]').forEach((el, i) => {
      const tgt = el.closest('.inv-col')?.dataset.dropTarget || `c${i}`;
      if (typeof _savedScroll[tgt] === 'number') el.scrollTop = _savedScroll[tgt];
    });

    // ── 통일 목록 결선 ────────────────────────────────────────────────────────
    const _drag = (tr) => { try { return JSON.parse(tr.dataset.drag); } catch (e) { return null; } };
    // ▶ 펼치기/접기 — 상태는 `ulOpen` 에 남아 재렌더를 넘어 산다(인벤 메시지마다 다시 그려진다).
    body.querySelectorAll('[data-ul-toggle]').forEach((el) => el.onclick = (e) => {
      e.stopPropagation();
      const k = el.dataset.ulToggle;
      if (ulOpen.has(k)) ulOpen.delete(k); else ulOpen.add(k);
      renderInvPanel(body);
    });
    // 버튼 = **1개**. 드래그가 전량이라 버튼은 낱개 쪽을 맡는다.
    body.querySelectorAll('.ul-act').forEach((btn) => btn.onclick = (e) => {
      e.stopPropagation();
      const tr = btn.closest('tr'); const d = _drag(tr); if (!d) return;
      const col = tr.dataset.col;
      if (col === 'mine') { if (!mineTgt) return; ulSend(d, mineTgt, 1); }
      else ulSend(d, 'mine', 1);
    });
    // 드래그 — 그 줄 전부(부모면 전량). ★재민 확정: "원래 한 줄을 드래그하면 모든 아이템이 드롭되고"
    body.querySelectorAll('.ul-row, .ul-sub').forEach((tr) => {
      tr.addEventListener('dragstart', (e) => {
        const d = _drag(tr); if (!d) return;
        e.dataTransfer.setData('text/plain', JSON.stringify(d));
        e.dataTransfer.effectAllowed = 'move';
        tr.classList.add('dragging');
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = `${itemIconHtml(d.item, 18)} ${itemKo(d.item)}${d.n > 1 ? ` ×${d.n}` : ''}`;   // ★[T55]
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 18, 18);
        setTimeout(() => ghost.remove(), 0);
      });
      tr.addEventListener('dragend', () => {
        tr.classList.remove('dragging');
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        document.querySelectorAll('.drag-over-ground').forEach(el => el.classList.remove('drag-over-ground'));
      });
    });
    // 우클릭 — 먹기 / 버리기. 부모 줄과 하위 줄 **둘 다** 받는다(하위면 그 줄만 간다).
    body.querySelectorAll('.inv-col[data-ul-col="mine"] .ul-row, .inv-col[data-ul-col="mine"] .ul-sub').forEach((tr) => {
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const d = _drag(tr); if (!d) return;
        const item = d.item, sub = tr.classList.contains('ul-sub');
        const opts = [];
        if (foodEffects && foodEffects[item] && !sub) opts.push({ label: '🍴 먹기', onClick: () => sendPrimary({ type: 'eat', item }) });
        // ★★[작물 층 2026-08-31] **씨앗 우클릭 = 심기.** 작물 고르는 창을 따로 만들지 않는다 —
        //   씨앗이 곧 작물이고, 인벤이 이미 내가 가진 씨앗을 보여 주고 있다(새 패널 0).
        //   ★심을 수 있는 철인지는 **서버가 판정**한다. 여기선 언제 심는지 이름표로만 알려 준다.
        if (!sub && CROP_OF_SEED[item]) {
          const _c = CROP_OF_SEED[item];
          const _ok = _c.sow && _c.sow.indexOf(cropSeasonNow()) >= 0;
          opts.push({
            label: '🌱 ' + _c.ko + ' 심기' + (_ok ? '' : ' (' + (_c.sow || []).map((x) => SEASON_KO[x] || x).join('·') + '에 심는다)'),
            onClick: () => sendPrimary({ type: 'plant', crop: _c.id }),
          });
        }
        opts.push({ label: sub ? '🗑 이 줄 버리기' : '🗑 1개 버리기 (바닥)', onClick: () => ulSend(d, 'ground', sub ? d.n : 1) });
        if (!sub && (inventory[item] || 0) >= 10) opts.push({ label: '🗑 10개 버리기', onClick: () => ulSend(d, 'ground', 10) });
        if (!sub && (inventory[item] || 0) > 1) opts.push({ label: `🗑 전부 버리기 (${inventory[item]}개)`, onClick: () => ulSend(d, 'ground', d.n) });
        if (opts.length) showContextMenu(e.clientX, e.clientY, opts);
      });
    });

    // ★[인벤 마무리 2026-08-30] 도구 줄 — 착용·단축키·버리기를 **우클릭 하나**로.
    //   부모 줄(도끼 ×2)은 그 종류의 **첫 도구**를 대상으로 한다(펼치면 하나씩 고를 수 있다).
    body.querySelectorAll('.inv-col[data-ul-col="mine"] tr[data-tool], .inv-col[data-ul-col="mine"] tr.ul-sub').forEach((tr) => {
      const d = _drag(tr); if (!d || !d.toolId) return;
      tr.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation();
        const id = d.toolId, isEq = (equipped === id), isHot = (hotkey1 === id);
        showContextMenu(e.clientX, e.clientY, [
          { label: isEq ? '해제' : '착용', onClick: () => sendPrimary({ type: 'equip', toolItemId: isEq ? null : id }) },
          { label: isHot ? '1번 슬롯에서 빼기' : '1번 슬롯에 등록', onClick: () => sendPrimary({ type: 'set_hotkey', toolItemId: isHot ? null : id }) },
          { label: '🗑 이 도구 버리기 (바닥)', onClick: () => sendPrimary({ type: 'drop_item', item: d.item, toolId: id }) },
        ]);
      });
      // 좌클릭 = 착용/해제(가장 잦은 조작 — 우클릭까지 안 가게)
      tr.addEventListener('click', (ev) => {
        if (ev.target.tagName === 'BUTTON' || ev.target.classList.contains('ul-caret')) return;
        sendPrimary({ type: 'equip', toolItemId: (equipped === d.toolId) ? null : d.toolId });
      });
    });
    body.querySelectorAll('[data-cid]').forEach(t => {
      if (!t.classList.contains('cont-tab')) return;
      t.onclick = () => { activeContainerId = t.dataset.cid; renderInvPanel(body); };
    });

    // 14.51: 건축 모드 ON일 때 — 내 인벤의 건축물 row 강조 + 클릭 시 placement mode 진입
    if (buildMode) {
      body.querySelectorAll('.inv-col[data-ul-col="mine"] .ul-row').forEach(tr => {
        const item = tr.dataset.item;
        if (!item || !item.startsWith('item_')) return;
        tr.style.cursor = 'pointer';
        tr.style.outline = '2px solid #f0c674';
        tr.style.background = 'rgba(240,198,116,0.1)';
        tr.title = '클릭 → 건축 모드에서 배치';
        tr.onclick = (e) => {
          if (e.target.tagName === 'BUTTON' || e.target.classList.contains('ul-caret')) return;
          let dir = 'N';
          if (item === 'item_fence') dir = 'NS';
          placementMode = { itemType: item, floor: myFloor, dir };
          placingDir = dir;
          showNotice(`📍 ${itemKo(item)} 배치 모드 — 좌클릭=배치, 우클릭=회전, ESC=취소`);   // ★[T55]
        };
      });
    }

    // drop targets
    body.querySelectorAll('.cont-tab').forEach(t => {
      t.addEventListener('dragover', (e) => { e.preventDefault(); t.classList.add('drag-over'); });
      t.addEventListener('dragleave', () => t.classList.remove('drag-over'));
      t.addEventListener('drop', (e) => {
        e.preventDefault(); t.classList.remove('drag-over');
        try { ulSend(JSON.parse(e.dataTransfer.getData('text/plain')), t.dataset.cid, ulDragAmount(e)); } catch (err) {}
      });
    });
    body.querySelectorAll('[data-drop-target]').forEach(col => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drag-over'); });
      col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('drag-over');
        try { ulSend(JSON.parse(e.dataTransfer.getData('text/plain')), col.dataset.dropTarget, ulDragAmount(e)); } catch (err) {}
      });
    });
  }

  // ★★[정비 배치 2026-08-30] **한 줄이 제 인자를 들고 다닌다.**
  //   종전엔 드래그 짐이 `{kind, item, cid}` 뿐이라 "어느 개체인지"를 말할 수가 없었고,
  //   수량은 수정키(Shift=10 · Ctrl=99)로 밖에서 얹었다. 이제 줄이 `ids`/`lotDay`/`giIds` 를
  //   직접 실어 보낸다 — **"몇 개"가 아니라 "어느 것"** 을 말할 수 있어야 펼친 줄이 따로 움직인다.
  //   `amount === null` 이면 그 줄 전부(부모면 전량 — 재민 확정), 수면 그만큼.
  // ★★[인벤 마무리 2026-08-30 재민 확정] **수정키 복원.**
  //   정비 배치에서 "부모 드래그 = 전량"(재민 확정)을 넣으며 Shift/Ctrl 수정키가 사라졌다 —
  //   그래서 부분 이동이 버튼(1개)과 우클릭 메뉴밖에 없었다(회부 B-2 로 적어 뒀던 그 건).
  //   ⇒ 둘을 **양립**시킨다: 수정키 **없으면 전량**(재민 확정 그대로) · 있으면 그만큼.
  //     Shift=10 · Ctrl/Alt/Meta=99 — 종전 문법 그대로다(새 조작을 만들지 않는다).
  function ulDragAmount(e) {
    if (e && (e.ctrlKey || e.altKey || e.metaKey)) return 99;
    if (e && e.shiftKey) return 10;
    return null;   // null = 그 줄 전부
  }
  function ulSend(d, target, amount) {
    if (!d || !d.item) return;
    const item = d.item;
    const n = (amount == null) ? Math.max(1, d.n | 0) : Math.max(1, amount | 0);

    if (d.kind === 'mine') {
      if (target === 'mine' || !target) return;
      if (target === 'ground') {
        // ★[인벤 마무리] 도구는 **인스턴스 id** 로 버린다(수량이 아니다 — 내구도가 딸린 개체다).
        if (d.toolId) {
          const ids = (n > 1 && d.toolIds) ? d.toolIds.slice(0, n) : [d.toolId];
          for (const tid of ids) sendPrimary({ type: 'drop_item', item, toolId: tid });
          return;
        }
        if (d.ids && d.ids.length) { sendPrimary({ type: 'drop_item', item, ids: d.ids.slice(0, n) }); return; }
        if (Number.isFinite(d.lotDay)) { sendPrimary({ type: 'drop_item', item, amount: n, lotDay: d.lotDay }); return; }
        sendPrimary({ type: 'drop_item', item, amount: n });
        return;
      }
      if (d.toolId) { showNotice('도구는 상자에 못 넣는다 — 바닥에만 내려놓을 수 있다'); return; }
      // 상자 — ⚠개체 정체를 못 담는다(회부: 상자 원장). 수량만 간다.
      sendPrimary({ type: 'chest_put', buildingId: target, item, amount: (d.ids && d.ids.length) ? Math.min(n, d.ids.length) : n });
      return;
    }
    if (d.kind === 'ground') {
      const ids = (d.giIds || []).slice(0, 64);
      if (!ids.length) return;
      if (target === 'ground') return;
      if (target === 'mine') { sendPrimary({ type: 'pickup_item', giIds: ids }); return; }
      // 바닥 → 상자: 줍고 나서 넣는다(서버에 직행 경로가 없다 — 옛 규약 그대로).
      sendPrimary({ type: 'pickup_item', giIds: ids });
      setTimeout(() => sendPrimary({ type: 'chest_put', buildingId: target, item, amount: Math.max(1, d.n | 0) }), 140);
      return;
    }
    if (d.kind === 'chest') {
      if (target === d.cid) return;
      if (target === 'mine') { sendPrimary({ type: 'chest_take', buildingId: d.cid, item, amount: n }); return; }
      if (target === 'ground') {
        sendPrimary({ type: 'chest_take', buildingId: d.cid, item, amount: n });
        setTimeout(() => sendPrimary({ type: 'drop_item', item, amount: n }), 140);
        return;
      }
      // 상자 → 다른 상자
      sendPrimary({ type: 'chest_take', buildingId: d.cid, item, amount: n });
      setTimeout(() => sendPrimary({ type: 'chest_put', buildingId: target, item, amount: n }), 140);
    }
  }

  // 빈 화면(canvas) drop → 바닥에 떨어뜨리기
  canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('drag-over-ground'); });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over-ground'));
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('drag-over-ground');
    try { ulSend(JSON.parse(e.dataTransfer.getData('text/plain')), 'ground', ulDragAmount(e)); } catch (err) {}
  });

  // === 제작창 (카테고리 + 레시피) ===
  let craftCat = 'tool';
  function renderCraftPanel2(body) {
    // 14.50/14.51: 서버에서 받은 동적 recipes 사용 (axe/saw/hammer + 건축물 + 가공)
    const TOOL_ICON = { axe: '🪓', pickaxe: '⛏️', sword: '⚔️', saw: '🪚', hammer: '🔨',
      // ★[빈손 시작 2026-08-28] 조잡한 석기 — 정품과 **한눈에 구별**돼야 한다(같은 아이콘이면 속는다)
      crude_axe: '🪨', crude_pick: '🪨', crude_blade: '🔪' };
    let items = [];
    if (craftCat === 'tool') {
      // recipes = { axe: {wood,stone,label}, ... } (server에서 받음)
      // ★[2026-08-28] **일반 cost** — 조잡한 석기는 잔가지·자갈·풀로 만든다(나무/돌 두 칸으론 표현이 안 된다).
      //   서버가 `cost` 를 실어 보내고 클라는 그걸 그대로 그린다(재료 표를 클라가 다시 적지 않는다).
      items = Object.entries(recipes || {}).map(([id, r]) => ({
        id, msgType: 'craft', icon: TOOL_ICON[id] || '🔧',
        name: r.label || id, crude: !!r.crude,
        cost: r.cost || { wood: r.wood || 0, stone: r.stone || 0 },
        have: hasToolAlive(id) ? 1 : 0,
        durStr: toolDurStr(id),
      }));
      // ★§8.5 "맨손 = 소목록" — **조잡한 석기를 맨 위로**. 빈손으로 들어온 사람이 처음 보는 줄이어야 한다.
      items.sort((a, b) => (b.crude ? 1 : 0) - (a.crude ? 1 : 0));
    } else if (craftCat === 'building') {
      // 14.51 buildingRecipes — 제작 → 인벤 → 건축 모드에서 배치
      items = Object.entries(buildingRecipes || {}).map(([id, r]) => {
        const cost = {};
        for (const [k, v] of Object.entries(r)) {
          if (k.startsWith('_') || k === 'label') continue;
          cost[k] = v;
        }
        return {
          id, msgType: 'craft_building', icon: itemIconHtml(id, 34, '🏗️'),
          name: r.label || id,
          cost, needHammer: !!r._needHammer,
          have: inventory[id] || 0,
        };
      });
    } else if (craftCat === 'item') {
      // 14.50 itemRecipes — 통나무→판자 등
      items = Object.entries(itemRecipes || {}).map(([id, r]) => ({
        id, msgType: 'craft_item', icon: itemIconHtml(id, 34, '🪚'),
        name: r.label || id,
        cost: r.from || {},
        produces: r.to || {},
        needTool: r.requiresTool,
      }));
    } else if (craftCat === 'food') {
      // cookRecipes (server) 또는 hardcoded fallback
      const cr = cookRecipes || {};
      if (Object.keys(cr).length === 0) {
        items = [
          { id: 'meat_cooked', msgType: 'cook', icon: itemIconHtml('meat_cooked', 34, '🍗'), name: '고기 굽기', cost: { meat_raw: 1 }, needCampfire: true },
          { id: 'berry_jam', msgType: 'cook', icon: itemIconHtml('berry_jam', 34, '🍯'), name: '베리잼', cost: { berry: 3 }, needCampfire: true },
          { id: 'water_bottle', msgType: 'cook', icon: itemIconHtml('water_bottle', 34, '🥤'), name: '물병', cost: { fiber: 2 }, needCampfire: true },
        ];
      } else {
        items = Object.entries(cr).map(([id, r]) => ({
          id, msgType: 'cook', icon: itemIconHtml(id, 34, '🍳'),
          name: r.label || id, cost: r.cost || {}, needCampfire: true,
        }));
      }
    }
    const cats = [
      { id: 'tool',     label: '🔧 도구' },
      { id: 'equip',    label: '🧥 장비' },
      { id: 'trade',    label: '🏪 거래' },
      { id: 'building', label: '🏗️ 건축물' },
      { id: 'item',     label: '🪚 가공' },
      { id: 'food',     label: '🍖 음식/요리' },
    ];
    body.innerHTML = `
      <div class="craft-layout">
        <div class="craft-cats">
          ${cats.map(c => `<div class="craft-cat ${c.id===craftCat?'active':''}" data-cat="${c.id}">${c.label}</div>`).join('')}
        </div>
        <div class="craft-items">
          ${craftCat === 'equip' ? equipmentSectionHtml() : craftCat === 'trade' ? tradeSectionHtml() : (items.length === 0 ? '<div style="color:#8a93a0;padding:20px;text-align:center">레시피 없음</div>' : items.map(r => {
            // need 체크
            const costOK = Object.entries(r.cost).every(([k,v]) => (inventory[k]||0) >= v);
            const hammerOK = !r.needHammer || hasToolAlive('hammer');
            const toolOK = !r.needTool || hasToolAlive(r.needTool);
            const canMake = costOK && hammerOK && toolOK;
            const costStr = Object.entries(r.cost).map(([k,v]) => `${itemIconHtml(k, 16, itemKo(k))} ${v}`).join(' · ') || '-';
            const flags = [];
            if (r.needHammer) flags.push('🔨');
            if (r.needTool) flags.push(r.needTool);
            if (r.needCampfire) flags.push('🔥');
            if (r.produces) {
              const prodStr = Object.entries(r.produces).map(([k,v]) => `${itemIconHtml(k, 16, itemKo(k))}×${v}`).join(' ');
              flags.push(`→ ${prodStr}`);
            }
            const haveBadge = (typeof r.have === 'number')
              ? (r.durStr
                  ? ` <span style="color:#7cd97c;font-weight:normal">[${r.durStr}]</span>`
                  : ` <span style="color:#8fc8ff;font-weight:normal">×${r.have}</span>`)
              : '';
            return `<div class="craft-recipe ${canMake?'can-make':'cant-make'}">
              <div class="cr-icon">${r.icon}</div>
              <div class="cr-info"><div class="cr-name">${r.name}${haveBadge}</div><div class="cr-cost">${costStr}${flags.length?' · '+flags.join(' · '):''}</div></div>
              <button data-craft="${r.id}" data-msg="${r.msgType}" ${canMake?'':'disabled'}>제작</button>
            </div>`;
          }).join(''))}
          ${craftCat === 'food' ? dishesListHtml() : ''}
        </div>
      </div>`;
    body.querySelectorAll('[data-cat]').forEach(c => c.onclick = () => { craftCat = c.dataset.cat; if (craftCat === 'trade') sendPrimary({ type: 'shop_info' }); renderCraftPanel2(body); });
    body.querySelectorAll('[data-craft]').forEach(b => b.onclick = () => {
      const id = b.dataset.craft;
      const msgType = b.dataset.msg;
      sendPrimary({ type: msgType, recipe: id });
    });
    if (craftCat === 'equip') wireEquipmentHandlers(body, () => renderCraftPanel2(body));
    if (craftCat === 'food') wireDishHandlers(body);
    if (craftCat === 'trade') wireTradeHandlers(body, () => renderCraftPanel2(body));
  }

  // === 건축 모드 패널 (14.51 신 시스템 안내 + ON/OFF 토글) ===
  function renderBuildPanel(body) {
    const status = buildMode ? '<span style="color:#7cd97c">ON</span>' : '<span style="color:#ff7c7c">OFF</span>';
    body.innerHTML = `
      <div style="padding:12px;color:#cfd6e0;line-height:1.6;font-size:13px">
        <h3 style="margin:0 0 12px 0;color:#f0c674">🏗️ 건축 모드 ${status}</h3>
        <button id="buildToggleBtn" style="width:100%;padding:10px;background:${buildMode?'#7cd97c':'#3a4a5a'};color:#fff;border:none;border-radius:4px;font-size:14px;font-weight:bold;cursor:pointer;margin-bottom:12px">
          ${buildMode ? '⏹ 건축 모드 끄기' : '▶ 건축 모드 켜기'} (B키)
        </button>
        <div style="background:#1a1f25;padding:10px;border-radius:4px;font-size:12px;color:#8a93a0">
          <p style="margin:0 0 8px 0;color:#f0c674;font-weight:bold">📋 사용법</p>
          <p style="margin:0 0 6px 0">① 🔨 <b>제작</b> 패널에서 "건축물" 탭 → 벽/바닥 제작 (자원+망치 소비) → 인벤에 들어감</p>
          <p style="margin:0 0 6px 0">② <b>B키</b>로 건축 모드 ON</p>
          <p style="margin:0 0 6px 0">③ <b>I</b>로 인벤 → 건축물 아이템 클릭 → placement 모드</p>
          <p style="margin:0 0 6px 0">④ 맵 좌클릭 → <b>3초 progress</b> → 배치 (이동 시 취소)</p>
          <p style="margin:0 0 6px 0">⑤ 우클릭 = 회전 · ESC = placement 종료</p>
          <p style="margin:0 0 0 0">⑥ 건축물에 마우스 hover → 좌클릭 → <b>3초 progress</b> → 분해 (인벤 +1)</p>
        </div>
        <div style="background:#2a1f15;padding:10px;border-radius:4px;font-size:12px;color:#c89070;margin-top:8px">
          ⚠️ 옛 즉시 빌드 시스템은 제거됨. 모든 건축물 = 제작→인벤→배치.
        </div>
        <!-- 터 잡기(다단계 건축) — 아래 JS 주석 참조. 노·숯가마·움집은 아이템이 아니라 '터'다. -->
        <div id="siteBuildBox" style="background:#1a1f25;padding:10px;border-radius:4px;font-size:12px;margin-top:8px">
          <p style="margin:0 0 8px 0;color:#f0c674;font-weight:bold">⛏️ 터 잡기 (다단계 건축 — 자리부터 잡는다)</p>
          <div id="siteBuildList" style="display:flex;flex-direction:column;gap:6px"></div>
          <p style="margin:8px 0 0 0;color:#8a93a0">자리를 잡은 뒤 자재를 들고 터를 클릭하면 다음 단계가 올라간다.</p>
        </div>
      </div>`;
    // ★★[2026-08-02d 배치 5 ⑥ — 실클라 E2E 가 잡은 결함] 터 잡기(다단계 건축) 구획.
    //   노·숯가마·움집은 **아이템이 아니라 터**다(제작→인벤→배치 계약에 안 들어간다 — 자리를 잡고
    //   자재를 들고 가 단계를 올린다). 그런데 그 진입점이 #hud .hud-actions 안에만 있었고
    //   그 컨테이너는 style.css:486 에서 display:none 이라 **플레이어가 도달할 방법이 없었다** —
    //   키 바인딩도 0곳이고 제작 패널에도 없다. 서버 E2E(test-furnace 59/0)가 통과하는 동안
    //   화면에서는 노를 **한 번도 지을 수 없었다.**
    //   (배치 1 의 _claimFootprint 결함과 같은 계열: 계약은 멀쩡한데 실행 경로가 끊겨 있었다.
    //    그때 교훈이 "소스 계약 검사로는 못 잡는다 — 실행해 봐야 한다"였고, 이번엔 한 층 더 위,
    //    **실화면**이라야 잡혔다.)
    //   ⇒ 여기서 로직을 복제하지 않는다. 정본 버튼(.hud-actions[data-action])을 그대로 눌러 준다.
    {
      const list = document.getElementById('siteBuildList');
      const src = document.querySelectorAll('.hud-actions [data-action="hut_start"], .hud-actions [data-action="furnace_start"], .hud-actions [data-action="kiln_start"], .hud-actions [data-action="village_start"]');
      for (const srcBtn of src) {
        if (srcBtn.style && srcBtn.style.display === 'none') continue;   // 시대 미해금(괴련로 등)은 정본 그대로 숨긴다
        const b = document.createElement('button');
        b.textContent = (srcBtn.textContent || '').trim();
        b.style.cssText = 'width:100%;padding:8px;background:#3a4a5a;color:#e8eaed;border:1px solid #4a5a6a;border-radius:4px;cursor:pointer;font-size:13px;text-align:left';
        b.onclick = () => { srcBtn.click(); closeSide(); };   // ★정본 핸들러 호출 — 배치 모드 진입 후 패널을 비켜 준다
        list.appendChild(b);
      }
      if (!list.children.length) list.innerHTML = '<span style="color:#8a93a0">(지금 잡을 수 있는 터가 없다)</span>';
    }
    document.getElementById('buildToggleBtn').onclick = () => {
      buildMode = !buildMode;
      if (!buildMode) placementMode = null;
      showNotice(buildMode ? '🏗️ 건축 모드 ON' : '건축 모드 OFF');
      renderBuildPanel(body);
      if (invOpen) renderInvPanel(document.getElementById('invBody'));
    };
  }

  // ═══ ★★[2026-08-03e 배치 12 ③] 마을(길드) 재고 패널 ══════════════════════════
  //   재민: *"마을(길드) 관리자가 식량 등의 마을 재고 현황을 파악할 수 있도록 ui 할 거야"*
  //   ★이 함수는 **표시만** 한다. 합계·환산·문턱은 전부 서버(엔진 정본)가 계산해 보낸 값이다 —
  //     화면에서 다시 계산하면 그게 사본이고, 사본은 언젠가 정본과 어긋난다(배치 7 오진의 형태).
  //   ★`_cash` 는 애초에 안 온다(서버가 뺀다). 장부이지 재화가 아니기 때문이다.
  const _PVI_LABEL = {
    food: '곡식', fish: '생선', meat: '고기', cooked_food: '요리', fruit: '과일', vegetable: '나물', mushroom: '버섯',
    wood: '통나무', stone: '돌', twig: '삭정이', pebble: '자갈',
    tool: '간석기 도구', iron_tool: '철 도구', bronze_tool: '청동 도구',
    ore: '원석', iron: '철', copper: '구리', tin: '주석',
    weapon: '무기', armor: '갑옷', hide: '가죽', bone: '뼈',
    clothes: '옷', herb: '약재', clay: '진흙', charcoal: '숯', obsidian: '흑요석', jade: '옥', tigerhide: '호피',
    hemp: '삼베', ramie: '모시',
  };
  const _pviKo = (r) => _PVI_LABEL[r] || r;
  function showVillageInventory(inv) {
    if (!inv) return;
    window.__villageInv = inv;   // ★진단 훅(읽기 전용) — E2E 가 '화면 표시값 = 서버 실값'을 assert 한다
    let el = document.getElementById('villageInvPanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'villageInvPanel';
      el.style.cssText = 'position:fixed;right:16px;top:64px;width:330px;max-height:72vh;overflow:auto;'
        + 'background:#141a22;color:#e8eaed;border:1px solid #2a3340;border-radius:8px;z-index:900;'
        + 'font-size:13px;box-shadow:0 6px 22px rgba(0,0,0,.5)';
      document.body.appendChild(el);
    }
    el.style.display = 'block';
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const empty = inv.pop === 0;
    let h = `<div style="padding:10px;border-bottom:1px solid #2a3340;display:flex;justify-content:space-between;align-items:center">`
      + `<b>🏘️ ${esc(inv.name)}</b><span id="pviClose" style="cursor:pointer;color:#8a93a0;padding:0 4px">✕</span></div>`;
    h += `<div style="padding:8px 10px;color:#8fc8ff">👥 인구 <b>${inv.pop}</b>`
      + (inv.housing != null ? ` <span style="color:#8a93a0">/ 주거 ${inv.housing}</span>` : '')
      + ` · 📅 Day ${inv.day}<span style="color:#8a93a0"> (창설 ${inv.foundedDay})</span>`
      // ★★[시세 창 day 판정 2026-08-30] 여기 Day 는 **econ 게임일**이다(벽시계가 아니다).
      //   재민 목격 "몇 초마다 day 5씩"의 정체: 이 서버의 하루 길이(`VILLAGE_DAY_MS`)가 짧으면
      //   econ 일이 그만큼 빨리 흐른다 — 표기 버그가 아니라 **그 서버의 시계**다.
      //   그래서 날짜 옆에 **달력을 같이** 적는다. HUD 배지와 같은 값이면 시계가 하나라는 증거다.
      + (myCalendar ? `<span style="color:#8a93a0"> · ${myCalendar.year}년 ${myCalendar.seasonKo} ${myCalendar.dayOfSeason}일</span>` : '')
      + `</div>`;
    h += `<div style="padding:0 10px 8px">🌾 식량 환산 <b>${inv.foodEquiv}</b>`
      + (inv.pop > 0 ? ` <span style="color:#8a93a0">(1인 ${inv.foodDays}일치)</span>` : '') + `</div>`;
    if (empty) {
      // ★인구 0 = "빈 터"다. 소멸이 아니라 **아직 시작 안 함**이라는 걸 화면이 말해야 한다.
      const need = inv.nextResidentAt;
      const have = (inv.nextResidentHave != null) ? inv.nextResidentHave : inv.foodEquiv;   // 서버가 준 정본 값(클라 재계산 0)
      h += `<div style="margin:0 10px 10px;padding:8px;background:#1c2a1c;border:1px solid #2f4a2f;border-radius:6px;color:#cfe8cf">`
        + `아직 아무도 살지 않는다. 곳간 <b>식량 ${need}</b>어치가 쌓이면 첫 주민이 깃든다`
        + (need ? ` <span style="color:#8a93a0">(지금 <b data-pvi-have>${(+have).toFixed(1)}</b>)</span>` : '') + `.</div>`;
    }
    for (const g of (inv.groups || [])) {
      h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">${esc(g.ko)}</div><table style="width:100%;font-size:12px;border-collapse:collapse">`;
      for (const it of g.items) {
        h += `<tr><td style="padding:2px 10px">${esc(_pviKo(it.r))}</td>`
          + `<td align="right" style="padding:2px 10px;color:#fff" data-pvi="${esc(it.r)}">${it.q}</td></tr>`;
      }
      h += `</table>`;
    }
    if ((inv.treasury || []).length) {
      h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">국고(걷힌 실물)</div><table style="width:100%;font-size:12px;border-collapse:collapse">`;
      for (const it of inv.treasury) h += `<tr><td style="padding:2px 10px">${esc(_pviKo(it.r))}</td><td align="right" style="padding:2px 10px;color:#d8c898">${it.q}</td></tr>`;
      h += `</table>`;
    }
    // ── 곳간에 넣기 — 내가 지금 들고 있는 것 중 **이 곳간이 받는 것**만 버튼으로 ──────
    //   목록은 서버가 준 `accepts` 그대로다(클라가 제 목록을 따로 갖지 않는다 — 사본 금지).
    const acc = inv.accepts || {};
    const mine = Object.keys(acc).filter((k) => (inventory[k] || 0) > 0);
    h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">곳간에 넣기 (내 짐)</div>`;
    if (!mine.length) {
      h += `<div style="padding:0 10px 8px;color:#6f7a88;font-size:11px">넣을 만한 걸 안 들고 있다.</div>`;
    } else {
      h += `<div style="padding:0 10px 10px;display:flex;flex-wrap:wrap;gap:6px">`;
      for (const k of mine) {
        h += `<button data-pvi-put="${esc(k)}" style="padding:5px 8px;background:#2b3a4a;color:#e8eaed;border:1px solid #3c4e60;border-radius:4px;cursor:pointer;font-size:12px">`
          + `${esc(_pviKo(acc[k]))} ${inventory[k]} ▸ 넣기</button>`;
      }
      h += `</div>`;
    }
    // ★★[T19 2026-09-02] **이방인 받기 한 줄** — 새 패널 0. 값은 전부 서버가 준 `inv.welcome` 그대로다
    //   (자격 판정을 클라가 다시 풀면 그게 사본이다 · 판정 정본은 `server/newcomers.js`).
    if (inv.welcome) {
      const w = inv.welcome;
      h += `<div style="padding:6px 10px;border-top:1px solid #2a3340;color:#8a93a0">이방인 받기</div>`
        + `<div style="padding:0 10px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">`
        + `<button id="pviWel" style="padding:5px 9px;background:${w.on ? '#2f4a2f' : '#2b3a4a'};color:#e8eaed;border:1px solid ${w.on ? '#4a7a4a' : '#3c4e60'};border-radius:4px;cursor:pointer;font-size:12px">`
        + `${w.on ? '🚪 받는 중 — 끄기' : '🚪 이방인 받기'}</button>`
        + (w.listed ? `<span style="color:#a9c6a0;font-size:11px">시작 지도에 올라 있다</span>`
                    : `<span style="color:#8a93a0;font-size:11px">${w.on ? '아직 지도엔 안 오른다' : '지도에 없다'}</span>`)
        + `</div>`;
      if (w.why && w.why.length) {
        h += `<div style="padding:0 10px 8px;color:#c98a8a;font-size:11px">${esc(w.why.join(' · '))}</div>`;
      }
    }
    h += `<div style="padding:8px 10px;color:#6f7a88;font-size:11px;border-top:1px solid #2a3340">회관을 다시 클릭하면 갱신된다</div>`;
    el.innerHTML = h;
    const cl = document.getElementById('pviClose');
    if (cl) cl.onclick = () => { el.style.display = 'none'; };
    // ★[T19] 스위치 — 판정은 서버가 한다. 클라는 "켜 달라"만 말한다.
    { const wb = document.getElementById('pviWel');
      if (wb && _pviHallId) wb.onclick = () => sendPrimary({ type: 'village_welcome', buildingId: _pviHallId, on: !(inv.welcome && inv.welcome.on) }); }
    for (const btn of el.querySelectorAll('[data-pvi-put]')) {
      btn.onclick = () => {
        const it = btn.getAttribute('data-pvi-put');
        const q = inventory[it] || 0;
        if (!(q > 0) || !_pviHallId) return;
        sendPrimary({ type: 'village_deposit', buildingId: _pviHallId, want: { [it]: q } });   // 전부 넣는다(서버가 최종 판정)
      };
    }
  }
  let _pviHallId = null;   // 마지막으로 연 회관 — "넣기"가 어느 곳간인지

  // === 시세 패널 — 중앙 economy 모듈에서 마을별 가격 fetch + 비교 ===
  const RES_ICON = {
    food: '🌾', fish: '🐟', meat: '🥩', cooked_food: '🍲',
    wood: '🪵', stone: '🪨', ore: '⛏️', tool: '⚒️',
    fruit: '🍎', vegetable: '🥬', mushroom: '🍄', twig: '🌿', pebble: '🪨', hide: '🦴',
  };
  let _marketSel = null;
  function renderMarketPanel(body) {
    // Phase 4d-4: 캐나디아 zone이면 캐나디아 시세 (7마을), 그 외엔 글로벌 (20마을)
    const url = primaryZoneId === 'canadia' ? '/economy/canadia/prices' : '/economy/prices';
    return renderMarketPanelFromUrl(body, url);
  }
  function renderMarketPanelFromUrl(body, url) {
    body.innerHTML = `<div style="padding:10px;color:#8a93a0">시세 데이터 로딩 중…</div>`;
    fetch(url).then(r => r.json()).then(d => {
      const villages = d.villages || [];
      villages.sort((a, b) => b.pop - a.pop);
      if (!_marketSel) _marketSel = villages[0]?.name;
      const sel = villages.find(v => v.name === _marketSel) || villages[0];
      let html = `<div style="padding:8px;color:#8fc8ff">📅 Day ${d.day} · ${villages.length}개 마을</div>`;
      html += `<select id="mkSel" style="margin:6px;padding:4px;font-size:13px">`;
      villages.forEach(v => {
        const tax = (v.guild.taxRate * 100).toFixed(1);
        html += `<option value="${v.name}" ${v.name === sel.name ? 'selected' : ''}>${v.name} (인구 ${v.pop}, 세율 ${tax}%)</option>`;
      });
      html += `</select>`;
      if (sel) {
        html += `<div style="padding:8px;border-top:1px solid #2a3340"><b>🏪 ${sel.name} 시세</b> <span style="color:#8a93a0">(인구 ${sel.pop}, 세율 ${(sel.guild.taxRate*100).toFixed(1)}%)</span></div>`;
        html += `<table style="width:100%;font-size:12px;border-collapse:collapse">`;
        html += `<tr style="color:#8a93a0;border-bottom:1px solid #2a3340"><th align="left" style="padding:4px">자원</th><th align="right">여기</th>`;
        // 비교 마을 — 상위 4개 (선택 마을 제외)
        const compareTowns = villages.filter(v => v.name !== sel.name).slice(0, 4);
        compareTowns.forEach(v => { html += `<th align="right" style="color:#5a9ae0">${v.name.slice(0,3)}</th>`; });
        html += `<th align="right" style="color:#8a93a0">최저</th><th align="right" style="color:#8a93a0">최고</th></tr>`;
        Object.keys(sel.prices).forEach(r => {
          const myPrice = sel.prices[r];
          const allPrices = villages.map(v => v.prices[r]);
          const minP = Math.min(...allPrices);
          const maxP = Math.max(...allPrices);
          const icon = RES_ICON[r] || '·';
          html += `<tr style="border-bottom:1px solid #1a1f28">`;
          html += `<td style="padding:3px">${icon} ${r}</td>`;
          html += `<td align="right" style="color:#fff">${myPrice.toFixed(2)}</td>`;
          compareTowns.forEach(v => {
            const p = v.prices[r];
            const color = p < myPrice * 0.7 ? '#f08080' : p > myPrice * 1.5 ? '#80f080' : '#8a93a0';
            html += `<td align="right" style="color:${color}">${p.toFixed(2)}</td>`;
          });
          html += `<td align="right" style="color:#80f080">${minP.toFixed(2)}</td>`;
          html += `<td align="right" style="color:#f08080">${maxP.toFixed(2)}</td>`;
          html += `</tr>`;
        });
        html += `</table>`;
        html += `<div style="padding:6px;color:#8a93a0;font-size:11px">🟢 여기보다 쌈 · 🔴 여기보다 비쌈 · 최저/최고 = 전 마을 가격 범위</div>`;
      }
      body.innerHTML = html;
      const selEl = document.getElementById('mkSel');
      if (selEl) selEl.onchange = (e) => { _marketSel = e.target.value; renderMarketPanel(body); };
    }).catch(err => {
      body.innerHTML = `<div style="padding:10px;color:#f08080">시세 로드 실패: ${err.message}</div>`;
    });
  }

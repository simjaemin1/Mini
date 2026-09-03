// @@split:45-t-market — T/F — 거래소 UI·상자·제작 토글·장비 미리보기 (T53 ⑤)
  // === 거래소 UI ===
  let marketOpen = false;
  function toggleMarketplace() {
    // Phase 14.16: 옛 modal 대신 새 슬라이드 패널로
    if (typeof togglePanel === 'function') return togglePanel('market');
    marketOpen = !marketOpen;
    const panel = document.getElementById('marketPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !marketOpen);
    if (marketOpen) refreshMarket();
  }
  async function refreshMarket() {
    try {
      const r = await fetch('/market/orders');
      const data = await r.json();
      const list = document.getElementById('marketOrders');
      if (!list) return;
      list.innerHTML = '';
      for (const o of data.orders.slice(-20).reverse()) {
        const li = document.createElement('div');
        li.className = 'market-order';
        const isMine = o.player_id === myUsername;
        li.innerHTML = `<span class="${o.side === 'sell' ? 'sell' : 'buy'}">${o.side === 'sell' ? '판매' : '구매'}</span>
          ${o.item} ×${o.amount} @ ${o.price_item} ${o.price_amount}/개
          <span class="who">${o.player_id}${isMine ? ' (나)' : ''}</span>
          ${isMine ? `<button data-cancel="${o.id}">취소</button>` : ''}`;
        list.appendChild(li);
      }
      list.querySelectorAll('[data-cancel]').forEach(btn => {
        btn.onclick = async () => {
          await fetch('/market/cancel', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ player_id: myUsername, order_id: +btn.dataset.cancel }),
          });
          refreshMarket();
        };
      });
    } catch (e) { console.error(e); }
  }
  async function placeOrder(side) {
    if (!myUsername) { showNotice('로그인이 필요합니다 (게스트 거래소 사용 불가)'); return; }
    const item = document.getElementById('marketItem').value;
    const amount = +document.getElementById('marketAmount').value || 1;
    const priceItem = item === 'wood' ? 'stone' : 'wood';
    const priceAmount = +document.getElementById('marketPrice').value || 1;
    try {
      const r = await fetch('/market/order', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ player_id: myUsername, side, item, amount, price_item: priceItem, price_amount: priceAmount }),
      });
      const data = await r.json();
      if (data.error) showNotice(`거래소: ${data.error}`);
      else showNotice(`주문 등록: ${data.matched === 'full' ? '즉시 체결!' : data.matched === 'partial' ? '부분 체결' : '대기 중'}`);
      refreshMarket();
    } catch (e) { showNotice('거래소 오류'); }
  }

  // === 상자 UI === (Phase 14.21 — 옛 modal 폐기, 새 인벤 패널로 redirect)
  let openChestId = null;
  function openChest(buildingId) {
    if (typeof openInvWithContainer === 'function') return openInvWithContainer(buildingId);
    openChestId = buildingId;
    document.getElementById('chestPanel')?.classList.remove('hidden');
    renderChestUi(buildingId, null);
  }
  function closeChest() {
    openChestId = null;
    document.getElementById('chestPanel')?.classList.add('hidden');
  }

  // === Craft 패널 ===
  let craftOpen = false;
  function toggleCraft() {
    if (typeof togglePanel === 'function') return togglePanel('craft'); // 14.16
    craftOpen = !craftOpen;
    const panel = document.getElementById('craftPanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !craftOpen);
    if (craftOpen) renderCraftPanel();
  }
  // ★[T66 2차] `TOOL_ICONS` 삭제 — 도구는 아이템 그림 하나(`itemPic`). 아래 `EQUIP_ICONS` 는 **갈래**(옷·갑옷·무기·도구)라 선 아이콘이 맞다.
  const TOOL_LABELS = { axe: '도끼', pickaxe: '곡괭이', sword: '검' };
  // 플레이어 장비 아이콘·미리보기(서버 EQUIPMENT_META와 동일 공식 = 단일진실)
  // ★★[T66 2차 · 재민 확정 2026-09-03] 장비 칸의 그림도 **아이템 그림 하나**다 —
  //   값은 **파일명 규약**(`public/assets/icons/<key>.png`)의 그 키이고, `itemPic` 이 그대로 쓴다.
  //   `carrier`(지게)는 T72 가 구웠다 ⇒ 여기 오르는 순간 제작창·장비 목록이 그 그림을 쓴다.
  //   나머지 넷은 아직 안 구웠다 — 그래서 점선 칸으로 뜬다. 그게 ART 에 보이는 신호다(메우지 않는다).
  const EQUIP_ICONS = { clothes: 'clothes', armor: 'armor', weapon: 'weapon', tool: 'tool', carrier: 'carrier' };
  function equipSkillLevel(skill) {
    const xp = (craftSkill && craftSkill[skill]) || 0;
    const per = (equipmentMeta && equipmentMeta.xpPerLevel) || 6;
    return Math.max(0, Math.min(10, Math.floor(xp / per)));
  }
  function equipPreview(itemType, material, skill) {
    if (!equipmentMeta) return null;
    const t = equipmentMeta.types[itemType]; if (!t) return null;
    const g = equipmentMeta.matGrade[material];
    const grade = (g == null ? 0.6 : g); // 미등록 재료 = 삼베급 폴백(서버 matGrade 동일)
    const span = equipmentMeta.qSkillSpan;
    const qSkill = 1 - span + span * (Math.max(0, Math.min(10, skill)) / 10);
    const q = qSkill * grade;
    return { attr: Math.round(t.attrScale * q), dura: Math.round(t.baseDura * (1 + equipmentMeta.duraSpan * q)), attrLabel: t.attr };
  }

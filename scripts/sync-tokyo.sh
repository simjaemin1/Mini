#!/usr/bin/env bash
# === scripts/sync-tokyo.sh — 도쿄 코드 받기를 작은 차분으로 (T878 · 2026-10-23) ===================================
#
# ★왜: 10-23 초기화 0 준비에서 서울 → 재민 맥 → 도쿄 tar(얕은 사본 472MB)가 **40분** 걸렸다(집 업로드 ~200KB/s).
#   도쿄는 GitHub 인증이 없어 서울 사본을 받는다. 그런데 도쿄에는 이미 지난 판이 있다 —
#   서울 HEAD 트리에서 그 판 뒤로 바뀐 객체만 한 팩으로 넘기면 몇 KB~몇 MB 다.
#
# 재민 맥에서 한 줄(레포 어디서든 · 이 파일은 맥에서 돈다 — 서버 둘엔 ssh 만):
#   bash scripts/sync-tokyo.sh            # 차분 팩(도쿄 HEAD 트리 → 서울 HEAD 트리) → 도쿄 index-pack · reset --hard · clean · git log 한 줄
#   bash scripts/sync-tokyo.sh --dry      # 무엇을 할지만(도쿄 · 서울 HEAD · 사이 커밋 수 · 팩 크기) — 도쿄 무변
#   bash scripts/sync-tokyo.sh --full     # 차분 없이 얕은 사본 통째(폴백 줄을 바로)
#
# 차례:
#   ① 서울 HEAD · 도쿄 HEAD 를 ssh 로 묻는다(도쿄가 얕은 저장소여도 HEAD 하나는 있다).
#   ② 같으면 → 도쿄 `reset --hard` · `clean -qfd` 만(작업 트리를 깨끗이) · 끝.
#   ③ 서울이 도쿄 HEAD 를 알면 → 서울: 도쿄 HEAD 트리에 없는 객체만(서울 HEAD 커밋 + 새 트리 · 블롭) `git pack-objects` 한 팩
#      → 맥을 지나(진행 점 · 1MB 마다 한 점) → 도쿄 `git index-pack` → (부모가 도쿄에 없으면) 그 커밋을 얕은 경계(`.git/shallow`)로 → `reset --hard` · `clean -qfd`.
#      (`git bundle <도쿄>..HEAD` 는 머지가 데려온 곁가지 부모가 전제로 붙어 얕은 도쿄가 못 받는다 — 마른 연습 실측)
#   ④ 이어지지 않으면(서울이 도쿄 HEAD 를 모른다 · 도쿄에 레포가 없다) → **폴백**: 서울에서 얕은 사본(`git clone --depth 1`)을 떠
#      tar 로 맥을 지나 도쿄 `/opt/Mini` 자리에 놓는다(10-23 판 줄 — 느리다 · 진행 점) · 옛 자리는 `/opt/Mini.prev` 로 한 벌 남긴다(그 앞 것은 지운다).
#      얕은 사본엔 원격(origin)을 안 싣는다 — 서울 원격 주소(인증 칸이 있을 수 있다)를 도쿄로 옮기지 않는다.
#   ⑤ 끝 줄: 두 호스트 `git log --oneline -1` 이 **같은 줄**이어야 한다(절차서 §3 0 검증과 같은 말).
#
# 별칭: 서버는 맥 `~/.ssh/config` 의 `Host seoul` · `Host tokyo`(키가 붙은 별칭)로 부른다 — 10-23 IP 줄은 키가 안 붙어 막혔다.
#   다른 이름이면 env 로: SYNC_SEOUL=<별칭> SYNC_TOKYO=<별칭>. 코드 자리: SYNC_SEOUL_DIR · SYNC_TOKYO_DIR(기본 /opt/Mini 둘).
#   [T897] SYNC_COMMIT=<커밋> — 서울 HEAD 대신 그 커밋으로(갱신 되돌리기 · 차분만).
# ★새 수 0 · 제품 0 — git · ssh · tar · awk · comm · perl(맥 기본)만. 비밀 파일(/root/.durango-secret)은 레포 밖이라 안 건드린다.
set -euo pipefail
trap 'echo "  ✗ 멈췄다(줄 $LINENO) — 도쿄 reset 앞에서 멈췄으면 도쿄는 옛 판 그대로다" >&2' ERR

S="${SYNC_SEOUL:-seoul}"; T="${SYNC_TOKYO:-tokyo}"
SD="${SYNC_SEOUL_DIR:-/opt/Mini}"; TD="${SYNC_TOKYO_DIR:-/opt/Mini}"
MODE=diff
case "${1:-}" in --dry) MODE=dry ;; --full) MODE=full ;; "") ;; *) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;; esac
say() { echo "$*"; }
die() { echo "  ✗ $*" >&2; exit 1; }
# 진행 점 — 표준입력을 그대로 넘기며 1MB 마다 점 하나(표준오류) · 끝에 합계
dots() { perl -e '$|=1; my ($n,$b)=(0); while (my $r = read(STDIN, $b, 1<<20)) { print $b; $n += $r; print STDERR "."; } printf STDERR " %.1f MB (%d B)\n", $n/1048576, $n;'; }

# ★[T897] `SYNC_COMMIT=<커밋>` 이면 서울 HEAD 대신 그 커밋으로 맞춘다(갱신 되돌리기 — 도쿄 코드 트리를 돌아간 이미지의 커밋으로 · 서울 이력 안에 있어야 한다 · 폴백 없음)
if [ -n "${SYNC_COMMIT:-}" ]; then SH="$(ssh "$S" "cd $SD && git rev-parse --verify -q '${SYNC_COMMIT}^{commit}'")" || die "서울($S) 이력에 커밋 ${SYNC_COMMIT} 이 없다"
else SH="$(ssh "$S" "cd $SD && git rev-parse HEAD")" || die "서울($S) HEAD 를 못 읽었다"; fi
TH="$(ssh "$T" "cd $TD 2>/dev/null && git rev-parse HEAD 2>/dev/null" || true)"
say "  서울($S) HEAD ${SH:0:12} · 도쿄($T) HEAD ${TH:0:12}"

if [ "$MODE" != full ] && [ -n "$TH" ] && [ "$SH" = "$TH" ]; then
  say "  같다 — 받을 것 0"
  [ "$MODE" = dry ] && exit 0
  ssh "$T" "cd $TD && git reset -q --hard && git clean -qfd && git log --oneline --abbrev=12 -1"
  exit 0
fi

CHAIN=0
if [ "$MODE" != full ] && [ -n "$TH" ] && ssh "$S" "cd $SD && git cat-file -e $TH^{commit} 2>/dev/null"; then CHAIN=1; fi

# 서울 쪽 — 도쿄 HEAD 트리에 없는 객체만(서울 HEAD 커밋 하나 + 그 트리에서 새로 생긴 트리 · 블롭) 한 팩으로.
#   ★`git bundle <도쿄>..HEAD` 가 아니다: 그 사이 머지가 데려온 곁가지 커밋의 부모(도쿄 HEAD 보다 앞)가 번들 전제로 붙어
#     얕은 도쿄가 "Repository lacks these prerequisite commits" 로 받지 못한다(마른 연습 실측 · 110 커밋 차분).
#   도쿄는 그 커밋 하나를 얕은 경계(.git/shallow)로 받는다 — 부모는 안 가져온다(도쿄가 쓰는 것은 그 커밋의 트리 하나뿐).
PACK="cd $SD && { git rev-parse $SH; git rev-parse $SH^{tree}; git ls-tree -r -t $SH | awk '\$2!=\"commit\"{print \$3}'; } | sort -u > /tmp/sync-tokyo.a && { git rev-parse $TH^{tree}; git ls-tree -r -t $TH | awk '\$2!=\"commit\"{print \$3}'; } | sort -u > /tmp/sync-tokyo.b && comm -23 /tmp/sync-tokyo.a /tmp/sync-tokyo.b | git pack-objects --stdout -q; rm -f /tmp/sync-tokyo.a /tmp/sync-tokyo.b"
if [ "$CHAIN" = 1 ]; then
  N="$(ssh "$S" "cd $SD && (git merge-base --is-ancestor $TH HEAD && git rev-list --count $TH..HEAD) || echo '?'")"
  say "  차분 — 도쿄 ${TH:0:12} → 서울 ${SH:0:12}(그 사이 커밋 $N 개 · 보내는 것은 서울 HEAD 트리에서 바뀐 객체만)"
  if [ "$MODE" = dry ]; then
    say "  크기 $(ssh "$S" "$PACK" | wc -c | awk '{printf "%.1f MB (%d B)", $1/1048576, $1}') · (예행 — 도쿄 무변)"; exit 0
  fi
  # 얕은 경계는 도쿄가 그 커밋의 부모를 다 갖고 있지 않을 때만 적는다(한 커밋 차 · 얕지 않은 도쿄면 안 적는다 — 이음이 온전하다)
  PAR="$(ssh "$S" "cd $SD && git rev-parse $SH^@" | tr '\n' ' ')"
  ssh "$S" "$PACK" | dots | \
    ssh "$T" "set -e; cd $TD; git index-pack --stdin >/dev/null; m=0; for p in $PAR; do git cat-file -e \$p^{commit} 2>/dev/null || m=1; done; if [ \$m = 1 ]; then grep -qx $SH .git/shallow 2>/dev/null || echo $SH >> .git/shallow; fi; git cat-file -e $SH^{tree}; git reset -q --hard $SH; git clean -qfd; git log --oneline --abbrev=12 -1"
else
  [ -n "${SYNC_COMMIT:-}" ] && die "SYNC_COMMIT 판은 차분만 한다(폴백 = 서울 HEAD 얕은 사본이라 그 커밋이 아니다) — 도쿄 HEAD 를 서울이 모르거나 --full"
  [ "$MODE" = full ] && say "  --full — 얕은 사본 통째" || say "  ⚠차분이 이어지지 않는다(서울이 도쿄 HEAD ${TH:0:12} 를 모른다 · 또는 도쿄에 레포가 없다) — 얕은 사본 통째(느리다)"
  if [ "$MODE" = dry ]; then say "  (예행 — 도쿄 무변)"; exit 0; fi
  # 서울: 얕은 사본(커밋 하나) — 작업 트리 + .git 만 · node_modules · DB 없음 · 원격은 떼고 간다(`set-head -d` 먼저 — git 2.43 `remote remove` 가 origin/HEAD 를 빈 가리킴으로 남겨 fsck 가 운다)
  ssh "$S" "set -e; d=\$(mktemp -d /tmp/sync-tokyo-src.XXXXXX); git clone -q --depth 1 file://$SD \$d/Mini; git -C \$d/Mini remote set-head origin -d >/dev/null; git -C \$d/Mini remote remove origin; tar -C \$d/Mini -czf - --exclude=node_modules --exclude='*.db*' .; rm -rf \$d" | dots | \
    ssh "$T" "set -e; d=\$(mktemp -d /tmp/sync-tokyo-in.XXXXXX); tar -C \$d -xzf -; rm -rf $TD.prev; if [ -d $TD ]; then mv $TD $TD.prev; fi; mkdir -p \$(dirname $TD); mv \$d $TD; cd $TD && git reset -q --hard && git clean -qfd && git log --oneline --abbrev=12 -1"
fi
say "  서울 $(ssh "$S" "cd $SD && git log --oneline --abbrev=12 -1 $SH" | cut -c1-90)$([ -n "${SYNC_COMMIT:-}" ] && echo ' (SYNC_COMMIT — 서울 HEAD 아님)')"
say "  도쿄 $(ssh "$T" "cd $TD && git log --oneline --abbrev=12 -1" | cut -c1-90)"
[ "$(ssh "$T" "cd $TD && git rev-parse HEAD")" = "$SH" ] && say "  ✓ 두 줄이 같다" || die "두 줄이 다르다"

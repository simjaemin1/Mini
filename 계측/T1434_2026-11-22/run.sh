#!/usr/bin/env bash
# === 계측/T1434_2026-11-22/run.sh — 끔 세계 서버 1,460날 판(T1434 · 코드 손 0) ===
#   자: `scripts/t1308-long-run.js <날> <시드> --every <날>`(한 마디 = 아이 존 프로세스 하나 · T1420 ⓐ 와 같은 꼴)
#   끔 세계 = `T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1`(T1420 판 조건) · 곁 관찰기 `t1434-observe.js`
#   판은 하나씩(다른 판과 같이 돌리지 않는다) · 판마다 제 폴더 · 제 TMPDIR · 끝나면 DB · 체크포인트를 지운다(로그 · 관찰 줄만 남긴다)
#   이어 돌리기: done.txt 에 있는 판은 건너뛴다 · 끝나지 않은 판(컨테이너 재시작)은 폴더를 지우고 처음부터.
#   줄: "<태그> <시드> <날> <힙 MB 또는 def> [cuts]" — JOBS 파일(없으면 기본 넷)
#   env: ROOT · OUT · JOBS(선택)
set -u
ROOT="${ROOT:?}"; OUT="${OUT:?}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"; touch "$OUT/done.txt"
JOBS_FILE="${JOBS:-$OUT/jobs.txt}"
[ -f "$JOBS_FILE" ] || printf '%s\n' "h6g 1020 1460 6144" "h6g 7 1460 6144" "h6g 42 1460 6144" "def 1020 1460 def" > "$JOBS_FILE"
echo "start $(date -u +%FT%TZ) $(git -C "$ROOT" rev-parse --short HEAD)" >> "$OUT/meta.txt"
while read -r tag seed days heap cuts; do
  [ -z "${tag:-}" ] && continue
  id="$tag-$seed${cuts:+-c$cuts}"
  grep -q "^$id " "$OUT/done.txt" && continue
  D="$OUT/$id"; rm -rf "$D"; mkdir -p "$D/tmp" "$D/obs"
  NO="-r $HERE/t1434-observe.js"; [ "$heap" != def ] && NO="--max-old-space-size=$heap $NO"
  t0=$(date +%s)
  ( cd "$ROOT" && env T400_BUILD_ACT=0 VILLAGE_CARAVAN_MAX=0 T745_VCLOCK=1 TMPDIR="$D/tmp" T1434_OBS="$D/obs" NODE_OPTIONS="$NO" \
      node scripts/t1308-long-run.js "$days" "$seed" --every "$days" ${cuts:+--cuts $cuts} --dir "$D" --tag "$tag" > "$D/runner.out" 2>&1 < /dev/null )
  rc=$?; dt=$(( $(date +%s) - t0 ))
  echo "$id $rc $dt" >> "$OUT/done.txt"
  # 큰 것 지우기: 판 DB · 체크포인트 DB(죽은 자리 재현에 체크포인트가 쓰이는 판은 cuts 판이 제 것을 다시 만든다)
  rm -rf "$D/tmp" "$D"/w.db* "$D"/ck/w.db*
done < "$JOBS_FILE"
echo "done $(date -u +%FT%TZ)" >> "$OUT/meta.txt"

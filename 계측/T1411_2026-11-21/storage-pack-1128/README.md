# 오래된 종료 덤프 압축 보존 · 2026-11-28

T1411의 현재 세계·DB·체크포인트는 그대로 두고, 정상 종료한 과거 마디의 중복 `stop-N.json`만 정본 도구로 압축했다.

- 명령: `nice -n 15 python3 scripts/t1411-pack-old-stops.py --runs /tmp/t1411/worlds --out /workspace/scratch/t1411/old-stop-dumps`
- 켬 22개·끔 21개. 원문 1663952855바이트 → 새 gzip 173061707바이트. 순 1490891148바이트 절약.
- 각 파일 원문 SHA256 = gzip 전체 해제 SHA256, 원문 크기·mtime 불변을 확인한 뒤 보존 manifest를 먼저 쓰고 중복 원문만 지웠다. manifest 사본은 같은 폴더의 ON/OFF 파일이다.
- 대상은 진행·이진 체크포인트 둘 다의 680날보다 엄격히 이전이며 정상 종료한 종점뿐이다. 미완성 마디·관측 장부·살아 있는 저장·ck는 대상이 아니다.
- 같은 명령 재실행은 0개다(`repeat.json`). 보호 상태 사후 점검에서 양팔 이진 680 묶음 해시는 복구 전 별도 보존본과 모두 같았고, 실행 트리 제품 두 파일은 고정 작업 가지와 같았다(`protected-state-check.json`). 이는 압축 유지보수 확인이며 세계 결과 검증을 대신하지 않는다.

보존 위치는 `/workspace/scratch/t1411/old-stop-dumps/<case>/stop-N.json.gz`다. 카드 종료 때 원본을 이미 압축했다는 이유로 이 보존 묶음을 지우지 않는다.

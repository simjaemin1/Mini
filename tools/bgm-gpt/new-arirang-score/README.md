# 새 아리랑-착상 8마디: 작곡 악보 초안 1

상태: **청취 비교 중·미확정 R&D**. 실제 대금 연주를 채보했다고 주장하지 않으며, 게임 기본 BGM이나 국립국악원 원본 파일에는 반영하지 않았다. B0는 재민이 호흡·멜로디를 잠정 긍정했지만 비브라토 부재를 지적했다.

- 박자/길이: 세마치 3대박×3소박, 8마디×9소박×0.266666…초 = **19.2초**. 국악원 아리랑 한 악구 `w3-914-001/002`와 비교 청취하기 위한 길이일 뿐, 녹음이 이 악보대로 연주되었다는 뜻은 아니다.
- 음집합: C 중심 5음계 **G4 A4 C5 D5 E5**. 첫 모티프 G→A의 이웃음 상승은 기존 아리랑 저작 악보의 첫머리에서 빌렸지만, 바로 G로 돌아가는 대신 **G–A–C–A**로 확장했다. 7마디에서 같은 윤곽을 리듬을 바꾸어 회귀시킨다.
- 형식: 1–2마디 질문·응답 → 3–4마디 E 정점과 G 반종지 → 5–6마디 E 반복 후 꺾인 하행 → 7–8마디 모티프 회귀와 C 종지.
- 호흡: 2·4·6·8마디 끝에 악보에 쓴 쉼. 첫 소리와 쉼 뒤는 `breath_start`, 선택된 새 음은 `rearticulate`, 손가락으로 잇는 곳은 명시적 `slur`. 슬러는 기존 표현 생성기의 **12ms** 최소저크 로그음고 전환이며 현악기 같은 긴 글리산도를 지시하지 않는다.
- 비브라토: **B0는 전 음 OFF**. B1에서는 8마디 C 종지에만 악보에 미리 적어 둔 늦은 요성 후보(3.45 Hz, ±18센트, 음 시작 0.8초 뒤 진입)를 시험 선택했다. 원연주 측정치, 학습된 표현법, 정통 경기민요 관습이라는 주장이 아니다. 다른 음·호흡·발음·음량 지시는 B0와 같다.

파일:

- `new_ari_8bar_r1.json`: 마디별 음·쉼의 정수 소박 위치/길이/음고/발음법. 소스 오브 트루스.
- `build_score_expression_plan.py`: 위 악보의 빈틈 없는 72소박, 음집합, 호흡/슬러, 기존 저작 악보(`_bgm/code/코드백업_최신/arirang.py` 앞 8마디)와 동일한 마디가 없음을 검사해 기존 `mini.score-expression.plan.v1` 계약의 계획 파일을 생성한다.
- `new_ari_8bar_expression_b0_r1.json`: 위 생성 계획. 28개 음+4개 `release` 쉼, 19.2초. 300Hz 제어율은 모든 소박 경계가 48kHz 샘플 및 제어 격자에 놓이게 해 18개 슬러의 오디오율 12ms 전환 복원을 가능하게 한다.
- `controls_b0_r1/`: 기존 `tools/score-expression/compile_expression.py`로 검증한 제어 곡선과 manifest. **오디오 아님.**
- `probe_source_002_contour.py`: 국악원 `w3-914-002`의 읽기 전용 거친 F0 비교 도구. 정확한 채보·독창성 증명이 아니다.
- `build_public_daegeum_runtime_plan.py`와 `new_ari_8bar_ddsp_gugak_legacy100_r1.json`: B0 악보를 기존 공개 DDSP-Gugak 추론기에만 맞춘 권리 미확인·비공개 R&D 입력. 저작 악보·국악원 원본을 바꾸지 않는다.
- `build_private_vibrato_b1.py`와 `new_ari_8bar_ddsp_gugak_legacy100_b1_final_c_vibrato_r1.json`: 고정된 B0 입력에서 **마지막 C5 한 음의 기존 비활성 후보만** 선택하는 B1 계획. 나머지 31개 이벤트는 그대로다.
- `run_private_full_ddsp_multi_release.py`: 기본 B0를 유지하며 `--audition-slot B1_final_C_only`를 명시한 때만 SHA 고정 B1 계획을 허용한다. 두 판 모두 새 학습 없이 같은 게시 체크포인트로 추론하고, 악보의 호흡 쉼 4곳을 각각 검사한다.

비공개 청취본은 작업 폴더 `_bgm/gpt/새선율_시험/비공개_전체곡_실험/`에 보존한다. B1은 19.2초, 약 -20.0 LUFS로 B0와 맞췄다. 17.6초 전의 인코딩 전 소리는 비트 단위로 같고, 마지막 음의 활성 비브라토 곡선만 달라진다. 독립 검사는 네 호흡 경계와 새 클릭·무음 여부를 통과했지만 **음악적 자연스러움의 최종 판정은 청취 후**다. B1 제작정보 JSON과 추론 보고서에는 입력/출력 해시 및 세부 검사 수치를 남겼다. 게시 모델의 게임·공개 배포 권리는 확인되지 않았으므로 두 모델 청취본 모두 사적 R&D 범위를 넘기지 않는다.

원본의 실제 음정 윤곽은 아직 사람 손으로 검증하지 않았다. `w3-914-002` 자동 거친 음고 검사에서 6마디 앞 E→C와 8마디 긴 C는 이 초안과 일부 닮았으나, 6마디 끝은 국악원 원음이 대략 G로, 초안은 A로 간다. 첫 7마디 전부가 원음과 명백히 다르다는 확정 판정도 할 수 없다. 특히 원본 조각을 재배열해 오디오를 만든다면, 이 악보가 새로 쓰였더라도 **새 연주가 아니라 국악원 녹음의 재조합**이라고 표기해야 한다.

재현:

```bash
python3 tools/bgm-gpt/new-arirang-score/build_score_expression_plan.py --check
python3 tools/bgm-gpt/new-arirang-score/build_public_daegeum_runtime_plan.py --check
python3 tools/bgm-gpt/new-arirang-score/build_private_vibrato_b1.py --check
python3 tools/bgm-gpt/new-arirang-score/test_private_full_ddsp_multi_release.py
```

국악기 음원 제공 — 국립국악원 (공공누리 제1유형).

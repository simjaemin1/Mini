# C001 대금 v2 dry-only 학습 사전 프로토콜

이 실험은 재민이 들은 ② 음량 불일치, ③ 과한 에코, ④ 크게 증폭한 잡음에 대한 **학습 단계의 진단**이다. ②의 비교 UI 문제를 v2 학습 성공으로 혼동하지 않는다. 2026-10-12에는 Mac 여유 공간 약 8.1 GiB로 실행하지 않았다. 2026-10-13 재민의 정리·진행 승인 뒤 Unreal Engine 설치본을 삭제해 약 47 GiB를 확보하고, 아래 시작 조건을 다시 확인한 뒤 50-step 시험부터 실행한다. AI Hub 71470 원음·16 kHz 사본·체크포인트·청취본은 로컬 비공개에만 두며 게임에 넣거나 공유하지 않는다.

## 사전에 고정한 첫 실험

- 모델: 검증된 IRCAM `ddsp_pytorch` 소스 그대로를 생성기에 쓰되 `reverb`만 `Identity`로 교체해 wet=0, dry=100%로 만든다. 원본 reverb 임펄스의 무제한 이득을 구조적으로 제거한다. 원본 녹음의 잔향까지 재현할 수 없을 수 있으며, 이 결과는 완성 BGM 후보가 아니라 원인 분리 실험이다. 추후 필요하면 L1 이득을 제한한 별도 wet arm을 새 프로토콜로 시험한다.
- **새 모델과 Adam을 처음부터** 초기화한다. 기존 1,000-step checkpoint는 SHA-256·소스/분할/코드/모델 설정을 확인해 비교 기준으로 묶을 뿐 가중치·optimizer를 이식하지 않는다. 기존 dry 출력은 작아서 이식하면 옛 과한 wet에 의존한 스케일을 끌고 갈 위험이 있다.
- 원본 250개 C001은 216개/15곡 train, 34개/4곡 재사용 진단셋으로 이미 나뉘어 있다. 15 train 곡 중 해시·고정 seed로 **12 fit 곡 / 3 internal validation 곡**을 음원 특징 추출 전에 확정한다. 입력 loudness 정규화만 fit 12곡으로 계산하며 F0는 Hz 그대로다. 진단 4곡은 파일 무결성만 확인하고 v2 학습·내부 검증·체크포인트 선택에 사용하지 않는다. 그러나 이 4곡은 **기존 v1/VB01 분석과 사용자 청취에서 이미 여러 번 확인했으므로 블라인드 검증셋이 아니다.**
- 각 fit clip에서 길이 4초 지속음 창 최대 2개와 소리-쉼→재진입 acoustic proxy 창 최대 1개. clip당 처음 120초만 본다. fit에는 서로 다른 재진입 창 ≥24개, ≥6곡이 없으면 중단한다. 학습 step은 **재진입 1 : 지속음 2**를 사전 고정해 재진입이 수백 지속음에 묻히지 않게 한다. internal validation은 곡마다 종류별 서로 다른 clip에서 2창씩(최대 12창), 세 곡 모두 종류별 2창·곡마다 quiet 20 frames·전체 quiet 100 frames가 없으면 중단한다. 이 창은 실제 호흡 라벨이 아니다.
- 모든 4초 음성을 **무마스킹** 다중 FFT 손실로 본다. 여기에 10 ms 단위 RMS dB envelope, 원본 <−50 dBFS 구간에서 출력이 `max(원본 dB+6, −55 dBFS)`보다 큰 소리로 새는 상대 초과 음량, 재진입 창의 source-defined 40 ms 양의 envelope 변화(>6 dB, quiet→active) 주변 ±200 ms만의 attack 손실을 고정 가중치 1.0/0.5/0.5/0.25로 더한다. source에서 이 변화가 검출되지 않은 proxy 창은 학습·검증에서 제외한다. 실제 아티큘레이션·score timing을 이 손실로 배웠다고 주장하지 않는다. F0 추출 창은 64 ms, loudness STFT는 약 128 ms다.
- 내부 검증은 50 step마다, **곡별 평균 뒤 3곡 평균**의 합성 objective 최소인 checkpoint를 고른다. 이 외의 진단셋 청취·숫자로 하이퍼파라미터를 바꾸지 않는다. 기본은 50-step smoke; 한 번에 50 단위, 최대 500 step·120분이다. 중도 종료해도 마지막 50-step 경계 checkpoint만 유효하다. 중단한 모델을 재개하는 기능은 없고, 새 시도는 새 private 폴더에서 한다.

## 안전·출력

실행은 소스·분할·기존 기준 checkpoint를 각각 SHA-256으로 검증하고, train/진단셋 원본 WAV의 헤더·SHA·inode 분리를 기존 검사기로 다시 확인한다. 결과는 Git 밖의 **기존 빈 0700 디렉터리**에 0600 checkpoint·보고서만 쓴다. Python 네트워크 호출을 차단하고, 16 GB Mac arm64/MPS·정확한 소스와 패키지 버전을 요구한다. 시작 전 12 GiB, 학습 중 매 step과 checkpoint 저장 뒤 9 GiB 미만이면 즉시 중단한다. macOS swap 급증 가능성을 없애지는 못하므로 시스템 상태도 별도로 확인해야 한다. checkpoint 파일당 512 MiB 상한이며 **최적·최신 최대 2개만 보존**한다(형식상 상한 총 1 GiB). 지우는 파일은 이 새 출력 폴더 안에서 이번 실행이 만든 정확한 checkpoint SHA를 다시 확인한 뒤에 한한다. 청취 WAV·score 출력은 이 스크립트가 만들지 않는다.

기존 v1 마지막 500-step 재개 보고서의 186초는 v2 소요시간 보장이 아니다. v2는 unmasked 손실과 검증을 추가하므로 50-step smoke의 전체 소요는 준비를 포함해 미측정이며, CLI의 120분은 소프트 상한이다. 공간 12 GiB 이상과 코드 검토 후에만 다음 형식으로 **별도 새 폴더**에서 실행한다.

```sh
<private_venv_python> tools/bgm-gpt/aihub-readiness/mac_mps_ddsp_v2_dry_trial.py \
  --source-manifest <private_16k_manifest.json> \
  --split-manifest <private_split.json> \
  --upstream-root <private_pinned_ddsp_pytorch_checkout> \
  --baseline-dir <private_v1_1000_step_checkpoint_directory> \
  --output-dir <new_empty_0700_private_directory> \
  --steps 50 --minutes 30
```

## 이미 확인한 4곡 진단셋은 규칙 고정 뒤 v2에서 한 번만 재평가

이 trainer에는 진단셋 추론 명령을 **의도적으로 넣지 않았다**. 선택한 checkpoint와 아래 기준을 먼저 잠근 뒤, 별도의 검증기를 검토해 **이미 살펴본** 34개와 같은 VB01 24개 전수를 v2에 대해 한 번 재평가한다. 진단 결과로 같은 v2 시도의 설정을 바꾸지 않는다. 사전 고정한 *청취 미리보기* 수치 게이트는 (1) 34개 전체 quiet leakage ≤5%, (2) VB01 입력에서 modulation-positive였던 20개 중 출력 ≥16개이면서 네 곡 각각 ≥1개, (3) 100 ms 이상 과한 tail 없음, (4) 화면에 보여 줄 샘플 각각 raw RMS가 원본 ±3 dB 안, (5) 첫 quiet→active 비교에서 뚜렷한 echo/hiss 없음이다. 숫자 통과도 대금 음색·곡 적합성·음악적 비브라토 위치의 증명이 아니다. 한 기준이라도 실패하면 BGM 후보로 보여주지 않고 원인을 기록한다. 일반화 여부를 주장하려면 이후 **완전히 새 미사용 곡**을 별도 확보해 평가해야 한다.

새 비교를 만들 때는 48 kHz 원음과 모델 입력/출력을 정직하게 구분한다. **본 비교의 source/v1/v2에는 원본 기준으로 정한 한 개의 공통 gain만** 적용해 raw 상대 음량과 envelope를 유지한다. 개별 정규화가 필요한 음색 전용 보조 비교는 별도 라벨을 붙인다. 특히 작은 dry 내부 신호만 +35 dB 키워 다른 완성 후보처럼 제시하지 않는다. 원본 음원과 파생물은 권리 조건에 따라 계속 로컬 비공개로 둔다.

## 2026-10-13 실제 실행 및 내부 검증

공간 확보 후 50-step 시험은 준비 포함 67.28초, 별도 500-step 본 실행은 275.48초에 완료했다. 12 fit 곡에서 397창(재진입136), 내부 검증3곡에서12창(재진입6)을 확보했다. 사전 scalar objective 선택은400-step checkpoint를 골랐다. 내부 검증에서 quiet leakage29/716(4.05%), active drop59/2,028(2.91%), 창별 RMS 차이 중앙−2.35dB였다.

중앙값만으로 음량 통과라고 판단하지 않는다. 12창 중6창이 원본±3dB를 벗어났고, 한 검증곡의4창은 모두−6.72~−7.47dB였다. DC전력 비율 최대0.0131%로 이번 원인은 DC가 아니다. 문제곡의 주 음역은 약242Hz인 반면, fit의 신뢰도 높은F0 프레임139,834개 중220~270Hz는1,194개(약0.85%)뿐이었다. 이 단계에서는 재사용 진단4곡을 v2로 추론하지 않았다.

이후 별도 dry v2 continuation으로 같은 데이터·정규화·모델·손실을 유지하면서 학습률을 낮춰 학습한다. 부모400-step checkpoint와 optimizer를 정확한SHA로 결속한다. 추가학습의 내부선택은 모든12창의 원본 대비 RMS±3dB, 전체 quiet/active-drop 각각5% 이하를 만족한 checkpoint에 한해 objective를 비교한다. 원래500-step 실행 결과와 별도 provenance로 남긴다.

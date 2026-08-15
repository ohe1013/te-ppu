# 테뿌리스 ONE store Android 출시 안내

이 문서는 `te-ppu`를 ONE store에 먼저 출시해 게임 등급분류를 받은 뒤,
그 스토어 URL과 등급 정보를 앱인토스에 제출하는 현재 릴리스 절차를 설명한다.

## 현재 릴리스 계약

| 항목 | 값 |
| --- | --- |
| 바이너리 | Android APK |
| 애플리케이션 ID | `io.github.ohe1013.teppu` |
| 앱 표시 이름 | `테뿌리스` |
| 버전 | `versionCode 1`, `versionName 1.0.0` |
| 최소/대상 SDK | 24 / 36 |
| 릴리스 파일 | `artifacts/android/teppu-1.0.0-release.apk` |
| AVD | `Teppu_API_36` |
| 인증서 SHA-256 | `8E:CB:64:4F:E8:EB:FC:40:CA:68:59:14:37:42:E3:B8:85:3A:18:51:4C:52:07:75:13:A4:AC:ED:64:C7:2B:1F` |

현재 준비된 방식은 **APK + ONE store의 `앱 서명 사용 안함`**이다. 이 옵션명은
APK가 서명되지 않았다는 뜻이 아니다. 개발자가 영구 키로 직접 서명한 APK를
등록하고, ONE store가 다시 서명하지 않는다는 뜻이다.

EXE는 Android 상품용 파일이 아니다. 지금 등급 심의와 휴대폰 배포에는 위 APK를
사용한다. ONE store는 APK와 AAB를 모두 지원하지만, AAB로 시작하거나 전환한
상품은 다시 APK로 되돌릴 수 없다. 이 릴리스에서는 AAB로 바꾸지 않는다.

## 현재 컴퓨터에서 다시 빌드하고 확인하기

모든 명령은 delivery worktree 저장소 루트에서 실행한다.

```powershell
$npm = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\npm.cmd'
$node = 'C:\Users\USER\AppData\Roaming\nvm\v24.15.0\node.exe'
$apk = 'artifacts\android\teppu-1.0.0-release.apk'
```

### 1. SDK 상태 확인

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/android/Install-AndroidSdk.ps1 -ValidateOnly
```

다른 컴퓨터에 처음 설치할 때만 라이선스 내용을 직접 확인하고 동의한 뒤 다음을
실행한다. 자동화 과정에서 라이선스를 묵시적으로 동의하면 안 된다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/android/Install-AndroidSdk.ps1 -AcceptLicenses
```

### 2. 영구 서명 상태 확인

초기 생성 또는 기존 키 확인은 같은 명령을 사용한다. 기존 키가 있으면 교체하지
않고 인증서만 검증한다.

```powershell
& $npm run signing:android:init

powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/android/Initialize-AndroidSigning.ps1 -ValidateOnly
```

### 3. 서명 APK 생성 및 검증

```powershell
& $npm run build:android:release
& $npm run verify:android:release
```

검증은 APK 파일의 체크섬, 패키지 ID, 앱 이름, 버전, min/target SDK,
v2 이상 서명과 인증서 지문을 확인한다. 성공 출력은
`TEPPU_ANDROID_RELEASE_VERIFIED`이다.

### 4. API 36 에뮬레이터 스모크 확인

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File scripts/android/Invoke-AndroidSmoke.ps1 -Apk $apk
```

이 검사는 APK 설치와 Activity 실행 후 제목 화면, 신규 이름 입력, 리벳 선택,
1층 선택, 첫 대전 진입을 확인한다. 결과와 캡처는 다음 위치에 생성된다.

- `artifacts/android/emulator/smoke.txt`
- `artifacts/android/emulator/title.png`
- `artifacts/android/emulator/tower.png`
- `artifacts/android/emulator/battle.png`
- `artifacts/android/emulator/logcat.txt`

성공 출력은 `TEPPU_ANDROID_SMOKE_OK`이며, 스크립트가 자신이 시작한 에뮬레이터를
종료한다.

## 산출물 위치

- 업로드 APK: `artifacts/android/teppu-1.0.0-release.apk`
- APK 체크섬: `artifacts/android/teppu-1.0.0-release.apk.sha256`
- APK 검증 보고서: `artifacts/android/verification.txt`
- 에뮬레이터 증거: `artifacts/android/emulator/`

`artifacts/android/` 전체는 Git에서 제외된다. APK나 캡처를 커밋하지 않는다.

## 출시 전에 반드시 서명 키 백업하기

다음 두 파일은 **항상 함께** 백업한다.

- `C:\Users\USER\.teppu\android-signing\teppu-upload.jks`
- `C:\Users\USER\.teppu\android-signing\teppu-signing.credential.xml`

같은 폴더의 `README.txt`도 같이 보관한다. 백업은 Git 저장소가 아닌 암호화된
외장 저장소나 승인된 비밀 저장소에 둔다. JKS, credential XML, 비밀번호 또는
그 내용을 Git이나 채팅에 올리지 않는다.

credential XML은 Windows DPAPI로 보호되어 현재 Windows 사용자와 컴퓨터
컨텍스트에서만 복호화된다. 따라서 파일 복사본만으로 새 컴퓨터에서 즉시 복구할
수 있다고 가정하면 안 된다. 현재 컴퓨터를 잃기 전에 시스템 복구 또는 안전한
키 이전 절차를 별도로 마련해야 한다. 키를 잃으면 같은 패키지의 업데이트가
불가능해질 수 있다.

## ONE store 콘솔 등록 순서

1. 개발자센터에서 Android 상품을 생성한다.
2. 상품의 패키지 이름이 `io.github.ohe1013.teppu`인지 확인한다. 출시 후 바꾸지
   않는다.
3. 신규 바이너리 유형은 `APK`를 선택한다.
4. 현재 준비된 경로를 유지하려면 서명키 옵션에서 `앱 서명 사용 안함`을
   선택한다. ONE store 앱 서명으로 변경하려면 별도의 키 이전 절차가 필요하므로
   두 방식을 섞지 않는다.
5. `artifacts/android/teppu-1.0.0-release.apk`를 업로드한다.
6. 콘솔이 표시하는 패키지 이름, 버전 코드, 버전 이름, 인증서 지문을 이 문서의
   현재 릴리스 계약과 대조한다.
7. 상품명, 상세 설명, 고객문의 정보와 개인정보처리 관련 항목을 실제 정보로
   작성한다. 예시 회사명·전화번호·주소를 제출하지 않는다.
8. 게임 등급 설문은 실제 게임 내용에 맞춰 답한다. 사용 연령 입력값만 보고
   등급을 임의로 정하지 않는다.
9. 실제 앱 화면의 원본 캡처를 등록한다. 제목 화면만이 아니라 타워와 퍼즐 대전
   화면을 포함한다.
10. 지원 단말 목록을 검토하고 검증을 요청한다. 승인 후 판매 개시하여 외부에서
    열리는 ONE store 상품 URL을 확보한다.

유료 아이템이나 결제가 없는 현재 빌드에는 ONE store IAP를 임의로 추가하지
않는다.

## 앱인토스 게임 등급 정보로 넘기기

ONE store 상품 페이지가 실제로 출시되어 외부에서 열리는 상태가 된 다음 진행한다.
검증 대기 URL이나 개발자센터 내부 URL은 사용하지 않는다.

1. 앱인토스 콘솔의 게임 등급분류에서 `스토어 링크`를 선택하고 출시된 ONE store
   상품 URL을 입력한다.
2. 개인 개발자는 본인 정보를, 사업자는 사업자등록증과 일치하는 정보를 입력한다.
3. 게임물관리위원회의 자체등급분류 게임물 조회에서 출시된 게임을 찾는다.
4. 조회 결과와 동일하게 등록자명, 자체등급분류사업자명 `원스토어`,
   등급분류일자, 등급분류번호, 이용등급과 내용정보를 입력한다.
5. 대표자 인감 또는 서명 원본 이미지를 첨부한다.
6. ONE store에서 등급을 받은 플레이 화면 2장과 앱인토스에서 실행한 동일 게임
   화면 2장을 대응시켜 올린다. 별도 편집 없이 원본 플레이 화면을 사용한다.

ONE store와 앱인토스의 화면은 같은 게임임을 알아볼 수 있어야 한다. 권장 대응은
`타워 ↔ 타워`, `퍼즐 대전 ↔ 퍼즐 대전`이다. Android 상태바나 앱인토스 셸처럼
플랫폼 자체 영역은 달라도 되지만, 캐릭터·상대·보드와 핵심 게임 내용은 동일해야
한다.

## 다음 Android 업데이트의 버전 올리기

ONE store에서 승인된 기존 APK를 교체할 때는 이전보다 큰 `versionCode`가
필수다. 패키지 ID와 서명 키는 유지한다.

현재 자동화는 첫 릴리스 `1.0.0`에 고정되어 있으므로 다음 릴리스 전에 다음 값을
한 변경으로 함께 갱신한다.

1. `android/app/build.gradle`의 `versionCode`와 `versionName`
2. `scripts/android/Build-AndroidRelease.ps1`의 기본 `Version`
3. `scripts/android/Verify-AndroidRelease.ps1`의 예상 APK 이름과 버전 계약
4. `scripts/android/Invoke-AndroidSmoke.ps1`의 예상 APK 이름
5. `scripts/android/*.test.mjs`의 해당 계약 기대값

`Build-AndroidRelease.ps1 -Version`만 바꾸면 파일 이름만 바뀌고 manifest 버전은
바뀌지 않는다. 따라서 이 옵션만 단독으로 사용하지 않는다. 변경 후 Android 계약
테스트, 릴리스 빌드, APK 검증과 에뮬레이터 스모크를 모두 다시 실행한다.

## 확인 경계

- API 36 x86_64 Google APIs 에뮬레이터 검증은 완료되어야 한다.
- 실제 Android 휴대폰 설치, 성능, 오디오 포커스와 기기별 시스템 UI는 휴대폰을
  연결해 테스트하기 전까지 미검증이다.
- ONE store 심사 승인, 공개 상품 URL 생성과 자체등급분류 등록은 콘솔에서 사람이
  완료해야 한다.
- Android APK 성공은 앱인토스 `.ait` 승인이나 앱인토스 실기기 검증을 대신하지
  않는다.

## 공식 참고 문서

- [ONE store Android 바이너리](https://onestore-dev.gitbook.io/dev/docs/apps/android/binary)
- [ONE store App 서명](https://onestore-dev.gitbook.io/dev/docs/apps/android/app-signing)
- [ONE store 상품 검증 가이드라인](https://onestore-dev.gitbook.io/dev/docs/review/one-store-review-guideline)
- [앱인토스 콘솔에서 앱 등록하기](https://developers-apps-in-toss.toss.im/prepare/console-workspace.html)
- [앱인토스 서비스 오픈 프로세스](https://developers-apps-in-toss.toss.im/intro/onboarding-process.html)

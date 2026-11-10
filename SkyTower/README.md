<!-- GitHub Pages can publish this README as the folder's front page; these two lines forward players to the game. GitHub's file view hides them. -->
<meta http-equiv="refresh" content="0; url=www/index.html">
<script>location.replace('www/index.html' + location.search);</script>

# ONE MORE FLOOR: SKY TOWER

끝없는 탑을 오르는 오프라인 3D 모바일 아케이드 게임입니다. 외부 라이브러리와 음원 파일 없이 WebGL2와 WebAudio만 사용하며, `www/` 폴더가 게임 전체입니다.

## 바로 실행 (PC)

```bash
powershell -ExecutionPolicy Bypass -File tools\serve.ps1
```

브라우저에서 `http://localhost:8790/www/`를 엽니다. 키보드는 A/D 또는 방향키로 이동, 스페이스로 점프, P로 일시 정지입니다.

## GitHub에 올려서 실행 (GitHub Pages)

1. GitHub에서 **Public** 저장소를 만듭니다.
2. 저장소의 **Add file → Upload files**에 `SkyTower` 폴더를 끌어다 놓고 커밋합니다.
3. **Settings → Pages**에서 Source를 **Deploy from a branch**, Branch를 **main / (root)** 로 정하고 Save를 누릅니다.
4. 1~2분 뒤 아래 주소로 접속합니다. 대소문자를 그대로 입력해야 합니다.

```text
https://<GitHub아이디>.github.io/<저장소이름>/SkyTower/
```

`SkyTower` 폴더 자체가 아니라 폴더 안의 파일들을 저장소 맨 위에 올렸다면 주소 끝의 `SkyTower/`를 뺍니다.

수정본은 같은 위치에 다시 업로드하면 몇 분 안에 반영됩니다. 빌드 과정은 없습니다.

## PWABuilder로 스토어 패키지 만들기

1. 위 방법으로 GitHub Pages에 올린 뒤 [pwabuilder.com](https://www.pwabuilder.com)을 엽니다.
2. 주소 입력란에는 **게임 폴더(`www`) 주소**를 넣습니다. `SkyTower/` 입구 주소는 이동만 하는 페이지라 매니페스트가 없습니다.

```text
https://<GitHub아이디>.github.io/<저장소이름>/SkyTower/www/
```

3. 점검 결과에서 매니페스트, 서비스 워커(오프라인), 아이콘(일반·마스커블), 스크린샷 항목이 모두 채워져 있는지 확인한 뒤 Android / Windows / iOS 패키지를 받습니다.

포함된 항목: `manifest.webmanifest`(id, 전체 화면, 세로 고정, 카테고리, 홈 화면 바로가기 'AI Race'), `icons/`(96·180·192·512 일반, 192·512 마스커블), `screenshots/`(세로 1080×1920 3장, 가로 1920×1080 1장), `sw.js`(오프라인 실행).

**Android 주의:** 앱을 주소창 없이 띄우려면 PWABuilder가 만들어 주는 `assetlinks.json`을 **도메인 맨 위**의 `/.well-known/assetlinks.json`에 올려야 합니다. `<아이디>.github.io/<저장소이름>/` 같은 프로젝트 주소에서는 그 위치에 파일을 둘 수 없습니다. 그래서 `<아이디>.github.io`라는 이름의 저장소(사용자 사이트)를 따로 만들거나 개인 도메인을 연결해야 합니다. 이 파일이 없어도 앱은 동작하지만 위쪽에 주소창이 보입니다.

## 휴대폰에서 바로 플레이 (PWA)

위 주소를 휴대폰 브라우저로 열고 "홈 화면에 추가"를 선택합니다. 한 번 접속하면 서비스 워커가 파일을 저장하므로 이후에는 인터넷 없이 실행됩니다.

## Android / iOS 앱 빌드

필요한 도구: Node.js LTS, Android Studio(Android), macOS와 Xcode(iOS).

```bash
npm install
```

```bash
npx cap add android
```

```bash
npx cap add ios
```

```bash
npx cap sync
```

```bash
npx cap open android
```

```bash
npx cap open ios
```

세로 화면으로 고정하려면 생성된 네이티브 프로젝트를 수정합니다.

- Android: `AndroidManifest.xml`의 `MainActivity`에 `android:screenOrientation="portrait"` 추가
- iOS: Xcode의 Deployment Info에서 Portrait만 체크

## 구조

| 파일 | 역할 |
| --- | --- |
| `www/js/data.js` | 물리 수치, 환경, 스킨 30종과 능력, 테마 10종, 층수 보상, 경쟁 모드 설정 |
| `www/js/i18n.js` | 한국어·영어·일본어·중국어(간체)·스페인어 번역 |
| `www/js/sim.js` | 캐릭터 물리(여러 명), 시작 패턴 7종, 절차적 발판 생성, 밀치기·밟기, 용암 (DOM/GL 비의존) |
| `www/js/bot.js` | 경쟁 모드 AI와 테스트용 자동 플레이 |
| `www/js/gfx.js` | WebGL2 렌더러, 셰이더, 인스턴싱 |
| `www/js/scene.js` | 카메라, 캐릭터 리그, 배경, 파티클 풀 |
| `www/js/audio.js` | 합성 효과음과 배경 음악 |
| `www/js/save.js` | localStorage 저장 (백업 사본 포함) |
| `www/js/input.js` | 조이스틱, 점프, 한 손 모드, 키보드 |
| `www/js/ui.js`, `www/js/main.js` | 메뉴, HUD, 게임 흐름, 자동 품질 조절 |

## 테스트

서버 실행 후 `http://localhost:8790/tests/sim-test.html`을 열면 점프 도달성, 점프 높이, 봇 플레이 시간을 검사합니다.

URL에 `?mute`를 붙이면 소리 없이 실행되고, `?bot=0.8`은 봇이 소리 없이 자동 플레이합니다.

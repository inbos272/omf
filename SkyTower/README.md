<!-- GitHub Pages can publish this README as the folder's front page; these two lines forward players to the game. GitHub's file view hides them. -->
<meta http-equiv="refresh" content="0; url=www/index.html">
<script>location.replace('www/index.html' + location.search);</script>

# Sky Tower

> **이번 버전에서 서버를 다시 배포해야 합니다.** 랭킹표(`/score`, `/top`)가 추가되었습니다. 아래 [배포](#배포)의 `npx wrangler deploy`를 한 번 더 실행하세요. 배포 전에도 대전은 그대로 되고, 랭킹표만 "서버 업데이트 필요"로 표시됩니다.

## 온라인 대전·랭크전 (Cloudflare Durable Objects)

규칙은 AI대전과 같습니다. 5명이 90초 동안 같은 탑을 오르고, 서로 밀치고 머리를 밟을 수 있습니다. 가장 높이 오른 사람이 이깁니다. 10초 안에 5명이 모이지 않으면 빈자리를 AI로 채웁니다. 랭크전은 **일반대전 5승** 뒤에 열립니다.

### 구조

```text
 휴대폰(게임)                         Cloudflare Worker  (server/src/index.js)
 ───────────                          ─────────────────────────────────────────
 대전 메뉴 ── GET /health, /profile ──▶ Ledger DO (전체 1개): 선수별 RP·일반대전 승수·닉네임·최고 층
 랭킹표 ──── POST /score, GET /top ──▶ Ledger DO: 최고 층 TOP 100, 최고 랭크(최고 RP) TOP 100
 일반대전/랭크전 ── WS /play ────────▶ Matchmaker DO (모드별 1개): 대기열, 5명 또는 10초 → 방 생성
                 ◀── {match, room, token}
 경기 ───────── WS /room ────────────▶ Room DO (경기마다 1개): 시드·시작 시각 배포, 상태 중계,
                                       결과 수집, 순위 확정, Ledger에 RP/승수 반영
```

**동작 순서**
1. **대기:** 대전 메뉴를 열면 서버 상태와 내 기록을 확인합니다. 일반대전이나 랭크전을 누르면 `/play`로 대기열에 들어갑니다.
2. **방 생성:** Matchmaker가 사람을 모으고, 모자란 자리는 AI 슬롯으로 채웁니다. 랭크전은 RP가 가까운 사람끼리 묶고, AI 실력은 방 평균 RP로 정합니다. 그다음 Room을 만들어 각 선수에게 1회용 토큰을 보냅니다.
3. **시작:** 각 클라이언트가 `/room`에 연결하면 Room이 시드, 선수 명단, 시작 시각(서버 시각 기준), 호스트를 알려 줍니다. 모든 클라이언트가 같은 시드로 같은 탑을 만들고, 같은 순간에 출발합니다.
4. **경기 중:**
   - 각 클라이언트는 자기 캐릭터만 직접 계산하고, 위치를 초당 15번 보냅니다. 상대는 120ms 늦게 보간해서 그립니다.
   - AI는 호스트(연결된 사람 중 가장 낮은 번호)가 계산해서 보냅니다. 호스트가 나가면 서버가 다음 사람을 호스트로 지정하고, 그 사람이 AI를 이어받습니다.
   - 무너지는·폭발 발판이 작동하면 모두에게 전달됩니다.
   - 용암은 서버 시각 기준의 고정된 속도표로 움직여 모든 화면에서 같은 높이입니다.
5. **결과:**
   - 각자 자기 결과(층수, 도달 시각)를 보내고, 호스트는 AI 결과를 함께 보냅니다.
   - Room이 순위를 정합니다. 층수가 높은 순, 같으면 먼저 도달한 순입니다.
   - 경기 중에 나간 사람은 꼴찌로 처리합니다.
   - 랭크전은 순위별로 RP가 +40 / +20 / +5 / −10 / −20 바뀌고(0 미만으로는 내려가지 않음), 일반대전은 1위의 승수를 올립니다.

**랭크:** 브론즈 0 · 실버 300 · 골드 700 · 플래티넘 1200 · 다이아몬드 1800 · 마스터 2500 RP

### 랭킹표 (HTTP)

| 요청 | 내용 |
| --- | --- |
| `POST /score` `{pid, name, best}` | 혼자 하기에서 최고 기록을 세우면 보냅니다. 서버는 더 높은 값만 저장합니다(0~100000층). 닉네임이 바뀌었으면 두 랭킹의 이름도 바꿉니다. |
| `GET /top?type=floor\|rp&pid=` | `{top:[{name, v, me}], me:{v, rank}}`. `floor`는 최고 층, `rp`는 랭크전에서 도달한 최고 RP입니다. 응답에 다른 사람의 `pid`는 담지 않습니다. |

메뉴 오른쪽 위 🏆 버튼이 랭킹표를 엽니다. 100위 밖이면 아래 '내 순위' 줄에 기록만 보입니다.

### 메시지 (JSON over WebSocket)

| 방향 | 메시지 | 내용 |
| --- | --- | --- |
| 클라이언트 → Matchmaker | 연결 `/play?mode&pid&name&skin&ab`, `{t:'cancel'}` | 대기열 참가, 취소 |
| Matchmaker → 클라이언트 | `{t:'queue', n, fillIn}`, `{t:'match', room, token}`, `{t:'error', code}` | 대기 인원, 방 배정, 잠김 등 오류 |
| 클라이언트 → Room | 연결 `/room?id&pid&token`, `ping`, `s`, `ai`, `ev`, `res` | 시계 맞춤, 내 상태, AI 상태(호스트만), 발판 작동, 결과 |
| Room → 클라이언트 | `hello`, `pong`, `host`, `s`, `ai`, `ev`, `joined`, `end` | 경기 정보, 호스트 변경, 중계, 최종 순위와 RP |

### 배포

필요한 것: Cloudflare 계정(무료 플랜 가능), Node.js LTS.

```bash
cd server
```

```bash
npx wrangler login
```

```bash
npx wrangler deploy
```

배포가 끝나면 `https://sky-tower.<계정>.workers.dev` 같은 주소가 나옵니다. 이 주소를 `www/js/config.js`에 넣고 GitHub에 다시 올립니다.

```js
window.SKY_SERVER_URL = 'https://sky-tower.<계정>.workers.dev';
```

주소가 비어 있거나 서버에 연결되지 않으면 대전 메뉴의 일반대전·랭크전 버튼이 비활성화됩니다. AI대전은 항상 오프라인으로 됩니다. 확인용 주소는 `<주소>/health`이며 `{"ok":true}`가 나오면 정상입니다.

### 한계와 주의
- **결과 신뢰:** 각 클라이언트가 자기 결과를 보고하는 구조라서, 마음먹고 조작하면 기록을 부풀릴 수 있습니다. 공개 랭킹을 운영하려면 서버 쪽 검증(이동 속도·층 간격 검사)을 추가해야 합니다.
- **계정:** 따로 없습니다. 기기마다 무작위 ID를 만들어 저장하므로, 앱 데이터를 지우면 랭크가 새로 시작됩니다.
- **무료 플랜 한도:** 한도(요청 수, Durable Object 사용량)를 넘으면 접속이 거절될 수 있습니다. 서버 코드는 WebSocket Hibernation API를 써서 대기 중 비용을 줄였습니다.
- **검증 범위:** 이 저장소에서는 실제 Cloudflare 대신 브라우저 안의 가짜 런타임으로 매칭, 경기, 호스트 교체, RP 반영을 검증했습니다(`tests/server-test.html`). 실제 배포 후에는 휴대폰 두 대로 일반대전을 한 판 해 보세요.

## 광고 (AdMob) 연동

### 광고가 나오는 곳

| 위치 | 종류 | 규칙 |
| --- | --- | --- |
| 시작 발판의 🛗 엘리베이터 → "광고 보고 30층" | 보상형 | 끝까지 보면 30층에서 시작 |
| 게임 오버 / 대전 결과 → "광고 보고 코인 3배" | 보상형 | 결과 화면마다 1번, 이번 판 획득 코인 ×3 |
| 부활 창 → "광고 보고 부활" | 보상형 | 한 판에 1번. 코인·부활권 부활은 따로 가능 |
| 결과 화면에서 나갈 때 | 전면 | 7~10판(무작위)마다 1번 |

### 지금 상태: 임시 광고 화면

`www/js/config.js`의 `provider`가 `'placeholder'`이면 게임 안에서 임시 광고 화면을 띄웁니다. 보상형은 5초, 전면은 3초 뒤에 닫을 수 있고 보상도 그대로 지급됩니다. 그래서 광고를 연결하기 전에도 모든 버튼이 동작합니다.

```js
window.SKY_ADS = {
  provider: 'placeholder', // 'placeholder' | 'admob' | 'h5'
  admob: { rewardedId: '...', interstitialId: '...', testing: true },
  h5: { client: '', testing: true },
};
```

게임 코드는 `www/js/ads.js`의 `S.Ads.rewarded(위치)`와 `S.Ads.interstitial(위치)`만 부릅니다. 광고를 불러오지 못하면 보상 없이 "지금은 광고를 볼 수 없어요"가 뜨고, 전면 광고는 그냥 넘어갑니다.

### 먼저 알아둘 점: 어디에 AdMob을 붙일 수 있나

AdMob SDK는 **네이티브 앱**(Android/iOS) 안에서만 동작합니다.

- **Capacitor로 빌드한 앱:** AdMob을 쓸 수 있습니다. 아래 A 방법을 따르세요.
- **PWABuilder 패키지(TWA)·웹·PWA:** AdMob을 쓸 수 없습니다. 웹용 광고인 Google **H5 게임 광고**(AdSense)를 쓰세요. 아래 B 방법입니다.

### A. Capacitor 앱 + AdMob (권장)

1. **AdMob 준비**
   - [admob.google.com](https://admob.google.com)에 가입하고 앱을 Android, iOS 각각 등록합니다.
   - 등록한 앱마다 광고 단위를 2개 만듭니다. **보상형(Rewarded)** 1개와 **전면(Interstitial)** 1개입니다.
   - 앱 ID(`ca-app-pub-…~…`)와 광고 단위 ID(`ca-app-pub-…/…`)를 적어 둡니다.
2. **플러그인 설치** (위 "Android / iOS 앱 빌드"를 먼저 해 둔 상태에서)

```bash
npm install @capacitor-community/admob
```

```bash
npx cap sync
```

3. **Android 설정:** `android/app/src/main/AndroidManifest.xml`의 `<application>` 안에 앱 ID를 넣습니다.

```xml
<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy"/>
```

4. **iOS 설정:** `ios/App/App/Info.plist`에 다음을 넣습니다.
   - `GADApplicationIdentifier`: 앱 ID 문자열
   - `SKAdNetworkItems`: Google이 안내하는 SKAdNetwork ID 목록
   - `NSUserTrackingUsageDescription`: 추적 권한 안내 문구. 예: "맞춤 광고를 보여 드리기 위해 사용합니다"
5. **게임 설정:** `www/js/config.js`를 바꿉니다.
   - `provider: 'admob'`
   - `rewardedId`, `interstitialId`에 만든 광고 단위 ID를 넣습니다. Android와 iOS의 ID가 다르면 플랫폼별로 빌드할 때 바꿔 넣습니다.
   - 기본값은 Google 공식 **테스트 광고 단위**이므로, 그대로 두면 테스트 광고가 나옵니다.
6. **테스트:**
   - 개발 중에는 반드시 `testing: true`와 테스트 ID를 씁니다. 실제 광고를 직접 누르면 AdMob 계정이 정지될 수 있습니다.
   - 실기기에서 세 가지 보상형 광고(엘리베이터, 코인 3배, 부활)와 전면 광고(7~10판마다)가 모두 나오는지 확인합니다.
   - 확인이 끝나면 실제 ID를 넣고 `testing: false`로 바꿉니다.
7. **출시 전 확인:**
   - 개발자 웹사이트에 `app-ads.txt`를 올립니다.
   - 개인정보처리방침을 준비합니다.
   - Play Console의 "앱에 광고 포함"에 체크합니다.
   - EU 사용자를 받는다면 AdMob의 동의(UMP) 메시지를 설정합니다. 플러그인의 `requestConsentInfo` / `showConsentForm`을 `ads.js`의 `init()`에서 호출하면 됩니다.

### B. 웹·PWA·PWABuilder 패키지: H5 게임 광고

1. [AdSense](https://www.google.com/adsense)에 가입하고 사이트를 등록합니다. H5 게임 광고(Ad Placement API)는 별도 신청과 승인이 필요합니다.
2. 승인되면 `config.js`를 `provider: 'h5'`, `h5.client: 'ca-pub-…'`로 바꿉니다.
   - `testing: true`이면 테스트 광고가 나옵니다.
   - 실제 서비스에서는 `testing: false`로 바꿉니다.
3. 광고 재고가 없으면 Google이 광고를 건너뜁니다. 이때 보상형은 보상 없이 끝나고, 게임은 "지금은 광고를 볼 수 없어요"를 보여 줍니다.

---

## 이번 버전에 추가된 것

- **부활:** 혼자 하기에서 5층 이상 올라가다 떨어지면 부활 창이 8초 동안 뜹니다.
  - **코인:** 부활 비용은 `(200 + 층×25)`이고, 같은 판에서 부활할 때마다 2배가 됩니다. 예: 40층 첫 부활 1,200코인.
  - **부활권:** 일일 보상으로 받습니다.
  - **광고:** 한 판에 1번 볼 수 있습니다.
  - 부활하면 그 층(없으면 바로 아래 층)의 안전한 발판으로 돌아가고, 용암은 게임 시작 때만큼 아래로 물러납니다. 3초 동안 용암이 느려집니다.
- **새 세계:** 400층부터 **지옥**(검은 첨탑과 용암 폭포, 잿불, 무겁고 어두운 음악), 500층부터 **천국**(대리석 기둥, 떠다니는 금빛 고리, 구름 바다, 종소리와 합창풍 음악).
- **일일 보상:** 7일 주기로 보상이 커집니다. 하루라도 빠지면 1일차부터 다시 시작합니다. 메뉴 🎁 버튼에서 받습니다.
  - 1일차 300코인 → 2일차 30층 이용권 → 3일차 600코인 → 4일차 부활권 → 5일차 1,000코인 → 6일차 30층 이용권 2장 → 7일차 2,500코인과 부활권
- **랭킹표:** 메뉴 🏆 버튼. 최고 층과 최고 랭크 두 가지이며, 서버가 필요합니다.
- **폭발 발판:** 폭발 반경과 날려 보내는 힘이 커졌습니다.
- **이름과 아이콘:** 게임 이름을 "Sky Tower"로 바꾸고 아이콘을 새로 그렸습니다(`tools/make-icons.ps1`).

---

끝없는 탑을 오르는 오프라인 3D 모바일 아케이드 게임입니다. 외부 라이브러리와 음원 파일 없이 WebGL2와 WebAudio만 사용하며, `www/` 폴더가 게임 전체입니다. 온라인 대전용 서버 코드는 `server/` 폴더에 있습니다.

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
| `www/js/save.js` | localStorage 저장 (백업 사본 포함), 일일 보상 날짜 계산 |
| `www/js/ads.js` | 광고 연결부: 임시 광고 화면, AdMob(Capacitor), H5 게임 광고 |
| `www/js/net.js` | 온라인 대전, 랭킹표 요청 |
| `www/js/input.js` | 조이스틱, 점프, 한 손 모드, 키보드 |
| `www/js/ui.js`, `www/js/main.js` | 메뉴, HUD, 게임 흐름, 자동 품질 조절 |

## 테스트

서버 실행 후 `http://localhost:8790/tests/sim-test.html`을 열면 점프 도달성, 점프 높이, 봇 플레이 시간을 검사합니다.

URL에 `?mute`를 붙이면 소리 없이 실행되고, `?bot=0.8`은 봇이 소리 없이 자동 플레이합니다.

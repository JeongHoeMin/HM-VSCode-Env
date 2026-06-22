# HM VS Code Env

`hm-vscode-env`는 프로젝트마다 반복해서 맞추는 VS Code 설정을 레이어 조합으로 생성하는 개인용 CLI입니다.

목표는 코드 자체를 바꾸는 것이 아니라, VS Code를 사용할 때 필요한 `.vscode` 설정과 선택형 Profile 파일을 빠르게 준비하는 것입니다. 기본 UI 감각은 WebStorm에 가깝게 맞추고, 테마는 `Island Light`를 기본값으로 사용합니다.

## 빠른 시작

```bash
npx hm-vscode-env
```

CLI가 프로젝트 형태를 차례대로 물어봅니다.

```text
Runtime
  1. Node.js
  2. Python

Node project type
  1. Node only
  2. Frontend
  3. Backend
  4. Electron
```

예를 들어 `Electron -> Vue -> TypeScript`를 고르면 내부적으로 다음 레이어가 적용됩니다.

```text
base -> node -> frontend -> typescript -> vue -> electron
```

직접 이름을 알고 있다면 바로 적용할 수도 있습니다.

```bash
npx hm-vscode-env apply vue-ts .
npx hm-vscode-env apply electron-vue-ts .
npx hm-vscode-env apply nestjs .
npx hm-vscode-env apply fastapi .
```

레이어를 직접 지정하는 고급 사용도 가능합니다.

```bash
npx hm-vscode-env apply --layers node,frontend,vue,typescript .
```

## 생성되는 것

CLI는 대상 프로젝트에 두 종류의 파일을 생성합니다.

```text
.vscode/
  settings.json
  extensions.json
  tasks.json
  launch.json

profiles/
  hm-{preset}.code-profile
```

`.vscode`는 현재 프로젝트에 적용되는 workspace 설정입니다. 포맷터, lint 설정, 파일 네스팅, 탐색기 표시, tasks, launch 설정처럼 프로젝트 안에서 공유해도 되는 값을 담습니다.

`profiles/*.code-profile`은 VS Code Profile로 가져오기 위한 파일입니다. 확장 프로그램 목록, 키바인딩, 테마, 아이콘, UI 취향처럼 사용자 환경에 가까운 값을 담습니다.

## 확장 프로그램 동작

이 CLI는 사용자의 전체 확장 프로그램을 자동 설치하거나 삭제하지 않습니다.

`.vscode/extensions.json`은 이 프로젝트에 필요한 확장을 추천 목록으로 적어둡니다. VS Code에서 프로젝트를 열면 추천 확장을 확인하거나 설치할 수 있습니다.

확장까지 프로젝트별 환경처럼 분리해서 쓰고 싶다면 생성된 `.code-profile`을 VS Code Profile로 import하세요.

## Profile 사용법

CLI 적용 후 다음과 같은 안내가 출력됩니다.

```text
A VS Code Profile file was also generated for extensions, keybindings, theme, and UI preferences:
  profiles/hm-electron-vue-ts.code-profile

To use it:
  1. Open VS Code Command Palette
  2. Run "Profiles: Import Profile..."
  3. Select the generated .code-profile file
  4. After importing, open this project with: code . --profile "hm-electron-vue-ts"
```

처음 한 번은 VS Code에서 직접 import해야 합니다.

1. Command Palette를 엽니다.
2. `Profiles: Import Profile...`을 실행합니다.
3. 생성된 `profiles/hm-*.code-profile` 파일을 선택합니다.
4. import 후에는 아래처럼 해당 프로필로 프로젝트를 열 수 있습니다.

```bash
code . --profile "hm-electron-vue-ts"
```

## 기존 프로젝트에 적용

이미 `.vscode` 폴더가 있는 프로젝트에서 실행하면 CLI가 처리 방식을 묻습니다.

```text
1. Back up existing .vscode, then overwrite it
2. Merge preset into existing .vscode
3. Cancel
```

추천 기본값은 백업 후 덮어쓰기입니다. 기존 설정은 `.vscode.backup-YYYYMMDD-HHmmss` 형태로 보관됩니다.

## 레이어와 조합

기본 레이어:

```text
base
python -> fastapi
node -> javascript
node -> typescript
node -> frontend -> vue
node -> frontend -> react
node -> backend -> express
node -> backend -> typescript -> nestjs
node -> electron
```

대표 조합:

| 이름 | 적용 레이어 |
| --- | --- |
| `vue-ts` | `base -> node -> frontend -> typescript -> vue` |
| `vue-js` | `base -> node -> frontend -> javascript -> vue` |
| `react-ts` | `base -> node -> frontend -> typescript -> react` |
| `electron-vue-ts` | `base -> node -> frontend -> typescript -> vue -> electron` |
| `electron-vue-js` | `base -> node -> frontend -> javascript -> vue -> electron` |
| `nestjs` | `base -> node -> backend -> typescript -> nestjs` |
| `express-js` | `base -> node -> backend -> javascript -> express` |
| `fastapi` | `base -> python -> fastapi` |

## 새 레이어 추가

1. `templates/{layer}` 폴더를 만듭니다.
2. 필요한 파일만 추가합니다.
   - `settings.json`
   - `extensions.json`
   - `tasks.json`
   - `launch.json`
3. `src/layers.mjs`의 `layerDefinitions`에 의존성을 추가합니다.
4. 자주 쓸 조합이면 `presetAliases`에 이름을 추가합니다.
5. 검증합니다.

```bash
npm run validate:json
node scripts/resolve-preset.mjs vue-ts
```

## 배포

GitHub 저장소:

```text
https://github.com/JeongHoeMin/HM-VSCode-Env
```

npm에 배포하면 사용처에서는 설치 없이 실행할 수 있습니다.

```bash
npm publish
npx hm-vscode-env
```

로컬에서 이 저장소를 직접 사용할 수도 있습니다.

```bash
git clone https://github.com/JeongHoeMin/HM-VSCode-Env.git
cd HM-VSCode-Env
node scripts/apply-vscode-preset.mjs
```

## 검증

```bash
npm run validate:json
node scripts/resolve-preset.mjs electron-vue-ts
node scripts/apply-vscode-preset.mjs apply vue-ts ./sample-project
```

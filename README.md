# HM VS Code Env

`hm-vscode-env`는 프로젝트마다 반복해서 맞추는 VS Code 설정을 레이어 조합으로 생성하는 개인용 CLI입니다.

목표는 코드 자체를 바꾸는 것이 아니라 VS Code 사용 경험을 빠르게 맞추는 것입니다. 기본 UI 감각은 WebStorm에 가깝게 맞추고, 테마는 `Island Light`를 기본값으로 사용합니다.

## 빠른 시작

```bash
npx @homini/vscode-env
```

CLI는 방향키, 스페이스바, 엔터로 선택할 수 있습니다.

- 방향키: 항목 이동
- 스페이스바: 체크박스 선택/해제
- 엔터: 확정
- 선택 목록은 처음과 끝에서 순환하지 않습니다.

직접 프리셋 이름을 지정할 수도 있습니다.

```bash
npx @homini/vscode-env apply vue-ts .
npx @homini/vscode-env apply electron-vue-ts .
npx @homini/vscode-env apply nestjs .
npx @homini/vscode-env apply fastapi .
```

레이어를 직접 지정하는 고급 사용도 가능합니다.

```bash
npx @homini/vscode-env apply --layers node,frontend,vue,typescript .
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

## Profile 자동 설정

기본 대화형 흐름에서는 CLI가 Profile을 자동으로 만들고 연결할지 물어봅니다.

승인하면 CLI는 VS Code CLI를 사용해 다음 작업을 시도합니다.

```bash
code --profile "hm-vue-ts" .
code --profile "hm-vue-ts" --install-extension dbaeumer.vscode-eslint
```

확장 프로그램은 추천 목록을 체크박스로 보여주며, 기본적으로 전체 선택되어 있습니다. 설치하지 않을 확장은 스페이스바로 해제할 수 있습니다.

`code` CLI를 찾지 못하면 실패로 종료하지 않고, 생성된 `.code-profile` 파일을 수동으로 import하는 방법을 안내합니다.

VS Code가 새 Profile을 처음 생성하는 동안에는 확장 설치가 바로 준비되지 않을 수 있습니다. CLI는 Profile이 준비될 때까지 잠깐 기다리며, 그래도 준비되지 않으면 다시 실행할 명령을 안내합니다.

## 명령 옵션

```bash
npx @homini/vscode-env apply vue-ts . --mode=backup-and-overwrite
npx @homini/vscode-env apply vue-ts . --setup-profile --install-extensions
npx @homini/vscode-env apply vue-ts . --skip-profile
npx @homini/vscode-env apply vue-ts . --profile-name hm-my-vue
```

옵션:

| 옵션 | 설명 |
| --- | --- |
| `--mode backup-and-overwrite` | 기존 `.vscode`를 백업한 뒤 새로 씁니다. |
| `--mode merge` | 기존 `.vscode`에 프리셋을 병합합니다. |
| `--mode cancel` | 기존 `.vscode`가 있으면 적용을 취소합니다. |
| `--profile-name <name>` | 기본 `hm-{preset}` 대신 사용할 VS Code Profile 이름입니다. |
| `--setup-profile` | 질문 없이 VS Code Profile 생성/연결을 실행합니다. |
| `--skip-profile` | `.code-profile` 파일만 만들고 VS Code Profile 생성/연결은 건너뜁니다. |
| `--install-extensions` | Profile에 추천 확장을 모두 설치합니다. |
| `--no-install-extensions` | Profile은 생성/연결하되 확장 설치는 하지 않습니다. |

비대화형 환경에서는 명시 옵션이 없으면 Profile 생성/연결 및 확장 설치를 건너뜁니다.

## 기존 프로젝트에 적용

이미 `.vscode` 폴더가 있는 프로젝트에서 실행하면 CLI가 처리 방식을 묻습니다.

```text
Back up existing .vscode, then overwrite it
Merge preset into existing .vscode
Cancel
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
pnpm run validate:json
node scripts/resolve-preset.mjs vue-ts
```

## 배포

```bash
pnpm run validate:json
npm publish --access public
```

배포 후 사용처에서는 설치 없이 실행할 수 있습니다.

```bash
npx @homini/vscode-env
```

## 검증

```bash
pnpm run validate:json
node scripts/resolve-preset.mjs electron-vue-ts
node scripts/apply-vscode-preset.mjs apply vue-ts ./sample-project --skip-profile
```

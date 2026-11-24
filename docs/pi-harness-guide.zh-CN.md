# Pi Harness 定制版维护, 上游同步与云端发版指南

本文档记录 `Pi Harness` (Fork 自 `abcwyc/pi-agent-desktop`) 的包标识隔离配置, 上游更新合并流程, 冲突处理规则与 GitHub Actions 云端打包发版步骤.

---

## 一, 独立标识与原版并存说明

为保证 **Pi Harness** 可以与原版 **Pi Agent** 在同一台设备上并存安装, 同时运行且互不覆盖, 本分支已将应用标识, 产物名称, 本地端口与缓存目录完全隔离, 同时保留共享 `~/.pi/agent/` 会话与模型配置的能力.

| 配置项 | 原版 (`Pi Agent`) | 定制版 (`Pi Harness`) | 所在文件 |
| --- | --- | --- | --- |
| 产品名称 (`productName`) | `Pi Agent` | `Pi Harness` | `src-tauri/tauri.conf.json`, `lib/branding.ts` |
| 主可执行文件名 (`mainBinaryName`) | `pi-agent-desktop` | `pi-harness` | `src-tauri/tauri.conf.json` |
| 应用唯一标识 (`identifier`) | `com.abcwyc.pi-agent` | `com.fourmin.pi-harness` | `src-tauri/tauri.conf.json`, `desktop/server-helper-Info.plist` |
| 分发名称 (`APP_DISTRIBUTION_NAME`) | `pi-agent-desktop` | `pi-harness` | `lib/branding.ts` |
| 起始版本号 | `0.8.7` | `1.0.0` | `src-tauri/pi-agent-desktop-package.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` |
| 桌面本地服务首选项端口 | `38471` | `38571` | `src-tauri/src/lib.rs` |
| Release 与自动更新仓库 | `abcwyc/pi-agent-desktop` | `four-min/pi-agent-desktop` | `src-tauri/tauri.conf.json`, `lib/branding.ts`, `scripts/release-components.mjs` |

- **数据共享**: 两个版本均默认读取 `~/.pi/agent/` (会话历史, `models.json`, `auth.json`, 技能与插件); 如需完全隔离数据目录, 可设置环境变量 `PI_CODING_AGENT_DIR`.
- **并存效果**: Windows 下原版安装于 `%LOCALAPPDATA%\Pi Agent\`, 定制版安装于 `%LOCALAPPDATA%\Pi Harness\`, 各自拥有独立的 WebView2 缓存, 窗口状态, 卸载项与单实例锁.

---

## 二, 云端打包与发布 Release

本机无需安装 Rust 或 C++ 编译环境, 所有跨平台构建均可直接在 GitHub Actions 云端完成.

### 1. 推送代码到仓库

```powershell
git add -A
git commit -m "你的提交说明"
git push origin main
```

### 2. 方式 A: 云端测试打包 (免配签名密钥, 最快获取安装包)

适用于快速获取 Windows (`.exe`), macOS Apple Silicon / Intel (`.dmg`), Linux (`.deb`) 安装包:

1. 打开 GitHub 仓库 `four-min/pi-agent-desktop` -> **Actions**.
2. 左侧选择 **Desktop test build** (`.github/workflows/desktop-test-build.yml`).
3. 点击右侧 **Run workflow** -> 保持默认参数或自定义测试标签 -> 点击 **Run workflow**.
4. 构建完成后, 在该次运行页面底部的 **Artifacts** 区域下载对应平台安装包 (名称形如 `pi-harness-1.0.0-test.1-x86_64-pc-windows-msvc`).
5. 如需将下载的安装包挂到 GitHub Releases 页面: 进入 **Releases** -> **Draft a new release**, 创建 tag (如 `v1.0.0`) 并上传安装包后发布.

### 3. 方式 B: 云端自动发布正式 Release (含应用内在线更新签名)

适用于通过 `.github/workflows/release.yml` 自动构建全平台安装包, 生成 `latest.json` 并发布为 Latest Release:

#### 首次配置签名密钥 (只需一次)

1. 在本地终端生成 Tauri 更新器密钥对 (仅调用 `node_modules` 中的 CLI, 不需要 Rust 环境):
   ```powershell
   npx tauri signer generate -w $HOME/.tauri/pi-agent-desktop.key
   ```
2. 在 GitHub 仓库 **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret** 添加 3 个 Secret:
   - `TAURI_SIGNING_PRIVATE_KEY`: 私钥文件 `pi-agent-desktop.key` 的完整内容.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 生成密钥时输入的密码.
   - `TAURI_UPDATER_PUBLIC_KEY`: 公钥文件 `pi-agent-desktop.key.pub` 的完整内容.

#### 每次发版步骤

1. 若当前 `1.0.0` 尚未发布过 Release, 直接进入第 2 步; 若已发布过, 先自动递增版本号并重新生成清单:
   ```powershell
   node scripts/bump-pi-agent-desktop-version.mjs
   npm run release:manifest
   ```
2. 本地执行发版预检与测试, 确认通过后提交并推送到 `main`:
   ```powershell
   npm run release:verify
   npm run test:release-tools
   git add -A
   git commit -m "准备发布新版本"
   git push origin main
   ```
3. 打开 GitHub **Actions** -> **Publish signed desktop release** -> **Run workflow**, 等待全部平台构建完成后会自动创建并发布正式 Release (`Pi Harness v<version>`).

---

## 三, 同步上游仓库 (`abcwyc/pi-agent-desktop`)

### 1. 确认远程仓库配置

首次使用前检查是否已绑定 `upstream` (已绑定过则跳过):

```powershell
git remote -v
# 若无 upstream, 执行:
git remote add upstream https://github.com/abcwyc/pi-agent-desktop.git
```

### 2. 标准同步流程

1. 确保本地工作区干净 (没有未提交的修改).
2. 拉取并合并上游最新代码:
   ```powershell
   git fetch upstream
   git merge upstream/main
   ```
3. 解决可能出现的合并冲突 (见下方第四节冲突处理清单).
4. 安装/同步依赖并验证:
   ```powershell
   npm install
   npm run release:manifest
   npm run release:verify
   npm run test:release-tools
   ./node_modules/.bin/tsc --noEmit
   npm run lint
   ```
5. 确认无误后推送到 `origin/main`, 再按第二节触发云端打包:
   ```powershell
   git push origin main
   ```

---

## 四, 上游合并冲突处理清单

合并 `upstream/main` 时, 以下定制文件若与上游同时修改产生冲突, 按如下规则保留或合并:

| 文件 | 冲突原因 | 处理原则 |
| --- | --- | --- |
| `src-tauri/pi-agent-desktop-package.json`<br>`src-tauri/Cargo.toml` | 上游发版会更新 `0.8.x` | 保留我方 `1.0.x` 版本号 (不可回退到 `0.8.x`), 保留 `Cargo.toml` 中上游新增的 Rust 依赖. |
| `src-tauri/Cargo.lock` | 上游更新包版本或第三方 crate | 保留上游更新的第三方 crate 与 `tauri-plugin-*` 版本, 仅将 `[[package]] name = "pi-agent-desktop"` 的 `version` 保持为我方 `1.0.x`. |
| `src-tauri/resources/component-versions.json` | 随版本号自动生成 | 直接运行 `npm run release:manifest` 重新生成, 无需手动编辑. |
| `src-tauri/tauri.conf.json` | 上游调整配置或版本号 | 保留我方 `productName: "Pi Harness"`, `mainBinaryName: "pi-harness"`, `identifier: "com.fourmin.pi-harness"` 及 `four-min/pi-agent-desktop` 更新端点. |
| `src-tauri/src/lib.rs`<br>`src-tauri/src/shell/window.rs`<br>`src-tauri/src/shell/platform_tray.rs` | 上游修改桌面壳逻辑 | 合入上游新功能/修复, 保留我方 `DESKTOP_SERVER_PORT = 38571`, `Pi Harness` 标题/托盘文案及 `com.fourmin.pi-harness` 锁路径. |
| `lib/branding.ts`<br>`lib/branding.test.mjs`<br>`lib/app-updates.ts` | 上游修改品牌或更新检查逻辑 | 保留 `PRODUCT_NAME = "Pi Harness"`, `APP_DISTRIBUTION_NAME = "pi-harness"`, `APP_REPOSITORY = "four-min/pi-agent-desktop"`. |
| `Casks/pi-agent.rb`<br>`scripts/update-homebrew-cask.mjs`<br>`scripts/update-homebrew-cask.test.mjs` | 上游更新 Homebrew Cask 版本或 sha256 | 保留 `Pi Harness` / `Pi.Harness` / `com.fourmin.pi-harness` / `four-min/pi-agent-desktop`. |
| `.github/workflows/release.yml` | 上游每次发版会改写 `releaseBody` | 保留我方 `releaseName: Pi Harness v__VERSION__`, 按需合并或精简 `releaseBody`. |

---

## 五, 后续开发与验证规范

1. **样式规范**: 自定义 CSS 统一写入 `app/native-theme.css`; 不要修改 `app/globals.css` 和 `app/settings.css` (须与 `pi-web` 上游基线保持一致).
2. **Tauri 插件版本对齐**: 合并或升级 `@tauri-apps/plugin-*` 后, 须保证 `package-lock.json` 与 `src-tauri/Cargo.lock` 的主/次版本号一致 (`npm run test:release-tools` 会自动校验).
3. **每次合并或修改后的推荐本地全检命令**:
   ```powershell
   npm run release:verify
   npm run test:release-tools
   node --experimental-strip-types --test components/fork-extractions.test.mjs scripts/upstream-css-baseline.test.mjs scripts/ui-menu-consistency.test.mjs lib/branding.test.mjs
   ./node_modules/.bin/tsc --noEmit
   npm run lint
   ```

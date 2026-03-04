# @v-script/va（va-cli）

一个基于 [cac](https://github.com/cacjs/cac) 的 Node.js ESM 命令行工具，主要用于在（pnpm/yarn/npm）工作区/monorepo 中执行常见工程维护动作：运行脚本、清理产物、lint/spell、依赖升级、生成/应用本地补丁包、依赖 link 联调、以及（Gerrit 风格）推送分支。

## 快速开始

### 本地开发/调试

```bash
pnpm install
pnpm build
node ./bin/va.mjs --help
```

`bin/va.mjs` 会加载构建产物 `dist/index.mjs`。

### 作为全局 CLI 使用

如果该包已发布到 npm registry：

```bash
pnpm add -g @v-script/va
va --help
```

或临时执行：

```bash
pnpm dlx @v-script/va --help
```

## 命令一览

命令入口：`va`。

| 命令 | 作用 | 备注 |
| --- | --- | --- |
| `va [script]` | 在工作区内选择一个包含该 script 的包并执行 | 会提示选择包名，然后执行 `pnpm --filter <pkg> run <script>` |
| `va clean [dirs...]` | 清理工作区产物目录 | 默认清理 `node_modules`、`dist`；可选删除 lock 文件；可选深度清理缓存 |
| `va lint [--fix]` | 运行 ESLint（可选 Stylelint） | 若 monorepo 根目录存在 `stylelint.config.mjs` 则一并运行 |
| `va spell` | 对工作区进行拼写检查 | 会确保安装 `cspell`，然后执行 `npx cspell lint ...` |
| `va upgrade [args...]` | 升级依赖版本（taze） | 未提供参数时默认：`taze major -r -I` |
| `va patch` | 基于当前 Git 本地修改生成补丁包 zip | 输出到 `dev-dist/patch-<id>.zip` |
| `va apply [version]` | 应用指定补丁包到当前目录 | 读取 `dev-dist/patch-<version>.zip`，必要时会 `git stash` |
| `va link` | 将依赖改为 `link:` 用于本地联调 | 读取 `.pnpm-local-dev.json` 或通过参数指定包名与路径 |
| `va push [branch...]` | 推送到远端（Gerrit refs/for） | 实际执行：`git push origin HEAD:refs/for/<branch>` |
| `va release [version]` | 工作区发版/升版本（进行中） | 目前实现未完成 |

## 命令细节

### `va [script]`

- 扫描工作区所有包的 `package.json#scripts`
- 交互式选择要运行的包
- 执行：`pnpm --filter <包名> run <script>`

### `va clean [dirs...]`

- `--lock`：删除 lock 文件（默认开启）：`pnpm-lock.yaml` / `yarn.lock` / `package-lock.json`
- `--deep`：深度清理（例如 pnpm store prune / yarn cache clean）
- `dirs...`：传入自定义要删除的目录名；未提供时默认删除 `node_modules`、`dist`

### `va lint [--fix]`

- 默认执行 `npx eslint .`
- `--fix` 时执行 `npx eslint . --fix`
- 若 monorepo 根目录存在 `stylelint.config.mjs`，则额外执行 stylelint（同样支持 `--fix`）

### `va spell`

- 确保安装 `cspell`（若不存在会自动安装）
- 执行：`npx cspell lint **/*.ts **/README.md **/*.vue --no-progress`

### `va upgrade [args...]`

- 确保安装 `taze`
- 透传参数给 `taze`；若未传参，默认使用：`major -r -I`

### `va patch` / `va apply [version]`

`patch` 会基于 `git status --porcelain` 导出 zip 包，包含：

- `meta.json`：包含 baseCommit、branch、createdAt 等信息
- `manifest.json`：新增/修改/删除文件清单
- `files/`：需要写入的文件内容

`apply` 会将 `files/` 写回工作目录，并删除 `manifest.deleted` 中列出的文件；若检测到本地已有修改，会先 `git stash` 以减少冲突风险。

### `va link`

用于把某个依赖包改写成 `link:<本地路径>`，常用于组件包与业务包的联合调试。

两种使用方式：

1) 在项目根目录放置 `.pnpm-local-dev.json`，形如：

```json
{
  "@scope/component-a": "../path/to/component-a"
}
```

1) 通过命令参数指定：

```bash
va link -n @scope/component-a -p ../path/to/component-a
```

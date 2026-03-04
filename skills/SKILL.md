---
name: "va-cli-maintainer"
description: "维护 va-cli：解释命令与入口、添加/修改 cac 子命令、更新使用文档。用户询问 va 的用法、要新增命令或排查 CLI 行为时调用。"
---

# Va CLI Maintainer

## 目标

- 快速理解本仓库的 CLI 入口与命令注册方式
- 为 `va` 增加/修改子命令（基于 cac）
- 保持命令行为与工作区/monorepo 习惯一致
- 需要时同步更新 README 的命令说明

## 项目结构速览

- CLI 入口：`src/index.ts`（创建 cac 实例、安装命令、help/version/parse）
- 命令集合：`src/commands/*`（每个文件暴露 `defineXxxCommand(cac)`）
- 命令安装：`src/commands/index.ts`（`installCommands` 统一注册）
- 执行入口：`bin/va.mjs`（加载构建产物 `dist/index.mjs`）

## 添加新命令的固定流程

1) 在 `src/commands/` 下新增一个命令文件（与现有文件风格一致）
2) 在 `src/commands/index.ts` 中引入并调用你的 `define...Command`
3) 若命令依赖某些工具（例如 `taze` / `cspell`），优先复用 `utils/ensure.ts` 的 `ensureDep`
4) 若命令需要 monorepo 根目录与包列表，优先复用 `utils/monorepo.ts`
5) 运行构建并手动验证 `va --help`、`va <command> --help`（cac 会自动生成帮助信息）

## 代码约定（从现有实现推断）

- 命令定义统一使用 `cac.command(name, description)`
- 执行外部命令统一使用 `execa(..., { stdio: 'inherit' })`
- 需要交互时使用 `@clack/prompts`
- 尽量避免在命令里写死 monorepo 根目录路径，优先通过 lockfile 向上查找

## 示例：新增一个简单命令

目标：新增 `va hello [name]`，输出问候语。

- `src/commands/hello.ts`：导出 `defineHelloCommand(cac)`
- `src/commands/index.ts`：在 `installCommands` 中注册

命令签名参考 `run.ts / clean.ts / lint.ts` 的写法。

## 何时调用本 Skill

- 你需要解释 `va` 各命令做什么、从哪里实现
- 你要新增一个子命令或修改参数/行为
- 你在排查某个命令的执行逻辑（execa 调用、monorepo 检测、git 操作等）
- 你要补齐/更新 README 中的命令说明

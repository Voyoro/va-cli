import AdmZip from "adm-zip";
import type { CAC } from "cac";
import cliProgress from "cli-progress";
import fs from 'node:fs';
import path from "node:path";
import { gitStash, gitStatus } from "../utils/git";

export function defineApplyCommand(cac: CAC) {
  cac.command('apply [version]', 'Extract and use the current patch')
    .action(async (version: string) => {
      const cwd = process.cwd();
      const absZip = path.join(cwd, 'dev-dist', `patch-${version}.zip`);
      if (!fs.existsSync(absZip)) {
        console.error("找不到包：", absZip);
        process.exit(1);
      }
      const zip = new AdmZip(absZip);
      const entries = zip.getEntries();

      const getJson = (name: string) => {
        const e = entries.find(x => x.entryName === name);
        if (!e) return null;
        return JSON.parse(e.getData().toString("utf8"));
      };
      const meta = getJson("meta.json");
      const manifest = getJson("manifest.json");
      if (!meta || !manifest) {
        console.error("包结构不完整（缺 meta.json / manifest.json）");
        process.exit(1);
      }
      const status = await gitStatus();
      if (status) {
        console.log("检测到存在本地修改 已存储到本地 可通过git的存储功能弹出")
        const res = await gitStash('Patch conflicts temporarily stored')
        console.log(res);
      }
      console.log("准备应用变更包：");
      console.log("baseCommit:", meta.baseCommit);
      console.log("branch:", meta.branch);
      console.log("createdAt:", meta.createdAt);
      const entryMap = new Map(entries.map(x => [x.entryName, x]));

      const totalWrite = (manifest.files?.length || 0);
      const totalDelete = (manifest.deleted?.length || 0);
      const total = totalWrite + totalDelete;


      const bar = new cliProgress.SingleBar(
        {
          format: "Applying patch |{bar}| {percentage}% | {value}/{total}",
          hideCursor: true,
          clearOnComplete: false,
          stopOnComplete: true,
        },
        cliProgress.Presets.shades_classic
      );
      bar.start(total || 1, 0, { task: "init" });
      let changedCount = 0;
      let deletedCount = 0;
      for (const f of manifest.files || []) {
        const entryName = `files/${f.path}`;
        const e = entryMap.get(entryName);
        bar.increment(0);

        if (!e) {
          bar.increment(1);
          continue;
        }
        const buf = e.getData();
        const out = path.join(cwd, f.path);

        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, buf);
        changedCount++;
        bar.increment(1);
      }

      for (const rel of manifest.deleted || []) {
        const abs = path.join(cwd, rel);
        if (fs.existsSync(abs)) {
          fs.rmSync(abs, { force: true });
          deletedCount++;
        }
        bar.increment(1);

      }
      bar.stop();

      console.log("✅ Patch apply 完成");
      console.log(`写入: ${changedCount} 个文件`);
      console.log(`删除: ${deletedCount} 个文件`);
    })
}



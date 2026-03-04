import AdmZip from 'adm-zip';
import type { CAC } from "cac";
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import os from "node:os";
import path from "node:path";
import { gitBranch, gitHead, gitStatus } from "../utils/git";

export function definePatchCommand(cac: CAC) {
  cac.command('patch', 'Generate local patches based on the current local modifications')
    .action(async () => {
      const cwd = process.cwd();
      const status = await gitStatus();
      if (!status) {
        console.log('No changes detected; no need for export.')
        return
      }
      const head = await gitHead();
      const branch = await gitBranch();
      const uuid = nanoid(7);

      const parsed = parseStatusPorcelain(status);
      const filesToCopy = [
        ...new Set([
          ...parsed.added,
          ...parsed.modified,
        ]),
      ].filter(Boolean);

      const meta = {
        tool: "lanpatch",
        createdAt: new Date().toISOString(),
        baseCommit: head,
        branch,
        platform: process.platform,
        hostname: os.hostname(),
      };
      const manifest = {
        added: parsed.added,
        modified: parsed.modified,
        deleted: parsed.deleted,
        files: [] as Array<{ path: string; size: number }>,
      };

      const zip = new AdmZip();


      for (const rel of filesToCopy) {
        const abs = path.join(cwd, rel);
        if (!fs.existsSync(abs)) continue
        const content = fs.readFileSync(abs);
        const zipPath = `files/${rel.replaceAll("\\", "/")}`
        zip.addFile(zipPath, content);

        manifest.files.push({
          path: rel.replaceAll("\\", "/"),
          size: content.length,
        });
      }
      zip.addFile("meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf8"));
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
      zip.addFile("status.txt", Buffer.from(status, "utf8"));
      const outName = `patch-${uuid}.zip`;


      const outPath = path.join(cwd, 'dev-dist', outName);
      zip.writeZip(outPath);
      // TODO upload to cloud storage
      // const zipBuffer = zip.toBuffer();
      // const uploadUrl = 'https://tmpfile.link/api/upload';
      // try {
      //   const formData = new FormData();

      //   formData.append('file', new Blob([zipBuffer]), `patch-${uuid}.zip`);
      //   formData.append('folderId', FOLDER_ID);
      //   const response = await fetch(uploadUrl, {
      //     method: 'POST',
      //     headers: {
      //       'Authorization': FILE_TOKEN,
      //     },
      //     body: formData,
      //   });
      //   console.log(response.body)
      //   if (response.ok) {
      //     console.log("✅ 补丁上传成功！");
      //     const content = await response.json() as FileUploadResponse;
      //     console.log(content);
      //   } else {
      //     console.error("❌ 补丁上传失败 已在dev-dist目录下生成zip文件");
      //     const outPath = path.join(cwd, 'dev-dist', outName);
      //     zip.writeZip(outPath);
      //   }
      // } catch {
      //   console.error("❌ 上传过程中发生错误 已在dev-dist目录下生成zip文件")
      //   const outPath = path.join(cwd, 'dev-dist', outName);
      //   zip.writeZip(outPath);
      // }

      console.log("导出成功：", outName);
      console.log("包含文件数：", manifest.files.length);
      console.log("删除文件数：", manifest.deleted.length);
      console.log("请妥善保存该补丁包，应用补丁可使用 apply 命令");
    })
}

function parseStatusPorcelain(text: string) {
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const added = [];
  const modified = [];
  const deleted = [];
  const renamed = [];

  for (const line of lines) {
    if (line.startsWith("?? ")) {
      added.push(line.slice(3));
      continue;
    }

    if (line.startsWith("R")) {
      const rest = line.slice(1).trim();
      const [from, to] = rest.split("->").map(s => s.trim());
      if (from && to) renamed.push({ from, to });
      continue;
    }

    const status = line.slice(0, 2).trim(); // "M", "A", "D"
    const file = line.slice(2).trim();

    if (!file) continue;

    if (status.includes("A")) added.push(file);
    else if (status.includes("D")) deleted.push(file);
    else modified.push(file);
  }

  return { added, modified, deleted, renamed };
}


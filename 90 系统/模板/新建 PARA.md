<%*
/* ============================================================
   mylifeOS · 新建 PARA 向导
   规则：标签 → 文件夹名 & README 文件名
   例：标签 AI自媒体/十月选题
     → 10 项目/AI自媒体-十月选题/十月选题.README.md
   ============================================================ */
// 若是用快捷键“插入”到当前文件触发的，改为新建一个笔记再运行，避免改动当前文件
if (tp.config.run_mode !== 0) {
  await tp.file.create_new(tp.file.find_tfile("新建 PARA"), "未命名 PARA", true, app.vault.getAbstractFileByPath("00 信息资源"));
  return;
}
const TYPES = [
  { label: "🎯 项目 Project — 有目标、有截止日期", root: "10 项目", tpl: "项目" },
  { label: "🧭 领域 Area — 需要长期维持的标准", root: "20 领域", tpl: "领域" },
  { label: "📚 资源 Resource — 持续关注的主题", root: "30 资源", tpl: "资源" },
  { label: "🗄️ 存档 Archive — 不再活跃的条目", root: "40 存档", tpl: "存档" },
];
const type = await tp.system.suggester(TYPES.map(t => t.label), TYPES, false, "选择 PARA 类型");
if (!type) { tR += "> 已取消，可删除此文件。"; return; }
let tag = await tp.system.prompt("标签（层级用 / 分隔，如：AI自媒体/十月选题）", "", false);
tag = (tag || "").trim().replace(/^#/, "").replace(/\s+/g, "-");
if (!tag) { tR += "> 已取消，可删除此文件。"; return; }
const name = tag.split("/").pop();
const dir = `${type.root}/${tag.replace(/\//g, "-")}`;
if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
if (app.vault.getAbstractFileByPath(`${dir}/${name}.README.md`)) {
  new tp.obsidian.Notice("已存在：" + `${dir}/${name}.README.md`);
  tR += "> 同名 README 已存在，可删除此文件。"; return;
}
await tp.file.move(`${dir}/${name}.README`);
tR += `---\ntags:\n  - ${tag}\ntype: ${type.tpl}\ncreated: ${tp.date.now("YYYY-MM-DD")}\n---\n`;
tR += await tp.file.include(`[[${type.tpl}]]`);
%>
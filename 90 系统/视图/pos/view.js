/*
 * mylifeOS · 视图引擎
 * ------------------------------------------------------------------
 * 用法（在任意笔记中）：
 *   ```dataviewjs
 *   await dv.view("90 系统/视图/pos", "TaskListByTag")
 *   ```
 * 第二个参数可以是字符串（视图名），也可以是对象：
 *   { view: "ProjectListByTime", days: 7 }
 *
 * 依赖：Dataview（需开启 JavaScript Queries）。
 * 周期笔记与 PARA 视图：
 *   ProjectListByFolder / AreaListByFolder / ResourceListByFolder / ArchiveListByFolder
 *   TaskListByTag / BulletListByTag / FileListByTag / ArchiveListByTag
 *   ProjectListByTime / AreaListByTime
 *   TaskRecordListByTime / BulletRecordListByTime / TaskDoneListByTime
 * 工作台视图：
 *   Workbench（完整工作台）/ WeekBoard（周任务看板）/ Calendar
 *   Masthead / KPI / Nav / RecentEffort / Section
 */

// ============ 配置：改文件夹名或标题时，只需改这里 ============
const CFG = {
  cadence: "01 周期笔记",
  projects: "10 项目",
  areas: "20 领域",
  resources: "30 资源",
  archives: "40 存档",
  inbox: "00 信息资源",
  output: "50 输出",
  system: "90 系统",
  paraWizard: "90 系统/模板/新建 PARA.md",
  indexPattern: /readme$/i,            // PARA 索引文件：文件名以 README 结尾
  headings: {
    projectList: "项目列表",             // 日记里记录项目耗时的标题
    areaList: "要事维度",                // 季记里记录领域快照的标题
    habit: "习惯打卡",                   // 该标题下的任务不计入统计
    dailyRecord: "日常记录",             // 闪念/记录所在标题
  },
  dueSoonDays: 7,
};

// ============ 基础工具 ============
const { DateTime } = dv.luxon;
const TODAY = DateTime.now().startOf("day");
const arg = typeof input === "string" ? { view: input } : (input || {});
const VIEW = arg.view || "";
let root = dv.container;   // 可临时切换到子容器（工作台分栏时使用）
root.classList.add("pos-root");
const into = async (el, fn) => { const prev = root; root = el; try { await fn(); } finally { root = prev; } };

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined && text !== null) el.textContent = String(text);
  return el;
};
const add = (parent, tag, cls, text) => parent.appendChild(h(tag, cls, text));
const strip = (t) => String(t || "").replace(/^#/, "").trim();
const inFolder = (path, folder) => !!folder && (path === folder || path.startsWith(folder + "/"));
const isSystem = (path) => inFolder(path, CFG.system);
const baseName = (path) => path.split("/").pop().replace(/\.md$/i, "");
const displayName = (path) => baseName(path).replace(/\.readme$/i, "");
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d) => (d ? d.toFormat("yyyy-MM-dd") : "—");
const sectionName = (item) =>
  (item.section && item.section.subpath) || (item.header && item.header.subpath) || "";
const toDT = (v) => {
  if (!v) return null;
  if (v.toMillis) return v;
  const d = DateTime.fromISO(String(v));
  return d.isValid ? d : null;
};

function notify(msg) {
  try {
    const N = window.Notice || require("obsidian").Notice;
    new N(msg);
  } catch (e) { console.warn(msg); }
}

function link(path, text, cls) {
  const a = h("a", "internal-link " + (cls || ""), text || displayName(path));
  a.setAttribute("data-href", path);
  a.setAttribute("href", path);
  a.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    app.workspace.openLinkText(path, dv.currentFilePath || "", e.ctrlKey || e.metaKey);
  });
  return a;
}

function tagsOfPage(page) {
  if (!page) return [];
  const fm = page.file.frontmatter || {};
  let tags = fm.tags ?? fm.tag;
  if (typeof tags === "string") tags = tags.split(/[,\s]+/);
  tags = (tags || []).map(strip).filter(Boolean);
  if (!tags.length) tags = (page.file.etags || []).map(strip);
  return [...new Set(tags)];
}
const tagMatch = (list, tag) => {
  const t = strip(tag).toLowerCase();
  return (list || []).some((x) => {
    const s = strip(x).toLowerCase();
    return s === t || s.startsWith(t + "/");
  });
};
const tagMatchAny = (list, tags) => tags.some((t) => tagMatch(list, t));

// 只认一级子文件夹里的 README（如 10 项目/xxx/xxx.README.md），忽略更深层的 README
const isIndexPage = (p, rootFolder) =>
  CFG.indexPattern.test(p.file.name) && inFolder(p.file.path, rootFolder) &&
  p.file.folder !== rootFolder && !p.file.folder.slice(rootFolder.length + 1).includes("/");
const indexPages = (rootFolder) =>
  dv.pages(`"${rootFolder}"`)
    .where((p) => isIndexPage(p, rootFolder))
    .sort((p) => p.file.path, "asc")
    .array();

const isClosed = (t) => t.completed || t.status === "-" || t.status === "x" || t.status === "X";
const isCancelled = (t) => t.status === "-";
const allTasks = () =>
  dv.pages().where((p) => !isSystem(p.file.path)).file.tasks
    .where((t) => sectionName(t) !== CFG.headings.habit && String(t.text || "").replace(/^\d{1,2}:\d{2}\s*/, "").trim() !== "")
    .array();

function dedupeNested(items) {
  const keys = new Set(items.map((i) => i.path + "#" + i.line));
  return items.filter((i) => i.parent === undefined || i.parent === null || !keys.has(i.path + "#" + i.parent));
}

async function renderTasks(container, tasks, group = true) {
  if (dv.api && typeof dv.api.taskList === "function") {
    await dv.api.taskList(tasks, group, container, dv.component, dv.currentFilePath);
  } else {
    // 旧版 Dataview 兜底
    dv.taskList(tasks, group);
  }
}

function empty(parent, text) {
  add(parent, "div", "pos-empty", text || "暂无数据");
}

function exhibit(kicker, title, sub) {
  const box = add(root, "section", "pos-exhibit");
  const head = add(box, "header", "pos-exhibit-head");
  if (kicker) add(head, "div", "pos-kicker", kicker);
  if (title) add(head, "div", "pos-exhibit-title", title);
  if (sub) add(head, "div", "pos-exhibit-sub", sub);
  const body = add(box, "div", "pos-exhibit-body");
  return { box, body, source: (text) => add(box, "footer", "pos-source", text) };
}

// ============ 周期识别：根据当前文件名得到时间范围 ============
function periodOf(name) {
  let m;
  if ((m = name.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
    const s = DateTime.fromISO(name).startOf("day");
    return { type: "day", label: "今日", start: s, end: s.endOf("day") };
  }
  if ((m = name.match(/^(\d{4})-W(\d{1,2})$/i))) {
    const s = DateTime.fromObject({ weekYear: +m[1], weekNumber: +m[2], weekday: 1 }).startOf("day");
    return { type: "week", label: "本周", start: s, end: s.plus({ days: 6 }).endOf("day") };
  }
  if ((m = name.match(/^(\d{4})-(\d{2})$/))) {
    const s = DateTime.fromObject({ year: +m[1], month: +m[2], day: 1 });
    return { type: "month", label: "本月", start: s, end: s.endOf("month") };
  }
  if ((m = name.match(/^(\d{4})-Q([1-4])$/i))) {
    const s = DateTime.fromObject({ year: +m[1], month: (+m[2] - 1) * 3 + 1, day: 1 });
    return { type: "quarter", label: "本季", start: s, end: s.plus({ months: 2 }).endOf("month") };
  }
  if ((m = name.match(/^(\d{4})$/))) {
    const s = DateTime.fromObject({ year: +m[1], month: 1, day: 1 });
    return { type: "year", label: "本年", start: s, end: s.endOf("year") };
  }
  return null;
}
const current = dv.current();
const currentName = current ? current.file.name : "";
const inRange = (d, p) => d && d.toMillis() >= p.start.toMillis() && d.toMillis() <= p.end.toMillis();

function dailyNotes(filter) {
  return dv.pages(`"${CFG.cadence}"`)
    .where((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.file.name))
    .where((p) => !filter || filter(DateTime.fromISO(p.file.name)))
    .sort((p) => p.file.name, "asc")
    .array();
}
function needPeriod() {
  const p = periodOf(currentName);
  if (!p) empty(root, "该视图需放在周期笔记中（文件名如 2026-09-28 / 2026-W40 / 2026-09 / 2026-Q3 / 2026）");
  return p;
}

// ============ 项目耗时解析（写法：4hr20 / 2hr / 45min / 1.5h / 2小时30分） ============
function parseMinutes(text) {
  const s = String(text || "").replace(/\[\[[^\]]*\]\]/g, " ").replace(/\[[^\]]*\]\([^)]*\)/g, " ");
  let m = s.match(/(\d+(?:\.\d+)?)\s*(?:hr|hrs|h|小时)\s*(\d+)?\s*(?:min|mins|m|分钟|分)?/i);
  if (m) return Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
  m = s.match(/(\d+)\s*(?:min|mins|m|分钟|分)(?![a-z])/i);
  if (m) return parseInt(m[1], 10);
  return 0;
}
const fmtMin = (min) => {
  if (!min) return "—";
  const hh = Math.floor(min / 60), mm = min % 60;
  return hh ? `${hh}h${mm ? " " + pad2(mm) + "m" : ""}` : `${mm}m`;
};

function effortFrom(notes) {
  const map = new Map();
  for (const note of notes) {
    const items = note.file.lists.where((l) => sectionName(l) === CFG.headings.projectList).array();
    for (const it of items) {
      const out = (it.outlinks || [])[0];
      if (!out) continue;
      const target = dv.page(out.path);
      const key = target ? target.file.path : out.path;
      const rec = map.get(key) || { path: key, minutes: 0, days: new Set() };
      rec.minutes += parseMinutes(it.text);
      rec.days.add(note.file.name);
      map.set(key, rec);
    }
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes || b.days.size - a.days.size);
}

function renderEffort(parent, rows, opts = {}) {
  if (!rows.length) return empty(parent, "暂无项目记录：在日记『" + CFG.headings.projectList + "』中列出项目并写上耗时，如 2hr30");
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const max = Math.max(...rows.map((r) => r.minutes), 1);
  const chart = add(parent, "div", "pos-bars");
  rows.forEach((r, i) => {
    const row = add(chart, "div", "pos-bar-row");
    const label = add(row, "div", "pos-bar-label");
    add(label, "span", "pos-rank", pad2(i + 1));
    label.appendChild(link(r.path, displayName(r.path)));
    const track = add(row, "div", "pos-bar-track");
    const fill = add(track, "div", "pos-bar-fill" + (i === 0 ? " is-lead" : ""));
    fill.style.width = total ? (r.minutes / max) * 100 + "%" : "0%";
    const val = add(row, "div", "pos-bar-value");
    if (total && r.minutes) {
      add(val, "b", "", Math.round((r.minutes / total) * 100) + "%");
      add(val, "span", "", " " + fmtMin(r.minutes));
    } else if (total) {
      add(val, "span", "", "未计时 · " + r.days.size + " 天");
    } else {
      add(val, "span", "", r.days.size + " 天");
    }
  });
  const foot = add(parent, "div", "pos-bar-total");
  foot.textContent = total
    ? `合计 ${fmtMin(total)} · ${rows.length} 个项目` + (opts.days ? ` · 覆盖 ${opts.days} 篇日记` : "")
    : `${rows.length} 个项目（未记录耗时）`;
}

// ============ 项目元数据（截止日期、进度、状态） ============
function projectMeta(page) {
  const tags = tagsOfPage(page);
  const folder = page.file.folder;
  const fm = page.file.frontmatter || {};
  const own = page.file.tasks.array();
  const deadlineTask = own.find((t) => /截止|deadline/i.test(t.text)) || own.find((t) => t.due);
  const due = toDT(fm.due || fm.deadline) || (deadlineTask && toDT(deadlineTask.due));
  const related = allTasks().filter(
    (t) => t !== deadlineTask && !(deadlineTask && t.path === deadlineTask.path && t.line === deadlineTask.line) &&
      !isCancelled(t) && (tagMatchAny(t.tags, tags) || inFolder(t.path, folder))
  );
  const done = related.filter(isClosed).length;
  let status = fm.status ? String(fm.status) : "";
  if (!status) {
    if (deadlineTask && deadlineTask.completed) status = "已完成";
    else if (!due) status = "进行中";
    else {
      const left = Math.floor(due.diff(TODAY, "days").days);
      status = left < 0 ? "已逾期" : left <= CFG.dueSoonDays ? "临近截止" : "进行中";
    }
  }
  const left = due ? Math.floor(due.startOf("day").diff(TODAY, "days").days) : null;
  return { tags, due, left, total: related.length, done, status, area: tags[0] ? tags[0].split("/")[0] : "—" };
}
const statusClass = (s) =>
  /完成|done/i.test(s) ? "is-done" : /逾期|风险|risk|late/i.test(s) ? "is-late" : /临近|soon/i.test(s) ? "is-soon" : "is-on";

function progress(parent, done, total) {
  const wrap = add(parent, "div", "pos-progress");
  const track = add(wrap, "div", "pos-progress-track");
  const fill = add(track, "div", "pos-progress-fill");
  const pct = total ? Math.round((done / total) * 100) : 0;
  fill.style.width = pct + "%";
  add(wrap, "span", "pos-progress-text", total ? `${pct}% · ${done}/${total}` : "—");
}

// ============ 视图：按文件夹列出 PARA ============
function viewProjectPortfolio() {
  const pages = indexPages(CFG.projects);
  const ex = exhibit("项目组合 · Project Portfolio", `${pages.length} 个在管项目`, "按截止日期排序；进度 = 关联任务完成率");
  if (!pages.length) return empty(ex.body, "『" + CFG.projects + "』下还没有项目，点击上方『新建 PARA』创建");
  const rows = pages.map((p) => ({ p, m: projectMeta(p) }))
    .sort((a, b) => (a.m.due ? a.m.due.toMillis() : 9e15) - (b.m.due ? b.m.due.toMillis() : 9e15));
  const table = add(ex.body, "table", "pos-table");
  const tr = add(add(table, "thead"), "tr");
  ["#", "项目", "所属领域", "截止日期", "进度", "状态"].forEach((t) => add(tr, "th", "", t));
  const tb = add(table, "tbody");
  rows.forEach(({ p, m }, i) => {
    const r = add(tb, "tr");
    add(r, "td", "pos-num", pad2(i + 1));
    const name = add(r, "td", "pos-name");
    name.appendChild(link(p.file.path, displayName(p.file.path)));
    add(r, "td", "pos-muted", m.area);
    const d = add(r, "td", "pos-date");
    add(d, "div", "", fmtDate(m.due));
    if (m.left !== null && !/完成/.test(m.status))
      add(d, "div", "pos-sub", m.left < 0 ? `逾期 ${-m.left} 天` : m.left === 0 ? "今天" : `剩 ${m.left} 天`);
    progress(add(r, "td", ""), m.done, m.total);
    const s = add(r, "td", "");
    add(s, "span", "pos-status " + statusClass(m.status), m.status);
  });
  ex.source("来源：" + CFG.projects + " / *.README");
}

function viewIndexList(rootFolder, kicker, noun, withArea) {
  const pages = indexPages(rootFolder);
  const ex = exhibit(kicker, `${pages.length} 个${noun}`);
  if (!pages.length) return empty(ex.body, "『" + rootFolder + "』下暂无" + noun);
  const list = add(ex.body, "ol", "pos-index");
  const projects = withArea ? indexPages(CFG.projects).map((p) => ({ p, tags: tagsOfPage(p) })) : [];
  const tasks = withArea ? allTasks() : [];
  pages.forEach((p, i) => {
    const li = add(list, "li", "pos-index-item");
    add(li, "span", "pos-rank", pad2(i + 1));
    const main = add(li, "div", "pos-index-main");
    main.appendChild(link(p.file.path, displayName(p.file.path), "pos-index-title"));
    const tags = tagsOfPage(p);
    const meta = add(main, "div", "pos-index-meta");
    tags.slice(0, 3).forEach((t) => add(meta, "span", "pos-chip", "#" + t));
    if (withArea) {
      const nProj = projects.filter((x) => tagMatchAny(x.tags, tags)).length;
      const nOpen = tasks.filter((t) => !isClosed(t) && (tagMatchAny(t.tags, tags) || inFolder(t.path, p.file.folder))).length;
      const stat = add(li, "div", "pos-index-stat");
      add(stat, "b", "", nProj);
      add(stat, "span", "", "项目");
      add(stat, "b", "", nOpen);
      add(stat, "span", "", "待办");
    } else {
      add(li, "div", "pos-index-date", p.file.mtime ? p.file.mtime.toFormat("yyyy-MM-dd") : "");
    }
  });
}

// ============ 视图：按标签聚合（项目/领域/资源/存档 README 使用） ============
function scope() {
  const tags = tagsOfPage(current);
  const isReadme = current && CFG.indexPattern.test(current.file.name);
  const inPara = isReadme && [CFG.projects, CFG.areas, CFG.resources, CFG.archives]
    .some((r) => inFolder(current.file.path, r) && current.file.folder !== r);
  const inFlat = isReadme && [CFG.inbox, CFG.output].some((r) => inFolder(current.file.path, r));
  const folder = inPara || inFlat ? current.file.folder : null;
  return { tags, folder };
}

async function viewTaskListByTag() {
  const { tags, folder } = scope();
  if (!tags.length && !folder) return empty(root, "请在本文件 Properties 中设置 tags");
  const tasks = dedupeNested(allTasks().filter((t) => tagMatchAny(t.tags, tags) || inFolder(t.path, folder)));
  const open = tasks.filter((t) => !isClosed(t));
  const done = tasks.filter((t) => isClosed(t) && !isCancelled(t));
  const cancelled = tasks.filter(isCancelled);
  const bar = add(root, "div", "pos-summary");
  add(bar, "span", "pos-summary-item", "").append(h("b", "", open.length), h("span", "", "待办"));
  add(bar, "span", "pos-summary-item", "").append(h("b", "", done.length), h("span", "", "已完成"));
  if (cancelled.length) add(bar, "span", "pos-summary-item", "").append(h("b", "", cancelled.length), h("span", "", "已取消"));
  progress(bar, done.length, open.length + done.length);
  if (open.length) await renderTasks(add(root, "div", "pos-tasks"), open, true);
  else empty(root, "没有未完成的任务");
  if (done.length) {
    const det = add(root, "details", "pos-details");
    add(det, "summary", "", `已完成（${done.length}）`);
    await renderTasks(det, done, true);
  }
}

async function viewBulletListByTag() {
  const { tags } = scope();
  if (!tags.length) return empty(root, "请在本文件 Properties 中设置 tags");
  const items = dedupeNested(
    dv.pages().where((p) => !isSystem(p.file.path) && p.file.path !== (current && current.file.path))
      .file.lists.where((l) => !l.task && tagMatchAny(l.tags, tags)).array()
  ).sort((a, b) => b.path.localeCompare(a.path));
  if (!items.length) return empty(root, "暂无带有该标签的记录");
  await renderTasks(add(root, "div", "pos-bullets"), items, true);
}

function viewFileListByTag() {
  const { tags, folder } = scope();
  const self = current ? current.file.path : "";
  const pages = dv.pages()
    .where((p) => p.file.path !== self && !isSystem(p.file.path) && !inFolder(p.file.path, CFG.cadence))
    .where((p) => tagMatchAny(p.file.tags || [], tags) || inFolder(p.file.path, folder))
    .sort((p) => p.file.mtime, "desc").array();
  if (!pages.length) return empty(root, "暂无关联文件");
  const table = add(root, "table", "pos-table is-compact");
  const tr = add(add(table, "thead"), "tr");
  ["文件", "位置", "更新"].forEach((t) => add(tr, "th", "", t));
  const tb = add(table, "tbody");
  pages.forEach((p) => {
    const r = add(tb, "tr");
    add(r, "td", "pos-name").appendChild(link(p.file.path, p.file.name));
    add(r, "td", "pos-muted", p.file.folder);
    add(r, "td", "pos-date", p.file.mtime ? p.file.mtime.toFormat("yyyy-MM-dd") : "");
  });
}

function viewArchiveListByTag() {
  const { tags } = scope();
  const pages = indexPages(CFG.archives).filter((p) => tagMatchAny(tagsOfPage(p), tags));
  if (!pages.length) return empty(root, "暂无相关存档");
  const list = add(root, "ol", "pos-index is-compact");
  pages.forEach((p, i) => {
    const li = add(list, "li", "pos-index-item");
    add(li, "span", "pos-rank", pad2(i + 1));
    const main = add(li, "div", "pos-index-main");
    main.appendChild(link(p.file.path, displayName(p.file.path), "pos-index-title"));
    const meta = add(main, "div", "pos-index-meta");
    tagsOfPage(p).forEach((t) => add(meta, "span", "pos-chip", "#" + t));
  });
}

// ============ 视图：按时间聚合（周期笔记使用） ============
function viewProjectListByTime() {
  let notes, p;
  if (arg.days) {
    notes = dailyNotes().slice(-arg.days);
  } else {
    p = needPeriod();
    if (!p) return;
    notes = p.type === "day" ? [current] : dailyNotes((d) => inRange(d, p));
  }
  const rows = effortFrom(notes);
  const title = p ? `${p.label}精力分配` : `最近 ${notes.length} 篇日记的精力分配`;
  const range = notes.length ? `${notes[0].file.name} → ${notes[notes.length - 1].file.name}` : "";
  const ex = exhibit("精力分配 · Time Allocation", title, range);
  renderEffort(ex.body, rows, { days: notes.length });
  ex.source("来源：日记『" + CFG.headings.projectList + "』中的项目耗时");
}

function viewAreaListByTime() {
  const p = needPeriod();
  if (!p) return;
  const quarters = dv.pages(`"${CFG.cadence}"`)
    .where((q) => /^\d{4}-Q[1-4]$/i.test(q.file.name))
    .where((q) => { const pq = periodOf(q.file.name); return pq && pq.start >= p.start && pq.end <= p.end; })
    .sort((q) => q.file.name, "asc").array();
  const map = new Map();
  for (const q of quarters) {
    const items = q.file.lists.where((l) => sectionName(l) === CFG.headings.areaList).array();
    for (const it of items) for (const o of it.outlinks || []) {
      const t = dv.page(o.path);
      const key = t ? t.file.path : o.path;
      const rec = map.get(key) || { path: key, qs: [] };
      const qn = q.file.name.slice(-2).toUpperCase();
      if (!rec.qs.includes(qn)) rec.qs.push(qn);
      map.set(key, rec);
    }
  }
  const ex = exhibit("领域覆盖 · Area Coverage", `${p.label}经历的领域`, "从季记『" + CFG.headings.areaList + "』提取");
  const rows = [...map.values()].sort((a, b) => b.qs.length - a.qs.length);
  if (!rows.length) return empty(ex.body, "暂无季记领域快照");
  const table = add(ex.body, "table", "pos-table is-compact");
  const tr = add(add(table, "thead"), "tr");
  ["领域", "Q1", "Q2", "Q3", "Q4"].forEach((t) => add(tr, "th", t === "领域" ? "" : "pos-c", t));
  const tb = add(table, "tbody");
  rows.forEach((r) => {
    const row = add(tb, "tr");
    add(row, "td", "pos-name").appendChild(link(r.path, displayName(r.path)));
    ["Q1", "Q2", "Q3", "Q4"].forEach((q) => add(add(row, "td", "pos-c"), "span", "pos-dot " + (r.qs.includes(q) ? "is-on" : "is-off")));
  });
}

async function viewTaskRecordListByTime() {
  const p = needPeriod();
  if (!p) return;
  const notes = p.type === "day" ? [current] : dailyNotes((d) => inRange(d, p));
  const skip = [CFG.headings.habit, CFG.headings.projectList];
  const tasks = dedupeNested(notes.flatMap((n) => n.file.tasks.where((t) => !skip.includes(sectionName(t))).array()));
  if (!tasks.length) return empty(root, p.label + "日记中没有收集到任务");
  await renderTasks(add(root, "div", "pos-tasks"), tasks, true);
}

async function viewBulletRecordListByTime() {
  const p = needPeriod();
  if (!p) return;
  const notes = p.type === "day" ? [current] : dailyNotes((d) => inRange(d, p));
  const items = notes.flatMap((n) =>
    n.file.lists.where((l) => !l.task && (l.parent === undefined || l.parent === null) && sectionName(l) === CFG.headings.dailyRecord).array());
  if (!items.length) return empty(root, p.label + "日记中没有闪念记录");
  await renderTasks(add(root, "div", "pos-bullets"), items, true);
}

async function viewTaskDoneListByTime() {
  const p = needPeriod();
  if (!p) return;
  const doneDate = (t) => {
    if (t.completion) return toDT(t.completion);
    const m = String(t.text).match(/✅\s*(\d{4}-\d{2}-\d{2})/);
    return m ? DateTime.fromISO(m[1]) : null;
  };
  const tasks = allTasks().filter((t) => t.completed && inRange(doneDate(t), p))
    .sort((a, b) => doneDate(a).toMillis() - doneDate(b).toMillis());
  const bar = add(root, "div", "pos-summary");
  add(bar, "span", "pos-summary-item").append(h("b", "", tasks.length), h("span", "", p.label + "完成"));
  if (!tasks.length) return empty(root, p.label + "暂无完成的任务");
  await renderTasks(add(root, "div", "pos-tasks"), dedupeNested(tasks), true);
}

// ============ 周期笔记引擎：打开或创建任意日期的日/周/月/季/年笔记 ============
// 读取 Periodic Notes 的设置（文件夹、格式、模板）；未安装时使用下面的默认值。
const PERIODS = {
  day: { key: "daily", fmt: "YYYY/[Daily]/MM/YYYY-MM-DD", tpl: "Daily", zh: "日记" },
  week: { key: "weekly", fmt: "GGGG/[Weekly]/GGGG-[W]WW", tpl: "Weekly", zh: "周记" },
  month: { key: "monthly", fmt: "YYYY/[Monthly]/YYYY-MM", tpl: "Monthly", zh: "月记" },
  quarter: { key: "quarterly", fmt: "YYYY/[Quarterly]/YYYY-[Q]Q", tpl: "Quarterly", zh: "季记" },
  year: { key: "yearly", fmt: "YYYY/YYYY", tpl: "Yearly", zh: "年记" },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoOf = (d) => (d && d.toISODate ? d.toISODate() : String(d));

function periodicSettings(kind) {
  const P = PERIODS[kind];
  const s = app.plugins?.plugins?.["periodic-notes"]?.settings?.[P.key];
  const on = s && s.enabled;
  return {
    folder: (on && s.folder) || CFG.cadence,
    format: (on && s.format) || P.fmt,
    template: (on && s.template) || `${CFG.system}/模板/${P.tpl}`,
  };
}
function periodicPath(kind, date) {
  const { folder, format } = periodicSettings(kind);
  const name = window.moment(isoOf(date), "YYYY-MM-DD").format(format);
  return (folder ? folder.replace(/\/+$/, "") + "/" : "") + name + ".md";
}
function findPeriodic(kind, date) {
  const path = periodicPath(kind, date);
  const f = app.vault.getAbstractFileByPath(path);
  if (f) return f;
  // 兼容：文件被挪过位置时按文件名查找
  return app.metadataCache.getFirstLinkpathDest(baseName(path), "") || null;
}
async function ensureFolder(path) {
  const dirs = path.split("/").slice(0, -1);
  let cur = "";
  for (const d of dirs) {
    cur = cur ? `${cur}/${d}` : d;
    if (!app.vault.getAbstractFileByPath(cur)) {
      try { await app.vault.createFolder(cur); } catch (e) { /* 已存在 */ }
    }
  }
}
async function openPeriodic(kind, date, opts = {}) {
  let file = findPeriodic(kind, date);
  if (!file) {
    if (opts.create === false) return null;
    const path = periodicPath(kind, date);
    const { template } = periodicSettings(kind);
    const tfile = app.vault.getAbstractFileByPath(template.endsWith(".md") ? template : template + ".md");
    const m = window.moment(isoOf(date), "YYYY-MM-DD");
    let content = tfile ? await app.vault.read(tfile) : "";
    content = content
      .replace(/{{\s*title\s*}}/gi, baseName(path))
      .replace(/{{\s*date\s*}}/gi, m.format("YYYY-MM-DD"))
      .replace(/{{\s*time\s*}}/gi, window.moment().format("HH:mm"));
    await ensureFolder(path);
    file = await app.vault.create(path, content); // Templater「新建文件时触发」会自动解析模板
    notify(`已创建${PERIODS[kind].zh}：${baseName(path)}`);
  }
  if (opts.open !== false) await app.workspace.getLeaf(opts.newTab ? "tab" : false).openFile(file);
  return file;
}

// ============ 快速捕获：写入今日日记『日常记录』 ============
function insertUnderHeading(content, heading, line) {
  const lines = content.split("\n");
  const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{1,6}\\s+${esc}\\s*$`);
  const i = lines.findIndex((l) => re.test(l));
  if (i < 0) return content.replace(/\s*$/, "") + `\n\n## ${heading}\n${line}\n`;
  let end = lines.findIndex((l, k) => k > i && /^#{1,6}\s/.test(l));
  if (end < 0) end = lines.length;
  let ins = end;
  while (ins - 1 > i && lines[ins - 1].trim() === "") ins--;
  if (ins - 1 > i && /^-\s+\d{1,2}:\d{2}\s*$/.test(lines[ins - 1])) lines[ins - 1] = line; // 替换模板里的空时间占位
  else lines.splice(ins, 0, line);
  return lines.join("\n");
}
async function capture(text, asTask) {
  text = String(text || "").trim();
  if (!text) return false;
  const file = await openPeriodic("day", DateTime.now(), { open: false });
  for (let i = 0; i < 25; i++) { // 等 Templater 处理完新建的日记
    const c = await app.vault.read(file);
    if (!c.includes("<%")) break;
    await sleep(200);
  }
  const line = `- ${asTask ? "[ ] " : ""}${window.moment().format("HH:mm")} ${text}`;
  if (app.vault.process) await app.vault.process(file, (c) => insertUnderHeading(c, CFG.headings.dailyRecord, line));
  else await app.vault.modify(file, insertUnderHeading(await app.vault.read(file), CFG.headings.dailyRecord, line));
  notify(asTask ? "已添加到今日待办" : "已记录到今日日记");
  return true;
}

// ============ 工作台组件 ============
const STATE = (window.__mylifeos = window.__mylifeos || { draft: "", cal: null });

// 工作台页面：隐藏行内标题、笔记属性、文末反向链接（“链接当前文件 / 提到当前文件名”），并加宽页面
function hostify(extra) {
  // Dataview 先渲染、后挂到页面上：此时 closest() 可能还找不到宿主，所以轮询直到挂载完成
  const cls = ["pos-host"].concat(extra ? [extra] : []);
  let host = null;
  const apply = () => {
    host = dv.container.closest(".markdown-preview-view, .markdown-source-view");
    if (host) host.classList.add(...cls);
    return !!host;
  };
  if (!apply()) {
    let tries = 0;
    const iv = setInterval(() => { if (apply() || ++tries > 100) clearInterval(iv); }, 50);
    try { dv.component.register(() => clearInterval(iv)); } catch (e) {}
  }
  try { dv.component.register(() => host && host.classList.remove(...cls)); } catch (e) { /* 旧版 Dataview */ }
}

function panel(parent, kicker, title, extraCls) {
  const box = add(parent, "section", "pos-card " + (extraCls || ""));
  const head = add(box, "header", "pos-card-head");
  const t = add(head, "div", "pos-card-titles");
  if (kicker) add(t, "div", "pos-kicker", kicker);
  if (title) add(t, "div", "pos-card-title", title);
  const actions = add(head, "div", "pos-card-actions");
  const body = add(box, "div", "pos-card-body");
  return { box, head, actions, body };
}
function miniBtn(parent, text, onClick, cls) {
  const b = add(parent, "button", "pos-mini " + (cls || ""), text);
  b.onclick = (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); };
  return b;
}
const taskDone = (t) => {
  if (t.completion) return toDT(t.completion);
  const m = String(t.text).match(/✅\s*(\d{4}-\d{2}-\d{2})/);
  return m ? DateTime.fromISO(m[1]) : null;
};
const byDue = (a, b) => (toDT(a.due) ? +toDT(a.due) : 9e15) - (toDT(b.due) ? +toDT(b.due) : 9e15);

// ---------- 周任务：把周记计划、日记收集、到期、完成、遗留合在一起 ----------
function weekRange(d) {
  const s = d.startOf("week");
  return { start: s, end: s.plus({ days: 6 }).endOf("day"), name: s.toFormat("kkkk-'W'WW") };
}
function weekBuckets(range, weeklyPath) {
  const inR = (d) => !!d && +d >= +range.start && +d <= +range.end;
  const dailyPaths = new Set(dailyNotes((d) => inR(d)).map((p) => p.file.path));
  const isCurrent = inR(TODAY);
  const b = { carry: [], todo: [], doing: [], done: [] };
  for (const t of allTasks()) {
    if (isCancelled(t)) continue;
    const planned = !!weeklyPath && t.path === weeklyPath;
    const collected = dailyPaths.has(t.path);
    const due = toDT(t.due), sch = toDT(t.scheduled);
    if (isClosed(t)) {
      const c = taskDone(t);
      if (inR(c) || (!c && (planned || collected))) b.done.push(t);
      continue;
    }
    const active = t.status === "/" || t.status === "!";
    if (planned || collected || inR(due) || inR(sch) || (isCurrent && active)) (active ? b.doing : b.todo).push(t);
    else if (isCurrent && due && due < range.start) b.carry.push(t);
  }
  Object.values(b).forEach((l) => l.sort(byDue));
  b.done.sort((x, y) => (taskDone(y) ? +taskDone(y) : 0) - (taskDone(x) ? +taskDone(x) : 0));
  return b;
}
async function renderWeekBoard(parent, range, weeklyPath) {
  const b = weekBuckets(range, weeklyPath);
  const total = b.todo.length + b.doing.length + b.done.length + b.carry.length;
  const rate = total ? Math.round((b.done.length / total) * 100) : 0;
  const stats = add(parent, "div", "pos-board-stats");
  [[total, "本周任务"], [b.done.length, "已完成"], [rate + "%", "完成率"], [b.doing.length, "进行中"], [b.carry.length, "逾期遗留", b.carry.length ? "is-alert" : ""]]
    .forEach(([v, l, c]) => { const s = add(stats, "div", "pos-board-stat " + (c || "")); add(s, "b", "", v); add(s, "span", "", l); });
  const bar = add(stats, "div", "pos-board-bar");
  const fill = add(bar, "div", "pos-board-fill");
  fill.style.width = rate + "%";
  const cols = add(parent, "div", "pos-board");
  const defs = [
    ["carry", "逾期遗留", "上周及更早未完成", "is-alert"],
    ["todo", "待办", "计划 · 收集 · 本周到期", ""],
    ["doing", "进行中", "[/] 进行中 · [!] 重要", "is-doing"],
    ["done", "已完成", "本周勾掉的", "is-done"],
  ];
  for (const [key, title, hint, cls] of defs) {
    const col = add(cols, "div", "pos-col " + cls);
    const h = add(col, "div", "pos-col-head");
    add(h, "span", "pos-col-title", title);
    add(h, "b", "pos-col-count", b[key].length);
    add(col, "div", "pos-col-hint", hint);
    const body = add(col, "div", "pos-col-body");
    if (b[key].length) await renderTasks(body, b[key], false);
    else add(body, "div", "pos-col-empty", key === "carry" ? "没有遗留，干净利落" : "—");
  }
  return b;
}
async function viewWeekBoard() {
  let range, weeklyPath = null;
  const p = periodOf(currentName);
  if (p && p.type === "week") { range = { start: p.start, end: p.end, name: currentName }; weeklyPath = current.file.path; }
  else { range = weekRange(TODAY); const f = findPeriodic("week", TODAY); weeklyPath = f ? f.path : null; }
  const wrap = add(root, "div", "pos-board-wrap");
  if (!p || p.type !== "week") {
    const head = add(wrap, "div", "pos-board-head");
    add(head, "span", "pos-muted", `${range.name} · ${range.start.toFormat("M/d")} – ${range.end.toFormat("M/d")}`);
    miniBtn(head, weeklyPath ? "打开本周周记 →" : "创建本周周记 →", () => openPeriodic("week", TODAY));
  }
  await renderWeekBoard(wrap, range, weeklyPath);
}


// ---------- 周度执行趋势：最近 N 周的任务完成率，逐周链接周记 ----------
async function viewWeekTrend() {
  const n = arg.weeks || 8;
  const ex = exhibit("执行趋势 · Weekly Execution", `最近 ${n} 周任务完成率`, "任务 = 周记计划 + 日记收集 + 当周到期 + 当周完成");
  const table = add(ex.body, "table", "pos-table is-compact");
  const tr = add(add(table, "thead"), "tr");
  ["周", "日期", "任务", "完成", "完成率"].forEach((t) => add(tr, "th", "", t));
  const tb = add(table, "tbody");
  let rows = 0;
  for (let i = n - 1; i >= 0; i--) {
    const wr = weekRange(TODAY.minus({ weeks: i }));
    const f = findPeriodic("week", wr.start);
    const b = weekBuckets(wr, f ? f.path : null);
    const total = b.todo.length + b.doing.length + b.done.length + b.carry.length;
    if (!total && !f) continue;
    rows++;
    const r = add(tb, "tr", i === 0 ? "is-current" : "");
    const c = add(r, "td", "pos-name");
    if (f) c.appendChild(link(f.path, wr.name)); else c.textContent = wr.name;
    if (i === 0) add(c, "span", "pos-chip", "本周");
    add(r, "td", "pos-muted", `${wr.start.toFormat("M/d")} – ${wr.end.toFormat("M/d")}`);
    add(r, "td", "pos-date", total);
    add(r, "td", "pos-date", b.done.length);
    progress(add(r, "td", ""), b.done.length, total);
  }
  if (!rows) empty(ex.body, "最近还没有周记或任务记录");
  ex.source("来源：" + CFG.cadence + " 周记与日记");
}

// ---------- 顶部 Hero（含指标） ----------
function wbHero(parent) {
  const hero = add(parent, "header", "pos-hero");
  const main = add(hero, "div", "pos-hero-main");
  add(main, "div", "pos-kicker", "mylifeOS · Plan × Focus × Review");
  add(main, "div", "pos-hero-title", arg.title || "人生经营工作台");
  const w = ["日", "一", "二", "三", "四", "五", "六"][TODAY.weekday % 7];
  add(main, "div", "pos-hero-date", `${TODAY.toFormat("yyyy.MM.dd")}　星期${w}　Q${TODAY.quarter}`);
  const wk = findPeriodic("week", TODAY);
  const focus = add(main, "div", "pos-hero-focus");
  focus.dataset.src = wk ? wk.path : "";
  const periods = add(main, "div", "pos-hero-periods");
  [["今日", "day"], ["本周", "week"], ["本月", "month"], ["本季", "quarter"], ["本年", "year"]].forEach(([zh, kind]) => {
    const b = add(periods, "button", "pos-hero-period" + (findPeriodic(kind, TODAY) ? "" : " is-new"), zh);
    b.title = findPeriodic(kind, TODAY) ? "打开" + PERIODS[kind].zh : "新建" + PERIODS[kind].zh;
    b.onclick = () => openPeriodic(kind, TODAY);
  });
  const tile = add(hero, "button", "pos-hero-week");
  add(tile, "span", "pos-hero-week-label", "WEEK");
  add(tile, "span", "pos-hero-week-num", pad2(TODAY.weekNumber));
  const wr0 = weekRange(TODAY);
  add(tile, "span", "pos-hero-week-range", `${wr0.start.toFormat("M/d")} – ${wr0.end.toFormat("M/d")}`);
  tile.title = "打开本周周记";
  tile.onclick = () => openPeriodic("week", TODAY);
  // 指标
  const open = allTasks().filter((t) => !isClosed(t));
  const due = (t) => toDT(t.due), sch = (t) => toDT(t.scheduled);
  const b = weekBuckets(wr0, wk ? wk.path : null);
  const wTotal = b.todo.length + b.doing.length + b.done.length + b.carry.length;
  const tiles = [
    [open.filter((t) => (due(t) && +due(t) === +TODAY) || (sch(t) && sch(t) <= TODAY)).length, "今日待办"],
    [(wTotal ? Math.round((b.done.length / wTotal) * 100) : 0) + "%", "本周完成率"],
    [open.filter((t) => due(t) && due(t) < TODAY).length, "已逾期", "is-alert"],
    [open.filter((t) => due(t) && due(t) > TODAY && due(t) <= wr0.end).length, "本周还将到期"],
    [indexPages(CFG.projects).length, "在管项目"],
    [app.vault.getMarkdownFiles().filter((f) => inFolder(f.path, CFG.inbox) && !/readme/i.test(f.basename)).length, "待整理资料"],
  ];
  const k = add(parent, "div", "pos-kpis2");
  tiles.forEach(([v, l, cls]) => {
    const t = add(k, "div", "pos-kpi2 " + (cls && parseInt(v) ? cls : ""));
    add(t, "b", "", v);
    add(t, "span", "", l);
  });
  return focus;
}
async function fillFocus(el) {
  const path = el.dataset.src;
  if (!path) { el.textContent = "本周还没有周记 —— 点右侧「本周」写下本周目标"; el.classList.add("is-blank"); return; }
  const f = app.vault.getAbstractFileByPath(path);
  const text = f ? await app.vault.cachedRead(f) : "";
  const m = text.match(/一句话结论\*{0,2}[：:]\s*([^\n]*)/);
  const v = m && m[1].trim();
  add(el, "span", "pos-hero-focus-label", "本周目标");
  add(el, "span", "", v || "尚未填写，打开周记写下一句话目标");
  if (!v) el.classList.add("is-blank");
}

// ---------- 今日 ----------
async function wbToday(parent) {
  const p = panel(parent, "今日聚焦 · Today", TODAY.toFormat("M 月 d 日") + "，先做最重要的三件事", "pos-today");
  const file = findPeriodic("day", TODAY);
  miniBtn(p.actions, file ? "打开日记" : "开始今天 →", () => openPeriodic("day", TODAY), file ? "" : "is-primary");
  const grid = add(p.body, "div", "pos-today-grid");
  const left = add(grid, "div", "pos-today-left");
  const rightCol = add(grid, "div", "pos-today-right");
  // Top 3
  const top = [];
  let page = null;
  if (file) {
    const text = await app.vault.cachedRead(file);
    const m = text.match(/>\s*\[!\w+\][^\n]*(?:Top ?3|要事)[^\n]*\n((?:>.*\n?)*)/i);
    if (m) m[1].split("\n").forEach((l) => { const x = l.replace(/^>\s*/, "").match(/^\d+[.)]\s*(.+)$/); if (x && x[1].trim()) top.push(x[1].trim()); });
    page = dv.page(file.path);
  }
  const ol = add(left, "ol", "pos-top3");
  for (let i = 0; i < 3; i++) {
    const li = add(ol, "li", top[i] ? "" : "is-blank");
    add(li, "span", "pos-top3-n", String(i + 1));
    add(li, "span", "", top[i] || (file ? "在日记顶部写下今天的第 " + (i + 1) + " 件要事" : "创建今日日记后填写"));
  }
  // 今日数据
  const stats = add(left, "div", "pos-today-stats");
  let hDone = 0, hAll = 0, records = 0, effort = 0;
  if (page) {
    const habits = page.file.tasks.where((t) => sectionName(t) === CFG.headings.habit).array();
    hAll = habits.length; hDone = habits.filter((t) => t.completed).length;
    records = page.file.lists.where((l) => !l.task && sectionName(l) === CFG.headings.dailyRecord && l.text.replace(/^\d{1,2}:\d{2}\s*/, "").trim()).length;
    effort = effortFrom([page]).reduce((s, r) => s + r.minutes, 0);
  }
  [[hAll ? `${hDone}/${hAll}` : "—", "习惯打卡"], [records, "今日记录"], [fmtMin(effort), "项目耗时"]].forEach(([v, l]) => {
    const s = add(stats, "div", "pos-today-stat"); add(s, "b", "", v); add(s, "span", "", l);
  });
  // 今日任务
  add(rightCol, "div", "pos-sub-title", "今日任务");
  const open = allTasks().filter((t) => !isClosed(t));
  const due = (t) => toDT(t.due), sch = (t) => toDT(t.scheduled);
  const todays = dedupeNested(open.filter((t) =>
    (due(t) && +due(t) === +TODAY) || (sch(t) && sch(t) <= TODAY) || (file && t.path === file.path)
  )).sort(byDue);
  const tl = add(rightCol, "div", "pos-today-tasks");
  if (todays.length) await renderTasks(tl, todays, false);
  else add(tl, "div", "pos-col-empty", "今天没有到期任务。");
  const overdue = open.filter((t) => due(t) && due(t) < TODAY).length;
  if (overdue) add(rightCol, "div", "pos-today-warn", `另有 ${overdue} 项已逾期，见下方「本周任务看板 · 逾期遗留」`);
  // 快速捕获
  const cap = add(p.body, "div", "pos-capture");
  const ta = add(cap, "textarea", "pos-capture-input");
  ta.placeholder = "快速捕获：想法、待办、灵感……可带 #标签。Ctrl/⌘+Enter 记录，加 Shift 记为待办";
  ta.rows = 2;
  ta.value = STATE.draft || "";
  ta.addEventListener("input", () => (STATE.draft = ta.value));
  const row = add(cap, "div", "pos-capture-row");
  add(row, "span", "pos-capture-hint", "写入今日日记 ·『" + CFG.headings.dailyRecord + "』");
  const go = async (asTask) => { if (await capture(ta.value, asTask)) { ta.value = ""; STATE.draft = ""; } };
  miniBtn(row, "＋ 记为待办", () => go(true));
  miniBtn(row, "记录", () => go(false), "is-primary");
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(e.shiftKey); } });
}

// ---------- 本周任务看板卡片 ----------
async function wbWeek(parent) {
  const wr = weekRange(TODAY);
  const wk = findPeriodic("week", TODAY);
  const p = panel(parent, "本周任务看板 · Weekly Board", `${wr.name}　${wr.start.toFormat("M 月 d 日")} – ${wr.end.toFormat("M 月 d 日")}`, "pos-week");
  miniBtn(p.actions, "任务总览", () => app.workspace.openLinkText("任务", "", false));
  miniBtn(p.actions, wk ? "打开周记 →" : "创建周记 →", () => openPeriodic("week", TODAY), "is-primary");
  await renderWeekBoard(p.body, wr, wk ? wk.path : null);
}

// ---------- 项目 ----------
function wbProjects(parent) {
  const pages = indexPages(CFG.projects);
  const p = panel(parent, "在管项目 · Projects", `${pages.length} 个进行中`, "pos-projects");
  miniBtn(p.actions, "＋ 新建", newPara, "is-primary");
  if (!pages.length) return empty(p.body, "还没有项目。点击「新建 PARA」创建第一个。");
  const rows = pages.map((pg) => ({ pg, m: projectMeta(pg) }))
    .sort((a, b) => (a.m.due ? a.m.due.toMillis() : 9e15) - (b.m.due ? b.m.due.toMillis() : 9e15));
  const list = add(p.body, "div", "pos-proj-list");
  rows.forEach(({ pg, m }) => {
    const card = add(list, "div", "pos-proj");
    const top = add(card, "div", "pos-proj-top");
    top.appendChild(link(pg.file.path, displayName(pg.file.path), "pos-proj-name"));
    add(top, "span", "pos-status " + statusClass(m.status), m.status);
    const meta = add(card, "div", "pos-proj-meta");
    add(meta, "span", "", m.area);
    add(meta, "span", "", "截止 " + fmtDate(m.due));
    if (m.left !== null && !/完成/.test(m.status)) add(meta, "span", "", m.left < 0 ? `逾期 ${-m.left} 天` : m.left === 0 ? "今天到期" : `剩 ${m.left} 天`);
    progress(card, m.done, m.total);
  });
}

async function newPara() {
  const tp = app.plugins.plugins["templater-obsidian"];
  const tpl = app.vault.getAbstractFileByPath(CFG.paraWizard);
  if (!tp || !tpl) return notify("需要启用 Templater，且存在模板：" + CFG.paraWizard);
  await tp.templater.create_new_note_from_template(tpl, CFG.inbox, "未命名 PARA", true);
}

// ---------- 月历：点日期 = 日记，点周数 = 周记，点月份 = 月记，Q = 季记，年份 = 年记 ----------
function existingNames() {
  const set = new Set();
  dv.pages(`"${CFG.cadence}"`).forEach((pg) => set.add(pg.file.name));
  return set;
}
function viewCalendar(parent) {
  parent = parent || root;
  const p = panel(parent, "周期导航 · Calendar", "", "pos-cal-panel");
  const names = existingNames();
  const nameOf = (kind, d) => baseName(periodicPath(kind, d));
  if (!STATE.cal) STATE.cal = { y: TODAY.year, m: TODAY.month };
  const draw = () => {
    p.body.innerHTML = "";
    const first = DateTime.fromObject({ year: STATE.cal.y, month: STATE.cal.m, day: 1 });
    const head = add(p.body, "div", "pos-cal-head");
    miniBtn(head, "‹", () => { const d = first.minus({ months: 1 }); STATE.cal = { y: d.year, m: d.month }; draw(); }, "is-ghost");
    const title = add(head, "div", "pos-cal-title");
    const mk = (label, kind, tip) => {
      const b = add(title, "button", "pos-cal-link" + (names.has(nameOf(kind, first)) ? " has-note" : ""), label);
      b.title = tip; b.onclick = () => openPeriodic(kind, first);
    };
    mk(`${first.year} 年 ${first.month} 月`, "month", "打开 / 创建月记");
    mk(`Q${first.quarter}`, "quarter", "打开 / 创建季记");
    mk(`${first.year}`, "year", "打开 / 创建年记");
    miniBtn(head, "›", () => { const d = first.plus({ months: 1 }); STATE.cal = { y: d.year, m: d.month }; draw(); }, "is-ghost");
    const grid = add(p.body, "div", "pos-cal-grid");
    ["周", "一", "二", "三", "四", "五", "六", "日"].forEach((d, i) => add(grid, "div", "pos-cal-dow" + (i === 0 ? " is-wk" : i >= 6 ? " is-we" : ""), d));
    let cur = first.startOf("week");
    const last = first.endOf("month");
    while (cur <= last) {
      const wkDate = cur;
      const isThisWeek = +wkDate === +TODAY.startOf("week");
      const wk = add(grid, "button", "pos-cal-wk" + (names.has(nameOf("week", wkDate)) ? " has-note" : "") + (isThisWeek ? " is-now" : ""), `W${pad2(wkDate.weekNumber)}`);
      wk.title = `打开 / 创建周记 ${nameOf("week", wkDate)}`;
      wk.onclick = () => openPeriodic("week", wkDate);
      for (let i = 0; i < 7; i++) {
        const d = cur.plus({ days: i });
        const cls = ["pos-cal-day"];
        if (d.month !== first.month) cls.push("is-out");
        if (i >= 5) cls.push("is-we");
        if (+d.startOf("day") === +TODAY) cls.push("is-today");
        if (names.has(nameOf("day", d))) cls.push("has-note");
        const b = add(grid, "button", cls.join(" "), d.day);
        b.title = `${d.toISODate()}（${names.has(nameOf("day", d)) ? "打开" : "创建"}日记）`;
        b.onclick = () => openPeriodic("day", d);
      }
      cur = cur.plus({ weeks: 1 });
    }
    const foot = add(p.body, "div", "pos-cal-foot");
    add(foot, "span", "", "● 已有笔记　点日期 = 日记　点 W = 周记");
    if (first.year !== TODAY.year || first.month !== TODAY.month)
      miniBtn(foot, "回到本月", () => { STATE.cal = { y: TODAY.year, m: TODAY.month }; draw(); }, "is-ghost");
  };
  draw();
}

function wbShortcuts(parent) {
  const p = panel(parent, "快捷入口 · Shortcuts", "", "pos-shortcut-card");
  const inboxFiles = app.vault.getMarkdownFiles().filter((f) => inFolder(f.path, CFG.inbox) && !/readme/i.test(f.basename)).length;
  const items = [
    ["＋ 新建 PARA", "项目 · 领域 · 资源 · 存档", newPara],
    ["信息资源", `${inboxFiles} 份待整理`, () => app.workspace.openLinkText(`${CFG.inbox}/README`, "", false)],
    ["小红书文案", "输出 · 图文", () => app.workspace.openLinkText(`${CFG.output}/小红书文案/小红书文案.README`, "", false)],
    ["公众号视频", "输出 · 视频", () => app.workspace.openLinkText(`${CFG.output}/公众号视频/公众号视频.README`, "", false)],
  ];
  const grid = add(p.body, "div", "pos-shortcuts");
  items.forEach(([t, s, fn], i) => {
    const b = add(grid, "button", "pos-shortcut" + (i === 0 ? " is-primary" : ""));
    add(b, "b", "", t);
    add(b, "span", "", s);
    b.onclick = fn;
  });
}

function wbRecent(parent) {
  const p = panel(parent, "最近更新 · Recent", "最近动过的 8 篇笔记", "pos-recent-card");
  const files = app.vault.getMarkdownFiles()
    .filter((f) => !isSystem(f.path) && f.path !== dv.currentFilePath)
    .sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 8);
  const ul = add(p.body, "ul", "pos-recent");
  files.forEach((f) => {
    const li = add(ul, "li", "");
    const label = /^readme$/i.test(f.basename) ? (f.parent ? f.parent.name : f.path.split("/").slice(-2, -1)[0]) || "README"
      : f.basename.replace(/\.readme$/i, "");
    li.appendChild(link(f.path, label));
    add(li, "span", "pos-muted", DateTime.fromMillis(f.stat.mtime).toRelative({ locale: "zh-CN" }) || "");
  });
}

// =====================================================================
// 工作台 · Planner 版式
// =====================================================================
const SVG = {
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  grid: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 12h18M12 3v18"/>',
  list: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8M13 12h8M13 18h8"/>',
  timeline: '<path d="M12 2v20"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="13" r="2"/><path d="M15 6h6M15 13h4M3 18h6"/>',
  timer: '<path d="M10 2h4"/><path d="m12 14 3-3"/><circle cx="12" cy="14" r="8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  note: '<path d="M2 6h4M2 10h4M2 14h4M2 18h4"/><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M16 2v20"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>',
  board: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  sparkle: '<path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/>',
  play: '<polygon points="7 4 20 12 7 20 7 4" fill="currentColor"/>',
  pause: '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  cup: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
};
function ic(parent, name, cls) {
  const s = add(parent, "span", "pl-ic " + (cls || ""));
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${SVG[name] || ""}</svg>`;
  return s;
}
function sec(parent, icon, zh, en) {
  const head = add(parent, "div", "pl-sec-head");
  ic(head, icon);
  add(head, "span", "pl-sec-zh", zh);
  if (en) add(head, "span", "pl-sec-en", en);
  const actions = add(head, "span", "pl-sec-actions");
  return actions;
}
const cleanText = (t) => String(t || "")
  .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2").replace(/\[\[([^\]]+)\]\]/g, "$1")
  .replace(/(^|\s)#[^\s#]+/g, " ").replace(/[📅✅⏳🛫➕]\s*\d{4}-\d{2}-\d{2}/gu, " ")
  .replace(/[⏫🔺🔼🔽⏬]/gu, " ").replace(/\^[\w-]+\s*$/, "").replace(/^\d{1,2}:\d{2}\s*/, "")
  .replace(/\s+/g, " ").trim();

async function plannerContext() {
  const todayFile = findPeriodic("day", TODAY);
  const todayPage = todayFile ? dv.page(todayFile.path) : null;
  const wr = weekRange(TODAY);
  const wkFile = findPeriodic("week", TODAY);
  const wkPage = wkFile ? dv.page(wkFile.path) : null;
  const buckets = weekBuckets(wr, wkFile ? wkFile.path : null);
  const all = allTasks();
  const open = dedupeNested(all.filter((t) => !isClosed(t)));
  const due = (t) => toDT(t.due), sch = (t) => toDT(t.scheduled);
  const todayOpen = open.filter((t) => (due(t) && +due(t) === +TODAY) || (sch(t) && sch(t) <= TODAY) || (todayFile && t.path === todayFile.path)).sort(byDue);
  const todayDone = all.filter((t) => t.completed && taskDone(t) && +taskDone(t).startOf("day") === +TODAY);
  const days = [...Array(7)].map((_, i) => wr.start.plus({ days: i }));
  const weekNotes = days.map((d) => { const f = findPeriodic("day", d); return f ? dv.page(f.path) : null; });
  let habits = { done: 0, all: 0 };
  if (todayPage) {
    const hs = todayPage.file.tasks.where((t) => sectionName(t) === CFG.headings.habit).array();
    habits = { done: hs.filter((t) => t.completed).length, all: hs.length };
  }
  const effortToday = todayPage ? effortFrom([todayPage]).reduce((s, r) => s + r.minutes, 0) : 0;
  let objective = "";
  if (wkFile) {
    const txt = await app.vault.cachedRead(wkFile);
    const m = txt.match(/一句话结论\*{0,2}[：:]\s*([^\n]*)/);
    objective = m ? m[1].trim() : "";
  }
  return { todayFile, todayPage, wr, wkFile, wkPage, buckets, all, open, todayOpen, todayDone, days, weekNotes, habits, effortToday, objective, due };
}

// ---------- 标题 + 日期框 ----------
function plHeader(parent, c) {
  const h = add(parent, "header", "pl-header");
  const top = add(h, "div", "pl-header-top");
  const row = add(top, "div", "pl-title-row");
  add(row, "span", "pl-title-big", "人生经营");
  const stack = add(row, "span", "pl-title-stack");
  add(stack, "span", "", "工作台");
  add(stack, "span", "", "WORKBENCH");
  const date = add(top, "button", "pl-datebox");
  ic(date, "calendar");
  const dt = add(date, "span", "pl-datebox-text");
  add(dt, "b", "", TODAY.setLocale("en").toFormat("dd LLLL yyyy").toUpperCase());
  const w = ["日", "一", "二", "三", "四", "五", "六"][TODAY.weekday % 7];
  add(dt, "span", "", `星期${w} · 第 ${TODAY.weekNumber} 周`);
  date.title = "打开今日日记";
  date.onclick = () => openPeriodic("day", TODAY);
  const sub = add(h, "div", "pl-header-sub");
  add(sub, "div", "pl-tagline", "以终为始，专注要事，持续复盘。— mylifeOS");
  const periods = add(sub, "div", "pl-periods");
  [["今日", "day"], ["本周", "week"], ["本月", "month"], ["本季", "quarter"], ["本年", "year"]].forEach(([zh, kind]) => {
    const exists = !!findPeriodic(kind, TODAY);
    const b = add(periods, "button", "pl-pill" + (exists ? "" : " is-new"), zh + (exists ? "" : " ＋"));
    b.title = (exists ? "打开" : "新建") + PERIODS[kind].zh;
    b.onclick = () => openPeriodic(kind, TODAY);
  });
}

// ---------- 指标条 ----------
function plKpis(parent, c) {
  const b = c.buckets;
  const wTotal = b.todo.length + b.doing.length + b.done.length + b.carry.length;
  const tDone = c.todayDone.length, tAll = tDone + c.todayOpen.length;
  const overdue = c.open.filter((t) => c.due(t) && c.due(t) < TODAY).length;
  const items = [
    ["check", "今日完成", "Tasks done", `${tDone}`, `/${tAll}`, tAll ? tDone / tAll : 0],
    ["target", "本周完成率", "Weekly rate", `${wTotal ? Math.round((b.done.length / wTotal) * 100) : 0}`, "%", wTotal ? b.done.length / wTotal : 0],
    ["clock", "今日专注", "Focus time", fmtMin(c.effortToday), "", Math.min(1, c.effortToday / 360)],
    ["flame", "习惯打卡", "Habits", `${c.habits.done}`, `/${c.habits.all}`, c.habits.all ? c.habits.done / c.habits.all : 0],
    ["alert", "已逾期", "Overdue", `${overdue}`, " 项", c.open.length ? overdue / c.open.length : 0, overdue ? "is-alert" : ""],
  ];
  const strip = add(parent, "section", "pl-kpis");
  items.forEach(([icon, zh, en, v, unit, ratio, cls]) => {
    const k = add(strip, "div", "pl-kpi " + (cls || ""));
    ic(k, icon, "pl-kpi-ic");
    const body = add(k, "div", "pl-kpi-body");
    const lab = add(body, "div", "pl-kpi-label");
    add(lab, "span", "", zh);
    add(lab, "small", "", en);
    const val = add(body, "div", "pl-kpi-val");
    add(val, "b", "", v);
    add(val, "span", "", unit);
    const bar = add(body, "div", "pl-bar");
    add(bar, "i", "").style.width = Math.round(ratio * 100) + "%";
  });
}

// ---------- 任务优先矩阵 ----------
function plMatrix(parent, c) {
  const act = sec(parent, "grid", "任务优先矩阵", "PRIORITY MATRIX");
  miniBtn(act, "全部 →", () => app.workspace.openLinkText("任务", "", false), "is-link");
  const keyTags = [...indexPages(CFG.areas), ...indexPages(CFG.projects)].flatMap((p) => tagsOfPage(p));
  const important = (t) => t.status === "!" || t.status === "/" || /[⏫🔺]/u.test(t.text) || tagMatchAny(t.tags || [], keyTags);
  const urgent = (t) => { const d = c.due(t), s = toDT(t.scheduled); return (d && d <= TODAY.plus({ days: 2 })) || (s && s <= TODAY); };
  const q = [[], [], [], []];
  c.open.forEach((t) => q[important(t) ? (urgent(t) ? 0 : 1) : (urgent(t) ? 2 : 3)].push(t));
  q.forEach((l) => l.sort(byDue));
  const wrap = add(parent, "div", "pl-matrix");
  add(wrap, "span", "pl-mx-axis is-top1", "紧急");
  add(wrap, "span", "pl-mx-axis is-top2", "不紧急");
  add(wrap, "span", "pl-mx-axis is-left1", "重要");
  add(wrap, "span", "pl-mx-axis is-left2", "不重要");
  const defs = [["立即做", "DO FIRST"], ["计划做", "SCHEDULE"], ["委派 / 快速处理", "DELEGATE"], ["减少 / 放下", "ELIMINATE"]];
  defs.forEach(([zh, en], i) => {
    const tile = add(wrap, "div", `pl-mx-tile q${i + 1}`);
    const top = add(tile, "div", "pl-mx-top");
    add(top, "b", "pl-mx-n", i + 1);
    add(top, "span", "pl-mx-count", q[i].length ? `${q[i].length} 项` : "");
    add(tile, "div", "pl-mx-zh", zh);
    add(tile, "div", "pl-mx-en", en);
    const ul = add(tile, "ul", "pl-mx-list");
    q[i].slice(0, 2).forEach((t) => {
      const li = add(ul, "li", "", cleanText(t.text) || "（无标题）");
      li.title = cleanText(t.text);
    });
    if (q[i].length > 2) add(ul, "li", "is-more", `+${q[i].length - 2} 项`);
    if (!q[i].length) add(ul, "li", "is-more", "—");
  });
  add(parent, "div", "pl-hint", "重要 = 标记 [!] [/] 或关联领域 / 项目标签；紧急 = 2 天内到期");
}

// ---------- 今日清单 + 快速添加 ----------
async function plChecklist(parent, c) {
  const act = sec(parent, "list", "今日清单", "TODAY'S CHECKLIST");
  miniBtn(act, c.todayFile ? "打开日记" : "开始今天", () => openPeriodic("day", TODAY), "is-link");
  const box = add(parent, "div", "pl-check");
  const list = [...c.todayOpen, ...c.todayDone.filter((t) => !c.todayOpen.includes(t))];
  if (list.length) await renderTasks(box, list, false);
  else add(box, "div", "pl-empty", "今天还没有任务");
  const addRow = add(parent, "div", "pl-add");
  const input = add(addRow, "input", "pl-add-input");
  input.type = "text";
  input.placeholder = "＋ 添加待办，回车写入今日日记（Shift+回车记为想法）";
  input.value = STATE.draft || "";
  input.addEventListener("input", () => (STATE.draft = input.value));
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    if (await capture(input.value, !e.shiftKey)) { input.value = ""; STATE.draft = ""; }
  });
}


// ---------- 本周目标（取自周记） ----------
function plGoals(parent, c) {
  const act = sec(parent, "flag", "本周目标", "FOCUS GOALS");
  miniBtn(act, c.wkFile ? "打开周记" : "创建周记", () => openPeriodic("week", TODAY), "is-link");
  if (c.objective) add(parent, "div", "pl-objective", c.objective);
  const tasks = c.wkPage ? c.wkPage.file.tasks.array().filter((t) => cleanText(t.text) && !/^规划下一/.test(cleanText(t.text)) && !isCancelled(t)) : [];
  const list = [...tasks.filter((t) => !isClosed(t)), ...tasks.filter(isClosed)].slice(0, 4);
  const box = add(parent, "div", "pl-goals");
  for (let i = 0; i < 4; i++) {
    const t = list[i];
    const g = add(box, "div", "pl-goal" + (t && isClosed(t) ? " is-done" : "") + (t ? "" : " is-blank"));
    add(g, "b", "pl-goal-n", pad2(i + 1));
    add(g, "span", "pl-goal-text", t ? cleanText(t.text) : "在周记『领域计划』写下本周要推进的事");
    if (t && t.status === "/") add(g, "span", "pl-goal-tag", "进行中");
    if (i === 3) ic(g, "leaf", "pl-goal-leaf");
    g.onclick = () => openPeriodic("week", TODAY);
  }
}

// ---------- 习惯追踪（取自本周日记『习惯打卡』） ----------
function plHabits(parent, c) {
  sec(parent, "repeat", "习惯追踪", "HABIT TRACKER");
  const names = [];
  const src = [c.todayPage, ...c.weekNotes].filter(Boolean);
  src.forEach((p) => p.file.tasks.where((t) => sectionName(t) === CFG.headings.habit && (t.parent === undefined || t.parent === null)).array()
    .forEach((t) => { const n = cleanText(t.text); if (n && !names.includes(n)) names.push(n); }));
  if (!names.length) return add(parent, "div", "pl-hint", "日记『习惯打卡』里的习惯会在这里按周统计。");
  const g = add(add(parent, "div", "pl-habits-box"), "div", "pl-habits");
  add(g, "span", "");
  ["一", "二", "三", "四", "五", "六", "日"].forEach((d, i) => add(g, "span", "pl-hb-dow" + (+c.days[i] === +TODAY ? " is-today" : ""), d));
  names.slice(0, 7).forEach((n) => {
    add(g, "span", "pl-hb-name", n).title = n;
    c.days.forEach((d, i) => {
      const p = c.weekNotes[i];
      const t = p && p.file.tasks.array().find((x) => sectionName(x) === CFG.headings.habit && cleanText(x.text) === n);
      const cls = t && t.completed ? "is-on" : d > TODAY ? "is-future" : "is-off";
      const cell = add(g, "span", "pl-hb-cell " + cls);
      if (cls === "is-on") cell.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 12 4 4 8-8"/></svg>';
    });
  });
}

// ---------- 笔记（本周闪念） ----------
function plNotes(parent, c) {
  sec(parent, "note", "本周灵感", "INSPIRATION");
  const items = [];
  c.weekNotes.forEach((p) => p && p.file.lists.where((l) => !l.task && sectionName(l) === CFG.headings.dailyRecord && (l.parent === undefined || l.parent === null)).array()
    .forEach((l) => { const t = cleanText(l.text); if (t) items.push({ t, path: p.file.path, name: p.file.name }); }));
  const box = add(parent, "div", "pl-notes");
  const ul = add(box, "ul", "");
  items.slice(-5).reverse().forEach((x) => {
    const li = add(ul, "li", "");
    li.appendChild(link(x.path, x.t));
  });
  if (!items.length) add(ul, "li", "is-empty", "本周还没有灵感记录");
  const input = add(box, "input", "pl-add-input pl-notes-input");
  input.type = "text";
  input.placeholder = "＋ 记下一条灵感，回车保存到今日日记";
  input.value = STATE.idea || "";
  input.addEventListener("input", () => (STATE.idea = input.value));
  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter" || e.isComposing) return;
    e.preventDefault();
    if (await capture(input.value, false)) {
      const li = h("li", "");
      li.textContent = input.value.trim();
      const empty = ul.querySelector(".is-empty");
      if (empty) empty.remove();
      ul.prepend(li);
      input.value = ""; STATE.idea = "";
    }
  });
  const f = add(box, "div", "pl-notes-foot");
  add(f, "span", "", "Progress, not perfection.");
  ic(f, "leaf");
}

// ---------- 分析图表 ----------
const PAL = ["var(--pl-navy)", "var(--pl-mid)", "var(--pl-light)", "var(--pl-pale)", "var(--pl-muted-c)"];
function donut(parent, segs, center) {
  const total = segs.reduce((s, x) => s + x.v, 0);
  const wrap = add(parent, "div", "pl-donut");
  const R = 32, C = 2 * Math.PI * R;
  let off = 0, arcs = "";
  segs.forEach((s, i) => {
    const len = total ? (s.v / total) * C : 0;
    if (len > 0) arcs += `<circle cx="45" cy="45" r="${R}" fill="none" stroke="${s.color || PAL[i]}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 45 45)"/>`;
    off += len;
  });
  const svg = add(wrap, "div", "pl-donut-svg");
  svg.innerHTML = `<svg viewBox="0 0 90 90"><circle cx="45" cy="45" r="${R}" fill="none" class="pl-ring-bg" stroke-width="16"/>${arcs}</svg>`;
  if (center) add(svg, "span", "pl-donut-center", center);
  const lg = add(wrap, "ul", "pl-legend");
  segs.forEach((s, i) => {
    const li = add(lg, "li", "");
    const dot = add(li, "i", "");
    dot.style.background = s.color || PAL[i];
    add(li, "span", "", s.label);
    add(li, "b", "", `${s.v}${total ? ` (${Math.round((s.v / total) * 100)}%)` : ""}`);
  });
}
function plAnalytics(parent, c) {
  const panel = add(parent, "section", "pl-panel");
  sec(panel, "chart", "效率分析", "PRODUCTIVITY ANALYTICS");
  const g = add(panel, "div", "pl-charts");
  // 1 任务概况
  const c1 = add(g, "div", "pl-chart");
  add(c1, "div", "pl-chart-title", "本周任务概况");
  const b = c.buckets;
  const tot = b.done.length + b.doing.length + b.todo.length + b.carry.length;
  donut(c1, [{ v: b.done.length, label: "已完成" }, { v: b.doing.length, label: "进行中" }, { v: b.todo.length, label: "待办" }, { v: b.carry.length, label: "逾期遗留", color: "var(--pl-alert)" }],
    tot ? Math.round((b.done.length / tot) * 100) + "%" : "—");
  // 2 专注时长（小时）
  const c2 = add(g, "div", "pl-chart");
  add(c2, "div", "pl-chart-title", "每日专注（小时）");
  const hrs = c.weekNotes.map((p) => (p ? effortFrom([p]).reduce((s, r) => s + r.minutes, 0) / 60 : 0));
  const max = Math.max(2, Math.ceil(Math.max(...hrs)));
  const W = 210, H = 110, bw = 18, gap = (W - 24 - bw * 7) / 6;
  let bars = "";
  hrs.forEach((v, i) => {
    const bh = (v / max) * (H - 22), x = 24 + i * (bw + gap), y = H - 16 - bh;
    bars += `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="${+c.days[i] === +TODAY ? "var(--pl-navy)" : "var(--pl-mid)"}"><title>${v.toFixed(1)} h</title></rect>`;
    bars += `<text x="${x + bw / 2}" y="${H - 3}" class="pl-axis" text-anchor="middle">${"一二三四五六日"[i]}</text>`;
  });
  [0, max / 2, max].forEach((t) => {
    const y = H - 16 - (t / max) * (H - 22);
    bars += `<line x1="22" x2="${W}" y1="${y}" y2="${y}" class="pl-gridline"/><text x="16" y="${y + 3}" class="pl-axis" text-anchor="end">${+t.toFixed(1)}</text>`;
  });
  add(c2, "div", "pl-chart-svg").innerHTML = `<svg viewBox="0 0 ${W} ${H}">${bars}</svg>`;
  // 3 完成率趋势（近 8 周）
  const c3 = add(g, "div", "pl-chart");
  add(c3, "div", "pl-chart-title", "完成率趋势（近 8 周）");
  const pts = [];
  for (let i = 7; i >= 0; i--) {
    const wr = weekRange(TODAY.minus({ weeks: i }));
    const f = findPeriodic("week", wr.start);
    const bb = weekBuckets(wr, f ? f.path : null);
    const t = bb.todo.length + bb.doing.length + bb.done.length + bb.carry.length;
    pts.push({ v: t ? Math.round((bb.done.length / t) * 100) : null, w: wr.start.weekNumber });
  }
  const LW = 210, LH = 110;
  const xs = (i) => 24 + i * ((LW - 30) / 7), ys = (v) => LH - 16 - (v / 100) * (LH - 24);
  const valid = pts.map((p, i) => [p, i]).filter(([p]) => p.v !== null);
  let line = "";
  [0, 50, 100].forEach((t) => (line += `<line x1="22" x2="${LW}" y1="${ys(t)}" y2="${ys(t)}" class="pl-gridline"/><text x="16" y="${ys(t) + 3}" class="pl-axis" text-anchor="end">${t}</text>`));
  if (valid.length) {
    const path = valid.map(([p, i]) => `${xs(i)},${ys(p.v)}`).join(" ");
    line += `<polygon points="${xs(valid[0][1])},${ys(0)} ${path} ${xs(valid[valid.length - 1][1])},${ys(0)}" class="pl-area"/>`;
    line += `<polyline points="${path}" fill="none" stroke="var(--pl-navy)" stroke-width="2"/>`;
    valid.forEach(([p, i]) => (line += `<circle cx="${xs(i)}" cy="${ys(p.v)}" r="3" fill="var(--pl-card)" stroke="var(--pl-navy)" stroke-width="2"><title>W${p.w}: ${p.v}%</title></circle>`));
  }
  pts.forEach((p, i) => (line += `<text x="${xs(i)}" y="${LH - 3}" class="pl-axis" text-anchor="middle">W${p.w}</text>`));
  add(c3, "div", "pl-chart-svg").innerHTML = `<svg viewBox="0 0 ${LW} ${LH}">${line}</svg>`;
  // 4 领域分布
  const c4 = add(g, "div", "pl-chart");
  add(c4, "div", "pl-chart-title", "本周任务领域分布");
  const areaNames = indexPages(CFG.areas).map((p) => ({ name: displayName(p.file.path), tags: tagsOfPage(p) }));
  const counts = new Map();
  [...b.done, ...b.doing, ...b.todo, ...b.carry].forEach((t) => {
    const a = areaNames.find((x) => tagMatchAny(t.tags || [], x.tags));
    let k = a ? a.name : (t.tags || []).some((x) => /输出/.test(x)) ? "输出" : "其他";
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const segs = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ v, label: k }));
  if (segs.length) donut(c4, segs, String(segs.reduce((s, x) => s + x.v, 0)));
  else add(c4, "div", "pl-empty", "本周暂无任务");
}

function plReminder(parent) {
  const r = add(parent, "section", "pl-reminder");
  const first = add(r, "div", "pl-rm-cell is-main");
  ic(first, "leaf");
  const t = add(first, "div", "");
  add(t, "b", "", "每日提醒");
  add(t, "span", "", "DAILY REMINDER");
  add(first, "p", "", "小步前进，日积月累，终成大事。");
  [["compass", "保持专注", "一次只做一件最重要的事。"], ["history", "保持一致", "每天五分钟，复盘不间断。"], ["sparkle", "保持积极", "相信长期主义的力量。"]].forEach(([icn, h, p]) => {
    const c = add(r, "div", "pl-rm-cell");
    ic(c, icn);
    const x = add(c, "div", "");
    add(x, "b", "", h);
    add(x, "span", "", p);
  });
}

async function viewWorkbench() {
  hostify();
  root.classList.add("pos-planner");
  const c = await plannerContext();
  plHeader(root, c);
  plKpis(root, c);
  const grid = add(root, "div", "pl-grid");
  const c1 = add(grid, "div", "pl-col"), c2 = add(grid, "div", "pl-col"), c3 = add(grid, "div", "pl-col");
  plMatrix(c1, c);
  plGoals(c2, c);
  plNotes(c2, c);
  await plChecklist(c3, c);
  plHabits(c3, c);
  plAnalytics(root, c);
  // 本周任务看板
  const wb = add(root, "section", "pl-panel is-white");
  const act = sec(wb, "board", "本周任务看板", `WEEKLY BOARD · ${c.wr.name}`);
  miniBtn(act, "任务管理", () => app.workspace.openLinkText("任务", "", false), "is-link");
  miniBtn(act, c.wkFile ? "打开周记 →" : "创建周记 →", () => openPeriodic("week", TODAY), "is-link");
  await renderWeekBoard(wb, c.wr, c.wkFile ? c.wkFile.path : null);
  // 项目 / 领域 / 最近更新
  const row = add(root, "div", "pl-row3");
  wbProjects(row);
  const a = add(row, "div", "");
  await into(a, () => viewIndexList(CFG.areas, "责任领域 · Areas", "领域", true));
  wbRecent(row);
  plReminder(root);
}

// ---------- 左侧导航：快捷入口（固定在左侧栏的「90 系统/快捷入口.md」中渲染） ----------
const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1.5"/><rect width="7" height="5" x="14" y="3" rx="1.5"/><rect width="7" height="9" x="14" y="12" rx="1.5"/><rect width="7" height="5" x="3" y="16" rx="1.5"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/></svg>',
  review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/></svg>',
};
function openHomepage() {
  const id = "homepage:open-homepage";
  if (app.commands?.commands?.[id]) return app.commands.executeCommandById(id);
  app.workspace.openLinkText("工作台", "", false);
}
function viewSidebar() {
  hostify("pos-host-side");
  root.classList.add("pos-sidebar");
  add(root, "div", "pos-side-head", "快捷入口");
  const open = allTasks().filter((t) => !isClosed(t));
  const overdue = open.filter((t) => toDT(t.due) && toDT(t.due) < TODAY).length;
  const items = [
    ["home", "工作台", "Workbench", openHomepage, ""],
    ["tasks", "任务管理", overdue ? `${overdue} 项逾期` : "Tasks", () => app.workspace.openLinkText("任务", "", false), overdue ? "has-alert" : ""],
    ["review", "本周复盘", `W${pad2(TODAY.weekNumber)} · Weekly Review`, () => openPeriodic("week", TODAY), ""],
  ];
  const list = add(root, "nav", "pos-side-list");
  items.forEach(([icon, t, sub, fn, cls]) => {
    const b = add(list, "button", "pos-side-item " + cls);
    const ic = add(b, "span", "pos-side-icon");
    ic.innerHTML = ICONS[icon];
    const txt = add(b, "span", "pos-side-text");
    add(txt, "b", "", t);
    add(txt, "small", "", sub);
    b.onclick = fn;
  });
}

// ============ 仪表盘扩展（旧版主页组件，仍可单独使用） ============
function viewMasthead() {
  const box = add(root, "div", "pos-masthead");
  add(box, "div", "pos-kicker", arg.kicker || "Personal Operating Review");
  add(box, "div", "pos-masthead-title", arg.title || "人生经营工作台");
  const w = ["日", "一", "二", "三", "四", "五", "六"][TODAY.weekday % 7];
  add(box, "div", "pos-masthead-sub",
    `${TODAY.toFormat("yyyy 年 M 月 d 日")} · 星期${w} · 第 ${TODAY.weekNumber} 周 · Q${TODAY.quarter}`);
  if (arg.quote) add(box, "div", "pos-masthead-quote", arg.quote);
}

function viewKPI() {
  const tasks = allTasks();
  const open = tasks.filter((t) => !isClosed(t));
  const due = (t) => toDT(t.due);
  const overdue = open.filter((t) => due(t) && due(t) < TODAY).length;
  const week = open.filter((t) => due(t) && due(t) >= TODAY && due(t) <= TODAY.plus({ days: 7 })).length;
  const weekStart = TODAY.startOf("week");
  const doneWeek = tasks.filter((t) => t.completed && t.completion && toDT(t.completion) >= weekStart).length;
  const tiles = [
    [indexPages(CFG.projects).length, "在管项目", "Projects"],
    [indexPages(CFG.areas).length, "责任领域", "Areas"],
    [open.length, "未完成任务", "Open tasks"],
    [week, "7 日内到期", "Due in 7d"],
    [overdue, "已逾期", "Overdue", overdue ? "is-alert" : ""],
    [doneWeek, "本周完成", "Done this week"],
  ];
  const grid = add(root, "div", "pos-kpis");
  tiles.forEach(([v, l, en, cls]) => {
    const t = add(grid, "div", "pos-kpi " + (cls || ""));
    add(t, "div", "pos-kpi-value", v);
    add(t, "div", "pos-kpi-label", l);
    add(t, "div", "pos-kpi-en", en);
  });
}

function viewNav() {
  const bar = add(root, "div", "pos-nav");
  const periodic = [
    ["今日", "Day", "day"],
    ["本周", "Week", "week"],
    ["本月", "Month", "month"],
    ["本季", "Quarter", "quarter"],
    ["本年", "Year", "year"],
  ];
  const g1 = add(bar, "div", "pos-nav-group");
  periodic.forEach(([zh, en, kind]) => {
    const b = add(g1, "button", "pos-btn");
    add(b, "span", "pos-btn-zh", zh);
    add(b, "span", "pos-btn-en", en);
    b.onclick = () => openPeriodic(kind, TODAY);
  });
  const g2 = add(bar, "div", "pos-nav-group");
  const nb = add(g2, "button", "pos-btn is-primary");
  add(nb, "span", "pos-btn-zh", "＋ 新建 PARA");
  add(nb, "span", "pos-btn-en", "New");
  nb.onclick = newPara;
  const tb = add(g2, "button", "pos-btn");
  add(tb, "span", "pos-btn-zh", "任务看板");
  add(tb, "span", "pos-btn-en", "Tasks");
  tb.onclick = () => app.workspace.openLinkText("任务", dv.currentFilePath || "", false);
}

function viewSection() {
  const box = add(root, "section", "pos-exhibit is-section");
  const head = add(box, "header", "pos-exhibit-head");
  if (arg.kicker) add(head, "div", "pos-kicker", arg.kicker);
  if (arg.title) add(head, "div", "pos-exhibit-title", arg.title);
  if (arg.sub) add(head, "div", "pos-exhibit-sub", arg.sub);
}

// ============ 路由 ============
const routes = {
  ProjectListByFolder: viewProjectPortfolio,
  ProjectPortfolio: viewProjectPortfolio,
  AreaListByFolder: () => viewIndexList(CFG.areas, "责任领域 · Areas of Responsibility", "领域", true),
  ResourceListByFolder: () => viewIndexList(CFG.resources, "知识资源 · Resources", "资源主题", false),
  ArchiveListByFolder: () => viewIndexList(CFG.archives, "存档 · Archive", "存档条目", false),
  TaskListByTag: viewTaskListByTag,
  BulletListByTag: viewBulletListByTag,
  FileListByTag: viewFileListByTag,
  ArchiveListByTag: viewArchiveListByTag,
  ProjectListByTime: viewProjectListByTime,
  RecentEffort: () => { arg.days = arg.days || 7; return viewProjectListByTime(); },
  AreaListByTime: viewAreaListByTime,
  TaskRecordListByTime: viewTaskRecordListByTime,
  BulletRecordListByTime: viewBulletRecordListByTime,
  TaskDoneListByTime: viewTaskDoneListByTime,
  Masthead: viewMasthead,
  KPI: viewKPI,
  Nav: viewNav,
  Section: viewSection,
  Workbench: viewWorkbench,
  Sidebar: viewSidebar,
  Calendar: () => viewCalendar(root),
  WeekBoard: viewWeekBoard,
  WeekTrend: viewWeekTrend,
};

const fn = routes[VIEW];
if (!fn) {
  empty(root, `未知视图：${VIEW}。可用：${Object.keys(routes).join(" / ")}`);
} else {
  try {
    await fn();
  } catch (e) {
    console.error("[mylifeOS]", e);
    add(root, "div", "pos-error", `视图 ${VIEW} 出错：${e.message}`);
  }
}

> [!takeaway] 今日三件要事 · Top 3
> 1. 
> 2. 
> 3. 

## 项目列表
%%项目的今日快照。在项目后记录耗时（如 2hr30、45min），用于『精力分配』统计%%
<%*
// 项目今日快照：列出 10 项目 下的全部项目
const root = "10 项目";
const files = app.vault.getMarkdownFiles()
  .filter(f => f.path.startsWith(root + "/") && /readme$/i.test(f.basename) && f.parent.path !== root)
  .sort((a, b) => a.path.localeCompare(b.path, "zh"));
tR += files.map((f, i) => `${i + 1}. [[${f.basename}|${f.parent.name}]] `).join("\n");
%>

## 日常记录
%%你的记录。用 #标签 关联到项目/领域，它会自动出现在对应 README 中%%
- <% tp.date.now("HH:mm") %> 

## 习惯打卡
%%打卡不会被统计为任务%%
- [ ] 起床一杯水
- [ ] 学习AI 1小时
- [ ] 阅读 30 分钟
- [ ] 运动
- 喝水
	- [ ] +1
	- [ ] +1
	- [ ] +1
	- [ ] +1

## 精力分配
%%今日的项目列表，根据耗时情况，自动统计项目耗时占比%%
```dataviewjs
await dv.view("90 系统/视图/pos", "ProjectListByTime")
```

## 今日完成
%%今日完成的任务列表，从所有的笔记中提取%%
```dataviewjs
await dv.view("90 系统/视图/pos", "TaskDoneListByTime")
```

## 今日结论
> [!sowhat] So what？
> 今天最重要的一个判断 / 学到的一件事：

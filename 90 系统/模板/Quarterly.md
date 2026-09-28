> [!summary] 季度目标 · Quarterly Objectives
> 用金字塔原则写下本季的**一句话结论**，再拆成不超过三条支撑目标。

# 目标

## 要事维度
%%领域的本季快照%%
<%*
// 领域本季快照：列出 20 领域 下的全部领域
const root = "20 领域";
const files = app.vault.getMarkdownFiles()
  .filter(f => f.path.startsWith(root + "/") && /readme$/i.test(f.basename) && f.parent.path !== root)
  .sort((a, b) => a.path.localeCompare(b.path, "zh"));
tR += files.map((f, i) => `${i + 1}. [[${f.basename}|${f.parent.name}]] `).join("\n");
%>

## 领域维度
%% 对照年度目标，本季每个领域的关键结果是什么？ %%
### AI自媒体
- [ ] 
### 知识管理
- [ ] 
### FDE AI落地
- [ ] 
### 生活与自己
- [ ] 规划下一季

# 复盘

> [!takeaway] 核心结论 · Key Takeaways
> 1. 
> 2. 
> 3. 

| 继续 Continue | 开始 Start | 停止 Stop |
| --- | --- | --- |
|  |  |  |

## 项目列表
%%本季经历的项目列表，从本季的日记中提取，并自动统计项目耗时占比%%
```dataviewjs
await dv.view("90 系统/视图/pos", "ProjectListByTime")
```

## 本季收集
%%本季收集的任务列表，从本季的日记中提取%%
```dataviewjs
await dv.view("90 系统/视图/pos", "TaskRecordListByTime")
```

%%本季收集的闪念列表，从本季的日记中提取%%
```dataviewjs
await dv.view("90 系统/视图/pos", "BulletRecordListByTime")
```

## 本季完成
%%本季完成的任务列表，从所有的笔记中提取%%
```dataviewjs
await dv.view("90 系统/视图/pos", "TaskDoneListByTime")
```

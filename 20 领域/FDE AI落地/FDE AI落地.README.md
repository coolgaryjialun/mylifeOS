---
tags:
  - FDE-AI落地
type: 领域
created: 2026-09-21
---
> [!takeaway] 领域标准 · Standard to Maintain
> 作为前线部署工程师，把 AI 方案真正落到客户业务里：需求清晰、原型可演示、价值可量化。

## 归档
%%本领域归档的项目列表%%
```dataviewjs
await dv.view("90 系统/视图/pos", "ArchiveListByTag")
```

## 任务
%%根据本文件 Properties 的 tags 查询任务（含子标签），并包含本文件夹内的任务%%
```dataviewjs
await dv.view("90 系统/视图/pos", "TaskListByTag")
```

## 列表
%%根据 tags 查询子弹列表（日记里带该标签的记录）%%
```dataviewjs
await dv.view("90 系统/视图/pos", "BulletListByTag")
```

## 文件
%%根据 tags 查询文件，并包含本文件夹内的文件%%
```dataviewjs
await dv.view("90 系统/视图/pos", "FileListByTag")
```

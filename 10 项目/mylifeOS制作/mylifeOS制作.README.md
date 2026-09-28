---
tags:
  - 知识管理/mylifeOS制作
type: 项目
created: 2026-09-21
---
> [!takeaway] 项目章程 · Project Charter
> - **要解决的问题**：用一套自己的 Obsidian 系统，把项目、领域、资源和日/周/月复盘串起来。
> - **成功标准**：工作台每天可用；周记与任务看板打通；模板可复用、可分享。
> - **关键干系人**：自己；AI 自媒体的读者。

%%设置项目截止日期，及其结果描述%%
- [ ] 截止日期 📅 2026-10-15
- 结果描述
	- mylifeOS 模板 v1 定稿，并发布一篇小红书 + 一期公众号视频

## 里程碑
- [x] 确定 PARA + 周期笔记结构 ✅ 2026-09-22
- [x] 完成咨询风格主题 ✅ 2026-09-23
- [/] 工作台与周任务看板 📅 2026-09-30
- [ ] 录制使用演示视频 📅 2026-10-10

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

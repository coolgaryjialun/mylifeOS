---
tags:
  - 输出
---
> [!summary] 输出 · Output
> 内化之后的表达：小红书文案、公众号视频。日记里的灵感打上 `#输出/小红书文案` 或 `#输出/公众号视频`，需要发布的记成任务。

## 待发布任务
```dataviewjs
await dv.view("90 系统/视图/pos", "TaskListByTag")
```

## 灵感记录
```dataviewjs
await dv.view("90 系统/视图/pos", "BulletListByTag")
```

## 全部作品
```dataviewjs
await dv.view("90 系统/视图/pos", "FileListByTag")
```

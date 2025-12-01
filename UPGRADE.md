# InkFlow 升级路线图

> 本文档基于对 InkFlow 代码库的深度分析，总结当前系统架构的优势，并提出未来演进方向。

## 📊 当前系统评估

### 核心工作流

InkFlow 已建立完整的 **"结构化-写作-演进"闭环**：

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  静态设定   │ -> │  动态规划   │ -> │  AI 写作    │ -> │  演进反馈   │
│ 项目/世界观 │    │ 分卷/细纲   │    │ RAG + 续写  │    │ 状态更新    │
│   角色创建  │    │  (Beats)    │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                                              ↑                  │
                                              └──────────────────┘
```

### ✅ 已实现的高级特性

| 模块 | 特性 | 说明 |
|------|------|------|
| RAG 系统 | 本地化闭环 | IndexedDB 存储向量，零部署成本，保护隐私 |
| RAG 系统 | 混合检索 | 向量相似度 + 关键词匹配，双重保障 |
| RAG 系统 | 时间衰减 | 近期章节权重更高，模拟人类记忆 |
| RAG 系统 | 关系扩散 | 检索角色时自动关联相关人物 |
| Wiki 系统 | 分类加权 | 根据查询内容自动调整类别权重 |
| Wiki 系统 | 增量索引 | Hash 校验，只更新变化内容 |
| 演进系统 | 双向更新 | 正文 → 角色状态 / Wiki 条目 |
| 跨服务商 | 场景化配置 | 不同任务使用不同 AI 模型 |

---

## 🚀 升级建议（按优先级排序）

### P0 - 核心体验优化

#### 1. 逻辑预检机制 (Logic Pre-flight Check)
**问题**：RAG 只提供信息，AI 可能忽略，导致"吃书"

**方案**：
```typescript
// 在生成正文前增加校验步骤
async function preflightCheck(beats: string[], context: {
  globalMemory: string,
  activePlotLoops: PlotLoop[],
  recentChapters: Chapter[]
}): Promise<ConflictWarning[]>
```

**实现要点**：
- 使用推理模型
比对细纲与已有设定
- 检测冲突时弹出警告，提供修正建议
- 可选：自动修正 Prompt 约束

**价值**：从源头防止逻辑崩坏，百万字长篇必备

---

#### 2. ✅ 风格学习闭环 (Adaptive Style Loop) - 已实现
**问题**：AI 生成文本"AI 味"重，缺乏个人风格

**方案**：
```typescript
interface StyleSample {
  id: string;
  content: string;      // 用户最终稿
  originalAI: string;   // AI 原始生成
  editRatio: number;    // 修改比例
  vector: number[];     // 风格向量
}
```

**已实现功能**：
- ✅ `services/styleService.ts` - 风格学习核心服务
- ✅ 基于 n-gram 的编辑比例计算算法
- ✅ 当用户修改率 > 30% 时，自动存入风格向量库
- ✅ 生成时检索相似风格样本作为 Few-Shot 示例
- ✅ 风格提示词注入到 AI 生成流程
- ✅ UI 显示风格学习统计和保存通知
- ✅ 单元测试覆盖核心功能

**价值**：让 AI 越用越懂你

---

### P1 - 功能增强

#### 3. 逆向大纲修正 (Recursive Re-outlining)
**问题**：正文偏离大纲后，后续章节基于"过期计划"生成

**方案**：
- 章节完成后，evolutionService 检测剧情偏离度
- 偏离较大时提示："检测到剧情偏离，是否重新生成后续大纲？"
- 支持局部重生成（只更新受影响的章节）

**价值**：保持大纲鲜活度，适应创作中的灵感涌现

---

#### 4. ✅ Wiki 别名系统 (Alias System) - 已实现
**问题**：检索依赖精确名称，无法识别别称

**方案**：
```typescript
interface WikiEntry {
  // ... existing fields
  aliases?: string[];  // 别名列表，如 ["张麻子", "三爷"]
}
```

**已实现功能**：
- ✅ `services/wikiService.ts` - Wiki 增强服务
- ✅ `addAlias()` / `removeAlias()` - 别名管理
- ✅ `getAllNames()` - 获取主名称和所有别名
- ✅ `matchesEntry()` - 支持别名匹配的文本检索
- ✅ `buildAliasIndex()` - 构建别名索引用于快速查找
- ✅ `findEntryByNameOrAlias()` - 通过名称或别名查找条目
- ✅ UI 支持别名的添加、删除和显示
- ✅ 搜索功能支持别名匹配

**价值**：提升检索召回率，适应小说中的多称谓场景

---

#### 5. ✅ Wiki 时间切片 (Time Slicing) - 已实现
**问题**：Wiki 描述静态覆盖，回改旧章节时获取错误信息

**场景**：第 100 章更新"倚天剑已断"，回改第 50 章时 AI 误以为剑已断

**方案**：
```typescript
interface WikiHistoryEntry {
  chapterId: string;
  chapterOrder: number;
  content: string;
  timestamp: number;
  changeNote?: string;
}
```

**已实现功能**：
- ✅ `addHistoryEntry()` - 添加历史版本记录
- ✅ `getDescriptionAtChapter()` - 获取指定章节时间点的描述
- ✅ `getHistoryTimeline()` - 获取完整历史时间线
- ✅ `pruneHistory()` - 清理过期历史版本
- ✅ `autoRecordHistory()` - 自动检测并记录描述变更
- ✅ UI 支持查看特定章节时的描述版本
- ✅ UI 显示历史变更时间线

**价值**：支持非线性编辑，防止时间线错乱

---

### P2 - 架构升级

#### 6. ✅ 深度图谱检索 (Graph RAG) - 已实现
**问题**：当前关系检索只有单层，无法捕捉深层人物纠葛

**方案**：
```typescript
// 二度人脉检索
function retrieveWithGraph(characterId: string, depth: number = 2): Character[] {
  // BFS 遍历关系图谱
}
```

**已实现功能**：
- ✅ `services/graphService.ts` - 深度图谱检索核心服务
- ✅ BFS 遍历关系图谱，支持配置检索深度（默认 2 层）
- ✅ 关系类型加权（仇人 1.0 > 恋人 0.9 > 父母 0.85 > 朋友 0.6 > 路人 0.2）
- ✅ 距离衰减（越远的关系权重越低，衰减系数 0.6）
- ✅ `retrieveWithGraph()` - 深度图谱检索
- ✅ `getNDegreeConnections()` - 获取 N 度人脉
- ✅ `findRelationshipPath()` - 查找两个角色之间的关系路径
- ✅ `getRelationshipSummary()` - 生成关系网络摘要
- ✅ 集成到 `retrieveRelevantCharacters()` 函数
- ✅ 23 个单元测试全部通过

**价值**：处理复杂人物纠葛，写出更深层的人际互动

---

#### 7. 性能优化 (WASM Vector Search)
**问题**：百万字级别时，JS 内存遍历向量可能卡顿

**方案**：
- 引入 WASM 版向量计算库（如 usearch-wasm）
- 或使用前端向量库（如 Voy）
- 实现分片索引，按需加载

**触发条件**：向量数 > 10000 时启用优化

---

#### 8. ✅ Wiki 关联图谱 (Wiki Relationships) - 已实现
**问题**：Wiki 条目孤立，无法表达归属关系

**方案**：
```typescript
type WikiRelationType = 'belongs_to' | 'part_of' | 'created_by' | 'located_in' | 'related_to';

interface WikiRelationship {
  targetId: string;
  relation: WikiRelationType;
  description?: string;
}
```

**已实现功能**：
- ✅ `addRelationship()` / `removeRelationship()` - 关联管理
- ✅ `getRelatedEntries()` - 获取出向关联条目
- ✅ `getIncomingRelationships()` - 获取入向关联
- ✅ `buildRelationshipGraph()` - 构建完整关联图谱
- ✅ `getRelationTypeLabel()` / `getInverseRelationLabel()` - 关系类型中文标签
- ✅ `enhancedWikiRetrieval()` - 增强版检索，支持关联扩展
- ✅ `buildWikiContextPrompt()` - 生成包含关联信息的 AI 提示词
- ✅ UI 支持添加、删除和查看关联关系
- ✅ UI 显示出向和入向关联

**场景**：
- "青云剑" belongs_to "林风"
- "青云决" part_of "青云门"

**价值**：检索角色时自动带出其装备/功法

---

### P3 - 体验增强

#### 9. 编辑器 Wiki 高亮 (Inline Wiki Hints)
**方案**：
- 利用 Tiptap 插件机制，自动高亮正文中的 Wiki 词汇
- 鼠标悬停显示 Wiki 悬浮卡片
- 点击跳转到 Wiki 详情

**价值**：所见即所得，减少上下文切换

---

#### 10. 多模态构思 (Visual Brainstorming)
**方案**：
- CharacterForge 增加"AI 绘图"功能，生成角色立绘
- StructureDesigner 支持地图概念图生成
- Wiki 条目支持图片附件

**价值**：视觉化刺激灵感，帮助作者更具体地描写场景

---

## 📈 实施路线

```
Phase 1 (核心)          Phase 2 (增强)          Phase 3 (优化)
─────────────────────────────────────────────────────────────────
[P0] 逻辑预检 ✅        [P1] 逆向大纲修正       [P2] Graph RAG ✅
[P0] 风格学习 ✅        [P1] Wiki 别名 ✅       [P2] WASM 优化
                        [P1] Wiki 时间切片 ✅   [P2] Wiki 关联 ✅
                                                [P3] 编辑器高亮
                                                [P3] 多模态构思
```

---

## 💡 总结

InkFlow 当前已是一个**架构先进、功能完善**的 AI 写作工具，RAG 系统的混合检索和领域优化超越了大多数开源方案。

下一步演进方向：**从"辅助生成"走向"深度协同"**

| 能力 | 当前 | 目标 |
|------|------|------|
| 写 | ✅ RAG 增强生成 | 风格自适应 |
| 学 | ✅ 风格学习闭环 | 学习用户笔癖 |
| 查 | ✅ 混合检索 + 深度图谱 + Wiki 增强 | 逻辑预检 + 图谱检索 |
| 看 | ✅ 视频生成 | 多模态构思辅助 |

让系统不仅能写，还能**学（学习风格）、查（逻辑纠错）、看（多模态构思）**。

---

## 📝 最近更新

### 2024-12 Wiki 系统增强

完成了 Wiki 系统的三大增强功能：

1. **别名系统** - 支持为 Wiki 条目添加多个别名，检索时自动匹配所有称谓
2. **时间切片** - 支持查看 Wiki 条目在不同章节时间点的描述版本，防止非线性编辑时的时间线错乱
3. **关联图谱** - 支持 Wiki 条目之间的关系管理（属于、包含、创造、位于等），检索时自动扩展关联条目

UI 更新：
- 重构 WikiSystem 组件，采用三栏布局（列表 + 详情 + AI 扫描）
- 详情面板支持四个标签页：基本信息、别名管理、关联管理、历史查看
- 列表项显示别名标签和关联/历史指示器
- 搜索功能支持别名匹配

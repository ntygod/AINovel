# Implementation Plan

- [x] 1. 数据模型和类型定义





  - [x] 1.1 在 types.ts 中添加 PlotLoopStatus 枚举和 PlotLoop 接口


    - 添加 PlotLoopStatus 枚举（OPEN, URGENT, CLOSED, ABANDONED）
    - 添加 PlotLoop 接口，包含所有字段
    - 扩展 NovelState 接口添加 plotLoops 字段
    - _Requirements: 1.1, 1.5, 2.4_
  - [ ]* 1.2 编写属性测试：创建伏笔初始化必填字段
    - **Property 1: Plot loop creation initializes required fields**
    - **Validates: Requirements 1.1**

- [x] 2. 伏笔服务层实现





  - [x] 2.1 创建 services/plotLoopService.ts 基础 CRUD 操作


    - 实现 createPlotLoop、updatePlotLoop、deletePlotLoop 函数
    - 实现 getPlotLoopById、getAllPlotLoops 查询函数
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ]* 2.2 编写属性测试：部分更新保留未修改字段
    - **Property 2: Partial update preserves unchanged fields**
    - **Validates: Requirements 1.2, 1.4**
  - [ ]* 2.3 编写属性测试：删除后查询返回空
    - **Property 3: Deletion removes plot loop from storage**
    - **Validates: Requirements 1.3**

  - [x] 2.4 实现状态变更函数
    - 实现 markAsClosed(id, closeChapterId) 函数
    - 实现 markAsAbandoned(id, reason) 函数
    - _Requirements: 1.5, 2.4_
  - [ ]* 2.5 编写属性测试：关闭伏笔设置正确状态
    - **Property 4: Closing a plot loop sets CLOSED status and closeChapterId**
    - **Validates: Requirements 1.5**
  - [ ]* 2.6 编写属性测试：废弃伏笔设置正确状态和原因
    - **Property 8: Abandoning sets ABANDONED status with reason**
    - **Validates: Requirements 2.4**

- [-] 3. 自动状态管理实现




  - [x] 3.1 实现 URGENT 状态自动检测函数


    - 实现 checkUrgentByChapterProximity(loop, currentChapter, allChapters) 函数
    - 实现 checkUrgentByVolumeEnd(loop, currentChapter, volumes) 函数
    - 实现 checkLongOpenLoops(loop, currentChapter, allChapters) 函数
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ]* 3.2 编写属性测试：5 章内触发 URGENT
    - **Property 5: URGENT status triggers within 5 chapters of target**
    - **Validates: Requirements 2.1**
  - [ ]* 3.3 编写属性测试：分卷结束触发 URGENT
    - **Property 6: URGENT status triggers at volume end**
    - **Validates: Requirements 2.2**
  - [ ]* 3.4 编写属性测试：30 章无目标标记需关注
    - **Property 7: Long-open loops without target are flagged**
    - **Validates: Requirements 2.3**

- [x] 4. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 筛选和分组功能实现






  - [x] 5.1 实现伏笔列表分组和筛选函数

    - 实现 groupByStatus(loops) 函数，按 URGENT → OPEN → CLOSED → ABANDONED 排序
    - 实现 filterByImportance(loops, importance) 函数
    - 实现 filterByChapter(loops, chapterId) 函数
    - 实现 filterByVolume(loops, volumeId) 函数
    - 实现 searchByKeyword(loops, keyword) 函数
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ]* 5.2 编写属性测试：状态分组返回正确顺序
    - **Property 9: Status grouping returns correct order**
    - **Validates: Requirements 3.1**
  - [ ]* 5.3 编写属性测试：筛选返回匹配项
    - **Property 10: Filtering returns only matching items**
    - **Validates: Requirements 3.2, 3.3, 3.4**

- [x] 6. 关联和伏笔链功能实现






  - [x] 6.1 实现关联管理函数

    - 实现 linkCharacters(loopId, characterIds) 函数
    - 实现 linkWikiEntries(loopId, wikiEntryIds) 函数
    - 实现 getLoopsByCharacter(characterId) 反向查询函数
    - 实现 getLoopsByWikiEntry(wikiEntryId) 反向查询函数
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 6.2 编写属性测试：关联持久化正确
    - **Property 13: Linking associations persists IDs correctly**
    - **Validates: Requirements 5.1, 5.2**
  - [ ]* 6.3 编写属性测试：反向查询返回关联伏笔
    - **Property 14: Reverse lookup returns associated loops**
    - **Validates: Requirements 5.3**

  - [x] 6.4 实现伏笔链管理函数

    - 实现 setParentLoop(childId, parentId) 函数
    - 实现 getChildLoops(parentId) 函数
    - 实现 checkUnclosedChildren(parentId) 函数
    - 实现 suggestParentClosure(parentId) 函数
    - _Requirements: 6.1, 6.2, 6.3, 6.4_
  - [ ]* 6.5 编写属性测试：父子关系存储正确
    - **Property 16: Parent-child relationship is stored**
    - **Validates: Requirements 6.1, 6.3**
  - [ ]* 6.6 编写属性测试：关闭父伏笔触发子伏笔通知
    - **Property 17: Closing parent with open children triggers notification**
    - **Validates: Requirements 6.2**
  - [ ]* 6.7 编写属性测试：所有子伏笔关闭建议关闭父伏笔
    - **Property 18: All children closed suggests parent closure**
    - **Validates: Requirements 6.4**

- [x] 7. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. AI 集成实现






  - [x] 8.1 实现 AI 提示词上下文构建函数

    - 实现 buildLoopContextForPrompt(currentChapterId, allLoops) 函数
    - 修改 geminiService.ts 中的 generateChapterBeats 注入伏笔上下文
    - 修改 generateChapterContent 注入相关伏笔上下文
    - _Requirements: 4.1, 4.2, 4.4_
  - [ ]* 8.2 编写属性测试：提示词包含所有 OPEN 和 URGENT 伏笔
    - **Property 11: Prompt context includes all OPEN and URGENT loops**
    - **Validates: Requirements 4.1, 4.4**
  - [ ]* 8.3 编写属性测试：URGENT 伏笔触发优先指令
    - **Property 12: URGENT loops trigger priority instruction in prompt**
    - **Validates: Requirements 4.2**

  - [x] 8.4 实现 AI 建议解析函数

    - 实现 parseAISuggestedLoops(aiResponse) 函数
    - 实现 createFromAISuggestion(suggestion, currentChapterId) 函数
    - _Requirements: 7.2, 7.3_
  - [ ]* 8.5 编写属性测试：AI 建议解析提取数据
    - **Property 19: AI suggestion parser extracts loop data**
    - **Validates: Requirements 7.2**
  - [ ]* 8.6 编写属性测试：接受 AI 建议创建正确元数据
    - **Property 20: Accepting AI suggestion creates loop with correct metadata**
    - **Validates: Requirements 7.3**

- [-] 9. 数据持久化实现


  - [x] 9.1 更新 IndexedDB schema 和持久化逻辑




    - 在 services/db.ts 中升级 DB_VERSION
    - 添加 plotLoops object store 和索引
    - 实现 savePlotLoops 和 loadPlotLoops 函数
    - 更新项目保存/加载逻辑包含 plotLoops
    - _Requirements: 8.1, 8.2_
  - [ ]* 9.2 编写属性测试：持久化 round-trip 保留数据
    - **Property 21: Persistence round-trip preserves data**
    - **Validates: Requirements 8.1, 8.2**
  - [x] 9.3 实现导出/导入功能





    - 更新导出逻辑包含 plotLoops 数组
    - 更新导入逻辑恢复 plotLoops 数据
    - _Requirements: 8.3, 8.4_
  - [ ]* 9.4 编写属性测试：导出/导入 round-trip 保留数据
    - **Property 22: Export/Import round-trip preserves data**
    - **Validates: Requirements 8.3, 8.4**

- [x] 10. Checkpoint - 确保所有测试通过





  - Ensure all tests pass, ask the user if questions arise.

- [-] 11. UI 组件实现



  - [x] 11.1 创建 PlotLoopPanel 组件


    - 创建 components/PlotLoopPanel.tsx
    - 实现伏笔列表展示（按状态分组）
    - 实现筛选器 UI（重要程度、章节、关键词）
    - 实现快速创建伏笔按钮
    - _Requirements: 3.1, 3.2, 3.3, 3.4_


  - [ ] 11.2 创建 PlotLoopDetail 组件
    - 创建 components/PlotLoopDetail.tsx
    - 实现伏笔详情编辑表单
    - 实现目标章节/分卷选择器
    - 实现角色和 Wiki 词条关联选择器
    - 实现父伏笔选择器
    - 实现状态变更按钮（关闭/废弃）

    - _Requirements: 1.2, 1.4, 1.5, 2.4, 5.1, 5.2, 6.1_
  - [x] 11.3 创建 PlotLoopMarker 组件


    - 创建 components/PlotLoopMarker.tsx
    - 实现选中文本后的浮动菜单
    - 实现"设为伏笔"按钮功能
    - _Requirements: 5.4_
  - [ ]* 11.4 编写属性测试：从选中文本创建自动填充字段
    - **Property 15: Creating from selection auto-populates fields**
    - **Validates: Requirements 5.4**

- [x] 12. 集成到主应用





  - [x] 12.1 集成 PlotLoopPanel 到编辑器右侧栏


    - 在 Editor.tsx 右侧栏添加"悬念"标签页
    - 连接 PlotLoopPanel 到 App 状态
    - 实现伏笔拖拽到细纲输入框功能
    - _Requirements: 3.1, 4.3_
  - [x] 12.2 集成 PlotLoopMarker 到 RichEditor


    - 在 RichEditor.tsx 中添加选中文本检测
    - 显示 PlotLoopMarker 浮动菜单
    - _Requirements: 5.4_

  - [x] 12.3 更新 App.tsx 状态管理

    - 添加 plotLoops 到 NovelState
    - 实现 plotLoops 的增删改查回调
    - 连接自动状态检测到章节切换事件
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [ ] 13. Final Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

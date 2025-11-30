# 设计文档

## 概述

本设计实现 InkFlow 阶段 1 升级：**分卷管理**和**深度上下文细纲生成**。这两个功能协同工作，解决长篇小说创作中的结构扁平化和细纲断层问题。

**核心目标**:
- 引入四级结构：书 → 卷 → 章 → 细纲
- 增强细纲生成的上下文连续性
- 保持向后兼容，不破坏现有项目

## 架构

### 系统层次

```
┌─────────────────────────────────────┐
│         UI Layer (React)            │
│  - OutlineBuilder (分卷可视化)      │
│  - Editor (细纲面板)                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Service Layer                  │
│  - geminiService (AI 生成)          │
│  - db (IndexedDB 持久化)            │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Data Layer                     │
│  - NovelState (应用状态)            │
│  - Volume (新增实体)                │
│  - Chapter (扩展字段)               │
└─────────────────────────────────────┘
```

### 数据流

**分卷创建流程**:
```
用户操作 → OutlineBuilder → updateVolumes() 
  → NovelState 更新 → 自动保存 → IndexedDB
```

**细纲生成流程**:
```
用户点击生成 → Editor → generateChapterBeats()
  → 构建增强 prompt (包含上一章结尾 + 钩子 + 祖先)
  → 调用 LLM API → 解析返回 → 更新 Chapter.beats
```

## 组件和接口

### 1. 数据模型扩展

#### Volume 接口 (新增)

```typescript
export interface Volume {
  id: string;                    // UUID
  title: string;                 // 卷标题，如"第一卷：崛起"
  summary: string;               // 卷摘要，100-300字
  coreConflict: string;          // 本卷核心冲突
  order: number;                 // 卷序号，从 1 开始
  chapterIds: string[];          // 包含的章节 ID 列表
  volumeSummary?: string;        // 完成后生成的详细总结（500-1000字）
  expectedWordCount?: number;    // 预期字数
}
```

#### Chapter 接口扩展

```typescript
export interface Chapter {
  // ... 现有字段
  volumeId?: string | null;      // 所属分卷 ID
  hooks?: string[];              // 本章留下的钩子/伏笔
}
```

#### NovelState 接口扩展

```typescript
export interface NovelState {
  // ... 现有字段
  volumes: Volume[];             // 分卷列表
}
```

### 2. 数据库服务扩展

#### DBService 新增方法

```typescript
class DBService {
  // 现有方法保持不变
  
  // 迁移逻辑（在 onupgradeneeded 中）
  private migrateToVersion6(db: IDBDatabase, transaction: IDBTransaction): void {
    // 为现有项目添加 volumes 字段
    // 为现有章节添加 volumeId 和 hooks 字段
  }
}
```

**迁移策略**:
- 数据库版本从 5 升级到 6
- 加载旧项目时，在内存中补充缺失字段
- 不修改 IndexedDB schema，仅在应用层处理兼容性

### 3. AI 生成服务增强

#### generateChapterBeats 函数签名修改

```typescript
export const generateChapterBeats = async (
  chapter: Chapter,
  allChapters: Chapter[],      // 用于查找上一章和祖先
  volumes: Volume[],            // 用于注入分卷上下文
  config: NovelConfig,
  characters: Character[],
  settings: AppSettings
): Promise<string[]>
```

**增强逻辑**:

1. **查找上一章**:
   - 如果 chapter 有 parentId，找同一父节点的前一个兄弟
   - 否则，找 order - 1 的章节

2. **提取上一章结尾**:
   ```typescript
   const previousChapter = findPreviousChapter(chapter, allChapters);
   const lastContent = previousChapter?.content 
     ? stripHtml(previousChapter.content).slice(-500) 
     : "";
   ```

3. **提取钩子**:
   ```typescript
   const hooks = previousChapter?.hooks || [];
   ```

4. **查找祖先**:
   ```typescript
   const ancestors = getChapterAncestors(chapter.id, allChapters);
   const ancestorSummaries = ancestors.map(a => a.summary).join("\n");
   ```

5. **注入分卷上下文**:
   ```typescript
   const volume = volumes.find(v => v.id === chapter.volumeId);
   const volumeContext = volume 
     ? `当前分卷: ${volume.title}\n核心冲突: ${volume.coreConflict}\n进度: ${getVolumeProgress(chapter, volume, allChapters)}`
     : "";
   ```

6. **构建增强 prompt**:
   ```typescript
   const prompt = `
   ${buildNovelContext(config)}
   
   ${volumeContext}
   
   为章节 "${chapter.title}" 设计详细的剧情细纲 (Beats)。
   章节摘要: ${chapter.summary}
   
   ${ancestorSummaries ? `前置剧情:\n${ancestorSummaries}\n` : ""}
   
   ${lastContent ? `上一章结尾:\n${lastContent}\n` : ""}
   
   ${hooks.length > 0 ? `需要回应的伏笔:\n${hooks.join("\n")}\n` : ""}
   
   要求:
   1. 生成 5-8 个具体的剧情步骤
   2. 确保与上一章自然衔接
   3. ${hooks.length > 0 ? "必须回应上述伏笔" : ""}
   4. 符合分卷的整体节奏
   
   返回 JSON 字符串数组。
   `;
   ```

### 4. UI 组件设计

#### OutlineBuilder 组件增强

**新增状态**:
```typescript
const [volumes, setVolumes] = useState<Volume[]>([]);
const [expandedVolumeIds, setExpandedVolumeIds] = useState<Set<string>>(new Set());
```

**新增功能**:
- `handleCreateVolume()`: 创建新分卷
- `handleEditVolume(volumeId)`: 编辑分卷信息
- `handleDeleteVolume(volumeId)`: 删除分卷（章节 volumeId 置空）
- `handleMoveChapterToVolume(chapterId, volumeId)`: 移动章节到分卷
- `handleGenerateVolumeSummary(volumeId)`: 生成分卷总结

**UI 结构**:
```tsx
<div className="outline-container">
  {/* 未分卷章节 */}
  <div className="unassigned-chapters">
    {chaptersWithoutVolume.map(ch => <ChapterNode />)}
  </div>
  
  {/* 分卷列表 */}
  {volumes.map(volume => (
    <VolumeCard 
      volume={volume}
      chapters={getChaptersInVolume(volume.id)}
      isExpanded={expandedVolumeIds.has(volume.id)}
      onToggle={() => toggleVolume(volume.id)}
      onEdit={() => handleEditVolume(volume.id)}
      onDelete={() => handleDeleteVolume(volume.id)}
      onGenerateSummary={() => handleGenerateVolumeSummary(volume.id)}
    />
  ))}
  
  {/* 创建分卷按钮 */}
  <button onClick={handleCreateVolume}>+ 新建分卷</button>
</div>
```

#### VolumeCard 组件 (新增)

```tsx
interface VolumeCardProps {
  volume: Volume;
  chapters: Chapter[];
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onGenerateSummary: () => void;
}

const VolumeCard: React.FC<VolumeCardProps> = ({ ... }) => {
  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const progress = volume.expectedWordCount 
    ? (totalWords / volume.expectedWordCount) * 100 
    : 0;
  
  return (
    <div className="volume-card">
      <div className="volume-header" onClick={onToggle}>
        <h3>{volume.title}</h3>
        <div className="volume-stats">
          <span>{chapters.length} 章</span>
          <span>{totalWords} 字</span>
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>
      </div>
      
      {isExpanded && (
        <div className="volume-chapters">
          {chapters.map(ch => <ChapterNode chapter={ch} />)}
        </div>
      )}
      
      <div className="volume-actions">
        <button onClick={onEdit}>编辑</button>
        <button onClick={onDelete}>删除</button>
        {isLastChapterComplete(volume, chapters) && (
          <button onClick={onGenerateSummary}>生成总结</button>
        )}
      </div>
    </div>
  );
};
```

#### Editor 组件细纲面板增强

**显示上一章信息**:
```tsx
{previousChapter && (
  <div className="previous-chapter-context">
    <h5>上一章: {previousChapter.title}</h5>
    <p className="last-content">{getLastContent(previousChapter, 200)}</p>
    {previousChapter.hooks && previousChapter.hooks.length > 0 && (
      <div className="hooks">
        <strong>待回应伏笔:</strong>
        <ul>
          {previousChapter.hooks.map((hook, i) => (
            <li key={i}>{hook}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
)}
```

**钩子标记功能**:
```tsx
<div className="hooks-editor">
  <h5>本章伏笔标记</h5>
  {chapter.hooks?.map((hook, i) => (
    <div key={i} className="hook-item">
      <input 
        value={hook} 
        onChange={(e) => updateHook(i, e.target.value)} 
      />
      <button onClick={() => deleteHook(i)}>删除</button>
    </div>
  ))}
  <button onClick={addHook}>+ 添加伏笔</button>
</div>
```

## 数据模型

### Volume 实体

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| id | string | ✓ | UUID |
| title | string | ✓ | 卷标题 |
| summary | string | ✓ | 卷摘要 |
| coreConflict | string | ✓ | 核心冲突 |
| order | number | ✓ | 序号 |
| chapterIds | string[] | ✓ | 章节 ID 列表 |
| volumeSummary | string | ✗ | 完成后的总结 |
| expectedWordCount | number | ✗ | 预期字数 |

### Chapter 扩展字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| volumeId | string \| null | ✗ | 所属分卷 ID |
| hooks | string[] | ✗ | 伏笔列表 |

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真。属性是人类可读规范和机器可验证正确性保证之间的桥梁。*


### 分卷管理属性

**属性 1: 分卷创建完整性**
*对于任何*分卷创建操作，返回的分卷对象应包含唯一的 ID、标题、摘要、核心冲突和顺序号字段
**验证: 需求 1.1**

**属性 2: 章节关联一致性**
*对于任何*章节和分卷，当章节被分配到分卷时，章节的 volumeId 应等于该分卷的 ID
**验证: 需求 1.2**

**属性 3: 分卷统计准确性**
*对于任何*分卷，显示的章节数量应等于 chapterIds 数组的长度，总字数应等于所有关联章节的 wordCount 之和
**验证: 需求 1.3**

**属性 4: 删除分卷保留章节**
*对于任何*包含章节的分卷，删除该分卷后，所有原本关联的章节应仍然存在且 volumeId 为 null
**验证: 需求 1.4**

**属性 5: 分卷编辑反映性**
*对于任何*分卷和任何字段更新，更新后的分卷对象应反映所有修改的字段值
**验证: 需求 1.5**

### 上下文注入属性

**属性 6: 分卷上下文包含性**
*对于任何*属于分卷的章节，生成内容时构建的 prompt 应包含该分卷的摘要和核心冲突文本
**验证: 需求 2.1**

**属性 7: 分卷进度计算正确性**
*对于任何*分卷中的章节，计算的进度百分比应等于 (当前章节在卷中的位置 / 卷内总章节数) × 100
**验证: 需求 2.2**

**属性 8: 跨卷上下文传递**
*对于任何*新卷的第一章，如果上一卷存在 volumeSummary，生成 prompt 应包含该总结文本
**验证: 需求 2.5**

### 深度上下文细纲属性

**属性 9: 上一章结尾提取**
*对于任何*非首章，生成细纲时应提取上一章内容的最后 500 个字符（或全部内容如果少于 500 字符）
**验证: 需求 3.1**

**属性 10: 钩子传递完整性**
*对于任何*有钩子的上一章，生成细纲的 prompt 应包含所有钩子文本
**验证: 需求 3.2, 3.3**

**属性 11: 祖先摘要包含性**
*对于任何*有祖先章节的章节（分支剧情），生成细纲的 prompt 应包含所有祖先章节的摘要
**验证: 需求 3.4**

**属性 12: 细纲数量约束**
*对于任何*细纲生成结果，返回的数组长度应在 5 到 8 之间（包含边界）
**验证: 需求 3.5**

### 持久化属性

**属性 13: 分卷往返一致性**
*对于任何*分卷数据，保存到 IndexedDB 后重新加载，应得到相同的分卷对象（ID、标题、摘要等字段一致）
**验证: 需求 5.2**

**属性 14: NovelState 结构完整性**
*对于任何*保存的 NovelState，应包含 volumes 数组字段
**验证: 需求 5.3**

**属性 15: 钩子持久化**
*对于任何*包含钩子的章节，保存后重新加载，hooks 数组应保持不变
**验证: 需求 5.4**

### 向后兼容属性

**属性 16: 旧项目 volumes 初始化**
*对于任何*没有 volumes 字段的旧项目，加载后 NovelState.volumes 应为空数组
**验证: 需求 6.1**

**属性 17: 旧章节 volumeId 保留**
*对于任何*没有 volumeId 字段的旧章节，加载后 volumeId 应为 null 或 undefined
**验证: 需求 6.2**

**属性 18: 旧章节 hooks 初始化**
*对于任何*没有 hooks 字段的旧章节，加载后 hooks 应为空数组
**验证: 需求 6.3**

**属性 19: 混合模式章节创建**
*对于任何*在旧项目中创建的新章节，应使用新数据结构（包含 volumeId 和 hooks 字段）但 volumeId 为 null
**验证: 需求 6.4**

## 错误处理

### 分卷操作错误

1. **删除不存在的分卷**: 静默失败，不抛出错误
2. **移动章节到不存在的分卷**: 显示错误提示，不修改章节
3. **创建分卷时缺少必需字段**: 使用默认值填充（如 title: "未命名分卷"）

### AI 生成错误

1. **细纲生成失败**: 捕获异常，显示友好错误消息，不修改现有 beats
2. **细纲返回格式错误**: 尝试解析，如果失败返回空数组并警告用户
3. **分卷总结生成失败**: 显示错误，允许用户重试

### 数据库错误

1. **IndexedDB 不可用**: 降级到内存模式，警告用户数据不会持久化
2. **保存失败**: 重试 3 次，失败后提示用户手动导出数据
3. **迁移失败**: 回滚到旧版本，记录错误日志

### 向后兼容错误

1. **旧数据格式无法识别**: 尝试最佳猜测转换，记录警告
2. **字段类型不匹配**: 使用类型转换，失败则使用默认值

## 测试策略

### 单元测试

**数据模型测试**:
- Volume 对象创建和验证
- Chapter 扩展字段的默认值
- NovelState 的 volumes 数组操作

**工具函数测试**:
- `findPreviousChapter()`: 测试线性和分支场景
- `getChapterAncestors()`: 测试多层嵌套
- `getVolumeProgress()`: 测试边界情况（空卷、单章卷）
- `extractLastContent()`: 测试不同长度的内容

**UI 组件测试**:
- VolumeCard 渲染正确的统计信息
- 钩子编辑器的添加/删除操作
- 分卷折叠/展开状态管理

### 属性测试

使用 **fast-check** (JavaScript 属性测试库) 进行属性测试。

**测试配置**:
- 每个属性运行 100 次迭代
- 使用自定义生成器创建随机的 Volume、Chapter、NovelState

**生成器示例**:
```typescript
import * as fc from 'fast-check';

const volumeArbitrary = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  summary: fc.string({ minLength: 10, maxLength: 300 }),
  coreConflict: fc.string({ minLength: 10, maxLength: 200 }),
  order: fc.integer({ min: 1, max: 100 }),
  chapterIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 150 }),
  volumeSummary: fc.option(fc.string({ minLength: 500, maxLength: 1000 })),
  expectedWordCount: fc.option(fc.integer({ min: 10000, max: 500000 }))
});

const chapterArbitrary = fc.record({
  id: fc.uuid(),
  order: fc.integer({ min: 1, max: 1000 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  summary: fc.string({ minLength: 10, maxLength: 500 }),
  content: fc.string({ minLength: 0, maxLength: 10000 }),
  wordCount: fc.integer({ min: 0, max: 10000 }),
  tension: fc.option(fc.integer({ min: 1, max: 10 })),
  beats: fc.option(fc.array(fc.string(), { minLength: 5, maxLength: 8 })),
  parentId: fc.option(fc.uuid()),
  volumeId: fc.option(fc.uuid()),
  hooks: fc.option(fc.array(fc.string(), { minLength: 0, maxLength: 5 }))
});
```

**属性测试示例**:
```typescript
// 属性 1: 分卷创建完整性
describe('Property 1: Volume Creation Completeness', () => {
  it('should create volumes with all required fields', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 10 }),
        fc.string({ minLength: 10 }),
        (title, summary, conflict) => {
          const volume = createVolume(title, summary, conflict);
          
          expect(volume.id).toBeDefined();
          expect(volume.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
          expect(volume.title).toBe(title);
          expect(volume.summary).toBe(summary);
          expect(volume.coreConflict).toBe(conflict);
          expect(volume.order).toBeGreaterThan(0);
          expect(Array.isArray(volume.chapterIds)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// 属性 13: 分卷往返一致性
describe('Property 13: Volume Round-trip Consistency', () => {
  it('should preserve volume data through save/load cycle', async () => {
    await fc.assert(
      fc.asyncProperty(volumeArbitrary, async (volume) => {
        // 保存
        await db.saveVolume(volume);
        
        // 加载
        const loaded = await db.loadVolume(volume.id);
        
        // 验证
        expect(loaded).toEqual(volume);
      }),
      { numRuns: 100 }
    );
  });
});
```

### 集成测试

**端到端流程测试**:
1. 创建项目 → 创建分卷 → 添加章节到分卷 → 生成细纲 → 验证上下文包含分卷信息
2. 创建多章 → 标记钩子 → 生成下一章细纲 → 验证 prompt 包含钩子
3. 完成一卷 → 生成分卷总结 → 创建新卷 → 验证新卷首章包含上卷总结

**数据库迁移测试**:
1. 创建旧版本项目数据
2. 触发数据库升级
3. 验证所有数据保留且新字段正确初始化

### 测试覆盖率目标

- 核心逻辑函数: 90%+
- UI 组件: 70%+
- 属性测试: 所有 19 个属性
- 集成测试: 至少 5 个关键流程

## 性能考虑

### 优化策略

1. **分卷统计缓存**: 
   - 在 Volume 对象中缓存 totalWords 和 chapterCount
   - 仅在章节变更时重新计算

2. **懒加载章节内容**:
   - 折叠的分卷不加载章节的完整 content
   - 仅在展开时加载

3. **细纲生成节流**:
   - 防止用户快速连续点击生成按钮
   - 使用 debounce 限制 API 调用频率

4. **IndexedDB 批量操作**:
   - 移动多个章节到分卷时使用单个事务
   - 减少数据库写入次数

### 性能指标

- 分卷创建: < 100ms
- 章节移动: < 50ms
- 细纲生成: < 5s (取决于 API 响应)
- 大纲页面渲染 (100 章 + 10 卷): < 500ms

## 安全考虑

### 数据验证

1. **输入清理**: 
   - 分卷标题和摘要长度限制
   - 防止 XSS 注入（React 自动转义）

2. **ID 验证**:
   - 验证 volumeId 和 chapterId 存在性
   - 防止引用不存在的实体

3. **权限控制**:
   - 当前版本为单用户应用，无需权限系统
   - 未来多用户版本需添加分卷所有权检查

### API 安全

1. **API Key 保护**:
   - 不在客户端代码中硬编码
   - 使用环境变量或用户配置

2. **Prompt 注入防护**:
   - 清理用户输入的特殊字符
   - 限制 prompt 总长度防止超出 token 限制

## 部署考虑

### 数据库迁移

**迁移步骤**:
1. 检测当前数据库版本
2. 如果版本 < 6，执行迁移逻辑
3. 在内存中为旧数据添加新字段
4. 保存时使用新格式

**回滚策略**:
- 保留旧版本代码分支
- 提供数据导出功能
- 如果迁移失败，允许用户回退到旧版本

### 渐进式发布

1. **Alpha 测试**: 内部测试分卷创建和基础功能
2. **Beta 测试**: 邀请部分用户测试完整流程
3. **正式发布**: 全量发布，监控错误日志

### 监控和日志

- 记录分卷操作（创建、删除、编辑）
- 记录细纲生成失败率
- 监控 IndexedDB 操作性能
- 收集用户反馈（可选的匿名使用统计）

## 未来扩展

### 短期 (1-2 个月)

1. **AI 生成分卷大纲**: 基于整体设定自动规划分卷结构
2. **分卷模板**: 预设常见的分卷结构（如三幕剧、五幕剧）
3. **钩子自动检测**: 使用 AI 分析章节内容，自动标记潜在伏笔

### 中期 (3-6 个月)

1. **分卷可视化图表**: 显示各卷的字数、张力曲线
2. **跨卷搜索**: 在特定分卷内搜索章节和内容
3. **分卷导出**: 单独导出某一卷为独立文件

### 长期 (6+ 个月)

1. **协作编辑**: 多作者共同编辑不同分卷
2. **版本分支**: 为分卷创建不同的剧情分支版本
3. **AI 分卷顾问**: 分析分卷结构，提供优化建议

---

**设计文档版本**: 1.0  
**最后更新**: 2024-11-29  
**审核状态**: 待审核

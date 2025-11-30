根据之前对 InkFlow 现有工作流缺陷的分析（主要是结构层级缺失、设定静态化、逻辑检查被动、风格单一化等问题），我为你草拟了一份系统升级需求文档（PRD）。

这份文档旨在指导下一阶段的开发，将 InkFlow 从一个“AI 辅助写作工具”升级为“动态长篇小说创作系统”。

InkFlow 系统升级需求文档 (PRD) v2.0
版本：2.0 Draft 目标：解决长篇连贯性断层、设定动态演进滞后、文风同质化等核心痛点，构建“生长型”小说创作系统。

1. 核心问题陈述 (Problem Statement)
基于现状分析，当前系统存在以下阻碍长篇创作的核心缺陷：

结构扁平：缺乏“分卷/剧情弧”层级，AI 难以把握宏观节奏。

设定静态：角色与世界状态不随剧情发展自动更新，导致后期生成内容与设定脱节（如主角已升级，AI 仍按弱者描写）。

逻辑被动：RAG 仅做相关性检索，缺乏主动的逻辑冲突检查（吃书现象）。

风格固化：缺乏对用户修改习惯的学习，生成的文风千篇一律。

细纲断层：细纲生成仅依赖摘要，缺乏对伏笔和细节的连续性捕捉。

2. 功能需求详情 (Functional Requirements)
2.1 模块一：多层级剧情结构 (Hierarchical Plot Management)
目标：引入“卷（Volume）”概念，建立书 -> 卷 -> 章 -> 细纲的四级结构。

FR-1.1 分卷管理：

新增 Volume 数据实体，包含：卷标题、卷摘要、本卷核心冲突、预期字数、起止章节。

UI 支持在左侧大纲栏进行“新建卷”、“将章节拖入卷”操作。

FR-1.2 宏观节奏控制：

AI 在生成章节时，需额外注入“当前卷摘要”和“本卷进度（如：处于高潮前夕）”作为 Context。

提供“分卷总结生成”功能：一卷结束后，AI 自动生成本卷详细回顾，作为下一卷的输入。

2.2 模块二：动态世界演进系统 (Dynamic World Evolution)
目标：让设定（Wiki/Character）随剧情自动“生长”。

FR-2.1 状态变更检测 (State Change Detection)：

触发时机：每章正文生成并保存后。

功能：后台静默调用 AI 分析器，识别关键状态变更。

示例：检测到“林曜突破至筑基期” -> 建议更新角色卡“境界”字段。

示例：检测到“青云门被灭” -> 建议更新势力列表“青云门”状态为“已灭亡”。

FR-2.2 变更提案 (Change Proposal)：

UI 新增“世界变动通知”区域。AI 不直接修改数据库，而是生成“变更提案（Diff）”，用户点击“确认”后应用到 Wiki 或角色卡。

FR-2.3 时间切片 (Time Slicing)：

角色卡和 Wiki 支持“版本控制”。RAG 检索时，根据当前章节的时间点，检索对应版本的设定（如：写第 10 章时检索第 10 章时的角色状态）。

2.3 模块三：逻辑一致性卫士 (Logic Consistency Guard)
目标：从“相关性检索”升级为“冲突检测”。

FR-3.1 逻辑预检 (Pre-flight Check)：

在生成正文前，增加一个轻量级推理步骤。

Prompt 逻辑：输入本章细纲 + 检索到的设定 -> 提问：“细纲中的情节是否与设定冲突？”（如：细纲写主角用剑，但设定里剑已断）。

若发现冲突，弹窗警告用户，或自动在 System Prompt 中添加约束（Constraint）。

FR-3.2 伏笔回收追踪 (Plot Hole Tracker)：

新增 OpenLoops（未闭环情节）数据结构。

用户或 AI 可标记某段情节为“伏笔”。

在生成后续大纲时，系统强制提示未回收的伏笔列表。

2.4 模块四：自适应风格引擎 (Adaptive Style Engine)
目标：让 AI 越写越像用户。

FR-4.1 风格采样 (Style Sampling)：

新增 StyleVectorStore（风格向量库）。

当用户大幅度修改 AI 生成的文本（改动率 > 30%）并保存时，系统自动将用户的最终版本作为“正样本”存入风格库。

FR-4.2 动态少样本提示 (Dynamic Few-Shot)：

生成新章节时，从风格库中检索 3-5 段与当前情境（如战斗、对话、景物）相似的用户手写片段。

将其作为 Examples 注入 Prompt，指令 AI：“模仿以下片段的笔法和用词习惯”。

2.5 模块五：深度上下文细纲 (Deep Context Beats)
目标：解决细纲生成“断气”问题。

FR-5.1 上下文滑动窗口增强：

细纲生成不仅仅依赖摘要，需读取上一章的结尾 500 字（确保场景衔接）和上一章的遗留钩子（Hook）。

FR-5.2 交互式细纲打磨：

细纲生成改为对话式。AI 生成初版 -> 用户：“增加点打斗” -> AI 调整 -> 确认。

3. 数据结构变更建议 (Schema Updates)
为了支持上述功能，types.ts 需要进行如下扩展：

TypeScript

// 新增：分卷结构
export interface Volume {
  id: string;
  title: string;
  summary: string;
  order: number;
  chapterIds: string[]; // 包含的章节ID
}

// 扩展：角色增加状态历史
export interface CharacterState {
  timestamp: number; // 对应章节ID或时间戳
  description: string; // 当时的状态描述
  level: string; // 当时的等级/境界
}

export interface Character {
  // ... 原有字段
  history: CharacterState[]; // 状态演变历史
}

// 扩展：章节增加伏笔标记
export interface Chapter {
  // ... 原有字段
  volumeId?: string; // 所属分卷
  openLoops?: string[]; // 本章开启的伏笔
  closedLoops?: string[]; // 本章回收的伏笔
}

// 新增：风格样本
export interface StyleSample {
  id: string;
  text: string;
  type: 'combat' | 'dialogue' | 'scenery'; // 样本类型
  embedding: number[];
}
4. 开发优先级建议 (Roadmap)
P0 (最高优先级)：数据结构升级（引入 Volume 和 CharacterHistory），这是地基。

P1 (核心体验)：自适应风格引擎。这是用户感知最强的功能，能显著减少用户的润色工作量。

P2 (长期价值)：动态世界演进。对于 50 万字以上的小说至关重要。

P3 (完善)：逻辑一致性卫士。技术实现难度较大，可后期迭代。

这份文档可以直接作为下一阶段开发的任务清单（Backlog）。
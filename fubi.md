在网文创作中，“伏笔（Foreshadowing）”的处理确实是一个难点，尤其是在长篇连贯性上。对于 InkFlow 这样一个 AI 辅助创作系统，我们可以从写作技法和系统功能实现两个维度来解决这个问题。

维度一：网文伏笔的写作逻辑（AI 需要理解的规则）
在让 AI 帮你处理伏笔之前，我们需要先明确什么样的伏笔是“有效”的。你可以将这些规则作为 System Prompt 的一部分：

“不经意原则” (Hiding in Plain Sight)：伏笔不能太突兀。最好的伏笔是作为“背景描述”或“闲聊”出现的。

AI 指令：“在描写主角获得新道具时，顺便提一句道具上的缺口，不要过度强调。”

“延迟满足” (Delayed Payoff)：埋下伏笔和回收伏笔之间要有足够的时间差（章节间隔），这样读者的爽感才强。

“多重功能”：一个伏笔最好同时具备“推进当前剧情”和“暗示未来剧情”的双重作用，避免为了埋伏笔而写废话。

维度二：系统功能实现（如何在 InkFlow 中落地）
既然我们已经有了分卷和动态世界的基础，我们可以构建一个**“伏笔追踪系统” (Plot Loop System)**。在编剧理论中，这被称为“开环（Open Loop）”和“闭环（Close Loop）”。

我建议从以下三个步骤来实现这个功能：

1. 数据结构升级：显性化伏笔
我们需要在数据层面明确记录“这是一个伏笔”。

修改 types.ts：

TypeScript

// [新增] 伏笔/悬念状态
export enum PlotLoopStatus {
  OPEN = 'OPEN',       // 已埋下，未回收
  URGENT = 'URGENT',   // 急需回收（接近预定回收章节）
  CLOSED = 'CLOSED',   // 已回收
  ABANDONED = 'ABANDONED' // 废弃
}

// [新增] 伏笔条目
export interface PlotLoop {
  id: string;
  title: string;       // 伏笔简述，如“神秘的断剑”
  description: string; // 详细描述
  setupChapterId: string; // 埋下伏笔的章节
  targetChapterId?: string; // [可选] 计划回收的章节
  closeChapterId?: string; // 实际回收的章节
  status: PlotLoopStatus;
  importance: number;  // 1-5，重要程度
}

// [修改] 扩展 NovelState
export interface NovelState {
  // ... 其他字段
  plotLoops: PlotLoop[]; // 全局伏笔列表
}
2. AI 辅助功能：自动识别与提醒
我们需要在 geminiService.ts 中增加两个新功能。

A. 埋伏笔助手 (Setup Assistant) 在生成正文或大纲时，让 AI 自动建议在哪里埋伏笔。

Prompt 策略：

"分析当前章节的情节。为了给 50 章后的‘宗门大比’做铺垫，请在本章的对话或环境描写中，自然地插入 1-2 个关于‘宗门禁地异常’的微小伏笔。不要让读者觉得突兀。"

B. 伏笔回收提醒 (Payoff Reminder) 这是防止“坑没填”的关键。在生成**细纲（Beats）**时，强制检查未回收的伏笔。

Prompt 策略（修改 generateChapterBeats）：

TypeScript

// 伪代码逻辑
const openLoops = allLoops.filter(l => l.status === 'OPEN');
const prompt = `
  ...
  ## 必须关注的未解悬念 (Open Loops):
  ${openLoops.map(l => `- ${l.title} (埋于第${getChapterOrder(l.setupChapterId)}章)`).join('\n')}

  ## 任务:
  在设计本章细纲时，请思考是否有机会自然地推进或回收上述悬念？如果有，请在细纲中明确标出。
  ...
`;
3. 交互界面设计：伏笔管理面板
你可以在编辑器右侧栏（现在的“剧情细纲 / 上下文 / 历史”）旁边，增加一个 “悬念 (Loops)” 标签页。

列表展示：列出所有 OPEN 状态的伏笔。

拖拽引用：

写细纲时，用户可以直接把右侧的“神秘断剑”伏笔拖入细纲输入框。

系统自动生成一条指令：“在此处推进‘神秘断剑’的线索，揭示其原有铭文。”

手动标记：

在正文编辑器中，用户选中一段话，点击浮动菜单的“设为伏笔”，系统自动创建一条 PlotLoop 记录。
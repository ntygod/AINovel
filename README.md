# 🖋️ InkFlow - AI 长篇小说家

<div align="center">
  <p><strong>专为百万字长篇网文打造的 AI 辅助创作系统</strong></p>
  <p>利用深度上下文感知、RAG 检索增强与结构化剧情管理，让 AI 成为真正的网文合伙人。</p>
</div>

## 📖 项目简介

InkFlow 是一个基于 React + TypeScript 构建的专业级 AI 小说写作平台。它不仅仅是一个文本生成器，而是一个完整的长篇小说工程化管理系统。

它旨在解决 AI 写长篇小说时的核心难题：

- **遗忘设定**：通过 RAG（向量检索）和全局备忘录，确保 AI 记住数百章前的设定。
- **剧情断层**：引入"分卷-章节-细纲"层级结构，并通过"伏笔追踪"系统管理悬念。
- **角色脸谱化**：通过动态角色演进系统，记录角色的状态变化、关系网络及性格特征。
- **文风单一**：支持针对不同场景（创意、大纲、正文、润色）配置不同的 AI 模型（如 DeepSeek 负责逻辑，Gemini 负责长文）。

## ✨ 核心功能

### 1. 🏗️ 结构化世界构建 (World Building)

- **世界观设计**：AI 辅助生成宏大的世界背景、力量体系和核心冲突。
- **程序化地图**：内置基于 Canvas 的程序化地图生成器，可视化编辑势力分布与疆域。
- **百科全书 (Wiki)**：自动从正文中提取或手动录入物品、功法、地点等设定，AI 写作时自动检索引用。

### 2. 👥 深度角色系统 (Character Forge)

- **角色锻造**：详细设定角色的外貌、性格、对话风格、核心驱动力（Motivation）及叙事功能。
- **关系图谱**：可视化的角色关系网，支持拖拽交互。
- **动态演进**：AI 会分析章节内容，自动建议更新角色的状态（如"受伤"、"黑化"、"升级"）。

### 3. 📝 剧情与大纲管理 (Plot Management)

- **分卷管理**：支持 Volume（分卷）层级，控制宏观叙事节奏。
- **伏笔追踪 (Plot Loops)**：独创的"开环-闭环"管理系统。标记未回收的伏笔，AI 在生成后续细纲时会主动提示回收，防止"挖坑不填"。
- **剧情时间轴**：可视化展示剧情张力曲线和角色登场时间线。

### 4. ✍️ 智能写作与润色 (AI Writing)

- **深度上下文生成**：在生成正文时，自动注入当前分卷摘要、相关百科、活跃角色状态及前文伏笔。
- **多模态支持**：
  - **AI 视频工坊**：利用 Google Veo 模型将小说片段转化为视频分镜。
  - **TTS 朗读**：利用 AI 语音模型朗读生成的脚本。
  - **智能排版**：自动优化 AI 输出的文本格式，符合网文阅读习惯（双换行、对话独立成段）。

### 5. ⚙️ 高级工程特性

- **混合模型调度**：支持为不同场景（创意、结构、写作、分析）配置不同的 AI 服务商（Google Gemini, DeepSeek, OpenAI, Custom/Local）。
- **本地优先存储**：使用 IndexedDB 进行本地存储，数据隐私安全，支持 JSON 全量备份与导入。
- **Token 预算控制**：内置 Token 使用统计与每日预算预警。

## 🛠️ 技术栈

- **前端框架**: React 19, TypeScript, Vite
- **UI 组件**: Tailwind CSS, Lucide React
- **编辑器**: Tiptap (Headless rich text editor)
- **数据存储**: IndexedDB (Local-first), Dexie.js (类似封装)

### AI 集成

- Google GenAI SDK (Gemini 1.5/2.0/3.0)
- OpenAI Compatible API (DeepSeek, Local LLM)
- Vector Embeddings (用于 RAG)

## 🚀 快速开始

### 环境要求

- Node.js (v18+)
- npm 或 yarn

### 安装步骤

1. 克隆项目

```bash
git clone https://github.com/yourusername/inkflow.git
cd inkflow
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

复制 `.env.example` (如果有) 或直接在根目录创建 `.env.local`：

```env
# 可选：默认 Google API Key
VITE_GEMINI_API_KEY=your_api_key_here
```

4. 启动开发服务器

```bash
npm run dev
```

5. 访问 http://localhost:3001 开始创作。

## 📖 使用指南

1. **项目初始化**：进入"项目设定"，输入一个简单的创意（如"赛博修仙"），点击 AI 灵感生成，自动补全书名、简介和主角设定。
2. **构建架构**：在"世界观与架构"中生成势力地图和修炼体系。
3. **创建角色**：在"角色管理"中批量生成主要角色。
4. **生成大纲**：进入"大纲与剧情"，生成分卷和前几章的细纲。
5. **开始写作**：进入"写作"模式，点击"AI 续写"。AI 会根据你选中的章节、细纲以及自动检索到的设定生成正文。
6. **多模型配置**：在"应用设置"中，建议将"结构化生成"配置为推理能力强的模型（如 DeepSeek-R1），将"长文写作"配置为上下文窗口大的模型（如 Gemini 1.5 Pro）。

## 📂 目录结构

```
src/
├── components/        # UI 组件 (Editor, Sidebar, Panels...)
├── services/          # 核心业务逻辑
│   ├── db.ts          # IndexedDB 数据库管理
│   ├── geminiService.ts # AI 接口封装 (Google/OpenAI/DeepSeek)
│   ├── ragService.ts  # RAG 向量检索与关键词匹配
│   ├── plotLoopService.ts # 伏笔管理逻辑
│   ├── evolutionService.ts # 世界观动态演进分析
│   └── ...
├── types.ts           # TypeScript 类型定义 (核心数据结构)
├── App.tsx            # 主应用入口
└── main.tsx
```

## 🤝 贡献

欢迎提交 Pull Request 或 Issue！ 详情请阅读 AGENTS.md 了解代码规范和工作流。

## 📄 许可证

MIT License

# InkFlow 后端架构设计方案

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        前端 (React + Vite)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Editor  │  │ Outline │  │ PlotLoop│  │ AIChat  │            │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│       └────────────┴────────────┴────────────┘                  │
│                          │                                       │
│                    API Client Layer                              │
└──────────────────────────┼───────────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────┼───────────────────────────────────────┐
│                     API Gateway                                   │
│              (认证、限流、日志、CORS)                              │
└──────────────────────────┼───────────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────────┐
│                    后端服务层                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Auth Service│  │Project Svc  │  │  AI Proxy   │              │
│  │  用户认证   │  │ 项目管理    │  │  AI 代理    │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
│  ┌──────┴────────────────┴────────────────┴──────┐              │
│  │              Business Logic Layer              │              │
│  │     (项目、章节、角色、伏笔、分卷业务逻辑)      │              │
│  └────────────────────────┬───────────────────────┘              │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                      数据层                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ PostgreSQL  │  │   Redis     │  │  S3/OSS     │              │
│  │  主数据库   │  │  缓存/会话  │  │  文件存储   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                   │
│  ┌─────────────┐                                                 │
│  │  pgvector   │  ← 向量检索 (RAG)                               │
│  └─────────────┘                                                 │
└───────────────────────────────────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                    外部服务                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Google AI   │  │  OpenAI     │  │  DeepSeek   │              │
│  │  (Gemini)   │  │  (GPT-4)    │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└───────────────────────────────────────────────────────────────────┘
```

## 2. 技术栈选型

### 2.1 后端框架
| 选项 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **Node.js + Fastify** | 与前端同语言、性能好、生态丰富 | 类型安全需额外配置 | ⭐⭐⭐⭐⭐ |
| Python + FastAPI | AI 生态好、类型提示 | 需要学习新语言 | ⭐⭐⭐⭐ |
| Go + Gin | 性能极佳、部署简单 | 开发效率较低 | ⭐⭐⭐ |

**推荐：Node.js + Fastify + TypeScript**
- 与前端共享类型定义
- 流式响应支持好（AI 生成）
- 团队学习成本低

### 2.2 数据库
| 组件 | 选型 | 用途 |
|------|------|------|
| 主数据库 | PostgreSQL 15+ | 用户、项目、章节等结构化数据 |
| 向量扩展 | pgvector | RAG 向量检索，无需额外服务 |
| 缓存 | Redis | 会话管理、API 限流、热点数据缓存 |
| 文件存储 | S3/阿里云 OSS | 导出文件、备份、大文件存储 |

### 2.3 部署方案
| 方案 | 成本 | 复杂度 | 适合场景 |
|------|------|--------|----------|
| Vercel + Supabase | 低 | 低 | 快速上线、小规模 |
| Docker + 云服务器 | 中 | 中 | 可控性强、中等规模 |
| K8s 集群 | 高 | 高 | 大规模、高可用 |

**推荐起步方案：Docker + 单机部署，后续按需扩展**

## 3. 数据库设计

### 3.1 ER 图
```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    users     │       │   projects   │       │   chapters   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │──┐    │ id (PK)      │──┐    │ id (PK)      │
│ email        │  │    │ user_id (FK) │◄─┘    │ project_id   │◄─┐
│ password_hash│  │    │ title        │  │    │ volume_id    │  │
│ name         │  │    │ config (JSON)│  │    │ order        │  │
│ avatar_url   │  │    │ structure    │  │    │ title        │  │
│ created_at   │  │    │ created_at   │  │    │ summary      │  │
│ updated_at   │  │    │ updated_at   │  │    │ content      │  │
└──────────────┘  │    └──────────────┘  │    │ word_count   │  │
                  │                       │    │ beats (JSON) │  │
                  │    ┌──────────────┐   │    │ created_at   │  │
                  │    │   volumes    │   │    └──────────────┘  │
                  │    ├──────────────┤   │                      │
                  │    │ id (PK)      │   │    ┌──────────────┐  │
                  │    │ project_id   │◄──┼────│  characters  │  │
                  │    │ title        │   │    ├──────────────┤  │
                  │    │ summary      │   │    │ id (PK)      │  │
                  │    │ order        │   │    │ project_id   │◄─┤
                  │    │ created_at   │   │    │ name         │  │
                  │    └──────────────┘   │    │ role         │  │
                  │                       │    │ description  │  │
                  │    ┌──────────────┐   │    │ personality  │  │
                  │    │  plot_loops  │   │    │ relationships│  │
                  │    ├──────────────┤   │    └──────────────┘  │
                  │    │ id (PK)      │   │                      │
                  │    │ project_id   │◄──┘    ┌──────────────┐  │
                  │    │ title        │        │ wiki_entries │  │
                  │    │ description  │        ├──────────────┤  │
                  │    │ status       │        │ id (PK)      │  │
                  │    │ importance   │        │ project_id   │◄─┘
                  │    │ setup_chapter│        │ name         │
                  │    │ target_chapter│       │ category     │
                  │    │ close_chapter│        │ description  │
                  │    │ parent_id    │        └──────────────┘
                  │    │ created_at   │
                  │    └──────────────┘
                  │
                  │    ┌──────────────┐
                  └───►│ api_keys     │
                       ├──────────────┤
                       │ id (PK)      │
                       │ user_id (FK) │
                       │ provider     │
                       │ encrypted_key│
                       │ created_at   │
                       └──────────────┘
```

### 3.2 核心表结构

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100),
    avatar_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 项目表
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    structure JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 章节表
CREATE TABLE chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    volume_id UUID REFERENCES volumes(id) ON DELETE SET NULL,
    "order" INTEGER NOT NULL,
    title VARCHAR(255) NOT NULL,
    summary TEXT,
    content TEXT,
    word_count INTEGER DEFAULT 0,
    beats JSONB DEFAULT '[]',
    tension INTEGER CHECK (tension >= 1 AND tension <= 10),
    parent_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, "order")
);

-- 伏笔表
CREATE TABLE plot_loops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' 
        CHECK (status IN ('OPEN', 'URGENT', 'CLOSED', 'ABANDONED')),
    importance INTEGER NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
    setup_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    target_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    target_volume_id UUID REFERENCES volumes(id) ON DELETE SET NULL,
    close_chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,
    abandon_reason TEXT,
    parent_loop_id UUID REFERENCES plot_loops(id) ON DELETE SET NULL,
    related_character_ids UUID[] DEFAULT '{}',
    related_wiki_entry_ids UUID[] DEFAULT '{}',
    ai_suggested BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 向量存储表 (RAG)
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('chapter', 'character', 'wiki')),
    source_id UUID NOT NULL,
    content TEXT NOT NULL,
    embedding vector(768), -- Gemini embedding 维度
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建向量索引
CREATE INDEX ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- API Key 加密存储
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    encrypted_key TEXT NOT NULL, -- AES-256 加密
    key_hint VARCHAR(10), -- 显示后4位
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);
```

## 4. API 设计

### 4.1 认证 API
```
POST   /api/auth/register     # 注册
POST   /api/auth/login        # 登录
POST   /api/auth/logout       # 登出
POST   /api/auth/refresh      # 刷新 Token
GET    /api/auth/me           # 获取当前用户
```

### 4.2 项目 API
```
GET    /api/projects                    # 获取项目列表
POST   /api/projects                    # 创建项目
GET    /api/projects/:id                # 获取项目详情
PUT    /api/projects/:id                # 更新项目
DELETE /api/projects/:id                # 删除项目
POST   /api/projects/:id/export         # 导出项目
POST   /api/projects/import             # 导入项目
```

### 4.3 章节 API
```
GET    /api/projects/:projectId/chapters              # 获取章节列表(不含内容)
POST   /api/projects/:projectId/chapters              # 创建章节
GET    /api/projects/:projectId/chapters/:id          # 获取章节详情(含内容)
PUT    /api/projects/:projectId/chapters/:id          # 更新章节
DELETE /api/projects/:projectId/chapters/:id          # 删除章节
PUT    /api/projects/:projectId/chapters/reorder      # 重排序章节
```

### 4.4 伏笔 API
```
GET    /api/projects/:projectId/plot-loops            # 获取伏笔列表
POST   /api/projects/:projectId/plot-loops            # 创建伏笔
GET    /api/projects/:projectId/plot-loops/:id        # 获取伏笔详情
PUT    /api/projects/:projectId/plot-loops/:id        # 更新伏笔
DELETE /api/projects/:projectId/plot-loops/:id        # 删除伏笔
POST   /api/projects/:projectId/plot-loops/:id/close  # 关闭伏笔
POST   /api/projects/:projectId/plot-loops/:id/abandon # 废弃伏笔
```

### 4.5 AI 代理 API (核心安全层)
```
POST   /api/ai/generate-beats           # 生成细纲
POST   /api/ai/generate-content         # 生成章节内容 (SSE 流式)
POST   /api/ai/polish                   # 润色文本 (SSE 流式)
POST   /api/ai/chat                     # AI 对话 (SSE 流式)
POST   /api/ai/embed                    # 生成向量嵌入
POST   /api/ai/search                   # 向量检索 (RAG)
```

### 4.6 API Key 管理
```
GET    /api/settings/api-keys           # 获取已配置的 API Key 列表(脱敏)
POST   /api/settings/api-keys           # 添加/更新 API Key
DELETE /api/settings/api-keys/:provider # 删除 API Key
```

## 5. 安全设计

### 5.1 认证方案
```
┌─────────┐     ┌─────────┐     ┌─────────┐
│  登录   │────►│ 验证    │────►│ 签发    │
│         │     │ 密码    │     │ JWT     │
└─────────┘     └─────────┘     └────┬────┘
                                     │
                              ┌──────┴──────┐
                              │             │
                         Access Token   Refresh Token
                         (15分钟)       (7天, HttpOnly Cookie)
```

**JWT Payload:**
```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "iat": 1699999999,
  "exp": 1700000899
}
```

### 5.2 API Key 加密存储
```typescript
// 加密存储用户的 AI API Key
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.API_KEY_ENCRYPTION_KEY; // 32 bytes
const IV_LENGTH = 16;

function encryptApiKey(apiKey: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decryptApiKey(encryptedKey: string): string {
    const [ivHex, encrypted] = encryptedKey.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

### 5.3 请求限流
```typescript
// Redis 滑动窗口限流
const RATE_LIMITS = {
    'ai/generate-content': { window: 60, max: 10 },  // 每分钟 10 次
    'ai/chat': { window: 60, max: 30 },              // 每分钟 30 次
    'default': { window: 60, max: 100 }              // 默认每分钟 100 次
};
```

### 5.4 安全 Headers
```typescript
// Fastify 安全插件配置
fastify.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://generativelanguage.googleapis.com"]
        }
    },
    crossOriginEmbedderPolicy: false
});
```

## 6. AI 代理层设计

### 6.1 流式响应处理
```typescript
// AI 内容生成 - SSE 流式响应
async function streamGenerateContent(
    req: FastifyRequest,
    reply: FastifyReply
) {
    const { projectId, chapterId, prompt } = req.body;
    const userId = req.user.id;
    
    // 1. 获取用户的 API Key
    const apiKey = await getDecryptedApiKey(userId, 'google');
    if (!apiKey) {
        return reply.code(400).send({ error: 'API Key not configured' });
    }
    
    // 2. 获取项目上下文
    const context = await buildProjectContext(projectId, chapterId);
    
    // 3. 设置 SSE 响应头
    reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });
    
    // 4. 调用 AI API 并流式转发
    try {
        const stream = await callGeminiStream(apiKey, prompt, context);
        
        for await (const chunk of stream) {
            reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        
        reply.raw.write('data: [DONE]\n\n');
    } catch (error) {
        reply.raw.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    } finally {
        reply.raw.end();
    }
}
```

### 6.2 RAG 向量检索
```typescript
// 向量检索相关上下文
async function searchRelevantContext(
    projectId: string,
    query: string,
    limit: number = 5
): Promise<SearchResult[]> {
    // 1. 生成查询向量
    const queryEmbedding = await generateEmbedding(query);
    
    // 2. 向量相似度搜索
    const results = await db.query(`
        SELECT 
            source_type,
            source_id,
            content,
            metadata,
            1 - (embedding <=> $1) as similarity
        FROM embeddings
        WHERE project_id = $2
        ORDER BY embedding <=> $1
        LIMIT $3
    `, [queryEmbedding, projectId, limit]);
    
    return results.rows;
}
```

## 7. 目录结构

```
inkflow-backend/
├── src/
│   ├── index.ts                 # 入口
│   ├── app.ts                   # Fastify 应用配置
│   ├── config/
│   │   ├── database.ts          # 数据库配置
│   │   ├── redis.ts             # Redis 配置
│   │   └── env.ts               # 环境变量
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.schema.ts
│   │   │   └── auth.routes.ts
│   │   ├── projects/
│   │   │   ├── projects.controller.ts
│   │   │   ├── projects.service.ts
│   │   │   └── projects.routes.ts
│   │   ├── chapters/
│   │   ├── plot-loops/
│   │   ├── characters/
│   │   ├── ai-proxy/
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── providers/
│   │   │   │   ├── gemini.ts
│   │   │   │   ├── openai.ts
│   │   │   │   └── deepseek.ts
│   │   │   └── ai.routes.ts
│   │   └── settings/
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   ├── rate-limit.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── utils/
│   │   │   ├── crypto.ts
│   │   │   ├── jwt.ts
│   │   │   └── validation.ts
│   │   └── types/
│   │       └── index.ts         # 与前端共享的类型
│   └── database/
│       ├── migrations/
│       └── seeds/
├── tests/
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

## 8. 部署方案

### 8.1 Docker Compose (开发/小规模)
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://inkflow:password@db:5432/inkflow
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - API_KEY_ENCRYPTION_KEY=${API_KEY_ENCRYPTION_KEY}
    depends_on:
      - db
      - redis

  db:
    image: pgvector/pgvector:pg16
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=inkflow
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=inkflow

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### 8.2 生产环境清单
- [ ] 使用托管数据库 (RDS/Cloud SQL)
- [ ] 配置 SSL/TLS 证书
- [ ] 设置 CDN 加速静态资源
- [ ] 配置日志收集 (ELK/CloudWatch)
- [ ] 设置监控告警 (Prometheus/Grafana)
- [ ] 配置自动备份
- [ ] 设置 CI/CD 流水线

## 9. 迁移计划

### Phase 1: API Key 代理 (1-2 周)
- 部署最小后端，仅实现 AI 代理功能
- 前端改为调用后端 API
- 用户 API Key 存储在后端

### Phase 2: 用户系统 (2-3 周)
- 实现注册/登录
- 项目与用户关联
- 前端保留 IndexedDB 作为离线缓存

### Phase 3: 云端存储 (2-3 周)
- 项目数据迁移到 PostgreSQL
- 实现数据同步机制
- 支持多设备访问

### Phase 4: 高级功能 (持续)
- RAG 向量检索优化
- 协作编辑
- 版本历史
- 数据分析

## 10. 成本估算 (月)

| 服务 | 规格 | 成本 |
|------|------|------|
| 云服务器 | 2C4G | ¥100-200 |
| PostgreSQL | 托管基础版 | ¥100-300 |
| Redis | 托管基础版 | ¥50-100 |
| 对象存储 | 按量 | ¥10-50 |
| CDN | 按量 | ¥20-100 |
| **总计** | | **¥280-750** |

*注：使用 Serverless 方案可进一步降低成本*

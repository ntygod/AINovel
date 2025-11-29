# 🔧 OpenAI 细纲格式问题修复

## 🐛 问题描述

使用 OpenAI 模型生成细纲时，返回的数据格式与预期不符，导致界面无法显示细纲。

### 返回的数据格式

OpenAI 返回了复杂的嵌套结构：

```json
{
  "beats": [
    {
      "id": "2-1",
      "title": "诡病初现：边城染灵",
      "summary": "灵气复苏前夜，边城各处陆续出现怪异...",
      "details": [
        "入夜边城风压低沉...",
        "城中医馆、衙门交叉视角..."
      ]
    },
    ...
  ]
}
```

### 预期的数据格式

应该是简单的字符串数组：

```json
[
  "主角登场，展示实力",
  "遇到强敌，陷入困境",
  "突破境界，反败为胜"
]
```

---

## ✅ 修复方案

### 1. 增强了响应解析逻辑

在 `services/geminiService.ts` 的 `generateChapterBeats` 函数中，添加了智能解析：

```typescript
// 处理复杂的嵌套结构
if (Array.isArray(parsed)) {
    // 处理对象数组
    if (parsed.length > 0 && typeof parsed[0] === 'object') {
        result = parsed.map((item: any) => {
            if (typeof item === 'string') return item;
            return item.summary || item.title || item.content || JSON.stringify(item);
        });
    }
} else if (parsed && typeof parsed === 'object') {
    // 处理 { beats: [...] } 格式
    if (parsed.beats && Array.isArray(parsed.beats)) {
        result = parsed.beats.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item.summary) return item.summary;
            if (item.title) return item.title;
            // ... 更多提取逻辑
        });
    }
}
```

### 2. 支持多种数据格式

现在可以正确处理：

✅ **简单字符串数组**
```json
["步骤1", "步骤2", "步骤3"]
```

✅ **对象数组（提取 summary）**
```json
[
  { "title": "标题1", "summary": "摘要1" },
  { "title": "标题2", "summary": "摘要2" }
]
```

✅ **嵌套结构（提取 beats 字段）**
```json
{
  "beats": [
    { "summary": "摘要1" },
    { "summary": "摘要2" }
  ]
}
```

✅ **带 details 的复杂结构**
```json
{
  "beats": [
    {
      "title": "标题",
      "summary": "摘要",
      "details": ["细节1", "细节2"]
    }
  ]
}
```

### 3. 字段提取优先级

提取字段的优先级顺序：
1. `summary` - 摘要（最优先）
2. `title` - 标题
3. `content` - 内容
4. `details` - 细节数组（合并成字符串）
5. 整个对象的 JSON 字符串（兜底）

---

## 🧪 测试方法

### 1. 刷新页面

```bash
# 在浏览器中按 Ctrl+R 或 F5
```

### 2. 重新生成细纲

1. 打开一个章节
2. 点击"AI 生成细纲"
3. 等待生成完成

### 3. 验证结果

**预期效果：**
- ✅ 能看到细纲列表
- ✅ 每个细纲项显示有意义的文本
- ✅ 可以编辑、添加、删除细纲项

---

## 🔍 调试方法

### 查看原始响应

在浏览器控制台（F12）中查看：

```javascript
// 生成细纲时会自动打印日志
// 如果解析失败，会显示：
// "解析后的细纲为空，原始响应: ..."
// "Raw response: ..."
```

### 手动测试解析逻辑

```javascript
// 在控制台执行
const testResponse = {
  "beats": [
    {
      "id": "2-1",
      "title": "标题1",
      "summary": "摘要1",
      "details": ["细节1", "细节2"]
    }
  ]
};

// 提取 summary
const result = testResponse.beats.map(item => item.summary);
console.log('提取结果:', result);
// 输出: ["摘要1"]
```

---

## 📊 不同 AI 模型的返回格式

### Google Gemini

✅ **严格遵守 JSON Schema**

```json
["步骤1", "步骤2", "步骤3"]
```

### OpenAI

⚠️ **可能返回复杂结构**

```json
{
  "beats": [
    { "summary": "步骤1" },
    { "summary": "步骤2" }
  ]
}
```

或

```json
[
  { "title": "步骤1", "content": "详细内容" },
  { "title": "步骤2", "content": "详细内容" }
]
```

### DeepSeek

⚠️ **格式不稳定**

可能返回字符串数组，也可能返回对象数组。

---

## 💡 优化建议

### 1. 改进 Prompt

如果想让 OpenAI 返回更简单的格式，可以修改 prompt：

```typescript
const systemPrompt = `你是一个专业的小说大纲设计师。
请严格按照以下格式返回 JSON 字符串数组：
["步骤1的简短描述", "步骤2的简短描述", "步骤3的简短描述"]

不要返回对象数组，不要嵌套结构，只返回纯字符串数组。`;
```

### 2. 使用 JSON Mode

OpenAI 的 JSON Mode 可以强制返回 JSON 格式：

```typescript
const res = await callOpenAI(
    settings.baseUrl || '',
    settings.apiKey,
    settings.model,
    [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
    ],
    true  // ✅ 启用 JSON Mode
);
```

### 3. 后处理简化

如果 AI 返回的内容太详细，可以在前端简化：

```typescript
// 限制每个细纲项的长度
result = result.map(item => 
    item.length > 100 ? item.slice(0, 100) + '...' : item
);
```

---

## 🎯 最佳实践

### 1. Prompt 设计

**好的 Prompt：**
```
为章节设计 5-8 个剧情细纲。
每个细纲用一句话概括（20-50字）。
返回 JSON 字符串数组格式。

示例：
["主角登场，展示实力", "遇到强敌，陷入困境"]
```

**不好的 Prompt：**
```
设计详细的剧情细纲，包括每个步骤的详细描述、人物对话、场景设置等。
```

### 2. 模型选择

| 模型 | 格式稳定性 | 推荐度 |
|------|-----------|--------|
| **Gemini 2.0 Flash** | ⭐⭐⭐⭐⭐ | 推荐 |
| **GPT-4o** | ⭐⭐⭐⭐ | 推荐 |
| **GPT-4o-mini** | ⭐⭐⭐⭐ | 推荐 |
| **DeepSeek** | ⭐⭐⭐ | 可用 |

### 3. 错误处理

始终添加降级处理：

```typescript
try {
    const beats = await generateChapterBeats(...);
    if (beats.length === 0) {
        // 降级：使用默认细纲
        return ["开始", "发展", "高潮", "结局"];
    }
    return beats;
} catch (e) {
    console.error('生成失败:', e);
    return [];
}
```

---

## 🔄 更新日志

### 2024-01-XX - 修复 OpenAI 细纲格式问题

- ✅ 添加了复杂嵌套结构的解析
- ✅ 支持多种数据格式
- ✅ 改进了字段提取逻辑
- ✅ 添加了详细的错误日志
- ✅ 增强了容错能力

---

## 🎉 总结

现在系统可以正确处理各种 AI 模型返回的细纲格式，包括：
- ✅ 简单字符串数组
- ✅ 对象数组
- ✅ 嵌套结构
- ✅ 复杂的 beats 格式

无论使用哪个 AI 提供商，都能正常显示细纲！

// 文本格式化工具 - 优化 AI 生成内容的排版

/**
 * 将 AI 生成的纯文本转换为格式良好的 HTML
 * 
 * 处理规则：
 * 1. 空行分隔段落
 * 2. 对话独立成段
 * 3. 场景转换（多个空行）保留
 * 4. 自动识别标题
 */
export function formatAIGeneratedText(text: string): string {
    if (!text) return '';
    
    // 1. 标准化换行符
    let formatted = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    // 2. 移除首尾空白
    formatted = formatted.trim();
    
    // 3. 处理多余的空行（超过2个连续空行压缩为2个）
    formatted = formatted.replace(/\n{4,}/g, '\n\n\n');
    
    // 4. 分割成段落（以空行为分隔）
    const paragraphs = formatted.split(/\n\n+/);
    
    // 5. 处理每个段落
    const processedParagraphs = paragraphs.map(para => {
        para = para.trim();
        if (!para) return '';
        
        // 检查是否是标题（短文本，没有标点，或以"第X章"开头）
        if (isTitle(para)) {
            return `<h2>${para}</h2>`;
        }
        
        // 检查是否是对话（以引号开头）
        if (isDialogue(para)) {
            return `<p class="dialogue">${para}</p>`;
        }
        
        // 普通段落
        return `<p>${para}</p>`;
    });
    
    // 6. 组合成 HTML
    return processedParagraphs.filter(p => p).join('\n');
}

/**
 * 判断是否是标题
 */
function isTitle(text: string): boolean {
    // 长度小于 30 字符
    if (text.length > 30) return false;
    
    // 以"第X章"、"第X节"等开头
    if (/^第[零一二三四五六七八九十百千万\d]+[章节回]/i.test(text)) {
        return true;
    }
    
    // 没有句号、问号、感叹号等句末标点
    if (!/[。！？.!?]/.test(text)) {
        return true;
    }
    
    return false;
}

/**
 * 判断是否是对话
 */
function isDialogue(text: string): boolean {
    // 以中文引号开头
    if (/^["「『"]/.test(text)) {
        return true;
    }
    
    // 包含对话引号
    if (/"[^"]*"/.test(text) || /「[^」]*」/.test(text)) {
        return true;
    }
    
    return false;
}

/**
 * 智能分段 - 将大段文字拆分成合理的段落
 * 
 * 规则：
 * 1. 每个句子后可能断行
 * 2. 对话独立成段
 * 3. 场景描写独立成段
 */
export function smartParagraphSplit(text: string): string {
    if (!text) return '';
    
    // 移除已有的段落标记
    let content = text.replace(/<\/?p[^>]*>/g, '').trim();
    
    // 按句子分割（中文句号、问号、感叹号）
    const sentences = content.split(/([。！？.!?]["」』]?\s*)/);
    
    const paragraphs: string[] = [];
    let currentParagraph: string[] = [];
    let sentenceCount = 0;
    
    for (let i = 0; i < sentences.length; i += 2) {
        const sentence = sentences[i];
        const punctuation = sentences[i + 1] || '';
        
        if (!sentence.trim()) continue;
        
        const fullSentence = sentence + punctuation;
        
        // 对话独立成段
        if (isDialogue(fullSentence)) {
            if (currentParagraph.length > 0) {
                paragraphs.push(currentParagraph.join(''));
                currentParagraph = [];
                sentenceCount = 0;
            }
            paragraphs.push(fullSentence.trim());
            continue;
        }
        
        // 累积句子
        currentParagraph.push(fullSentence);
        sentenceCount++;
        
        // 每 2-3 句话成一段
        if (sentenceCount >= 2 && Math.random() > 0.3) {
            paragraphs.push(currentParagraph.join(''));
            currentParagraph = [];
            sentenceCount = 0;
        }
    }
    
    // 处理剩余句子
    if (currentParagraph.length > 0) {
        paragraphs.push(currentParagraph.join(''));
    }
    
    // 转换为 HTML
    return paragraphs
        .filter(p => p.trim())
        .map(p => `<p>${p.trim()}</p>`)
        .join('\n');
}

/**
 * 清理和标准化 AI 生成的文本
 * 
 * 处理常见问题：
 * 1. 多余的空格
 * 2. 错误的标点
 * 3. 不一致的引号
 */
export function cleanAIText(text: string): string {
    if (!text) return '';
    
    let cleaned = text;
    
    // 1. 移除多余的空格
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // 2. 标准化引号（统一使用中文双引号）
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");
    
    // 3. 修复标点后的空格
    cleaned = cleaned.replace(/([，。！？；：])\s+/g, '$1');
    
    // 4. 移除段落开头的空格
    cleaned = cleaned.replace(/^\s+/gm, '');
    
    // 5. 确保句末标点
    cleaned = cleaned.replace(/([^。！？.!?])\n/g, '$1。\n');
    
    return cleaned;
}

/**
 * 为编辑器准备内容 - 组合所有格式化步骤
 */
export function prepareContentForEditor(rawText: string): string {
    // 1. 清理文本
    let content = cleanAIText(rawText);
    
    // 2. 格式化段落
    content = formatAIGeneratedText(content);
    
    // 3. 如果没有段落标记，进行智能分段
    if (!content.includes('<p>')) {
        content = smartParagraphSplit(content);
    }
    
    return content;
}

/**
 * 从 HTML 提取纯文本（用于字数统计等）
 */
export function stripHtmlTags(html: string): string {
    if (typeof document === 'undefined') {
        // 服务端环境，使用正则
        return html.replace(/<[^>]*>/g, '').trim();
    }
    
    // 浏览器环境，使用 DOM
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

/**
 * 计算文本字数（中文字符 + 英文单词）
 */
export function countWords(text: string): number {
    const plainText = stripHtmlTags(text);
    
    // 中文字符数
    const chineseChars = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length;
    
    // 英文单词数
    const englishWords = (plainText.match(/[a-zA-Z]+/g) || []).length;
    
    // 数字
    const numbers = (plainText.match(/\d+/g) || []).length;
    
    return chineseChars + englishWords + numbers;
}

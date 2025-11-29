// Token 使用监控和预算控制
export interface TokenUsageRecord {
    timestamp: number;
    input: number;
    output: number;
    cost: number;
    operation: string; // 'chapter_generation', 'chat', 'polish', etc.
}

export interface TokenStats {
    totalInput: number;
    totalOutput: number;
    totalCost: number;
    sessions: number;
    todayUsage: number;
}

export interface TokenBudget {
    dailyLimit: number;      // 每日 token 限制
    warningThreshold: number; // 警告阈值（百分比，如 0.8 表示 80%）
    enabled: boolean;
}

export class TokenCounter {
    private static instance: TokenCounter;
    private readonly STORAGE_KEY = 'inkflow_token_usage';
    private readonly DAILY_USAGE_KEY = 'inkflow_daily_token_usage';
    
    // Gemini 1.5 Pro 定价（美元/1K tokens）
    private readonly PRICING = {
        'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
        'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
        'gemini-2.0-flash-exp': { input: 0, output: 0 }, // 免费
        'gemini-exp-1206': { input: 0, output: 0 }, // 免费
        'default': { input: 0.00125, output: 0.005 }
    };
    
    private constructor() {}
    
    static getInstance(): TokenCounter {
        if (!this.instance) {
            this.instance = new TokenCounter();
        }
        return this.instance;
    }
    
    /**
     * 估算文本的 token 数量
     * 规则：中文 1 字 ≈ 1.5 tokens，英文 1 词 ≈ 1.3 tokens
     */
    estimateTokens(text: string): number {
        if (!text) return 0;
        
        const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
        const numbers = (text.match(/\d+/g) || []).length;
        
        return Math.ceil(chineseChars * 1.5 + englishWords * 1.3 + numbers * 0.5);
    }
    
    /**
     * 获取模型定价
     */
    private getPricing(model: string): { input: number; output: number } {
        // 尝试匹配模型名称
        for (const [key, pricing] of Object.entries(this.PRICING)) {
            if (model.includes(key)) {
                return pricing;
            }
        }
        return this.PRICING.default;
    }
    
    /**
     * 记录 token 使用
     */
    record(input: string, output: string, model: string, operation: string = 'unknown'): void {
        const inputTokens = this.estimateTokens(input);
        const outputTokens = this.estimateTokens(output);
        const pricing = this.getPricing(model);
        
        const inputCost = (inputTokens / 1000) * pricing.input;
        const outputCost = (outputTokens / 1000) * pricing.output;
        
        const record: TokenUsageRecord = {
            timestamp: Date.now(),
            input: inputTokens,
            output: outputTokens,
            cost: inputCost + outputCost,
            operation
        };
        
        // 保存到历史记录
        this.saveRecord(record);
        
        // 更新今日使用量
        this.updateDailyUsage(inputTokens + outputTokens);
    }
    
    /**
     * 保存使用记录
     */
    private saveRecord(record: TokenUsageRecord): void {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            const records: TokenUsageRecord[] = stored ? JSON.parse(stored) : [];
            
            // 只保留最近 1000 条记录
            records.push(record);
            if (records.length > 1000) {
                records.shift();
            }
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
        } catch (e) {
            console.error('Failed to save token usage record:', e);
        }
    }
    
    /**
     * 更新今日使用量
     */
    private updateDailyUsage(tokens: number): void {
        try {
            const today = new Date().toDateString();
            const stored = localStorage.getItem(this.DAILY_USAGE_KEY);
            const dailyUsage: Record<string, number> = stored ? JSON.parse(stored) : {};
            
            dailyUsage[today] = (dailyUsage[today] || 0) + tokens;
            
            // 只保留最近 30 天的数据
            const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
            Object.keys(dailyUsage).forEach(date => {
                if (new Date(date).getTime() < thirtyDaysAgo) {
                    delete dailyUsage[date];
                }
            });
            
            localStorage.setItem(this.DAILY_USAGE_KEY, JSON.stringify(dailyUsage));
        } catch (e) {
            console.error('Failed to update daily usage:', e);
        }
    }
    
    /**
     * 获取今日使用量
     */
    getTodayUsage(): number {
        try {
            const today = new Date().toDateString();
            const stored = localStorage.getItem(this.DAILY_USAGE_KEY);
            const dailyUsage: Record<string, number> = stored ? JSON.parse(stored) : {};
            return dailyUsage[today] || 0;
        } catch (e) {
            console.error('Failed to get today usage:', e);
            return 0;
        }
    }
    
    /**
     * 获取统计信息
     */
    getStats(): TokenStats {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            const records: TokenUsageRecord[] = stored ? JSON.parse(stored) : [];
            
            const total = records.reduce((acc, r) => ({
                input: acc.input + r.input,
                output: acc.output + r.output,
                cost: acc.cost + r.cost
            }), { input: 0, output: 0, cost: 0 });
            
            return {
                totalInput: total.input,
                totalOutput: total.output,
                totalCost: parseFloat(total.cost.toFixed(4)),
                sessions: records.length,
                todayUsage: this.getTodayUsage()
            };
        } catch (e) {
            console.error('Failed to get stats:', e);
            return {
                totalInput: 0,
                totalOutput: 0,
                totalCost: 0,
                sessions: 0,
                todayUsage: 0
            };
        }
    }
    
    /**
     * 检查是否超出预算
     */
    async checkBudget(estimatedTokens: number, budget?: TokenBudget): Promise<boolean> {
        if (!budget || !budget.enabled) return true;
        
        const todayUsage = this.getTodayUsage();
        const projectedUsage = todayUsage + estimatedTokens;
        
        // 超出限制
        if (projectedUsage > budget.dailyLimit) {
            const confirmed = confirm(
                `⚠️ Token 预算警告\n\n` +
                `今日已使用：${todayUsage.toLocaleString()} tokens\n` +
                `每日限制：${budget.dailyLimit.toLocaleString()} tokens\n` +
                `本次预计：${estimatedTokens.toLocaleString()} tokens\n` +
                `预计总计：${projectedUsage.toLocaleString()} tokens\n\n` +
                `将超出每日限制！是否继续？`
            );
            return confirmed;
        }
        
        // 达到警告阈值
        if (projectedUsage > budget.dailyLimit * budget.warningThreshold && todayUsage <= budget.dailyLimit * budget.warningThreshold) {
            console.warn(
                `⚠️ Token 使用已达到 ${(budget.warningThreshold * 100).toFixed(0)}% 阈值\n` +
                `今日使用：${todayUsage.toLocaleString()} / ${budget.dailyLimit.toLocaleString()}`
            );
        }
        
        return true;
    }
    
    /**
     * 清除所有记录
     */
    clearAll(): void {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.DAILY_USAGE_KEY);
    }
    
    /**
     * 导出使用记录（用于分析）
     */
    exportRecords(): TokenUsageRecord[] {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('Failed to export records:', e);
            return [];
        }
    }
}

// 导出单例实例
export const tokenCounter = TokenCounter.getInstance();

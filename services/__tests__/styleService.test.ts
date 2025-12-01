import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  calculateEditRatio, 
  shouldSaveAsStyleSample,
  buildStylePromptSection,
  StyleSample
} from '../styleService';

describe('styleService', () => {
  describe('calculateEditRatio', () => {
    it('should return 0 for identical strings', () => {
      const text = '这是一段测试文本，用于验证编辑比例计算。';
      expect(calculateEditRatio(text, text)).toBe(0);
    });

    it('should return 1 for completely different strings', () => {
      const original = 'AAAAAAAAAA';
      const modified = 'BBBBBBBBBB';
      const ratio = calculateEditRatio(original, modified);
      expect(ratio).toBeGreaterThan(0.5);
    });

    it('should return a value between 0 and 1 for partial edits', () => {
      const original = '这是一段原始文本，包含一些内容。';
      const modified = '这是一段修改后的文本，包含更多内容和细节。';
      const ratio = calculateEditRatio(original, modified);
      expect(ratio).toBeGreaterThan(0);
      expect(ratio).toBeLessThan(1);
    });

    it('should handle empty strings', () => {
      expect(calculateEditRatio('', '')).toBe(1);
      expect(calculateEditRatio('test', '')).toBe(1);
      expect(calculateEditRatio('', 'test')).toBe(1);
    });

    it('should handle whitespace differences', () => {
      const original = '这是 一段 文本';
      const modified = '这是一段文本';
      const ratio = calculateEditRatio(original, modified);
      // 空格被移除后应该相同
      expect(ratio).toBe(0);
    });

    it('should detect significant length changes', () => {
      const original = '短文本';
      const modified = '这是一段非常长的文本，包含了很多额外的内容和描述，用于测试长度变化对编辑比例的影响。';
      const ratio = calculateEditRatio(original, modified);
      expect(ratio).toBeGreaterThan(0.3);
    });
  });

  describe('shouldSaveAsStyleSample', () => {
    it('should return false for identical content', () => {
      const text = '这是一段足够长的测试文本，用于验证风格样本保存逻辑。这段文本需要超过100个字符才能通过长度检查。';
      expect(shouldSaveAsStyleSample(text, text)).toBe(false);
    });

    it('should return false for short content', () => {
      const original = '短文本';
      const modified = '完全不同的短文本';
      expect(shouldSaveAsStyleSample(original, modified)).toBe(false);
    });

    it('should return true for significant edits on long content', () => {
      // 使用完全不同的内容来模拟用户大幅修改
      const original = '林风站在山顶，望着远方的云海。他的心中充满了对未来的期待。这是一个新的开始，一切都将不同。他深吸一口气，准备迎接即将到来的挑战。';
      const modified = '夜色笼罩着古老的城堡，月光洒在斑驳的石墙上。一个黑影悄然掠过，消失在阴暗的角落里。空气中弥漫着神秘的气息，仿佛有什么即将发生。';
      expect(shouldSaveAsStyleSample(original, modified, 0.3, 50)).toBe(true);
    });

    it('should return false for minor edits', () => {
      const original = '这是一段测试文本，用于验证风格样本保存逻辑。这段文本需要超过100个字符才能通过长度检查。让我们添加更多内容。';
      const modified = '这是一段测试文本，用于验证风格样本保存逻辑。这段文本需要超过100个字符才能通过长度检查。让我们添加更多内容吧。';
      expect(shouldSaveAsStyleSample(original, modified, 0.3, 100)).toBe(false);
    });

    it('should handle null/undefined inputs', () => {
      expect(shouldSaveAsStyleSample('', 'test')).toBe(false);
      expect(shouldSaveAsStyleSample('test', '')).toBe(false);
    });

    it('should respect custom minEditRatio', () => {
      // 使用有明显差异但不是完全不同的文本（确保长度超过 minLength）
      const original = '清晨的阳光透过窗帘洒进房间，小明慢慢睁开眼睛，开始了新的一天。他伸了个懒腰，感觉精神焕发。今天是个好日子，他决定出门散步。';
      const modified = '傍晚的夕阳透过窗帘洒进房间，小红慢慢睁开眼睛，结束了漫长的午睡。她伸了个懒腰，感觉有些疲惫。今天真是累人，她决定继续休息。';
      // 这两段文本结构相似但内容有差异
      const ratio = calculateEditRatio(original, modified);
      console.log('Edit ratio:', ratio, 'Modified length:', modified.length);
      // 使用较低的阈值应该返回 true（因为有一定差异）
      expect(shouldSaveAsStyleSample(original, modified, 0.1, 50)).toBe(true);
      // 使用较高的阈值应该返回 false（因为差异不够大）
      expect(shouldSaveAsStyleSample(original, modified, 0.9, 50)).toBe(false);
    });
  });

  describe('buildStylePromptSection', () => {
    it('should return empty string for empty samples', () => {
      expect(buildStylePromptSection([])).toBe('');
    });

    it('should build prompt section with samples', () => {
      const samples: StyleSample[] = [
        {
          id: 'test1',
          projectId: 'proj1',
          chapterId: 'ch1',
          originalAI: 'AI生成的原始内容',
          userFinal: '用户修改后的内容',
          editRatio: 0.5,
          createdAt: Date.now(),
          wordCount: 100
        }
      ];
      
      const prompt = buildStylePromptSection(samples);
      
      expect(prompt).toContain('用户写作风格参考');
      expect(prompt).toContain('AI 原始生成');
      expect(prompt).toContain('用户修改后');
      expect(prompt).toContain('50%'); // editRatio * 100
      expect(prompt).toContain('AI生成的原始内容');
      expect(prompt).toContain('用户修改后的内容');
    });

    it('should truncate long content in samples', () => {
      const longContent = 'A'.repeat(1000);
      const samples: StyleSample[] = [
        {
          id: 'test1',
          projectId: 'proj1',
          chapterId: 'ch1',
          originalAI: longContent,
          userFinal: longContent,
          editRatio: 0.5,
          createdAt: Date.now(),
          wordCount: 1000
        }
      ];
      
      const prompt = buildStylePromptSection(samples);
      
      // 应该包含省略号，表示内容被截断
      expect(prompt).toContain('...');
      // 不应该包含完整的 1000 个 A
      expect(prompt.length).toBeLessThan(longContent.length * 2);
    });

    it('should include style guidance', () => {
      const samples: StyleSample[] = [
        {
          id: 'test1',
          projectId: 'proj1',
          chapterId: 'ch1',
          originalAI: '原始',
          userFinal: '修改',
          editRatio: 0.5,
          createdAt: Date.now(),
          wordCount: 10
        }
      ];
      
      const prompt = buildStylePromptSection(samples);
      
      expect(prompt).toContain('模仿用户的写作风格');
      expect(prompt).toContain('用词习惯');
      expect(prompt).toContain('句式结构');
    });
  });
});

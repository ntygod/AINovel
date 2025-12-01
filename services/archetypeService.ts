import { CharacterArchetype, Volume, Chapter } from '../types';

/**
 * 角色原型服务
 * 提供预设角色原型和基于原型的 prompt 构建功能
 */

// 生成上下文接口
export interface GenerationContext {
  volume?: Volume;
  chapter?: Chapter;
  additionalContext?: string;
}

// 预设角色原型列表 (至少 6 种)
export const CHARACTER_ARCHETYPES: CharacterArchetype[] = [
  {
    id: 'stepping-stone',
    name: '垫脚石',
    description: '用于展示主角实力的小反派，通常傲慢自大，最终被主角击败',
    defaultMotivation: '嫉妒主角或贪图利益，想要打压或消灭主角',
    defaultNarrativeFunction: '被主角击败，展示主角成长和实力提升',
    suggestedSpeakingStyles: ['傲慢', '轻蔑', '嘲讽', '自大'],
    icon: '🪨'
  },
  {
    id: 'old-grandpa',
    name: '老爷爷',
    description: '隐藏实力的神秘老者，通常是主角的贵人或导师',
    defaultMotivation: '传承衣钵，寻找合适的继承人',
    defaultNarrativeFunction: '给予主角机缘、传授功法或提供关键信息',
    suggestedSpeakingStyles: ['慈祥', '神秘', '高深莫测', '语重心长'],
    icon: '👴'
  },
  {
    id: 'love-hate',
    name: '欢喜冤家',
    description: '与主角初期有冲突但逐渐发展感情的角色，常见于女主或重要配角',
    defaultMotivation: '最初因误会或立场对立与主角冲突，后被主角魅力吸引',
    defaultNarrativeFunction: '制造情感张力，丰富主角的人际关系',
    suggestedSpeakingStyles: ['傲娇', '毒舌', '口是心非', '别扭'],
    icon: '💕'
  },
  {
    id: 'informant',
    name: '线人',
    description: '为主角提供情报和消息的角色，通常神出鬼没',
    defaultMotivation: '利益交换或对主角有好感，愿意分享信息',
    defaultNarrativeFunction: '推动剧情发展，为主角提供关键情报',
    suggestedSpeakingStyles: ['神秘', '谨慎', '暗示性', '简洁'],
    icon: '🕵️'
  },
  {
    id: 'gatekeeper',
    name: '守门人',
    description: '阻挡主角前进的障碍角色，可能是考验者或敌人',
    defaultMotivation: '守护某物或执行职责，不允许外人通过',
    defaultNarrativeFunction: '设置障碍，考验主角实力或智慧',
    suggestedSpeakingStyles: ['严肃', '冷漠', '公事公办', '威严'],
    icon: '🚧'
  },
  {
    id: 'sacrifice',
    name: '牺牲者',
    description: '为保护主角或推动剧情而牺牲的角色，通常与主角有深厚感情',
    defaultMotivation: '保护所爱之人或坚守信念',
    defaultNarrativeFunction: '激发主角成长动力，制造情感高潮',
    suggestedSpeakingStyles: ['温柔', '坚定', '无悔', '深情'],
    icon: '🕯️'
  },
  {
    id: 'comic-relief',
    name: '搞笑担当',
    description: '负责调节气氛的角色，通常是主角的朋友或跟班',
    defaultMotivation: '追随主角，享受冒险生活',
    defaultNarrativeFunction: '缓解紧张气氛，增加故事趣味性',
    suggestedSpeakingStyles: ['幽默', '夸张', '自嘲', '乐观'],
    icon: '🤡'
  },
  {
    id: 'rival',
    name: '宿敌',
    description: '与主角实力相当的竞争对手，既是敌人也是激励者',
    defaultMotivation: '超越主角，证明自己的价值',
    defaultNarrativeFunction: '激励主角成长，制造紧张对抗',
    suggestedSpeakingStyles: ['高傲', '认真', '竞争性', '不服输'],
    icon: '⚔️'
  }
];

/**
 * 获取所有角色原型
 */
export function getArchetypes(): CharacterArchetype[] {
  return CHARACTER_ARCHETYPES;
}

/**
 * 根据 ID 获取角色原型
 */
export function getArchetypeById(id: string): CharacterArchetype | undefined {
  return CHARACTER_ARCHETYPES.find(archetype => archetype.id === id);
}

/**
 * 基于原型和上下文构建角色生成 prompt
 */
export function buildPromptFromArchetype(
  archetype: CharacterArchetype,
  context: GenerationContext
): string {
  const parts: string[] = [];

  // 原型基础信息
  parts.push(`【角色原型】${archetype.name}`);
  parts.push(`原型描述：${archetype.description}`);
  parts.push(`默认动机：${archetype.defaultMotivation}`);
  parts.push(`叙事功能：${archetype.defaultNarrativeFunction}`);
  parts.push(`建议对话风格：${archetype.suggestedSpeakingStyles.join('、')}`);

  // 分卷上下文
  if (context.volume) {
    parts.push('');
    parts.push(`【分卷上下文】${context.volume.title}`);
    if (context.volume.coreConflict) {
      parts.push(`核心冲突：${context.volume.coreConflict}`);
    }
    if (context.volume.summary) {
      parts.push(`分卷摘要：${context.volume.summary}`);
    }
  }

  // 章节上下文
  if (context.chapter) {
    parts.push('');
    parts.push(`【章节上下文】${context.chapter.title}`);
    if (context.chapter.summary) {
      parts.push(`章节摘要：${context.chapter.summary}`);
    }
  }

  // 额外上下文
  if (context.additionalContext) {
    parts.push('');
    parts.push(`【额外要求】${context.additionalContext}`);
  }

  // 生成指导
  parts.push('');
  parts.push('【生成要求】');
  parts.push('请基于以上原型和上下文，生成一个符合当前剧情需要的角色。');
  parts.push('角色应该：');
  parts.push(`1. 符合"${archetype.name}"原型的基本特征`);
  parts.push('2. 与当前剧情上下文紧密关联');
  parts.push('3. 具有独特的个性和说话风格');
  parts.push('4. 有明确的动机和叙事功能');

  return parts.join('\n');
}

/**
 * Wiki 增强服务
 * 
 * 实现三个核心功能：
 * 1. 别名系统 (Alias System) - 支持多称谓检索
 * 2. 时间切片 (Time Slicing) - 支持非线性编辑
 * 3. 关联图谱 (Wiki Relationships) - 支持条目间关系
 */

import { WikiEntry, WikiRelationType, WikiRelationship, WikiHistoryEntry, Chapter } from '../types';

// ============================================
// 1. 别名系统 (Alias System)
// ============================================

/**
 * 为 Wiki 条目添加别名
 */
export function addAlias(entry: WikiEntry, alias: string): WikiEntry {
  const aliases = entry.aliases || [];
  if (!aliases.includes(alias) && alias !== entry.name) {
    return { ...entry, aliases: [...aliases, alias] };
  }
  return entry;
}

/**
 * 移除 Wiki 条目的别名
 */
export function removeAlias(entry: WikiEntry, alias: string): WikiEntry {
  const aliases = entry.aliases || [];
  return { ...entry, aliases: aliases.filter(a => a !== alias) };
}

/**
 * 获取 Wiki 条目的所有名称（包括主名称和别名）
 */
export function getAllNames(entry: WikiEntry): string[] {
  return [entry.name, ...(entry.aliases || [])];
}

/**
 * 检查文本是否包含 Wiki 条目（支持别名匹配）
 */
export function matchesEntry(text: string, entry: WikiEntry): boolean {
  const allNames = getAllNames(entry);
  return allNames.some(name => name.length > 1 && text.includes(name));
}

/**
 * 在文本中查找所有匹配的 Wiki 条目（支持别名）
 */
export function findMatchingEntries(text: string, entries: WikiEntry[]): WikiEntry[] {
  return entries.filter(entry => matchesEntry(text, entry));
}

/**
 * 构建别名索引（用于快速查找）
 * 返回从别名到 Wiki 条目 ID 的映射
 */
export function buildAliasIndex(entries: WikiEntry[]): Map<string, string> {
  const index = new Map<string, string>();
  
  for (const entry of entries) {
    // 主名称
    index.set(entry.name, entry.id);
    // 别名
    for (const alias of entry.aliases || []) {
      index.set(alias, entry.id);
    }
  }
  
  return index;
}

/**
 * 通过名称或别名查找 Wiki 条目
 */
export function findEntryByNameOrAlias(
  nameOrAlias: string, 
  entries: WikiEntry[]
): WikiEntry | undefined {
  return entries.find(entry => {
    if (entry.name === nameOrAlias) return true;
    return entry.aliases?.includes(nameOrAlias);
  });
}

// ============================================
// 2. 时间切片 (Time Slicing)
// ============================================

/**
 * 添加历史版本
 */
export function addHistoryEntry(
  entry: WikiEntry,
  chapterId: string,
  chapterOrder: number,
  content: string,
  changeNote?: string
): WikiEntry {
  const history = entry.history || [];
  
  // 检查是否已有该章节的历史记录
  const existingIndex = history.findIndex(h => h.chapterId === chapterId);
  
  const newHistoryEntry: WikiHistoryEntry = {
    chapterId,
    chapterOrder,
    content,
    timestamp: Date.now(),
    changeNote,
  };
  
  let newHistory: WikiHistoryEntry[];
  if (existingIndex >= 0) {
    // 更新现有记录
    newHistory = [...history];
    newHistory[existingIndex] = newHistoryEntry;
  } else {
    // 添加新记录
    newHistory = [...history, newHistoryEntry];
  }
  
  // 按章节顺序排序
  newHistory.sort((a, b) => a.chapterOrder - b.chapterOrder);
  
  return { ...entry, history: newHistory };
}

/**
 * 获取指定章节时间点的 Wiki 描述
 * 返回该章节之前（含）最近的历史版本
 */
export function getDescriptionAtChapter(
  entry: WikiEntry,
  chapterOrder: number
): string {
  const history = entry.history || [];
  
  if (history.length === 0) {
    return entry.description;
  }
  
  // 找到该章节之前（含）最近的历史版本
  let latestVersion: WikiHistoryEntry | null = null;
  
  for (const h of history) {
    if (h.chapterOrder <= chapterOrder) {
      if (!latestVersion || h.chapterOrder > latestVersion.chapterOrder) {
        latestVersion = h;
      }
    }
  }
  
  return latestVersion ? latestVersion.content : entry.description;
}

/**
 * 获取 Wiki 条目的时间线
 * 返回所有历史版本的摘要
 */
export function getHistoryTimeline(entry: WikiEntry): {
  chapterOrder: number;
  chapterId: string;
  changeNote?: string;
  timestamp: number;
}[] {
  return (entry.history || []).map(h => ({
    chapterOrder: h.chapterOrder,
    chapterId: h.chapterId,
    changeNote: h.changeNote,
    timestamp: h.timestamp,
  }));
}

/**
 * 清理过期的历史版本（保留最近 N 个）
 */
export function pruneHistory(entry: WikiEntry, keepCount: number = 10): WikiEntry {
  const history = entry.history || [];
  
  if (history.length <= keepCount) {
    return entry;
  }
  
  // 保留最近的 N 个版本
  const prunedHistory = history.slice(-keepCount);
  
  return { ...entry, history: prunedHistory };
}

// ============================================
// 3. 关联图谱 (Wiki Relationships)
// ============================================

/**
 * 添加 Wiki 关联关系
 */
export function addRelationship(
  entry: WikiEntry,
  targetId: string,
  relation: WikiRelationType,
  description?: string
): WikiEntry {
  const relationships = entry.relationships || [];
  
  // 检查是否已存在相同关系
  const existingIndex = relationships.findIndex(
    r => r.targetId === targetId && r.relation === relation
  );
  
  if (existingIndex >= 0) {
    // 更新现有关系
    const newRelationships = [...relationships];
    newRelationships[existingIndex] = { targetId, relation, description };
    return { ...entry, relationships: newRelationships };
  }
  
  // 添加新关系
  return {
    ...entry,
    relationships: [...relationships, { targetId, relation, description }],
  };
}

/**
 * 移除 Wiki 关联关系
 */
export function removeRelationship(
  entry: WikiEntry,
  targetId: string,
  relation?: WikiRelationType
): WikiEntry {
  const relationships = entry.relationships || [];
  
  const filtered = relationships.filter(r => {
    if (relation) {
      return !(r.targetId === targetId && r.relation === relation);
    }
    return r.targetId !== targetId;
  });
  
  return { ...entry, relationships: filtered };
}

/**
 * 获取 Wiki 条目的所有关联条目
 */
export function getRelatedEntries(
  entry: WikiEntry,
  allEntries: WikiEntry[],
  relationFilter?: WikiRelationType
): { entry: WikiEntry; relation: WikiRelationType; description?: string }[] {
  const relationships = entry.relationships || [];
  const entryMap = new Map(allEntries.map(e => [e.id, e]));
  
  return relationships
    .filter(r => !relationFilter || r.relation === relationFilter)
    .map(r => ({
      entry: entryMap.get(r.targetId)!,
      relation: r.relation,
      description: r.description,
    }))
    .filter(r => r.entry !== undefined);
}

/**
 * 获取指向某个 Wiki 条目的所有反向关联
 */
export function getIncomingRelationships(
  targetId: string,
  allEntries: WikiEntry[]
): { entry: WikiEntry; relation: WikiRelationType; description?: string }[] {
  const results: { entry: WikiEntry; relation: WikiRelationType; description?: string }[] = [];
  
  for (const entry of allEntries) {
    const relationships = entry.relationships || [];
    for (const rel of relationships) {
      if (rel.targetId === targetId) {
        results.push({
          entry,
          relation: rel.relation,
          description: rel.description,
        });
      }
    }
  }
  
  return results;
}

/**
 * 构建 Wiki 关联图谱索引
 */
export function buildRelationshipGraph(
  entries: WikiEntry[]
): Map<string, { outgoing: WikiRelationship[]; incoming: WikiRelationship[] }> {
  const graph = new Map<string, { outgoing: WikiRelationship[]; incoming: WikiRelationship[] }>();
  
  // 初始化所有节点
  for (const entry of entries) {
    graph.set(entry.id, { outgoing: [], incoming: [] });
  }
  
  // 构建边
  for (const entry of entries) {
    const relationships = entry.relationships || [];
    const node = graph.get(entry.id)!;
    node.outgoing = relationships;
    
    // 添加反向边
    for (const rel of relationships) {
      const targetNode = graph.get(rel.targetId);
      if (targetNode) {
        targetNode.incoming.push({
          targetId: entry.id,
          relation: rel.relation,
          description: rel.description,
        });
      }
    }
  }
  
  return graph;
}

/**
 * 获取关系类型的中文描述
 */
export function getRelationTypeLabel(relation: WikiRelationType): string {
  const labels: Record<WikiRelationType, string> = {
    belongs_to: '属于',
    part_of: '是...的一部分',
    created_by: '由...创造',
    located_in: '位于',
    related_to: '相关',
  };
  return labels[relation] || relation;
}

/**
 * 获取反向关系类型的中文描述
 */
export function getInverseRelationLabel(relation: WikiRelationType): string {
  const labels: Record<WikiRelationType, string> = {
    belongs_to: '拥有',
    part_of: '包含',
    created_by: '创造了',
    located_in: '包含',
    related_to: '相关',
  };
  return labels[relation] || relation;
}

// ============================================
// 综合功能
// ============================================

/**
 * 增强版 Wiki 检索
 * 结合别名匹配、时间切片和关联扩展
 */
export function enhancedWikiRetrieval(
  query: string,
  entries: WikiEntry[],
  currentChapterOrder?: number,
  expandRelations: boolean = true
): {
  entry: WikiEntry;
  matchedName: string;
  description: string;
  relatedEntries?: WikiEntry[];
}[] {
  const results: {
    entry: WikiEntry;
    matchedName: string;
    description: string;
    relatedEntries?: WikiEntry[];
  }[] = [];
  
  const aliasIndex = buildAliasIndex(entries);
  const entryMap = new Map(entries.map(e => [e.id, e]));
  
  // 查找匹配的条目
  for (const entry of entries) {
    const allNames = getAllNames(entry);
    const matchedName = allNames.find(name => name.length > 1 && query.includes(name));
    
    if (matchedName) {
      // 获取时间切片后的描述
      const description = currentChapterOrder !== undefined
        ? getDescriptionAtChapter(entry, currentChapterOrder)
        : entry.description;
      
      // 获取关联条目
      let relatedEntries: WikiEntry[] | undefined;
      if (expandRelations) {
        const related = getRelatedEntries(entry, entries);
        relatedEntries = related.map(r => r.entry);
      }
      
      results.push({
        entry,
        matchedName,
        description,
        relatedEntries,
      });
    }
  }
  
  return results;
}

/**
 * 生成 Wiki 条目的上下文提示词
 * 用于 AI 生成时注入
 */
export function buildWikiContextPrompt(
  entries: WikiEntry[],
  currentChapterOrder?: number
): string {
  if (entries.length === 0) return '';
  
  const lines: string[] = ['## 相关设定 (Wiki)'];
  
  for (const entry of entries) {
    const description = currentChapterOrder !== undefined
      ? getDescriptionAtChapter(entry, currentChapterOrder)
      : entry.description;
    
    const aliases = entry.aliases?.length 
      ? `（又名：${entry.aliases.join('、')}）` 
      : '';
    
    lines.push(`【${entry.category}】${entry.name}${aliases}: ${description}`);
    
    // 添加关联信息
    if (entry.relationships?.length) {
      const relatedNames = entry.relationships
        .map(r => {
          const target = entries.find(e => e.id === r.targetId);
          return target ? `${getRelationTypeLabel(r.relation)} ${target.name}` : null;
        })
        .filter(Boolean);
      
      if (relatedNames.length > 0) {
        lines.push(`  关联: ${relatedNames.join(', ')}`);
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * 自动检测并记录 Wiki 变更
 * 当描述发生变化时，自动添加历史版本
 */
export function autoRecordHistory(
  oldEntry: WikiEntry,
  newEntry: WikiEntry,
  currentChapter: Chapter
): WikiEntry {
  // 如果描述没有变化，直接返回
  if (oldEntry.description === newEntry.description) {
    return newEntry;
  }
  
  // 添加历史记录
  return addHistoryEntry(
    newEntry,
    currentChapter.id,
    currentChapter.order,
    newEntry.description,
    `第 ${currentChapter.order} 章更新`
  );
}

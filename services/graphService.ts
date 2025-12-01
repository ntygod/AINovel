/**
 * 深度图谱检索服务 (Graph RAG)
 * 
 * 实现多层关系遍历，捕捉深层人物纠葛
 * 
 * 核心功能：
 * 1. BFS 遍历关系图谱，支持配置检索深度
 * 2. 关系类型加权（仇人 > 朋友 > 路人）
 * 3. 距离衰减（越远的关系权重越低）
 */

import { Character, CharacterRelationship } from '../types';

/**
 * 关系类型权重配置
 * 权重越高，表示该关系越重要
 */
export const RELATION_WEIGHTS: Record<string, number> = {
  // 高权重关系（0.9-1.0）- 核心冲突关系
  '仇人': 1.0,
  '死敌': 1.0,
  '宿敌': 1.0,
  '杀父仇人': 1.0,
  '灭门仇人': 1.0,
  
  // 较高权重（0.7-0.9）- 重要情感关系
  '爱人': 0.9,
  '恋人': 0.9,
  '妻子': 0.9,
  '丈夫': 0.9,
  '父亲': 0.85,
  '母亲': 0.85,
  '儿子': 0.85,
  '女儿': 0.85,
  '师父': 0.85,
  '徒弟': 0.85,
  '兄弟': 0.8,
  '姐妹': 0.8,
  '挚友': 0.8,
  '生死之交': 0.8,
  
  // 中等权重（0.5-0.7）- 一般关系
  '朋友': 0.6,
  '同门': 0.6,
  '同伴': 0.6,
  '盟友': 0.65,
  '合作者': 0.55,
  '上司': 0.5,
  '下属': 0.5,
  '同事': 0.45,
  
  // 较低权重（0.3-0.5）- 弱关系
  '认识': 0.3,
  '熟人': 0.35,
  '邻居': 0.3,
  '路人': 0.2,
  '陌生人': 0.1,
  
  // 特殊关系
  '暗恋': 0.7,
  '单相思': 0.7,
  '竞争对手': 0.75,
  '情敌': 0.8,
  '前任': 0.6,
};

/**
 * 默认关系权重（未知关系类型）
 */
const DEFAULT_RELATION_WEIGHT = 0.5;

/**
 * 获取关系权重
 */
export function getRelationWeight(relation: string): number {
  // 精确匹配
  if (RELATION_WEIGHTS[relation]) {
    return RELATION_WEIGHTS[relation];
  }
  
  // 模糊匹配
  const lowerRelation = relation.toLowerCase();
  for (const [key, weight] of Object.entries(RELATION_WEIGHTS)) {
    if (lowerRelation.includes(key) || key.includes(lowerRelation)) {
      return weight;
    }
  }
  
  // 根据关系描述中的关键词推断
  if (lowerRelation.includes('仇') || lowerRelation.includes('敌')) {
    return 0.9;
  }
  if (lowerRelation.includes('爱') || lowerRelation.includes('恋')) {
    return 0.85;
  }
  if (lowerRelation.includes('父') || lowerRelation.includes('母') || 
      lowerRelation.includes('子') || lowerRelation.includes('女')) {
    return 0.8;
  }
  if (lowerRelation.includes('友') || lowerRelation.includes('伴')) {
    return 0.6;
  }
  
  return DEFAULT_RELATION_WEIGHT;
}

/**
 * 图谱节点（用于 BFS 遍历）
 */
interface GraphNode {
  character: Character;
  depth: number;           // 距离起始节点的深度
  pathWeight: number;      // 路径累积权重
  path: string[];          // 到达该节点的路径（角色 ID 列表）
  relationChain: string[]; // 关系链描述
}

/**
 * 图谱检索结果
 */
export interface GraphRetrievalResult {
  character: Character;
  depth: number;
  pathWeight: number;
  relationChain: string[];
  relevanceScore: number;  // 综合相关性分数
}

/**
 * 深度图谱检索配置
 */
export interface GraphRetrievalConfig {
  maxDepth: number;        // 最大遍历深度（默认 2）
  depthDecay: number;      // 深度衰减系数（默认 0.6）
  minPathWeight: number;   // 最小路径权重阈值（默认 0.1）
  includeStartNodes: boolean; // 是否包含起始节点（默认 true）
}

const DEFAULT_CONFIG: GraphRetrievalConfig = {
  maxDepth: 2,
  depthDecay: 0.6,
  minPathWeight: 0.1,
  includeStartNodes: true,
};

/**
 * 构建角色关系图谱索引
 * 返回一个从角色 ID 到其关系列表的映射
 */
export function buildRelationshipIndex(
  characters: Character[]
): Map<string, { targetId: string; relation: string; weight: number }[]> {
  const index = new Map<string, { targetId: string; relation: string; weight: number }[]>();
  
  for (const character of characters) {
    const relationships = (character.relationships || []).map(rel => ({
      targetId: rel.targetId,
      relation: rel.relation,
      weight: getRelationWeight(rel.relation),
    }));
    index.set(character.id, relationships);
  }
  
  return index;
}

/**
 * 深度图谱检索（BFS 实现）
 * 
 * @param startCharacterIds - 起始角色 ID 列表
 * @param allCharacters - 所有角色
 * @param config - 检索配置
 * @returns 按相关性排序的角色列表
 */
export function retrieveWithGraph(
  startCharacterIds: string[],
  allCharacters: Character[],
  config: Partial<GraphRetrievalConfig> = {}
): GraphRetrievalResult[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxDepth, depthDecay, minPathWeight, includeStartNodes } = finalConfig;
  
  if (startCharacterIds.length === 0 || allCharacters.length === 0) {
    return [];
  }
  
  // 构建角色 ID 到角色对象的映射
  const characterMap = new Map<string, Character>();
  for (const char of allCharacters) {
    characterMap.set(char.id, char);
  }
  
  // 构建关系索引
  const relationIndex = buildRelationshipIndex(allCharacters);
  
  // BFS 遍历
  const visited = new Set<string>();
  const results: GraphRetrievalResult[] = [];
  const queue: GraphNode[] = [];
  
  // 初始化队列：添加起始节点
  for (const startId of startCharacterIds) {
    const startChar = characterMap.get(startId);
    if (startChar && !visited.has(startId)) {
      visited.add(startId);
      
      if (includeStartNodes) {
        results.push({
          character: startChar,
          depth: 0,
          pathWeight: 1.0,
          relationChain: [],
          relevanceScore: 1.0,
        });
      }
      
      queue.push({
        character: startChar,
        depth: 0,
        pathWeight: 1.0,
        path: [startId],
        relationChain: [],
      });
    }
  }
  
  // BFS 遍历
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    // 如果已达到最大深度，跳过
    if (current.depth >= maxDepth) {
      continue;
    }
    
    // 获取当前角色的关系
    const relationships = relationIndex.get(current.character.id) || [];
    
    for (const rel of relationships) {
      // 跳过已访问的节点
      if (visited.has(rel.targetId)) {
        continue;
      }
      
      const targetChar = characterMap.get(rel.targetId);
      if (!targetChar) {
        continue;
      }
      
      // 计算新的路径权重（考虑深度衰减）
      const newPathWeight = current.pathWeight * rel.weight * depthDecay;
      
      // 如果路径权重太低，跳过
      if (newPathWeight < minPathWeight) {
        continue;
      }
      
      visited.add(rel.targetId);
      
      const newDepth = current.depth + 1;
      const newPath = [...current.path, rel.targetId];
      const newRelationChain = [...current.relationChain, rel.relation];
      
      // 计算综合相关性分数
      const relevanceScore = newPathWeight * Math.pow(depthDecay, newDepth);
      
      results.push({
        character: targetChar,
        depth: newDepth,
        pathWeight: newPathWeight,
        relationChain: newRelationChain,
        relevanceScore,
      });
      
      // 添加到队列继续遍历
      queue.push({
        character: targetChar,
        depth: newDepth,
        pathWeight: newPathWeight,
        path: newPath,
        relationChain: newRelationChain,
      });
    }
  }
  
  // 按相关性分数排序
  return results.sort((a, b) => b.relevanceScore - a.relevanceScore);
}

/**
 * 获取角色的 N 度人脉
 * 
 * @param characterId - 目标角色 ID
 * @param allCharacters - 所有角色
 * @param depth - 人脉深度（默认 2，即二度人脉）
 * @returns 按关系强度排序的角色列表
 */
export function getNDegreeConnections(
  characterId: string,
  allCharacters: Character[],
  depth: number = 2
): GraphRetrievalResult[] {
  return retrieveWithGraph([characterId], allCharacters, {
    maxDepth: depth,
    includeStartNodes: false,
  });
}

/**
 * 查找两个角色之间的关系路径
 * 
 * @param sourceId - 源角色 ID
 * @param targetId - 目标角色 ID
 * @param allCharacters - 所有角色
 * @param maxDepth - 最大搜索深度
 * @returns 关系路径，如果不存在则返回 null
 */
export function findRelationshipPath(
  sourceId: string,
  targetId: string,
  allCharacters: Character[],
  maxDepth: number = 4
): { path: Character[]; relations: string[] } | null {
  if (sourceId === targetId) {
    const char = allCharacters.find(c => c.id === sourceId);
    return char ? { path: [char], relations: [] } : null;
  }
  
  const characterMap = new Map<string, Character>();
  for (const char of allCharacters) {
    characterMap.set(char.id, char);
  }
  
  const relationIndex = buildRelationshipIndex(allCharacters);
  
  // BFS 查找最短路径
  const visited = new Set<string>();
  const queue: { id: string; path: string[]; relations: string[] }[] = [];
  
  visited.add(sourceId);
  queue.push({ id: sourceId, path: [sourceId], relations: [] });
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    
    if (current.path.length > maxDepth + 1) {
      continue;
    }
    
    const relationships = relationIndex.get(current.id) || [];
    
    for (const rel of relationships) {
      if (rel.targetId === targetId) {
        // 找到目标
        const fullPath = [...current.path, targetId];
        const fullRelations = [...current.relations, rel.relation];
        return {
          path: fullPath.map(id => characterMap.get(id)!).filter(Boolean),
          relations: fullRelations,
        };
      }
      
      if (!visited.has(rel.targetId)) {
        visited.add(rel.targetId);
        queue.push({
          id: rel.targetId,
          path: [...current.path, rel.targetId],
          relations: [...current.relations, rel.relation],
        });
      }
    }
  }
  
  return null;
}

/**
 * 获取角色的关系网络摘要
 * 用于生成上下文提示词
 */
export function getRelationshipSummary(
  characterId: string,
  allCharacters: Character[],
  maxConnections: number = 10
): string {
  const connections = getNDegreeConnections(characterId, allCharacters, 2);
  const topConnections = connections.slice(0, maxConnections);
  
  if (topConnections.length === 0) {
    return '';
  }
  
  const character = allCharacters.find(c => c.id === characterId);
  if (!character) {
    return '';
  }
  
  const lines: string[] = [`${character.name} 的关系网络：`];
  
  // 按深度分组
  const depth1 = topConnections.filter(c => c.depth === 1);
  const depth2 = topConnections.filter(c => c.depth === 2);
  
  if (depth1.length > 0) {
    lines.push('  直接关系：');
    for (const conn of depth1) {
      lines.push(`    - ${conn.character.name}（${conn.relationChain.join(' → ')}）`);
    }
  }
  
  if (depth2.length > 0) {
    lines.push('  间接关系：');
    for (const conn of depth2) {
      lines.push(`    - ${conn.character.name}（${conn.relationChain.join(' → ')}）`);
    }
  }
  
  return lines.join('\n');
}

/**
 * 增强版角色检索：结合向量检索和图谱检索
 * 
 * @param seedCharacterIds - 种子角色 ID（来自向量检索的初步结果）
 * @param allCharacters - 所有角色
 * @param graphDepth - 图谱遍历深度
 * @param limit - 返回结果数量限制
 */
export function enhanceWithGraphRetrieval(
  seedCharacterIds: string[],
  allCharacters: Character[],
  graphDepth: number = 2,
  limit: number = 10
): Character[] {
  // 使用图谱检索扩展
  const graphResults = retrieveWithGraph(seedCharacterIds, allCharacters, {
    maxDepth: graphDepth,
    includeStartNodes: true,
  });
  
  // 去重并限制数量
  const seen = new Set<string>();
  const results: Character[] = [];
  
  for (const result of graphResults) {
    if (!seen.has(result.character.id) && results.length < limit) {
      seen.add(result.character.id);
      results.push(result.character);
    }
  }
  
  return results;
}

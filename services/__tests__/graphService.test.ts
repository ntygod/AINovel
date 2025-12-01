import { describe, it, expect } from 'vitest';
import {
  getRelationWeight,
  buildRelationshipIndex,
  retrieveWithGraph,
  getNDegreeConnections,
  findRelationshipPath,
  getRelationshipSummary,
  enhanceWithGraphRetrieval,
  RELATION_WEIGHTS,
} from '../graphService';
import { Character } from '../../types';

// 测试用角色数据
const createTestCharacters = (): Character[] => [
  {
    id: 'char1',
    name: '林风',
    role: '主角',
    description: '年轻的剑修',
    appearance: '',
    background: '',
    personality: '正直勇敢',
    relationships: [
      { targetId: 'char2', targetName: '苏雪', relation: '恋人' },
      { targetId: 'char3', targetName: '张三', relation: '师父' },
      { targetId: 'char5', targetName: '魔尊', relation: '仇人' },
    ],
  },
  {
    id: 'char2',
    name: '苏雪',
    role: '女主角',
    description: '冰系修士',
    appearance: '',
    background: '',
    personality: '冷艳',
    relationships: [
      { targetId: 'char1', targetName: '林风', relation: '恋人' },
      { targetId: 'char4', targetName: '苏父', relation: '父亲' },
    ],
  },
  {
    id: 'char3',
    name: '张三',
    role: '导师',
    description: '剑道宗师',
    appearance: '',
    background: '',
    personality: '严厉',
    relationships: [
      { targetId: 'char1', targetName: '林风', relation: '徒弟' },
      { targetId: 'char5', targetName: '魔尊', relation: '宿敌' },
    ],
  },
  {
    id: 'char4',
    name: '苏父',
    role: '配角',
    description: '苏家家主',
    appearance: '',
    background: '',
    personality: '威严',
    relationships: [
      { targetId: 'char2', targetName: '苏雪', relation: '女儿' },
    ],
  },
  {
    id: 'char5',
    name: '魔尊',
    role: '反派',
    description: '魔道至尊',
    appearance: '',
    background: '',
    personality: '残忍',
    relationships: [
      { targetId: 'char1', targetName: '林风', relation: '仇人' },
      { targetId: 'char3', targetName: '张三', relation: '宿敌' },
    ],
  },
];

describe('graphService', () => {
  describe('getRelationWeight', () => {
    it('should return correct weight for known relations', () => {
      expect(getRelationWeight('仇人')).toBe(1.0);
      expect(getRelationWeight('恋人')).toBe(0.9);
      expect(getRelationWeight('父亲')).toBe(0.85);
      expect(getRelationWeight('朋友')).toBe(0.6);
    });

    it('should return default weight for unknown relations', () => {
      const weight = getRelationWeight('未知关系');
      expect(weight).toBe(0.5); // 默认权重
    });

    it('should handle fuzzy matching', () => {
      // 包含"仇"的关系应该有高权重
      const weight = getRelationWeight('杀父之仇');
      expect(weight).toBeGreaterThanOrEqual(0.9);
    });

    it('should handle case variations', () => {
      const weight = getRelationWeight('FATHER');
      // 英文关系可能匹配不到，返回默认值
      expect(weight).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('buildRelationshipIndex', () => {
    it('should build correct index from characters', () => {
      const characters = createTestCharacters();
      const index = buildRelationshipIndex(characters);
      
      expect(index.size).toBe(5);
      
      const char1Relations = index.get('char1');
      expect(char1Relations).toBeDefined();
      expect(char1Relations?.length).toBe(3);
      
      // 检查关系权重是否正确计算
      const loverRelation = char1Relations?.find(r => r.targetId === 'char2');
      expect(loverRelation?.weight).toBe(0.9); // 恋人权重
    });

    it('should handle characters without relationships', () => {
      const characters: Character[] = [{
        id: 'lonely',
        name: '孤独者',
        role: '配角',
        description: '',
        appearance: '',
        background: '',
        personality: '',
        relationships: [],
      }];
      
      const index = buildRelationshipIndex(characters);
      expect(index.get('lonely')).toEqual([]);
    });
  });

  describe('retrieveWithGraph', () => {
    it('should retrieve directly connected characters', () => {
      const characters = createTestCharacters();
      const results = retrieveWithGraph(['char1'], characters, { maxDepth: 1 });
      
      // 应该包含 char1 本身和其直接关系
      expect(results.length).toBeGreaterThan(0);
      
      // 检查是否包含直接关系的角色
      const resultIds = results.map(r => r.character.id);
      expect(resultIds).toContain('char1'); // 起始节点
      expect(resultIds).toContain('char2'); // 恋人
      expect(resultIds).toContain('char3'); // 师父
      expect(resultIds).toContain('char5'); // 仇人
    });

    it('should retrieve second-degree connections', () => {
      const characters = createTestCharacters();
      const results = retrieveWithGraph(['char1'], characters, { maxDepth: 2 });
      
      const resultIds = results.map(r => r.character.id);
      
      // 应该包含二度关系（苏雪的父亲）
      expect(resultIds).toContain('char4');
    });

    it('should respect maxDepth limit', () => {
      const characters = createTestCharacters();
      const depth1Results = retrieveWithGraph(['char1'], characters, { maxDepth: 1 });
      const depth2Results = retrieveWithGraph(['char1'], characters, { maxDepth: 2 });
      
      // 深度 2 应该比深度 1 有更多结果
      expect(depth2Results.length).toBeGreaterThanOrEqual(depth1Results.length);
    });

    it('should calculate correct relevance scores', () => {
      const characters = createTestCharacters();
      const results = retrieveWithGraph(['char1'], characters, { maxDepth: 2 });
      
      // 结果应该按相关性分数排序
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
      }
    });

    it('should handle empty start nodes', () => {
      const characters = createTestCharacters();
      const results = retrieveWithGraph([], characters);
      
      expect(results).toEqual([]);
    });

    it('should handle non-existent start nodes', () => {
      const characters = createTestCharacters();
      const results = retrieveWithGraph(['non-existent'], characters);
      
      expect(results).toEqual([]);
    });

    it('should exclude start nodes when configured', () => {
      const characters = createTestCharacters();
      const results = retrieveWithGraph(['char1'], characters, {
        maxDepth: 1,
        includeStartNodes: false,
      });
      
      const resultIds = results.map(r => r.character.id);
      expect(resultIds).not.toContain('char1');
    });
  });

  describe('getNDegreeConnections', () => {
    it('should return N-degree connections excluding start node', () => {
      const characters = createTestCharacters();
      const connections = getNDegreeConnections('char1', characters, 2);
      
      // 不应该包含起始节点
      const connectionIds = connections.map(c => c.character.id);
      expect(connectionIds).not.toContain('char1');
      
      // 应该包含直接和间接关系
      expect(connectionIds).toContain('char2');
      expect(connectionIds).toContain('char4'); // 二度关系
    });
  });

  describe('findRelationshipPath', () => {
    it('should find direct relationship path', () => {
      const characters = createTestCharacters();
      const path = findRelationshipPath('char1', 'char2', characters);
      
      expect(path).not.toBeNull();
      expect(path?.path.length).toBe(2);
      expect(path?.relations.length).toBe(1);
      expect(path?.relations[0]).toBe('恋人');
    });

    it('should find indirect relationship path', () => {
      const characters = createTestCharacters();
      const path = findRelationshipPath('char1', 'char4', characters);
      
      expect(path).not.toBeNull();
      expect(path?.path.length).toBe(3); // char1 -> char2 -> char4
      expect(path?.relations.length).toBe(2);
    });

    it('should return null for unconnected characters', () => {
      const characters: Character[] = [
        {
          id: 'isolated1',
          name: '孤立者1',
          role: '',
          description: '',
          appearance: '',
          background: '',
          personality: '',
          relationships: [],
        },
        {
          id: 'isolated2',
          name: '孤立者2',
          role: '',
          description: '',
          appearance: '',
          background: '',
          personality: '',
          relationships: [],
        },
      ];
      
      const path = findRelationshipPath('isolated1', 'isolated2', characters);
      expect(path).toBeNull();
    });

    it('should handle same source and target', () => {
      const characters = createTestCharacters();
      const path = findRelationshipPath('char1', 'char1', characters);
      
      expect(path).not.toBeNull();
      expect(path?.path.length).toBe(1);
      expect(path?.relations.length).toBe(0);
    });
  });

  describe('getRelationshipSummary', () => {
    it('should generate relationship summary', () => {
      const characters = createTestCharacters();
      const summary = getRelationshipSummary('char1', characters);
      
      expect(summary).toContain('林风');
      expect(summary).toContain('关系网络');
      expect(summary).toContain('直接关系');
    });

    it('should return empty string for non-existent character', () => {
      const characters = createTestCharacters();
      const summary = getRelationshipSummary('non-existent', characters);
      
      expect(summary).toBe('');
    });
  });

  describe('enhanceWithGraphRetrieval', () => {
    it('should enhance seed results with graph connections', () => {
      const characters = createTestCharacters();
      const enhanced = enhanceWithGraphRetrieval(['char1'], characters, 2, 10);
      
      expect(enhanced.length).toBeGreaterThan(0);
      
      // 应该包含种子角色和其关系网络
      const enhancedIds = enhanced.map(c => c.id);
      expect(enhancedIds).toContain('char1');
      expect(enhancedIds).toContain('char2');
    });

    it('should respect limit parameter', () => {
      const characters = createTestCharacters();
      const enhanced = enhanceWithGraphRetrieval(['char1'], characters, 2, 3);
      
      expect(enhanced.length).toBeLessThanOrEqual(3);
    });

    it('should deduplicate results', () => {
      const characters = createTestCharacters();
      const enhanced = enhanceWithGraphRetrieval(['char1', 'char2'], characters, 2, 10);
      
      // 检查没有重复
      const ids = enhanced.map(c => c.id);
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length);
    });
  });
});

import { describe, it, expect } from 'vitest';
import {
  // 别名系统
  addAlias,
  removeAlias,
  getAllNames,
  matchesEntry,
  findMatchingEntries,
  buildAliasIndex,
  findEntryByNameOrAlias,
  // 时间切片
  addHistoryEntry,
  getDescriptionAtChapter,
  getHistoryTimeline,
  pruneHistory,
  // 关联图谱
  addRelationship,
  removeRelationship,
  getRelatedEntries,
  getIncomingRelationships,
  buildRelationshipGraph,
  getRelationTypeLabel,
  // 综合功能
  enhancedWikiRetrieval,
  buildWikiContextPrompt,
  autoRecordHistory,
} from '../wikiService';
import { WikiEntry, Chapter } from '../../types';

// 测试用 Wiki 条目
const createTestEntries = (): WikiEntry[] => [
  {
    id: 'wiki1',
    name: '青云剑',
    category: 'Item',
    description: '一把上古神剑，蕴含无穷剑意',
    aliases: ['神剑', '青云'],
    relationships: [
      { targetId: 'wiki3', relation: 'belongs_to' },
    ],
  },
  {
    id: 'wiki2',
    name: '青云门',
    category: 'Organization',
    description: '天下第一剑派',
    aliases: ['青云宗', '剑宗'],
  },
  {
    id: 'wiki3',
    name: '林风',
    category: 'Person',
    description: '青云门弟子，天赋异禀',
    relationships: [
      { targetId: 'wiki2', relation: 'part_of' },
    ],
  },
  {
    id: 'wiki4',
    name: '藏经阁',
    category: 'Location',
    description: '青云门存放典籍之处',
    relationships: [
      { targetId: 'wiki2', relation: 'located_in' },
    ],
  },
];

describe('wikiService', () => {
  // ============================================
  // 别名系统测试
  // ============================================
  describe('Alias System', () => {
    describe('addAlias', () => {
      it('should add a new alias', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        const updated = addAlias(entry, '神剑');
        expect(updated.aliases).toContain('神剑');
      });

      it('should not add duplicate alias', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          aliases: ['神剑'],
        };
        
        const updated = addAlias(entry, '神剑');
        expect(updated.aliases?.filter(a => a === '神剑').length).toBe(1);
      });

      it('should not add main name as alias', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        const updated = addAlias(entry, '青云剑');
        expect(updated.aliases).toBeUndefined();
      });
    });

    describe('removeAlias', () => {
      it('should remove an existing alias', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          aliases: ['神剑', '青云'],
        };
        
        const updated = removeAlias(entry, '神剑');
        expect(updated.aliases).not.toContain('神剑');
        expect(updated.aliases).toContain('青云');
      });
    });

    describe('getAllNames', () => {
      it('should return main name and all aliases', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          aliases: ['神剑', '青云'],
        };
        
        const names = getAllNames(entry);
        expect(names).toContain('青云剑');
        expect(names).toContain('神剑');
        expect(names).toContain('青云');
        expect(names.length).toBe(3);
      });
    });

    describe('matchesEntry', () => {
      it('should match by main name', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        expect(matchesEntry('林风拔出青云剑', entry)).toBe(true);
      });

      it('should match by alias', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          aliases: ['神剑'],
        };
        
        expect(matchesEntry('林风拔出神剑', entry)).toBe(true);
      });

      it('should not match short names', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '剑',
          category: 'Item',
          description: '神剑',
        };
        
        expect(matchesEntry('林风拔出剑', entry)).toBe(false);
      });
    });

    describe('buildAliasIndex', () => {
      it('should build index with main names and aliases', () => {
        const entries = createTestEntries();
        const index = buildAliasIndex(entries);
        
        expect(index.get('青云剑')).toBe('wiki1');
        expect(index.get('神剑')).toBe('wiki1');
        expect(index.get('青云门')).toBe('wiki2');
        expect(index.get('剑宗')).toBe('wiki2');
      });
    });

    describe('findEntryByNameOrAlias', () => {
      it('should find by main name', () => {
        const entries = createTestEntries();
        const found = findEntryByNameOrAlias('青云剑', entries);
        
        expect(found?.id).toBe('wiki1');
      });

      it('should find by alias', () => {
        const entries = createTestEntries();
        const found = findEntryByNameOrAlias('剑宗', entries);
        
        expect(found?.id).toBe('wiki2');
      });

      it('should return undefined for non-existent name', () => {
        const entries = createTestEntries();
        const found = findEntryByNameOrAlias('不存在', entries);
        
        expect(found).toBeUndefined();
      });
    });
  });

  // ============================================
  // 时间切片测试
  // ============================================
  describe('Time Slicing', () => {
    describe('addHistoryEntry', () => {
      it('should add a new history entry', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        const updated = addHistoryEntry(entry, 'ch1', 1, '一把普通的剑');
        
        expect(updated.history?.length).toBe(1);
        expect(updated.history?.[0].content).toBe('一把普通的剑');
      });

      it('should update existing history entry for same chapter', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          history: [
            { chapterId: 'ch1', chapterOrder: 1, content: '旧内容', timestamp: 1000 },
          ],
        };
        
        const updated = addHistoryEntry(entry, 'ch1', 1, '新内容');
        
        expect(updated.history?.length).toBe(1);
        expect(updated.history?.[0].content).toBe('新内容');
      });

      it('should sort history by chapter order', () => {
        let entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        entry = addHistoryEntry(entry, 'ch3', 3, '第三章');
        entry = addHistoryEntry(entry, 'ch1', 1, '第一章');
        entry = addHistoryEntry(entry, 'ch2', 2, '第二章');
        
        expect(entry.history?.[0].chapterOrder).toBe(1);
        expect(entry.history?.[1].chapterOrder).toBe(2);
        expect(entry.history?.[2].chapterOrder).toBe(3);
      });
    });

    describe('getDescriptionAtChapter', () => {
      it('should return original description when no history', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        const desc = getDescriptionAtChapter(entry, 10);
        expect(desc).toBe('神剑');
      });

      it('should return correct version for chapter', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '最新描述',
          history: [
            { chapterId: 'ch1', chapterOrder: 1, content: '第一章描述', timestamp: 1000 },
            { chapterId: 'ch5', chapterOrder: 5, content: '第五章描述', timestamp: 2000 },
            { chapterId: 'ch10', chapterOrder: 10, content: '第十章描述', timestamp: 3000 },
          ],
        };
        
        expect(getDescriptionAtChapter(entry, 1)).toBe('第一章描述');
        expect(getDescriptionAtChapter(entry, 3)).toBe('第一章描述');
        expect(getDescriptionAtChapter(entry, 5)).toBe('第五章描述');
        expect(getDescriptionAtChapter(entry, 7)).toBe('第五章描述');
        expect(getDescriptionAtChapter(entry, 10)).toBe('第十章描述');
        expect(getDescriptionAtChapter(entry, 15)).toBe('第十章描述');
      });
    });

    describe('pruneHistory', () => {
      it('should keep only recent entries', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          history: Array.from({ length: 20 }, (_, i) => ({
            chapterId: `ch${i}`,
            chapterOrder: i,
            content: `第${i}章`,
            timestamp: i * 1000,
          })),
        };
        
        const pruned = pruneHistory(entry, 5);
        
        expect(pruned.history?.length).toBe(5);
        expect(pruned.history?.[0].chapterOrder).toBe(15);
      });
    });
  });

  // ============================================
  // 关联图谱测试
  // ============================================
  describe('Wiki Relationships', () => {
    describe('addRelationship', () => {
      it('should add a new relationship', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
        };
        
        const updated = addRelationship(entry, 'owner1', 'belongs_to');
        
        expect(updated.relationships?.length).toBe(1);
        expect(updated.relationships?.[0].targetId).toBe('owner1');
        expect(updated.relationships?.[0].relation).toBe('belongs_to');
      });

      it('should update existing relationship', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          relationships: [
            { targetId: 'owner1', relation: 'belongs_to' },
          ],
        };
        
        const updated = addRelationship(entry, 'owner1', 'belongs_to', '新描述');
        
        expect(updated.relationships?.length).toBe(1);
        expect(updated.relationships?.[0].description).toBe('新描述');
      });
    });

    describe('removeRelationship', () => {
      it('should remove specific relationship', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          relationships: [
            { targetId: 'owner1', relation: 'belongs_to' },
            { targetId: 'owner1', relation: 'created_by' },
          ],
        };
        
        const updated = removeRelationship(entry, 'owner1', 'belongs_to');
        
        expect(updated.relationships?.length).toBe(1);
        expect(updated.relationships?.[0].relation).toBe('created_by');
      });

      it('should remove all relationships to target when no relation specified', () => {
        const entry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '神剑',
          relationships: [
            { targetId: 'owner1', relation: 'belongs_to' },
            { targetId: 'owner1', relation: 'created_by' },
          ],
        };
        
        const updated = removeRelationship(entry, 'owner1');
        
        expect(updated.relationships?.length).toBe(0);
      });
    });

    describe('getRelatedEntries', () => {
      it('should return related entries', () => {
        const entries = createTestEntries();
        const sword = entries.find(e => e.id === 'wiki1')!;
        
        const related = getRelatedEntries(sword, entries);
        
        expect(related.length).toBe(1);
        expect(related[0].entry.name).toBe('林风');
        expect(related[0].relation).toBe('belongs_to');
      });

      it('should filter by relation type', () => {
        const entries = createTestEntries();
        const person = entries.find(e => e.id === 'wiki3')!;
        
        const related = getRelatedEntries(person, entries, 'part_of');
        
        expect(related.length).toBe(1);
        expect(related[0].entry.name).toBe('青云门');
      });
    });

    describe('getIncomingRelationships', () => {
      it('should return incoming relationships', () => {
        const entries = createTestEntries();
        
        const incoming = getIncomingRelationships('wiki2', entries);
        
        expect(incoming.length).toBe(2); // 林风 part_of, 藏经阁 located_in
      });
    });

    describe('buildRelationshipGraph', () => {
      it('should build correct graph', () => {
        const entries = createTestEntries();
        const graph = buildRelationshipGraph(entries);
        
        const swordNode = graph.get('wiki1');
        expect(swordNode?.outgoing.length).toBe(1);
        
        const orgNode = graph.get('wiki2');
        expect(orgNode?.incoming.length).toBe(2);
      });
    });

    describe('getRelationTypeLabel', () => {
      it('should return correct labels', () => {
        expect(getRelationTypeLabel('belongs_to')).toBe('属于');
        expect(getRelationTypeLabel('part_of')).toBe('是...的一部分');
        expect(getRelationTypeLabel('located_in')).toBe('位于');
      });
    });
  });

  // ============================================
  // 综合功能测试
  // ============================================
  describe('Enhanced Features', () => {
    describe('enhancedWikiRetrieval', () => {
      it('should find entries by alias', () => {
        const entries = createTestEntries();
        const results = enhancedWikiRetrieval('林风拔出神剑', entries);
        
        expect(results.length).toBeGreaterThan(0);
        expect(results.some(r => r.entry.name === '青云剑')).toBe(true);
      });

      it('should include related entries when expanded', () => {
        const entries = createTestEntries();
        const results = enhancedWikiRetrieval('青云剑', entries, undefined, true);
        
        const swordResult = results.find(r => r.entry.name === '青云剑');
        expect(swordResult?.relatedEntries?.length).toBeGreaterThan(0);
      });
    });

    describe('buildWikiContextPrompt', () => {
      it('should build context prompt with aliases', () => {
        const entries = createTestEntries();
        const prompt = buildWikiContextPrompt(entries);
        
        expect(prompt).toContain('青云剑');
        expect(prompt).toContain('又名');
        expect(prompt).toContain('神剑');
      });
    });

    describe('autoRecordHistory', () => {
      it('should record history when description changes', () => {
        const oldEntry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '旧描述',
        };
        
        const newEntry: WikiEntry = {
          ...oldEntry,
          description: '新描述',
        };
        
        const chapter: Chapter = {
          id: 'ch1',
          order: 1,
          title: '第一章',
          summary: '',
          content: '',
          wordCount: 0,
        };
        
        const result = autoRecordHistory(oldEntry, newEntry, chapter);
        
        expect(result.history?.length).toBe(1);
        expect(result.history?.[0].content).toBe('新描述');
      });

      it('should not record history when description unchanged', () => {
        const oldEntry: WikiEntry = {
          id: 'test',
          name: '青云剑',
          category: 'Item',
          description: '相同描述',
        };
        
        const newEntry: WikiEntry = {
          ...oldEntry,
        };
        
        const chapter: Chapter = {
          id: 'ch1',
          order: 1,
          title: '第一章',
          summary: '',
          content: '',
          wordCount: 0,
        };
        
        const result = autoRecordHistory(oldEntry, newEntry, chapter);
        
        expect(result.history).toBeUndefined();
      });
    });
  });
});

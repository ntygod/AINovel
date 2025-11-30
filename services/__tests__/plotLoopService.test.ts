/**
 * Property-Based Tests for Plot Loop Service
 * 
 * Uses fast-check for property-based testing.
 * Each test runs a minimum of 100 iterations.
 * 
 * **Feature: plot-loop-system**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  createPlotLoop,
  updatePlotLoop,
  deletePlotLoop,
  getPlotLoopById,
  markAsClosed,
  markAsAbandoned,
  checkUrgentByChapterProximity,
  checkUrgentByVolumeEnd,
  checkLongOpenLoops,
  CreatePlotLoopInput,
  URGENT_CHAPTER_PROXIMITY,
  LONG_OPEN_THRESHOLD,
  MIN_IMPORTANCE,
  MAX_IMPORTANCE
} from '../plotLoopService';
import { PlotLoop, PlotLoopStatus, Chapter, Volume } from '../../types';

// ============================================================================
// Arbitraries (Generators)
// ============================================================================

/**
 * Generates a valid importance value (1-5)
 */
const importanceArb = fc.integer({ min: MIN_IMPORTANCE, max: MAX_IMPORTANCE });

/**
 * Generates a non-empty string for titles
 */
const titleArb = fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0);

/**
 * Generates a description string
 */
const descriptionArb = fc.string({ minLength: 0, maxLength: 200 });

/**
 * Generates a UUID-like string
 */
const uuidArb = fc.uuid();

/**
 * Generates valid CreatePlotLoopInput
 */
const createPlotLoopInputArb: fc.Arbitrary<CreatePlotLoopInput> = fc.record({
  title: titleArb,
  description: descriptionArb,
  setupChapterId: uuidArb,
  importance: importanceArb,
  targetChapterId: fc.option(uuidArb, { nil: undefined }),
  targetVolumeId: fc.option(uuidArb, { nil: undefined }),
  relatedCharacterIds: fc.option(fc.array(uuidArb, { maxLength: 5 }), { nil: undefined }),
  relatedWikiEntryIds: fc.option(fc.array(uuidArb, { maxLength: 5 }), { nil: undefined }),
  parentLoopId: fc.option(uuidArb, { nil: undefined }),
  aiSuggested: fc.option(fc.boolean(), { nil: undefined })
});

/**
 * Generates a PlotLoop with OPEN status
 */
const openPlotLoopArb: fc.Arbitrary<PlotLoop> = createPlotLoopInputArb.map(input => 
  createPlotLoop(input)
);

/**
 * Generates a Chapter object with all required fields
 */
const chapterArb = (order: number): fc.Arbitrary<Chapter> => fc.record({
  id: uuidArb,
  title: titleArb,
  order: fc.constant(order),
  summary: fc.constant(''),
  beats: fc.constant([]),
  content: fc.constant(''),
  wordCount: fc.constant(0)
});

/**
 * Generates a Volume object with all required fields
 */
const volumeArb: fc.Arbitrary<Volume> = fc.record({
  id: uuidArb,
  title: titleArb,
  summary: fc.constant(''),
  coreConflict: fc.constant(''),
  order: fc.integer({ min: 1, max: 100 }),
  chapterIds: fc.array(uuidArb, { minLength: 1, maxLength: 10 })
});

// ============================================================================
// Property Tests
// ============================================================================

describe('PlotLoopService Property Tests', () => {
  
  /**
   * **Feature: plot-loop-system, Property 1: Plot loop creation initializes required fields**
   * **Validates: Requirements 1.1**
   * 
   * For any valid plot loop creation input, the created plot loop SHALL have:
   * - A unique ID
   * - Status set to OPEN
   * - All provided fields stored correctly
   */
  describe('Property 1: Plot loop creation initializes required fields', () => {
    it('should create plot loop with unique ID, OPEN status, and correct fields', () => {
      fc.assert(
        fc.property(createPlotLoopInputArb, (input) => {
          const loop = createPlotLoop(input);
          
          // Has unique ID
          expect(loop.id).toBeDefined();
          expect(typeof loop.id).toBe('string');
          expect(loop.id.length).toBeGreaterThan(0);
          
          // Status is OPEN
          expect(loop.status).toBe(PlotLoopStatus.OPEN);
          
          // Required fields are stored
          expect(loop.title.trim().length).toBeGreaterThan(0);
          expect(loop.setupChapterId).toBe(input.setupChapterId);
          expect(loop.importance).toBeGreaterThanOrEqual(MIN_IMPORTANCE);
          expect(loop.importance).toBeLessThanOrEqual(MAX_IMPORTANCE);
          
          // Timestamps are set
          expect(loop.createdAt).toBeGreaterThan(0);
          expect(loop.updatedAt).toBeGreaterThan(0);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 2: Partial update preserves unchanged fields**
   * **Validates: Requirements 1.2, 1.4**
   * 
   * For any existing plot loop and any subset of fields to update,
   * updating SHALL modify only the specified fields while preserving all other fields unchanged.
   */
  describe('Property 2: Partial update preserves unchanged fields', () => {
    it('should preserve unchanged fields when updating', () => {
      fc.assert(
        fc.property(
          openPlotLoopArb,
          // Generate updates with at least one field defined (to test partial updates)
          fc.oneof(
            fc.record({ title: titleArb }),
            fc.record({ description: descriptionArb }),
            fc.record({ importance: importanceArb }),
            fc.record({ title: titleArb, description: descriptionArb }),
            fc.record({ title: titleArb, importance: importanceArb }),
            fc.record({ description: descriptionArb, importance: importanceArb })
          ),
          (originalLoop, updates) => {
            const updatedLoop = updatePlotLoop(originalLoop, updates);
            
            // ID and createdAt are never changed
            expect(updatedLoop.id).toBe(originalLoop.id);
            expect(updatedLoop.createdAt).toBe(originalLoop.createdAt);
            
            // updatedAt is always updated
            expect(updatedLoop.updatedAt).toBeGreaterThanOrEqual(originalLoop.updatedAt);
            
            // Fields not in updates object are preserved
            if (!('title' in updates)) {
              expect(updatedLoop.title).toBe(originalLoop.title);
            }
            if (!('description' in updates)) {
              expect(updatedLoop.description).toBe(originalLoop.description);
            }
            if (!('importance' in updates)) {
              expect(updatedLoop.importance).toBe(originalLoop.importance);
            }
            
            // setupChapterId is always preserved (not in updates)
            expect(updatedLoop.setupChapterId).toBe(originalLoop.setupChapterId);
            expect(updatedLoop.status).toBe(originalLoop.status);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 3: Deletion removes plot loop from storage**
   * **Validates: Requirements 1.3**
   * 
   * For any existing plot loop, after deletion, querying for that plot loop by ID
   * SHALL return null/undefined.
   */
  describe('Property 3: Deletion removes plot loop from storage', () => {
    it('should remove plot loop from array after deletion', () => {
      fc.assert(
        fc.property(
          fc.array(openPlotLoopArb, { minLength: 1, maxLength: 10 }),
          (loops) => {
            // Pick a random loop to delete
            const indexToDelete = Math.floor(Math.random() * loops.length);
            const loopToDelete = loops[indexToDelete];
            
            // Delete the loop
            const remainingLoops = deletePlotLoop(loopToDelete.id, loops);
            
            // The deleted loop should not be found
            const foundLoop = getPlotLoopById(loopToDelete.id, remainingLoops);
            expect(foundLoop).toBeUndefined();
            
            // Array length should decrease by 1
            expect(remainingLoops.length).toBe(loops.length - 1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 4: Closing a plot loop sets CLOSED status and closeChapterId**
   * **Validates: Requirements 1.5**
   * 
   * For any OPEN or URGENT plot loop, marking it as closed with a chapter ID
   * SHALL result in status being CLOSED and closeChapterId being set.
   */
  describe('Property 4: Closing a plot loop sets CLOSED status and closeChapterId', () => {
    it('should set CLOSED status and closeChapterId when closing', () => {
      fc.assert(
        fc.property(openPlotLoopArb, uuidArb, (loop, closeChapterId) => {
          const closedLoop = markAsClosed(loop, closeChapterId);
          
          expect(closedLoop.status).toBe(PlotLoopStatus.CLOSED);
          expect(closedLoop.closeChapterId).toBe(closeChapterId);
          
          // Other fields preserved
          expect(closedLoop.id).toBe(loop.id);
          expect(closedLoop.title).toBe(loop.title);
          expect(closedLoop.setupChapterId).toBe(loop.setupChapterId);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 8: Abandoning sets ABANDONED status with reason**
   * **Validates: Requirements 2.4**
   * 
   * For any plot loop and any non-empty reason string, abandoning the loop
   * SHALL result in status being ABANDONED and abandonReason being set.
   */
  describe('Property 8: Abandoning sets ABANDONED status with reason', () => {
    it('should set ABANDONED status and reason when abandoning', () => {
      // Generate non-whitespace-only strings for reason
      const nonEmptyReasonArb = fc.string({ minLength: 1, maxLength: 200 })
        .filter(s => s.trim().length > 0);
      
      fc.assert(
        fc.property(
          openPlotLoopArb,
          nonEmptyReasonArb,
          (loop, reason) => {
            const abandonedLoop = markAsAbandoned(loop, reason);
            
            expect(abandonedLoop.status).toBe(PlotLoopStatus.ABANDONED);
            expect(abandonedLoop.abandonReason).toBeDefined();
            expect(abandonedLoop.abandonReason!.length).toBeGreaterThan(0);
            
            // Other fields preserved
            expect(abandonedLoop.id).toBe(loop.id);
            expect(abandonedLoop.title).toBe(loop.title);
            expect(abandonedLoop.setupChapterId).toBe(loop.setupChapterId);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 5: URGENT status triggers within 5 chapters of target**
   * **Validates: Requirements 2.1**
   * 
   * For any OPEN plot loop with a targetChapterId, when the current chapter order
   * is within 5 of the target chapter order, the status check SHALL return URGENT.
   */
  describe('Property 5: URGENT status triggers within 5 chapters of target', () => {
    it('should return URGENT when within 5 chapters of target', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100 }), // current chapter order
          fc.integer({ min: 1, max: URGENT_CHAPTER_PROXIMITY }), // distance to target (1-5)
          createPlotLoopInputArb,
          (currentOrder, distance, input) => {
            const targetOrder = currentOrder + distance;
            
            // Create chapters
            const currentChapter: Chapter = {
              id: 'current-chapter',
              title: 'Current Chapter',
              order: currentOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const targetChapter: Chapter = {
              id: 'target-chapter',
              title: 'Target Chapter',
              order: targetOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            // Create loop with target chapter
            const loop = createPlotLoop({
              ...input,
              targetChapterId: targetChapter.id
            });
            
            const allChapters = [currentChapter, targetChapter];
            
            const result = checkUrgentByChapterProximity(loop, currentChapter, allChapters);
            
            expect(result.isUrgent).toBe(true);
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT return URGENT when more than 5 chapters from target', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // current chapter order
          fc.integer({ min: URGENT_CHAPTER_PROXIMITY + 1, max: 50 }), // distance > 5
          createPlotLoopInputArb,
          (currentOrder, distance, input) => {
            const targetOrder = currentOrder + distance;
            
            const currentChapter: Chapter = {
              id: 'current-chapter',
              title: 'Current Chapter',
              order: currentOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const targetChapter: Chapter = {
              id: 'target-chapter',
              title: 'Target Chapter',
              order: targetOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const loop = createPlotLoop({
              ...input,
              targetChapterId: targetChapter.id
            });
            
            const allChapters = [currentChapter, targetChapter];
            
            const result = checkUrgentByChapterProximity(loop, currentChapter, allChapters);
            
            expect(result.isUrgent).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 6: URGENT status triggers at volume end**
   * **Validates: Requirements 2.2**
   * 
   * For any OPEN plot loop with a targetVolumeId, when the current chapter
   * is the last chapter in that volume, the status check SHALL return URGENT.
   */
  describe('Property 6: URGENT status triggers at volume end', () => {
    it('should return URGENT when at last chapter of target volume', () => {
      fc.assert(
        fc.property(
          createPlotLoopInputArb,
          fc.array(uuidArb, { minLength: 2, maxLength: 5 }),
          (input, chapterIds) => {
            const lastChapterId = chapterIds[chapterIds.length - 1];
            const volumeId = 'target-volume';
            
            const currentChapter: Chapter = {
              id: lastChapterId,
              title: 'Last Chapter',
              order: chapterIds.length,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const volume: Volume = {
              id: volumeId,
              title: 'Target Volume',
              summary: '',
              coreConflict: '',
              order: 1,
              chapterIds: chapterIds
            };
            
            const loop = createPlotLoop({
              ...input,
              targetVolumeId: volumeId
            });
            
            const result = checkUrgentByVolumeEnd(loop, currentChapter, [volume]);
            
            expect(result.isUrgent).toBe(true);
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT return URGENT when not at last chapter of target volume', () => {
      fc.assert(
        fc.property(
          createPlotLoopInputArb,
          fc.array(uuidArb, { minLength: 3, maxLength: 5 }),
          (input, chapterIds) => {
            // Pick a chapter that is NOT the last one
            const notLastChapterId = chapterIds[0];
            const volumeId = 'target-volume';
            
            const currentChapter: Chapter = {
              id: notLastChapterId,
              title: 'Not Last Chapter',
              order: 1,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const volume: Volume = {
              id: volumeId,
              title: 'Target Volume',
              summary: '',
              coreConflict: '',
              order: 1,
              chapterIds: chapterIds
            };
            
            const loop = createPlotLoop({
              ...input,
              targetVolumeId: volumeId
            });
            
            const result = checkUrgentByVolumeEnd(loop, currentChapter, [volume]);
            
            expect(result.isUrgent).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: plot-loop-system, Property 7: Long-open loops without target are flagged**
   * **Validates: Requirements 2.3**
   * 
   * For any OPEN plot loop without targetChapterId or targetVolumeId,
   * when the chapter gap exceeds 30, the loop SHALL be flagged as requiring attention.
   */
  describe('Property 7: Long-open loops without target are flagged', () => {
    it('should flag loops open for more than 30 chapters without target', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // setup chapter order
          fc.integer({ min: LONG_OPEN_THRESHOLD + 1, max: 100 }), // gap > 30
          createPlotLoopInputArb,
          (setupOrder, gap, input) => {
            const currentOrder = setupOrder + gap;
            
            const setupChapter: Chapter = {
              id: 'setup-chapter',
              title: 'Setup Chapter',
              order: setupOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const currentChapter: Chapter = {
              id: 'current-chapter',
              title: 'Current Chapter',
              order: currentOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            // Create loop WITHOUT target
            const loop = createPlotLoop({
              ...input,
              setupChapterId: setupChapter.id,
              targetChapterId: undefined,
              targetVolumeId: undefined
            });
            
            const allChapters = [setupChapter, currentChapter];
            
            const result = checkLongOpenLoops(loop, currentChapter, allChapters);
            
            expect(result.needsAttention).toBe(true);
            expect(result.chapterGap).toBe(gap);
            expect(result.reason).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should NOT flag loops open for 30 or fewer chapters', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 50 }), // setup chapter order
          fc.integer({ min: 1, max: LONG_OPEN_THRESHOLD }), // gap <= 30
          createPlotLoopInputArb,
          (setupOrder, gap, input) => {
            const currentOrder = setupOrder + gap;
            
            const setupChapter: Chapter = {
              id: 'setup-chapter',
              title: 'Setup Chapter',
              order: setupOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const currentChapter: Chapter = {
              id: 'current-chapter',
              title: 'Current Chapter',
              order: currentOrder,
              summary: '',
              beats: [],
              content: '',
              wordCount: 0
            };
            
            const loop = createPlotLoop({
              ...input,
              setupChapterId: setupChapter.id,
              targetChapterId: undefined,
              targetVolumeId: undefined
            });
            
            const allChapters = [setupChapter, currentChapter];
            
            const result = checkLongOpenLoops(loop, currentChapter, allChapters);
            
            expect(result.needsAttention).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

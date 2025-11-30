/**
 * Plot Loop Management Service
 * 
 * Core logic for managing plot loops (伏笔) in InkFlow.
 * Implements Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.4
 */

import { PlotLoop, PlotLoopStatus, Chapter, Volume } from '../types';

// ============================================================================
// Validation Constants and Functions
// ============================================================================

/** Minimum importance level */
export const MIN_IMPORTANCE = 1;

/** Maximum importance level */
export const MAX_IMPORTANCE = 5;

/** Maximum length for plot loop title */
export const MAX_TITLE_LENGTH = 100;

/** Maximum length for plot loop description */
export const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates plot loop data before creation or update.
 * 
 * Requirements: 1.1 (data validation)
 * - Title must not be empty and within length limit
 * - Description within length limit
 * - Importance must be between 1-5
 * - setupChapterId must be provided for creation
 * 
 * @param data - Plot loop data to validate
 * @param isCreation - Whether this is for creation (requires setupChapterId)
 * @returns ValidationResult with isValid flag and error messages
 */
export function validatePlotLoopData(
  data: Partial<PlotLoop>,
  isCreation: boolean = false
): ValidationResult {
  const errors: string[] = [];

  // Validate title
  if (data.title !== undefined) {
    const trimmedTitle = data.title.trim();
    if (trimmedTitle.length === 0) {
      errors.push('伏笔标题不能为空');
    } else if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      errors.push(`伏笔标题不能超过 ${MAX_TITLE_LENGTH} 个字符`);
    }
  } else if (isCreation) {
    errors.push('伏笔标题不能为空');
  }

  // Validate description
  if (data.description !== undefined && data.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push(`伏笔描述不能超过 ${MAX_DESCRIPTION_LENGTH} 个字符`);
  }

  // Validate importance
  if (data.importance !== undefined) {
    if (data.importance < MIN_IMPORTANCE || data.importance > MAX_IMPORTANCE) {
      errors.push(`重要程度必须在 ${MIN_IMPORTANCE}-${MAX_IMPORTANCE} 之间`);
    }
  }

  // Validate setupChapterId for creation
  if (isCreation && !data.setupChapterId) {
    errors.push('必须指定埋设章节');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes plot loop title by trimming and providing default value.
 * 
 * @param title - Raw title input
 * @returns Sanitized title
 */
export function sanitizeTitle(title: string | undefined | null): string {
  if (!title || title.trim().length === 0) {
    return '未命名伏笔';
  }
  return title.trim().slice(0, MAX_TITLE_LENGTH);
}

/**
 * Sanitizes text field by trimming and limiting length.
 * 
 * @param text - Raw text input
 * @param maxLength - Maximum allowed length
 * @returns Sanitized text
 */
export function sanitizeText(text: string | undefined | null, maxLength: number): string {
  if (!text) return '';
  return text.trim().slice(0, maxLength);
}

/**
 * Clamps importance value to valid range.
 * 
 * @param importance - Raw importance value
 * @returns Clamped importance value between MIN_IMPORTANCE and MAX_IMPORTANCE
 */
export function clampImportance(importance: number | undefined | null): number {
  if (importance === undefined || importance === null) {
    return 3; // Default to medium importance
  }
  return Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, Math.round(importance)));
}


// ============================================================================
// CRUD Operations
// Requirements: 1.1, 1.2, 1.3
// ============================================================================

/**
 * Input type for creating a new plot loop.
 * Requires title, description, setupChapterId, and importance.
 */
export interface CreatePlotLoopInput {
  title: string;
  description: string;
  setupChapterId: string;
  importance: number;
  targetChapterId?: string;
  targetVolumeId?: string;
  relatedCharacterIds?: string[];
  relatedWikiEntryIds?: string[];
  parentLoopId?: string;
  aiSuggested?: boolean;
}

/**
 * Creates a new plot loop with all required fields.
 * Generates a unique ID, sets status to OPEN, and initializes timestamps.
 * 
 * Requirements: 1.1
 * - Generates unique ID
 * - Sets status to OPEN
 * - Stores title, description, setupChapterId, importance
 * - Initializes createdAt and updatedAt timestamps
 * 
 * @param input - Plot loop creation input
 * @returns New PlotLoop object
 */
export function createPlotLoop(input: CreatePlotLoopInput): PlotLoop {
  const now = Date.now();
  
  const plotLoop: PlotLoop = {
    id: crypto.randomUUID(),
    title: sanitizeTitle(input.title),
    description: sanitizeText(input.description, MAX_DESCRIPTION_LENGTH),
    setupChapterId: input.setupChapterId,
    status: PlotLoopStatus.OPEN,
    importance: clampImportance(input.importance),
    createdAt: now,
    updatedAt: now,
    // Optional fields
    targetChapterId: input.targetChapterId,
    targetVolumeId: input.targetVolumeId,
    relatedCharacterIds: input.relatedCharacterIds,
    relatedWikiEntryIds: input.relatedWikiEntryIds,
    parentLoopId: input.parentLoopId,
    aiSuggested: input.aiSuggested
  };

  return plotLoop;
}

/**
 * Updates an existing plot loop's fields.
 * Only updates provided fields, preserves others.
 * Updates the updatedAt timestamp.
 * 
 * Requirements: 1.2
 * - Updates only specified fields
 * - Preserves unchanged fields
 * - Updates updatedAt timestamp
 * - Returns updated plot loop
 * 
 * @param plotLoop - The plot loop to update
 * @param updates - Partial plot loop object with fields to update
 * @returns Updated PlotLoop object
 */
export function updatePlotLoop(
  plotLoop: PlotLoop,
  updates: Partial<Omit<PlotLoop, 'id' | 'createdAt'>>
): PlotLoop {
  // Sanitize updates if provided
  const sanitizedUpdates: Partial<PlotLoop> = { ...updates };
  
  if (updates.title !== undefined) {
    sanitizedUpdates.title = sanitizeTitle(updates.title);
  }
  
  if (updates.description !== undefined) {
    sanitizedUpdates.description = sanitizeText(updates.description, MAX_DESCRIPTION_LENGTH);
  }
  
  if (updates.importance !== undefined) {
    sanitizedUpdates.importance = clampImportance(updates.importance);
  }

  return {
    ...plotLoop,
    ...sanitizedUpdates,
    id: plotLoop.id, // Ensure ID is never changed
    createdAt: plotLoop.createdAt, // Ensure createdAt is never changed
    updatedAt: Date.now() // Always update timestamp
  };
}

/**
 * Deletes a plot loop from the array.
 * 
 * Requirements: 1.3
 * - Removes plot loop from storage
 * - Returns updated array without the deleted plot loop
 * 
 * @param plotLoopId - ID of the plot loop to delete
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array without the deleted item
 */
export function deletePlotLoop(
  plotLoopId: string,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.filter(loop => loop.id !== plotLoopId);
}

// ============================================================================
// Query Operations
// Requirements: 1.1, 1.2, 1.3
// ============================================================================

/**
 * Gets a plot loop by its ID.
 * 
 * @param plotLoopId - ID of the plot loop to find
 * @param plotLoops - Array of plot loops to search
 * @returns The plot loop if found, undefined otherwise
 */
export function getPlotLoopById(
  plotLoopId: string,
  plotLoops: PlotLoop[]
): PlotLoop | undefined {
  return plotLoops.find(loop => loop.id === plotLoopId);
}

/**
 * Gets all plot loops.
 * Returns a copy of the array to prevent mutation.
 * 
 * @param plotLoops - Array of plot loops
 * @returns Copy of the plot loops array
 */
export function getAllPlotLoops(plotLoops: PlotLoop[]): PlotLoop[] {
  return [...plotLoops];
}

/**
 * Adds a plot loop to the array.
 * Helper function for state management.
 * 
 * @param plotLoop - Plot loop to add
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function addPlotLoop(plotLoop: PlotLoop, plotLoops: PlotLoop[]): PlotLoop[] {
  return [...plotLoops, plotLoop];
}

/**
 * Updates a plot loop in the array by ID.
 * Helper function for state management.
 * 
 * @param plotLoopId - ID of the plot loop to update
 * @param updates - Partial plot loop object with fields to update
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function updatePlotLoopInArray(
  plotLoopId: string,
  updates: Partial<Omit<PlotLoop, 'id' | 'createdAt'>>,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.map(loop => {
    if (loop.id === plotLoopId) {
      return updatePlotLoop(loop, updates);
    }
    return loop;
  });
}


// ============================================================================
// Status Change Operations
// Requirements: 1.5, 2.4
// ============================================================================

/**
 * Marks a plot loop as closed.
 * Sets status to CLOSED and records the close chapter ID.
 * 
 * Requirements: 1.5
 * - Updates status to CLOSED
 * - Records closeChapterId
 * - Updates updatedAt timestamp
 * 
 * @param plotLoop - The plot loop to close
 * @param closeChapterId - ID of the chapter where the plot loop was closed
 * @returns Updated PlotLoop object with CLOSED status
 */
export function markAsClosed(
  plotLoop: PlotLoop,
  closeChapterId: string
): PlotLoop {
  return updatePlotLoop(plotLoop, {
    status: PlotLoopStatus.CLOSED,
    closeChapterId
  });
}

/**
 * Marks a plot loop as closed in the array.
 * Helper function for state management.
 * 
 * Requirements: 1.5
 * - Updates status to CLOSED
 * - Records closeChapterId
 * 
 * @param plotLoopId - ID of the plot loop to close
 * @param closeChapterId - ID of the chapter where the plot loop was closed
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function markAsClosedInArray(
  plotLoopId: string,
  closeChapterId: string,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.map(loop => {
    if (loop.id === plotLoopId) {
      return markAsClosed(loop, closeChapterId);
    }
    return loop;
  });
}

/**
 * Marks a plot loop as abandoned.
 * Sets status to ABANDONED and records the reason.
 * 
 * Requirements: 2.4
 * - Updates status to ABANDONED
 * - Records abandonReason
 * - Updates updatedAt timestamp
 * 
 * @param plotLoop - The plot loop to abandon
 * @param reason - Reason for abandoning the plot loop
 * @returns Updated PlotLoop object with ABANDONED status
 */
export function markAsAbandoned(
  plotLoop: PlotLoop,
  reason: string
): PlotLoop {
  return updatePlotLoop(plotLoop, {
    status: PlotLoopStatus.ABANDONED,
    abandonReason: sanitizeText(reason, MAX_DESCRIPTION_LENGTH)
  });
}

/**
 * Marks a plot loop as abandoned in the array.
 * Helper function for state management.
 * 
 * Requirements: 2.4
 * - Updates status to ABANDONED
 * - Records abandonReason
 * 
 * @param plotLoopId - ID of the plot loop to abandon
 * @param reason - Reason for abandoning the plot loop
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function markAsAbandonedInArray(
  plotLoopId: string,
  reason: string,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.map(loop => {
    if (loop.id === plotLoopId) {
      return markAsAbandoned(loop, reason);
    }
    return loop;
  });
}


// ============================================================================
// Automatic Status Management - URGENT Detection
// Requirements: 2.1, 2.2, 2.3
// ============================================================================

/** Number of chapters before target that triggers URGENT status */
export const URGENT_CHAPTER_PROXIMITY = 5;

/** Number of chapters without target that flags a loop as needing attention */
export const LONG_OPEN_THRESHOLD = 30;

/**
 * Result of URGENT status check
 */
export interface UrgentCheckResult {
  isUrgent: boolean;
  reason?: string;
}

/**
 * Result of long-open loop check
 */
export interface LongOpenCheckResult {
  needsAttention: boolean;
  chapterGap: number;
  reason?: string;
}

/**
 * Checks if a plot loop should be marked as URGENT based on chapter proximity.
 * 
 * Requirements: 2.1
 * - When current chapter is within 5 chapters of target chapter, return URGENT
 * - Only applies to OPEN status loops with a targetChapterId
 * 
 * @param loop - The plot loop to check
 * @param currentChapter - The current chapter being worked on
 * @param allChapters - All chapters in the novel (used to find target chapter order)
 * @returns UrgentCheckResult indicating if URGENT status should be triggered
 */
export function checkUrgentByChapterProximity(
  loop: PlotLoop,
  currentChapter: Chapter,
  allChapters: Chapter[]
): UrgentCheckResult {
  // Only check OPEN loops with a target chapter
  if (loop.status !== PlotLoopStatus.OPEN || !loop.targetChapterId) {
    return { isUrgent: false };
  }

  // Find the target chapter
  const targetChapter = allChapters.find(ch => ch.id === loop.targetChapterId);
  if (!targetChapter) {
    return { isUrgent: false };
  }

  // Calculate chapter distance
  const chapterDistance = targetChapter.order - currentChapter.order;

  // Check if within proximity threshold (and not past the target)
  if (chapterDistance > 0 && chapterDistance <= URGENT_CHAPTER_PROXIMITY) {
    return {
      isUrgent: true,
      reason: `距离目标章节还有 ${chapterDistance} 章`
    };
  }

  // Also urgent if we've reached or passed the target chapter
  if (chapterDistance <= 0) {
    return {
      isUrgent: true,
      reason: `已到达或超过目标章节`
    };
  }

  return { isUrgent: false };
}

/**
 * Checks if a plot loop should be marked as URGENT based on volume end.
 * 
 * Requirements: 2.2
 * - When current chapter is the last chapter in the target volume, return URGENT
 * - Only applies to OPEN status loops with a targetVolumeId
 * 
 * @param loop - The plot loop to check
 * @param currentChapter - The current chapter being worked on
 * @param volumes - All volumes in the novel
 * @returns UrgentCheckResult indicating if URGENT status should be triggered
 */
export function checkUrgentByVolumeEnd(
  loop: PlotLoop,
  currentChapter: Chapter,
  volumes: Volume[]
): UrgentCheckResult {
  // Only check OPEN loops with a target volume
  if (loop.status !== PlotLoopStatus.OPEN || !loop.targetVolumeId) {
    return { isUrgent: false };
  }

  // Find the target volume
  const targetVolume = volumes.find(v => v.id === loop.targetVolumeId);
  if (!targetVolume || !targetVolume.chapterIds || targetVolume.chapterIds.length === 0) {
    return { isUrgent: false };
  }

  // Check if current chapter is in the target volume
  const isInTargetVolume = targetVolume.chapterIds.includes(currentChapter.id);
  if (!isInTargetVolume) {
    return { isUrgent: false };
  }

  // Check if current chapter is the last chapter in the volume
  const lastChapterId = targetVolume.chapterIds[targetVolume.chapterIds.length - 1];
  if (currentChapter.id === lastChapterId) {
    return {
      isUrgent: true,
      reason: `已到达分卷「${targetVolume.title}」的最后一章`
    };
  }

  return { isUrgent: false };
}

/**
 * Checks if a plot loop has been open for too long without a target.
 * 
 * Requirements: 2.3
 * - When a loop has been OPEN for more than 30 chapters without a target, flag it
 * - Only applies to OPEN status loops without targetChapterId or targetVolumeId
 * 
 * @param loop - The plot loop to check
 * @param currentChapter - The current chapter being worked on
 * @param allChapters - All chapters in the novel (used to find setup chapter order)
 * @returns LongOpenCheckResult indicating if the loop needs attention
 */
export function checkLongOpenLoops(
  loop: PlotLoop,
  currentChapter: Chapter,
  allChapters: Chapter[]
): LongOpenCheckResult {
  // Only check OPEN loops without a target
  if (loop.status !== PlotLoopStatus.OPEN) {
    return { needsAttention: false, chapterGap: 0 };
  }

  // If loop has a target, it doesn't need this check
  if (loop.targetChapterId || loop.targetVolumeId) {
    return { needsAttention: false, chapterGap: 0 };
  }

  // Find the setup chapter
  const setupChapter = allChapters.find(ch => ch.id === loop.setupChapterId);
  if (!setupChapter) {
    return { needsAttention: false, chapterGap: 0 };
  }

  // Calculate chapter gap
  const chapterGap = currentChapter.order - setupChapter.order;

  // Check if exceeds threshold
  if (chapterGap > LONG_OPEN_THRESHOLD) {
    return {
      needsAttention: true,
      chapterGap,
      reason: `伏笔已开放 ${chapterGap} 章，建议设置目标章节或回收`
    };
  }

  return { needsAttention: false, chapterGap };
}

/**
 * Performs all URGENT status checks on a plot loop.
 * Combines chapter proximity and volume end checks.
 * 
 * Requirements: 2.1, 2.2
 * 
 * @param loop - The plot loop to check
 * @param currentChapter - The current chapter being worked on
 * @param allChapters - All chapters in the novel
 * @param volumes - All volumes in the novel
 * @returns UrgentCheckResult indicating if URGENT status should be triggered
 */
export function checkUrgentStatus(
  loop: PlotLoop,
  currentChapter: Chapter,
  allChapters: Chapter[],
  volumes: Volume[]
): UrgentCheckResult {
  // Check chapter proximity first
  const proximityResult = checkUrgentByChapterProximity(loop, currentChapter, allChapters);
  if (proximityResult.isUrgent) {
    return proximityResult;
  }

  // Check volume end
  const volumeResult = checkUrgentByVolumeEnd(loop, currentChapter, volumes);
  if (volumeResult.isUrgent) {
    return volumeResult;
  }

  return { isUrgent: false };
}

/**
 * Updates a plot loop's status to URGENT if conditions are met.
 * 
 * Requirements: 2.1, 2.2
 * 
 * @param loop - The plot loop to potentially update
 * @param currentChapter - The current chapter being worked on
 * @param allChapters - All chapters in the novel
 * @param volumes - All volumes in the novel
 * @returns Updated PlotLoop if status changed, original loop otherwise
 */
export function updateToUrgentIfNeeded(
  loop: PlotLoop,
  currentChapter: Chapter,
  allChapters: Chapter[],
  volumes: Volume[]
): PlotLoop {
  // Only update OPEN loops
  if (loop.status !== PlotLoopStatus.OPEN) {
    return loop;
  }

  const urgentResult = checkUrgentStatus(loop, currentChapter, allChapters, volumes);
  
  if (urgentResult.isUrgent) {
    return updatePlotLoop(loop, { status: PlotLoopStatus.URGENT });
  }

  return loop;
}

/**
 * Checks and updates all plot loops for URGENT status.
 * Returns the updated array of plot loops.
 * 
 * Requirements: 2.1, 2.2
 * 
 * @param plotLoops - All plot loops to check
 * @param currentChapter - The current chapter being worked on
 * @param allChapters - All chapters in the novel
 * @param volumes - All volumes in the novel
 * @returns Updated array of plot loops with URGENT status applied where needed
 */
export function checkAndUpdateAllUrgentStatus(
  plotLoops: PlotLoop[],
  currentChapter: Chapter,
  allChapters: Chapter[],
  volumes: Volume[]
): PlotLoop[] {
  return plotLoops.map(loop => 
    updateToUrgentIfNeeded(loop, currentChapter, allChapters, volumes)
  );
}

/**
 * Gets all plot loops that need attention (long-open without target).
 * 
 * Requirements: 2.3
 * 
 * @param plotLoops - All plot loops to check
 * @param currentChapter - The current chapter being worked on
 * @param allChapters - All chapters in the novel
 * @returns Array of plot loops that need attention with their check results
 */
export function getLoopsNeedingAttention(
  plotLoops: PlotLoop[],
  currentChapter: Chapter,
  allChapters: Chapter[]
): Array<{ loop: PlotLoop; result: LongOpenCheckResult }> {
  return plotLoops
    .map(loop => ({
      loop,
      result: checkLongOpenLoops(loop, currentChapter, allChapters)
    }))
    .filter(item => item.result.needsAttention);
}


// ============================================================================
// Grouping and Filtering Operations
// Requirements: 3.1, 3.2, 3.3, 3.4
// ============================================================================

/**
 * Status priority order for grouping.
 * URGENT (0) → OPEN (1) → CLOSED (2) → ABANDONED (3)
 */
const STATUS_PRIORITY: Record<PlotLoopStatus, number> = {
  [PlotLoopStatus.URGENT]: 0,
  [PlotLoopStatus.OPEN]: 1,
  [PlotLoopStatus.CLOSED]: 2,
  [PlotLoopStatus.ABANDONED]: 3
};

/**
 * Groups plot loops by status in priority order: URGENT → OPEN → CLOSED → ABANDONED.
 * 
 * Requirements: 3.1
 * - Returns loops grouped by status
 * - Order: URGENT first, then OPEN, then CLOSED, then ABANDONED
 * 
 * @param loops - Array of plot loops to group
 * @returns Sorted array of plot loops by status priority
 */
export function groupByStatus(loops: PlotLoop[]): PlotLoop[] {
  return [...loops].sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status];
    const priorityB = STATUS_PRIORITY[b.status];
    return priorityA - priorityB;
  });
}

/**
 * Filters plot loops by importance level.
 * 
 * Requirements: 3.2
 * - Returns only loops matching the specified importance level
 * 
 * @param loops - Array of plot loops to filter
 * @param importance - Importance level to filter by (1-5)
 * @returns Filtered array of plot loops with matching importance
 */
export function filterByImportance(loops: PlotLoop[], importance: number): PlotLoop[] {
  return loops.filter(loop => loop.importance === importance);
}

/**
 * Filters plot loops by related chapter.
 * Returns loops where the chapter is either the setup chapter, target chapter, or close chapter.
 * 
 * Requirements: 3.3
 * - Returns only loops associated with the specified chapter
 * 
 * @param loops - Array of plot loops to filter
 * @param chapterId - Chapter ID to filter by
 * @returns Filtered array of plot loops associated with the chapter
 */
export function filterByChapter(loops: PlotLoop[], chapterId: string): PlotLoop[] {
  return loops.filter(loop => 
    loop.setupChapterId === chapterId ||
    loop.targetChapterId === chapterId ||
    loop.closeChapterId === chapterId
  );
}

/**
 * Filters plot loops by target volume.
 * 
 * Requirements: 3.3
 * - Returns only loops with the specified target volume
 * 
 * @param loops - Array of plot loops to filter
 * @param volumeId - Volume ID to filter by
 * @returns Filtered array of plot loops with matching target volume
 */
export function filterByVolume(loops: PlotLoop[], volumeId: string): PlotLoop[] {
  return loops.filter(loop => loop.targetVolumeId === volumeId);
}

/**
 * Searches plot loops by keyword in title or description.
 * Case-insensitive search.
 * 
 * Requirements: 3.4
 * - Returns loops whose title or description contains the keyword
 * - Search is case-insensitive
 * 
 * @param loops - Array of plot loops to search
 * @param keyword - Keyword to search for
 * @returns Filtered array of plot loops matching the keyword
 */
export function searchByKeyword(loops: PlotLoop[], keyword: string): PlotLoop[] {
  const lowerKeyword = keyword.toLowerCase().trim();
  if (lowerKeyword.length === 0) {
    return [...loops];
  }
  return loops.filter(loop => 
    loop.title.toLowerCase().includes(lowerKeyword) ||
    loop.description.toLowerCase().includes(lowerKeyword)
  );
}


// ============================================================================
// Association Management Operations
// Requirements: 5.1, 5.2, 5.3
// ============================================================================

/**
 * Links characters to a plot loop.
 * Replaces any existing character associations.
 * 
 * Requirements: 5.1
 * - Stores character IDs in relatedCharacterIds
 * - Updates updatedAt timestamp
 * 
 * @param loopId - ID of the plot loop to update
 * @param characterIds - Array of character IDs to link
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function linkCharacters(
  loopId: string,
  characterIds: string[],
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.map(loop => {
    if (loop.id === loopId) {
      return updatePlotLoop(loop, {
        relatedCharacterIds: [...characterIds]
      });
    }
    return loop;
  });
}

/**
 * Links wiki entries to a plot loop.
 * Replaces any existing wiki entry associations.
 * 
 * Requirements: 5.2
 * - Stores wiki entry IDs in relatedWikiEntryIds
 * - Updates updatedAt timestamp
 * 
 * @param loopId - ID of the plot loop to update
 * @param wikiEntryIds - Array of wiki entry IDs to link
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function linkWikiEntries(
  loopId: string,
  wikiEntryIds: string[],
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.map(loop => {
    if (loop.id === loopId) {
      return updatePlotLoop(loop, {
        relatedWikiEntryIds: [...wikiEntryIds]
      });
    }
    return loop;
  });
}

/**
 * Gets all plot loops associated with a specific character.
 * Reverse lookup from character to plot loops.
 * 
 * Requirements: 5.3
 * - Returns all loops that have the character ID in relatedCharacterIds
 * 
 * @param characterId - Character ID to search for
 * @param plotLoops - Array of plot loops to search
 * @returns Array of plot loops associated with the character
 */
export function getLoopsByCharacter(
  characterId: string,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.filter(loop => 
    loop.relatedCharacterIds?.includes(characterId) ?? false
  );
}

/**
 * Gets all plot loops associated with a specific wiki entry.
 * Reverse lookup from wiki entry to plot loops.
 * 
 * Requirements: 5.3
 * - Returns all loops that have the wiki entry ID in relatedWikiEntryIds
 * 
 * @param wikiEntryId - Wiki entry ID to search for
 * @param plotLoops - Array of plot loops to search
 * @returns Array of plot loops associated with the wiki entry
 */
export function getLoopsByWikiEntry(
  wikiEntryId: string,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.filter(loop => 
    loop.relatedWikiEntryIds?.includes(wikiEntryId) ?? false
  );
}


// ============================================================================
// Plot Loop Chain Management Operations
// Requirements: 6.1, 6.2, 6.3, 6.4
// ============================================================================

/**
 * Result of checking for unclosed children
 */
export interface UnclosedChildrenResult {
  hasUnclosedChildren: boolean;
  unclosedChildren: PlotLoop[];
  message?: string;
}

/**
 * Result of suggesting parent closure
 */
export interface ParentClosureSuggestion {
  shouldClose: boolean;
  parentLoop: PlotLoop | undefined;
  closedChildrenCount: number;
  message?: string;
}

/**
 * Sets a parent-child relationship between plot loops.
 * Updates the child loop's parentLoopId field.
 * 
 * Requirements: 6.1
 * - Stores the parent-child relationship
 * - Updates updatedAt timestamp
 * - Prevents circular references (cannot set self as parent)
 * 
 * @param childId - ID of the child plot loop
 * @param parentId - ID of the parent plot loop (or undefined to remove parent)
 * @param plotLoops - Current array of plot loops
 * @returns Updated plot loops array
 */
export function setParentLoop(
  childId: string,
  parentId: string | undefined,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  // Prevent setting self as parent
  if (childId === parentId) {
    return plotLoops;
  }

  // Prevent circular references - check if parentId is a descendant of childId
  if (parentId) {
    const isDescendant = isLoopDescendantOf(parentId, childId, plotLoops);
    if (isDescendant) {
      return plotLoops;
    }
  }

  return plotLoops.map(loop => {
    if (loop.id === childId) {
      return updatePlotLoop(loop, {
        parentLoopId: parentId
      });
    }
    return loop;
  });
}

/**
 * Checks if a loop is a descendant of another loop.
 * Used to prevent circular references.
 * 
 * @param loopId - ID of the loop to check
 * @param potentialAncestorId - ID of the potential ancestor
 * @param plotLoops - Array of all plot loops
 * @returns true if loopId is a descendant of potentialAncestorId
 */
function isLoopDescendantOf(
  loopId: string,
  potentialAncestorId: string,
  plotLoops: PlotLoop[]
): boolean {
  const children = getChildLoops(potentialAncestorId, plotLoops);
  
  for (const child of children) {
    if (child.id === loopId) {
      return true;
    }
    // Recursively check descendants
    if (isLoopDescendantOf(loopId, child.id, plotLoops)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Gets all child plot loops of a parent loop.
 * 
 * Requirements: 6.3
 * - Returns all loops that have the specified parentLoopId
 * 
 * @param parentId - ID of the parent plot loop
 * @param plotLoops - Array of all plot loops
 * @returns Array of child plot loops
 */
export function getChildLoops(
  parentId: string,
  plotLoops: PlotLoop[]
): PlotLoop[] {
  return plotLoops.filter(loop => loop.parentLoopId === parentId);
}

/**
 * Checks for unclosed children when attempting to close a parent loop.
 * 
 * Requirements: 6.2
 * - Returns information about any child loops that are still OPEN or URGENT
 * - Used to notify user about unclosed children before closing parent
 * 
 * @param parentId - ID of the parent plot loop
 * @param plotLoops - Array of all plot loops
 * @returns UnclosedChildrenResult with unclosed children information
 */
export function checkUnclosedChildren(
  parentId: string,
  plotLoops: PlotLoop[]
): UnclosedChildrenResult {
  const children = getChildLoops(parentId, plotLoops);
  
  const unclosedChildren = children.filter(child => 
    child.status === PlotLoopStatus.OPEN || 
    child.status === PlotLoopStatus.URGENT
  );

  if (unclosedChildren.length > 0) {
    return {
      hasUnclosedChildren: true,
      unclosedChildren,
      message: `存在 ${unclosedChildren.length} 个未关闭的子伏笔`
    };
  }

  return {
    hasUnclosedChildren: false,
    unclosedChildren: []
  };
}

/**
 * Suggests closing a parent loop when all its children are closed.
 * 
 * Requirements: 6.4
 * - Checks if all child loops have CLOSED status
 * - Returns suggestion to close parent if all children are closed
 * - Only suggests for OPEN or URGENT parent loops
 * 
 * @param parentId - ID of the parent plot loop
 * @param plotLoops - Array of all plot loops
 * @returns ParentClosureSuggestion with closure recommendation
 */
export function suggestParentClosure(
  parentId: string,
  plotLoops: PlotLoop[]
): ParentClosureSuggestion {
  const parentLoop = plotLoops.find(loop => loop.id === parentId);
  
  if (!parentLoop) {
    return {
      shouldClose: false,
      parentLoop: undefined,
      closedChildrenCount: 0,
      message: '未找到父伏笔'
    };
  }

  // Only suggest for OPEN or URGENT parent loops
  if (parentLoop.status !== PlotLoopStatus.OPEN && 
      parentLoop.status !== PlotLoopStatus.URGENT) {
    return {
      shouldClose: false,
      parentLoop,
      closedChildrenCount: 0,
      message: '父伏笔已关闭或废弃'
    };
  }

  const children = getChildLoops(parentId, plotLoops);
  
  // If no children, don't suggest closure based on children
  if (children.length === 0) {
    return {
      shouldClose: false,
      parentLoop,
      closedChildrenCount: 0,
      message: '没有子伏笔'
    };
  }

  const closedChildren = children.filter(child => 
    child.status === PlotLoopStatus.CLOSED
  );

  // All children must be closed (not abandoned)
  const allChildrenClosed = closedChildren.length === children.length;

  if (allChildrenClosed) {
    return {
      shouldClose: true,
      parentLoop,
      closedChildrenCount: closedChildren.length,
      message: `所有 ${closedChildren.length} 个子伏笔已关闭，建议关闭父伏笔「${parentLoop.title}」`
    };
  }

  return {
    shouldClose: false,
    parentLoop,
    closedChildrenCount: closedChildren.length,
    message: `${closedChildren.length}/${children.length} 个子伏笔已关闭`
  };
}

/**
 * Gets the full hierarchy of a plot loop (ancestors and descendants).
 * 
 * Requirements: 6.3
 * - Returns the loop with its parent chain and children
 * 
 * @param loopId - ID of the plot loop
 * @param plotLoops - Array of all plot loops
 * @returns Object containing the loop, its ancestors, and descendants
 */
export function getLoopHierarchy(
  loopId: string,
  plotLoops: PlotLoop[]
): { loop: PlotLoop | undefined; ancestors: PlotLoop[]; descendants: PlotLoop[] } {
  const loop = plotLoops.find(l => l.id === loopId);
  
  if (!loop) {
    return { loop: undefined, ancestors: [], descendants: [] };
  }

  // Get ancestors (parent chain)
  const ancestors: PlotLoop[] = [];
  let currentParentId = loop.parentLoopId;
  while (currentParentId) {
    const parent = plotLoops.find(l => l.id === currentParentId);
    if (parent) {
      ancestors.push(parent);
      currentParentId = parent.parentLoopId;
    } else {
      break;
    }
  }

  // Get all descendants recursively
  const descendants = getAllDescendants(loopId, plotLoops);

  return { loop, ancestors, descendants };
}

/**
 * Gets all descendants of a plot loop recursively.
 * 
 * @param loopId - ID of the plot loop
 * @param plotLoops - Array of all plot loops
 * @returns Array of all descendant plot loops
 */
function getAllDescendants(loopId: string, plotLoops: PlotLoop[]): PlotLoop[] {
  const children = getChildLoops(loopId, plotLoops);
  const descendants: PlotLoop[] = [...children];
  
  for (const child of children) {
    const childDescendants = getAllDescendants(child.id, plotLoops);
    descendants.push(...childDescendants);
  }
  
  return descendants;
}


// ============================================================================
// AI Integration Operations
// Requirements: 4.1, 4.2, 4.4
// ============================================================================

/**
 * Builds a context string for AI prompts containing relevant plot loops.
 * Includes all OPEN and URGENT loops, excludes CLOSED and ABANDONED.
 * URGENT loops are marked with priority indicators.
 * 
 * Requirements: 4.1, 4.2, 4.4
 * - Includes all OPEN and URGENT plot loops
 * - Excludes CLOSED and ABANDONED loops
 * - URGENT loops trigger priority instruction in prompt
 * 
 * @param currentChapterId - ID of the current chapter being worked on
 * @param allLoops - All plot loops in the project
 * @returns Formatted context string for AI prompt injection
 */
export function buildLoopContextForPrompt(
  currentChapterId: string | null,
  allLoops: PlotLoop[]
): string {
  // Filter to only OPEN and URGENT loops
  const activeLoops = allLoops.filter(loop => 
    loop.status === PlotLoopStatus.OPEN || 
    loop.status === PlotLoopStatus.URGENT
  );

  if (activeLoops.length === 0) {
    return '';
  }

  // Separate URGENT and OPEN loops
  const urgentLoops = activeLoops.filter(loop => loop.status === PlotLoopStatus.URGENT);
  const openLoops = activeLoops.filter(loop => loop.status === PlotLoopStatus.OPEN);

  let context = '=== 伏笔追踪 ===\n';

  // Add URGENT loops with priority indicator
  if (urgentLoops.length > 0) {
    context += '\n【紧急伏笔 - 需优先处理】\n';
    urgentLoops.forEach((loop, index) => {
      context += `${index + 1}. [紧急] ${loop.title}`;
      if (loop.importance >= 4) {
        context += ` (重要程度: ${loop.importance}/5)`;
      }
      context += `\n   描述: ${loop.description.slice(0, 150)}${loop.description.length > 150 ? '...' : ''}\n`;
    });
    context += '\n⚠️ 请在本章内容中优先考虑回收或推进上述紧急伏笔。\n';
  }

  // Add OPEN loops
  if (openLoops.length > 0) {
    context += '\n【待回收伏笔】\n';
    // Sort by importance (higher first)
    const sortedOpenLoops = [...openLoops].sort((a, b) => b.importance - a.importance);
    sortedOpenLoops.forEach((loop, index) => {
      context += `${index + 1}. ${loop.title}`;
      if (loop.importance >= 4) {
        context += ` (重要程度: ${loop.importance}/5)`;
      }
      context += `\n   描述: ${loop.description.slice(0, 100)}${loop.description.length > 100 ? '...' : ''}\n`;
    });
    context += '\n请在适当时机自然地推进或回收上述伏笔。\n';
  }

  return context;
}

/**
 * Checks if there are any URGENT loops that should trigger priority handling.
 * 
 * Requirements: 4.2
 * - Returns true if any URGENT loops exist
 * 
 * @param allLoops - All plot loops in the project
 * @returns true if there are URGENT loops
 */
export function hasUrgentLoops(allLoops: PlotLoop[]): boolean {
  return allLoops.some(loop => loop.status === PlotLoopStatus.URGENT);
}

/**
 * Gets all active (OPEN or URGENT) plot loops.
 * 
 * Requirements: 4.1, 4.4
 * 
 * @param allLoops - All plot loops in the project
 * @returns Array of active plot loops
 */
export function getActiveLoops(allLoops: PlotLoop[]): PlotLoop[] {
  return allLoops.filter(loop => 
    loop.status === PlotLoopStatus.OPEN || 
    loop.status === PlotLoopStatus.URGENT
  );
}


// ============================================================================
// AI Suggestion Parsing Operations
// Requirements: 7.2, 7.3
// ============================================================================

/**
 * Represents an AI-suggested plot loop extracted from AI response.
 */
export interface AISuggestedLoop {
  title: string;
  description: string;
  importance?: number;
}

/**
 * Parses AI response to extract suggested plot loops.
 * Supports multiple formats:
 * - JSON array format: [{ title, description, importance? }]
 * - Markdown format with headers and descriptions
 * - Plain text format with numbered items
 * 
 * Requirements: 7.2
 * - Extracts title and description for each suggested loop
 * - Handles various AI response formats gracefully
 * 
 * @param aiResponse - Raw AI response text
 * @returns Array of extracted plot loop suggestions
 */
export function parseAISuggestedLoops(aiResponse: string): AISuggestedLoop[] {
  if (!aiResponse || aiResponse.trim().length === 0) {
    return [];
  }

  const suggestions: AISuggestedLoop[] = [];

  // Try JSON format first
  try {
    // Look for JSON array in the response
    const jsonMatch = aiResponse.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && item.title) {
            suggestions.push({
              title: sanitizeTitle(item.title),
              description: sanitizeText(item.description || '', MAX_DESCRIPTION_LENGTH),
              importance: item.importance ? clampImportance(item.importance) : undefined
            });
          }
        }
        if (suggestions.length > 0) {
          return suggestions;
        }
      }
    }
  } catch {
    // JSON parsing failed, try other formats
  }

  // Try markdown format: ## Title\nDescription
  const markdownPattern = /##\s*(.+?)\n([\s\S]*?)(?=##|$)/g;
  let markdownMatch;
  while ((markdownMatch = markdownPattern.exec(aiResponse)) !== null) {
    const title = markdownMatch[1].trim();
    const description = markdownMatch[2].trim();
    if (title && description) {
      suggestions.push({
        title: sanitizeTitle(title),
        description: sanitizeText(description, MAX_DESCRIPTION_LENGTH)
      });
    }
  }
  if (suggestions.length > 0) {
    return suggestions;
  }

  // Try numbered list format: 1. Title: Description or 1. Title\nDescription
  const numberedPattern = /\d+\.\s*(?:\*\*)?(.+?)(?:\*\*)?[:\n]\s*([\s\S]*?)(?=\d+\.|$)/g;
  let numberedMatch;
  while ((numberedMatch = numberedPattern.exec(aiResponse)) !== null) {
    const title = numberedMatch[1].trim().replace(/\*\*/g, '');
    const description = numberedMatch[2].trim();
    if (title && description) {
      suggestions.push({
        title: sanitizeTitle(title),
        description: sanitizeText(description, MAX_DESCRIPTION_LENGTH)
      });
    }
  }
  if (suggestions.length > 0) {
    return suggestions;
  }

  // Try bullet point format: - Title: Description
  const bulletPattern = /[-•]\s*(?:\*\*)?(.+?)(?:\*\*)?[:\n]\s*([\s\S]*?)(?=[-•]|$)/g;
  let bulletMatch;
  while ((bulletMatch = bulletPattern.exec(aiResponse)) !== null) {
    const title = bulletMatch[1].trim().replace(/\*\*/g, '');
    const description = bulletMatch[2].trim();
    if (title && description) {
      suggestions.push({
        title: sanitizeTitle(title),
        description: sanitizeText(description, MAX_DESCRIPTION_LENGTH)
      });
    }
  }

  return suggestions;
}

/**
 * Creates a plot loop from an AI suggestion.
 * Sets aiSuggested flag to true and links to the current chapter.
 * 
 * Requirements: 7.3
 * - Creates loop with aiSuggested=true
 * - Sets setupChapterId to current chapter
 * - Uses suggested title and description
 * 
 * @param suggestion - AI-suggested plot loop data
 * @param currentChapterId - ID of the current chapter
 * @returns New PlotLoop object created from the suggestion
 */
export function createFromAISuggestion(
  suggestion: AISuggestedLoop,
  currentChapterId: string
): PlotLoop {
  return createPlotLoop({
    title: suggestion.title,
    description: suggestion.description,
    setupChapterId: currentChapterId,
    importance: suggestion.importance ?? 3, // Default to medium importance
    aiSuggested: true
  });
}

/**
 * Creates multiple plot loops from AI suggestions.
 * Convenience function for batch creation.
 * 
 * Requirements: 7.3
 * 
 * @param suggestions - Array of AI-suggested plot loop data
 * @param currentChapterId - ID of the current chapter
 * @returns Array of new PlotLoop objects
 */
export function createMultipleFromAISuggestions(
  suggestions: AISuggestedLoop[],
  currentChapterId: string
): PlotLoop[] {
  return suggestions.map(suggestion => 
    createFromAISuggestion(suggestion, currentChapterId)
  );
}

/**
 * Volume Management Service
 * 
 * Core logic for managing volumes (分卷) in InkFlow.
 * Implements Requirements: 1.1, 1.2, 1.4, 1.5
 */

import { Volume, Chapter } from '../types';

// ============================================================================
// Validation Constants and Functions
// Requirements: 1.4, 2.4, 3.5
// ============================================================================

/** Maximum length for volume title */
export const MAX_TITLE_LENGTH = 100;

/** Maximum length for volume summary */
export const MAX_SUMMARY_LENGTH = 500;

/** Maximum length for core conflict */
export const MAX_CONFLICT_LENGTH = 300;

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validates volume data before creation or update.
 * 
 * Requirements: 1.4 (data validation)
 * - Title must not be empty and within length limit
 * - Summary within length limit
 * - Core conflict within length limit
 * 
 * @param data - Volume data to validate
 * @returns ValidationResult with isValid flag and error messages
 */
export function validateVolumeData(data: {
  title?: string;
  summary?: string;
  coreConflict?: string;
  expectedWordCount?: number;
}): ValidationResult {
  const errors: string[] = [];

  // Validate title
  if (data.title !== undefined) {
    const trimmedTitle = data.title.trim();
    if (trimmedTitle.length === 0) {
      errors.push('分卷标题不能为空');
    } else if (trimmedTitle.length > MAX_TITLE_LENGTH) {
      errors.push(`分卷标题不能超过 ${MAX_TITLE_LENGTH} 个字符`);
    }
  }

  // Validate summary
  if (data.summary !== undefined && data.summary.length > MAX_SUMMARY_LENGTH) {
    errors.push(`分卷摘要不能超过 ${MAX_SUMMARY_LENGTH} 个字符`);
  }

  // Validate core conflict
  if (data.coreConflict !== undefined && data.coreConflict.length > MAX_CONFLICT_LENGTH) {
    errors.push(`核心冲突不能超过 ${MAX_CONFLICT_LENGTH} 个字符`);
  }

  // Validate expected word count
  if (data.expectedWordCount !== undefined) {
    if (data.expectedWordCount < 0) {
      errors.push('预期字数不能为负数');
    } else if (data.expectedWordCount > 10000000) {
      errors.push('预期字数不能超过 1000 万');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Sanitizes volume title by trimming and providing default value.
 * 
 * @param title - Raw title input
 * @returns Sanitized title
 */
export function sanitizeTitle(title: string | undefined | null): string {
  if (!title || title.trim().length === 0) {
    return '未命名分卷';
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
 * Creates a new volume with all required fields.
 * Generates a unique ID, sets the order based on existing volumes.
 * 
 * Requirements: 1.1
 * - Generates unique ID
 * - Sets title, summary, coreConflict
 * - Assigns order number (1-based)
 * - Initializes chapterIds as empty array
 * 
 * @param title - Volume title (e.g., "第一卷：崛起")
 * @param summary - Volume summary (100-300 characters)
 * @param coreConflict - Core conflict of this volume
 * @param existingVolumes - Array of existing volumes to determine order
 * @param expectedWordCount - Optional expected word count
 * @returns New Volume object
 */
export function createVolume(
  title: string,
  summary: string,
  coreConflict: string,
  existingVolumes: Volume[] = [],
  expectedWordCount?: number
): Volume {
  // Calculate next order number (1-based)
  const maxOrder = existingVolumes.reduce(
    (max, v) => Math.max(max, v.order),
    0
  );

  // Sanitize inputs
  const sanitizedTitle = sanitizeTitle(title);
  const sanitizedSummary = sanitizeText(summary, MAX_SUMMARY_LENGTH);
  const sanitizedConflict = sanitizeText(coreConflict, MAX_CONFLICT_LENGTH);

  const volume: Volume = {
    id: crypto.randomUUID(),
    title: sanitizedTitle,
    summary: sanitizedSummary,
    coreConflict: sanitizedConflict,
    order: maxOrder + 1,
    chapterIds: [],
    expectedWordCount: expectedWordCount && expectedWordCount > 0 ? expectedWordCount : undefined
  };

  return volume;
}

/**
 * Updates an existing volume's fields.
 * Only updates provided fields, preserves others.
 * 
 * Requirements: 1.5
 * - Updates title, summary, coreConflict fields
 * - Preserves unchanged fields
 * - Returns updated volume
 * 
 * @param volume - The volume to update
 * @param updates - Partial volume object with fields to update
 * @returns Updated Volume object
 */
export function updateVolume(
  volume: Volume,
  updates: Partial<Omit<Volume, 'id'>>
): Volume {
  return {
    ...volume,
    ...updates,
    id: volume.id // Ensure ID is never changed
  };
}


/**
 * Deletes a volume and clears volumeId from all associated chapters.
 * The chapters themselves are preserved, only their volumeId is set to null.
 * 
 * Requirements: 1.4
 * - Removes volume from volumes array
 * - Sets volumeId to null for all chapters that were in this volume
 * - Preserves chapters themselves
 * 
 * @param volumeId - ID of the volume to delete
 * @param volumes - Current array of volumes
 * @param chapters - Current array of chapters
 * @returns Object containing updated volumes and chapters arrays
 */
export function deleteVolume(
  volumeId: string,
  volumes: Volume[],
  chapters: Chapter[]
): { volumes: Volume[]; chapters: Chapter[] } {
  // Find the volume to delete
  const volumeToDelete = volumes.find(v => v.id === volumeId);
  
  // If volume doesn't exist, return unchanged arrays
  if (!volumeToDelete) {
    return { volumes, chapters };
  }

  // Remove the volume from the array
  const updatedVolumes = volumes.filter(v => v.id !== volumeId);

  // Clear volumeId for all chapters that belonged to this volume
  const updatedChapters = chapters.map(chapter => {
    if (chapter.volumeId === volumeId) {
      return {
        ...chapter,
        volumeId: null
      };
    }
    return chapter;
  });

  return {
    volumes: updatedVolumes,
    chapters: updatedChapters
  };
}

/**
 * Moves a chapter to a volume (or removes from volume if volumeId is null).
 * Updates both the chapter's volumeId and the volume's chapterIds array.
 * 
 * Requirements: 1.2
 * - Updates chapter's volumeId field
 * - Adds chapter ID to target volume's chapterIds array
 * - Removes chapter ID from previous volume's chapterIds (if any)
 * - Maintains chapter order within volume
 * 
 * @param chapterId - ID of the chapter to move
 * @param targetVolumeId - ID of the target volume (null to remove from volume)
 * @param volumes - Current array of volumes
 * @param chapters - Current array of chapters
 * @returns Object containing updated volumes and chapters arrays
 */
export function moveChapterToVolume(
  chapterId: string,
  targetVolumeId: string | null,
  volumes: Volume[],
  chapters: Chapter[]
): { volumes: Volume[]; chapters: Chapter[] } {
  // Find the chapter
  const chapter = chapters.find(c => c.id === chapterId);
  
  // If chapter doesn't exist, return unchanged arrays
  if (!chapter) {
    return { volumes, chapters };
  }

  const previousVolumeId = chapter.volumeId;

  // Update the chapter's volumeId
  const updatedChapters = chapters.map(c => {
    if (c.id === chapterId) {
      return {
        ...c,
        volumeId: targetVolumeId
      };
    }
    return c;
  });

  // Update volumes' chapterIds arrays
  const updatedVolumes = volumes.map(volume => {
    // Ensure chapterIds is an array
    const currentChapterIds = volume.chapterIds || [];
    
    // Remove chapter from previous volume
    if (previousVolumeId && volume.id === previousVolumeId) {
      return {
        ...volume,
        chapterIds: currentChapterIds.filter(id => id !== chapterId)
      };
    }
    
    // Add chapter to target volume
    if (targetVolumeId && volume.id === targetVolumeId) {
      // Only add if not already present
      if (!currentChapterIds.includes(chapterId)) {
        return {
          ...volume,
          chapterIds: [...currentChapterIds, chapterId]
        };
      }
    }
    
    return volume;
  });

  return {
    volumes: updatedVolumes,
    chapters: updatedChapters
  };
}

/**
 * Adds a volume to the volumes array.
 * Helper function for state management.
 * 
 * @param volume - Volume to add
 * @param volumes - Current array of volumes
 * @returns Updated volumes array
 */
export function addVolume(volume: Volume, volumes: Volume[]): Volume[] {
  return [...volumes, volume];
}

/**
 * Updates a volume in the volumes array by ID.
 * Helper function for state management.
 * 
 * @param volumeId - ID of the volume to update
 * @param updates - Partial volume object with fields to update
 * @param volumes - Current array of volumes
 * @returns Updated volumes array
 */
export function updateVolumeInArray(
  volumeId: string,
  updates: Partial<Omit<Volume, 'id'>>,
  volumes: Volume[]
): Volume[] {
  return volumes.map(volume => {
    if (volume.id === volumeId) {
      return updateVolume(volume, updates);
    }
    return volume;
  });
}

/**
 * Reorders volumes by updating their order field.
 * Useful for drag-and-drop reordering.
 * 
 * @param volumeIds - Array of volume IDs in the desired order
 * @param volumes - Current array of volumes
 * @returns Updated volumes array with corrected order fields
 */
export function reorderVolumes(
  volumeIds: string[],
  volumes: Volume[]
): Volume[] {
  return volumes.map(volume => {
    const newOrder = volumeIds.indexOf(volume.id);
    if (newOrder !== -1) {
      return {
        ...volume,
        order: newOrder + 1 // 1-based ordering
      };
    }
    return volume;
  });
}


// ============================================================================
// Volume Statistics and Utility Functions
// Requirements: 1.3, 2.2, 2.3
// ============================================================================

/**
 * Statistics for a volume
 */
export interface VolumeStats {
  chapterCount: number;      // Number of chapters in the volume
  totalWordCount: number;    // Sum of all chapter word counts
  completedChapters: number; // Chapters with content
}

/**
 * Calculates statistics for a volume including chapter count and total word count.
 * 
 * Requirements: 1.3
 * - Returns chapter count equal to chapterIds array length
 * - Returns total word count as sum of all associated chapters' wordCount
 * 
 * @param volume - The volume to calculate stats for
 * @param chapters - All chapters in the project
 * @returns VolumeStats object with chapterCount and totalWordCount
 */
export function getVolumeStats(
  volume: Volume,
  chapters: Chapter[]
): VolumeStats {
  // Use chapter.volumeId as the source of truth (more reliable)
  const volumeChapters = chapters.filter(
    chapter => chapter.volumeId === volume.id
  );

  // Calculate total word count
  const totalWordCount = volumeChapters.reduce(
    (sum, chapter) => sum + (chapter.wordCount || 0),
    0
  );

  // Count chapters with content (completed)
  const completedChapters = volumeChapters.filter(
    chapter => chapter.content && chapter.content.trim().length > 0
  ).length;

  return {
    chapterCount: volumeChapters.length,
    totalWordCount,
    completedChapters
  };
}

/**
 * Calculates the progress of a chapter within its volume.
 * Returns the position as "current/total" and percentage.
 * 
 * Requirements: 2.2
 * - Progress percentage = (chapter position in volume / total chapters in volume) × 100
 * - Position is 1-based (first chapter is position 1)
 * 
 * @param chapter - The chapter to calculate progress for
 * @param volumes - All volumes in the project
 * @param chapters - All chapters in the project
 * @returns Object with position, total, and percentage, or null if chapter not in a volume
 */
export function getVolumeProgress(
  chapter: Chapter,
  volumes: Volume[],
  chapters: Chapter[]
): { position: number; total: number; percentage: number } | null {
  // If chapter doesn't belong to a volume, return null
  if (!chapter.volumeId) {
    return null;
  }

  // Find the volume
  const volume = volumes.find(v => v.id === chapter.volumeId);
  if (!volume) {
    return null;
  }

  // Use chapter.volumeId as the source of truth
  const volumeChapters = chapters
    .filter(c => c.volumeId === volume.id)
    .sort((a, b) => a.order - b.order);

  const total = volumeChapters.length;
  if (total === 0) {
    return null;
  }

  const position = volumeChapters.findIndex(c => c.id === chapter.id) + 1;

  // If chapter not found in volume chapters, return null
  if (position === 0) {
    return null;
  }

  const percentage = (position / total) * 100;

  return {
    position,
    total,
    percentage
  };
}

/**
 * Checks if the last chapter in a volume is complete (has content).
 * Used to determine if a volume summary can be generated.
 * 
 * Requirements: 2.3
 * - Returns true if the last chapter (by order) has non-empty content
 * - Returns false if volume has no chapters or last chapter is incomplete
 * 
 * @param volume - The volume to check
 * @param chapters - All chapters in the project
 * @returns true if last chapter is complete, false otherwise
 */
export function isLastChapterComplete(
  volume: Volume,
  chapters: Chapter[]
): boolean {
  // Use chapter.volumeId as the source of truth
  const volumeChapters = chapters
    .filter(chapter => chapter.volumeId === volume.id)
    .sort((a, b) => a.order - b.order);
  
  // If volume has no chapters, return false
  if (volumeChapters.length === 0) {
    return false;
  }

  // If no chapters found, return false
  if (volumeChapters.length === 0) {
    return false;
  }

  // Get the last chapter
  const lastChapter = volumeChapters[volumeChapters.length - 1];

  // Check if it has content
  return !!(lastChapter.content && lastChapter.content.trim().length > 0);
}


// ============================================================================
// Deep Context Utility Functions
// Requirements: 3.1, 3.4
// ============================================================================

/**
 * Finds the previous chapter for a given chapter.
 * Supports both linear narratives and branching narratives.
 * 
 * Requirements: 3.1
 * - For chapters with parentId: finds the previous sibling under the same parent
 * - For chapters without parentId: finds the chapter with order - 1
 * - Returns null if no previous chapter exists (first chapter)
 * 
 * @param chapter - The chapter to find the previous chapter for
 * @param allChapters - All chapters in the project
 * @returns The previous chapter, or null if none exists
 */
export function findPreviousChapter(
  chapter: Chapter,
  allChapters: Chapter[]
): Chapter | null {
  // If chapter has a parentId, we're in a branching narrative
  // Find siblings (chapters with the same parentId) and get the previous one by order
  if (chapter.parentId) {
    const siblings = allChapters
      .filter(c => c.parentId === chapter.parentId)
      .sort((a, b) => a.order - b.order);
    
    const currentIndex = siblings.findIndex(c => c.id === chapter.id);
    
    // If this is the first sibling, return the parent as the previous chapter
    if (currentIndex === 0) {
      return allChapters.find(c => c.id === chapter.parentId) || null;
    }
    
    // Otherwise return the previous sibling
    if (currentIndex > 0) {
      return siblings[currentIndex - 1];
    }
    
    return null;
  }
  
  // For linear narratives (no parentId), find chapter with order - 1
  // Only consider chapters that also don't have a parentId (main storyline)
  const mainlineChapters = allChapters
    .filter(c => !c.parentId)
    .sort((a, b) => a.order - b.order);
  
  const currentIndex = mainlineChapters.findIndex(c => c.id === chapter.id);
  
  if (currentIndex > 0) {
    return mainlineChapters[currentIndex - 1];
  }
  
  return null;
}

/**
 * Strips HTML tags from a string.
 * Used to extract plain text from chapter content.
 * 
 * @param html - HTML string to strip
 * @returns Plain text without HTML tags
 */
function stripHtml(html: string): string {
  if (typeof document === 'undefined') {
    // Server-side or test environment: use regex fallback
    return html.replace(/<[^>]*>/g, '');
  }
  const tmp = document.createElement('DIV');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

/**
 * Extracts the last N characters from a chapter's content.
 * Strips HTML tags before extracting.
 * 
 * Requirements: 3.1
 * - Extracts the last 500 characters (or full content if less than 500)
 * - Strips HTML tags to get plain text
 * - Returns empty string if chapter has no content
 * 
 * @param chapter - The chapter to extract content from
 * @param maxLength - Maximum number of characters to extract (default: 500)
 * @returns The last N characters of the chapter's content
 */
export function extractLastContent(
  chapter: Chapter,
  maxLength: number = 500
): string {
  // Return empty string if no content
  if (!chapter.content || chapter.content.trim().length === 0) {
    return '';
  }
  
  // Strip HTML tags to get plain text
  const plainText = stripHtml(chapter.content).trim();
  
  // If content is shorter than maxLength, return all of it
  if (plainText.length <= maxLength) {
    return plainText;
  }
  
  // Return the last maxLength characters
  return plainText.slice(-maxLength);
}

/**
 * Gets all ancestor chapters for a given chapter (for branching narratives).
 * Traverses up the parent chain until reaching a chapter with no parent.
 * 
 * Requirements: 3.4
 * - Returns ancestors in order from oldest to most recent (parent first)
 * - Handles multiple levels of nesting
 * - Returns empty array if chapter has no ancestors
 * 
 * @param chapterId - ID of the chapter to find ancestors for
 * @param allChapters - All chapters in the project
 * @returns Array of ancestor chapters, ordered from oldest to most recent
 */
export function getChapterAncestors(
  chapterId: string,
  allChapters: Chapter[]
): Chapter[] {
  const ancestors: Chapter[] = [];
  let current = allChapters.find(c => c.id === chapterId);
  
  // Traverse up the parent chain
  while (current && current.parentId) {
    const parent = allChapters.find(c => c.id === current?.parentId);
    if (parent) {
      // Add parent to the beginning of the array (oldest first)
      ancestors.unshift(parent);
      current = parent;
    } else {
      // Parent not found, stop traversal
      break;
    }
  }
  
  return ancestors;
}

/**
 * Character Service
 * 
 * Provides core functionality for character management including:
 * - Creating characters with default values
 * - Migrating legacy character data
 * - Validating character data
 * - Applying status update suggestions
 * 
 * Requirements: 1.3, 1.5, 5.4, 6.4
 */

import { Character, CharacterGender } from '../types';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Status sync suggestion interface
 */
export interface StatusSyncSuggestion {
  suggestedStatus?: string;
  suggestedTags?: string[];
  suggestedDescription?: string;
  reasoning: string;
}

/**
 * Default values for new characters
 */
const CHARACTER_DEFAULTS: Partial<Character> = {
  gender: 'unknown' as CharacterGender,
  age: '',
  speakingStyle: '',
  motivation: '',
  fears: '',
  narrativeFunction: '',
  status: '正常',
  tags: [],
  isActive: true,
  relationships: [],
};

/**
 * Creates a new character with default values filled in
 * 
 * @param partial - Partial character data provided by user/AI
 * @returns Complete Character object with defaults applied
 */
export function createCharacter(partial: Partial<Character>): Character {
  // Generate ID if not provided
  const id = partial.id || crypto.randomUUID();
  
  return {
    // Required fields with fallbacks
    id,
    name: partial.name || '',
    role: partial.role || '',
    description: partial.description || '',
    appearance: partial.appearance || '',
    background: partial.background || '',
    personality: partial.personality || '',
    relationships: partial.relationships || [],
    
    // Apply defaults for new fields
    gender: partial.gender ?? CHARACTER_DEFAULTS.gender,
    age: partial.age ?? CHARACTER_DEFAULTS.age,
    speakingStyle: partial.speakingStyle ?? CHARACTER_DEFAULTS.speakingStyle,
    motivation: partial.motivation ?? CHARACTER_DEFAULTS.motivation,
    fears: partial.fears ?? CHARACTER_DEFAULTS.fears,
    narrativeFunction: partial.narrativeFunction ?? CHARACTER_DEFAULTS.narrativeFunction,
    status: partial.status ?? CHARACTER_DEFAULTS.status,
    tags: partial.tags ?? CHARACTER_DEFAULTS.tags,
    isActive: partial.isActive ?? CHARACTER_DEFAULTS.isActive,
    
    // Tracking fields
    introducedInVolumeId: partial.introducedInVolumeId,
    introducedInChapterId: partial.introducedInChapterId,
  };
}

/**
 * Migrates legacy character data to the new format
 * Fills in missing new fields with sensible defaults
 * 
 * Requirements: 1.5, 6.4
 * 
 * @param oldChar - Legacy character object (may be missing new fields)
 * @returns Migrated Character object with all fields populated
 */
export function migrateCharacter(oldChar: any): Character {
  // Start with the old character data
  const migrated: Character = {
    // Preserve existing required fields
    id: oldChar.id || crypto.randomUUID(),
    name: oldChar.name || '',
    role: oldChar.role || '',
    description: oldChar.description || '',
    appearance: oldChar.appearance || '',
    background: oldChar.background || '',
    personality: oldChar.personality || '',
    relationships: migrateRelationships(oldChar.relationships),
    
    // New fields with defaults or inferred values
    gender: oldChar.gender ?? 'unknown',
    age: oldChar.age ?? '',
    
    // Try to infer speakingStyle from personality if not present
    speakingStyle: oldChar.speakingStyle ?? inferSpeakingStyle(oldChar.personality),
    
    // Try to infer motivation from background if not present
    motivation: oldChar.motivation ?? inferMotivation(oldChar.background),
    
    fears: oldChar.fears ?? '',
    narrativeFunction: oldChar.narrativeFunction ?? '',
    status: oldChar.status ?? '正常',
    tags: Array.isArray(oldChar.tags) ? oldChar.tags : [],
    isActive: typeof oldChar.isActive === 'boolean' ? oldChar.isActive : true,
    
    // Tracking fields
    introducedInVolumeId: oldChar.introducedInVolumeId,
    introducedInChapterId: oldChar.introducedInChapterId,
  };
  
  return migrated;
}

/**
 * Migrates legacy relationship data to include attitude field
 */
function migrateRelationships(relationships: any): Character['relationships'] {
  if (!Array.isArray(relationships)) {
    return [];
  }
  
  return relationships.map((rel: any) => ({
    targetId: rel.targetId || '',
    targetName: rel.targetName || '',
    relation: rel.relation || '',
    attitude: rel.attitude ?? '',
  }));
}

/**
 * Attempts to infer speaking style from personality description
 */
function inferSpeakingStyle(personality: string | undefined): string {
  if (!personality) return '';
  
  // Simple heuristic: return empty string, let user fill in
  // In a more advanced version, this could use AI to infer
  return '';
}

/**
 * Attempts to infer motivation from background description
 */
function inferMotivation(background: string | undefined): string {
  if (!background) return '';
  
  // Simple heuristic: return empty string, let user fill in
  // In a more advanced version, this could use AI to infer
  return '';
}

/**
 * Validates character data for required fields
 * 
 * Requirements: 1.3 - speakingStyle and motivation are required
 * 
 * @param char - Character to validate
 * @returns ValidationResult with isValid flag and error messages
 */
export function validateCharacter(char: Character): ValidationResult {
  const errors: string[] = [];
  
  // Check required basic fields
  if (!char.name || char.name.trim() === '') {
    errors.push('角色名称不能为空');
  }
  
  // Check required AI writing guidance fields (Requirements 1.3)
  if (!char.speakingStyle || char.speakingStyle.trim() === '') {
    errors.push('对话风格 (speakingStyle) 不能为空');
  }
  
  if (!char.motivation || char.motivation.trim() === '') {
    errors.push('核心驱动力 (motivation) 不能为空');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Applies a status sync suggestion to a character
 * 
 * Requirements: 5.4 - Apply selected updates to character data
 * 
 * @param char - Character to update
 * @param suggestion - Status sync suggestion from AI analysis
 * @returns Updated Character object
 */
export function applyStatusSuggestion(
  char: Character,
  suggestion: StatusSyncSuggestion
): Character {
  const updated = { ...char };
  
  // Apply suggested status if provided
  if (suggestion.suggestedStatus !== undefined) {
    updated.status = suggestion.suggestedStatus;
  }
  
  // Apply suggested tags if provided
  if (suggestion.suggestedTags !== undefined) {
    updated.tags = suggestion.suggestedTags;
  }
  
  // Apply suggested description if provided
  if (suggestion.suggestedDescription !== undefined) {
    updated.description = suggestion.suggestedDescription;
  }
  
  return updated;
}

/**
 * Serializes a character to JSON string
 * Used for persistence
 */
export function serializeCharacter(char: Character): string {
  return JSON.stringify(char);
}

/**
 * Deserializes a character from JSON string
 * Used for loading from persistence
 */
export function deserializeCharacter(json: string): Character {
  const parsed = JSON.parse(json);
  // Use migrateCharacter to ensure all fields are present
  return migrateCharacter(parsed);
}

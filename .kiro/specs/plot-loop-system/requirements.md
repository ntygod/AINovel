# Requirements Document

## Introduction

本文档定义了 InkFlow 小说创作系统的"伏笔追踪系统"（Plot Loop System）功能需求。该系统旨在帮助作者管理长篇小说中的伏笔（Foreshadowing），通过"开环（Open Loop）"和"闭环（Close Loop）"的概念追踪悬念的埋设与回收，确保叙事连贯性，避免"挖坑不填"的问题。

## Glossary

- **Plot Loop（伏笔/悬念）**: 小说中埋下的悬念或线索，需要在后续章节中回收或解答
- **Open Loop（开环）**: 已埋下但尚未回收的伏笔
- **Closed Loop（闭环）**: 已经回收或解答的伏笔
- **Setup（埋设）**: 在章节中植入伏笔的行为
- **Payoff（回收）**: 在后续章节中揭示或解答伏笔的行为
- **Importance（重要程度）**: 伏笔的叙事权重，1-5 级，5 为最重要的主线伏笔
- **URGENT 状态**: 接近预定回收章节但尚未回收的伏笔状态

## Requirements

### Requirement 1: 伏笔数据管理

**User Story:** As a 网文作者, I want to 创建和管理伏笔记录, so that I can 追踪小说中所有的悬念线索。

#### Acceptance Criteria

1. WHEN a user creates a new plot loop THEN the System SHALL store the plot loop with unique ID, title, description, setup chapter ID, status as OPEN, and importance level
2. WHEN a user edits an existing plot loop THEN the System SHALL update the specified fields and preserve unchanged fields
3. WHEN a user deletes a plot loop THEN the System SHALL remove the plot loop from storage and update any related references
4. WHEN a user sets a target chapter or volume for a plot loop THEN the System SHALL store the target chapter ID or target volume ID for payoff planning
5. WHEN a user marks a plot loop as closed THEN the System SHALL update status to CLOSED and record the close chapter ID

### Requirement 2: 伏笔状态自动管理

**User Story:** As a 网文作者, I want to 系统自动提醒我即将到期的伏笔, so that I can 及时回收悬念避免遗忘。

#### Acceptance Criteria

1. WHEN the current chapter is within 5 chapters of a plot loop's target chapter THEN the System SHALL automatically update the plot loop status to URGENT
2. WHEN the current chapter reaches the end of a plot loop's target volume THEN the System SHALL automatically update the plot loop status to URGENT
3. WHEN a plot loop has been OPEN for more than 30 chapters without a target THEN the System SHALL flag the plot loop as requiring attention
4. WHEN a user abandons a plot loop THEN the System SHALL update status to ABANDONED and record the reason

### Requirement 3: 伏笔列表与筛选

**User Story:** As a 网文作者, I want to 查看和筛选所有伏笔, so that I can 快速了解当前悬念状态。

#### Acceptance Criteria

1. WHEN a user opens the plot loop panel THEN the System SHALL display all plot loops grouped by status (URGENT first, then OPEN, then CLOSED)
2. WHEN a user filters plot loops by importance THEN the System SHALL display only plot loops matching the selected importance level
3. WHEN a user filters plot loops by related chapter or volume THEN the System SHALL display only plot loops associated with the specified chapter or volume
4. WHEN a user searches plot loops by keyword THEN the System SHALL display plot loops whose title or description contains the keyword

### Requirement 4: AI 辅助伏笔回收提醒

**User Story:** As a 网文作者, I want to AI 在生成细纲时提醒我未回收的伏笔, so that I can 自然地在剧情中回收悬念。

#### Acceptance Criteria

1. WHEN generating chapter beats THEN the System SHALL inject all OPEN and URGENT plot loops into the AI prompt context
2. WHEN generating chapter beats with URGENT plot loops THEN the System SHALL instruct the AI to prioritize addressing these plot loops in the beats
3. WHEN the AI suggests addressing a plot loop in the beats THEN the System SHALL highlight the suggestion and offer to mark the plot loop as closed
4. WHEN generating chapter content THEN the System SHALL include relevant OPEN plot loops as context for narrative continuity

### Requirement 5: 伏笔关联与引用

**User Story:** As a 网文作者, I want to 将伏笔与角色、物品、章节关联, so that I can 追踪伏笔涉及的叙事元素。

#### Acceptance Criteria

1. WHEN a user links a plot loop to characters THEN the System SHALL store the character IDs and display character names in the plot loop detail
2. WHEN a user links a plot loop to wiki entries THEN the System SHALL store the wiki entry IDs and display entry names in the plot loop detail
3. WHEN viewing a character or wiki entry THEN the System SHALL display all related plot loops
4. WHEN a user creates a plot loop from selected text in the editor THEN the System SHALL auto-populate the description with the selected text and link to the current chapter

### Requirement 6: 伏笔链支持

**User Story:** As a 网文作者, I want to 创建层层递进的伏笔链, so that I can 管理复杂的多层悬念结构。

#### Acceptance Criteria

1. WHEN a user sets a parent plot loop for a new plot loop THEN the System SHALL store the parent-child relationship
2. WHEN a parent plot loop is closed THEN the System SHALL notify the user about unclosed child plot loops
3. WHEN viewing a plot loop with children THEN the System SHALL display the child plot loops in a hierarchical view
4. WHEN all child plot loops are closed THEN the System SHALL suggest closing the parent plot loop

### Requirement 7: AI 自动识别与建议伏笔

**User Story:** As a 网文作者, I want to AI 自动识别章节中的潜在伏笔并建议创建, so that I can 不遗漏重要的叙事线索。

#### Acceptance Criteria

1. WHEN AI generates chapter content THEN the System SHALL analyze the content for potential foreshadowing elements
2. WHEN AI identifies a potential plot loop in generated content THEN the System SHALL suggest creating a plot loop record with pre-filled title and description
3. WHEN a user accepts an AI-suggested plot loop THEN the System SHALL create the plot loop with the suggested details and link to the current chapter
4. WHEN a user requests AI to plant a foreshadowing THEN the System SHALL generate content that naturally introduces the specified plot element without being obvious
5. WHEN generating beats for a future chapter THEN the System SHALL suggest opportunities to plant foreshadowing for planned plot points

### Requirement 8: 伏笔数据持久化

**User Story:** As a 网文作者, I want to 伏笔数据随项目保存和加载, so that I can 在不同会话中继续管理伏笔。

#### Acceptance Criteria

1. WHEN a project is saved THEN the System SHALL persist all plot loops to IndexedDB as part of the novel state
2. WHEN a project is loaded THEN the System SHALL restore all plot loops from IndexedDB
3. WHEN a project is exported THEN the System SHALL include plot loops in the export data
4. WHEN a project is imported THEN the System SHALL restore plot loops from the import data

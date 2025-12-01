# Requirements Document

## Introduction

本功能扩展现有的场景模型配置系统，支持为不同 AI 任务场景配置完全独立的服务商、API Key 和 Base URL。这允许用户在同一项目中混合使用多个 AI 服务商（如 Google Gemini 用于创意生成，DeepSeek 用于长文写作），实现成本优化和能力互补。

## Glossary

- **Scene (场景)**: AI 任务的类型分类，包括 creative（创意生成）、structure（结构化生成）、writing（长文写作）、analysis（分析任务）
- **SceneModelConfig**: 单个场景的完整模型配置，包含 provider、apiKey、baseUrl、model 四个字段
- **Provider (服务商)**: AI 模型提供方，支持 google、deepseek、openai、custom 四种
- **Default Model (默认模型)**: 当场景未配置独立设置时使用的全局模型配置
- **Cross-Provider (跨服务商)**: 在不同场景使用不同服务商的能力

## Requirements

### Requirement 1

**User Story:** As a user, I want to configure different AI providers for different scenes, so that I can optimize cost and leverage each provider's strengths.

#### Acceptance Criteria

1. WHEN a user opens the scene model configuration panel THEN the system SHALL display configuration options for each scene (creative, structure, writing, analysis)
2. WHEN a user selects a scene to configure THEN the system SHALL allow setting provider, apiKey, baseUrl, and model independently for that scene
3. WHEN a scene has no custom configuration THEN the system SHALL fall back to the default global model settings
4. WHEN a user saves scene configurations THEN the system SHALL persist all settings to local storage

### Requirement 2

**User Story:** As a user, I want the system to automatically use the correct provider configuration when generating content, so that my scene-specific settings are respected.

#### Acceptance Criteria

1. WHEN an AI generation task is triggered THEN the system SHALL determine the appropriate scene type for that task
2. WHEN a scene has a complete SceneModelConfig THEN the system SHALL use that config's provider, apiKey, baseUrl, and model
3. WHEN a scene has only a model string configured THEN the system SHALL use the default provider settings with the specified model
4. WHEN the system makes an API call THEN the system SHALL construct the correct client based on the resolved configuration

### Requirement 3

**User Story:** As a user, I want to see which provider is being used for each scene at a glance, so that I can verify my configuration is correct.

#### Acceptance Criteria

1. WHEN displaying scene configurations THEN the system SHALL show the provider name and model for each configured scene
2. WHEN a scene uses default settings THEN the system SHALL display "使用默认" or similar indicator
3. WHEN a scene has a custom provider different from default THEN the system SHALL visually distinguish it (e.g., badge or icon)

### Requirement 4

**User Story:** As a user, I want to test my scene configurations before using them, so that I can verify API keys and endpoints work correctly.

#### Acceptance Criteria

1. WHEN a user clicks a test button for a scene THEN the system SHALL make a minimal API call using that scene's configuration
2. WHEN the test succeeds THEN the system SHALL display a success indicator
3. IF the test fails THEN the system SHALL display the error message to help diagnose the issue

### Requirement 5

**User Story:** As a user, I want to quickly copy settings from one scene to another, so that I can efficiently configure similar scenes.

#### Acceptance Criteria

1. WHEN a user selects "copy from" option THEN the system SHALL allow selecting another scene or default as source
2. WHEN copying is confirmed THEN the system SHALL duplicate all configuration fields to the target scene

### Requirement 6

**User Story:** As a developer, I want the configuration resolution logic to be centralized and type-safe, so that all AI calls consistently use the correct settings.

#### Acceptance Criteria

1. WHEN resolving configuration for a scene THEN the system SHALL return a complete configuration object with all required fields
2. WHEN the SceneModels contains mixed types (string and SceneModelConfig) THEN the system SHALL handle both correctly
3. WHEN configuration is resolved THEN the system SHALL validate that required fields (provider, apiKey, model) are present

# Implementation Plan

- [x] 1. Add new type definitions






  - [x] 1.1 Add ResolvedModelConfig interface to types.ts

    - Add interface with required fields: provider, apiKey, baseUrl, model
    - Add AISceneType type alias
    - _Requirements: 6.1, 6.2_
  - [ ]* 1.2 Write property test for type completeness
    - **Property 4: Resolution Completeness**
    - **Validates: Requirements 6.1, 6.2**

- [-] 2. Implement configuration resolver




  - [x] 2.1 Create resolveSceneConfig function in geminiService.ts


    - Handle undefined scene config (return default)
    - Handle string model config (default provider + specified model)
    - Handle full SceneModelConfig (passthrough)
    - _Requirements: 1.3, 2.2, 2.3_
  - [ ]* 2.2 Write property test for default fallback
    - **Property 1: Default Fallback Consistency**
    - **Validates: Requirements 1.3**
  - [ ]* 2.3 Write property test for string config resolution
    - **Property 2: String Config Resolution**
    - **Validates: Requirements 2.3**
  - [ ]* 2.4 Write property test for full config passthrough
    - **Property 3: Full Config Passthrough**
    - **Validates: Requirements 2.2**

- [x] 3. Update existing AI generation functions





  - [x] 3.1 Refactor getModelForScene to use resolveSceneConfig


    - Update function to return ResolvedModelConfig instead of string
    - Maintain backward compatibility with existing callers
    - _Requirements: 2.1, 2.4_

  - [x] 3.2 Update generateProjectIdea to use resolved config

    - Use resolveSceneConfig for 'creative' scene
    - Pass resolved config to API client
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.3 Update generateWorldStructure to use resolved config


    - Use resolveSceneConfig for 'structure' scene
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.4 Update chapter generation functions to use resolved config


    - Update generateChapterContent and related functions
    - Use resolveSceneConfig for 'writing' scene
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Checkpoint - Ensure all tests pass





  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Scene Model Panel UI





  - [x] 5.1 Create SceneModelPanel component


    - Create new component file components/SceneModelPanel.tsx
    - Implement provider selector, API key input, base URL input, model input
    - Add "use default" toggle option
    - _Requirements: 1.1, 1.2, 3.1, 3.2_

  - [x] 5.2 Add configuration test functionality

    - Implement testSceneConfig function in geminiService.ts
    - Add test button to SceneModelPanel
    - Display success/error status
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.3 Add copy configuration functionality

    - Implement copySceneConfig helper function
    - Add "copy from" dropdown to SceneModelPanel
    - _Requirements: 5.1, 5.2_
  - [ ]* 5.4 Write property test for copy operation
    - **Property 5: Copy Operation Integrity**
    - **Validates: Requirements 5.2**

- [x] 6. Update AppSettings component



  - [x] 6.1 Replace inline scene inputs with SceneModelPanel components


    - Import and use SceneModelPanel for each scene
    - Pass appropriate props and handlers
    - _Requirements: 1.1, 3.1, 3.2, 3.3_


  - [x] 6.2 Update settings persistence logic

    - Ensure SceneModelConfig objects are properly serialized
    - Handle migration from string-only configs
    - _Requirements: 1.4_
  - [ ]* 6.3 Write property test for persistence round-trip
    - **Property 6: Persistence Round-Trip**
    - **Validates: Requirements 1.4**

- [ ] 7. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

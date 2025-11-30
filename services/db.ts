
import { NovelState, ProjectMetadata, NovelConfig, WorldStructure, Chapter, ChapterSnapshot, VectorRecord, Volume, PlotLoop } from '../types';

const DB_NAME = 'InkFlowDB';
const DB_VERSION = 7; // Incremented for plotLoops support
const STORE_PROJECTS = 'projects';
const STORE_META = 'project_meta';
const STORE_CHAPTERS = 'chapters'; 
const STORE_SNAPSHOTS = 'snapshots'; 
const STORE_VECTORS = 'vectors'; // New store for RAG
const STORE_PLOT_LOOPS = 'plotLoops'; // Store for plot loop tracking

const INITIAL_CONFIG: NovelConfig = {
    title: "未命名项目",
    genre: "东方玄幻",
    subGenre: "",
    worldSetting: "",
    protagonistArchetype: "穿越者",
    goldenFinger: "",
    mainPlot: "",
    pacing: "快节奏爽文",
    narrativeTone: "热血",
    tags: []
};
  
const INITIAL_STRUCTURE: WorldStructure = {
    worldView: "",
    centralConflict: "",
    keyPlotPoints: [],
    factions: [],
    wikiEntries: []
};

/**
 * Ensures backward compatibility for chapters loaded from old projects.
 * Initializes volumeId to null and hooks to empty array if missing.
 * Requirements: 6.2, 6.3
 */
function migrateChapter(chapter: Chapter): Chapter {
  return {
    ...chapter,
    volumeId: chapter.volumeId ?? null,
    hooks: chapter.hooks ?? []
  };
}

/**
 * Ensures backward compatibility for NovelState loaded from old projects.
 * Initializes volumes to empty array if missing and migrates all chapters.
 * Initializes plotLoops to empty array if missing.
 * Requirements: 6.1, 6.2, 6.3
 */
function migrateNovelState(state: NovelState): NovelState {
  return {
    ...state,
    volumes: state.volumes ?? [],
    chapters: state.chapters.map(migrateChapter),
    plotLoops: state.plotLoops ?? []
  };
}

export class DBService {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error("IndexedDB error:", request.error);
        reject("Could not open database");
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const transaction = request.transaction!;
        
        // Version 1 Store (Full Data)
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS); 
        }

        // Version 2 Store (Metadata)
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'id' });
        }

        // Version 3 Store (Chapter Content)
        let chapterStore: IDBObjectStore;
        if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
          chapterStore = db.createObjectStore(STORE_CHAPTERS);
        } else {
          chapterStore = transaction.objectStore(STORE_CHAPTERS);
        }
        
        // Version 4 Store (Snapshots)
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
            const snapshotStore = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'id' });
            snapshotStore.createIndex('chapterId', 'chapterId', { unique: false });
        }

        // Version 5 Store (Vectors)
        if (!db.objectStoreNames.contains(STORE_VECTORS)) {
            const vectorStore = db.createObjectStore(STORE_VECTORS, { keyPath: 'id' });
            // Index for faster deletion by related entity
            vectorStore.createIndex('relatedId', 'relatedId', { unique: false });
            vectorStore.createIndex('type', 'type', { unique: false });
        }

        // Version 7 Store (PlotLoops) - Requirements 8.1, 8.2
        if (!db.objectStoreNames.contains(STORE_PLOT_LOOPS)) {
            const plotLoopStore = db.createObjectStore(STORE_PLOT_LOOPS, { keyPath: 'id' });
            plotLoopStore.createIndex('status', 'status', { unique: false });
            plotLoopStore.createIndex('setupChapterId', 'setupChapterId', { unique: false });
            plotLoopStore.createIndex('targetChapterId', 'targetChapterId', { unique: false });
            plotLoopStore.createIndex('importance', 'importance', { unique: false });
            plotLoopStore.createIndex('parentLoopId', 'parentLoopId', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = request.result;
        resolve();
      };
    });
  }

  // --- Vector Methods ---

  async saveVectors(vectors: VectorRecord[]): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_VECTORS], 'readwrite');
          const store = transaction.objectStore(STORE_VECTORS);
          vectors.forEach(v => store.put(v));
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  }

  async getAllVectors(): Promise<VectorRecord[]> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_VECTORS], 'readonly');
          const store = transaction.objectStore(STORE_VECTORS);
          const request = store.getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
      });
  }

  async deleteVectorsByRelatedId(relatedId: string): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_VECTORS], 'readwrite');
          const store = transaction.objectStore(STORE_VECTORS);
          const index = store.index('relatedId');
          const request = index.getAllKeys(relatedId);
          
          request.onsuccess = () => {
              const keys = request.result;
              keys.forEach(key => store.delete(key));
          };
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  }

  async clearAllVectors(): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_VECTORS], 'readwrite');
          transaction.objectStore(STORE_VECTORS).clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  }

  // --- PlotLoop Methods (Requirements 8.1, 8.2) ---

  /**
   * Saves plot loops to IndexedDB.
   * Requirements: 8.1
   */
  async savePlotLoops(projectId: string, plotLoops: PlotLoop[]): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_PLOT_LOOPS], 'readwrite');
          const store = transaction.objectStore(STORE_PLOT_LOOPS);
          
          // Save each plot loop with project association
          plotLoops.forEach(loop => {
              store.put({ ...loop, projectId });
          });
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  }

  /**
   * Loads plot loops from IndexedDB for a specific project.
   * Requirements: 8.2
   */
  async loadPlotLoops(projectId: string): Promise<PlotLoop[]> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_PLOT_LOOPS], 'readonly');
          const store = transaction.objectStore(STORE_PLOT_LOOPS);
          const request = store.getAll();
          
          request.onsuccess = () => {
              // Filter by projectId and remove the projectId field from results
              const results = (request.result as (PlotLoop & { projectId?: string })[])
                  .filter(loop => loop.projectId === projectId)
                  .map(({ projectId: _, ...loop }) => loop as PlotLoop);
              resolve(results);
          };
          request.onerror = () => reject(request.error);
      });
  }

  /**
   * Deletes all plot loops for a specific project.
   * Used when deleting a project.
   */
  async deletePlotLoopsByProject(projectId: string): Promise<void> {
      if (!this.db) await this.init();
      const loops = await this.loadPlotLoops(projectId);
      
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_PLOT_LOOPS], 'readwrite');
          const store = transaction.objectStore(STORE_PLOT_LOOPS);
          
          loops.forEach(loop => {
              store.delete(loop.id);
          });
          
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  }

  // --- Snapshot Methods ---

  async saveSnapshot(chapterId: string, content: string, note?: string): Promise<ChapterSnapshot> {
      if (!this.db) await this.init();
      const snapshot: ChapterSnapshot = {
          id: crypto.randomUUID(),
          chapterId,
          content,
          timestamp: Date.now(),
          wordCount: content.length,
          note
      };
      
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_SNAPSHOTS], 'readwrite');
          const store = transaction.objectStore(STORE_SNAPSHOTS);
          store.add(snapshot);
          
          transaction.oncomplete = () => resolve(snapshot);
          transaction.onerror = () => reject(transaction.error);
      });
  }

  async getSnapshots(chapterId: string): Promise<ChapterSnapshot[]> {
      if (!this.db) await this.init();
      
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_SNAPSHOTS], 'readonly');
          const store = transaction.objectStore(STORE_SNAPSHOTS);
          const index = store.index('chapterId');
          const request = index.getAll(chapterId);

          request.onsuccess = () => {
              const results = request.result as ChapterSnapshot[];
              // Sort by timestamp descending (newest first)
              resolve(results.sort((a, b) => b.timestamp - a.timestamp));
          };
          request.onerror = () => reject(request.error);
      });
  }

  async deleteSnapshot(id: string): Promise<void> {
      if (!this.db) await this.init();
      return new Promise((resolve, reject) => {
          const transaction = this.db!.transaction([STORE_SNAPSHOTS], 'readwrite');
          transaction.objectStore(STORE_SNAPSHOTS).delete(id);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
      });
  }

  // --- Existing Methods ---

  async listProjects(): Promise<ProjectMetadata[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_META], 'readonly');
      const store = transaction.objectStore(STORE_META);
      const request = store.getAll();

      request.onsuccess = () => {
        const result = request.result as ProjectMetadata[];
        resolve(result.sort((a, b) => b.lastModified - a.lastModified));
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Loads the project structure (Lean State: chapters have empty content)
  // Applies backward compatibility migration for old projects (Requirements: 6.1, 6.2, 6.3)
  async loadProject(id: string): Promise<NovelState | null> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PROJECTS], 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => {
        const result = request.result;
        if (result) {
          // Apply backward compatibility migration
          resolve(migrateNovelState(result));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Load a single chapter's content
  async getChapterContent(chapterId: string): Promise<string> {
      if (!this.db) await this.init();
      return new Promise((resolve) => {
          const transaction = this.db!.transaction([STORE_CHAPTERS], 'readonly');
          const store = transaction.objectStore(STORE_CHAPTERS);
          const request = store.get(chapterId);
          
          request.onsuccess = () => resolve(request.result || "");
          request.onerror = () => resolve("");
      });
  }

  // Re-assemble full project (for Export)
  // Migration is already applied by loadProject (Requirements: 6.1, 6.2, 6.3)
  async loadFullProject(id: string): Promise<NovelState | null> {
      const project = await this.loadProject(id);
      if (!project) return null;

      // Parallel fetch all content
      await Promise.all(project.chapters.map(async (ch) => {
          ch.content = await this.getChapterContent(ch.id);
      }));

      return project;
  }

  // Saves project with volumes, plotLoops, and migrated chapters (Requirements: 5.1, 5.2, 5.3, 5.4, 8.1)
  async saveProject(state: NovelState): Promise<void> {
    if (!this.db) await this.init();
    
    if (!state.id) state.id = crypto.randomUUID();
    state.lastModified = Date.now();

    const metadata: ProjectMetadata = {
        id: state.id,
        title: state.config.title || "未命名项目",
        genre: state.config.genre || "未分类",
        wordCount: state.chapters.reduce((acc, c) => acc + c.wordCount, 0),
        lastModified: state.lastModified,
        previewText: state.config.mainPlot?.slice(0, 100) || "暂无简介"
    };

    const plotLoops = state.plotLoops ?? [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_PROJECTS, STORE_META, STORE_CHAPTERS, STORE_PLOT_LOOPS], 'readwrite');
      
      const projectStore = transaction.objectStore(STORE_PROJECTS);
      const metaStore = transaction.objectStore(STORE_META);
      const chapterStore = transaction.objectStore(STORE_CHAPTERS);
      const plotLoopStore = transaction.objectStore(STORE_PLOT_LOOPS);

      // 1. Save modified chapter contents
      state.chapters.forEach(ch => {
          if (ch.content && ch.content.length > 0) {
              chapterStore.put(ch.content, ch.id);
          }
      });

      // 2. Save plot loops to dedicated store (Requirement 8.1)
      plotLoops.forEach(loop => {
          plotLoopStore.put({ ...loop, projectId: state.id });
      });

      // 3. Create Lean State (Strip content, ensure new fields are included)
      // Migrate chapters to ensure volumeId and hooks fields exist (Requirement 5.4)
      const leanState: NovelState = {
          ...state,
          volumes: state.volumes ?? [], // Ensure volumes array exists (Requirement 5.3)
          plotLoops: plotLoops, // Ensure plotLoops array exists (Requirement 8.1)
          chapters: state.chapters.map(ch => ({
              ...migrateChapter(ch),
              content: "" // Strip content for lean storage
          }))
      };

      projectStore.put(leanState, state.id);
      metaStore.put(metadata);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  // Creates a new project with the new data structure including volumes (Requirement 6.4)
  async createNewProject(): Promise<NovelState> {
      const newId = crypto.randomUUID();
      const newState: NovelState = {
          id: newId,
          lastModified: Date.now(),
          config: { ...INITIAL_CONFIG },
          structure: { ...INITIAL_STRUCTURE },
          characters: [],
          chapters: [],
          currentChapterId: null,
          volumes: [], // Initialize volumes as empty array for new projects
          plotLoops: [] // Initialize plotLoops as empty array for new projects
      };
      await this.saveProject(newState);
      return newState;
  }

  async deleteProject(id: string): Promise<void> {
      if (!this.db) await this.init();
      
      let project: NovelState | null = null;
      try {
          project = await this.loadProject(id);
      } catch (e) {
          console.warn("Could not load project details before deletion", e);
      }

      // Delete plot loops for this project first
      try {
          await this.deletePlotLoopsByProject(id);
      } catch (e) {
          console.warn("Could not delete plot loops before project deletion", e);
      }

      return new Promise((resolve, reject) => {
          try {
              const transaction = this.db!.transaction([STORE_PROJECTS, STORE_META, STORE_CHAPTERS, STORE_SNAPSHOTS, STORE_VECTORS], 'readwrite');
              
              if (project && project.chapters && Array.isArray(project.chapters)) {
                  const chStore = transaction.objectStore(STORE_CHAPTERS);
                  // We should also delete snapshots and vectors
                  project.chapters.forEach(ch => {
                      try { chStore.delete(ch.id); } catch (e) { }
                  });
              }
              // Ideally we iterate and delete all related vectors/snapshots, 
              // but for MVP, relying on IDB clear or manual cleanup is safer to avoid blocking.
              // Note: This leaves orphaned vectors if multiple projects exist.
              // A robust system would query index and delete.

              transaction.objectStore(STORE_PROJECTS).delete(id);
              transaction.objectStore(STORE_META).delete(id);

              transaction.oncomplete = () => resolve();
              transaction.onerror = (e) => {
                 console.error("Delete transaction failed", e);
                 reject(transaction.error);
              };
          } catch(e) {
              reject(e);
          }
      });
  }
}

export const db = new DBService();

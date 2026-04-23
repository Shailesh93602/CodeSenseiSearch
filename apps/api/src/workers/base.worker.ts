/**
 * Worker re-export shim.
 *
 * The original base.worker.ts was a 1669-line monolith holding the
 * abstract BaseWorker plus 7 concrete BullMQ workers, a ~600-line
 * chunker, and three pairs of duplicated helper methods. workers.module.ts
 * (and several spec files) imported every worker class from here.
 *
 * The classes now live in dedicated files; this module re-exports them
 * so existing import paths keep working. Touching this file shouldn't
 * be necessary unless a NEW worker is added.
 */
export { BaseWorker } from './worker.base';
export { GitHubDiscoveryWorker } from './github-discovery.worker';
export { GitHubIngestionWorker } from './github-ingestion.worker';
export { GitHubProcessingWorker } from './github-processing.worker';
export { StackOverflowDiscoveryWorker } from './stackoverflow-discovery.worker';
export { StackOverflowIngestionWorker } from './stackoverflow-ingestion.worker';
export { ContentChunkingWorker } from './content-chunking.worker';
export { EmbeddingGenerationWorker } from './embedding-generation.worker';

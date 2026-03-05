import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type MergeResult = { conflict: boolean; joinedResults: () => string | unknown[] };
type MergeFn = (left: string, base: string, right: string) => MergeResult;
/** CJS build exports default; use .default if present. */
const mergeModule = require('three-way-merge') as { default?: MergeFn } | MergeFn;
const merge: MergeFn =
  typeof mergeModule === 'function'
    ? mergeModule
    : typeof mergeModule.default === 'function'
      ? mergeModule.default
      : (mergeModule as MergeFn);

export type MergeThreeWayResult = {
  mergedContent: string;
  hasConflicts: boolean;
};

/**
 * Merges three text versions. base = version draft was based on, ours = draft content, theirs = current published content.
 */
export function mergeThreeWay(base: string, ours: string, theirs: string): MergeThreeWayResult {
  const result = merge(ours, base, theirs);
  const raw = result.joinedResults();
  const mergedContent =
    typeof raw === 'string' ? raw : Array.isArray(raw) ? String(raw) : String(raw);
  return {
    mergedContent,
    hasConflicts: result.conflict,
  };
}

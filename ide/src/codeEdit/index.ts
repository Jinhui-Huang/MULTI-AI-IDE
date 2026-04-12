export { ContextCollector, type CollectedContext, type FileContext } from './contextCollector';
export { CodeEditPromptBuilder, type LLMType } from './promptBuilder';

// Diff 相关（已弃用，保留向后兼容）
export { DiffParser, type DiffParseResult } from './diffParser';
export { DiffApplier, type ApplyDiffResult } from './diffApplier';

// SEARCH/REPLACE 相关（新系统）
export { SearchReplaceParser, type SearchReplaceBlock, type SearchReplaceParseResult } from './searchReplaceParser';
export { SearchReplaceApplier, type ApplySearchReplaceResult, type BlockApplyResult } from './searchReplaceApplier';

// 代码编辑代理
export { CodeEditAgent, type CodeEditRequest, type CodeEditResult, type ApplyResult } from './codeEditAgent';

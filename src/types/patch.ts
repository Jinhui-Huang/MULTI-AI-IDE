export type PatchStatus = 'proposed' | 'applied' | 'rejected';

export type PatchChangeType = 'add' | 'modify' | 'delete';

export interface ProposedPatchFile {
  path: string;
  changeType: PatchChangeType;
  oldContent: string;
  newContent: string;
}

export interface ProposedPatch {
  id: string;
  taskId?: string;
  summary: string;
  status: PatchStatus;
  createdAt: string;
  files: ProposedPatchFile[];
  rejectedReason?: string;
}

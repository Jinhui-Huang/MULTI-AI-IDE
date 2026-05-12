import { ProposedPatch, PatchStatus } from '../types/patch';

const PLACEHOLDER_FILE = '.autogen-placeholder/placeholder.txt';

export class PatchStore {
  private readonly patches = new Map<string, ProposedPatch>();

  createPatch(input: Partial<ProposedPatch> = {}): ProposedPatch {
    const now = new Date().toISOString();
    const patch: ProposedPatch = {
      id: this.createPatchId(),
      taskId: input.taskId,
      summary: input.summary || 'Placeholder patch',
      status: 'proposed',
      createdAt: now,
      files: this.normalizeFiles(input.files)
    };

    this.patches.set(patch.id, patch);
    return patch;
  }

  getPatch(patchId: string): ProposedPatch | undefined {
    return this.patches.get(patchId);
  }

  listPatches(): ProposedPatch[] {
    return Array.from(this.patches.values());
  }

  updatePatchStatus(patchId: string, status: PatchStatus): ProposedPatch {
    const patch = this.patches.get(patchId);
    if (!patch) {
      throw new Error('PATCH_NOT_FOUND');
    }

    patch.status = status;
    this.patches.set(patchId, patch);
    return patch;
  }

  getLatestPatch(): ProposedPatch | undefined {
    const patches = this.listPatches();
    return patches[patches.length - 1];
  }

  private normalizeFiles(files: ProposedPatch['files'] | undefined): ProposedPatch['files'] {
    if (!Array.isArray(files) || files.length === 0) {
      return [{
        path: PLACEHOLDER_FILE,
        changeType: 'add',
        oldContent: '',
        newContent: 'AutoGen placeholder patch\n'
      }];
    }

    return files.map((file) => ({
      path: typeof file.path === 'string' && file.path.trim() ? file.path.trim() : PLACEHOLDER_FILE,
      changeType: file.changeType === 'modify' || file.changeType === 'delete' ? file.changeType : 'add',
      oldContent: typeof file.oldContent === 'string' ? file.oldContent : '',
      newContent: typeof file.newContent === 'string' ? file.newContent : ''
    }));
  }

  private createPatchId(): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `patch_${Date.now()}_${random}`;
  }
}

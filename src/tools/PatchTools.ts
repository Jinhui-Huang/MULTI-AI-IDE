import * as vscode from 'vscode';
import * as path from 'path';
import { ConfigStore } from '../storage/ConfigStore';
import { ProposedPatch } from '../types/patch';
import { DiffTools } from './DiffTools';
import { PatchStore } from './PatchStore';
import { SensitiveFileGuard } from './SensitiveFileGuard';
import { ToolError } from './ToolTypes';
import { WorkspaceGuard } from './WorkspaceGuard';

interface PatchApplyFileResult {
  path: string;
  changeType: string;
  bytesWritten: number;
  warning?: string;
}

export class PatchTools {
  private readonly sensitiveFileGuard: SensitiveFileGuard;

  constructor(
    private readonly configStore: ConfigStore,
    private readonly workspaceGuard: WorkspaceGuard,
    private readonly diffTools: DiffTools,
    private readonly patchStore: PatchStore
  ) {
    this.sensitiveFileGuard = new SensitiveFileGuard(configStore);
  }

  async proposePatch(input: Partial<ProposedPatch> = {}): Promise<unknown> {
    const patch = this.patchStore.createPatch(input);
    return {
      ok: true,
      message: 'Patch proposed',
      patch
    };
  }

  async openPatchDiff(patchId?: string): Promise<unknown> {
    const patch = this.getPatchOrLatest(patchId);
    return this.diffTools.openDiff(patch);
  }

  async applyPatch(patchId?: string): Promise<unknown> {
    const patch = this.getPatchOrLatest(patchId);
    await this.confirmApplyPatchWasUserTriggered();

    const appliedFiles: PatchApplyFileResult[] = [];
    try {
      for (const file of patch.files) {
        const relativePath = this.workspaceGuard.normalizeRelativePath(file.path);
        await this.sensitiveFileGuard.assertNotSensitive(relativePath);
        const uri = this.workspaceGuard.resolveWorkspacePath(relativePath);

        if (file.changeType === 'delete') {
          throw new ToolError('PATCH_DELETE_NOT_SUPPORTED', `Delete patch is not supported: ${relativePath}`);
        }

        if (file.changeType === 'add') {
          await this.assertTargetDoesNotExist(uri, relativePath);
          await this.writeNewContent(uri, file.newContent);
          appliedFiles.push({
            path: relativePath,
            changeType: file.changeType,
            bytesWritten: Buffer.byteLength(file.newContent, 'utf8')
          });
          continue;
        }

        if (file.changeType === 'modify') {
          const currentContent = await this.readExistingText(uri, relativePath);
          if (file.oldContent && currentContent !== file.oldContent) {
            throw new ToolError('PATCH_CONTENT_MISMATCH', `Current file content does not match patch oldContent: ${relativePath}`);
          }

          await this.writeNewContent(uri, file.newContent);
          appliedFiles.push({
            path: relativePath,
            changeType: file.changeType,
            bytesWritten: Buffer.byteLength(file.newContent, 'utf8'),
            warning: file.oldContent ? undefined : 'oldContent was empty; file overwritten after user confirmation'
          });
          continue;
        }

        throw new ToolError('PATCH_APPLY_FAILED', `Unsupported patch change type: ${file.changeType}`);
      }

      this.patchStore.updatePatchStatus(patch.id, 'applied');
      return {
        ok: true,
        message: 'Patch applied',
        patchId: patch.id,
        files: appliedFiles
      };
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
      throw new ToolError('PATCH_APPLY_FAILED', error instanceof Error ? error.message : String(error));
    }
  }

  async rejectPatch(patchId?: string, reason?: string): Promise<unknown> {
    const patch = this.getPatchOrLatest(patchId);
    patch.rejectedReason = reason || 'User rejected';
    const rejectedPatch = this.patchStore.updatePatchStatus(patch.id, 'rejected');
    return {
      ok: true,
      message: 'Patch rejected',
      patch: rejectedPatch
    };
  }

  private getPatchOrLatest(patchId?: string): ProposedPatch {
    const patch = patchId ? this.patchStore.getPatch(patchId) : this.patchStore.getLatestPatch();
    if (!patch) {
      throw new ToolError('PATCH_NOT_FOUND', 'Patch not found');
    }
    return patch;
  }

  private async confirmApplyPatchWasUserTriggered(): Promise<void> {
    // Task 5B treats the explicit patch.apply Webview action as the user confirmation.
    // The safety flag is still loaded here so future stricter flows can branch without changing this API.
    await this.configStore.loadToolsConfig();
  }

  private async assertTargetDoesNotExist(uri: vscode.Uri, relativePath: string): Promise<void> {
    try {
      await vscode.workspace.fs.stat(uri);
      throw new ToolError('PATCH_TARGET_EXISTS', `Patch target already exists: ${relativePath}`);
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
    }
  }

  private async readExistingText(uri: vscode.Uri, relativePath: string): Promise<string> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type !== vscode.FileType.File) {
        throw new ToolError('FILE_NOT_FOUND', `File not found: ${relativePath}`);
      }
      const bytes = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(bytes).toString('utf8');
    } catch (error) {
      if (error instanceof ToolError) {
        throw error;
      }
      throw new ToolError('FILE_NOT_FOUND', `File not found: ${relativePath}`);
    }
  }

  private async writeNewContent(uri: vscode.Uri, content: string): Promise<void> {
    const directory = vscode.Uri.file(path.dirname(uri.fsPath));
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }
}

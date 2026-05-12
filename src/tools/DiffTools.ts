import * as vscode from 'vscode';
import { ProposedPatch } from '../types/patch';

const PATCH_DIFF_SCHEME = 'autogen-patch';

export class DiffTools {
  private readonly documents = new Map<string, string>();
  private readonly provider: vscode.Disposable;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.provider = vscode.workspace.registerTextDocumentContentProvider(PATCH_DIFF_SCHEME, {
      provideTextDocumentContent: (uri) => this.documents.get(uri.toString()) ?? ''
    });
    this.context.subscriptions.push(this.provider);
  }

  async showUnifiedDiff(patch: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument({ content: patch, language: 'diff' });
    await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
  }

  async openDiff(patch: ProposedPatch): Promise<unknown>;
  async openDiff(original: vscode.Uri, modified: vscode.Uri, title?: string): Promise<void>;
  async openDiff(
    patchOrOriginal: ProposedPatch | vscode.Uri,
    modified?: vscode.Uri,
    title = 'AutoGen Diff'
  ): Promise<unknown> {
    if (patchOrOriginal instanceof vscode.Uri) {
      if (!modified) {
        throw new Error('Modified URI is required');
      }
      await vscode.commands.executeCommand('vscode.diff', patchOrOriginal, modified, title);
      return undefined;
    }

    return this.openPatchDiff(patchOrOriginal);
  }

  private async openPatchDiff(patch: ProposedPatch): Promise<unknown> {
    const firstFile = patch.files[0];
    if (!firstFile) {
      return {
        ok: false,
        message: 'Patch has no files',
        patchId: patch.id,
        openedFiles: []
      };
    }

    try {
      const left = this.createVirtualDocumentUri(patch.id, firstFile.path, 'old', firstFile.oldContent);
      const right = this.createVirtualDocumentUri(patch.id, firstFile.path, 'new', firstFile.newContent);
      await vscode.commands.executeCommand(
        'vscode.diff',
        left,
        right,
        `AutoGen Patch: ${firstFile.path}`,
        { preview: false }
      );

      return {
        ok: true,
        message: 'Diff opened',
        patchId: patch.id,
        openedFiles: [firstFile.path],
        skippedFiles: patch.files.slice(1).map((file) => file.path)
      };
    } catch (error) {
      throw new Error(`DIFF_OPEN_FAILED: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private createVirtualDocumentUri(
    patchId: string,
    filePath: string,
    side: 'old' | 'new',
    content: string
  ): vscode.Uri {
    const uri = vscode.Uri.parse(`${PATCH_DIFF_SCHEME}:/${encodeURIComponent(patchId)}/${side}/${encodeURIComponent(filePath)}`);
    this.documents.set(uri.toString(), content);
    return uri;
  }
}

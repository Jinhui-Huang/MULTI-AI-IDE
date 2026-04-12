import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('AI Agent IDE Extension', () => {
  it('should have valid package.json', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );

    expect(packageJson.name).toBe('ai-agent-ide');
    expect(packageJson.version).toBe('0.1.0');
    expect(packageJson.main).toBe('./dist/extension.js');
    expect(packageJson.engines.vscode).toBe('^1.90.0');
  });

  it('should have proper VS Code contributions', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );
    const { contributes } = packageJson;

    // Check viewsContainers
    expect(contributes.viewsContainers.activitybar).toHaveLength(1);
    expect(contributes.viewsContainers.activitybar[0].id).toBe('ai-agent-sidebar');

    // Check views
    expect(contributes.views['ai-agent-sidebar']).toBeDefined();
    expect(contributes.views['ai-agent-sidebar'][0].id).toBe('aiAgent.chat');

    // Check commands
    const commands = contributes.commands;
    const commandIds = commands.map((cmd: any) => cmd.command);
    expect(commandIds).toContain('aiAgent.openChat');
    expect(commandIds).toContain('aiAgent.clearChat');
    expect(commandIds).toContain('aiAgent.setApiKey');
    expect(commandIds).toContain('aiAgent.openSettings');
  });

  it('should have valid configuration schema', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
    );
    const { configuration } = packageJson.contributes;

    expect(configuration.title).toBe('AI Agent IDE');
    expect(configuration.properties['aiAgent.provider']).toBeDefined();
    expect(configuration.properties['aiAgent.model']).toBeDefined();
    expect(configuration.properties['aiAgent.baseUrl']).toBeDefined();

    // Verify provider enum
    const providers = configuration.properties['aiAgent.provider'].enum;
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('ollama');
    expect(providers).toContain('gemini');
  });

  it('should have extension.js build output', () => {
    const extensionPath = path.join(__dirname, '../dist/extension.js');
    expect(fs.existsSync(extensionPath)).toBe(true);
  });

  it('should have webview build outputs', () => {
    const webviewPath = path.join(__dirname, '../dist/webview/main.js');
    expect(fs.existsSync(webviewPath)).toBe(true);
  });

  it('should have valid TypeScript configuration', () => {
    const tsconfigPath = path.join(__dirname, '../tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));

    expect(tsconfig.compilerOptions).toBeDefined();
    expect(tsconfig.compilerOptions.target).toBe('ES2020');
    expect(tsconfig.compilerOptions.module).toBe('commonjs');
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('should have .vscodeignore file', () => {
    const ignoreFile = path.join(__dirname, '../.vscodeignore');
    expect(fs.existsSync(ignoreFile)).toBe(true);

    const content = fs.readFileSync(ignoreFile, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('src/**/*.test.ts');
  });
});

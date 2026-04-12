#!/usr/bin/env node

/**
 * Smoke tests for AI Agent IDE extension
 * Validates build outputs and configuration
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    failed++;
  }
}

// Test 1: Verify package.json
test('package.json exists and is valid', () => {
  const content = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  if (pkg.name !== 'ai-agent-ide') throw new Error('Invalid package name');
  if (pkg.version !== '0.1.0') throw new Error('Invalid version');
});

// Test 2: Verify distribution files
test('dist/extension.js exists', () => {
  const file = path.join(rootDir, 'dist', 'extension.js');
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const stat = fs.statSync(file);
  if (stat.size === 0) throw new Error('extension.js is empty');
});

test('dist/webview/main.js exists', () => {
  const file = path.join(rootDir, 'dist', 'webview', 'main.js');
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const stat = fs.statSync(file);
  if (stat.size === 0) throw new Error('main.js is empty');
});

test('dist/webview/main.css exists', () => {
  const file = path.join(rootDir, 'dist', 'webview', 'main.css');
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
});

// Test 3: Verify VS Code contributions
test('package.json has valid VS Code contributions', () => {
  const content = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8');
  const pkg = JSON.parse(content);
  const { contributes } = pkg;

  if (!contributes) throw new Error('No contributes section');
  if (!contributes.viewsContainers) throw new Error('No viewsContainers');
  if (!contributes.commands) throw new Error('No commands');
  if (!contributes.configuration) throw new Error('No configuration');

  const commands = contributes.commands.map((c) => c.command);
  const requiredCommands = ['aiAgent.openChat', 'aiAgent.clearChat', 'aiAgent.setApiKey', 'aiAgent.openSettings'];
  for (const cmd of requiredCommands) {
    if (!commands.includes(cmd)) throw new Error(`Missing command: ${cmd}`);
  }
});

// Test 4: Verify .vsix package
test('.vsix package file exists', () => {
  const files = fs.readdirSync(rootDir);
  const vsix = files.find((f) => f.endsWith('.vsix'));
  if (!vsix) throw new Error('No .vsix file found');
});

// Test 5: Verify .vscodeignore exists
test('.vscodeignore file exists', () => {
  const file = path.join(rootDir, '.vscodeignore');
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('node_modules')) throw new Error('.vscodeignore missing node_modules entry');
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passed + failed} (${passed} passed, ${failed} failed)`);
console.log(`${'='.repeat(50)}`);

process.exit(failed > 0 ? 1 : 0);

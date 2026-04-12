#!/usr/bin/env node

/**
 * 测试改进的模糊匹配逻辑
 */

console.log('\n' + '='.repeat(70));
console.log('🧪 Fuzzy Multi-Line Matching Test');
console.log('='.repeat(70) + '\n');

// 测试场景：AI 生成的 SEARCH 块没有缩进，但文件里有缩进
const fileContent = `public class Game {
    public void play() {
        System.out.println("Starting game");
    }

    public static void main(String[] args) {
        Game game = new Game();
        game.play();
    }
}`;

const searchBlock = `public void play() {
    System.out.println("Starting game");
}`;

console.log('📄 文件内容:');
console.log('-'.repeat(70));
console.log(fileContent);
console.log('\n🔍 要查找的 SEARCH 块:');
console.log('-'.repeat(70));
console.log(searchBlock);

// 模拟改进后的模糊匹配算法
console.log('\n' + '='.repeat(70));
console.log('✨ 改进后的模糊匹配算法');
console.log('='.repeat(70) + '\n');

const searchLines = searchBlock.split('\n');
const contentLines = fileContent.split('\n');

console.log(`Search block has ${searchLines.length} lines`);
console.log(`File has ${contentLines.length} lines\n`);

let foundLineIndex = -1;
const firstSearchLine = searchLines[0].trim();

console.log(`Looking for first line (trimmed): "${firstSearchLine}"\n`);

// 方法 1: ❌ 错误的方式（把整个块 trim 成一行）
console.log('❌ OLD (WRONG): Trim entire block to single line');
const trimmedWrong = searchBlock.trim();
console.log(`   Trimmed search (${trimmedWrong.length} chars): "${trimmedWrong}"`);
let found = false;
for (let i = 0; i < contentLines.length; i++) {
  if (contentLines[i].trim() === trimmedWrong) {
    found = true;
    break;
  }
}
console.log(`   Result: ${found ? '✓ Found' : '✗ NOT FOUND'}\n`);

// 方法 2: ✅ 改进的方式（逐行比较）
console.log('✅ NEW (FIXED): Compare line by line');

for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
  const allMatch = searchLines.every((searchLine, idx) => {
    if (i + idx >= contentLines.length) return false;
    const match = contentLines[i + idx].trim() === searchLine.trim();
    if (idx === 0 || match) {
      console.log(`   Line ${i + idx + 1}: "${contentLines[i + idx]}" vs "${searchLine}"`);
      console.log(`             → trim match: ${match ? '✓' : '✗'}`);
    }
    return match;
  });

  if (allMatch) {
    foundLineIndex = i;
    console.log(`\n✅ Found matching block starting at line ${i + 1}\n`);

    // 提取完整的匹配文本（保持原文件的缩进）
    const matchedLines = contentLines.slice(i, i + searchLines.length);
    const matchedSearch = matchedLines.join('\n');

    console.log('📋 提取的匹配文本（保留原缩进）:');
    console.log('-'.repeat(70));
    console.log(matchedSearch);
    console.log('-'.repeat(70));

    break;
  }
}

if (foundLineIndex === -1) {
  console.log('✗ No matching block found');
}

console.log('\n' + '='.repeat(70));
console.log('📊 对比总结');
console.log('='.repeat(70) + '\n');

console.log('OLD (WRONG):');
console.log('  1. Trim entire SEARCH block to single line');
console.log('  2. Compare against each line in file');
console.log('  3. Result: ✗ IMPOSSIBLE - 多行代码永远无法匹配单行');

console.log('\nNEW (FIXED):');
console.log('  1. Split both SEARCH and file content into lines');
console.log('  2. For each position, check if ALL lines trim-match');
console.log('  3. If found, extract full matched text with original indentation');
console.log('  4. Result: ✅ WORKS - 正确处理缩进差异');

console.log('\n' + '='.repeat(70));
console.log('✅ Test complete');
console.log('='.repeat(70) + '\n');

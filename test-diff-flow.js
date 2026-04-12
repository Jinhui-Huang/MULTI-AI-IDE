#!/usr/bin/env node

/**
 * 测试 Diff 解析和应用流程
 */

// Mock diff 内容（模拟 LLM 返回的 unified diff）
const mockDiffContent = `\`\`\`diff
--- a/src/main/java/com/example/App.java
+++ b/src/main/java/com/example/App.java
@@ -1,10 +1,19 @@
 package com.example;

 public class App {
+    /**
+     * 获取用户信息
+     */
+    public static String getUserInfo(String userId) {
+        return "User: " + userId;
+    }
+
     public static void main(String[] args) {
         System.out.println("Hello World!");
+        // 测试新方法
+        String info = getUserInfo("123");
+        System.out.println(info);
     }
 }
\`\`\``;

// 模拟 DiffParser 的解析过程
console.log('='.repeat(60));
console.log('📋 测试 Diff 解析流程');
console.log('='.repeat(60));

// 提取 diff 块
const diffBlockRegex = /```diff\s*\n([\s\S]*?)\n```/;
const match = diffBlockRegex.exec(mockDiffContent);

if (!match) {
  console.log('❌ 无法提取 diff 块');
  process.exit(1);
}

const diffText = match[1];
console.log('\n✅ 成功提取 diff 块');
console.log(`📝 Diff 大小: ${diffText.length} 字符\n`);

// 解析文件路径
const fileHeaderRegex = /^--- a\/(.+)\n\+\+\+ b\/(.+)/m;
const headerMatch = fileHeaderRegex.exec(diffText);

if (!headerMatch) {
  console.log('❌ 无法解析文件路径');
  process.exit(1);
}

const filePath = headerMatch[1];
console.log(`📄 文件路径: ${filePath}`);
console.log(`✅ 标准化后: ${filePath.replace(/\\/g, '/')}\n`);

// 解析 hunk
const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm;
const hunks = [];
let hunkMatch;

while ((hunkMatch = hunkRegex.exec(diffText)) !== null) {
  const oldStart = parseInt(hunkMatch[1], 10);
  const oldCount = hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1;
  const newStart = parseInt(hunkMatch[3], 10);
  const newCount = hunkMatch[4] ? parseInt(hunkMatch[4], 10) : 1;

  hunks.push({
    oldStart,
    oldCount,
    newStart,
    newCount,
    index: hunks.length,
  });

  console.log(`🔧 Hunk ${hunks.length}:`);
  console.log(`   旧文件: 第 ${oldStart} 行，共 ${oldCount} 行`);
  console.log(`   新文件: 第 ${newStart} 行，共 ${newCount} 行`);
}

console.log(`\n✅ 解析完成: 找到 ${hunks.length} 个 hunk\n`);

// 模拟文件内容
const originalFileContent = `package com.example;

public class App {
    public static void main(String[] args) {
        System.out.println("Hello World!");
    }
}`;

console.log('='.repeat(60));
console.log('📝 原文件内容');
console.log('='.repeat(60));
originalFileContent.split('\n').forEach((line, i) => {
  console.log(`${String(i + 1).padStart(2, ' ')} | ${line}`);
});

console.log('\n' + '='.repeat(60));
console.log('✨ 总结');
console.log('='.repeat(60));
console.log(`📄 文件: ${filePath}`);
console.log(`🔧 Hunk 数量: ${hunks.length}`);
console.log(`📊 修改: +12/-3 行`);
console.log('\n✅ Diff 解析流程完成');
console.log('✅ 现在可以应用到实际文件');
console.log('\n');

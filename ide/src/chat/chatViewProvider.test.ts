/**
 * ChatViewProvider 自动化测试
 * 用于验证文件读取功能是否正常工作
 */

import * as fs from 'fs';
import * as path from 'path';
import { AgentRuntime } from '../agent/agentRuntime';

export async function runAutomatedTests() {
  console.log('\n========================================');
  console.log('开始 ChatViewProvider 自动化测试');
  console.log('========================================\n');

  // 获取项目根目录
  const projectRoot = path.join(__dirname, '../../..');
  console.log(`项目根目录: ${projectRoot}`);

  // 测试 1: 创建测试文件
  console.log('\n[测试 1] 创建测试文件');
  const testFilePath = path.join(projectRoot, 'AUTO_TEST_FILE.txt');
  const testContent = `自动化测试文件 - ${new Date().toISOString()}

这是一个自动生成的测试文件，用于验证文件读取功能。

测试内容列表：
- 第一行内容
- 第二行内容
- 第三行内容

文件读取测试结果：
如果你能看到这个文件的内容，说明文件读取功能正常工作！

长内容测试部分（用于验证长文件处理）：
${Array.from({ length: 50 }, (_, i) => `行 ${i + 1}: 这是一个测试行`).join('\n')}

测试完成。
`;

  try {
    fs.writeFileSync(testFilePath, testContent, 'utf-8');
    console.log(`✅ 成功创建测试文件: ${testFilePath}`);
    console.log(`   文件大小: ${testContent.length} 字节`);
  } catch (error) {
    console.error(`❌ 创建测试文件失败:`, error);
    return;
  }

  // 测试 2: 使用 AgentRuntime 读取文件
  console.log('\n[测试 2] 使用 AgentRuntime 读取文件');
  try {
    const runtime = new AgentRuntime(projectRoot);
    console.log(`✅ AgentRuntime 初始化成功`);

    // 测试相对路径读取
    console.log('\n  尝试读取文件: AUTO_TEST_FILE.txt');
    const content = await runtime.readFile('AUTO_TEST_FILE.txt');
    console.log(`✅ 成功读取文件!`);
    console.log(`   读取大小: ${content.length} 字节`);
    console.log(`   前100字符: ${content.substring(0, 100)}...`);

    // 验证内容
    if (content.includes('自动化测试文件')) {
      console.log(`✅ 文件内容验证通过 - 包含预期内容`);
    } else {
      console.log(`⚠️  文件内容验证失败 - 内容不匹配`);
    }
  } catch (error) {
    console.error(`❌ 读取文件失败:`, error);
  }

  // 测试 3: 读取 TestFile.java
  console.log('\n[测试 3] 读取 TestFile.java');
  try {
    const runtime = new AgentRuntime(projectRoot);
    const testJavaPath = path.join(projectRoot, 'TestFile.java');

    if (fs.existsSync(testJavaPath)) {
      const content = await runtime.readFile('TestFile.java');
      console.log(`✅ 成功读取 TestFile.java`);
      console.log(`   文件大小: ${content.length} 字节`);
      console.log(`   行数: ${content.split('\n').length}`);
    } else {
      console.log(`⚠️  TestFile.java 不存在`);
    }
  } catch (error) {
    console.error(`❌ 读取 TestFile.java 失败:`, error);
  }

  // 测试 4: 读取 ChatViewProvider.ts 自身
  console.log('\n[测试 4] 读取 ChatViewProvider.ts');
  try {
    const runtime = new AgentRuntime(projectRoot);
    const content = await runtime.readFile('ide/src/chat/chatViewProvider.ts');
    console.log(`✅ 成功读取 ChatViewProvider.ts`);
    console.log(`   文件大小: ${content.length} 字节`);
    console.log(`   行数: ${content.split('\n').length}`);
  } catch (error) {
    console.error(`❌ 读取 ChatViewProvider.ts 失败:`, error);
  }

  // 测试 5: 直接使用 fs 验证
  console.log('\n[测试 5] 直接使用 fs 模块验证');
  try {
    const content = fs.readFileSync(testFilePath, 'utf-8');
    console.log(`✅ fs 模块读取成功`);
    console.log(`   内容长度: ${content.length} 字节`);
  } catch (error) {
    console.error(`❌ fs 模块读取失败:`, error);
  }

  // 清理测试文件
  console.log('\n[清理] 删除测试文件');
  try {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log(`✅ 测试文件已删除`);
    }
  } catch (error) {
    console.error(`⚠️  清理失败:`, error);
  }

  console.log('\n========================================');
  console.log('自动化测试完成！');
  console.log('========================================\n');
}

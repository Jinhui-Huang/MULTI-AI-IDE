require('dotenv').config();
const { spawn } = require('child_process');

// 创建一个很长的prompt（超过1000字符）
const longPrompt = '请详细解释以下JavaScript代码，并说明它是如何工作的：' +
  '\n\nfunction makeCounter() {\n' +
  '  let count = 0;\n' +
  '  return {\n' +
  '    increment() {\n' +
  '      return ++count;\n' +
  '    },\n' +
  '    decrement() {\n' +
  '      return --count;\n' +
  '    },\n' +
  '    get() {\n' +
  '      return count;\n' +
  '    }\n' +
  '  };\n' +
  '}\n' +
  '\nconst counter = makeCounter();\n' +
  'console.log(counter.increment()); // 1\n' +
  'console.log(counter.increment()); // 2\n' +
  'console.log(counter.decrement()); // 1\n' +
  'console.log(counter.get());       // 1\n' +
  '\n请解释：\n' +
  '1. count变量为什么不会被垃圾回收？\n' +
  '2. 这个模式的优势是什么？\n' +
  '3. 这个模式的缺点是什么？\n' +
  '4. 在实际项目中如何使用这个模式？\n' +
  '5. 与类（class）相比有什么不同？\n' +
  '6. 如何改进这个模式使其更加灵活？';

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

console.log('🧪 长消息测试');
console.log('📏 Prompt长度: ' + longPrompt.length + ' 字符');

let child;
if (process.platform === 'win32' && CLAUDE_BIN.includes(' ')) {
  const quotedPath = `"${CLAUDE_BIN.replace(/\\/g, '/')}"`;
  const cmd = [quotedPath, '--output-format', 'stream-json', '--verbose'].join(' ');
  child = spawn(cmd, [], { shell: true });
} else {
  child = spawn(CLAUDE_BIN, ['--output-format', 'stream-json', '--verbose']);
}

let jsonCount = 0;
let receivedResponse = false;

child.stdout.on('data', (d) => {
  const lines = d.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      jsonCount++;
      try {
        const evt = JSON.parse(line);
        if (evt.type === 'assistant') {
          receivedResponse = true;
          console.log('✅ 收到助手响应');
        }
      } catch (_) {}
    }
  }
});

child.stderr.on('data', (d) => {
  const msg = d.toString();
  if (msg.includes('error') || msg.includes('timeout')) {
    console.error('❌ [错误]', msg);
  }
});

child.on('close', (code) => {
  console.log('\n🏁 完成');
  console.log('📊 JSON行数:', jsonCount);
  console.log('✨ 收到响应:', receivedResponse ? '是' : '否');
  console.log('📌 退出码:', code);
});

child.on('error', (err) => {
  console.error('❌ 进程错误:', err.message);
});

console.log('📤 发送长Prompt...');
child.stdin.write(longPrompt);
child.stdin.end();
console.log('⏳ 等待响应...\n');

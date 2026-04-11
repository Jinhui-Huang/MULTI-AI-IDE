require('dotenv').config();
const { spawn } = require('child_process');

// 创建一个极其冗长的prompt（接近5000字符）
let longPrompt = '请帮我分析这个React组件的性能问题，并提供优化建议：\n\n';
for (let i = 0; i < 50; i++) {
  longPrompt += `第${i+1}段：这是一段很长的重复内容用来测试stdin是否能处理超长消息。 `;
}

const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

console.log('🔥 超长消息测试');
console.log('📏 Prompt长度: ' + longPrompt.length + ' 字符');

let child;
if (process.platform === 'win32' && CLAUDE_BIN.includes(' ')) {
  const quotedPath = `"${CLAUDE_BIN.replace(/\\/g, '/')}"`;
  const cmd = [quotedPath, '--output-format', 'stream-json', '--verbose'].join(' ');
  child = spawn(cmd, [], { shell: true });
} else {
  child = spawn(CLAUDE_BIN, ['--output-format', 'stream-json', '--verbose']);
}

let bytesReceived = 0;
let lastUpdate = Date.now();

child.stdout.on('data', (d) => {
  bytesReceived += d.length;
  const now = Date.now();
  if (now - lastUpdate > 2000) {
    console.log('⬇️  已收到 ' + bytesReceived + ' 字节...');
    lastUpdate = now;
  }
});

child.stderr.on('data', (d) => {
  const msg = d.toString();
  if (msg.includes('stdin') || msg.includes('timeout')) {
    console.error('❌ [警告]', msg.slice(0, 100));
  }
});

child.on('close', (code) => {
  console.log('\n✅ 完成！');
  console.log('📊 总共收到: ' + bytesReceived + ' 字节');
  console.log('📌 退出码: ' + code);
  if (code === 0) {
    console.log('🎉 长消息处理成功，stdin超时问题已解决！');
  }
});

child.on('error', (err) => {
  console.error('❌ 错误:', err.message);
});

console.log('📤 发送超长Prompt...');
child.stdin.write(longPrompt);
child.stdin.end();
console.log('⏳ 处理中...\n');

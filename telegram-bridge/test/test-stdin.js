require('dotenv').config();
const { spawn } = require('child_process');

const longPrompt = '请帮我详细解释一下JavaScript中的闭包概念。';
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';

console.log('📋 CLAUDE_BIN:', CLAUDE_BIN);
console.log('🖥️  平台:', process.platform);

let child;
if (process.platform === 'win32' && CLAUDE_BIN.includes(' ')) {
  const quotedPath = `"${CLAUDE_BIN.replace(/\\/g, '/')}"`;
  const cmd = [quotedPath, '--output-format', 'stream-json', '--verbose'].join(' ');
  console.log('🔧 执行命令:', cmd);
  child = spawn(cmd, [], { shell: true });
} else {
  console.log('🔧 直接spawn');
  child = spawn(CLAUDE_BIN, ['--output-format', 'stream-json', '--verbose']);
}

let stdout = '';
let stderr = '';

child.stdout.on('data', (d) => {
  stdout += d.toString();
  console.log('[STDOUT]', d.toString().substring(0, 150));
});

child.stderr.on('data', (d) => {
  stderr += d.toString();
  console.log('[STDERR]', d.toString().substring(0, 150));
});

child.on('close', (code) => {
  console.log('\n✅ 退出码:', code);
  if (stdout.length > 0) console.log('STDOUT长度:', stdout.length);
  if (stderr.length > 0) console.log('STDERR:', stderr.substring(0, 300));
});

child.on('error', (err) => {
  console.error('❌ 错误:', err.message);
});

console.log('发送prompt到stdin...');
child.stdin.write(longPrompt);
child.stdin.end();

#!/usr/bin/env node

/**
 * Vitra 性能监控日志
 * 实时记录系统资源占用到文件，方便分析性能问题
 *
 * 日志文件: logs/perf-YYYY-MM-DD-HH-mm-ss.csv
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const REFRESH_INTERVAL = 1000; // 1秒记录一次
const LOGS_DIR = path.join(__dirname, '../logs');

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// 创建日志文件
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFile = path.join(LOGS_DIR, `perf-${timestamp}.csv`);

// CSV 表头
const header = '时间,CPU%,内存使用MB,内存可用MB,内存总MB,Node进程数,Node总内存MB,备注\n';
fs.writeFileSync(logFile, header, 'utf8');

console.log('\x1b[36m📊 Vitra 性能监控启动\x1b[0m');
console.log(`📝 日志文件: ${logFile}`);
console.log('🔄 实时记录中... (Ctrl+C 停止)\n');

// 显示表头
process.stdout.write(
  '\x1b[90m' +
  '时间                     CPU    内存      Node    日志\n' +
  '─'.repeat(60) +
  '\x1b[0m\n'
);

let lastCpu = getCpuUsage();
let recordCount = 0;

function getCpuUsage() {
  const cpus = os.cpus();
  const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
  const totalTick = cpus.reduce((acc, cpu) => {
    return acc + Object.values(cpu.times).reduce((a, b) => a + b, 0);
  }, 0);
  return { idle: totalIdle, total: totalTick };
}

function getSystemCpuPercent() {
  const currentCpu = getCpuUsage();
  const idleDiff = currentCpu.idle - lastCpu.idle;
  const totalDiff = currentCpu.total - lastCpu.total;
  lastCpu = currentCpu;
  return totalDiff > 0 ? ((1 - idleDiff / totalDiff) * 100) : 0;
}

async function getNodeStats() {
  return new Promise((resolve) => {
    const platform = os.platform();
    let cmd = '';

    if (platform === 'win32') {
      cmd = 'tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH';
    } else {
      cmd = 'ps -ec -o pid,rss,comm | grep -E "node|electron|vite"';
    }

    exec(cmd, (error, stdout) => {
      if (error) {
        resolve({ count: 0, totalMemMB: 0 });
        return;
      }

      let count = 0;
      let totalMemKB = 0;

      if (platform === 'win32') {
        const matches = stdout.match(/"node\.exe".*?"([\d,]+)\s*([KMG]B)"/g);
        if (matches) {
          count = matches.length;
          for (const m of matches) {
            const memMatch = m.match(/"([\d,]+)\s*([KMG]B)"/);
            if (memMatch) {
              let mem = parseInt(memMatch[1].replace(/,/g, ''));
              const unit = memMatch[2];
              if (unit === 'K') mem /= 1024;
              if (unit === 'G') mem *= 1024;
              totalMemKB += mem * 1024;
            }
          }
        }
      } else {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          if (line.includes('node') || line.includes('electron') || line.includes('vite')) {
            count++;
            const parts = line.trim().split(/\s+/);
            if (parts[1]) totalMemKB += parseInt(parts[1]);
          }
        }
      }

      resolve({ count, totalMemMB: Math.round(totalMemKB / 1024) });
    });
  });
}

function getNote(cpu, memPercent, nodeMemMB) {
  const notes = [];
  if (cpu > 80) notes.push('CPU高');
  if (memPercent > 85) notes.push('内存紧');
  if (nodeMemMB > 1000) notes.push('Node>1GB');
  if (nodeMemMB > 2000) notes.push('⚠️内存泄漏');
  return notes.join(',') || '-';
}

async function record() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

  // 系统指标
  const cpu = getSystemCpuPercent();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemMB = Math.round((totalMem - freeMem) / 1024 / 1024);
  const freeMemMB = Math.round(freeMem / 1024 / 1024);
  const totalMemMB = Math.round(totalMem / 1024 / 1024);
  const memPercent = ((usedMemMB / totalMemMB) * 100).toFixed(1);

  // Node 进程指标
  const { count: nodeCount, totalMemMB: nodeMemMB } = await getNodeStats();

  // 备注
  const note = getNote(cpu, memPercent, nodeMemMB);

  // 写入 CSV
  const csvLine = `${timeStr},${cpu.toFixed(1)},${usedMemMB},${freeMemMB},${totalMemMB},${nodeCount},${nodeMemMB},${note}\n`;
  fs.appendFileSync(logFile, csvLine, 'utf8');

  // 终端显示（紧凑）
  const cpuColor = cpu > 80 ? '\x1b[31m' : cpu > 50 ? '\x1b[33m' : '\x1b[32m';
  const memColor = memPercent > 85 ? '\x1b[31m' : memPercent > 70 ? '\x1b[33m' : '\x1b[32m';
  const nodeColor = nodeMemMB > 1000 ? '\x1b[31m' : '\x1b[36m';

  process.stdout.write(
    `\r${timeStr}  ${cpuColor}${cpu.toFixed(1).padStart(5)}%\x1b[0m  ${memColor}${usedMemMB.toString().padStart(4)}MB\x1b[0m  ${nodeColor}${nodeCount}进程/${nodeMemMB}MB\x1b[0m  ${note.padEnd(15)}`
  );

  recordCount++;
}

// 主循环
let running = true;

process.on('SIGINT', () => {
  running = false;
  console.log('\n\n\x1b[36m📊 监控结束\x1b[0m');
  console.log(`📝 共记录 ${recordCount} 条数据`);
  console.log(`📄 日志文件: ${logFile}`);
  console.log('\n💡 分析建议:');
  console.log('   - 用 Excel/WPS 打开 CSV 文件查看趋势');
  console.log('   - 关注 CPU>80% 和 Node 内存持续增长的情况\n');
  process.exit(0);
});

async function loop() {
  while (running) {
    await record();
    await new Promise(resolve => setTimeout(resolve, REFRESH_INTERVAL));
  }
}

loop().catch(err => {
  console.error('监控出错:', err);
  process.exit(1);
});

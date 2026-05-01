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

const REFRESH_INTERVAL = 2000; // 2秒记录一次，避免刷屏
const LOGS_DIR = path.join(__dirname, '../logs');
const CPU_EMA_ALPHA = 0.35;
const APP_PROCESS_NAMES = ['node', 'electron', 'esbuild'];
const APP_PROCESS_REFRESH_INTERVAL = 10000;

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// 创建日志文件
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logFile = path.join(LOGS_DIR, `perf-${timestamp}.csv`);

// CSV 表头
const header = '时间,系统CPU瞬时%,系统CPU平滑%,内存使用MB,内存可用MB,内存总MB,开发进程数,开发进程CPU%,开发进程内存MB,备注\n';
fs.writeFileSync(logFile, header, 'utf8');

let lastCpu = getCpuUsage();
let smoothedSystemCpu = 0;
let smoothedAppCpu = 0;
let lastProcessSample = {
  at: Date.now(),
  cpuSeconds: 0,
  initialized: false,
};
let cachedAppProcessStats = {
  at: 0,
  count: 0,
  totalMemMB: 0,
  cpuPercent: 0,
  fresh: false,
};
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

function smoothCpu(previous, current) {
  if (!Number.isFinite(previous) || previous <= 0) return current;
  return previous * (1 - CPU_EMA_ALPHA) + current * CPU_EMA_ALPHA;
}

function buildWindowsProcessCommand() {
  const names = APP_PROCESS_NAMES.join(',');
  return [
    'powershell.exe',
    '-NoProfile',
    '-Command',
    `"Get-Process -Name ${names} -ErrorAction SilentlyContinue | `,
    'Select-Object Id,ProcessName,WorkingSet64,CPU | ConvertTo-Json -Compress"',
  ].join(' ');
}

async function getAppProcessStats() {
  const cacheAge = Date.now() - cachedAppProcessStats.at;
  if (cacheAge > 0 && cacheAge < APP_PROCESS_REFRESH_INTERVAL) {
    return { ...cachedAppProcessStats, fresh: false };
  }

  return new Promise((resolve) => {
    const platform = os.platform();
    let cmd = '';
    let shell = true; // Windows 下使用 shell

    if (platform === 'win32') {
      cmd = buildWindowsProcessCommand();
    } else {
      cmd = 'ps -ec -o pid,rss,comm | grep -E "node|electron|vite"';
      shell = false;
    }

    exec(cmd, { shell }, (error, stdout) => {
      if (error) {
        cachedAppProcessStats = { at: Date.now(), count: 0, totalMemMB: 0, cpuPercent: 0, fresh: true };
        resolve(cachedAppProcessStats);
        return;
      }

      let count = 0;
      let totalMemKB = 0;
      let totalCpuSeconds = 0;

      if (platform === 'win32') {
        let rows = [];
        try {
          const parsed = stdout.trim() ? JSON.parse(stdout) : [];
          rows = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          rows = [];
        }

        for (const row of rows) {
          const workingSet = Number(row.WorkingSet64 || 0);
          const cpuSeconds = Number(row.CPU || 0);
          count++;
          totalMemKB += Math.round(workingSet / 1024);
          totalCpuSeconds += Number.isFinite(cpuSeconds) ? cpuSeconds : 0;
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

      const now = Date.now();
      const elapsedSeconds = Math.max(0.001, (now - lastProcessSample.at) / 1000);
      let cpuPercent = 0;
      if (platform === 'win32' && lastProcessSample.initialized) {
        const cpuDelta = Math.max(0, totalCpuSeconds - lastProcessSample.cpuSeconds);
        cpuPercent = (cpuDelta / elapsedSeconds / os.cpus().length) * 100;
      }
      lastProcessSample = { at: now, cpuSeconds: totalCpuSeconds, initialized: true };

      cachedAppProcessStats = {
        at: now,
        count,
        cpuPercent,
        totalMemMB: Math.round(totalMemKB / 1024),
        fresh: true,
      };
      resolve(cachedAppProcessStats);
    });
  });
}

function getNote(systemCpu, appCpu, memPercent, appMemMB) {
  const notes = [];
  if (systemCpu > 80) notes.push('系统CPU高');
  if (appCpu > 50) notes.push('开发进程CPU高');
  if (memPercent > 85) notes.push('内存紧');
  if (appMemMB > 1000) notes.push('开发进程>1GB');
  if (appMemMB > 2000) notes.push('⚠️开发进程内存高');
  return notes.join(',') || '-';
}

async function record() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });

  // 系统指标
  const rawSystemCpu = getSystemCpuPercent();
  smoothedSystemCpu = smoothCpu(smoothedSystemCpu, rawSystemCpu);
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMemMB = Math.round((totalMem - freeMem) / 1024 / 1024);
  const freeMemMB = Math.round(freeMem / 1024 / 1024);
  const totalMemMB = Math.round(totalMem / 1024 / 1024);
  const memPercent = ((usedMemMB / totalMemMB) * 100).toFixed(1);

  // 应用相关进程指标：node / electron / esbuild
  const {
    count: appProcessCount,
    totalMemMB: appMemMB,
    cpuPercent: rawAppCpu,
    fresh: appStatsFresh,
  } = await getAppProcessStats();
  if (appStatsFresh) {
    smoothedAppCpu = smoothCpu(smoothedAppCpu, rawAppCpu);
  }

  // 备注
  const note = getNote(smoothedSystemCpu, smoothedAppCpu, memPercent, appMemMB);

  // 写入 CSV
  const csvLine = `${timeStr},${rawSystemCpu.toFixed(1)},${smoothedSystemCpu.toFixed(1)},${usedMemMB},${freeMemMB},${totalMemMB},${appProcessCount},${smoothedAppCpu.toFixed(1)},${appMemMB},${note}\n`;
  fs.appendFileSync(logFile, csvLine, 'utf8');

  // 终端显示（固定宽度，对齐）
  const cpuColor = smoothedSystemCpu > 80 ? '\x1b[31m' : smoothedSystemCpu > 50 ? '\x1b[33m' : '\x1b[32m';
  const appCpuColor = smoothedAppCpu > 50 ? '\x1b[31m' : smoothedAppCpu > 25 ? '\x1b[33m' : '\x1b[32m';
  const memColor = memPercent > 85 ? '\x1b[31m' : memPercent > 70 ? '\x1b[33m' : '\x1b[32m';
  const appMemColor = appMemMB > 1000 ? '\x1b[31m' : '\x1b[36m';
  const noteColor = note !== '-' ? '\x1b[35m' : '\x1b[90m';

  // 使用 concurrently 友好的输出格式
  console.log(
    `[MON] ${timeStr} | ${cpuColor}CPU均:${smoothedSystemCpu.toFixed(1).padStart(5)}%\x1b[0m 瞬:${rawSystemCpu.toFixed(1).padStart(5)}% | ${appCpuColor}开发:${smoothedAppCpu.toFixed(1).padStart(5)}%\x1b[0m | ${memColor}内存:${usedMemMB.toString().padStart(4)}MB\x1b[0m | ${appMemColor}进程:${appProcessCount}p/${appMemMB}MB\x1b[0m | ${noteColor}${note}\x1b[0m`
  );

  recordCount++;
}

// 主循环
let running = true;

process.on('SIGINT', () => {
  running = false;
  console.log('\n[MON] ════════════════════════════════════════');
  console.log(`[MON] 📊 监控结束 | 共记录 ${recordCount} 条`);
  console.log(`[MON] 📄 日志: ${logFile}`);
  console.log('[MON] 💡 用 Excel/WPS 打开 CSV 查看趋势图\n');
  process.exit(0);
});

async function loop() {
  // 启动提示
  console.log('[MON] 📊 性能监控启动 | 日志: perf-' + timestamp.slice(0, 10) + '.csv');
  console.log('[MON] ' + '─'.repeat(55));

  while (running) {
    await record();
    await new Promise(resolve => setTimeout(resolve, REFRESH_INTERVAL));
  }
}

loop().catch(err => {
  console.error('[MON] 监控出错:', err);
  process.exit(1);
});

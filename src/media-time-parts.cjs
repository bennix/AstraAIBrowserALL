const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFile } = require('node:child_process');

const activeDirectories = new Set();

function reservePartsDirectory(directory) {
  if (activeDirectories.has(directory)) throw Error('This video is already being downloaded in time segments');
  activeDirectories.add(directory);
  return () => activeDirectories.delete(directory);
}

function planParts(duration, seconds) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(seconds) || seconds <= 0) {
    throw Error('A known video duration and positive segment length are required');
  }
  return Array.from({ length: Math.ceil(duration / seconds) }, (_, index) => ({
    index, start: index * seconds, end: Math.min(duration, (index + 1) * seconds)
  }));
}

function createTimeDownload({ executable, args, ffmpeg, directory, metadata, seconds, notify, spawnProcess = spawn }) {
  const parts = planParts(metadata.duration, seconds);
  let sourceIdentity = metadata.webpage_url;
  try {
    const source = new URL(sourceIdentity);
    sourceIdentity = source.origin + source.pathname;
  } catch {}
  const key = crypto.createHash('sha256').update(JSON.stringify([
    sourceIdentity, metadata.id, args[args.indexOf('-f') + 1], metadata.duration, seconds
  ])).digest('hex').slice(0, 20);
  const partDirectory = path.join(directory, '.astra-parts', key);
  const stateFile = path.join(partDirectory, 'completed.json');
  const title = String(metadata.title || metadata.id || 'video').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 90);
  const activeChildren = new Set();
  let cancelled = false, running = false, finalFile;
  let completed = {};
  const clean = text => String(text).replace(/https?:\/\/\S+/g, '[URL]').slice(-2000);

  function checkCancelled() {
    if (cancelled) {
      const error = Error('Download cancelled; completed time segments have been kept');
      error.cancelled = true;
      throw error;
    }
  }

  function stopChild(child) {
    if (!child.pid) { child.kill('SIGTERM'); return; }
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); }
      catch { child.kill('SIGTERM'); }
    }
  }

  function execute(binary, command, onLine = () => {}, allowFailure = false, idleTimeout = 0) {
    checkCancelled();
    return new Promise((resolve, reject) => {
      let diagnostic = '', buffers = { stdout: '', stderr: '' };
      let lastActivity = Date.now(), timedOut = false;
      const child = spawnProcess(binary, command, { shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      activeChildren.add(child);
      const consume = (stream, chunk) => {
        lastActivity = Date.now();
        buffers[stream] += chunk.toString();
        const lines = buffers[stream].split(/[\r\n]/);
        buffers[stream] = lines.pop();
        for (const line of lines) {
          onLine(line);
          diagnostic = (diagnostic + '\n' + line).slice(-12000);
        }
      };
      const watchdog = idleTimeout ? setInterval(() => {
        const idle = Date.now() - lastActivity;
        if (idle >= idleTimeout && !timedOut) {
          timedOut = true;
          stopChild(child);
        } else if (idle > 15000) {
          onLine('ASTRA_WAITING ' + Math.floor(idle / 1000));
        }
      }, 5000) : null;
      child.stdout.on('data', chunk => consume('stdout', chunk));
      child.stderr.on('data', chunk => consume('stderr', chunk));
      child.once('error', error => { clearInterval(watchdog); activeChildren.delete(child); reject(error); });
      child.once('close', code => {
        clearInterval(watchdog);
        activeChildren.delete(child);
        for (const stream of ['stdout', 'stderr']) if (buffers[stream]) consume(stream, '\n');
        if (cancelled) {
          const error = Error('Download cancelled; completed time segments have been kept');
          error.cancelled = true;
          reject(error);
        } else if (timedOut) {
          reject(Error('No media processing activity for ' + idleTimeout / 1000 + ' seconds; retrying this time segment'));
        } else if (code !== 0 && !allowFailure) {
          reject(Error(clean(diagnostic) || 'Media helper exited with code ' + code));
        } else resolve(diagnostic);
      });
    });
  }

  async function verifyDuration(file, expected) {
    const diagnostic = await execute(ffmpeg, ['-hide_banner', '-i', file], () => {}, true);
    const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(diagnostic);
    if (!match) throw Error('Could not verify the completed time segment');
    const actual = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    if (Math.abs(actual - expected) > Math.max(1, expected * 0.001)) {
      throw Error('Incomplete time segment: expected ' + expected.toFixed(1) + 's, received ' + actual.toFixed(1) + 's');
    }
  }

  async function run() {
    if (running) throw Error('This segmented download is already running');
    const releaseDirectory = reservePartsDirectory(partDirectory);
    running = true;
    cancelled = false;
    let mergeFile;
    try {
      fs.mkdirSync(partDirectory, { recursive: true });
      try {
        completed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (!completed || typeof completed !== 'object' || Array.isArray(completed)) completed = {};
      } catch { completed = {}; }
      const downloadPart = async part => {
        checkCancelled();
        const file = path.join(partDirectory, 'part-' + String(part.index + 1).padStart(4, '0') + '.mkv');
        let partPercent = 0;
        const update = value => {
          if (Number.isFinite(value.percent)) partPercent = value.percent;
          notify({ ...part, count: parts.length, ...value, percent: partPercent });
        };
        if (completed[part.index] && completed[part.index].size === fs.statSync(file, { throwIfNoEntry: false })?.size) {
          try {
            await verifyDuration(file, part.end - part.start);
            update({ status: 'completed', percent: 100, file });
            return;
          } catch (error) {
            if (error.cancelled) throw error;
            delete completed[part.index];
          }
        }
        const work = path.join(partDirectory, 'work-' + part.index);
        let success = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          checkCancelled();
          fs.rmSync(work, { recursive: true, force: true });
          fs.mkdirSync(work);
          update({ status: 'downloading', attempt, percent: 0 });
          try {
            const command = [...args];
            command[command.indexOf('-P') + 1] = work;
            command[command.indexOf('-o') + 1] = 'segment.%(ext)s';
            command.push('--download-sections', '*' + part.start + '-' + part.end,
              '--force-keyframes-at-cuts', '--remux-video', 'mkv',
              '--downloader-args', 'ffmpeg_i:-rw_timeout 20000000',
              '--downloader-args', 'ffmpeg_o:-progress pipe:2 -stats_period 1');
            let downloaded;
            const processing = { seconds: 0, speed: '', bytes: 0 };
            await execute(executable, command, line => {
              if (line.startsWith('ASTRA_FILE ')) {
                try { downloaded = JSON.parse(line.slice(11)); } catch {}
              }
              const statistic = /^(out_time_us|out_time|speed|total_size|progress)=(.*)$/.exec(line);
              if (statistic) {
                const [, name, value] = statistic;
                if (name === 'out_time_us' && Number.isFinite(Number(value))) processing.seconds = Math.max(0, Number(value) / 1000000);
                if (name === 'speed' && /^\s*[\d.]+x$/.test(value)) processing.speed = value.trim();
                if (name === 'total_size' && Number.isFinite(Number(value))) processing.bytes = Number(value);
                if (name === 'progress') {
                  update({ status: 'downloading', attempt,
                    percent: Math.min(99, processing.seconds / (part.end - part.start) * 100),
                    processedSeconds: processing.seconds, processingSpeed: processing.speed, bytes: processing.bytes });
                }
              }
              if (line.startsWith('ASTRA_WAITING ')) {
                update({ status: 'downloading', attempt, message: '等待媒体服务器或处理进度，已等待 '+line.slice(14)+' 秒' });
              }
              const elapsed = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line);
              if (elapsed) {
                const current = Number(elapsed[1]) * 3600 + Number(elapsed[2]) * 60 + Number(elapsed[3]);
                update({ status: 'downloading', attempt, percent: Math.min(99, current / (part.end - part.start) * 100) });
              }
              const marker = line.indexOf('ASTRA_PROGRESS ');
              if (marker >= 0) {
                try {
                  const progress = JSON.parse(line.slice(marker + 15));
                  const total = progress.total_bytes || progress.total_bytes_estimate;
                  update({ status: 'downloading', attempt,
                    percent: total ? Math.min(100, progress.downloaded_bytes / total * 100) : undefined,
                    bytes: progress.downloaded_bytes, speed: progress.speed });
                } catch {}
              }
            }, false, 120000);
            if (typeof downloaded !== 'string' || path.dirname(path.resolve(downloaded)) !== path.resolve(work)
                || !fs.existsSync(downloaded)) throw Error('Time segment output was not created');
            await verifyDuration(downloaded, part.end - part.start);
            fs.renameSync(downloaded, file);
            completed[part.index] = { size: fs.statSync(file).size };
            const nextState = stateFile + '.tmp';
            fs.writeFileSync(nextState, JSON.stringify(completed));
            fs.renameSync(nextState, stateFile);
            fs.rmSync(work, { recursive: true, force: true });
            update({ status: 'completed', percent: 100, file });
            success = true;
            break;
          } catch (error) {
            if (error.cancelled) throw error;
            update({ status: attempt === 3 ? 'failed' : 'downloading', attempt,
              message: clean(error.message) });
            if (attempt === 3) throw error;
          }
        }
        if (!success) throw Error('Time segment did not complete');
      };
      let nextPart = 0, failure;
      const worker = async () => {
        while (nextPart < parts.length && !failure && !cancelled) {
          const part = parts[nextPart++];
          try { await downloadPart(part); }
          catch (error) { failure ||= error; }
        }
      };
      await Promise.all(Array.from({ length: Math.min(2, parts.length) }, () => worker()));
      if (failure) throw failure;
      checkCancelled();
      notify({ status: 'merging', count: parts.length });
      const list = path.join(partDirectory, 'concat.txt');
      fs.writeFileSync(list, parts.map(part => "file 'part-" + String(part.index + 1).padStart(4, '0') + ".mkv'").join('\n') + '\n');
      if (!finalFile || fs.existsSync(finalFile)) {
        let suffix = 0;
        do {
          finalFile = path.join(directory, title + ' [分段合并-' + key + ']' + (suffix ? '-' + suffix : '') + '.mkv');
          suffix++;
        } while (fs.existsSync(finalFile));
      }
      mergeFile = path.join(directory, '.astra-merge-' + crypto.randomUUID() + '.mkv');
      await execute(ffmpeg, ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'concat',
        '-safe', '0', '-i', list, '-map', '0', '-c', 'copy', '-progress', 'pipe:1', '-y', mergeFile]);
      await verifyDuration(mergeFile, metadata.duration);
      checkCancelled();
      // Publish the completed merge without overwriting an existing user file.
      fs.linkSync(mergeFile, finalFile);
      fs.unlinkSync(mergeFile);
      mergeFile = null;
      return finalFile;
    } finally {
      if (mergeFile) fs.rmSync(mergeFile, { force: true });
      releaseDirectory();
      running = false;
    }
  }

  return {
    run, partDirectory, parts,
    cancel() { cancelled = true; for (const child of activeChildren) stopChild(child); }
  };
}

module.exports = { planParts, createTimeDownload, reservePartsDirectory };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { planParts, createTimeDownload } = require('../src/media-time-parts.cjs');

test('time ranges cover the entire duration with no overlaps or empty tail', () => {
  assert.deepEqual(planParts(65, 30), [
    { index: 0, start: 0, end: 30 }, { index: 1, start: 30, end: 60 }, { index: 2, start: 60, end: 65 }
  ]);
  assert.equal(planParts(60, 30).length, 2);
  for (const duration of [0, NaN, Infinity, -1]) assert.throws(() => planParts(duration, 30));
  assert.throws(() => planParts(60, 0));
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'astra-time-test-'));
  const attempts = [], updates = [];
  let failSecond = true, active = 0, maximumActive = 0;
  function spawnProcess(binary, args) {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    if (binary === 'yt-dlp') { active++; maximumActive = Math.max(maximumActive, active); child.once('close', () => { active--; }); }
    let killed = false;
    child.kill = () => { killed = true; };
    queueMicrotask(() => {
      if (killed) { child.emit('close', 1); return; }
      if (binary === 'yt-dlp') {
        const range = args[args.indexOf('--download-sections') + 1];
        attempts.push(range);
        if (range === '*4-8' && failSecond) {
          child.stderr.emit('data', 'HTTP Error 503');
          child.emit('close', 1);
          return;
        }
        assert(args.includes('--force-keyframes-at-cuts'));
        assert(args.includes('--remux-video'));
        const [start, end] = range.slice(1).split('-').map(Number);
        const file = path.join(args[args.indexOf('-P') + 1], 'segment.mkv');
        fs.writeFileSync(file, String(end - start));
        child.stderr.emit('data', 'out_time_us=2000000\nspeed=2.0x\nprogress=continue\n');
        child.stdout.emit('data', 'ASTRA_FILE ' + JSON.stringify(file) + '\n');
        child.emit('close', 0);
      } else if (!args.includes('-f')) {
        const duration = Number(fs.readFileSync(args[args.indexOf('-i') + 1], 'utf8'));
        child.stderr.emit('data', 'Duration: 00:00:' + duration.toFixed(2) + '\n');
        child.emit('close', 1); // ffmpeg probe without an output exits nonzero.
      } else {
        const list = args[args.indexOf('-i') + 1];
        const files = fs.readFileSync(list, 'utf8').trim().split('\n')
          .map(line => path.join(path.dirname(list), line.slice(6, -1)));
        const duration = files.reduce((sum, file) => sum + Number(fs.readFileSync(file, 'utf8')), 0);
        fs.writeFileSync(args.at(-1), String(duration));
        child.emit('close', 0);
      }
    });
    return child;
  }
  const options = {
    executable: 'yt-dlp', ffmpeg: 'ffmpeg', directory, seconds: 4,
    metadata: { id: 'fixture', title: 'Test video', duration: 10, webpage_url: 'https://example.org/video?token=first' },
    args: ['-P', directory, '-o', 'video.%(ext)s', '-f', '720p'],
    notify: update => updates.push(update), spawnProcess
  };
  return { directory, attempts, updates, options, maximumActive: () => maximumActive, allowSecond: () => { failSecond = false; } };
}

test('a failed time segment retries three times and resume reuses completed segments', async () => {
  const f = fixture();
  try {
    const runner = createTimeDownload(f.options);
    await assert.rejects(runner.run(), /503/);
    assert.equal(f.attempts.filter(range => range === '*0-4').length, 1);
    assert.equal(f.attempts.filter(range => range === '*4-8').length, 3);
    assert(f.updates.some(update => update.index === 0 && update.status === 'completed'));
    f.allowSecond();
    const file = await runner.run();
    assert.equal(fs.readFileSync(file, 'utf8'), '10');
    assert.equal(f.attempts.filter(range => range === '*0-4').length, 1);
    assert.equal(f.attempts.filter(range => range === '*4-8').length, 4);
    assert.equal(f.attempts.filter(range => range === '*8-10').length, 1);
    assert.equal(f.maximumActive(), 2);
    assert(f.updates.some(update => update.processedSeconds === 2 && update.processingSpeed === '2.0x'));
    assert.equal(fs.readdirSync(runner.partDirectory).filter(name => /^part-.*mkv$/.test(name)).length, 3);
    const refreshed = createTimeDownload({
      ...f.options,
      metadata: { ...f.options.metadata, webpage_url: 'https://example.org/video?token=refreshed' }
    });
    assert.equal(refreshed.partDirectory, runner.partDirectory);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('concurrent downloads cannot write the same segment directory', async () => {
  const f = fixture();
  f.allowSecond();
  try {
    const first = createTimeDownload(f.options);
    const running = first.run();
    const second = createTimeDownload(f.options);
    await assert.rejects(second.run(), /already being downloaded/);
    await running;
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('cancel stops the active segment without publishing a final file', async () => {
  const f = fixture();
  try {
    const runner = createTimeDownload(f.options);
    const running = runner.run();
    runner.cancel();
    await assert.rejects(running, error => error.cancelled === true);
    assert.equal(fs.readdirSync(f.directory).filter(name => name.endsWith('.mkv')).length, 0);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

test('a corrupted cached time segment is redownloaded rather than merged', async () => {
  const f = fixture();
  f.allowSecond();
  try {
    const runner = createTimeDownload(f.options);
    await runner.run();
    const firstPart = path.join(runner.partDirectory, 'part-0001.mkv');
    fs.writeFileSync(firstPart, '9'); // Same file size, wrong duration.
    await runner.run();
    assert.equal(f.attempts.filter(range => range === '*0-4').length, 2);
    assert.equal(f.attempts.filter(range => range === '*4-8').length, 1);
  } finally { fs.rmSync(f.directory, { recursive: true, force: true }); }
});

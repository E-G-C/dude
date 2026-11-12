// @ts-check
/**
 * Controlled checks for the fixed Windows observer
 * (scripts/dude-a2a/native-observer.ps1) and the runner's analysis of its
 * summaries. Nothing here opens an ETW session, observes the machine, or
 * starts a Copilot runtime. Static checks read the script as text. On Windows,
 * eight checks start Windows PowerShell: seven compile the embedded C# with
 * Add-Type, together with two test-only stand-ins (scripted event fields and
 * scripted process pins), and feed synthetic events through the exact
 * production entry points the observer's ETW callback and handle waits call
 * (Tracker.OnProcess, OnFile, and OnHandleExit, and TraceStop for a final
 * stop); the eighth runs the real script with invalid inputs, which it refuses
 * before compiling anything. None is native observation evidence: real ETW
 * decoding, attribution, and privileges stay unverified until an authorized
 * native run.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import {
  NATIVE_LIMITS, OBSERVER_CLASSES, accessViolations, checkCalibration, checkCessation, descendantsOf, layoutOf, liveByPid,
  observerHealth, observerInput, payloadObserved, processTree, startObserver,
} from './native-collaboration.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'native-observer.ps1');
const SOURCE = fs.readFileSync(SCRIPT, 'utf8');
const SYSTEM_ROOT = process.env.SystemRoot ?? 'C:\\Windows';
const POWERSHELL = path.join(SYSTEM_ROOT, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const CAN_COMPILE = process.platform === 'win32' && fs.existsSync(POWERSHELL);
const SKIP = CAN_COMPILE ? false : 'needs Windows PowerShell 5.1';
// The runner forms the observer's paths (its class roots, the Windows PowerShell path, and that process's PATH) by this host's path
// rules, and only a Windows run ever forms them; on another host they are not Windows paths, so the checks of those paths need Windows.
const WINDOWS_PATHS = process.platform === 'win32' ? false : 'needs Windows path rules';

/** @type {string[]} */
const scratch = [];
after(() => {
  for (const directory of scratch) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/**
 * Hold this test's event loop open until the test ends: for a test that drives the runner's observer client directly, whose waits
 * poll on unref'd timers so that no wait alone holds a process open. In production only a native run starts that client, and the
 * run's own invocation holds the process open until it has its report (`runNativeQualification`). Node 24's test runner keeps a file
 * running while a test is pending; Node 20 and 22 end it and cancel every pending test instead.
 * @param {import('node:test').TestContext} t
 */
function holdLoop(t) {
  const hold = setInterval(() => {}, 2 ** 30);
  t.after(() => clearInterval(hold));
}

/** A short test-owned folder by its real path. @param {string} [prefix] */
function tempDir(prefix = 'dude-no-') {
  const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  scratch.push(directory);
  return directory;
}

/** The embedded C# source, exactly as the script compiles it. */
function embedded() {
  const match = /\$Source = @'\r?\n([\s\S]*?)\r?\n'@/.exec(SOURCE);
  assert.ok(match, 'the script embeds one C# source block');
  return match[1];
}

/** Script and C# code without comments, so prose cannot satisfy or trip a check. */
function code() {
  return SOURCE.replace(/<#[\s\S]*?#>/g, '').replace(/^\s*#.*$/gm, '').replace(/\/\/.*$/gm, '');
}

/** A complete, valid observer input for a synthetic layout; nothing here exists on disk. */
function syntheticInput() {
  const parent = 'C:\\fx';
  const layout = layoutOf(parent);
  const scope = {
    values: {
      cli: 'C:\\tools\\cli\\copilot.exe', runtimePayload: 'C:\\tools\\cli\\payload\\index.js', sdk: 'C:\\tools\\sdk',
      tls: { a: { certFile: 'C:\\owners\\a-cert.pem', keyFile: 'C:\\owners\\a-key.pem' }, b: { certFile: 'C:\\owners\\b-cert.pem', keyFile: 'C:\\owners\\b-key.pem' } },
      credentials: { a: 'C:\\owners\\a-token.txt', b: 'C:\\owners\\b-token.txt', worker: 'C:\\owners\\w-token.txt' },
    },
  };
  const input = observerInput({ runId: randomUUID(), rootPid: 1_000, layout, scope, repoRoot: 'C:\\repo', homeDir: 'C:\\Users\\owner',
    systemRoot: 'C:\\Windows', output: path.join(layout.proof, 'observer-summary.json') });
  return { layout, input };
}

// ---------------------------------------------------------------------------
// Static contracts: fixed providers, events, properties, APIs, and no harmful surface.
// ---------------------------------------------------------------------------

test('the observer is fixed: two kernel providers, closed events and properties, public process APIs only, and nothing that kills, deletes, injects, or reads secrets', () => {
  const text = code();
  const csharp = embedded();
  assert.deepEqual([...csharp.matchAll(/new Guid\("([0-9a-f-]+)"\)/gi)].map((match) => match[1].toLowerCase()),
    ['22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716', 'edd08927-9cc4-4e65-b970-c2560fb5c289'], 'Kernel-Process and Kernel-File only');
  assert.match(csharp, /ProcessKeywords = 0x10 \| 0x20;/);
  assert.match(csharp, /FileKeywords = 0x10 \| 0x20 \| 0x80 \| 0x100 \| 0x200 \| 0x400 \| 0x800 \| 0x1000;/);
  assert.equal([...csharp.matchAll(/EnableTraceEx2\(session, ref (\w+), 1, 5, (\w+), 0, 0, IntPtr\.Zero\)/g)].map((match) => `${match[1]}:${match[2]}`).join(),
    'process:ProcessKeywords,file:FileKeywords');
  assert.match(csharp, /name = "DudeA2aObserver-" \+ runId;/, 'one session named for the run');
  assert.match(csharp, /if \(id != 12 && id != 30 && id != 14 && id != 15 && id != 16 && id != 26 && id != 27\) return;/);
  assert.deepEqual([...new Set([...csharp.matchAll(/fields\.(?:UInt|Text)\("(\w+)"/g)].map((match) => match[1]))].sort(),
    ['CreateTime', 'ExitCode', 'ExitTime', 'FileName', 'FileObject', 'FilePath', 'ImageName', 'IssuingThreadId', 'ParentProcessID', 'ProcessID', 'ThreadID']);
  assert.deepEqual([...csharp.matchAll(/static extern \S+ (\w+)\(/g)].map((match) => match[1]).sort(), ['CloseHandle', 'CloseTrace', 'ControlTraceW',
    'CreateToolhelp32Snapshot', 'EnableTraceEx2', 'GetExitCodeProcess', 'GetProcessTimes', 'OpenProcess', 'OpenTraceW', 'Process32FirstW', 'Process32NextW',
    'ProcessTrace', 'QueryDosDeviceW', 'QueryFullProcessImageNameW', 'StartTraceW', 'TdhGetProperty', 'TdhGetPropertySize'].sort());
  assert.match(csharp, /public const uint QueryLimited = 0x1000;/);
  assert.match(csharp, /public const uint Synchronize = 0x00100000;/);
  assert.deepEqual([...csharp.matchAll(/Native\.OpenProcess\(([^,]+),/g)].map((match) => match[1]), ['Native.QueryLimited | Native.Synchronize',
    'Native.QueryLimited | Native.Synchronize'], 'query-limited and synchronize access only: the root and each pin');
  // The ETW callback reads only the header and hands every decision to the tracker's own entry points.
  assert.match(csharp, /if \(provider == KernelProcess\) tracker\.OnProcess\(id, processId, threadId, timeStamp, new RecordFields\(this, record\), this\);/);
  assert.match(csharp, /else if \(provider == KernelFile\) tracker\.OnFile\(id, processId, threadId, timeStamp, new RecordFields\(this, record\)\);/);
  assert.match(csharp, /tracker\.OnHandleExit\(wait\.Pid, wait\.Created, timed, exit, code\);/);
  // A final stop stops the named session while its consumer runs, joins it, closes it only after, and summarizes last.
  assert.match(csharp, /StopResult result = TraceStop\.Run\(\s*delegate \{ return Control\(ControlStop, out lost, out buffers, out realTime\); \},\s*delegate \{ return pump == null \|\| pump\.Join\(DrainMs\); \},\s*delegate \{ return consumerStatus; \},\s*CloseConsumer\);\s*stopped = true;\s*tracker\.Finish\(result\);\s*return tracker\.Summary\(/);
  for (const forbidden of [/TerminateProcess/, /CreateRemoteThread/, /WriteProcessMemory/, /ReadProcessMemory/, /VirtualAllocEx/, /SuspendThread/,
    /NtSuspendProcess/, /DebugActiveProcess/, /OpenThread/, /DeleteFile/, /File\.Delete/, /Directory\.Delete/, /Remove-Item/i, /Stop-Process/i,
    /Start-Process/i, /Invoke-Expression|\biex\b/i, /Invoke-WebRequest|Invoke-RestMethod|WebClient|HttpClient|Net\.Sockets|TcpClient/i, /Registry|RegOpenKey/i,
    /New-Service|sc\.exe|CreateService/i, /RunAs|-Verb\b/i, /Set-ExecutionPolicy/i, /GetEnvironmentVariable|\$env:/i, /CommandLine/, /PROCESS_ALL_ACCESS|0x1F0FFF/i,
    /Set-Content|Out-File|WriteAllText|WriteAllBytes|New-Item|Copy-Item|Move-Item/i, /EVENT_TRACE_FLAG|SystemTraceControlGuid|NT Kernel Logger/i]) {
    assert.equal(forbidden.test(text), false, String(forbidden));
  }
  assert.deepEqual([...text.matchAll(/FileMode\]::(\w+)/g)].map((match) => match[1]), ['CreateNew'], 'its only file write creates the new output file');
  assert.match(text, /\$parentPid = \[DudeA2aObserver\.Native\]::ParentProcessId\(\[System\.Diagnostics\.Process\]::GetCurrentProcess\(\)\.Id\)\r?\nif \(\$parentPid -ne \[uint32\]\$config\.rootPid\) \{ Stop-Refused 'observer_input_invalid' \}/,
    'the only root is the process that started it');
  assert.match(text, /if \(\$status -eq 5\) \{ Stop-Refused 'observer_privilege_missing' \}/, 'missing privilege refuses; nothing elevates');
});

test('the runner and the observer agree on the closed input, path classes, and limits', () => {
  const classNames = /\$ClassNames = @\(([^)]*)\)/.exec(SOURCE);
  assert.ok(classNames);
  assert.deepEqual([...classNames[1].matchAll(/'(\w+)'/g)].map((match) => match[1]), [...OBSERVER_CLASSES]);
  const inputKeys = /\$InputKeys = @\(([^)]*)\)/.exec(SOURCE);
  assert.ok(inputKeys);
  const { input, layout } = syntheticInput();
  assert.deepEqual([...inputKeys[1].matchAll(/'(\w+)'/g)].map((match) => match[1]).sort(), Object.keys(input).sort());
  assert.match(SOURCE, new RegExp(`\\$config\\.limits\\.processes -eq ${NATIVE_LIMITS.processes} -and \\$config\\.limits\\.summaryBytes -eq ${NATIVE_LIMITS.observerBytes}`));
  assert.match(SOURCE, /\[int\]\$config\.limits\.processes,\r?\n\s+\[int\]\$config\.limits\.summaryBytes, \$proofRoot, \$paths\)/,
    'the tracker charges worker storage rows to the same fixed 64-KiB summary budget while accumulating');
  assert.deepEqual(input.limits, { processes: 128, summaryBytes: 65_536 });
  assert.deepEqual(input.classes.map((entry) => entry.name), [...OBSERVER_CLASSES]);
  for (const entry of input.classes) assert.ok(entry.roots.length >= 1 && entry.roots.length <= 8, entry.name);
  for (const canary of input.canaries) assert.match(canary, /^(work|config|home)(\/[A-Za-z0-9._-]{0,63}[A-Za-z0-9_-]){1,8}$/);
  assert.equal(input.workerParent, layout.b.temp, 'worker storage is recognized only below B\'s own temp folder');
  assert.deepEqual(input.controlRoots, { work: layout.control.workspace, config: layout.control.config, home: layout.control.home });
  assert.deepEqual(input.classes.find((entry) => entry.name === 'payload')?.roots, ['C:\\tools\\cli\\payload\\index.js'], 'the payload is its own file class');
});

test('every class root the runner gives the observer is an absolute Windows path, spelled with backslashes only', { skip: WINDOWS_PATHS }, () => {
  for (const entry of syntheticInput().input.classes) {
    for (const root of entry.roots) assert.ok(/^[A-Za-z]:\\/.test(root) && !root.includes('/'), `${entry.name} ${root}`);
  }
});

// ---------------------------------------------------------------------------
// The runner's client: a fixed command line, a closed environment, a line protocol, and owned lifetime.
// ---------------------------------------------------------------------------

/**
 * A stand-in child process; `script` answers each stdin line, and stdin's end
 * is reported through `onEnd`, after which `exitOnEnd` decides whether it exits.
 * @param {(line: any, child: any) => void} script @param {Array<string>} first Lines written at once.
 * @param {{exitOnEnd?: boolean, onEnd?: (child: any) => void}} [options]
 */
function fakeChild(script, first, { exitOnEnd = true, onEnd } = {}) {
  const stdout = new PassThrough();
  /** @type {string[]} */
  const lines = [];
  const child = Object.assign(new EventEmitter(), { pid: 7_777, stdout, stdin: /** @type {Writable | null} */ (null), lines, ended: false, killed: false,
    kill() { child.killed = true; } });
  child.stdin = new Writable({
    write(chunk, _encoding, done) {
      for (const line of String(chunk).split('\n').filter(Boolean)) {
        lines.push(line);
        script(JSON.parse(line), child);
      }
      done();
    },
    final(done) {
      child.ended = true;
      onEnd?.(child);
      if (exitOnEnd) setImmediate(() => child.emit('close', 0));
      done();
    },
  });
  setImmediate(() => { for (const line of first) stdout.write(`${line}\n`); });
  return child;
}

/** A clock the test advances by hand, starting now. */
function handClock() {
  let offset = 0;
  return { now: () => Date.now() + offset, advance: (/** @type {number} */ ms) => { offset += ms; } };
}

test('the runner starts only the fixed script under Windows PowerShell with a closed environment; each reply follows its own marker, and a final stop waits for the helper\'s actual exit', { skip: WINDOWS_PATHS }, async (t) => {
  holdLoop(t);
  const proof = tempDir('dude-nop-');
  /** @type {any[]} */
  const calls = [];
  const summary = { version: 1, marker: 1, health: {}, processes: [], final: { stopStatus: 0, joined: true, consumerStatus: 0, drained: true } };
  /** @type {any} */
  let child = null;
  const handle = startObserver({
    inputFile: path.join(proof, 'observer-input.json'), proof, systemRoot: 'C:\\Windows',
    spawnProcess: /** @type {any} */ ((/** @type {string} */ command, /** @type {string[]} */ args, /** @type {any} */ options) => {
      calls.push({ command, args, options });
      child = fakeChild((message, owner) => {
        assert.ok(fs.existsSync(path.join(proof, `m${message.marker}.txt`)), 'the marker exists before the request');
        owner.stdout.write(`${JSON.stringify(message.op === 'stop' ? { event: 'stopped', summary } : { event: 'snapshot', summary: { ...summary, marker: message.marker } })}\n`);
      }, ['{"event":"ready","providers":["Microsoft-Windows-Kernel-Process","Microsoft-Windows-Kernel-File"]}']);
      return child;
    }),
  });
  assert.equal(typeof handle.close, 'function', 'the handle exists before readiness, so the run owns the helper from its start');
  assert.deepEqual(await handle.ready, { ok: true });
  assert.deepEqual(calls.map((call) => [call.command, call.args]), [['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-InputFile', path.join(proof, 'observer-input.json')]]]);
  assert.deepEqual(calls[0].options.env, { SystemRoot: 'C:\\Windows', windir: 'C:\\Windows', TEMP: path.join(proof, 'observer-temp'),
    TMP: path.join(proof, 'observer-temp'), PATH: 'C:\\Windows\\System32' }, 'no inherited environment');
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal((await handle.snapshot()).marker, 1);
  assert.equal((await handle.snapshot()).marker, 2);
  const stopped = await handle.stop();
  assert.deepEqual(stopped, { summary, reason: null, exit: { exited: true, code: 0 } }, 'the final summary and the helper\'s own exit, not the reply alone');
  assert.equal(child.ended, true, 'stdin was ended after the stop reply');
  assert.equal(child.killed, false);
  assert.deepEqual(fs.readdirSync(proof).sort(), ['m1.txt', 'm2.txt', 'm3.txt', 'observer-temp']);

  for (const [lines, reason] of /** @type {Array<[string[], string]>} */ ([
    [['{"event":"refused","reason":"observer_privilege_missing"}'], 'observer_privilege_missing'],
    [['{"event":"refused","reason":"observer_input_invalid"}'], 'observer_unavailable'],
    [['{"event":"refused","reason":"something_else"}'], 'observer_unavailable'],
    [['not json'], 'observer_unavailable'],
  ])) {
    const refused = startObserver({ inputFile: path.join(proof, 'x.json'), proof: tempDir('dude-nop-'), systemRoot: 'C:\\Windows',
      spawnProcess: /** @type {any} */ (() => fakeChild(() => undefined, lines)) });
    assert.deepEqual(await refused.ready, { ok: false, reason }, lines[0]);
    assert.deepEqual(await refused.close(1_000), { exited: true, code: 0 }, `${lines[0]}: closed by EOF, its exit observed`);
  }
  const exited = startObserver({ inputFile: path.join(proof, 'x.json'), proof: tempDir('dude-nop-'), systemRoot: 'C:\\Windows',
    spawnProcess: /** @type {any} */ (() => {
      const early = fakeChild(() => undefined, []);
      setImmediate(() => early.emit('close', 3));
      return early;
    }) });
  assert.deepEqual(await exited.ready, { ok: false, reason: 'observer_unavailable' }, 'an observer that exits first never counts as ready');

  const lossy = startObserver({ inputFile: path.join(proof, 'x.json'), proof: tempDir('dude-nop-'), systemRoot: 'C:\\Windows',
    spawnProcess: /** @type {any} */ (() => fakeChild((_message, owner) => owner.stdout.write('{"event":"refused","reason":"observer_overflow"}\n'),
      ['{"event":"ready"}'])) });
  assert.deepEqual(await lossy.ready, { ok: true });
  await assert.rejects(lossy.snapshot(), (error) => /** @type {any} */ (error).reason === 'observer_overflow',
    'an overflowing summary stops the run instead of passing truncated');
  const lossyStop = await lossy.stop();
  assert.deepEqual([lossyStop.summary, lossyStop.reason, lossyStop.exit.exited], [null, 'observer_overflow', true], 'a refused final stop is reported, never a summary');
});

test('a missing or late ready line leaves the helper owned: EOF ends it, its exit is awaited within the bound, and a helper that never exits is reported unconfirmed, never killed', async (t) => {
  holdLoop(t);
  // The helper becomes ready only after the startup bound: readiness fails, and closing its input makes it end its own session and exit.
  const clock = handClock();
  /** @type {any} */
  let late = null;
  const handle = startObserver({ inputFile: 'C:\\x\\observer-input.json', proof: tempDir('dude-nol-'), systemRoot: 'C:\\Windows', clock: clock.now,
    spawnProcess: /** @type {any} */ (() => {
      late = fakeChild(() => undefined, [], { onEnd: (owner) => owner.stdout.write('{"event":"ready"}\n') });
      return late;
    }) });
  setTimeout(() => clock.advance(NATIVE_LIMITS.observerMs + 1), 50);
  assert.deepEqual(await handle.ready, { ok: false, reason: 'observer_unavailable' }, 'no ready line within the bound');
  assert.equal(late.ended, false, 'nothing was ended yet: the run decides, and it still owns the helper');
  assert.deepEqual(await handle.close(NATIVE_LIMITS.observerExitMs), { exited: true, code: 0 });
  assert.equal(late.ended, true, 'EOF on stdin ended the protocol');
  assert.equal(late.killed, false, 'nothing was killed');
  await assert.rejects(handle.snapshot(), (error) => /** @type {any} */ (error).reason === 'observer_coverage_lost', 'a late ready never counts');

  // A helper that never exits after EOF: the wait ends at its bound and says so.
  const stuckClock = handClock();
  /** @type {any} */
  let stuck = null;
  const stuckHandle = startObserver({ inputFile: 'C:\\x\\observer-input.json', proof: tempDir('dude-nol-'), systemRoot: 'C:\\Windows', clock: stuckClock.now,
    spawnProcess: /** @type {any} */ (() => {
      stuck = fakeChild(() => undefined, [], { exitOnEnd: false });
      return stuck;
    }) });
  setTimeout(() => stuckClock.advance(NATIVE_LIMITS.observerMs + 1), 50);
  assert.deepEqual(await stuckHandle.ready, { ok: false, reason: 'observer_unavailable' });
  const closing = stuckHandle.close(NATIVE_LIMITS.observerExitMs);
  setTimeout(() => stuckClock.advance(NATIVE_LIMITS.observerExitMs + 1), 50);
  assert.deepEqual(await closing, { exited: false, code: null }, 'its end is unconfirmed');
  assert.deepEqual([stuck.ended, stuck.killed], [true, false], 'EOF was sent; nothing was killed');
  stuck.emit('close', 0);
});

// ---------------------------------------------------------------------------
// The compiled decision path, fed synthetic events through its production entry points.
// ---------------------------------------------------------------------------

/**
 * Test-only stand-ins compiled beside the production source: scripted event
 * properties (what the observer's RecordFields decodes with TDH) and scripted
 * process pins (what its OpenProcess, GetProcessTimes, and
 * QueryFullProcessImageName calls return). Every decision stays the
 * production code's.
 */
const DOUBLES = String.raw`
namespace DudeA2aObserverTest
{
    public sealed class Fields : DudeA2aObserver.IEventFields
    {
        private readonly System.Collections.Generic.Dictionary<string, string> values = new System.Collections.Generic.Dictionary<string, string>();
        public void Set(string name, string value) { values[name] = value; }
        public bool UInt(string property, out ulong value)
        {
            value = 0;
            string text;
            if (!values.TryGetValue(property, out text) || text == null) return false;
            return ulong.TryParse(text, System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out value);
        }
        public string Text(string property) { string text; return values.TryGetValue(property, out text) ? text : null; }
    }

    public sealed class Pins : DudeA2aObserver.IProcessPins
    {
        private readonly System.Collections.Generic.Dictionary<uint, System.Collections.Generic.Queue<DudeA2aObserver.Pin>> scripted =
            new System.Collections.Generic.Dictionary<uint, System.Collections.Generic.Queue<DudeA2aObserver.Pin>>();
        public readonly System.Collections.Generic.List<string> Log = new System.Collections.Generic.List<string>();
        public void Script(uint pid, bool opened, bool timed, long created, string image)
        {
            System.Collections.Generic.Queue<DudeA2aObserver.Pin> queue;
            if (!scripted.TryGetValue(pid, out queue)) { queue = new System.Collections.Generic.Queue<DudeA2aObserver.Pin>(); scripted[pid] = queue; }
            DudeA2aObserver.Pin pin = new DudeA2aObserver.Pin();
            pin.Handle = opened ? new System.IntPtr(1) : System.IntPtr.Zero; pin.Opened = opened; pin.Timed = timed; pin.Created = created; pin.Image = image;
            queue.Enqueue(pin);
        }
        public DudeA2aObserver.Pin Open(uint pid)
        {
            Log.Add("open " + pid.ToString(System.Globalization.CultureInfo.InvariantCulture));
            System.Collections.Generic.Queue<DudeA2aObserver.Pin> queue;
            return scripted.TryGetValue(pid, out queue) && queue.Count > 0 ? queue.Dequeue() : new DudeA2aObserver.Pin();
        }
        public void Watch(DudeA2aObserver.Pin pin, uint pid, long created) { Log.Add("watch " + pid.ToString(System.Globalization.CultureInfo.InvariantCulture)); }
        public void Release(DudeA2aObserver.Pin pin) { Log.Add("release"); }
    }
}
`;

const HARNESS = String.raw`param([string]$Observer, [string]$Doubles, [string]$Scenarios)
Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$text = [System.IO.File]::ReadAllText($Observer)
$match = [regex]::Match($text, "(?s)\`$Source = @'\r?\n(.*?)\r?\n'@")
if (-not $match.Success) { throw 'no embedded source' }
Add-Type -TypeDefinition ($match.Groups[1].Value + [Environment]::NewLine + [System.IO.File]::ReadAllText($Doubles)) -Language CSharp
function Fields([object]$Values) {
  $fields = [DudeA2aObserverTest.Fields]::new()
  if ($null -ne $Values) { foreach ($p in $Values.PSObject.Properties) { if ($null -ne $p.Value) { $fields.Set($p.Name, [string]$p.Value) } } }
  return ,$fields
}
$results = New-Object 'System.Collections.Generic.List[string]'
$all = [System.IO.File]::ReadAllText($Scenarios) | ConvertFrom-Json
foreach ($scenario in $all) {
  $classes = New-Object 'System.Collections.Generic.List[DudeA2aObserver.PathClass]'
  foreach ($entry in @($scenario.classes)) { $classes.Add([DudeA2aObserver.PathClass]::new([string]$entry.name, [string[]]@($entry.roots))) }
  $paths = [DudeA2aObserver.PathMap]::new()
  foreach ($device in @($scenario.devices)) { if ($null -ne $device) { $paths.Add([string]$device[0], [string]$device[1]) } }
  $tracker = [DudeA2aObserver.Tracker]::new($classes.ToArray(), [string[]]@($scenario.canaries), [string]$scenario.workerParent,
    [string[]]@($scenario.controlRoots), [int]$scenario.maxProcesses, [int]$scenario.summaryBytes, [string]$scenario.proofRoot, $paths)
  $pins = [DudeA2aObserverTest.Pins]::new()
  $order = New-Object 'System.Collections.Generic.List[string]'
  $tracker.SetRoot([uint32]$scenario.root.pid, [long]$scenario.root.created, [string]$scenario.root.image)
  foreach ($a in $scenario.steps) {
    switch ([string]$a[0]) {
      'proc' {
        if ($a.Count -gt 6 -and $null -ne $a[6]) {
          $pin = $a[6]
          # A JSON null must reach .NET as null: PowerShell would bind a plain $null to a string parameter as an empty string.
          if ($null -eq $pin[3]) { $pins.Script([uint32]$a[5].ProcessID, [bool]$pin[0], [bool]$pin[1], [long]$pin[2], [NullString]::Value) }
          else { $pins.Script([uint32]$a[5].ProcessID, [bool]$pin[0], [bool]$pin[1], [long]$pin[2], [string]$pin[3]) }
        }
        $tracker.OnProcess([int]$a[1], [uint32]$a[2], [uint32]$a[3], [long]$a[4], (Fields $a[5]), $pins)
      }
      'file' { $tracker.OnFile([int]$a[1], [uint32]$a[2], [uint32]$a[3], [long]$a[4], (Fields $a[5])) }
      'handleExit' { $tracker.OnHandleExit([uint32]$a[1], [long]$a[2], [bool]$a[3], [long]$a[4], [int]$a[5]) }
      'finish' {
        $stopStatus = [uint32]$a[1]; $joined = [bool]$a[2]; $consumer = [uint32]$a[3]
        $result = [DudeA2aObserver.TraceStop]::Run([Func[uint32]]{ $order.Add('stop'); $stopStatus }, [Func[bool]]{ $order.Add('join'); $joined },
          [Func[uint32]]{ $order.Add('status'); $consumer }, [Action]{ $order.Add('close') })
        $tracker.Finish($result)
      }
      default { throw ('unknown step ' + $a[0]) }
    }
  }
  $s = $scenario.summary
  $summary = $tracker.Summary([long]$s.marker, [string]$scenario.runId, [long]$s.eventsLost, [long]$s.buffersLost, [long]$s.realTimeBuffersLost, [int]$s.limitBytes)
  if ($null -eq $summary) { $summary = 'null' }
  $pinLog = ($pins.Log | ForEach-Object { '"' + $_ + '"' }) -join ','
  $orderLog = ($order | ForEach-Object { '"' + $_ + '"' }) -join ','
  $results.Add('{"highestMarker":' + $tracker.HighestMarker + ',"pins":[' + $pinLog + '],"order":[' + $orderLog + '],"summary":' + $summary + '}')
}
[Console]::Out.Write('[' + ($results -join ',') + ']')
`;

const T0 = Date.parse('2026-11-01T00:00:00.000Z');
/** A FILETIME, as a decimal string, `ms` after T0. @param {number} ms */
const ft = (ms) => String((BigInt(T0 + ms) + 11_644_473_600_000n) * 10_000n);
/** An identity key as the Tracker writes it. @param {number} pid @param {number} ms */
const key = (pid, ms) => `${pid}@${ft(ms)}`;

/**
 * A Kernel-Process start event (event 1) logged by `header` at `at`, and the
 * pin its handle would give: `ok`, `unopened`, `untimed`, `noimage`, or
 * `mismatch` (the handle's process was created at another time).
 * @param {number} pid @param {number} parent @param {number} ms @param {string} image
 * @param {{header?: number, at?: number, pin?: 'ok' | 'unopened' | 'untimed' | 'noimage' | 'mismatch'}} [options]
 */
const start = (pid, parent, ms, image, { header = parent, at = ms, pin = 'ok' } = {}) => ['proc', 1, header, 0, ft(at),
  { ProcessID: pid, ParentProcessID: parent, CreateTime: ft(ms), ImageName: image },
  { ok: [true, true, ft(ms), image], unopened: [false, false, '0', null], untimed: [true, false, '0', null], noimage: [true, true, ft(ms), null],
    mismatch: [true, true, ft(ms + 1), image] }[pin]];
/** A Kernel-Process stop event (event 2). @param {number} pid @param {number} ms @param {number} exitMs */
const stopped = (pid, ms, exitMs) => ['proc', 2, pid, 0, ft(exitMs), { ProcessID: pid, CreateTime: ft(ms), ExitTime: ft(exitMs), ExitCode: 0 }];
/** A handle wait firing for one identity. @param {number} pid @param {number} ms @param {number} exitMs @param {boolean} [timed] */
const handleExit = (pid, ms, exitMs, timed = true) => ['handleExit', pid, ft(ms), timed, ft(exitMs), 0];
/** Thread start (3) or stop (4) of `tid` in `pid`. @param {3 | 4} id @param {number} pid @param {number} tid @param {number} at */
const thread = (id, pid, tid, at) => ['proc', id, pid, 0, ft(at), { ProcessID: pid, ThreadID: tid }];
/**
 * A Kernel-File event as its header and properties arrive; `issuing` is the
 * IssuingThreadId property (omitted when null).
 * @param {number} id @param {number} pid @param {number} tid @param {number} at @param {Record<string, unknown>} props @param {number | null} [issuing]
 */
const file = (id, pid, tid, at, props, issuing = null) => ['file', id, pid, tid, ft(at), issuing === null ? props : { ...props, IssuingThreadId: issuing }];
/** @param {number} pid @param {number} at @param {number} fo @param {string | null} name @param {{tid?: number, issuing?: number | null, isNew?: boolean}} [options] */
const open = (pid, at, fo, name, { tid = 0, issuing = null, isNew = false } = {}) => file(isNew ? 30 : 12, pid, tid, at, { FileObject: fo, FileName: name }, issuing);
/** @param {number} pid @param {number} at @param {number} fo @param {'read' | 'write'} op @param {{tid?: number, issuing?: number | null}} [options] */
const io = (pid, at, fo, op, { tid = 0, issuing = null } = {}) => file(op === 'read' ? 15 : 16, pid, tid, at, { FileObject: fo }, issuing);

/** One run of every scenario through the compiled source in one Windows PowerShell process with a test-owned temp folder. @param {any[]} scenarios */
function runTracker(scenarios) {
  const work = tempDir('dude-not-');
  const temp = path.join(work, 't');
  fs.mkdirSync(temp);
  fs.writeFileSync(path.join(work, 'harness.ps1'), HARNESS);
  fs.writeFileSync(path.join(work, 'doubles.cs'), DOUBLES);
  fs.writeFileSync(path.join(work, 'scenarios.json'), JSON.stringify(scenarios));
  const result = spawnSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(work, 'harness.ps1'),
    '-Observer', SCRIPT, '-Doubles', path.join(work, 'doubles.cs'), '-Scenarios', path.join(work, 'scenarios.json')], {
    encoding: 'utf8', windowsHide: true, timeout: 120_000,
    env: { SystemRoot: SYSTEM_ROOT, windir: SYSTEM_ROOT, TEMP: temp, TMP: temp, PATH: path.join(SYSTEM_ROOT, 'System32') },
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`.slice(0, 4_000));
  return /** @type {Array<{highestMarker: number, pins: string[], order: string[], summary: any}>} */ (JSON.parse(result.stdout));
}

/** The scenario every check starts from: the synthetic layout, root 1000 created at T0. @param {Partial<Record<string, any>>} [extra] */
function scenario(extra = {}) {
  const { input, layout } = syntheticInput();
  return {
    runId: input.runId, classes: input.classes, canaries: input.canaries, workerParent: input.workerParent, devices: [],
    controlRoots: [input.controlRoots.work, input.controlRoots.config, input.controlRoots.home], maxProcesses: input.limits.processes,
    summaryBytes: input.limits.summaryBytes, proofRoot: layout.proof,
    root: { pid: 1_000, created: ft(0), image: 'C:\\tools\\node\\node.exe' }, summary: { marker: 1, eventsLost: 0, buffersLost: 0, realTimeBuffersLost: 0, limitBytes: 65_536 },
    steps: [], ...extra,
  };
}

const CLI = 'C:\\tools\\cli\\copilot.exe';
const WORKER_DIR = 'dude-a2a-w-Ab12Cd';

test('the compiled decision path keeps identity by creation lineage, refuses ambiguity, and makes every unpinned process an identity gap', { skip: SKIP, timeout: 180_000 }, () => {
  const results = runTracker([
    scenario({ steps: [ // 0: lineage, orphans, PID reuse after exit, and parent-only exit.
      start(2_000, 1_000, 10, CLI), start(3_000, 2_000, 20, CLI), start(4_000, 3_000, 30, CLI),
      handleExit(2_000, 10, 40),
      start(5_000, 3_000, 50, 'C:\\Windows\\System32\\conhost.exe'),
      handleExit(4_000, 30, 60),
      start(4_000, 3_000, 70, CLI),
      start(6_000, 9_999, 80, 'C:\\other.exe'),
      start(7_000, 2_000, 5_000, 'C:\\reused-parent.exe'),
    ] }),
    scenario({ steps: [ // 1: a live PID starting again, and every way a pin can fail.
      start(2_000, 1_000, 10, CLI), start(2_000, 1_000, 20, CLI),
      start(3_000, 1_000, 30, CLI, { pin: 'mismatch' }),
      start(3_100, 1_000, 31, CLI, { pin: 'unopened' }),
      start(3_200, 1_000, 32, CLI, { pin: 'untimed' }),
      start(3_300, 1_000, 33, CLI, { pin: 'noimage' }),
      handleExit(2_000, 10, 40, false),
    ] }),
    scenario({ maxProcesses: 2, steps: [start(2_000, 1_000, 10, 'C:\\a.exe'), start(3_000, 1_000, 20, 'C:\\b.exe'), start(4_000, 1_000, 30, 'C:\\c.exe')] }),
    scenario({ summary: { marker: 1, eventsLost: 0, buffersLost: 0, realTimeBuffersLost: 0, limitBytes: 512 }, steps: [start(2_000, 1_000, 10, `C:\\${'x'.repeat(600)}.exe`)] }),
    scenario({ summary: { marker: 1, eventsLost: 2, buffersLost: 0, realTimeBuffersLost: 1, limitBytes: 65_536 },
      steps: [start(2_000, 1_000, 10, 'C:\\odd "quoted" \\name\u0001\u2028.exe')] }),
  ]);

  // 0: lineage survives the parent's exit; a reused PID is a new identity; strangers are not tracked.
  const lineage = processTree(results[0].summary);
  const owned = [...descendantsOf(lineage, key(1_000, 0))].filter((entry) => entry !== key(1_000, 0));
  assert.deepEqual(owned.sort(), [key(2_000, 10), key(3_000, 20), key(4_000, 30), key(4_000, 70), key(5_000, 50)].sort());
  assert.equal(lineage.get(key(5_000, 50))?.parent, key(3_000, 20), 'an orphan keeps its creation lineage');
  assert.equal(liveByPid(lineage, 4_000)?.key, key(4_000, 70), 'the live identity, not the exited one with the same pid');
  assert.equal(lineage.get(key(4_000, 30))?.exitedAt, Date.parse('2026-11-01T00:00:00.060Z'));
  assert.equal(lineage.has(key(6_000, 80)) || lineage.has(key(7_000, 5_000)), false, 'no untracked or reused-parent process is adopted');
  assert.deepEqual(observerHealth(results[0].summary), []);
  assert.ok([...lineage.values()].every((node) => node.pinned));
  assert.deepEqual(results[0].pins, ['open 2000', 'watch 2000', 'open 3000', 'watch 3000', 'open 4000', 'watch 4000', 'open 5000', 'watch 5000',
    'open 4000', 'watch 4000'], 'each tracked identity\'s handle is kept and waited on; a process that is not ours is never opened');
  const parentOnly = checkCessation(lineage, owned, { since: T0 + 35, windowMs: 10_000 });
  assert.deepEqual([parentOnly.ok, parentOnly.running], [false, 3], 'the runtime exiting does not show its descendants ended');

  // 1: a second live identity for one PID, and a handle that is missing, untimed, imageless, or from another creation, are gaps.
  assert.equal(results[1].summary.health.identityGaps, 6);
  assert.deepEqual(observerHealth(results[1].summary), ['identityGaps']);
  const pinTree = processTree(results[1].summary);
  for (const [pid, ms] of [[3_000, 30], [3_100, 31], [3_200, 32], [3_300, 33]]) {
    assert.equal(pinTree.get(key(pid, ms))?.pinned, false, `${pid} is tracked for lineage but not pinned`);
  }
  assert.deepEqual(results[1].pins, ['open 2000', 'watch 2000', 'open 2000', 'watch 2000', 'open 3000', 'release', 'open 3100', 'release', 'open 3200',
    'release', 'open 3300', 'release'], 'only a fully pinned handle is kept; every other is released');
  assert.deepEqual(checkCessation(pinTree, [key(3_000, 30)], { since: T0, windowMs: 10_000 }),
    { ok: false, running: 1, late: 0, unpinned: 1, missing: 0, maxMs: 0 }, 'an unpinned identity never confirms cessation');

  // 2-4: limits and loss are reported, never truncated into a clean result; odd names stay valid JSON.
  assert.equal(results[2].summary.health.overflow, true);
  assert.deepEqual(observerHealth(results[2].summary), ['overflow']);
  assert.equal(results[2].summary.processes.length, 3, 'the root and the first two only');
  assert.equal(results[3].summary, null, 'an oversized summary is withheld whole');
  assert.deepEqual(observerHealth(results[4].summary), ['eventsLost', 'realTimeBuffersLost']);
  assert.equal(results[4].summary.processes[1].image, 'C:\\odd "quoted" \\name\u0001\u2028.exe');
});

test('the compiled decision path attributes by historical identity and issuing thread, classifies worker storage by area, and never names a private path', { skip: SKIP, timeout: 180_000 }, () => {
  const { layout } = syntheticInput();
  /** @param {...string} parts */
  const worker = (...parts) => path.join(layout.b.temp, WORKER_DIR, ...parts);
  const [result] = runTracker([scenario({
    devices: [['\\Device\\HarddiskVolume9', 'C:']],
    summary: { marker: 3, eventsLost: 0, buffersLost: 0, realTimeBuffersLost: 0, limitBytes: 65_536 },
    steps: [
      start(1_100, 1_000, 5, 'C:\\tools\\node\\node.exe'), start(2_000, 1_000, 10, CLI), start(3_000, 1_000, 20, CLI), start(3_100, 3_000, 25, CLI),
      start(3_200, 3_100, 30, CLI), start(4_000, 1_000, 35, CLI),
      thread(3, 3_200, 32_001, 31),
      open(1_100, 6, 11, path.join(layout.proof, 'calibration.txt'), { isNew: true }), io(1_100, 6, 11, 'write'), io(1_100, 7, 11, 'read'),
      stopped(1_100, 5, 8),
      open(1_000, 40, 12, path.join(layout.proof, 'm3.txt'), { isNew: true }),
      open(2_000, 41, 13, path.join(layout.proof, 'm9.txt'), { isNew: true }),
      open(2_000, 42, 14, path.join(layout.a.workspace, '.dude', 'ideas', '100-local-seed.md')), io(2_000, 43, 14, 'read'),
      // System completes I/O for the worker's own thread: the header names System, the issuing thread is the worker's.
      open(4, 44, 15, worker('temp', 'scratch.tmp'), { tid: 7_777, issuing: 32_001, isNew: true }), io(4, 45, 15, 'write', { tid: 7_777, issuing: 32_001 }),
      open(3_200, 46, 16, worker('work', '.github', 'agents', 'dude-canary.agent.md')),
      open(3_200, 47, 17, 'C:\\Users\\owner\\secret-token.txt'),
      open(3_200, 48, 18, 'C:\\ProgramData\\private-store\\store.db'),
      open(3_200, 49, 19, '\\Device\\CNG'), open(3_200, 49, 20, '\\Device\\NamedPipe\\stdio-pipe'), io(3_200, 50, 20, 'write'),
      open(3_200, 51, 21, '\\Device\\Mup\\fileserver\\share\\x.txt'),
      open(4_000, 52, 22, path.join(layout.control.workspace, '.git', 'HEAD')),
      open(2_000, 53, 23, path.join(layout.control.workspace, '.git', 'HEAD')),
      io(3_000, 54, 999, 'write'),
      file(26, 2_000, 0, 55, { FileObject: 1, FilePath: path.join(layout.a.temp, 'stage', 'x.md') }),
      file(27, 3_000, 0, 56, { FileObject: 1, FilePath: 'C:\\repo\\README.md' }),
      open(3_000, 57, 24, null),
      file(14, 2_000, 0, 58, { FileObject: 14 }), io(2_000, 59, 14, 'read'),
      open(6_000, 60, 25, 'C:\\untracked\\secret.txt'),
      open(2_000, 61, 26, 'C:\\tools\\cli\\payload\\index.js'), io(2_000, 62, 26, 'read'),
      open(2_000, 63, 27, 'C:\\tools\\cli\\payload\\chunk.js'),
      io(1_000, 64, 888, 'write'),
      io(4, 65, 15, 'write', { tid: 7_777 }),
      open(2_000, 66, 28, '\\Device\\HarddiskVolume9\\fx\\a\\w\\note.md'),
      // The worker's thread stops and its ID later belongs to A: each event goes to whoever held the ID at its own time.
      thread(4, 3_200, 32_001, 67), thread(3, 2_000, 32_001, 68),
      open(4, 69, 29, path.join(layout.a.workspace, 'reuse.md'), { tid: 7_777, issuing: 32_001 }),
      open(4, 66, 30, worker('temp', 'late.tmp'), { tid: 7_777, issuing: 32_001, isNew: true }),
    ],
  })]);
  const observed = result.summary;
  assert.equal(result.highestMarker, 3, 'markers count only when this run\'s own root creates them');
  const tree = processTree(observed);
  /** @type {Map<string, string>} */
  const roles = new Map([[key(1_000, 0), 'root'], [key(1_100, 5), 'helper'], [key(2_000, 10), 'a'], [key(3_000, 20), 'b'], [key(3_100, 25), 'b'],
    [key(3_200, 30), 'worker'], [key(4_000, 35), 'control']]);
  assert.deepEqual(checkCalibration(observed, { rootKey: key(1_000, 0), helperPid: 1_100, image: 'C:\\tools\\node\\node.exe' }), ['decodeFailures', 'unattributed'],
    'the pinned helper wrote, read, and exited; only the injected decode failure and the unattributed I/O remain');
  const violations = accessViolations(observed, roles, { workerDirs: new Map([[key(3_200, 30), WORKER_DIR]]), workerImages: [CLI] });
  assert.deepEqual(violations.forbidden.sort(), ['a:k_workspace:open', 'a:proof:create', 'b:repository:rename', 'worker:real_home:open'],
    'A touching the control workspace or proof folder, B renaming in the repository, and the worker reading the real home');
  assert.deepEqual(violations.unclassified, ['worker:open'], 'one row per process and operation, without any path');
  assert.deepEqual(violations.canary.sort(), ['a:work/.git/HEAD:open', 'worker:work/.github/agents/dude-canary.agent.md:open'].sort());
  assert.deepEqual(violations.identity, []);
  assert.deepEqual(observed.workerDirs.map((/** @type {any} */ row) => [row.process, row.dir, row.area, row.op, row.count]), [
    [key(3_200, 30), WORKER_DIR, 'temp', 'create', 2], [key(3_200, 30), WORKER_DIR, 'temp', 'write', 1], [key(3_200, 30), WORKER_DIR, 'work', 'open', 1]],
  'the worker\'s own storage by area, attributed by issuing thread though the header names System, and a buffered event by the thread\'s owner at its own time');
  const files = Object.fromEntries(observed.files.map((/** @type {any} */ row) => [`${row.process}|${row.class}|${row.op}`, row.count]));
  assert.equal(files[`${key(3_200, 30)}|device|open`], 2);
  assert.equal(files[`${key(3_200, 30)}|device|write`], 1, 'stdio and other device writes are counted as devices');
  assert.equal(files[`${key(2_000, 10)}|a_workspace|read`], 1, 'a closed file object no longer attributes I/O');
  assert.equal(files[`${key(2_000, 10)}|a_workspace|open`], 3, 'the seed, the device-mapped path, and the reused thread\'s open');
  assert.equal(files[`${key(2_000, 10)}|a_temp|delete`], 1);
  assert.deepEqual([observed.health.unattributed, observed.health.rootUnattributed, observed.health.decodeFailures], [2, 1, 1],
    'relevant I/O on unknown files is counted, the root\'s apart');
  assert.deepEqual([files[`${key(2_000, 10)}|payload|open`], files[`${key(2_000, 10)}|payload|read`], files[`${key(2_000, 10)}|runtime|open`]], [1, 1, 1],
    'the declared payload file is its own class; the rest of its folder is the runtime');
  assert.equal(payloadObserved(observed, tree, key(2_000, 10)), true);
  assert.equal(payloadObserved(observed, tree, key(4_000, 35)), false, 'a runtime that never loaded the payload is not shown to');
  const text = JSON.stringify(observed);
  for (const hidden of ['secret-token', 'ProgramData', 'private-store', 'store.db', 'fileserver', 'share', '100-local-seed', 'calibration.txt', 'scratch.tmp',
    'late.tmp', 'README', 'stdio-pipe', 'untracked', 'reuse.md', 'note.md']) {
    assert.equal(text.includes(hidden), false, `${hidden} is never named`);
  }
});

test('a handle exit that wins the race erases nothing: buffered child starts and I/O from before it are attributed exactly as in event order, and the surviving child still fails cessation', { skip: SKIP, timeout: 180_000 }, () => {
  const { layout } = syntheticInput();
  const event = {
    parentStart: start(2_000, 1_000, 10, CLI),
    parentThread: thread(3, 2_000, 20_001, 11),
    childStart: start(2_100, 2_000, 20, CLI, { header: 2_000 }),
    childThread: thread(3, 2_100, 21_001, 21),
    childCreate: open(2_100, 22, 40, path.join(layout.a.workspace, 'child.md'), { tid: 21_001, issuing: 21_001, isNew: true }),
    parentCreate: open(2_000, 25, 41, path.join(layout.a.workspace, 'parent.md'), { tid: 20_001, issuing: 20_001, isNew: true }),
    parentStop: stopped(2_000, 10, 30),
    parentHandle: handleExit(2_000, 10, 30),
    childWrite: io(2_100, 35, 40, 'write', { tid: 21_001, issuing: 21_001 }),
  };
  const [ordered, raced] = runTracker([
    scenario({ steps: [event.parentStart, event.parentThread, event.childStart, event.childThread, event.childCreate, event.parentCreate, event.parentStop,
      event.parentHandle, event.childWrite] }),
    // The handle wait reports the parent's exit before ETW delivers its buffered child start and both creates.
    scenario({ steps: [event.parentStart, event.parentThread, event.parentHandle, event.childStart, event.childThread, event.childCreate,
      event.parentCreate, event.parentStop, event.childWrite] }),
  ]);
  for (const result of [ordered, raced]) {
    assert.deepEqual(observerHealth(result.summary), []);
    assert.deepEqual(result.summary.processes.map((/** @type {any} */ row) => [row.key, row.parent, row.exited]), [
      [key(1_000, 0), null, null], [key(2_000, 10), key(1_000, 0), '2026-11-01T00:00:00.030Z'], [key(2_100, 20), key(2_000, 10), null]]);
  }
  assert.deepEqual(raced.summary.processes, ordered.summary.processes, 'the same historical tree whichever exit report arrives first');
  assert.deepEqual(raced.summary.files, ordered.summary.files, 'the same effects whichever exit report arrives first');
  assert.deepEqual(raced.summary.files.map((/** @type {any} */ row) => [row.process, row.class, row.op, row.count]), [
    [key(2_000, 10), 'a_workspace', 'create', 1], [key(2_100, 20), 'a_workspace', 'create', 1], [key(2_100, 20), 'a_workspace', 'write', 1]]);
  const tree = processTree(raced.summary);
  const cessation = checkCessation(tree, descendantsOf(tree, key(2_000, 10)), { since: T0 + 30, windowMs: 10_000 });
  assert.deepEqual([cessation.ok, cessation.running], [false, 1], 'the parent ended, but the child it started before exiting still runs');
});

test('the compiled decision path reads the issuing thread before excluding System-header I/O, and counts relevant I/O on unknown files', { skip: SKIP, timeout: 180_000 }, () => {
  const { layout } = syntheticInput();
  /** @param {string} name */
  const temp = (name) => path.join(layout.b.temp, WORKER_DIR, 'temp', name);
  const [result] = runTracker([scenario({ steps: [
    start(3_200, 1_000, 30, CLI), thread(3, 3_200, 32_001, 31),
    open(4, 40, 50, temp('a.tmp'), { tid: 7_777, issuing: 32_001, isNew: true }),
    open(4, 41, 51, temp('b.tmp'), { tid: 7_777, issuing: 9_999, isNew: true }),
    io(3_200, 42, 52, 'write', { tid: 32_001, issuing: 32_001 }),
    io(1_000, 43, 53, 'write'),
  ] })]);
  assert.deepEqual(result.summary.workerDirs.map((/** @type {any} */ row) => [row.process, row.area, row.op, row.count]), [[key(3_200, 30), 'temp', 'create', 1]],
    'the System-header create issued by the worker\'s thread is the worker\'s; one issued by an untracked thread is not anyone\'s');
  assert.deepEqual([result.summary.health.unattributed, result.summary.health.rootUnattributed], [1, 1]);
  assert.deepEqual(observerHealth(result.summary), ['unattributed'], 'owned I/O on a file never seen opened is fatal; the root\'s own handles are not checked');
});

/** The bytes the Tracker charges for one new worker storage row: its fields as written, a 19-digit count, its brace, and a comma. @param {Record<string, string | null>} row */
const rowCost = (row) => JSON.stringify(row).length + ',"count":'.length + 19 + 1;

test('worker storage rows keep the path relative to the worker\'s own folder from the start of observation, never a name outside it or in its temp area, and are bounded while accumulating: an overflow is sticky, never a dropped row', { skip: SKIP, timeout: 180_000 }, () => {
  const { layout } = syntheticInput();
  /** @param {...string} parts */
  const worker = (...parts) => path.join(layout.b.temp, WORKER_DIR, ...parts);
  const workerStart = [start(3_200, 1_000, 30, CLI), thread(3, 3_200, 32_001, 31)];
  /** One create, by the worker's own thread, of a new file at `name`. @param {number} at @param {number} fo @param {string} name */
  const create = (at, fo, name) => open(3_200, at, fo, name, { tid: 32_001, issuing: 32_001, isNew: true });
  const session = ['config', 'session-state', 's-1'];
  const budget = [
    { process: key(3_200, 30), dir: WORKER_DIR, area: 'config', op: 'create', path: 'config/a.bin' },
    { process: key(3_200, 30), dir: WORKER_DIR, area: 'config', op: 'create', path: 'config/b.bin' },
  ];
  const many = Array.from({ length: 500 }, (_, index) => create(100 + index, 1_000 + index, worker(...session, 'files', `f-${String(index).padStart(3, '0')}.bin`)));
  // `config/` and a name: exactly the 1,024-character bound, and one character over it.
  const atBound = 'b'.repeat(1_024 - 'config/'.length);
  const [paths, exact, accumulating, long, atLimit, overLimit] = runTracker([
    scenario({ steps: [ // 0: paths inside the owned folder only, recorded before anything could associate a session with it.
      ...workerStart,
      create(40, 40, worker('config', 'session-state')), create(41, 41, worker(...session)), create(42, 42, worker(...session, 'events.jsonl')),
      io(3_200, 43, 42, 'write', { tid: 32_001, issuing: 32_001 }), io(3_200, 44, 42, 'write', { tid: 32_001, issuing: 32_001 }),
      create(45, 45, worker('temp', 'scratch.tmp')), open(3_200, 46, 46, worker(), { tid: 32_001, issuing: 32_001 }), create(47, 47, worker('other.txt')),
      create(48, 48, worker('home', 'Notes', 'x.md')), create(49, 49, path.join(layout.b.temp, 'outside.txt')),
      create(50, 50, path.join(layout.b.temp, 'dude-a2a-w-Other1', 'config', 'y.bin')),
    ] }),
    // 1: an exact budget of two rows: the third new row overflows, an existing row still counts, and no later row is kept.
    scenario({ summaryBytes: rowCost(budget[0]) + rowCost(budget[1]), steps: [
      ...workerStart, create(40, 40, worker('config', 'a.bin')), create(41, 41, worker('config', 'b.bin')), create(42, 42, worker('config', 'c.bin')),
      create(43, 43, worker('config', 'a.bin')), create(44, 44, worker('config', 'd.bin')),
    ] }),
    // 2: the production limits: the 64-KiB budget is crossed while accumulating, long before any summary is written.
    scenario({ steps: [...workerStart, ...many] }),
    // 3: one relative path over the 1,024-character bound.
    scenario({ steps: [...workerStart, create(40, 40, worker('config', 'x'.repeat(1_100))), create(41, 41, worker('config', 'ok.bin'))] }),
    // 4: a relative path of exactly 1,024 characters, then another row.
    scenario({ steps: [...workerStart, create(40, 40, worker('config', atBound)), create(41, 41, worker('config', 'ok.bin'))] }),
    // 5: one character more, then the same other row.
    scenario({ steps: [...workerStart, create(40, 40, worker('config', `${atBound}b`)), create(41, 41, worker('config', 'ok.bin'))] }),
  ]);

  assert.deepEqual(observerHealth(paths.summary), []);
  assert.deepEqual(paths.summary.workerDirs.map((/** @type {any} */ row) => [row.dir, row.area, row.op, row.path, row.count]), [
    [WORKER_DIR, 'config', 'create', 'config/session-state', 1],
    [WORKER_DIR, 'config', 'create', 'config/session-state/s-1', 1],
    [WORKER_DIR, 'config', 'create', 'config/session-state/s-1/events.jsonl', 1],
    [WORKER_DIR, 'config', 'write', 'config/session-state/s-1/events.jsonl', 2],
    [WORKER_DIR, 'home', 'create', 'home/Notes/x.md', 1],
    [WORKER_DIR, 'other', 'create', 'other.txt', 1],
    [WORKER_DIR, 'root', 'open', '', 1],
    [WORKER_DIR, 'temp', 'create', null, 1],
    ['dude-a2a-w-Other1', 'config', 'create', 'config/y.bin', 1],
  ], 'each row names the process, folder, area, operation, and the path within that folder; the temp area keeps no name');
  assert.ok(paths.summary.workerDirs.every((/** @type {any} */ row) => row.process === key(3_200, 30)));
  assert.equal(Object.fromEntries(paths.summary.files.map((/** @type {any} */ row) => [`${row.class}|${row.op}`, row.count]))['b_temp|create'], 1,
    'outside the worker folders a path is counted by class only');
  for (const hidden of ['outside.txt', 'scratch.tmp', layout.b.temp.split(path.sep).join('/')]) {
    assert.equal(JSON.stringify(paths.summary).includes(hidden), false, `${hidden} is never named`);
  }

  assert.deepEqual(exact.summary.workerDirs.map((/** @type {any} */ row) => [row.path, row.count]), [['config/a.bin', 2], ['config/b.bin', 1]],
    'the row that would exceed the budget is not kept, an existing row still counts, and no row is kept after the overflow');
  assert.equal(exact.summary.health.overflow, true);
  assert.deepEqual(observerHealth(exact.summary), ['overflow'], 'the overflow invalidates the summary');

  const kept = accumulating.summary.workerDirs;
  const charged = kept.reduce((/** @type {number} */ sum, /** @type {any} */ row) => sum + rowCost({ process: row.process, dir: row.dir, area: row.area,
    op: row.op, path: row.path }), 0);
  assert.equal(accumulating.summary.health.overflow, true, 'crossing the 64-KiB budget while accumulating is an overflow');
  assert.deepEqual(observerHealth(accumulating.summary), ['overflow'], 'and it invalidates the summary that still reports it');
  assert.ok(kept.length > 100 && kept.length < many.length, `${kept.length} of ${many.length} rows kept`);
  assert.ok(charged <= NATIVE_LIMITS.observerBytes && charged + rowCost({ ...budget[0], path: kept.at(-1).path }) > NATIVE_LIMITS.observerBytes,
    `the kept rows use ${charged} of ${NATIVE_LIMITS.observerBytes} bytes, and the next would not fit`);
  assert.ok(Buffer.byteLength(JSON.stringify(accumulating.summary)) <= NATIVE_LIMITS.observerBytes, 'the summary itself stays within its limit');

  assert.deepEqual([long.summary.health.overflow, long.summary.workerDirs.length], [true, 0], 'an overlong path is an overflow, and nothing after it is kept');
  assert.deepEqual([atLimit.summary.health.overflow, observerHealth(atLimit.summary)], [false, []], 'exactly 1,024 characters is within the bound');
  assert.deepEqual(atLimit.summary.workerDirs.map((/** @type {any} */ row) => [row.path, row.count]), [[`config/${atBound}`, 1], ['config/ok.bin', 1]],
    'the path at the bound is kept whole, and the next row too');
  assert.deepEqual([overLimit.summary.health.overflow, observerHealth(overLimit.summary), overLimit.summary.workerDirs.length], [true, ['overflow'], 0],
    '1,025 characters is a sticky overflow: that row and every later new row are not kept');
});

test('a path below the worker parent that is not one plain spelling is an invalid row with no name, before any folder or area is assigned: traversal, empty or forward separators, trailing dots or spaces (on the worker folder alone too), streams, characters no Windows file name holds, and 8.3 short names of any digit and case never reach an area, the temp area\'s rule included, and always fail', { skip: SKIP, timeout: 180_000 }, () => {
  const { layout } = syntheticInput();
  // Raw strings throughout, never path.join, which would normalize the very spellings under test away.
  const parent = `${layout.b.temp}\\`;
  const own = `${parent}${WORKER_DIR}`;
  const workerStart = [start(3_200, 1_000, 30, CLI), thread(3, 3_200, 32_001, 31)];
  /** One create, by the worker's own thread, of a new file named exactly `name`. @param {number} at @param {number} fo @param {string} name */
  const create = (at, fo, name) => open(3_200, at, fo, name, { tid: 32_001, issuing: 32_001, isNew: true });
  /** @type {Array<[string, string, string]>} Each case: its label, the raw path, and the folder its row may name. */
  const cases = [
    ['a temp tail that climbs into configuration storage', `${own}\\temp\\..\\config\\sidecar.db`, WORKER_DIR],
    ['a configuration tail that climbs out of the worker\'s folder', `${own}\\config\\..\\..\\outside.txt`, WORKER_DIR],
    ['a dot segment', `${own}\\.\\config\\sidecar.db`, WORKER_DIR],
    ['a doubled separator in configuration storage', `${own}\\config\\\\sidecar.db`, WORKER_DIR],
    ['a doubled separator in the temp area', `${own}\\temp\\\\sidecar.tmp`, WORKER_DIR],
    ['a doubled trailing separator', `${own}\\config\\\\`, WORKER_DIR],
    ['forward separators', `${own}\\temp/../config/sidecar.db`, WORKER_DIR],
    ['a trailing dot on an area', `${own}\\temp.\\sidecar.db`, WORKER_DIR],
    ['a trailing space on an area', `${own}\\temp \\sidecar.db`, WORKER_DIR],
    ['a trailing dot on a documented name', `${own}\\config\\session-state\\s-1\\events.jsonl.`, WORKER_DIR],
    ['a trailing space on a documented name', `${own}\\config\\session-state\\s-1\\events.jsonl `, WORKER_DIR],
    ['a stream of a documented file', `${own}\\config\\session-state\\s-1\\events.jsonl:sidecar`, WORKER_DIR],
    ['an 8.3 short name for an area', `${own}\\CONFIG~1\\sidecar.db`, WORKER_DIR],
    ['an 8.3 short name inside configuration storage', `${own}\\config\\SESSIO~1\\s-1\\events.jsonl`, WORKER_DIR],
    ['an 8.3 short name for a documented file', `${own}\\config\\session-state\\s-1\\EVENTS~1.JSO`, WORKER_DIR],
    ['an 8.3 short name for the worker folder', `${parent}DUDE-A~1\\temp\\sidecar.tmp`, ''],
    // Any digit after the tilde, in any case, in the folder segment or in a later one, with or without an extension.
    ['an 8.3 short name ~2 for an area', `${own}\\CONFIG~2\\sidecar.db`, WORKER_DIR],
    ['a mixed-case 8.3 short name ~5 for an area', `${own}\\Config~5\\sidecar.db`, WORKER_DIR],
    ['a lower-case 8.3 short name ~9 inside configuration storage', `${own}\\config\\sessio~9\\s-1\\events.jsonl`, WORKER_DIR],
    ['an 8.3 short name ~3 of a documented file\'s extension', `${own}\\config\\session-state\\s-1\\EVENTS~3.JSO`, WORKER_DIR],
    ['a lower-case 8.3 short name ~7 with an extension, deeper in a documented folder', `${own}\\config\\session-state\\s-1\\files\\notes~7.txt`, WORKER_DIR],
    ['an 8.3 short name ~4 for the worker folder', `${parent}DUDE-A~4\\temp\\sidecar.tmp`, ''],
    ['a mixed-case 8.3 short name ~6 for the worker folder', `${parent}Dude-a~6\\temp\\sidecar.tmp`, ''],
    ['a trailing dot on the worker folder', `${own}.\\temp\\sidecar.tmp`, ''],
    // The worker folder alone, spelled with a trailing dot or space and nothing after it: one segment is validated too.
    ['the worker folder alone with a trailing dot', `${own}.`, ''],
    ['the worker folder alone with a trailing space', `${own} `, ''],
    // Characters a Windows file name never holds.
    ['a wildcard star', `${own}\\config\\sidecar*.db`, WORKER_DIR],
    ['a wildcard question mark', `${own}\\config\\sidecar?.db`, WORKER_DIR],
    ['a quote', `${own}\\config\\sidecar".db`, WORKER_DIR],
    ['an opening angle bracket', `${own}\\config\\sidecar<.db`, WORKER_DIR],
    ['a closing angle bracket', `${own}\\config\\sidecar>.db`, WORKER_DIR],
    ['a bar', `${own}\\config\\sidecar|.db`, WORKER_DIR],
    ['a climb out of the worker parent and back', `${parent}..\\t\\${WORKER_DIR}\\temp\\sidecar.tmp`, ''],
  ];
  const results = runTracker(cases.map(([, name]) => scenario({ steps: [...workerStart, create(40, 40, name), create(41, 41, `${own}\\temp\\plain.tmp`)] })));
  const roles = new Map([[key(1_000, 0), 'root'], [key(3_200, 30), 'worker']]);
  /** @param {any} row */
  const shape = (row) => JSON.stringify([row.process, row.dir, row.area, row.op, row.path, row.count]);
  for (const [index, [label, , dir]] of cases.entries()) {
    const { summary } = results[index];
    assert.deepEqual(observerHealth(summary), [], label);
    assert.deepEqual(summary.workerDirs.map(shape).sort(), [[key(3_200, 30), dir, 'invalid', 'create', null, 1], [key(3_200, 30), WORKER_DIR, 'temp', 'create', null, 1]]
      .map((row) => JSON.stringify(row)).sort(), `${label}: one invalid row with no path beside the plain temp row, which keeps its rule`);
    const text = JSON.stringify(summary);
    for (const hidden of ['sidecar', 'outside', 'session-state', 'events.jsonl', 'EVENTS~', 'SESSIO', 'CONFIG~', 'DUDE-A~', 'plain.tmp', 'Config~', 'sessio~',
      'notes~', 'Dude-a~']) {
      assert.equal(text.includes(hidden), false, `${label}: ${hidden} is never named`);
    }
    const found = accessViolations(summary, roles, { workerDirs: new Map([[key(3_200, 30), WORKER_DIR]]), workerImages: [CLI],
      workspaces: new Map([[WORKER_DIR, 'config/session-state/s-1']]) });
    assert.deepEqual(found, { forbidden: dir ? [] : ['worker:foreign_storage:create'], unclassified: dir ? ['worker:invalid:create'] : [], canary: [], identity: [] },
      `${label}: it fails, and no area's rule applies to it`);
  }
});

test('a final stop stops the session while its consumer runs, joins it, and closes it only after; anything short of that is not drained', { skip: SKIP, timeout: 180_000 }, () => {
  const results = runTracker([
    scenario({ steps: [['finish', 0, true, 0]] }),
    scenario({ steps: [['finish', 0, false, 0]] }),
    scenario({ steps: [['finish', 5, true, 0]] }),
    scenario({ steps: [] }),
  ]);
  assert.deepEqual(results[0].order, ['stop', 'join', 'status', 'close']);
  assert.deepEqual(results[0].summary.final, { stopStatus: 0, joined: true, consumerStatus: 0, drained: true });
  assert.deepEqual(observerHealth(results[0].summary, { final: true }), []);
  assert.deepEqual(results[1].order, ['stop', 'join', 'close'], 'a consumer that did not return in time is closed to unblock it, never read as drained');
  assert.deepEqual(results[1].summary.final, { stopStatus: 0, joined: false, consumerStatus: 4_294_967_295, drained: false });
  assert.deepEqual(observerHealth(results[1].summary, { final: true }), ['drain_incomplete']);
  assert.deepEqual([results[2].summary.final.drained, observerHealth(results[2].summary, { final: true })], [false, ['drain_incomplete']],
    'a failed session stop is not a drain');
  assert.equal(results[3].summary.final, null, 'a snapshot is never a final summary');
  assert.deepEqual(observerHealth(results[3].summary, { final: true }), ['drain_incomplete']);
});

// ---------------------------------------------------------------------------
// The runner's analysis of a summary: cessation windows, calibration, health, storage purpose, and worker images.
// ---------------------------------------------------------------------------

test('cessation and calibration fail on a survivor, a late, missing, or unpinned identity, a missing anchor, or an incomplete helper; an exit before the window began is within it', () => {
  const tree = processTree({ processes: [
    { key: 'r@0', pid: 1, parent: null, created: '2026-11-01T00:00:00.000Z', image: 'n', exited: null, exitCode: null, pinned: true },
    { key: 'x@1', pid: 2, parent: 'r@0', created: '2026-11-01T00:00:01.000Z', image: 'c', exited: '2026-11-01T00:00:05.000Z', exitCode: 0, pinned: true },
    { key: 'y@1', pid: 3, parent: 'x@1', created: '2026-11-01T00:00:02.000Z', image: 'c', exited: '2026-11-01T00:00:13.000Z', exitCode: 0, pinned: true },
    { key: 'u@1', pid: 4, parent: 'x@1', created: '2026-11-01T00:00:02.000Z', image: 'c', exited: '2026-11-01T00:00:03.000Z', exitCode: 0, pinned: false },
  ] });
  const since = Date.parse('2026-11-01T00:00:04.000Z');
  assert.deepEqual(checkCessation(tree, ['x@1'], { since, windowMs: 10_000 }), { ok: true, running: 0, late: 0, unpinned: 0, missing: 0, maxMs: 1_000 });
  assert.deepEqual(checkCessation(tree, ['x@1', 'y@1'], { since, windowMs: 8_000 }), { ok: false, running: 0, late: 1, unpinned: 0, missing: 0, maxMs: 9_000 });
  // The window's own edge: 10 000 ms after the anchor is within it, 10 001 ms is not.
  const anchor = Date.parse('2026-11-01T00:00:03.000Z');
  assert.equal(checkCessation(tree, ['y@1'], { since: anchor, windowMs: 10_000 }).ok, true);
  assert.equal(checkCessation(tree, ['y@1'], { since: anchor - 1, windowMs: 10_000 }).ok, false);
  assert.deepEqual(checkCessation(tree, ['x@1'], { since: Date.parse('2026-11-01T00:00:30.000Z'), windowMs: 10_000 }),
    { ok: true, running: 0, late: 0, unpinned: 0, missing: 0, maxMs: 0 }, 'an exit before this window began is within it; nothing negative counts as elapsed');
  assert.equal(checkCessation(tree, ['u@1'], { since, windowMs: 10_000 }).ok, false, 'an unpinned identity never confirms cessation');
  assert.deepEqual(checkCessation(tree, ['gone@1'], { since, windowMs: 10_000 }).missing, 1);
  assert.equal(checkCessation(tree, ['x@1'], { since: Number.NaN, windowMs: 10_000 }).ok, false, 'no anchor, no window');

  const helper = { key: 'h@1', pid: 9, parent: 'r@0', created: '2026-11-01T00:00:01.000Z', image: 'C:\\node.exe', exited: '2026-11-01T00:00:02.000Z',
    exitCode: 0, pinned: true };
  const root = { key: 'r@0', pid: 1, parent: null, created: '2026-11-01T00:00:00.000Z', image: 'C:\\node.exe', exited: null, exitCode: null, pinned: true };
  const health = { eventsLost: 0, buffersLost: 0, realTimeBuffersLost: 0, decodeFailures: 0, identityGaps: 0, unattributed: 0, rootUnattributed: 4,
    overflow: false, markersMissed: 0 };
  const summary = (/** @type {any[]} */ files, extra = {}) => ({ health, processes: [root, helper], files, ...extra });
  const expected = { rootKey: 'r@0', helperPid: 9, image: 'C:\\node.exe' };
  const wrote = [{ process: 'h@1', class: 'proof', op: 'create', count: 1 }, { process: 'h@1', class: 'proof', op: 'read', count: 1 }];
  assert.deepEqual(checkCalibration(summary(wrote), expected), [], 'the root\'s own unattributed I/O is not checked');
  assert.deepEqual(checkCalibration(summary([{ process: 'h@1', class: 'proof', op: 'create', count: 1 }]), expected), ['helper_read']);
  assert.deepEqual(checkCalibration(summary([]), expected), ['helper_write', 'helper_read'], 'a helper the observer saw do nothing is a calibration gap');
  assert.deepEqual(checkCalibration(summary([], { processes: [root, { ...helper, parent: 'other@1' }] }), expected), ['helper_not_observed']);
  assert.deepEqual(checkCalibration(summary(wrote, { processes: [root, { ...helper, pinned: false }] }), expected), ['helper_unpinned']);
  assert.deepEqual(checkCalibration(summary(wrote, { processes: [{ ...root, pinned: false }, helper] }), expected), ['root_unpinned']);
  assert.deepEqual(checkCalibration(summary([{ process: 'h@1', class: 'proof', op: 'write', count: 1 }, { process: 'h@1', class: 'proof', op: 'read', count: 1 }],
    { health: { ...health, markersMissed: 1 }, processes: [root, { ...helper, exited: null }] }), expected), ['markersMissed', 'helper_exit']);
  assert.deepEqual(observerHealth({}), ['health_missing']);
  assert.deepEqual(observerHealth({ health: { ...health, unattributed: 1 } }), ['unattributed'], 'unattributed owned I/O is fatal');
});

test('worker storage is judged by purpose and worker processes by exact image: an unknown store or read under the right folder, a working-folder write, or a shell or unverified child each fail alone', () => {
  const pinned = (/** @type {string} */ processKey, /** @type {string | null} */ parent, /** @type {string} */ image, extra = {}) => ({ key: processKey,
    pid: Number(processKey.split('@')[0]), parent, created: '2026-11-01T00:00:01.000Z', image, exited: null, exitCode: null, pinned: true, ...extra });
  const worker = 'dude-a2a-w-Ab12Cd';
  const conhost = 'C:\\Windows\\System32\\conhost.exe';
  const images = [CLI, conhost];
  const roles = new Map([['r@0', 'root'], ['b@1', 'b'], ['w@1', 'worker'], ['c@1', 'worker']]);
  const base = () => ({
    processes: [pinned('r@0', null, 'C:\\node.exe'), pinned('b@1', 'r@0', CLI), pinned('w@1', 'b@1', CLI), pinned('c@1', 'w@1', conhost)],
    files: [{ process: 'w@1', class: 'system', op: 'open', count: 3 }, { process: 'w@1', class: 'device', op: 'write', count: 2 }],
    workerDirs: [
      { process: 'b@1', dir: worker, area: 'root', op: 'create', count: 1 }, { process: 'b@1', dir: worker, area: 'work', op: 'create', count: 4 },
      { process: 'w@1', dir: worker, area: 'root', op: 'open', path: '', count: 1 }, { process: 'w@1', dir: worker, area: 'work', op: 'open', path: 'work/notes.md', count: 2 },
      { process: 'w@1', dir: worker, area: 'work', op: 'read', path: 'work/notes.md', count: 1 },
      { process: 'w@1', dir: worker, area: 'temp', op: 'create', count: 1 }, { process: 'w@1', dir: worker, area: 'temp', op: 'write', count: 1 },
      { process: 'w@1', dir: worker, area: 'temp', op: 'read', count: 1 },
    ],
    canaries: [], unclassified: [],
  });
  const dirs = new Map([['w@1', worker], ['c@1', worker]]);
  /** @param {(summary: any) => void} [change] */
  const judge = (change) => {
    const summary = base();
    change?.(summary);
    return accessViolations(summary, roles, { workerDirs: dirs, workerImages: images });
  };
  assert.deepEqual(judge(), { forbidden: [], unclassified: [], canary: [], identity: [] },
    'B creates the folder and fixture; the worker opens its own folder, reads its working folder, uses only its temporary area, and its only child is the console host');
  /** @type {Array<[string, (summary: any) => void, Partial<Record<string, string[]>>]>} */
  const cases = [
    ['an unknown store under the worker\'s own folder', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'config', op: 'create', count: 1 }),
      { unclassified: ['worker:config:create'] }],
    ['a read of its configuration storage, with no recorded workspace', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'config',
      op: 'open', path: 'config/settings.json', count: 2 }), { unclassified: ['worker:config:open'] }],
    ['a read of its home storage', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'home', op: 'read', path: 'home/.copilot/config.json',
      count: 1 }), { unclassified: ['worker:home:read'] }],
    ['a read of a folder that is none of its areas', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'other', op: 'read', path: 'store.db',
      count: 1 }), { unclassified: ['worker:other:read'] }],
    ['a read of its own folder as a file', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'root', op: 'read', path: '', count: 1 }),
      { unclassified: ['worker:root:read'] }],
    ['an open of a path the observer could not read as one plain spelling', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'invalid',
      op: 'open', path: null, count: 1 }), { unclassified: ['worker:invalid:open'] }],
    ['a temp-area row that names a path', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'temp', op: 'read', path: 'temp/x.db', count: 1 }),
      { unclassified: ['worker:temp:read'] }],
    ['a write to its home area', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'home', op: 'write', count: 1 }),
      { unclassified: ['worker:home:write'] }],
    ['a folder that is none of its areas', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'other', op: 'create', count: 1 }),
      { unclassified: ['worker:other:create'] }],
    ['a write to its working folder', (summary) => summary.workerDirs.push({ process: 'w@1', dir: worker, area: 'work', op: 'write', count: 1 }),
      { forbidden: ['worker:work_write:write'] }],
    ['another worker\'s folder', (summary) => summary.workerDirs.push({ process: 'w@1', dir: 'dude-a2a-w-Other1', area: 'temp', op: 'create', count: 1 }),
      { forbidden: ['worker:foreign_storage:create'] }],
    ['a shell child with only allowed reads and device writes', (summary) => {
      summary.processes.push(pinned('s@1', 'w@1', 'C:\\Windows\\System32\\cmd.exe'));
      summary.files.push({ process: 's@1', class: 'system', op: 'read', count: 2 }, { process: 's@1', class: 'device', op: 'write', count: 1 });
    }, { forbidden: ['worker:shell_child:cmd.exe'] }],
    ['an unverified child image in the system folder', (summary) => summary.processes.push(pinned('s@1', 'w@1', 'C:\\Windows\\System32\\whoami.exe')),
      { forbidden: ['worker:unverified_image'] }],
    ['an unpinned child', (summary) => summary.processes.push(pinned('s@1', 'w@1', conhost, { pinned: false })), { identity: ['worker:unpinned_process'] }],
  ];
  for (const [label, change, expected] of cases) {
    const shellRoles = new Map(roles);
    shellRoles.set('s@1', 'worker');
    const summary = base();
    change(summary);
    const found = accessViolations(summary, shellRoles, { workerDirs: new Map([...dirs, ['s@1', worker]]), workerImages: images });
    assert.deepEqual(found, { forbidden: [], unclassified: [], canary: [], identity: [], ...expected }, label);
  }
});

test('worker storage accesses, reads and opens as well as writes, are classified only by the documented purpose of the session workspace that worker recorded: each undocumented, foreign, sibling, staged, settings, or absent-session access fails alone, and the temp area grants no persistence', () => {
  const pinned = (/** @type {string} */ processKey, /** @type {string | null} */ parent, /** @type {string} */ image) => ({ key: processKey,
    pid: Number(processKey.split('@')[0]), parent, created: '2026-11-01T00:00:01.000Z', image, exited: null, exitCode: null, pinned: true });
  const worker = 'dude-a2a-w-Ab12Cd';
  const own = 'config/session-state/0f8fad5b-d9cb-469f-a165-70867728950e';
  const roles = new Map([['r@0', 'root'], ['b@1', 'b'], ['w@1', 'worker']]);
  /** @param {string} area @param {string} op @param {string | null} file */
  const row = (area, op, file) => ({ process: 'w@1', dir: worker, area, op, path: file, count: 1 });
  /** Every documented access of one file: created, opened, read, and written. @param {string} file */
  const used = (file) => ['create', 'open', 'read', 'write'].map((op) => row('config', op, file));
  // Everything the documented per-session purposes need, read as well as written, recorded before anything associated the session with
  // this worker: directory operations on the workspace and the folders above it, every use of its documented files and folders, a
  // directory open of the worker's own folder, and its temp area.
  const documented = [
    row('root', 'open', ''),
    row('config', 'create', 'config'), row('config', 'open', 'config'), row('config', 'create', 'config/session-state'), row('config', 'open', 'config/session-state'),
    row('config', 'create', own), row('config', 'open', own),
    ...used(`${own}/events.jsonl`), ...used(`${own}/workspace.yaml`), ...used(`${own}/plan.md`),
    row('config', 'create', `${own}/checkpoints`), row('config', 'open', `${own}/checkpoints`), ...used(`${own}/checkpoints/001.json`),
    row('config', 'create', `${own}/files`), row('config', 'open', `${own}/files`), ...used(`${own}/files/notes/a.txt`),
    row('temp', 'create', null), row('temp', 'open', null), row('temp', 'read', null), row('temp', 'write', null),
  ];
  /** @param {any[]} rows @param {Map<string, string | null>} [workspaces] Recorded workspaces by worker folder. */
  const judge = (rows, workspaces = new Map([[worker, own]])) => accessViolations({
    processes: [pinned('r@0', null, 'C:\\node.exe'), pinned('b@1', 'r@0', CLI), pinned('w@1', 'b@1', CLI)], files: [], canaries: [], unclassified: [],
    workerDirs: rows,
  }, roles, { workerDirs: new Map([['w@1', worker]]), workerImages: [CLI], workspaces });
  assert.deepEqual(judge(documented), { forbidden: [], unclassified: [], canary: [], identity: [] },
    'the workspace and its folders above it as directories, every use of its documented files and folders, its own folder, and its temp area');
  const home = 'home/.copilot/session-state/s-1';
  assert.deepEqual(judge([row('home', 'create', 'home/.copilot'), row('home', 'open', 'home'), row('home', 'create', home), row('home', 'write', `${home}/events.jsonl`),
    row('home', 'read', `${home}/events.jsonl`)], new Map([[worker, home]])).unclassified, [], 'a workspace the worker recorded in its home storage is classified the same way');
  if (process.platform === 'win32') {
    assert.deepEqual(judge([row('config', 'write', `${own.toUpperCase()}/EVENTS.JSONL`), row('config', 'read', `${own.toUpperCase()}/EVENTS.JSONL`)]).unclassified, [],
      'Windows paths compare without case');
  }
  // The observer names a worker's folder in whatever case the accessing path spelled it. On Windows that is the same folder, so it is the
  // worker's own and its accesses are classified by its recorded workspace; a name that differs by more than case is still another's.
  for (const spelled of [worker.toUpperCase(), worker.toLowerCase()]) {
    const found = judge(documented.map((entry) => ({ ...entry, dir: spelled })));
    assert.deepEqual(found, process.platform === 'win32' ? { forbidden: [], unclassified: [], canary: [], identity: [] }
      : { forbidden: documented.map((entry) => `worker:foreign_storage:${entry.op}`), unclassified: [], canary: [], identity: [] },
    `${spelled}: ${process.platform === 'win32' ? 'the same folder, compared without case' : 'another folder where case counts'}`);
  }
  assert.deepEqual(judge([{ ...row('config', 'read', `${own}/events.jsonl`), dir: `${worker.toUpperCase()}X` }]).forbidden, ['worker:foreign_storage:read'],
    'a longer name is never the worker\'s own');
  // A worker process this run recorded no folder for owns none: each access it makes below a worker folder is foreign, even one that
  // would be a documented use of some recorded workspace, and none is classified by purpose.
  const unrecorded = accessViolations({ processes: [pinned('r@0', null, 'C:\\node.exe'), pinned('b@1', 'r@0', CLI), pinned('w@1', 'b@1', CLI)], files: [],
    canaries: [], unclassified: [], workerDirs: [row('config', 'read', `${own}/events.jsonl`), row('root', 'open', '')] }, roles,
  { workerDirs: new Map(), workerImages: [CLI], workspaces: new Map([[worker, own]]) });
  assert.deepEqual(unrecorded, { forbidden: ['worker:foreign_storage:read', 'worker:foreign_storage:open'], unclassified: [], canary: [], identity: [] });
  if (process.platform === 'win32') {
    assert.deepEqual(judge([{ ...row('config', 'create', `${own}/session.db`), dir: worker.toUpperCase() }]).unclassified, ['worker:config:create'],
      'its own folder in another case is still judged by purpose');
  }

  /** @type {Array<[string, any, Partial<Record<string, string[]>>]>} */
  const cases = [
    // Reads and opens, judged exactly as writes are.
    ['an open of another session\'s event log', row('config', 'open', 'config/session-state/other-session/events.jsonl'), { unclassified: ['worker:config:open'] }],
    ['a read of another session\'s event log', row('config', 'read', 'config/session-state/other-session/events.jsonl'), { unclassified: ['worker:config:read'] }],
    ['an open of an undocumented store in configuration storage', row('config', 'open', 'config/session.db'), { unclassified: ['worker:config:open'] }],
    ['a read of an undocumented store in configuration storage', row('config', 'read', 'config/session.db'), { unclassified: ['worker:config:read'] }],
    ['an open of the runtime\'s own settings', row('config', 'open', 'config/settings.json'), { unclassified: ['worker:config:open'] }],
    ['a read of the runtime\'s own settings', row('config', 'read', 'config/settings.json'), { unclassified: ['worker:config:read'] }],
    ['a read of an undocumented sidecar in the workspace', row('config', 'read', `${own}/session.db`), { unclassified: ['worker:config:read'] }],
    ['an open of a sibling beside the workspace', row('config', 'open', `${own}.lock`), { unclassified: ['worker:config:open'] }],
    ['a read of a folder above the workspace, which allows directory operations only', row('config', 'read', 'config/session-state'),
      { unclassified: ['worker:config:read'] }],
    ['an open of its home folder while its workspace is in configuration storage', row('home', 'open', 'home'), { unclassified: ['worker:home:open'] }],
    ['a read in a configuration row whose path lies in another area', row('config', 'read', `home/${own}/events.jsonl`), { unclassified: ['worker:config:read'] }],
    // The row's own area must prefix its path: a home row naming the configuration workspace's own event log is no access of it.
    ['a home row whose path is the configuration workspace\'s event log', row('home', 'read', `${own}/events.jsonl`), { unclassified: ['worker:home:read'] }],
    // A documented file is a file: nothing lies below it.
    ['a read below a documented file, as if it were a folder', row('config', 'read', `${own}/events.jsonl/sidecar`), { unclassified: ['worker:config:read'] }],
    ['a write below a documented file', row('config', 'write', `${own}/workspace.yaml/x`), { unclassified: ['worker:config:write'] }],
    // A documented folder's contents are named plainly: no climb out of it, no dot, and no empty segment.
    ['a climb out through a documented folder', row('config', 'read', `${own}/files/../../settings.json`), { unclassified: ['worker:config:read'] }],
    ['a dot segment in a documented folder', row('config', 'read', `${own}/files/./a.txt`), { unclassified: ['worker:config:read'] }],
    ['an empty segment in a documented folder', row('config', 'read', `${own}/checkpoints//001.json`), { unclassified: ['worker:config:read'] }],
    ['a read of its own folder as a file', row('root', 'read', ''), { unclassified: ['worker:root:read'] }],
    ['a temp-area row that names a path', row('temp', 'read', 'temp/x.db'), { unclassified: ['worker:temp:read'] }],
    ['an access the observer could not read as one plain spelling', row('invalid', 'open', null), { unclassified: ['worker:invalid:open'] }],
    ['a read with no path', row('config', 'read', null), { unclassified: ['worker:config:read'] }],
    // Writes.
    ['another session\'s workspace', row('config', 'create', 'config/session-state/other-session/events.jsonl'), { unclassified: ['worker:config:create'] }],
    ['a sibling file beside the workspace', row('config', 'create', `${own}.lock`), { unclassified: ['worker:config:create'] }],
    ['a sibling subtree in configuration storage', row('config', 'create', 'config/logs/session.log'), { unclassified: ['worker:config:create'] }],
    ['an undocumented sidecar in the workspace', row('config', 'create', `${own}/session.db`), { unclassified: ['worker:config:create'] }],
    ['an atomic staging name for the event log', row('config', 'create', `${own}/events.jsonl.tmp`), { unclassified: ['worker:config:create'] }],
    ['a staged workspace document', row('config', 'write', `${own}/workspace.yaml.1234.tmp`), { unclassified: ['worker:config:write'] }],
    ['a nested event log', row('config', 'create', `${own}/sub/events.jsonl`), { unclassified: ['worker:config:create'] }],
    ['a rename of the event log', row('config', 'rename', `${own}/events.jsonl`), { unclassified: ['worker:config:rename'] }],
    ['a delete of a checkpoint', row('config', 'delete', `${own}/checkpoints/001.json`), { unclassified: ['worker:config:delete'] }],
    ['a write to a folder above the workspace', row('config', 'write', 'config/session-state'), { unclassified: ['worker:config:write'] }],
    ['an unknown store in home storage', row('home', 'create', 'home/.copilot/store.db'), { unclassified: ['worker:home:create'] }],
    ['a write with no path', row('config', 'create', null), { unclassified: ['worker:config:create'] }],
    ['a file at the root of its folder', row('other', 'create', 'store.db'), { unclassified: ['worker:other:create'] }],
    ['the documented file in another worker\'s folder', { ...row('config', 'write', `${own}/events.jsonl`), dir: 'dude-a2a-w-Other1' },
      { forbidden: ['worker:foreign_storage:write'] }],
    ['a write to its working folder', row('work', 'write', 'work/notes.md'), { forbidden: ['worker:work_write:write'] }],
  ];
  for (const [label, extra, expected] of cases) {
    assert.deepEqual(judge([...documented, extra]), { forbidden: [], unclassified: [], canary: [], identity: [], ...expected }, label);
  }
  // Observed absence associates no workspace, and neither does a worker no startup release validated: every configuration access the
  // documented purposes would need, a read as much as a write, is then unclassified, and the temp area and the worker's own folder,
  // still allowed, stand in for none of it.
  const needed = documented.filter((entry) => entry.area === 'config').map((entry) => `worker:config:${entry.op}`);
  assert.ok(needed.includes('worker:config:read') && needed.includes('worker:config:open'));
  assert.deepEqual(judge(documented, new Map([[worker, null]])), { forbidden: [], unclassified: needed, canary: [], identity: [] },
    'observed absence grants no persistence, and no configuration read either');
  assert.deepEqual(judge(documented, new Map()), { forbidden: [], unclassified: needed, canary: [], identity: [] }, 'nor does a worker not yet validated');
  // With absence or no validated workspace, each of these reads fails alone too.
  for (const file of ['config/session-state/other-session/events.jsonl', 'config/session.db', 'config/settings.json']) {
    for (const op of ['open', 'read']) {
      for (const [label, workspaces] of /** @type {Array<[string, Map<string, string | null>]>} */ ([['absence', new Map([[worker, null]])], ['not validated', new Map()]])) {
        assert.deepEqual(judge([row('root', 'open', ''), row('temp', 'write', null), row('config', op, file)], workspaces),
          { forbidden: [], unclassified: [`worker:config:${op}`], canary: [], identity: [] }, `${label}: ${op} ${file}`);
      }
    }
  }
});

test('the real script refuses every invalid input before it compiles or observes anything', { skip: SKIP, timeout: 120_000 }, () => {
  const work = tempDir('dude-noi-');
  const temp = path.join(work, 't');
  fs.mkdirSync(temp);
  const { input } = syntheticInput();
  const valid = { ...input, output: path.join(work, 'summary.json') };
  /** @param {unknown} value @param {string} [name] */
  const write = (value, name = `${randomUUID()}.json`) => {
    const target = path.join(work, name);
    fs.writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value));
    return target;
  };
  fs.writeFileSync(path.join(work, 'exists.json'), '{}');
  // A run ID uppercased is invalid only if it has letters to uppercase: a generated UUID of digits alone would pass the observer's
  // lowercase pattern unchanged and reach compilation. This fixed one has lowercase letters, and it must fail the observer's own pattern
  // before the real script is launched with it.
  const observerRunId = new RegExp(/\$config\.runId -cmatch '([^']+)'/.exec(SOURCE)?.[1] ?? '(?!)');
  const lettered = 'abcdef01-2345-4c6d-8e9f-0123456789ab';
  assert.match(lettered, observerRunId, 'the fixed run ID is valid as written');
  const uppercased = lettered.toUpperCase();
  assert.notEqual(uppercased, lettered);
  assert.doesNotMatch(uppercased, observerRunId, 'and invalid once uppercased');
  /** @type {Array<[string, string]>} */
  const cases = [
    ['an extra field', write({ ...valid, provider: 'Microsoft-Windows-Kernel-Network' })],
    ['a missing field', write(Object.fromEntries(Object.entries(valid).filter(([field]) => field !== 'canaries')))],
    ['another version', write({ ...valid, version: 2 })],
    ['an uppercase run ID', write({ ...valid, runId: uppercased })],
    ['reordered classes', write({ ...valid, classes: [valid.classes[1], valid.classes[0], ...valid.classes.slice(2)] })],
    ['a relative class root', write({ ...valid, classes: valid.classes.map((entry, index) => (index === 0 ? { ...entry, roots: ['Windows'] } : entry)) })],
    ['another process limit', write({ ...valid, limits: { processes: 4_096, summaryBytes: 65_536 } })],
    ['a canary outside the fixed shape', write({ ...valid, canaries: ['work/../outside.txt'] })],
    ['an existing output', write({ ...valid, output: path.join(work, 'exists.json') })],
    ['not JSON', write('{"version":1,')],
    ['an oversized input', write(`${JSON.stringify(valid)}${' '.repeat(16_385)}`)],
    ['a relative input path', 'observer-input.json'],
  ];
  for (const [label, target] of cases) {
    const result = spawnSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT, '-InputFile', target], {
      cwd: work, encoding: 'utf8', windowsHide: true, timeout: 60_000,
      env: { SystemRoot: SYSTEM_ROOT, windir: SYSTEM_ROOT, TEMP: temp, TMP: temp, PATH: path.join(SYSTEM_ROOT, 'System32') },
    });
    assert.deepEqual([result.status, result.stdout.trim()], [3, '{"event":"refused","reason":"observer_input_invalid"}'], `${label}: ${result.stderr}`);
    assert.equal(fs.existsSync(valid.output), false, label);
  }
  assert.deepEqual(fs.readdirSync(temp), [], 'nothing was compiled');
});

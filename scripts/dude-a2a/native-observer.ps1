#Requires -Version 5.1
<#
.SYNOPSIS
  Feature 089's fixed Windows observer for the native qualification run.

.DESCRIPTION
  Its only caller is scripts/dude-a2a/native-collaboration.mjs, which starts it
  before any native runtime with one closed input file. It compiles the small
  C# reader below and opens one real-time ETW session, named for the run, with
  only the Microsoft-Windows-Kernel-Process (process and thread start and stop)
  and Microsoft-Windows-Kernel-File (create, read, write, delete, rename, close)
  providers. It accepts no other provider, filter, script, command, or process
  target: the only root is the process that started it, checked against this
  process's own parent, and only that root's descendants are tracked, by
  creation lineage, so orphaned or reparented processes stay tracked.

  Each tracked process is pinned with a public handle (PROCESS_QUERY_LIMITED_
  INFORMATION and SYNCHRONIZE): GetProcessTimes must match the ETW creation
  time and QueryFullProcessImageName must give its canonical image, and a wait
  on the handle gives its exit. A process, the root included, that cannot be
  pinned that way is still tracked for lineage but is an identity gap, never
  proof. Handles are kept until the final drain.

  Identities are historical: (PID, creation time) with a lifetime interval,
  and each tracked thread with its own start and stop interval. Every event is
  resolved at its own timestamp, a child's parent at the child's creation time.
  A handle's exit closes an interval; it never erases the identity, so ETW
  events buffered from before that exit still count. A file event is resolved
  by its issuing thread first, then by its header's thread and process, and
  only then excluded, so I/O completed by System for a tracked thread is kept.
  Relevant I/O whose file is unknown is counted as unattributed, never dropped
  (the root's own pre-observation handles are counted apart; nothing about the
  root is checked). Activity is kept only as counts per process, approved path
  class, and operation; below a worker's own storage folder, by its approved
  area (work, config, home, temp, the folder itself, or other) and, outside
  its temp area, by the path relative to that folder, from the start of
  observation. A path below the worker parent that is not one plain spelling
  (a "." or ".." segment, an empty segment or "/", a trailing dot or space, a
  stream or drive colon, or an 8.3 short-name form) is kept only as the area
  "invalid", with no name and no area's allowance, before any folder or area
  is assigned. Those rows are charged to the summary budget as they are first
  seen; one that would exceed it, or a relative path over 1,024 characters, is
  a sticky overflow, never a dropped row. A path outside every class is
  counted without its name. Command lines, environments, file contents,
  credentials, registry values, network traffic, and unfiltered machine events
  are never read or kept.

  Missing privileges (administrator or Performance Log Users), an existing
  session of the same name, or a missing API refuses with a closed reason;
  nothing elevates, installs, or registers a service. The observer never kills,
  suspends, injects into, or deletes anything; its only writes are its output
  file and its replies. Event loss, a decode failure, an identity gap, a
  missed synchronization marker, more than the process limit, or a summary
  over its byte limit is reported, never truncated into a clean result.

  Protocol: one JSON line per reply on stdout. After the session runs it
  writes {"event":"ready"}. Each stdin line is exactly {"op":"snapshot","marker":n}
  or {"op":"stop","marker":n}; the caller first creates <proof>\m<n>.txt, and the
  reply follows once that create was observed, so the reply covers every earlier
  event of the caller. A stop then stops the named session while its consumer
  still runs, waits a bounded time for every buffered event to be delivered,
  closes the consumer only after that, and builds the final summary last, with
  the final loss counts and whether it drained. EOF on stdin stops the session.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$InputFile
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

$ClassNames = @('system', 'runtime', 'payload', 'node', 'sdk', 'repository', 'real_home', 'owner', 'fixture', 'proof',
  'a_side', 'a_workspace', 'a_home', 'a_config', 'a_temp', 'b_side', 'b_workspace', 'b_home', 'b_config', 'b_temp',
  'k_side', 'k_workspace', 'k_home', 'k_config', 'k_temp')
$InputKeys = @('canaries', 'classes', 'controlRoots', 'limits', 'output', 'rootPid', 'runId', 'version', 'workerParent')

function Write-Reply([string]$Json) {
  [Console]::Out.WriteLine($Json)
  [Console]::Out.Flush()
}

function Stop-Refused([string]$Reason) {
  Write-Reply ('{"event":"refused","reason":"' + $Reason + '"}')
  exit 3
}

function Test-AbsolutePath([object]$Value) {
  if ($Value -isnot [string] -or $Value.Length -eq 0 -or $Value.Length -gt 1024) { return $false }
  if ($Value -match '[\x00-\x1f]' -or $Value.Contains('/')) { return $false }
  if (-not [System.IO.Path]::IsPathRooted($Value) -or $Value -notmatch '^[A-Za-z]:\\') { return $false }
  return [System.IO.Path]::GetFullPath($Value) -eq $Value.TrimEnd('\')
}

function Get-Names([object]$Object) {
  return @($Object.PSObject.Properties | ForEach-Object { $_.Name } | Sort-Object)
}

if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { Stop-Refused 'observer_unsupported' }

# The closed input: anything else refuses before anything is compiled or started.
try {
  if (-not (Test-AbsolutePath $InputFile)) { Stop-Refused 'observer_input_invalid' }
  $item = Get-Item -LiteralPath $InputFile -Force
  if ($item.PSIsContainer -or ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -or $item.Length -gt 16384) {
    Stop-Refused 'observer_input_invalid'
  }
  $config = [System.IO.File]::ReadAllText($InputFile, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
} catch {
  Stop-Refused 'observer_input_invalid'
}
$valid = ((Get-Names $config) -join ',') -eq (($InputKeys | Sort-Object) -join ',')
$valid = $valid -and $config.version -eq 1 -and $config.runId -is [string] -and $config.runId -cmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$valid = $valid -and ($config.rootPid -is [int] -or $config.rootPid -is [long]) -and $config.rootPid -gt 0
$valid = $valid -and (Test-AbsolutePath $config.output) -and (Test-AbsolutePath $config.workerParent)
$valid = $valid -and $config.limits -ne $null -and ((Get-Names $config.limits) -join ',') -eq 'processes,summaryBytes'
$valid = $valid -and $config.limits.processes -eq 128 -and $config.limits.summaryBytes -eq 65536
$valid = $valid -and $config.controlRoots -ne $null -and ((Get-Names $config.controlRoots) -join ',') -eq 'config,home,work'
if ($valid) {
  foreach ($name in @('work', 'config', 'home')) { $valid = $valid -and (Test-AbsolutePath $config.controlRoots.$name) }
  $canaries = @($config.canaries)
  $valid = $valid -and $canaries.Count -ge 1 -and $canaries.Count -le 32
  # Each segment as T009's fixture paths: safe characters, no "." or "..", and no trailing dot Windows would strip.
  foreach ($canary in $canaries) { $valid = $valid -and $canary -is [string] -and $canary -cmatch '^(work|config|home)(/[A-Za-z0-9._-]{0,63}[A-Za-z0-9_-]){1,8}$' }
  $classes = @($config.classes)
  $valid = $valid -and $classes.Count -eq $ClassNames.Count
  for ($index = 0; $valid -and $index -lt $classes.Count; $index++) {
    $entry = $classes[$index]
    $valid = $valid -and ((Get-Names $entry) -join ',') -eq 'name,roots' -and $entry.name -ceq $ClassNames[$index]
    $roots = @($entry.roots)
    $valid = $valid -and $roots.Count -ge 1 -and $roots.Count -le 8
    foreach ($root in $roots) { $valid = $valid -and (Test-AbsolutePath $root) }
  }
}
if (-not $valid) { Stop-Refused 'observer_input_invalid' }
if (Test-Path -LiteralPath $config.output) { Stop-Refused 'observer_input_invalid' }

$Source = @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace DudeA2aObserver
{
    public sealed class PathClass
    {
        public readonly string Name;
        public readonly string[] Roots;
        public PathClass(string name, string[] roots) { Name = name; Roots = roots; }
    }

    // Named properties of one event, decoded only when asked. The observer decodes ETW records; tests supply values.
    public interface IEventFields
    {
        bool UInt(string property, out ulong value);
        string Text(string property);
    }

    // One attempt to pin a process: its handle, whether it opened, whether its times were read, its creation time, and its canonical image.
    public sealed class Pin
    {
        public IntPtr Handle; public bool Opened; public bool Timed; public long Created; public string Image;
    }

    // The public process APIs behind one seam, so every decision in Tracker is the same in production and in tests.
    public interface IProcessPins
    {
        Pin Open(uint pid);
        // Keep the handle until the final drain and report its exit through Tracker.OnHandleExit.
        void Watch(Pin pin, uint pid, long created);
        void Release(Pin pin);
    }

    // NT device paths and the drive letters they map to, read once at start.
    public sealed class PathMap
    {
        private readonly Dictionary<string, string> devices = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        public void Add(string device, string drive) { devices[device] = drive; }

        public string ToWin32(string ntPath)
        {
            if (ntPath == null) return null;
            if (ntPath.StartsWith("\\??\\", StringComparison.Ordinal)) return ntPath.Substring(4);
            foreach (KeyValuePair<string, string> device in devices)
            {
                if (ntPath.StartsWith(device.Key + "\\", StringComparison.OrdinalIgnoreCase)) return device.Value + ntPath.Substring(device.Key.Length);
            }
            return ntPath;
        }
    }

    // What a final stop did: the session stop's status, whether the consumer returned in time, its status, and whether that drained.
    public sealed class StopResult
    {
        public uint StopStatus; public bool Joined; public uint ConsumerStatus; public bool Drained;
    }

    // The order of a final stop: stop the named session while its consumer still runs, so every buffered event is
    // delivered and the final loss counts are read; wait a bounded time for the consumer to return; close it only
    // after that, or to unblock it; and call the result drained only when all of that succeeded.
    public static class TraceStop
    {
        public static StopResult Run(Func<uint> stopSession, Func<bool> joinConsumer, Func<uint> consumerStatus, Action closeConsumer)
        {
            StopResult result = new StopResult();
            result.StopStatus = stopSession();
            result.Joined = joinConsumer();
            result.ConsumerStatus = result.Joined ? consumerStatus() : uint.MaxValue;
            closeConsumer();
            result.Drained = result.StopStatus == 0 && result.Joined && result.ConsumerStatus == 0;
            return result;
        }
    }

    // Historical identities, attribution, path classification, and the bounded summary. Every ETW event and every
    // handle exit enters through OnProcess, OnFile, or OnHandleExit, which the observer and the tests call alike.
    // The only operating-system access is through IProcessPins.
    public sealed class Tracker
    {
        private sealed class Proc
        {
            public string Key; public uint Pid; public string ParentKey; public long Created; public string Image;
            public long Exited; public int ExitCode; public bool HasExit; public bool Pinned;
        }

        private sealed class Span
        {
            public Proc Owner; public long Start; public long Stop; public bool HasStop;
        }

        private static readonly string[] ControlNames = { "WORK", "CONFIG", "HOME" };
        // The approved folders of a worker's own storage, as the product creates them.
        private static readonly string[] WorkerAreas = { "WORK", "CONFIG", "HOME", "TEMP" };
        // Non-storage kernel devices: pipes (stdio included), mailslots, the console, sockets and network interfaces, crypto, and null.
        // Storage devices without a drive letter and network redirectors (\Device\Mup) are not here and stay unclassified.
        private static readonly string[] Devices = { "\\DEVICE\\NAMEDPIPE", "\\DEVICE\\MAILSLOT", "\\DEVICE\\CONDRV", "\\DEVICE\\AFD", "\\DEVICE\\NULL",
            "\\DEVICE\\KSECDD", "\\DEVICE\\CNG", "\\DEVICE\\NSI", "\\DEVICE\\DEVICEAPI", "\\DEVICE\\TCP", "\\DEVICE\\TCP6", "\\DEVICE\\UDP",
            "\\DEVICE\\UDP6", "\\DEVICE\\RAWIP", "\\DEVICE\\RAWIP6", "\\DEVICE\\IP", "\\DEVICE\\IP6" };
        public const int MaxFileObjects = 65536;
        public const int MaxThreadSpans = 65536;
        // The longest path relative to a worker's own folder that a summary row keeps.
        public const int MaxWorkerPath = 1024;
        // A worker storage row's fields, in summary order; its path is null in the temp area, whose names are not kept, and for a
        // path that is not one plain spelling (area "invalid"), whose folder is "" unless its first segment is a plain worker folder.
        private static readonly string[] WorkerDirFields = { "process", "dir", "area", "op", "path" };
        // Event stamps and process times come from different kernel clocks: an event this close (100 ms) to a lifetime's edge still belongs to it.
        public const long Slack = 1000000;
        private readonly object gate = new object();
        private readonly List<KeyValuePair<string, string>> roots = new List<KeyValuePair<string, string>>();
        private readonly Dictionary<string, string> canaries = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly string workerParent;
        private readonly string[] controlRoots;
        private readonly int maxProcesses;
        private readonly int summaryBytes;
        // What the worker storage rows kept so far can cost in a summary, each with its count at its widest.
        private long workerDirBytes;
        private readonly string markerPrefix;
        private readonly PathMap paths;
        private readonly Dictionary<uint, List<Proc>> byPid = new Dictionary<uint, List<Proc>>();
        private readonly List<Proc> all = new List<Proc>();
        private readonly Dictionary<uint, List<Span>> threads = new Dictionary<uint, List<Span>>();
        private int spanCount;
        private readonly Dictionary<ulong, string> fileObjects = new Dictionary<ulong, string>();
        private readonly SortedDictionary<string, long> files = new SortedDictionary<string, long>(StringComparer.Ordinal);
        private readonly SortedDictionary<string, long> canaryHits = new SortedDictionary<string, long>(StringComparer.Ordinal);
        private readonly SortedDictionary<string, long> workerDirs = new SortedDictionary<string, long>(StringComparer.Ordinal);
        private readonly SortedDictionary<string, long> unclassified = new SortedDictionary<string, long>(StringComparer.Ordinal);
        private Proc root;
        private long highestMarker;
        private long decodeFailures, identityGaps, unattributed, rootUnattributed, markersMissed;
        private bool overflow;
        private string final;

        public Tracker(PathClass[] classes, string[] canaryPaths, string workerParent, string[] controlRoots, int maxProcesses, int summaryBytes,
            string proofRoot, PathMap paths)
        {
            foreach (PathClass entry in classes)
            {
                foreach (string path in entry.Roots) roots.Add(new KeyValuePair<string, string>(Normalize(path), entry.Name));
            }
            roots.Sort((left, right) => right.Key.Length.CompareTo(left.Key.Length));
            foreach (string canary in canaryPaths) canaries[canary.Replace('/', '\\').ToUpperInvariant()] = canary;
            this.workerParent = Normalize(workerParent) + "\\";
            this.controlRoots = new string[controlRoots.Length];
            for (int index = 0; index < controlRoots.Length; index++) this.controlRoots[index] = Normalize(controlRoots[index]) + "\\";
            this.maxProcesses = maxProcesses;
            this.summaryBytes = summaryBytes;
            markerPrefix = Normalize(proofRoot) + "\\M";
            this.paths = paths;
        }

        public static string Normalize(string path) { return path.TrimEnd('\\').ToUpperInvariant(); }

        public static string KeyOf(uint pid, long created)
        {
            return pid.ToString(CultureInfo.InvariantCulture) + "@" + created.ToString(CultureInfo.InvariantCulture);
        }

        public long HighestMarker { get { lock (gate) { return highestMarker; } } }
        public void DecodeFailure() { lock (gate) { decodeFailures++; } }
        public void MissedMarker() { lock (gate) { markersMissed++; } }

        // The root, pinned by the observer's own handle, creation time, and canonical image before anything starts.
        public void SetRoot(uint pid, long created, string image)
        {
            lock (gate)
            {
                Proc proc = new Proc();
                proc.Key = KeyOf(pid, created); proc.Pid = pid; proc.Created = created; proc.Image = image; proc.Pinned = true;
                root = proc;
                Add(proc);
            }
        }

        private void Add(Proc proc)
        {
            List<Proc> list;
            if (!byPid.TryGetValue(proc.Pid, out list)) { list = new List<Proc>(); byPid[proc.Pid] = list; }
            list.Add(proc);
            all.Add(proc);
        }

        private static bool Covers(long start, long stop, bool hasStop, long ts, long slack)
        {
            return start - slack <= ts && (!hasStop || ts <= stop + slack);
        }

        // The one tracked identity with this pid alive at `ts`, or null. Two would be an ambiguity: an identity gap.
        private Proc At(uint pid, long ts, long slack)
        {
            List<Proc> list;
            if (!byPid.TryGetValue(pid, out list)) return null;
            Proc found = null;
            foreach (Proc proc in list)
            {
                if (!Covers(proc.Created, proc.Exited, proc.HasExit, ts, slack)) continue;
                if (found != null) { identityGaps++; return null; }
                found = proc;
            }
            return found;
        }

        // Whether one thread interval covers `ts`. Both its ends are ETW stamps, like `ts`; an open interval ends no later
        // than its process, whose exit time comes from the other clock.
        private static bool SpanCovers(Span span, long ts)
        {
            if (span.Start > ts) return false;
            if (span.HasStop) return ts <= span.Stop;
            return !span.Owner.HasExit || ts <= span.Owner.Exited + Slack;
        }

        // The tracked identity one thread belonged to at `ts`, or null. Two would be an ambiguity: an identity gap.
        private Proc ThreadAt(uint tid, long ts)
        {
            List<Span> list;
            if (tid == 0 || !threads.TryGetValue(tid, out list)) return null;
            Proc found = null;
            foreach (Span span in list)
            {
                if (!SpanCovers(span, ts)) continue;
                if (found != null) { identityGaps++; return null; }
                found = span.Owner;
            }
            return found;
        }

        private void Exit(uint pid, long created, long exited, int exitCode)
        {
            List<Proc> list;
            if (!byPid.TryGetValue(pid, out list)) return;
            foreach (Proc proc in list)
            {
                if (proc.Created != created) continue;
                if (!proc.HasExit) { proc.HasExit = true; proc.Exited = exited; proc.ExitCode = exitCode; }
                return;
            }
        }

        // Kernel-Process events: 1 process start, 2 process stop, 3 thread start, 4 thread stop.
        public void OnProcess(int id, uint headerPid, uint headerTid, long ts, IEventFields fields, IProcessPins pins)
        {
            ulong pid, parent, created, exited, code, thread;
            lock (gate)
            {
                if (id == 1)
                {
                    if (!fields.UInt("ProcessID", out pid) || !fields.UInt("ParentProcessID", out parent) || !fields.UInt("CreateTime", out created))
                    {
                        decodeFailures++;
                        return;
                    }
                    // The parent alive at the child's own creation time, or else the tracked process that logged the start,
                    // never only who is alive now: a parent whose exit was already seen still owns its earlier children.
                    Proc owner = At((uint)parent, (long)created, 0) ?? At(headerPid, ts, Slack);
                    if (owner == null) return;
                    if (all.Count - 1 >= maxProcesses) { overflow = true; return; }
                    if (At((uint)pid, (long)created, 0) != null) identityGaps++;
                    Pin pin = pins.Open((uint)pid);
                    // Proof needs the handle, a matching creation time, and the canonical image; anything less is tracked for lineage as a gap.
                    bool pinned = pin != null && pin.Opened && pin.Timed && pin.Created == (long)created && pin.Image != null;
                    if (!pinned) identityGaps++;
                    Proc proc = new Proc();
                    proc.Key = KeyOf((uint)pid, (long)created); proc.Pid = (uint)pid; proc.ParentKey = owner.Key; proc.Created = (long)created;
                    proc.Image = pinned ? pin.Image : paths.ToWin32(fields.Text("ImageName")); proc.Pinned = pinned;
                    Add(proc);
                    if (pinned) pins.Watch(pin, (uint)pid, (long)created);
                    else pins.Release(pin);
                }
                else if (id == 2)
                {
                    if (!fields.UInt("ProcessID", out pid)) { decodeFailures++; return; }
                    if (!byPid.ContainsKey((uint)pid)) return;
                    if (!fields.UInt("CreateTime", out created) || !fields.UInt("ExitTime", out exited) || !fields.UInt("ExitCode", out code))
                    {
                        decodeFailures++;
                        return;
                    }
                    Exit((uint)pid, (long)created, (long)exited, unchecked((int)(uint)code));
                }
                else if (id == 3 || id == 4)
                {
                    // Thread events are logged in the creating or exiting thread's process; the thread's own process is a property.
                    if (!fields.UInt("ProcessID", out pid) || !fields.UInt("ThreadID", out thread))
                    {
                        if (At(headerPid, ts, Slack) != null) decodeFailures++;
                        return;
                    }
                    if (id == 3) ThreadStart((uint)pid, (uint)thread, ts);
                    else ThreadStop((uint)pid, (uint)thread, ts);
                }
            }
        }

        private void ThreadStart(uint pid, uint tid, long ts)
        {
            Proc owner = At(pid, ts, Slack);
            if (owner == null) return;
            if (spanCount >= MaxThreadSpans) { overflow = true; return; }
            List<Span> list;
            if (!threads.TryGetValue(tid, out list)) { list = new List<Span>(); threads[tid] = list; }
            // A thread ID starting again while an earlier thread with it may still run is ambiguous.
            foreach (Span open in list) if (SpanCovers(open, ts)) identityGaps++;
            Span span = new Span();
            span.Owner = owner; span.Start = ts;
            list.Add(span);
            spanCount++;
        }

        private void ThreadStop(uint pid, uint tid, long ts)
        {
            List<Span> list;
            if (!threads.TryGetValue(tid, out list)) return;
            foreach (Span span in list)
            {
                if (span.HasStop || span.Owner.Pid != pid || span.Start > ts) continue;
                span.HasStop = true; span.Stop = ts;
                return;
            }
        }

        // A handle wait fired. The exit closes that identity's interval and erases nothing: ETW events stamped before it,
        // still buffered, are attributed to it when they arrive. An exit whose times cannot be read is an identity gap.
        public void OnHandleExit(uint pid, long created, bool timed, long exited, int exitCode)
        {
            lock (gate)
            {
                if (!timed) { identityGaps++; return; }
                Exit(pid, created, exited, exitCode);
            }
        }

        // Kernel-File events. The issuing thread is read before anything is excluded: an event whose header names System
        // or another process still belongs to the tracked identity whose thread issued it. Only an event that neither its
        // issuer nor its header ties to a tracked identity at its own time is skipped, and only then is anything else decoded.
        public void OnFile(int id, uint headerPid, uint headerTid, long ts, IEventFields fields)
        {
            if (id != 12 && id != 30 && id != 14 && id != 15 && id != 16 && id != 26 && id != 27) return;
            ulong value, fileObject;
            lock (gate)
            {
                if (id == 14)
                {
                    if (fields.UInt("FileObject", out fileObject)) fileObjects.Remove(fileObject);
                    return;
                }
                uint issuing = fields.UInt("IssuingThreadId", out value) ? (uint)value : 0;
                Proc owner = ThreadAt(issuing, ts);
                if (owner == null) owner = ThreadAt(headerTid, ts);
                if (owner == null) owner = At(headerPid, ts, Slack);
                if (owner == null) return;
                if (id == 12 || id == 30)
                {
                    if (!fields.UInt("FileObject", out fileObject)) { decodeFailures++; return; }
                    Create(owner, fileObject, paths.ToWin32(fields.Text("FileName")), id == 30);
                }
                else if (id == 15 || id == 16)
                {
                    if (!fields.UInt("FileObject", out fileObject)) { decodeFailures++; return; }
                    string path;
                    if (!fileObjects.TryGetValue(fileObject, out path))
                    {
                        // Relevant I/O on a file this run never saw opened is counted, never dropped. Nothing about the
                        // root is checked, so its own handles opened before observation are counted apart.
                        if (owner == root) rootUnattributed++; else unattributed++;
                        return;
                    }
                    Record(owner, path, id == 15 ? "read" : "write");
                }
                else
                {
                    string path = paths.ToWin32(fields.Text("FilePath"));
                    if (path == null) { decodeFailures++; return; }
                    Record(owner, path, id == 26 ? "delete" : "rename");
                }
            }
        }

        private void Create(Proc owner, ulong fileObject, string path, bool isNew)
        {
            if (path == null) { decodeFailures++; return; }
            string upper = path.ToUpperInvariant();
            if (owner == root && upper.StartsWith(markerPrefix, StringComparison.Ordinal) && upper.EndsWith(".TXT", StringComparison.Ordinal))
            {
                long marker;
                string digits = upper.Substring(markerPrefix.Length, upper.Length - markerPrefix.Length - 4);
                if (long.TryParse(digits, NumberStyles.None, CultureInfo.InvariantCulture, out marker) && marker > highestMarker) highestMarker = marker;
            }
            if (fileObject != 0)
            {
                if (fileObjects.Count >= MaxFileObjects && !fileObjects.ContainsKey(fileObject)) overflow = true;
                else fileObjects[fileObject] = path;
            }
            Record(owner, path, isNew ? "create" : "open");
        }

        // The class of one Win32 path, or "worker", "device", or null. Below the worker parent the path is first checked for one
        // plain spelling (Plain); one that is not plain is "worker" with the area "invalid" and no relative path, its folder named
        // only when its first segment is itself a plain worker folder name ("" otherwise): no tail is kept, and no area's rule,
        // the temp area's included, applies to it. A plain path in a worker's own folder is reported with its approved area
        // (work, config, home, temp, the folder itself as root, or anything else as other), a canary there beside it, and, outside
        // the temp area, the path relative to that folder, with "/" separators ("" for the folder itself).
        public string Classify(string path, out string canary, out string canaryScope, out string workerDir, out string workerArea, out string workerPath)
        {
            canary = null; canaryScope = null; workerDir = null; workerArea = null; workerPath = null;
            if (path == null) return null;
            string upper = path.ToUpperInvariant();
            foreach (string device in Devices)
            {
                if (upper == device || upper.StartsWith(device + "\\", StringComparison.Ordinal)) return "device";
            }
            if (upper.StartsWith(workerParent, StringComparison.Ordinal))
            {
                string rest = path.Substring(workerParent.Length);
                int slash = rest.IndexOf('\\');
                string dir = slash < 0 ? rest : rest.Substring(0, slash);
                bool named = dir.StartsWith("dude-a2a-w-", StringComparison.OrdinalIgnoreCase);
                if (rest.Length > 0 && !Plain(rest))
                {
                    workerDir = named && Plain(dir) ? dir : "";
                    workerArea = "invalid";
                    return "worker";
                }
                if (named)
                {
                    workerDir = dir;
                    string inner = slash < 0 ? "" : rest.Substring(slash + 1).TrimEnd('\\');
                    int next = inner.IndexOf('\\');
                    string first = (next < 0 ? inner : inner.Substring(0, next)).ToUpperInvariant();
                    workerArea = inner.Length == 0 ? "root" : Array.IndexOf(WorkerAreas, first) >= 0 ? first.ToLowerInvariant() : "other";
                    if (workerArea != "temp") workerPath = inner.Replace('\\', '/');
                    string original;
                    if (inner.Length > 0 && canaries.TryGetValue(inner.ToUpperInvariant(), out original)) { canary = original; canaryScope = "worker"; }
                    return "worker";
                }
            }
            for (int index = 0; index < controlRoots.Length; index++)
            {
                if (!upper.StartsWith(controlRoots[index], StringComparison.Ordinal)) continue;
                string original;
                if (canaries.TryGetValue(ControlNames[index] + "\\" + upper.Substring(controlRoots[index].Length), out original))
                {
                    canary = original; canaryScope = "control";
                }
                break;
            }
            foreach (KeyValuePair<string, string> entry in roots)
            {
                if (upper == entry.Key || upper.StartsWith(entry.Key + "\\", StringComparison.Ordinal)) return entry.Value;
            }
            return null;
        }

        // Whether `rest`, the part of a path below the worker parent, has one plain spelling that names exactly one place: "\"
        // separators only, at most one trailing "\", and no empty, ".", or ".." segment, no segment ending in a dot or a space
        // (which Windows can strip or keep), no stream or drive colon, no wildcard, quote, angle bracket, bar, or control
        // character, and no segment in the form of an 8.3 short name, which can alias another long name.
        public static bool Plain(string rest)
        {
            if (string.IsNullOrEmpty(rest)) return false;
            string body = rest.EndsWith("\\", StringComparison.Ordinal) ? rest.Substring(0, rest.Length - 1) : rest;
            if (body.Length == 0) return false;
            foreach (string segment in body.Split('\\'))
            {
                if (segment.Length == 0 || segment == "." || segment == "..") return false;
                char last = segment[segment.Length - 1];
                if (last == '.' || last == ' ') return false;
                foreach (char character in segment)
                {
                    if (character < ' ' || character == '/' || character == ':' || character == '*' || character == '?' || character == '"'
                        || character == '<' || character == '>' || character == '|') return false;
                }
                if (ShortName(segment)) return false;
            }
            return true;
        }

        // Whether one segment has the form of an 8.3 short name: at most eight characters before its last dot, at most three
        // after it, and a "~" followed by a digit before that dot.
        private static bool ShortName(string segment)
        {
            int dot = segment.LastIndexOf('.');
            int stem = dot < 0 ? segment.Length : dot;
            if (stem > 8 || (dot >= 0 && segment.Length - dot - 1 > 3)) return false;
            for (int index = 0; index + 1 < stem; index++)
            {
                if (segment[index] == '~' && segment[index + 1] >= '0' && segment[index + 1] <= '9') return true;
            }
            return false;
        }

        private static void Count(SortedDictionary<string, long> table, string key)
        {
            long value;
            table.TryGetValue(key, out value);
            table[key] = value + 1;
        }

        private void Record(Proc owner, string path, string op)
        {
            string canary, scope, dir, area, relative;
            string kind = Classify(path, out canary, out scope, out dir, out area, out relative);
            if (canary != null) Count(canaryHits, owner.Key + "|" + scope + "|" + canary + "|" + op);
            if (kind == "worker") CountWorker(new string[] { owner.Key, dir, area, op, relative });
            else if (kind == null) Count(unclassified, owner.Key + "|" + op);
            else Count(files, owner.Key + "|" + kind + "|" + op);
        }

        // One worker storage row. A new row is charged to the summary budget when it is first seen, at its widest count, so the
        // rows can never outgrow what one summary may hold. A row that would exceed the budget, or a relative path longer than
        // MaxWorkerPath, sets the sticky overflow instead of being kept; after an overflow no new row is kept, while existing
        // rows still count. The path is last, so the separator split in Rows always leaves it whole.
        private void CountWorker(string[] values)
        {
            string key = values[4] == null ? string.Join("|", values, 0, 4) : string.Join("|", values);
            long value;
            if (workerDirs.TryGetValue(key, out value)) { workerDirs[key] = value + 1; return; }
            if (overflow) return;
            long cost = RowCost(WorkerDirFields, values);
            if ((values[4] != null && values[4].Length > MaxWorkerPath) || workerDirBytes + cost > summaryBytes) { overflow = true; return; }
            workerDirBytes += cost;
            workerDirs[key] = 1;
        }

        // The bytes one row adds to a summary: its fields as Rows writes them, a count of long.MaxValue's 19 digits, the closing
        // brace, and the separating comma.
        private static long RowCost(string[] names, string[] values)
        {
            StringBuilder text = new StringBuilder("{");
            for (int index = 0; index < names.Length; index++)
            {
                if (index > 0) text.Append(',');
                Str(text, names[index]);
                text.Append(':');
                Str(text, values[index]);
            }
            return text.Length + ",\"count\":".Length + 19 + 2;
        }

        // The final stop's result, carried in every later summary.
        public void Finish(StopResult result)
        {
            lock (gate)
            {
                final = "{\"stopStatus\":" + result.StopStatus.ToString(CultureInfo.InvariantCulture) + ",\"joined\":" + (result.Joined ? "true" : "false")
                    + ",\"consumerStatus\":" + result.ConsumerStatus.ToString(CultureInfo.InvariantCulture) + ",\"drained\":" + (result.Drained ? "true" : "false") + "}";
            }
        }

        // JSON text in ASCII only: replies cross a console pipe whose code page is not UTF-8, so every other character is escaped.
        private static void Str(StringBuilder text, string value)
        {
            if (value == null) { text.Append("null"); return; }
            text.Append('"');
            foreach (char character in value)
            {
                if (character == '"' || character == '\\') text.Append('\\').Append(character);
                else if (character < ' ' || character > '~') text.Append("\\u").Append(((int)character).ToString("x4", CultureInfo.InvariantCulture));
                else text.Append(character);
            }
            text.Append('"');
        }

        private static string Time(long fileTime)
        {
            return DateTime.FromFileTimeUtc(fileTime).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }

        private static string Number(long value) { return value.ToString(CultureInfo.InvariantCulture); }

        // Each row's key holds its fields joined by "|", which no Windows file name contains. Only the last field can hold more,
        // and it is kept whole; a key with one field fewer has a null last field.
        private static void Rows(StringBuilder text, SortedDictionary<string, long> table, string[] names)
        {
            bool first = true;
            foreach (KeyValuePair<string, long> row in table)
            {
                string[] parts = row.Key.Split(new char[] { '|' }, names.Length);
                text.Append(first ? "{" : ",{");
                first = false;
                for (int index = 0; index < names.Length; index++)
                {
                    if (index > 0) text.Append(',');
                    Str(text, names[index]);
                    text.Append(':');
                    Str(text, index < parts.Length ? parts[index] : null);
                }
                text.Append(",\"count\":").Append(Number(row.Value)).Append('}');
            }
        }

        // The whole bounded summary, or null when it would exceed `limitBytes`; never a truncated one.
        public string Summary(long marker, string runId, long eventsLost, long buffersLost, long realTimeBuffersLost, int limitBytes)
        {
            lock (gate)
            {
                StringBuilder text = new StringBuilder();
                text.Append("{\"version\":1,\"runId\":");
                Str(text, runId);
                text.Append(",\"marker\":").Append(Number(marker)).Append(",\"root\":");
                Str(text, root == null ? null : root.Key);
                text.Append(",\"health\":{\"eventsLost\":").Append(Number(eventsLost)).Append(",\"buffersLost\":").Append(Number(buffersLost))
                    .Append(",\"realTimeBuffersLost\":").Append(Number(realTimeBuffersLost)).Append(",\"decodeFailures\":").Append(Number(decodeFailures))
                    .Append(",\"identityGaps\":").Append(Number(identityGaps)).Append(",\"unattributed\":").Append(Number(unattributed))
                    .Append(",\"rootUnattributed\":").Append(Number(rootUnattributed))
                    .Append(",\"overflow\":").Append(overflow ? "true" : "false").Append(",\"markersMissed\":").Append(Number(markersMissed)).Append('}');
                text.Append(",\"final\":").Append(final ?? "null");
                text.Append(",\"processes\":[");
                for (int index = 0; index < all.Count; index++)
                {
                    Proc proc = all[index];
                    if (index > 0) text.Append(',');
                    text.Append("{\"key\":");
                    Str(text, proc.Key);
                    text.Append(",\"pid\":").Append(Number(proc.Pid)).Append(",\"parent\":");
                    Str(text, proc.ParentKey);
                    text.Append(",\"created\":");
                    Str(text, Time(proc.Created));
                    text.Append(",\"image\":");
                    Str(text, proc.Image);
                    text.Append(",\"exited\":");
                    Str(text, proc.HasExit ? Time(proc.Exited) : null);
                    text.Append(",\"exitCode\":").Append(proc.HasExit ? Number(proc.ExitCode) : "null").Append(",\"pinned\":").Append(proc.Pinned ? "true" : "false").Append('}');
                }
                text.Append("],\"files\":[");
                Rows(text, files, new string[] { "process", "class", "op" });
                text.Append("],\"canaries\":[");
                Rows(text, canaryHits, new string[] { "process", "scope", "path", "op" });
                text.Append("],\"workerDirs\":[");
                Rows(text, workerDirs, WorkerDirFields);
                text.Append("],\"unclassified\":[");
                Rows(text, unclassified, new string[] { "process", "op" });
                text.Append("]}");
                string json = text.ToString();
                return Encoding.UTF8.GetByteCount(json) > limitBytes ? null : json;
            }
        }
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct PROCESSENTRY32W
    {
        public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID; public uint th32ModuleID;
        public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase; public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct WNODE_HEADER
    {
        public uint BufferSize; public uint ProviderId; public ulong HistoricalContext; public long TimeStamp; public Guid Guid; public uint ClientContext; public uint Flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct EVENT_TRACE_PROPERTIES
    {
        public WNODE_HEADER Wnode; public uint BufferSize; public uint MinimumBuffers; public uint MaximumBuffers; public uint MaximumFileSize;
        public uint LogFileMode; public uint FlushTimer; public uint EnableFlags; public int AgeLimit; public uint NumberOfBuffers; public uint FreeBuffers;
        public uint EventsLost; public uint BuffersWritten; public uint LogBuffersLost; public uint RealTimeBuffersLost; public IntPtr LoggerThreadId;
        public uint LogFileNameOffset; public uint LoggerNameOffset;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct EVENT_TRACE_HEADER
    {
        public ushort Size; public ushort FieldTypeFlags; public uint Version; public uint ThreadId; public uint ProcessId; public long TimeStamp; public Guid Guid;
        public uint KernelTime; public uint UserTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct EVENT_TRACE
    {
        public EVENT_TRACE_HEADER Header; public uint InstanceId; public uint ParentInstanceId; public Guid ParentGuid; public IntPtr MofData; public uint MofLength;
        public uint ClientContext;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEMTIME { public ushort Year, Month, DayOfWeek, Day, Hour, Minute, Second, Milliseconds; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct TIME_ZONE_INFORMATION
    {
        public int Bias; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string StandardName; public SYSTEMTIME StandardDate; public int StandardBias;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DaylightName; public SYSTEMTIME DaylightDate; public int DaylightBias;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct TRACE_LOGFILE_HEADER
    {
        public uint BufferSize; public uint Version; public uint ProviderVersion; public uint NumberOfProcessors; public long EndTime; public uint TimerResolution;
        public uint MaximumFileSize; public uint LogFileMode; public uint BuffersWritten; public uint StartBuffers; public uint PointerSize; public uint EventsLost;
        public uint CpuSpeedInMHz; public IntPtr LoggerName; public IntPtr LogFileName; public TIME_ZONE_INFORMATION TimeZone; public long BootTime; public long PerfFreq;
        public long StartTime; public uint ReservedFlags; public uint BuffersLost;
    }

    [UnmanagedFunctionPointer(CallingConvention.StdCall)]
    public delegate void EventRecordCallback(IntPtr eventRecord);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct EVENT_TRACE_LOGFILEW
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string LogFileName;
        [MarshalAs(UnmanagedType.LPWStr)] public string LoggerName;
        public long CurrentTime; public uint BuffersRead; public uint ProcessTraceMode; public EVENT_TRACE CurrentEvent; public TRACE_LOGFILE_HEADER LogfileHeader;
        public IntPtr BufferCallback; public uint BufferSize; public uint Filled; public uint EventsLost; public EventRecordCallback EventRecordCallback;
        public uint IsKernelTrace; public IntPtr Context;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROPERTY_DATA_DESCRIPTOR { public ulong PropertyName; public uint ArrayIndex; public uint Reserved; }

    // Public Windows APIs only: process handles and times, image names, device names, and ETW sessions and decoding.
    public static class Native
    {
        public const uint QueryLimited = 0x1000;
        public const uint Synchronize = 0x00100000;

        [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool QueryFullProcessImageNameW(IntPtr process, uint flags, StringBuilder name, ref uint size);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetExitCodeProcess(IntPtr process, out int code);
        [DllImport("kernel32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] public static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] public static extern uint QueryDosDeviceW(string device, StringBuilder target, uint max);
        [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32W entry);
        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)] [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32W entry);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] public static extern uint StartTraceW(out ulong handle, string name, IntPtr properties);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode)] public static extern uint ControlTraceW(ulong handle, string name, IntPtr properties, uint code);
        [DllImport("advapi32.dll")]
        public static extern uint EnableTraceEx2(ulong handle, ref Guid provider, uint code, byte level, ulong any, ulong all, uint timeout, IntPtr parameters);
        [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] public static extern ulong OpenTraceW(ref EVENT_TRACE_LOGFILEW logfile);
        [DllImport("advapi32.dll")] public static extern uint ProcessTrace(ulong[] handles, uint count, IntPtr start, IntPtr end);
        [DllImport("advapi32.dll")] public static extern uint CloseTrace(ulong handle);
        [DllImport("tdh.dll")]
        public static extern uint TdhGetPropertySize(IntPtr record, uint contextCount, IntPtr context, uint descriptorCount, ref PROPERTY_DATA_DESCRIPTOR descriptor, out uint size);
        [DllImport("tdh.dll")]
        public static extern uint TdhGetProperty(IntPtr record, uint contextCount, IntPtr context, uint descriptorCount, ref PROPERTY_DATA_DESCRIPTOR descriptor, uint size, IntPtr buffer);

        // The parent of one process from a public process snapshot, or 0.
        public static uint ParentProcessId(int pid)
        {
            IntPtr snapshot = CreateToolhelp32Snapshot(0x2, 0);
            if (snapshot == IntPtr.Zero || snapshot == new IntPtr(-1)) return 0;
            try
            {
                PROCESSENTRY32W entry = new PROCESSENTRY32W();
                entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
                for (bool more = Process32FirstW(snapshot, ref entry); more; more = Process32NextW(snapshot, ref entry))
                {
                    if (entry.th32ProcessID == (uint)pid) return entry.th32ParentProcessID;
                }
                return 0;
            }
            finally { CloseHandle(snapshot); }
        }

        public static string ImagePath(IntPtr process)
        {
            StringBuilder name = new StringBuilder(1024);
            uint size = (uint)name.Capacity;
            return QueryFullProcessImageNameW(process, 0, name, ref size) ? name.ToString(0, (int)size) : null;
        }
    }

    internal sealed class ProcessWait : WaitHandle
    {
        public readonly uint Pid;
        public readonly long Created;
        public ProcessWait(IntPtr handle, uint pid, long created) { SafeWaitHandle = new SafeWaitHandle(handle, true); Pid = pid; Created = created; }
    }

    // One real-time ETW session for this run's providers, and public process handles for every tracked process.
    public sealed class Observer : IDisposable, IProcessPins
    {
        private const uint TracedGuid = 0x00020000;
        private const uint RealTimeMode = 0x00000100;
        private const uint TraceModeRealTime = 0x00000100;
        private const uint TraceModeEventRecord = 0x10000000;
        private const uint ControlQuery = 0, ControlStop = 1, ControlFlush = 3;
        private const ulong InvalidTrace = 0xFFFFFFFFFFFFFFFF;
        private static readonly Guid KernelProcess = new Guid("22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716");
        private static readonly Guid KernelFile = new Guid("edd08927-9cc4-4e65-b970-c2560fb5c289");
        private const ulong ProcessKeywords = 0x10 | 0x20;
        private const ulong FileKeywords = 0x10 | 0x20 | 0x80 | 0x100 | 0x200 | 0x400 | 0x800 | 0x1000;
        private const int SummaryBytes = 65536;
        // How long a final stop waits for the consumer to deliver every buffered event and return.
        private const int DrainMs = 10000;
        private readonly Tracker tracker;
        private readonly PathMap paths;
        private readonly uint rootPid;
        private readonly string runId;
        private readonly string name;
        private readonly Dictionary<string, IntPtr> names = new Dictionary<string, IntPtr>(StringComparer.Ordinal);
        private readonly List<RegisteredWaitHandle> waits = new List<RegisteredWaitHandle>();
        private readonly List<ProcessWait> handles = new List<ProcessWait>();
        private readonly object waitGate = new object();
        private ulong session;
        private ulong trace = InvalidTrace;
        private Thread pump;
        private volatile uint consumerStatus = uint.MaxValue;
        private EventRecordCallback callback;
        private IntPtr rootHandle = IntPtr.Zero;
        private bool started, stopped;

        public Observer(Tracker tracker, PathMap paths, uint rootPid, string runId)
        {
            this.tracker = tracker; this.paths = paths; this.rootPid = rootPid; this.runId = runId; name = "DudeA2aObserver-" + runId;
        }

        private static IntPtr Properties(out int size)
        {
            int structure = Marshal.SizeOf(typeof(EVENT_TRACE_PROPERTIES));
            size = structure + 2048;
            IntPtr buffer = Marshal.AllocHGlobal(size);
            Marshal.Copy(new byte[size], 0, buffer, size);
            EVENT_TRACE_PROPERTIES properties = new EVENT_TRACE_PROPERTIES();
            properties.Wnode.BufferSize = (uint)size;
            properties.Wnode.Flags = TracedGuid;
            properties.Wnode.ClientContext = 2;
            properties.LoggerNameOffset = (uint)structure;
            Marshal.StructureToPtr(properties, buffer, false);
            return buffer;
        }

        public int Start()
        {
            rootHandle = Native.OpenProcess(Native.QueryLimited | Native.Synchronize, false, rootPid);
            if (rootHandle == IntPtr.Zero) return 87;
            long created, exit, kernel, user;
            if (!Native.GetProcessTimes(rootHandle, out created, out exit, out kernel, out user)) return 87;
            // The root is pinned like every other identity, by handle, creation time, and canonical image, or nothing starts.
            string image = Native.ImagePath(rootHandle);
            if (image == null) return 87;
            tracker.SetRoot(rootPid, created, image);
            for (char letter = 'A'; letter <= 'Z'; letter++)
            {
                StringBuilder target = new StringBuilder(1024);
                string drive = letter + ":";
                if (Native.QueryDosDeviceW(drive, target, (uint)target.Capacity) != 0) paths.Add(target.ToString(), drive);
            }
            int size;
            IntPtr buffer = Properties(out size);
            try
            {
                EVENT_TRACE_PROPERTIES properties = (EVENT_TRACE_PROPERTIES)Marshal.PtrToStructure(buffer, typeof(EVENT_TRACE_PROPERTIES));
                properties.Wnode.Guid = Guid.NewGuid();
                properties.BufferSize = 256; properties.MinimumBuffers = 64; properties.MaximumBuffers = 512;
                properties.LogFileMode = RealTimeMode; properties.FlushTimer = 1;
                Marshal.StructureToPtr(properties, buffer, false);
                uint status = Native.StartTraceW(out session, name, buffer);
                if (status != 0) return (int)status;
                started = true;
                Guid process = KernelProcess;
                Guid file = KernelFile;
                status = Native.EnableTraceEx2(session, ref process, 1, 5, ProcessKeywords, 0, 0, IntPtr.Zero);
                if (status == 0) status = Native.EnableTraceEx2(session, ref file, 1, 5, FileKeywords, 0, 0, IntPtr.Zero);
                if (status != 0) return (int)status;
            }
            finally { Marshal.FreeHGlobal(buffer); }
            callback = new EventRecordCallback(OnEvent);
            EVENT_TRACE_LOGFILEW logfile = new EVENT_TRACE_LOGFILEW();
            logfile.LoggerName = name;
            logfile.ProcessTraceMode = TraceModeRealTime | TraceModeEventRecord;
            logfile.EventRecordCallback = callback;
            trace = Native.OpenTraceW(ref logfile);
            if (trace == InvalidTrace) return 1;
            pump = new Thread(Pump);
            pump.IsBackground = true;
            pump.Start();
            return 0;
        }

        private void Pump() { consumerStatus = Native.ProcessTrace(new ulong[] { trace }, 1, IntPtr.Zero, IntPtr.Zero); }

        private uint Control(uint code, out long eventsLost, out long buffersLost, out long realTimeBuffersLost)
        {
            eventsLost = -1; buffersLost = -1; realTimeBuffersLost = -1;
            int size;
            IntPtr buffer = Properties(out size);
            try
            {
                uint status = Native.ControlTraceW(session, name, buffer, code);
                if (status != 0) return status;
                EVENT_TRACE_PROPERTIES properties = (EVENT_TRACE_PROPERTIES)Marshal.PtrToStructure(buffer, typeof(EVENT_TRACE_PROPERTIES));
                eventsLost = properties.EventsLost; buffersLost = properties.LogBuffersLost; realTimeBuffersLost = properties.RealTimeBuffersLost;
                return 0;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        // Waits for the caller's marker create, so the reply covers every earlier event of the caller; a missed marker is reported.
        private void WaitMarker(long marker)
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(5);
            while (tracker.HighestMarker < marker && DateTime.UtcNow < deadline) Thread.Sleep(20);
            if (tracker.HighestMarker < marker) tracker.MissedMarker();
        }

        public string Snapshot(long marker)
        {
            long lost, buffers, realTime;
            Control(ControlFlush, out lost, out buffers, out realTime);
            WaitMarker(marker);
            Thread.Sleep(250);
            Control(ControlFlush, out lost, out buffers, out realTime);
            Thread.Sleep(100);
            Control(ControlQuery, out lost, out buffers, out realTime);
            return tracker.Summary(marker, runId, lost, buffers, realTime, SummaryBytes);
        }

        // The final summary is built only after the named session stopped, its consumer delivered every buffered event
        // and returned (or was closed after its bound), with the final loss counts and the drain result in it.
        public string Stop(long marker)
        {
            long lost = -1, buffers = -1, realTime = -1;
            Control(ControlFlush, out lost, out buffers, out realTime);
            WaitMarker(marker);
            StopResult result = TraceStop.Run(
                delegate { return Control(ControlStop, out lost, out buffers, out realTime); },
                delegate { return pump == null || pump.Join(DrainMs); },
                delegate { return consumerStatus; },
                CloseConsumer);
            stopped = true;
            tracker.Finish(result);
            return tracker.Summary(marker, runId, lost, buffers, realTime, SummaryBytes);
        }

        private void CloseConsumer()
        {
            if (trace != InvalidTrace) { Native.CloseTrace(trace); trace = InvalidTrace; }
        }

        private void StopSession()
        {
            if (!started || stopped) return;
            stopped = true;
            long lost, buffers, realTime;
            Control(ControlStop, out lost, out buffers, out realTime);
            if (pump != null) pump.Join(DrainMs);
            CloseConsumer();
        }

        // IProcessPins: a query-limited, synchronize-only handle, its creation time, and its canonical image; nothing else.
        public Pin Open(uint pid)
        {
            Pin pin = new Pin();
            pin.Handle = Native.OpenProcess(Native.QueryLimited | Native.Synchronize, false, pid);
            pin.Opened = pin.Handle != IntPtr.Zero;
            if (!pin.Opened) return pin;
            long created, exit, kernel, user;
            pin.Timed = Native.GetProcessTimes(pin.Handle, out created, out exit, out kernel, out user);
            pin.Created = created;
            if (pin.Timed) pin.Image = Native.ImagePath(pin.Handle);
            return pin;
        }

        public void Watch(Pin pin, uint pid, long created)
        {
            ProcessWait wait = new ProcessWait(pin.Handle, pid, created);
            lock (waitGate)
            {
                handles.Add(wait);
                waits.Add(ThreadPool.RegisterWaitForSingleObject(wait, OnExit, wait, -1, true));
            }
        }

        public void Release(Pin pin)
        {
            if (pin != null && pin.Handle != IntPtr.Zero) { Native.CloseHandle(pin.Handle); pin.Handle = IntPtr.Zero; }
        }

        private IntPtr NameOf(string property)
        {
            IntPtr pointer;
            if (!names.TryGetValue(property, out pointer)) { pointer = Marshal.StringToHGlobalUni(property); names[property] = pointer; }
            return pointer;
        }

        private byte[] Raw(IntPtr record, string property)
        {
            PROPERTY_DATA_DESCRIPTOR descriptor = new PROPERTY_DATA_DESCRIPTOR();
            descriptor.PropertyName = (ulong)NameOf(property).ToInt64();
            descriptor.ArrayIndex = 0xFFFFFFFF;
            uint size;
            if (Native.TdhGetPropertySize(record, 0, IntPtr.Zero, 1, ref descriptor, out size) != 0 || size == 0 || size > 65536) return null;
            IntPtr buffer = Marshal.AllocHGlobal((int)size);
            try
            {
                if (Native.TdhGetProperty(record, 0, IntPtr.Zero, 1, ref descriptor, size, buffer) != 0) return null;
                byte[] data = new byte[size];
                Marshal.Copy(buffer, data, 0, (int)size);
                return data;
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }

        private bool ReadUInt(IntPtr record, string property, out ulong value)
        {
            value = 0;
            byte[] data = Raw(record, property);
            if (data == null) return false;
            if (data.Length >= 8) value = BitConverter.ToUInt64(data, 0);
            else if (data.Length >= 4) value = BitConverter.ToUInt32(data, 0);
            else return false;
            return true;
        }

        private string ReadText(IntPtr record, string property)
        {
            byte[] data = Raw(record, property);
            return data == null ? null : Encoding.Unicode.GetString(data).TrimEnd('\0');
        }

        // One event record's properties, decoded through TDH only when the tracker asks for them.
        private sealed class RecordFields : IEventFields
        {
            private readonly Observer owner;
            private readonly IntPtr record;
            public RecordFields(Observer owner, IntPtr record) { this.owner = owner; this.record = record; }
            public bool UInt(string property, out ulong value) { return owner.ReadUInt(record, property, out value); }
            public string Text(string property) { return owner.ReadText(record, property); }
        }

        // The header's provider, event ID, thread, process, and timestamp; everything else is the tracker's decision.
        private void OnEvent(IntPtr record)
        {
            try
            {
                byte[] guid = new byte[16];
                Marshal.Copy(new IntPtr(record.ToInt64() + 24), guid, 0, 16);
                Guid provider = new Guid(guid);
                int id = (ushort)Marshal.ReadInt16(record, 40);
                uint threadId = (uint)Marshal.ReadInt32(record, 8);
                uint processId = (uint)Marshal.ReadInt32(record, 12);
                long timeStamp = Marshal.ReadInt64(record, 16);
                if (provider == KernelProcess) tracker.OnProcess(id, processId, threadId, timeStamp, new RecordFields(this, record), this);
                else if (provider == KernelFile) tracker.OnFile(id, processId, threadId, timeStamp, new RecordFields(this, record));
            }
            catch (Exception) { tracker.DecodeFailure(); }
        }

        private void OnExit(object state, bool timedOut)
        {
            ProcessWait wait = (ProcessWait)state;
            long created = 0, exit = 0, kernel, user;
            int code = 0;
            IntPtr handle = wait.SafeWaitHandle.DangerousGetHandle();
            bool timed = Native.GetProcessTimes(handle, out created, out exit, out kernel, out user) && Native.GetExitCodeProcess(handle, out code);
            tracker.OnHandleExit(wait.Pid, wait.Created, timed, exit, code);
        }

        public void Dispose()
        {
            StopSession();
            lock (waitGate)
            {
                foreach (RegisteredWaitHandle wait in waits) wait.Unregister(null);
                waits.Clear();
                foreach (ProcessWait handle in handles) handle.Dispose();
                handles.Clear();
            }
            foreach (IntPtr pointer in names.Values) Marshal.FreeHGlobal(pointer);
            names.Clear();
            if (rootHandle != IntPtr.Zero) { Native.CloseHandle(rootHandle); rootHandle = IntPtr.Zero; }
        }
    }
}
'@

try {
  Add-Type -TypeDefinition $Source -Language CSharp
} catch {
  Stop-Refused 'observer_unsupported'
}

# The only root is this process's parent, pinned by handle before anything starts.
$parentPid = [DudeA2aObserver.Native]::ParentProcessId([System.Diagnostics.Process]::GetCurrentProcess().Id)
if ($parentPid -ne [uint32]$config.rootPid) { Stop-Refused 'observer_input_invalid' }

$classList = New-Object 'System.Collections.Generic.List[DudeA2aObserver.PathClass]'
foreach ($entry in @($config.classes)) {
  $classList.Add([DudeA2aObserver.PathClass]::new([string]$entry.name, [string[]]@($entry.roots)))
}
$proofRoot = [string](@($config.classes | Where-Object { $_.name -ceq 'proof' })[0].roots[0])
$paths = [DudeA2aObserver.PathMap]::new()
$tracker = [DudeA2aObserver.Tracker]::new($classList.ToArray(), [string[]]@($config.canaries), [string]$config.workerParent,
  [string[]]@($config.controlRoots.work, $config.controlRoots.config, $config.controlRoots.home), [int]$config.limits.processes,
  [int]$config.limits.summaryBytes, $proofRoot, $paths)
$observer = [DudeA2aObserver.Observer]::new($tracker, $paths, [uint32]$config.rootPid, [string]$config.runId)

try {
  $status = $observer.Start()
  if ($status -eq 5) { Stop-Refused 'observer_privilege_missing' }
  if ($status -eq 183) { Stop-Refused 'observer_refused' }
  if ($status -ne 0) { Stop-Refused 'observer_unsupported' }
  Write-Reply '{"event":"ready","providers":["Microsoft-Windows-Kernel-Process","Microsoft-Windows-Kernel-File"]}'
  while ($true) {
    $line = [Console]::In.ReadLine()
    if ($null -eq $line) { break }
    $command = $null
    try { $command = $line | ConvertFrom-Json } catch { $command = $null }
    if ($null -eq $command -or ((Get-Names $command) -join ',') -ne 'marker,op' -or -not ($command.marker -is [int] -or $command.marker -is [long])) {
      Write-Reply '{"event":"refused","reason":"observer_input_invalid"}'
      continue
    }
    if ($command.op -ceq 'snapshot') {
      $summary = $observer.Snapshot([long]$command.marker)
      if ($null -eq $summary) { Write-Reply '{"event":"refused","reason":"observer_overflow"}' }
      else { Write-Reply ('{"event":"snapshot","summary":' + $summary + '}') }
    } elseif ($command.op -ceq 'stop') {
      $summary = $observer.Stop([long]$command.marker)
      if ($null -eq $summary) {
        Write-Reply '{"event":"refused","reason":"observer_overflow"}'
      } else {
        $stream = New-Object System.IO.FileStream -ArgumentList $config.output, ([System.IO.FileMode]::CreateNew), ([System.IO.FileAccess]::Write)
        try {
          $bytes = [System.Text.Encoding]::UTF8.GetBytes($summary + "`n")
          $stream.Write($bytes, 0, $bytes.Length)
        } finally {
          $stream.Dispose()
        }
        Write-Reply ('{"event":"stopped","summary":' + $summary + '}')
      }
      break
    } else {
      Write-Reply '{"event":"refused","reason":"observer_input_invalid"}'
    }
  }
} finally {
  # Always end this run's own session; never any other.
  $observer.Dispose()
}
exit 0

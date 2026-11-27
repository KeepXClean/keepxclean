import { execFileSync } from 'node:child_process';
import os from 'node:os';

// Pin multi-vCPU Linux test workers (and child workerd / wrangler processes) to CPU 0
// to prevent KVM cross-vCPU CLOCK_MONOTONIC_RAW skew from aborting workerd's kj::TimerImpl.
if (process.platform === 'linux' && os.cpus().length > 1) {
  try {
    execFileSync('taskset', ['-apc', '0', String(process.pid)], {
      stdio: 'ignore',
    });
  } catch {
    // Best-effort only: ignore if taskset is unavailable or CPU affinity is restricted.
  }
}

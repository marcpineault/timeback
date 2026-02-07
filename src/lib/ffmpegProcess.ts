import ffmpeg, { FfmpegCommand } from 'fluent-ffmpeg';
import { spawn, ChildProcess } from 'child_process';
import { logger } from './logger';

/**
 * Configuration for FFmpeg process handling
 */
export interface FFmpegProcessConfig {
  /** Timeout in milliseconds (default: 10 minutes) */
  timeout?: number;
  /** Maximum retries on transient failures (default: 2) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 1000) */
  retryDelay?: number;
  /** Context for logging */
  context?: string;
}

const DEFAULT_CONFIG: Required<FFmpegProcessConfig> = {
  timeout: 10 * 60 * 1000, // 10 minutes
  maxRetries: 2,
  retryDelay: 1000,
  context: 'FFmpeg',
};

/**
 * Error class for FFmpeg process failures
 */
export class FFmpegProcessError extends Error {
  public readonly signal?: string;
  public readonly exitCode?: number;
  public readonly isTimeout: boolean;
  public readonly isMemoryKill: boolean;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    options: {
      signal?: string;
      exitCode?: number;
      isTimeout?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'FFmpegProcessError';
    this.signal = options.signal;
    this.exitCode = options.exitCode;
    this.isTimeout = options.isTimeout ?? false;

    // SIGKILL (signal 9) typically means OOM killer or system resource limit
    this.isMemoryKill = options.signal === 'SIGKILL';

    // Determine if error is retryable (transient failures)
    this.isRetryable = this.isTimeout ||
      this.isMemoryKill ||
      options.signal === 'SIGTERM' ||
      (options.exitCode !== undefined && options.exitCode !== 0 && options.exitCode !== 1);

    if (options.cause) {
      this.cause = options.cause;
    }
  }
}

/**
 * Track active FFmpeg processes for cleanup on shutdown
 */
const activeProcesses = new Set<ChildProcess>();

/**
 * Cleanup function for graceful shutdown
 */
export function cleanupFFmpegProcesses(): void {
  logger.info(`[FFmpeg] Cleaning up ${activeProcesses.size} active processes`);
  for (const proc of activeProcesses) {
    try {
      proc.kill('SIGTERM');
    } catch {
      // Ignore errors during cleanup
    }
  }
  activeProcesses.clear();
}

// Register cleanup on process exit
process.on('SIGTERM', cleanupFFmpegProcesses);
process.on('SIGINT', cleanupFFmpegProcesses);

/**
 * Wraps a fluent-ffmpeg command with timeout and error handling
 * Returns a promise that resolves when processing completes
 */
export function runFFmpegCommand(
  command: FfmpegCommand,
  config: FFmpegProcessConfig = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let ffmpegProcess: ChildProcess | null = null;
    let stderr = '';
    let isKilled = false;

    // Set up timeout
    if (cfg.timeout > 0) {
      timeoutId = setTimeout(() => {
        isKilled = true;
        logger.warn(`[${cfg.context}] Process timed out after ${cfg.timeout}ms, killing...`);

        if (ffmpegProcess) {
          // Send SIGTERM first for graceful shutdown
          ffmpegProcess.kill('SIGTERM');

          // Force kill after 5 seconds if still running
          setTimeout(() => {
            if (ffmpegProcess && !ffmpegProcess.killed) {
              ffmpegProcess.kill('SIGKILL');
            }
          }, 5000);
        }

        reject(new FFmpegProcessError(
          `FFmpeg process timed out after ${cfg.timeout / 1000} seconds`,
          { isTimeout: true }
        ));
      }, cfg.timeout);
    }

    // Capture stderr for debugging
    command.on('stderr', (line: string) => {
      stderr += line + '\n';
      // Only keep last 2000 chars to prevent memory issues
      if (stderr.length > 2000) {
        stderr = stderr.slice(-2000);
      }
    });

    // Handle process spawn to track the child process
    command.on('start', (commandLine: string) => {
      logger.debug(`[${cfg.context}] Started: ${commandLine.substring(0, 200)}...`);

      // Get the spawned process from fluent-ffmpeg internals
      // This is a workaround since fluent-ffmpeg doesn't expose it directly
      const cmd = command as FfmpegCommand & { ffmpegProc?: ChildProcess };
      if (cmd.ffmpegProc) {
        ffmpegProcess = cmd.ffmpegProc;
        activeProcesses.add(ffmpegProcess);
      }
    });

    command.on('end', () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (ffmpegProcess) activeProcesses.delete(ffmpegProcess);

      if (!isKilled) {
        logger.debug(`[${cfg.context}] Completed successfully`);
        resolve();
      }
    });

    command.on('error', (err: Error & { signal?: string; code?: number }) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (ffmpegProcess) activeProcesses.delete(ffmpegProcess);

      if (isKilled) {
        // Already handled by timeout
        return;
      }

      // Parse the error to determine cause
      const errorMessage = err.message || String(err);
      const signal = err.signal || extractSignalFromError(errorMessage);
      const exitCode = err.code;

      logger.error(`[${cfg.context}] Error:`, {
        message: errorMessage,
        signal,
        exitCode,
        stderr: stderr.slice(-500),
      });

      // Create detailed error
      const processError = new FFmpegProcessError(
        formatFFmpegError(errorMessage, signal, exitCode, cfg.context),
        { signal, exitCode, cause: err }
      );

      reject(processError);
    });

    // Run the command
    command.run();
  });
}

/**
 * Runs an FFmpeg command with retry logic for transient failures
 */
export async function runFFmpegWithRetry(
  commandFactory: () => FfmpegCommand,
  config: FFmpegProcessConfig = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastError: FFmpegProcessError | null = null;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        logger.info(`[${cfg.context}] Retry attempt ${attempt}/${cfg.maxRetries}`);
        await delay(cfg.retryDelay * attempt); // Exponential backoff
      }

      await runFFmpegCommand(commandFactory(), cfg);
      return; // Success
    } catch (err) {
      lastError = err instanceof FFmpegProcessError
        ? err
        : new FFmpegProcessError(String(err), { cause: err instanceof Error ? err : undefined });

      if (!lastError.isRetryable || attempt >= cfg.maxRetries) {
        break;
      }

      logger.warn(`[${cfg.context}] Transient failure (${lastError.signal || 'unknown'}), will retry...`);
    }
  }

  throw lastError;
}

/**
 * Runs a raw FFmpeg command using spawn with timeout and signal handling
 * Useful for complex operations that don't fit fluent-ffmpeg's API
 */
export function runFFmpegSpawn(
  args: string[],
  config: FFmpegProcessConfig = {}
): Promise<{ stdout: string; stderr: string }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isKilled = false;

    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    activeProcesses.add(proc);

    // Set up timeout
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (cfg.timeout > 0) {
      timeoutId = setTimeout(() => {
        isKilled = true;
        logger.warn(`[${cfg.context}] Spawn process timed out, killing...`);
        proc.kill('SIGTERM');

        setTimeout(() => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        }, 5000);
      }, cfg.timeout);
    }

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 10000) {
        stdout = stdout.slice(-10000);
      }
    });

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 10000) {
        stderr = stderr.slice(-10000);
      }
    });

    proc.on('close', (code, signal) => {
      if (timeoutId) clearTimeout(timeoutId);
      activeProcesses.delete(proc);

      if (isKilled) {
        reject(new FFmpegProcessError(
          `FFmpeg spawn timed out after ${cfg.timeout / 1000} seconds`,
          { isTimeout: true }
        ));
        return;
      }

      if (signal) {
        reject(new FFmpegProcessError(
          formatFFmpegError(`Process killed by signal ${signal}`, signal, code ?? undefined, cfg.context),
          { signal, exitCode: code ?? undefined }
        ));
        return;
      }

      if (code !== 0) {
        reject(new FFmpegProcessError(
          formatFFmpegError(`Process exited with code ${code}`, undefined, code ?? undefined, cfg.context),
          { exitCode: code ?? undefined }
        ));
        return;
      }

      resolve({ stdout, stderr });
    });

    proc.on('error', (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      activeProcesses.delete(proc);

      reject(new FFmpegProcessError(
        `Failed to spawn FFmpeg: ${err.message}`,
        { cause: err }
      ));
    });
  });
}

/**
 * Extract signal from error message if not provided directly
 */
function extractSignalFromError(message: string): string | undefined {
  const signalMatch = message.match(/signal (SIG\w+)/i);
  if (signalMatch) {
    return signalMatch[1].toUpperCase();
  }

  if (message.includes('SIGKILL') || message.includes('signal 9')) {
    return 'SIGKILL';
  }
  if (message.includes('SIGTERM') || message.includes('signal 15')) {
    return 'SIGTERM';
  }

  return undefined;
}

/**
 * Format a user-friendly error message
 */
function formatFFmpegError(
  originalMessage: string,
  signal: string | undefined,
  exitCode: number | undefined,
  context: string
): string {
  let message = `[${context}] `;

  if (signal === 'SIGKILL') {
    message += 'Process was killed by the system (likely due to memory constraints). ';
    message += 'Try processing a shorter video or reducing processing options.';
  } else if (signal === 'SIGTERM') {
    message += 'Process was terminated. This may be due to a timeout or server shutdown.';
  } else if (signal) {
    message += `Process was killed with signal ${signal}. `;
  } else if (exitCode !== undefined && exitCode !== 0) {
    message += `Process failed with exit code ${exitCode}. `;
    if (originalMessage.includes('No such file')) {
      message += 'Input file may have been deleted during processing.';
    } else if (originalMessage.includes('Invalid data')) {
      message += 'Video file may be corrupted or in an unsupported format.';
    }
  } else {
    message += originalMessage;
  }

  return message;
}

/**
 * Helper function for delays
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get memory-efficient FFmpeg output options
 * These settings help prevent OOM kills on constrained systems
 */
export function getMemoryEfficientOptions(): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-threads', '4',           // Balance speed vs memory
    '-max_muxing_queue_size', '512',  // Limit muxing buffer
    '-bufsize', '1M',          // Limit rate control buffer
  ];
}

/**
 * Get audio encoding options
 */
export function getAudioOptions(): string[] {
  return [
    '-c:a', 'aac',
    '-b:a', '128k',
  ];
}

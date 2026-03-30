import * as vscode from 'vscode';

/**
 * Singleton logger for the HydraGit extension host.
 *
 * Writes to the VS Code Output Channel ("HydraGit") — visible via
 * View → Output → HydraGit.
 *
 * Rules:
 *  - Git commands and IPC traffic are logged by the Go process to file.
 *  - This logger covers the TS side: process lifecycle, IPC errors,
 *    Go stderr, and status poll failures.
 *  - No JSON here — plain human-readable lines for the Output Channel.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR';

class HydraLogger {
  private channel: vscode.OutputChannel | undefined;

  init(channel: vscode.OutputChannel): void {
    this.channel = channel;
  }

  info(source: string, msg: string): void {
    this.write('INFO', source, msg);
  }

  warn(source: string, msg: string): void {
    this.write('WARN', source, msg);
  }

  error(source: string, msg: string): void {
    this.write('ERROR', source, msg);
  }

  /** Forward raw Go stderr lines — already trimmed. */
  goStderr(line: string): void {
    if (line) this.write('ERROR', 'go', line);
  }

  private write(level: LogLevel, source: string, msg: string): void {
    if (!this.channel) return;
    const ts = new Date().toISOString();
    this.channel.appendLine(`${ts} ${level.padEnd(5)} [${source}] ${msg}`);
  }
}

export const Logger = new HydraLogger();

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Minimum level to print, e.g. LOG_LEVEL=debug for more output (default: info)
const minLevel = LEVELS[(process.env['LOG_LEVEL'] as Level) ?? 'info'] ?? LEVELS.info;

function log(level: Level, message: string, ...args: unknown[]) {
  if (LEVELS[level] < minLevel) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  write(line, ...args);
}

export const logger = {
  debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
};

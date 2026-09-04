import { access } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { resolve } from 'node:path';

function existingEnvironmentPath(name: string, suffix: string) {
  const base = process.env[name]?.trim();
  return base ? resolve(base, suffix) : null;
}

export function flatpayRuntimeDirectory() {
  if (platform() === 'darwin') {
    return resolve(homedir(), 'Library/Application Support/ToqueHub/Flatpay');
  }
  if (platform() === 'win32') {
    return resolve(process.env.LOCALAPPDATA || homedir(), 'ToqueHub/Flatpay');
  }
  return resolve(
    process.env.XDG_DATA_HOME || resolve(homedir(), '.local/share'),
    'toquehub/flatpay',
  );
}

export async function resolveFlatpayBrowserExecutable(explicitPath?: string) {
  const candidates = [
    explicitPath?.trim(),
    process.env.FLATPAY_CHROME_PATH?.trim(),
    ...(platform() === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
        ]
      : []),
    ...(platform() === 'win32'
      ? [
          existingEnvironmentPath('PROGRAMFILES', 'Google/Chrome/Application/chrome.exe'),
          existingEnvironmentPath('PROGRAMFILES(X86)', 'Google/Chrome/Application/chrome.exe'),
          existingEnvironmentPath('LOCALAPPDATA', 'Google/Chrome/Application/chrome.exe'),
          existingEnvironmentPath('PROGRAMFILES', 'Microsoft/Edge/Application/msedge.exe'),
          existingEnvironmentPath('PROGRAMFILES(X86)', 'Microsoft/Edge/Application/msedge.exe'),
        ]
      : []),
    ...(platform() === 'linux'
      ? [
          '/usr/bin/google-chrome-stable',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium',
          '/usr/bin/microsoft-edge-stable',
        ]
      : []),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of [...new Set(candidates)]) {
    if (
      await access(candidate)
        .then(() => true)
        .catch(() => false)
    ) {
      return candidate;
    }
  }

  throw new Error(
    platform() === 'linux'
      ? 'Chrome ou Chromium est requis pour Flatpay. Sur Raspberry Pi, installez Chromium ou configurez FLATPAY_CHROME_PATH.'
      : 'Chrome, Chromium ou Microsoft Edge est requis pour automatiser Flatpay.',
  );
}

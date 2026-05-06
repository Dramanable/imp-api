/**
 * Jest globalSetup — loads .env file into process.env before integration tests run.
 * Uses only Node.js built-ins (no dotenv dependency required).
 */
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export default function setup() {
  const envPath = resolve(__dirname, '../../.env');
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
}

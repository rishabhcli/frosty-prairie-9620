import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "reports");

export async function writeReport(name: string, data: Record<string, unknown>): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const path = join(REPORTS_DIR, name);
  await writeFile(path, JSON.stringify({ ...data, generatedAt: new Date().toISOString() }, null, 2));
  return path;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

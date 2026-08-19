import fs from 'node:fs';
export async function downloadToFile(url, outputPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`다운로드 실패 (${res.status}): ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
}

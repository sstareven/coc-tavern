/**
 * PDF → Text extractor for OpenCode
 * Usage: node tools/pdf2text.mjs <pdf-path> [output-path]
 */
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFileSync, writeFileSync } from 'fs';

const pdfPath = process.argv[2];
const outPath = process.argv[3] || pdfPath.replace(/\.pdf$/i, '.txt');

if (!pdfPath) {
  console.error('Usage: node pdf2text.mjs <pdf-path> [output-path]');
  process.exit(1);
}

const data = new Uint8Array(readFileSync(pdfPath));
const doc = await getDocument({ data }).promise;

const pages = [];
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const text = await page.getTextContent();
  const pageText = text.items.map((item) => item.str).join(' ');
  pages.push(`\n=== 第 ${i} 页 ===\n${pageText}`);
}

const output = pages.join('\n');
writeFileSync(outPath, output, 'utf-8');
console.log(`✅ 提取完成: ${doc.numPages} 页 → ${outPath} (${(output.length / 1024).toFixed(0)} KB)`);

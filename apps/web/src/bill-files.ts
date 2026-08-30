import type { EvidenceDocument } from '@moving-day/contracts';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function pdfDocument(file: File): Promise<EvidenceDocument> {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 30); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => 'str' in item ? `${item.str}${'hasEOL' in item && item.hasEOL ? '\n' : ' '}` : '').join(''));
  }
  return { name: file.name, text: pages.join('\n').replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim().slice(0, 16_000) };
}

export async function parseBillFiles(files: File[]) {
  if (files.length > 6) throw new Error('Upload no more than six bills at once.');
  const documents: EvidenceDocument[] = [];
  for (const file of files) {
    if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} is larger than 8 MB.`);
    const document = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
      ? await pdfDocument(file)
      : { name: file.name, text: (await file.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 16_000) };
    if (document.text) documents.push(document);
  }
  if (documents.length === 0) throw new Error('No readable text was found in the uploaded bills.');
  return documents;
}

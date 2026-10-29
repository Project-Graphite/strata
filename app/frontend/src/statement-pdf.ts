import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { tableOf, type PlacedText } from './statement';

GlobalWorkerOptions.workerSrc = worker;

const lineTolerance = 2;
const wordGap = 4;

export async function pdfRows(file: File) {
  const loading = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const lines: PlacedText[][] = [];
  try {
    const pdf = await loading.promise;
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const { items } = await (await pdf.getPage(number)).getTextContent();
      const words = items
        .flatMap((item) => ('str' in item && item.str.trim() ? [{ text: item.str.trim(), x: item.transform[4] as number, y: item.transform[5] as number, width: item.width }] : []))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const pageLines: (typeof words)[] = [];
      for (const word of words) {
        const line = pageLines.find((candidate) => Math.abs(candidate[0]!.y - word.y) <= lineTolerance);
        if (line) line.push(word);
        else pageLines.push([word]);
      }
      for (const line of pageLines) {
        const cells: PlacedText[] = [];
        for (const word of line.sort((a, b) => a.x - b.x)) {
          const last = cells.at(-1);
          if (last && word.x - (last.x + last.width) <= wordGap) {
            last.text = `${last.text} ${word.text}`;
            last.width = word.x + word.width - last.x;
          } else cells.push({ text: word.text, x: word.x, width: word.width });
        }
        lines.push(cells);
      }
    }
  } finally {
    await loading.destroy();
  }
  return tableOf(lines);
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, RenderingCancelledException, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useFileSource } from './file-source';

GlobalWorkerOptions.workerSrc = worker;

const maxPages = 50;

function PdfPage({ document, number, onFail, ratio, root }: { document: PDFDocumentProxy; number: number; onFail: () => void; ratio: number; root: HTMLElement | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { root, rootMargin: '100% 0px' });
    observer.observe(canvas.current!);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const element = canvas.current!;
    if (!visible) return;
    let task: RenderTask | undefined;
    let cancelled = false;
    document
      .getPage(number)
      .then((page) => {
        if (cancelled) return;
        const viewport = page.getViewport({ scale: (element.clientWidth / page.getViewport({ scale: 1 }).width) * Math.min(2, window.devicePixelRatio || 1) });
        element.width = viewport.width;
        element.height = viewport.height;
        task = page.render({ canvas: element, viewport });
        return task.promise;
      })
      .catch((error: unknown) => {
        if (!(error instanceof RenderingCancelledException)) onFail();
      });
    return () => {
      cancelled = true;
      task?.cancel();
      element.width = 0;
      element.height = 0;
    };
  }, [document, number, onFail, visible]);

  return <canvas aria-label={`Page ${number}`} className="note-pdf-page" ref={canvas} role="img" style={{ aspectRatio: ratio }} />;
}

export default function PdfViewer({ fileId, name }: { fileId: string; name: string }) {
  const load = useFileSource();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [opened, setOpened] = useState<{ document: PDFDocumentProxy; ratio: number }>();
  const [failed, setFailed] = useState(false);
  const fail = useCallback(() => setFailed(true), []);

  useEffect(() => {
    let cancelled = false;
    let loading: PDFDocumentLoadingTask | undefined;
    load(fileId)
      .then(async (blob) => {
        if (cancelled) return;
        loading = getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const document = await loading.promise;
        const first = (await document.getPage(1)).getViewport({ scale: 1 });
        if (!cancelled) setOpened({ document, ratio: first.width / first.height });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      void loading?.destroy();
    };
  }, [fileId, load]);

  if (failed) return <p className="m-0 text-small text-muted">This PDF cannot be shown here. Download it to read it.</p>;
  if (!opened) return <span aria-hidden="true" className="skeleton block h-64 w-full" />;
  const shown = Math.min(opened.document.numPages, maxPages);
  return (
    <section aria-label={`Preview of ${name}`} className="note-pdf">
      <div className="note-pdf-pages" ref={setRoot}>
        {Array.from({ length: shown }, (_, index) => (
          <PdfPage document={opened.document} key={index} number={index + 1} onFail={fail} ratio={opened.ratio} root={root} />
        ))}
      </div>
      <p className="m-0 text-small text-muted">
        {opened.document.numPages === 1 ? '1 page' : `${opened.document.numPages} pages`}
        {opened.document.numPages > maxPages ? `. Showing the first ${maxPages}; download the file for the rest.` : ''}
      </p>
    </section>
  );
}

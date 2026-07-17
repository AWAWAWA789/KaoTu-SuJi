import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { Button, Card } from '@/components/ui';
import { type Density, DENSITIES } from '@kaotu/shared';
import { slotSizeMm } from '@kaotu/shared/print';

export function PrintPage() {
  const [sp] = useSearchParams();
  const cardSetId = sp.get('set') ?? '';
  const [density, setDensity] = useState<Density>('8');
  const layout = trpc.print.layout.useQuery(
    { cardSetId, density },
    { enabled: !!cardSetId },
  );
  const exportPdf = trpc.print.exportPdf.useMutation();

  const [pdfData, setPdfData] = useState<{ base64: string; filename: string } | null>(null);

  useEffect(() => {
    setPdfData(null);
  }, [density, cardSetId]);

  const cols = density === '4' ? 2 : density === '8' ? 2 : density === '16' ? 4 : 4;

  const doExport = async () => {
    const res = await exportPdf.mutateAsync({ cardSetId, density });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setPdfData({ base64: res.base64, filename: res.filename });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <div className="flex gap-1">
          {DENSITIES.map((d) => (
            <DensityButton key={d} density={d} active={density === d} onClick={() => setDensity(d)} />
          ))}
        </div>
        <Button variant="secondary" onClick={() => window.print()}>浏览器打印</Button>
        <Button onClick={doExport} disabled={!cardSetId || exportPdf.isPending}>
          {exportPdf.isPending ? '导出中…' : '导出 PDF'}
        </Button>
        {pdfData && (
          <a
            className="btn-secondary text-xs"
            href={`data:application/pdf;base64,${pdfData.base64}`}
            download={pdfData.filename}
          >
            下载 {pdfData.filename}
          </a>
        )}
      </div>

      {layout.data?.overflowed && (
        <Card className="border-red-300 bg-red-50 no-print">
          <div className="text-sm text-red-700">
            <strong>溢出警告：</strong>
            {layout.data.warnings.map((w, i) => (
              <p key={i}>⚠ {w}</p>
            ))}
            {layout.data.suggestedDensity && (
              <Button
                className="mt-2"
                onClick={() => setDensity(layout.data!.suggestedDensity!)}
              >
                切换到 {layout.data.suggestedDensity} 等分
              </Button>
            )}
          </div>
        </Card>
      )}

      {!cardSetId && <p className="text-slate-500">请从工作台选择卡片组进入打印</p>}
      {layout.isLoading && <p className="text-slate-500">加载中…</p>}

      {layout.data && (
        <div className="print-area">
          {layout.data.pages.map((page) => (
            <div
              key={page.index}
              className="bg-white mx-auto mb-4 print:mb-0"
              style={{
                width: '210mm',
                minHeight: '297mm',
                padding: '10mm',
                display: 'grid',
                gridTemplateColumns: `repeat(${cols}, 1fr)`,
                gap: 0,
              }}
            >
              {page.slots.map((s) => {
                const sz = slotSizeMm(density);
                return (
                  <div
                    key={s.cardId}
                    className="border border-slate-400 p-2 overflow-hidden flex flex-col"
                    style={{ width: `${sz.w}mm`, height: `${sz.h}mm`, fontSize: `${s.fontSize}pt` }}
                  >
                    <div className="font-semibold text-slate-900">{s.front}</div>
                    <div className="text-slate-600 mt-1 border-t border-dashed border-slate-300 pt-1">
                      {s.back}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DensityButton({
  density,
  active,
  onClick,
}: {
  density: Density;
  active: boolean;
  onClick: () => void;
}) {
  const cols = density === '4' ? 2 : density === '8' ? 2 : density === '16' ? 4 : 4;
  const rows =
    density === '4' ? 2 : density === '8' ? 4 : density === '16' ? 4 : 8;
  return (
    <button
      className={`flex flex-col items-center px-3 py-2 rounded-md border ${
        active ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-slate-300'
      }`}
      onClick={onClick}
      title={`${density} 等分`}
    >
      <div
        className="grid gap-0.5 mb-1"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, width: 18, height: 18 }}
      >
        {Array.from({ length: Number(density) }, (_, i) => (
          <div key={i} className={`border ${active ? 'border-white' : 'border-slate-500'}`} />
        ))}
        {/* 占位保证 rows */}
        {Array.from({ length: Math.max(0, cols * rows - Number(density)) }, (_, i) => (
          <div key={`pad-${i}`} className="opacity-0" />
        ))}
      </div>
      <span className="text-xs">{density}</span>
    </button>
  );
}

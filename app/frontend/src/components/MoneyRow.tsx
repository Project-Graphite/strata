import type { ReactNode } from 'react';
import { RowText } from './RowText';

export function MoneyRow({
  amount,
  children,
  detail,
  meter,
  onOpen,
  title,
}: {
  amount?: ReactNode;
  children?: ReactNode;
  detail?: ReactNode;
  meter?: ReactNode;
  onOpen?: () => void;
  title: ReactNode;
}) {
  const line = (
    <>
      {onOpen ? (
        <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left" onClick={onOpen} type="button">
          <RowText detail={detail} title={title} />
          {amount}
        </button>
      ) : (
        <>
          <RowText detail={detail} title={title} />
          {amount}
        </>
      )}
      {children}
    </>
  );
  const hover = onOpen ? 'hover:bg-line-soft' : '';
  return meter ? (
    <li className={`panel-row grid gap-2 ${hover}`}>
      <span className="flex items-center gap-3">{line}</span>
      {meter}
    </li>
  ) : (
    <li className={`panel-row flex items-center gap-3 ${hover}`}>{line}</li>
  );
}

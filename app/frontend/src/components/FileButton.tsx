import { useRef } from 'react';
import { Button } from '@project-graphite/ui';

export function FileButton({
  accept,
  busy = false,
  folder = false,
  inputLabel,
  label,
  large = false,
  multiple = false,
  onFiles,
  primary = false,
}: {
  accept?: string;
  busy?: boolean;
  folder?: boolean;
  inputLabel?: string;
  label: string;
  large?: boolean;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  primary?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button className="w-fit shrink-0" disabled={busy} icon="upload" onClick={() => input.current?.click()} size={large ? 'medium' : 'small'} variant={primary ? 'primary' : 'secondary'}>
        {label}
      </Button>
      <input
        accept={accept}
        aria-label={inputLabel}
        className="sr-only"
        disabled={busy}
        multiple={multiple}
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          if (files.length) onFiles(files);
        }}
        ref={input}
        tabIndex={-1}
        type="file"
        {...(folder ? { webkitdirectory: '' } : {})}
      />
    </>
  );
}

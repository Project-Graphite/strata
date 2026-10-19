import { Button } from '@project-graphite/ui';

export function FileButton({
  accept,
  busy = false,
  folder = false,
  inputLabel,
  label,
  multiple = false,
  onFiles,
  primary = false,
}: {
  accept?: string;
  busy?: boolean;
  folder?: boolean;
  inputLabel?: string;
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  primary?: boolean;
}) {
  return (
    <Button className="w-fit shrink-0" component="label" disabled={busy} icon="upload" size="small" variant={primary ? 'primary' : 'secondary'}>
      {label}
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
        type="file"
        {...(folder ? { webkitdirectory: '' } : {})}
      />
    </Button>
  );
}

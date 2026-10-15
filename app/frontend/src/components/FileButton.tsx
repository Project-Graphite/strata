import { Icon } from '@project-graphite/ui';

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
    <label className={`${primary ? 'primary-button' : 'secondary-button'} px-3 py-2 text-sm ${busy ? 'pointer-events-none opacity-60' : ''}`}>
      <Icon name="upload" size={16} />
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
    </label>
  );
}

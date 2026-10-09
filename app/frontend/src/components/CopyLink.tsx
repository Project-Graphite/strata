export function CopyLink({ link }: { link: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="mono-sm break-all text-ink">{link}</code>
      <button className="secondary-button px-3 py-2 text-sm" onClick={() => void navigator.clipboard.writeText(link)} type="button">
        Copy link
      </button>
    </div>
  );
}

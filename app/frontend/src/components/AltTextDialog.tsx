import { TextField } from '@project-graphite/ui';
import { FormDialog } from './FormDialog';

export function AltTextDialog({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (alt: string) => void }) {
  return (
    <FormDialog
      busy={false}
      busyLabel=""
      onClose={onClose}
      onSubmit={(form) => {
        onSave(String(new FormData(form).get('alt')).trim());
        onClose();
      }}
      submitLabel="Save description"
      title="Describe this image"
    >
      <TextField autoFocus defaultValue={initial} label="Description" maxLength={500} name="alt" />
    </FormDialog>
  );
}

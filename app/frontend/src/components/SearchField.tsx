import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { Icon } from '@project-graphite/ui';

export function SearchField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <TextField
      autoComplete="off"
      className="search-field"
      hiddenLabel
      onChange={(event) => onChange(event.currentTarget.value)}
      placeholder={label}
      size="small"
      slotProps={{
        htmlInput: { 'aria-label': label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Icon name="search" size={16} />
            </InputAdornment>
          ),
        },
      }}
      type="search"
      value={value}
    />
  );
}

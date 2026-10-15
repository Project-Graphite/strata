export interface WidgetProps {
  settings: Record<string, unknown>;
}

export interface SettingsProps extends WidgetProps {
  onChange: (settings: Record<string, unknown>) => void;
}

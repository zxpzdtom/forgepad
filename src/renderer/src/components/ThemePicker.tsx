import { useTranslation } from '@renderer/i18n';
import { Monitor, Moon, Sun } from 'lucide-react';

import { SegmentedControl } from './SegmentedControl';

/**
 * Reusable theme picker with Follow / Dark / Light options.
 *
 * - `includeSystem`: show "System" instead of "Follow" and use value "system"
 *   (for the app-level theme which supports media-query matching).
 * - Without `includeSystem`: show "Follow" with value "follow"
 *   (for per-panel overrides that can defer to the app theme).
 */

type AppThemeValue = 'dark' | 'light' | 'system';
type OverrideThemeValue = 'follow' | 'dark' | 'light';

type ThemePickerProps =
  | {
      value: AppThemeValue;
      onChange: (v: AppThemeValue) => void;
      label: string;
      includeSystem: true;
    }
  | {
      value: OverrideThemeValue;
      onChange: (v: OverrideThemeValue) => void;
      label: string;
      includeSystem?: false;
    };

export function ThemePicker(props: ThemePickerProps) {
  const { t } = useTranslation();

  if (props.includeSystem) {
    return (
      <SegmentedControl
        value={props.value}
        label={props.label}
        options={[
          { value: 'dark' as const, label: t('themePicker.dark'), icon: <Moon size={12} /> },
          { value: 'light' as const, label: t('themePicker.light'), icon: <Sun size={12} /> },
          {
            value: 'system' as const,
            label: t('themePicker.system'),
            icon: <Monitor size={12} />,
          },
        ]}
        onChange={props.onChange}
      />
    );
  }

  return (
    <SegmentedControl
      value={props.value}
      label={props.label}
      options={[
        {
          value: 'follow' as const,
          label: t('common.follow'),
          icon: <Monitor size={12} />,
        },
        { value: 'dark' as const, label: t('themePicker.dark'), icon: <Moon size={12} /> },
        { value: 'light' as const, label: t('themePicker.light'), icon: <Sun size={12} /> },
      ]}
      onChange={props.onChange}
    />
  );
}

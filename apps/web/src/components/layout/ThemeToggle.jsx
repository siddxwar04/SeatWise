import { useTheme } from '../../context/ThemeContext.jsx';
import { Icon } from '../ui/Icon.jsx';

const NEXT_LABEL = { light: 'dark', dark: 'system', system: 'light' };
const ICON = { light: 'sun', dark: 'moon', system: 'gauge' };

/**
 * One control, three states: light → dark → follow system.
 *
 * The accessible name says what pressing it will *do*, not what it currently is —
 * "Switch to dark theme" — because a button announced as "light theme" leaves a
 * screen-reader user guessing whether that is the current state or the action.
 */
export function ThemeToggle() {
  const { preference, cycle } = useTheme();

  return (
    <button
      type="button"
      className="theme_toggle"
      onClick={cycle}
      aria-label={`Theme: ${preference}. Switch to ${NEXT_LABEL[preference]}.`}
      title={`Theme: ${preference}`}
    >
      <Icon name={ICON[preference]} />
    </button>
  );
}

/** The two catalog display modes the user can choose between. */
export type ViewMode = 'table' | 'gallery';

interface Props {
  /** Currently active mode. */
  mode: ViewMode;
  /** Called when the user clicks a tab. */
  onChange: (mode: ViewMode) => void;
}

/**
 * Two-tab switcher for picking the catalog's display mode.
 *
 * - "Table view"   — paginated rows with expandable details.
 * - "Gallery view" — infinite-scrolling card grid.
 *
 * Controlled component: App owns the state and passes it in along with
 * a setter. We deliberately don't read or write anything else, so
 * switching modes does not disturb each view's internal scroll/page
 * state. The view that's not currently mounted is unmounted (no
 * display:none shenanigans), so on remount it builds fresh state from
 * the current generation params — which is exactly what we want when
 * params change while the user is looking at the other view.
 */
export default function ViewModeSwitcher({ mode, onChange }: Props) {
  return (
    <div
      className="view-mode-switcher"
      role="tablist"
      aria-label="Catalog view mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'table'}
        className={`view-mode-switcher__tab${mode === 'table' ? ' is-active' : ''}`}
        onClick={() => onChange('table')}
      >
        Table view
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'gallery'}
        className={`view-mode-switcher__tab${mode === 'gallery' ? ' is-active' : ''}`}
        onClick={() => onChange('gallery')}
      >
        Gallery view
      </button>
    </div>
  );
}
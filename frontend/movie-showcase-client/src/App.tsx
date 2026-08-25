import { useState } from 'react';
import { GenerationParamsProvider } from './state/GenerationParamsContext';
import Toolbar from './components/Toolbar';
import TableView from './components/TableView';
import GalleryView from './components/GalleryView';
import ViewModeSwitcher, { type ViewMode } from './components/ViewModeSwitcher';

/**
 * Root component. Wraps the tree in <GenerationParamsProvider> so any
 * descendant (Toolbar, TableView, GalleryView) can read and mutate the
 * shared generation parameters without prop-drilling.
 *
 * Owns one piece of *local* UI state: which catalog view is currently
 * shown. When the user switches modes the other view is unmounted (we
 * don't render it in a hidden container); remounting it builds fresh
 * state from the current generation params, which is the behaviour the
 * spec calls out ("switching modes does NOT need to reset the OTHER
 * view's state … just don't crash or show stale data").
 */
export default function App() {
  const [mode, setMode] = useState<ViewMode>('table');

  return (
    <GenerationParamsProvider>
      <main>
        <h1>Movie Showcase</h1>
        <Toolbar />
        <ViewModeSwitcher mode={mode} onChange={setMode} />
        {mode === 'table' ? <TableView /> : <GalleryView />}
      </main>
    </GenerationParamsProvider>
  );
}
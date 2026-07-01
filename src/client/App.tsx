import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Setup } from './pages/Setup';
import styles from './App.module.css';

type View = 'dashboard' | 'agents' | 'setup';

export function App() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={`${styles.brand} brand-glyph`}>◈ Yatagarasu</div>
        <nav className={styles.nav}>
          <button
            className={view === 'dashboard' ? styles.activeTab : styles.tab}
            onClick={() => setView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={view === 'agents' ? styles.activeTab : styles.tab}
            onClick={() => setView('agents')}
          >
            Agents
          </button>
          <button
            className={view === 'setup' ? styles.activeTab : styles.tab}
            onClick={() => setView('setup')}
          >
            Setup
          </button>
        </nav>
      </header>
      <main className={styles.main}>
        {view === 'dashboard' && <Dashboard />}
        {view === 'agents' && <Agents />}
        {view === 'setup' && <Setup />}
      </main>
    </div>
  );
}

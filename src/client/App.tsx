import { useState } from 'react';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import styles from './App.module.css';

type View = 'dashboard' | 'agents';

export function App() {
  const [view, setView] = useState<View>('dashboard');

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>◈ Yatagarasu</div>
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
        </nav>
      </header>
      <main className={styles.main}>
        {view === 'dashboard' ? <Dashboard /> : <Agents />}
      </main>
    </div>
  );
}

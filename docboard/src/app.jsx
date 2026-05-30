import Router from 'preact-router';
import { useEffect } from 'preact/hooks';
import BottomNav from './components/BottomNav';
import Calendar from './views/Calendar';
import DayDetail from './views/DayDetail';
import SurgeryList from './views/SurgeryList';
import SurgeryForm from './views/SurgeryForm';
import SurgeryDetail from './views/SurgeryDetail';
import Notifications from './views/Notifications';
import Settings from './views/Settings';
import Analytics from './views/Analytics';
import ORBoard from './views/ORBoard';
import KnowledgeSpace from './views/KnowledgeSpace';
import CommandDashboard from './views/CommandDashboard';
import Login from './views/Login';
import { initAuth, isLoggedIn, isLoading } from './stores/auth';
import { startUnreadPolling, stopUnreadPolling } from './stores/notifications';
import { queueCount, syncState } from './services/api';
import { signal } from '@preact/signals';

export const currentUrl = signal(typeof window !== 'undefined' ? window.location.pathname : '/docboard/');

function handleRoute(e) {
  currentUrl.value = e.url;
}

export default function App() {
  useEffect(() => {
    initAuth();
  }, []);

  // Start polling unread count when logged in
  useEffect(() => {
    if (isLoggedIn.value) {
      startUnreadPolling();
    } else {
      stopUnreadPolling();
    }
    return () => stopUnreadPolling();
  }, [isLoggedIn.value]);

  if (isLoading.value) {
    return (
      <div class="app-loading">
        <div class="spinner" />
      </div>
    );
  }

  if (!isLoggedIn.value) {
    return <Login />;
  }

  return (
    <div class="app-shell">
      {queueCount.value > 0 && (
        <div class={`offline-banner ${syncState.value === 'conflict' ? 'conflict' : ''}`}>
          {syncState.value === 'syncing' ? 'Menyinkronkan...' :
           syncState.value === 'conflict' ? `${queueCount.value} item konflik` :
           `${queueCount.value} perubahan menunggu sync`}
        </div>
      )}
      <main class="app-content">
        <Router onChange={handleRoute}>
          <Calendar path="/docboard/" />
          <DayDetail path="/docboard/day/:date" />
          <SurgeryList path="/docboard/surgery" />
          <SurgeryForm path="/docboard/surgery/new" />
          <SurgeryForm path="/docboard/surgery/edit/:id" />
          <SurgeryDetail path="/docboard/surgery/:id" />
          <Notifications path="/docboard/notifications" />
          <ORBoard path="/docboard/or-board" />
          <CommandDashboard path="/docboard/command" />
          <KnowledgeSpace path="/docboard/scientific" space="ilmiah" />
          <KnowledgeSpace path="/docboard/personal" space="pribadi" />
          <Analytics path="/docboard/analytics" />
          <Settings path="/docboard/settings" />
          <Calendar default />
        </Router>
      </main>
      <BottomNav />
    </div>
  );
}

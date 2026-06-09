import Router from 'preact-router';
import { useEffect } from 'preact/hooks';
import BottomNav from './components/BottomNav';
import Calendar from './views/Calendar';
import DayDetail from './views/DayDetail';
import SurgeryList from './views/SurgeryList';
import SurgeryForm from './views/SurgeryForm';
import SurgeryDetail from './views/SurgeryDetail';
import OperationDataList from './views/OperationDataList';
import OperationDataDetail from './views/OperationDataDetail';
import Notifications from './views/Notifications';
import Settings from './views/Settings';
import Analytics from './views/Analytics';
import SpaceSchedule from './views/SpaceSchedule';
import CommandDashboard from './views/CommandDashboard';
import Login from './views/Login';
import Confidential from './views/Confidential';
import { initAuth, isLoggedIn, isLoading, user } from './stores/auth';
import { startUnreadPolling, stopUnreadPolling } from './stores/notifications';
import { queueCount, syncState } from './services/api';
import { isNandaUser } from './utils/access';
import { signal } from '@preact/signals';

export const currentUrl = signal(typeof window !== 'undefined' ? window.location.pathname : '/docboard/');

function handleRoute(e) {
  currentUrl.value = e.url;
}

function NandaOnlyRoute({ component: Component, ...props }) {
  return isNandaUser(user.value) ? <Component {...props} /> : <Confidential />;
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
          <NandaOnlyRoute path="/docboard/data" component={OperationDataList} />
          <NandaOnlyRoute path="/docboard/data/:id" component={OperationDataDetail} />
          <Notifications path="/docboard/notifications" />
          <CommandDashboard path="/docboard/command" />
          <NandaOnlyRoute path="/docboard/scientific" component={SpaceSchedule} space="ilmiah" />
          <SpaceSchedule path="/docboard/procedures" space="tindakan" />
          <NandaOnlyRoute path="/docboard/personal" component={SpaceSchedule} space="pribadi" />
          <Analytics path="/docboard/analytics" />
          <Settings path="/docboard/settings" />
          <Settings path="/docboard/settings/preferences" mode="preferences" />
          <Calendar default />
        </Router>
      </main>
      <BottomNav />
    </div>
  );
}

import Router from 'preact-router';
import { useEffect } from 'preact/hooks';
import BottomNav from './components/BottomNav';
import Calendar from './views/Calendar';
import DayDetail from './views/DayDetail';
import Patients from './views/Patients';
import Notifications from './views/Notifications';
import Settings from './views/Settings';
import Login from './views/Login';
import { initAuth, isLoggedIn, isLoading } from './stores/auth';
import { signal } from '@preact/signals';

export const currentUrl = signal(typeof window !== 'undefined' ? window.location.pathname : '/docboard/');

function handleRoute(e) {
  currentUrl.value = e.url;
}

export default function App() {
  useEffect(() => {
    initAuth();
  }, []);

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
      <main class="app-content">
        <Router onChange={handleRoute}>
          <Calendar path="/docboard/" />
          <DayDetail path="/docboard/day/:date" />
          <Patients path="/docboard/patients" />
          <Notifications path="/docboard/notifications" />
          <Settings path="/docboard/settings" />
          <Calendar default />
        </Router>
      </main>
      <BottomNav />
    </div>
  );
}

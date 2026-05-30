import { currentUrl } from '../app';
import { unreadCount } from '../stores/notifications';

const tabs = [
  { path: '/docboard/', icon: 'calendar', label: 'Jadwal' },
  { path: '/docboard/surgery', icon: 'surgery', label: 'Operasi' },
  { path: '/docboard/or-board', icon: 'orboard', label: 'OR Board' },
  { path: '/docboard/scientific', icon: 'book', label: 'Ilmiah' },
  { path: '/docboard/personal', icon: 'personal', label: 'Pribadi' },
  { path: '/docboard/notifications', icon: 'bell', label: 'Notif', badge: true },
  { path: '/docboard/settings', icon: 'menu', label: 'Lainnya' }
];

const icons = {
  calendar: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  surgery: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
      <path d="M12 14v4M10 16h4" />
    </svg>
  ),
  orboard: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <path d="M2 9h20" /><path d="M9 3v18" />
    </svg>
  ),
  bell: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  book: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  ),
  personal: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <path d="M12 17.5 5.5 21l1.2-7.2L1.5 8.7l7.2-1L12 1l3.3 6.7 7.2 1-5.2 5.1 1.2 7.2z" />
    </svg>
  ),
  menu: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
    </svg>
  )
};

export default function BottomNav() {
  const url = currentUrl.value;

  return (
    <nav class="bottom-nav">
      {tabs.map(tab => {
        const isActive = tab.path === '/docboard/'
          ? (url === '/docboard/' || url === '/docboard')
          : url.startsWith(tab.path);
        return (
          <a
            key={tab.path}
            href={tab.path}
            class={`bottom-nav-item ${isActive ? 'active' : ''}`}
          >
            <span class="bottom-nav-icon">
              {icons[tab.icon]}
              {tab.badge && unreadCount.value > 0 && (
                <span class="nav-badge">
                  {unreadCount.value > 99 ? '99+' : unreadCount.value}
                </span>
              )}
            </span>
            <span class="bottom-nav-label">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

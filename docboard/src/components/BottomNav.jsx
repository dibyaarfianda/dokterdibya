import { currentUrl } from '../app';

const tabs = [
  { path: '/docboard/', icon: 'calendar', label: 'Jadwal' },
  { path: '/docboard/surgery', icon: 'surgery', label: 'Operasi' },
  { path: '/docboard/notifications', icon: 'bell', label: 'Notif' },
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
  bell: (
    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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
            <span class="bottom-nav-icon">{icons[tab.icon]}</span>
            <span class="bottom-nav-label">{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

import { SYNC_STATUS } from '../utils/constants';
import { relativeTime } from '../utils/date';

export default function SyncBadge({ status, lastSynced, onSync, syncing }) {
  const info = SYNC_STATUS[status] || SYNC_STATUS.pending;

  return (
    <div class="sync-badge-full">
      <span class="sync-indicator" style={{ backgroundColor: info.color }} />
      <div class="sync-text">
        <span class="sync-label">{info.label}</span>
        {lastSynced && <span class="sync-time">{relativeTime(lastSynced)}</span>}
      </div>
      {onSync && (
        <button
          class="sync-btn"
          onClick={onSync}
          disabled={syncing}
        >
          <svg
            class={syncing ? 'spinning' : ''}
            width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2"
          >
            <polyline points="23,4 23,10 17,10" />
            <polyline points="1,20 1,14 7,14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      )}
    </div>
  );
}

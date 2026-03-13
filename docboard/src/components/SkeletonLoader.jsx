export function SkeletonCard({ lines = 3 }) {
  return (
    <div class="skeleton-card">
      <div class="skeleton-line skeleton-title" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <div key={i} class="skeleton-line" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCalendar() {
  return (
    <div class="skeleton-calendar">
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} class="skeleton-cell" />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 4 }) {
  return (
    <div class="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={2} />
      ))}
    </div>
  );
}

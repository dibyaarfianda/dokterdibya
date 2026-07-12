import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { api } from '../services/api';

function getInitials(name) {
  return String(name || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const result = await api.getUsers();
      setUsers(Array.isArray(result.users) ? result.users : []);
    } catch (err) {
      setError(err.message || 'Gagal memuat daftar pengguna');
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter(item => `${item.name || ''} ${item.role || ''}`.toLowerCase().includes(keyword));
  }, [search, users]);

  return (
    <div class="view-users">
      <div class="view-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button class="btn-back" aria-label="Kembali" onClick={() => route('/docboard/settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15,18 9,12 15,6" />
            </svg>
          </button>
          <div>
            <h1>Pengguna</h1>
            {!loading && <p class="users-subtitle">{users.length} akun staff</p>}
          </div>
        </div>
      </div>

      <div class="users-search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          value={search}
          onInput={event => setSearch(event.currentTarget.value)}
          placeholder="Cari pengguna"
          aria-label="Cari pengguna"
        />
      </div>

      {loading ? (
        <div class="loading-state"><div class="spinner" /></div>
      ) : error ? (
        <div class="error-state">
          <p>{error}</p>
          <button class="btn-secondary" onClick={loadUsers}>Coba Lagi</button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div class="empty-state">
          <p>{search ? 'Pengguna tidak ditemukan' : 'Belum ada pengguna staff'}</p>
        </div>
      ) : (
        <div class="docboard-user-list">
          {filteredUsers.map(item => (
            <div class="docboard-user-card" key={item.id}>
              <div class="docboard-user-avatar">{getInitials(item.name)}</div>
              <div class="docboard-user-info">
                <div class="docboard-user-name">{item.name}</div>
                <div class="docboard-user-role">{item.role}</div>
              </div>
              <span class={`docboard-user-status ${item.is_active ? 'active' : 'inactive'}`}>
                {item.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

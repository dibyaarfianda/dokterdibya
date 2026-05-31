import { useState } from 'preact/hooks';
import { login } from '../stores/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <img
              src="/docboard/icons/docboardlogo.svg"
              alt="DocBoard logo"
              class="login-logo-image"
            />
          </div>
          <p class="login-subtitle">Database and Scheduler</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div class="login-error">{error}</div>}

          <div class="form-group">
            <label for="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onInput={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onInput={e => setPassword(e.target.value)}
              placeholder="Password"
              required
              autocomplete="current-password"
            />
          </div>

          <button type="submit" class="btn-primary btn-full" disabled={loading}>
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}

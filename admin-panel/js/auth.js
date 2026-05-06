/**
 * auth.js — Aria Admin Panel Authentication
 * Simple session-based auth guard using sessionStorage.
 */

const ADMIN_CREDENTIALS = {
  email: 'admin@aria.com',
  password: 'admin123',
};

const SESSION_KEY = 'aria_admin_session';

export const Auth = {
  /** Check if admin is logged in */
  isLoggedIn() {
    return sessionStorage.getItem(SESSION_KEY) === 'true';
  },

  /** Attempt login. Returns true on success. */
  login(email, password) {
    if (
      email.trim().toLowerCase() === ADMIN_CREDENTIALS.email &&
      password === ADMIN_CREDENTIALS.password
    ) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      sessionStorage.setItem('aria_admin_email', email);
      return true;
    }
    return false;
  },

  /** Log out and redirect to login */
  logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem('aria_admin_email');
    window.location.href = 'index.html';
  },

  /** Get admin email */
  getEmail() {
    return sessionStorage.getItem('aria_admin_email') || 'admin@aria.com';
  },

  /**
   * Guard: call at top of every protected page.
   * Redirects to login if not authenticated.
   */
  guard() {
    if (!this.isLoggedIn()) {
      window.location.href = 'index.html';
    }
  },
};

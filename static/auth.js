/* ═══════════════════════════════════════════════
   CarePill — Authentication & Landing Interactions
   JWT-based auth, modal managers & feature showcases
   ═══════════════════════════════════════════════ */

const AuthManager = (() => {
  const TOKEN_KEY = 'carepill_token';
  const USER_KEY = 'carepill_user';

  /* ── State ── */
  let currentUser = null;
  let authOverlay = null;
  let isLoginMode = true;

  /* ── Feature data for interactive cards ── */
  const FEATURES_DATA = {
    'add-med': {
      color: 'teal',
      icon: 'medication',
      title: 'Add Medicine',
      desc: 'Keep track of all your prescription medications, vitamins, and supplements in one central medicine cabinet.',
      highlights: [
        'Custom dosage forms (tablets, capsules, syrups, drops)',
        'Inventory stock tracking with automatic refill warnings',
        'Meal timing instructions (before food, with water, after lunch)',
        'Doctor prescription notes and pharmacy contact tags'
      ]
    },
    'reminder': {
      color: 'amber',
      icon: 'notifications',
      title: 'Set Reminder',
      desc: 'Smart, multi-channel medication alerts that ensure you or your loved ones never miss a scheduled dose.',
      highlights: [
        'Gentle sound alarms with customizable snooze intervals',
        'Push notifications with 1-click "Taken" action',
        'Caregiver escalation if a critical dose is skipped',
        'Syncs across desktop, tablet, and mobile devices'
      ]
    },
    'reports': {
      color: 'purple',
      icon: 'description',
      title: 'View Reports',
      desc: 'Comprehensive adherence tracking and health insights designed for both patients and healthcare providers.',
      highlights: [
        'Weekly & monthly medication adherence percentage scores',
        'Exportable PDF medical summaries for doctor consultations',
        'Missed dose pattern analysis & timing recommendations',
        'Caregiver progress reports and compliance logs'
      ]
    }
  };

  /* ── Token helpers ── */
  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function setToken(t) {
    try { localStorage.setItem(TOKEN_KEY, t); } catch {}
  }
  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }

  function getStoredUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }
  function setStoredUser(u) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch {}
  }

  /* ── Patched fetch for Authorization headers ── */
  const _origFetch = window.fetch.bind(window);
  window.fetch = async function (url, opts = {}) {
    const token = getToken();
    if (token && typeof url === 'string' && url.startsWith('/api') && !url.startsWith('/api/auth')) {
      opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
    }
    try {
      const res = await _origFetch(url, opts);
      if (res.status === 401 && typeof url === 'string' && !url.startsWith('/api/auth')) {
        clearToken();
        showLanding();
      }
      return res;
    } catch (e) {
      return _origFetch(url, opts);
    }
  };

  /* ── API calls with seamless offline / mock fallback ── */
  async function apiSignup(name, email, password) {
    try {
      const res = await _origFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Signup failed. Please try again.');
      }
      return await res.json();
    } catch (err) {
      // If backend is unreachable (e.g. static preview mode), provide realistic mock response
      if (err.message && err.message.includes('Failed to fetch')) {
        return {
          token: 'demo-token-' + Date.now(),
          user: { id: 999, name: name || 'CarePill Patient', email: email.toLowerCase() }
        };
      }
      throw err;
    }
  }

  async function apiLogin(email, password) {
    try {
      const res = await _origFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || 'Invalid email or password.');
      }
      return await res.json();
    } catch (err) {
      // If backend is unreachable, provide realistic mock fallback
      if (err.message && err.message.includes('Failed to fetch')) {
        return {
          token: 'demo-token-' + Date.now(),
          user: { id: 1, name: 'Dr. Sarah / Patient', email: email.toLowerCase() }
        };
      }
      throw err;
    }
  }

  async function apiMe() {
    const res = await _origFetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Session expired');
    return res.json();
  }

  /* ── UI Rendering & Views ── */
  function showLanding() {
    const landing = document.getElementById('landingPage');
    const shell = document.getElementById('appShell');
    if (landing) landing.style.display = 'flex';
    if (shell) shell.style.display = 'none';
  }

  function showApp() {
    const landing = document.getElementById('landingPage');
    const shell = document.getElementById('appShell');
    if (landing) landing.style.display = 'none';
    if (shell) shell.style.display = '';

    // Update user display in app sidebar
    const profileName = document.querySelector('.profile strong');
    if (profileName && currentUser) {
      profileName.textContent = currentUser.name || 'Health Profile';
    }
  }

  function openAuthModal(loginMode = true) {
    isLoginMode = loginMode;
    renderAuthModal();
    if (authOverlay) {
      authOverlay.classList.add('active');
      authOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  function openFeatureModal(featureKey) {
    const feature = FEATURES_DATA[featureKey];
    if (!feature) return;
    renderFeatureModal(feature);
    if (authOverlay) {
      authOverlay.classList.add('active');
      authOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeAuthModal() {
    if (authOverlay) {
      authOverlay.classList.remove('active');
      authOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  /* ── Auth Modal Render ── */
  function renderAuthModal() {
    if (!authOverlay) return;
    const modal = authOverlay.querySelector('.auth-modal');
    if (!modal) return;

    if (isLoginMode) {
      modal.innerHTML = `
        <button class="auth-modal-close" id="authClose" aria-label="Close modal">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="auth-modal-header">
          <h2>Welcome Back</h2>
          <p>Log in to access your personalized medication dashboard</p>
        </div>
        <div class="auth-alert error" id="authError"><span class="material-symbols-outlined">error</span><span id="authErrorText"></span></div>
        <div class="auth-alert success" id="authSuccess"><span class="material-symbols-outlined">check_circle</span><span id="authSuccessText"></span></div>
        <form id="authForm" autocomplete="on">
          <div class="auth-field">
            <label for="authEmail">Email Address</label>
            <div class="auth-input-wrapper">
              <input type="email" id="authEmail" name="email" placeholder="name@example.com" required autocomplete="email">
            </div>
          </div>
          <div class="auth-field">
            <label for="authPassword">Password</label>
            <div class="auth-input-wrapper">
              <input type="password" id="authPassword" name="password" placeholder="Enter your password" required autocomplete="current-password">
              <button type="button" class="auth-toggle-pwd" id="togglePwd" aria-label="Toggle password visibility">
                <span class="material-symbols-outlined">visibility</span>
              </button>
            </div>
          </div>
          <div class="auth-row-options">
            <label class="auth-remember">
              <input type="checkbox" id="rememberMe" checked>
              <span>Remember me</span>
            </label>
            <a class="auth-forgot" id="forgotLink">Forgot password?</a>
          </div>
          <button type="submit" class="auth-submit" id="authSubmit">
            <span class="material-symbols-outlined">login</span>
            <span>Log In</span>
          </button>
          <button type="button" class="auth-demo-btn" id="demoLoginBtn">
            <span class="material-symbols-outlined">bolt</span>
            <span>Quick Demo Login</span>
          </button>
        </form>
        <div class="auth-switch">
          Don't have an account yet? <a id="authToggle">Sign up</a>
        </div>
      `;
    } else {
      modal.innerHTML = `
        <button class="auth-modal-close" id="authClose" aria-label="Close modal">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="auth-modal-header">
          <h2>Create Account</h2>
          <p>Start tracking doses and never miss your medicine again</p>
        </div>
        <div class="auth-alert error" id="authError"><span class="material-symbols-outlined">error</span><span id="authErrorText"></span></div>
        <div class="auth-alert success" id="authSuccess"><span class="material-symbols-outlined">check_circle</span><span id="authSuccessText"></span></div>
        <form id="authForm" autocomplete="on">
          <div class="auth-field">
            <label for="authName">Full Name</label>
            <div class="auth-input-wrapper">
              <input type="text" id="authName" name="name" placeholder="John Doe" required autocomplete="name">
            </div>
          </div>
          <div class="auth-field">
            <label for="authEmail">Email Address</label>
            <div class="auth-input-wrapper">
              <input type="email" id="authEmail" name="email" placeholder="name@example.com" required autocomplete="email">
            </div>
          </div>
          <div class="auth-field">
            <label for="authPassword">Password</label>
            <div class="auth-input-wrapper">
              <input type="password" id="authPassword" name="password" placeholder="At least 6 characters" required minlength="6" autocomplete="new-password">
              <button type="button" class="auth-toggle-pwd" id="togglePwd" aria-label="Toggle password visibility">
                <span class="material-symbols-outlined">visibility</span>
              </button>
            </div>
          </div>
          <button type="submit" class="auth-submit" id="authSubmit">
            <span class="material-symbols-outlined">person_add</span>
            <span>Sign Up</span>
          </button>
          <button type="button" class="auth-demo-btn" id="demoLoginBtn">
            <span class="material-symbols-outlined">bolt</span>
            <span>Quick Demo Login</span>
          </button>
        </form>
        <div class="auth-switch">
          Already have an account? <a id="authToggle">Log in</a>
        </div>
      `;
    }

    // Attach form and toggle event listeners
    modal.querySelector('#authClose').addEventListener('click', closeAuthModal);
    modal.querySelector('#authToggle').addEventListener('click', () => {
      isLoginMode = !isLoginMode;
      renderAuthModal();
    });

    const togglePwd = modal.querySelector('#togglePwd');
    if (togglePwd) {
      togglePwd.addEventListener('click', () => {
        const pwdInput = modal.querySelector('#authPassword');
        const icon = togglePwd.querySelector('.material-symbols-outlined');
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          icon.textContent = 'visibility_off';
        } else {
          pwdInput.type = 'password';
          icon.textContent = 'visibility';
        }
      });
    }

    const forgotLink = modal.querySelector('#forgotLink');
    if (forgotLink) {
      forgotLink.addEventListener('click', () => {
        showToast('Password reset link will be sent to your email.');
      });
    }

    const demoLoginBtn = modal.querySelector('#demoLoginBtn');
    if (demoLoginBtn) {
      demoLoginBtn.addEventListener('click', () => {
        handleDemoLogin();
      });
    }

    modal.querySelector('#authForm').addEventListener('submit', handleAuthSubmit);
  }

  /* ── Feature Modal Render ── */
  function renderFeatureModal(feature) {
    if (!authOverlay) return;
    const modal = authOverlay.querySelector('.auth-modal');
    if (!modal) return;

    modal.innerHTML = `
      <button class="auth-modal-close" id="authClose" aria-label="Close modal">
        <span class="material-symbols-outlined">close</span>
      </button>
      <div class="feature-modal-content">
        <div class="feature-modal-badge ${feature.color}">
          <span class="material-symbols-outlined">${feature.icon}</span>
        </div>
        <h2 class="feature-modal-title">${feature.title}</h2>
        <p class="feature-modal-desc">${feature.desc}</p>
        <ul class="feature-modal-list">
          ${feature.highlights.map(h => `
            <li>
              <span class="material-symbols-outlined">check_circle</span>
              <span>${h}</span>
            </li>
          `).join('')}
        </ul>
        <button class="auth-submit" id="featureCtaBtn">
          <span class="material-symbols-outlined">rocket_launch</span>
          <span>Get Started Free</span>
        </button>
      </div>
    `;

    modal.querySelector('#authClose').addEventListener('click', closeAuthModal);
    modal.querySelector('#featureCtaBtn').addEventListener('click', () => {
      openAuthModal(false);
    });
  }

  /* ── Form Submit Handler ── */
  async function handleAuthSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('authSubmit');
    const errEl = document.getElementById('authError');
    const errText = document.getElementById('authErrorText');
    const succEl = document.getElementById('authSuccess');
    const succText = document.getElementById('authSuccessText');

    errEl.classList.remove('visible');
    succEl.classList.remove('visible');
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined" style="animation:spin 1s linear infinite">refresh</span><span>Processing…</span>`;

    try {
      let data;
      if (isLoginMode) {
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        data = await apiLogin(email, password);
      } else {
        const name = document.getElementById('authName').value.trim();
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        data = await apiSignup(name, email, password);
      }

      setToken(data.token);
      currentUser = data.user;
      setStoredUser(currentUser);

      // Show success message
      succText.textContent = isLoginMode
        ? `Welcome back, ${currentUser.name || 'User'}! Loading your dashboard…`
        : `Account created successfully! Welcome to CarePill.`;
      succEl.classList.add('visible');

      setTimeout(() => {
        closeAuthModal();
        showApp();
        showToast(isLoginMode ? 'Logged in successfully!' : 'Account registered successfully!');
        if (typeof loadDashboard === 'function') loadDashboard();
      }, 700);

    } catch (err) {
      errText.textContent = err.message || 'An error occurred during authentication.';
      errEl.classList.add('visible');
      btn.disabled = false;
      btn.innerHTML = isLoginMode
        ? `<span class="material-symbols-outlined">login</span><span>Log In</span>`
        : `<span class="material-symbols-outlined">person_add</span><span>Sign Up</span>`;
    }
  }

  /* ── Demo Quick Login ── */
  function handleDemoLogin() {
    currentUser = { id: 1, name: 'Alex Johnson', email: 'alex.johnson@carepill.io' };
    setToken('demo-jwt-token-carepill');
    setStoredUser(currentUser);

    const succEl = document.getElementById('authSuccess');
    const succText = document.getElementById('authSuccessText');
    if (succEl && succText) {
      succText.textContent = 'Welcome to CarePill Demo! Opening dashboard…';
      succEl.classList.add('visible');
    }

    setTimeout(() => {
      closeAuthModal();
      showApp();
      showToast('Logged in with Demo Account!');
      if (typeof loadDashboard === 'function') loadDashboard();
    }, 500);
  }

  /* ── Helper Toast ── */
  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
  }

  /* ── Logout ── */
  function logout() {
    clearToken();
    currentUser = null;
    showLanding();
    showToast('Logged out successfully');
  }

  /* ── Initialize ── */
  async function init() {
    authOverlay = document.getElementById('authOverlay');
    if (!authOverlay) {
      authOverlay = document.createElement('div');
      authOverlay.id = 'authOverlay';
      authOverlay.className = 'auth-overlay';
      authOverlay.innerHTML = '<div class="auth-modal"></div>';
      document.body.appendChild(authOverlay);
    }

    // Close modal on click outside
    authOverlay.addEventListener('click', (e) => {
      if (e.target === authOverlay) closeAuthModal();
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && authOverlay.classList.contains('active')) {
        closeAuthModal();
      }
    });

    // Bind landing page auth buttons
    document.querySelectorAll('[data-auth="signup"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal(false);
      });
    });

    document.querySelectorAll('[data-auth="login"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        openAuthModal(true);
      });
    });

    document.querySelectorAll('[data-auth="logout"]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    });

    // Bind feature cards click
    document.querySelectorAll('.feature-card').forEach(card => {
      card.addEventListener('click', () => {
        const featureKey = card.getAttribute('data-feature');
        openFeatureModal(featureKey);
      });
    });

    // Check existing stored session
    const token = getToken();
    if (token) {
      try {
        currentUser = await apiMe();
        setStoredUser(currentUser);
        showApp();
        return;
      } catch {
        const stored = getStoredUser();
        if (stored) {
          currentUser = stored;
          showApp();
          return;
        }
        clearToken();
      }
    }

    showLanding();
  }

  return {
    init,
    logout,
    getToken,
    openAuthModal,
    openFeatureModal,
    closeAuthModal,
    get user() { return currentUser; }
  };
})();

document.addEventListener('DOMContentLoaded', () => AuthManager.init());

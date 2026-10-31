const CREDIT_TYPES = ['CASHIN', 'C/IN', 'ISSUE', 'KEYIN'];
const DEBIT_TYPES = ['CASHOUT', 'C/OUT', 'DEPOSIT', 'KEYOUT', 'PAID'];

/**
 * CLIENT-SIDE APP LOGIC
 * Surveillance Entry Portal
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Time Synchronization
  let timeOffset = 0;
  function getServerTimeDate() {
    return new Date(Date.now() + timeOffset);
  }

  // DOM Elements - Navigation & Views
  const loginView = document.getElementById('login-view');
  const mainView = document.getElementById('main-view');
  const userBadgeId = document.getElementById('user-badge-id');
  const btnHome = document.getElementById('btn-home');
  const btnLogout = document.getElementById('btn-logout');
  const btnAdminUsers = document.getElementById('btn-admin-users');
  const btnMajor = document.getElementById('btn-major');
  const btnAllEntries = document.getElementById('btn-all-entries');
  
  // DOM Elements - Panels
  const entryFormEl = document.getElementById('entry-form');
  const entryFormSection = entryFormEl ? entryFormEl.closest('section') : null;
  const allEntriesDatePicker = document.getElementById('all-entries-datepicker');
  const allEntriesSearch = document.getElementById('all-entries-search');
  const btnAllEntriesHome = document.getElementById('btn-all-entries-home');
  const dayNumbersContainer = document.getElementById('day-numbers-container');
  const dayNavPrev = document.getElementById('day-nav-prev');
  const dayNavNext = document.getElementById('day-nav-next');
  const gotoDayInput = document.getElementById('goto-day-input');
  const archiveStatus = document.getElementById('archive-status');
  const CURRENT_ENTRY_LIMIT = null; // Show all entries for today inside the scrollable box
  let archiveMode = false;
  let archiveEntries = [];
  const historyTableSection = document.getElementById('history-table-panel') || document.querySelector('.table-panel-card');
  const adminPanelCard = document.getElementById('admin-panel-card');
  const majorPanelCard = document.getElementById('major-panel-card');
  const allEntriesPanelCard = document.getElementById('all-entries-panel-card');
  
  // DOM Elements - Supervisor / Log Modal
  const btnSupervisorLog = document.getElementById('btn-supervisor-log');
  const btnOpenLogModal = document.getElementById('btn-open-log-modal');
  const supervisorHomePanel = document.getElementById('supervisor-home-panel');
  const barredGuestsPanel = document.getElementById('barred-guests-panel-card');
  const supervisorLogModal = document.getElementById('supervisor-log-modal');
  const supervisorLogModalBody = document.getElementById('supervisor-log-modal-body');
  const btnCloseLogModal = document.getElementById('btn-close-log-modal');
  const supervisorSendBox = document.getElementById('supervisor-send-box');
  const supervisorAllEntries = document.getElementById('supervisor-all-entries');

  function openLogModal() {
    if (supervisorLogModal) {
      resetFormInputs();
      supervisorLogModal.style.display = 'flex';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  function closeLogModal() {
    if (supervisorLogModal) {
      supervisorLogModal.style.display = 'none';
    }
  }
  
  // DOM Elements - Login
  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginErrorContainer = document.getElementById('login-error-container');
  const loginErrorText = document.getElementById('login-error-text');
  const loginSpinner = document.getElementById('login-spinner');
  const loginBtn = document.querySelector('.login-btn');

  // DOM Elements - Entry Form
  const entryForm = document.getElementById('entry-form');
  const inputDateTime = document.getElementById('datetime');
  const inputCD = document.getElementById('cd');
  const inputCashier = document.getElementById('cashier');
  const inputType = document.getElementById('type');
  const inputAmount = document.getElementById('amount');
  const inputGuestName = document.getElementById('guestname');
  const inputCard = document.getElementById('card');
  const inputOtherInfo = document.getElementById('otherinfo');
  const inputSurv = document.getElementById('surv');
  const btnSave = document.getElementById('btn-save');

  // Remove any legacy floating scroll buttons from the home screen
  const existingScrollBtns = document.getElementById('page-scroll-buttons');
  if (existingScrollBtns) existingScrollBtns.remove();
  const btnCancelEdit = document.getElementById('btn-cancel-edit');

  const saveBtnText = document.getElementById('save-btn-text');
  const cardList = document.getElementById('card-list');
  const otherInfoList = document.getElementById('otherinfo-list');

  // DOM Elements - Analytics Stats
  const statTotalLogs = document.getElementById('stat-total-logs');
  const statTotalIn = document.getElementById('stat-total-in');
  const statTotalOut = document.getElementById('stat-total-out');
  const statNetBalance = document.getElementById('stat-net-balance');

  // DOM Elements - New Lists & Exports
  const majorListContainer = document.getElementById('major-list-container');
  const allEntriesListContainer = document.getElementById('all-entries-list-container');
  const btnExportAll = document.getElementById('btn-export-all');
  const btnExportAdmin = document.getElementById('btn-export-admin');
  const majorSearch = document.getElementById('major-search');
  const adminSendList = document.getElementById('admin-send-list');
  const btnAdminSend = document.getElementById('btn-admin-send');

  // DOM Elements - Table & Search
  const logsTableBody = document.getElementById('logs-table-body');
  const recordCountBadge = document.getElementById('record-count');
  const tableSearchInput = document.getElementById('table-search');
  const btnRefresh = document.getElementById('btn-refresh');

  // DOM Elements - New Gaming Day / Change Date
  const btnStartNewDay = document.getElementById('btn-start-new-day');
  const newDayModal = document.getElementById('new-day-modal');
  const newDayDateInput = document.getElementById('new-day-date-input');
  const btnCancelNewDay = document.getElementById('btn-cancel-new-day');
  const btnConfirmNewDay = document.getElementById('btn-confirm-new-day');
  const homeGamingDateDisplay = document.getElementById('home-gaming-date-display');
  const modalCurrentDateDisplay = document.getElementById('modal-current-date-display');

  // Local state cache
  let allEntries = [];
  let currentUser = null;
  let globalBarredList = [];
  let summaryChart = null;

  // Helper: Strictly verify if active user is administrator
  function isAdmin() {
    if (!currentUser) return false;
    const uid = String(currentUser.id || currentUser.name || '').toLowerCase().trim();
    const urole = String(currentUser.role || '').toLowerCase().trim();
    return uid === 'admin' || urole === 'admin';
  }

  // Initialize Lucide Icons
  lucide.createIcons();

  // Perform time sync immediately on load
  try {
    const startFetch = Date.now();
    const statRes = await fetch('/api/status');
    if (statRes.ok) {
      const data = await statRes.json();
      if (data.serverTime) {
        const rtt = Date.now() - startFetch;
        timeOffset = data.serverTime + (rtt / 2) - Date.now();
      }
      if (data.currentBusinessDate) {
        currentBusinessDateStr = data.currentBusinessDate;
        if (homeGamingDateDisplay) homeGamingDateDisplay.textContent = currentBusinessDateStr;
      }
    }
  } catch (e) {
    console.error('Failed to sync time on load', e);
  }

  // Helper: Format local date and time as YYYY-MM-DDTHH:mm
  function getLocalTimeISOString() {
    const now = getServerTimeDate();
    let year = now.getFullYear();
    let month = String(now.getMonth() + 1).padStart(2, '0');
    let day = String(now.getDate()).padStart(2, '0');
    
    if (currentBusinessDateStr) {
      const parts = currentBusinessDateStr.split('-');
      if (parts.length === 3) {
        year = parts[0];
        month = parts[1];
        day = parts[2];
      }
    }

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  let currentBusinessDateStr = '';

  // Helper: Get the business date string (YYYY-MM-DD) for a given datetime.
  function getBusinessDate(dateObj) {
    if (!dateObj && currentBusinessDateStr) {
      return currentBusinessDateStr;
    }
    
    if (dateObj) {
      if (typeof dateObj === 'string' && dateObj.includes('T')) {
        return dateObj.split('T')[0];
      }
      const d = new Date(dateObj);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const d = getServerTimeDate();
    if (d.getHours() < 6) {
      d.setDate(d.getDate() - 1);
    }
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Helper: Check if an entry belongs to today's business session.
  function isEntryForToday(e) {
    if (!e) return false;
    // Archived entries belong to past gaming days, exclude from today's home screen
    if (e.archived === true || e.archived === 'true') return false;

    const todayBus = currentBusinessDateStr || getBusinessDate();
    const eDate = e.businessDate || (e.datetime ? getBusinessDate(e.datetime) : '');
    return eDate === todayBus;
  }

  // Helper: Format amount as Indian Rupee (INR) without decimal zeroes
  function formatCurrency(value) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  let allEntriesArchiveData = [];
  let archiveMetadata = {};

  async function fetchArchiveMetadata() {
    try {
      const resp = await fetch('/api/archives');
      if (resp.ok) {
        const data = await resp.json();
        archiveMetadata = data.archives || {};
        populateArchiveYears();
      }
    } catch (err) {
      console.error('Failed to fetch archive metadata:', err);
    }
  }

  function populateArchiveYears() {
    if (!allEntriesYear) return;
    const colors = [
      '#e53935', '#d81b60', '#8e24aa', '#5e35b1', '#3949ab', '#1e88e5',
      '#039be5', '#00acc1', '#00897b', '#43a047', '#7cb342', '#f4511e'
    ];
    let html = '<option value="current">CURRENT YEAR</option>';
    for (let y = 2026; y <= 3000; y++) {
      const color = colors[(y - 2026) % colors.length];
      html += `<option value="${y}" style="background: ${color}; color: white;">${y}</option>`;
    }
    allEntriesYear.innerHTML = html;
  }

  let activeAllEntriesDay = Number(getBusinessDate().split('-')[2]);

  function syncDatePickerWithDay() {
    if (!allEntriesDatePicker) return;
    let currentVal = allEntriesDatePicker.value;
    if (!currentVal) {
      currentVal = getBusinessDate();
    }
    const parts = currentVal.split('-');
    if (parts.length === 3) {
      parts[2] = String(activeAllEntriesDay).padStart(2, '0');
      allEntriesDatePicker.value = parts.join('-');
    }
  }

  function renderDayPagination() {
    if (!dayNumbersContainer) return;
    let html = '';
    for (let i = 1; i <= 31; i++) {
      html += `<button class="day-nav-btn ${activeAllEntriesDay === i ? 'active' : ''}" data-day="${i}">${i}</button>`;
    }
    dayNumbersContainer.innerHTML = html;

    // Attach listeners
    dayNumbersContainer.querySelectorAll('.day-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = parseInt(btn.getAttribute('data-day'));
        activeAllEntriesDay = d;
        if(gotoDayInput) gotoDayInput.value = d;
        syncDatePickerWithDay();
        renderDayPagination();
        updateAllEntriesView();
      });
    });
  }

  // Next/Prev logic
  if(dayNavPrev) {
    dayNavPrev.addEventListener('click', () => {
      if(activeAllEntriesDay > 1) {
        activeAllEntriesDay--;
        if(gotoDayInput) gotoDayInput.value = activeAllEntriesDay;
        syncDatePickerWithDay();
        renderDayPagination();
        updateAllEntriesView();
      }
    });
  }
  if(dayNavNext) {
    dayNavNext.addEventListener('click', () => {
      if(activeAllEntriesDay === null) activeAllEntriesDay = 1;
      else if(activeAllEntriesDay < 31) activeAllEntriesDay++;
      if(gotoDayInput) gotoDayInput.value = activeAllEntriesDay;
      syncDatePickerWithDay();
      renderDayPagination();
      updateAllEntriesView();
    });
  }
  if(gotoDayInput) {
    gotoDayInput.addEventListener('change', () => {
      let val = parseInt(gotoDayInput.value);
      if(val >= 1 && val <= 31) {
        activeAllEntriesDay = val;
        syncDatePickerWithDay();
        renderDayPagination();
        updateAllEntriesView();
      }
    });
  }

  // Initial render
  renderDayPagination();
  // Modal DOM elements
  const editModal = document.getElementById('edit-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelEditModal = document.getElementById('btn-cancel-edit-modal');
  const editEntryForm = document.getElementById('edit-entry-form');

  const editInputDateTime = document.getElementById('edit-datetime');
  const editInputCD = document.getElementById('edit-cd');
  const editInputType = document.getElementById('edit-type');
  const editInputAmount = document.getElementById('edit-amount');
  const editInputCashier = document.getElementById('edit-cashier');
  const editInputGuestName = document.getElementById('edit-guestname');
  const editInputCard = document.getElementById('edit-card');
  const editInputOtherInfo = document.getElementById('edit-otherinfo');
  const editInputSurv = document.getElementById('edit-surv');

  // Edit Entry Helper
  function editEntry(entry) {
    if (!entry) return;
    
    // Populate modal form
    editInputDateTime.value  = entry.datetime || getLocalTimeISOString();
    editInputCD.value          = entry.cd        || '';
    editInputType.value        = entry.type      || '';
    editInputAmount.value      = entry.amount    || '';
    editInputCashier.value     = entry.cashier   || '';
    editInputGuestName.value   = entry.guestname || '';
    editInputCard.value        = entry.card      || '';
    editInputOtherInfo.value   = entry.otherinfo || '';
    editInputSurv.value        = entry.surv      || '';
    
    editingEntryId = entry.id;
    
    // Show Modal
    editModal.style.display = 'flex';
  }

  // Close Modal Handlers
  function closeEditModal() {
    editModal.style.display = 'none';
    editingEntryId = null;
    editEntryForm.reset();
  }
 if (btnCloseModal) btnCloseModal.addEventListener('click', closeEditModal);
 if (btnCancelEditModal) btnCancelEditModal.addEventListener('click', closeEditModal);
 if (editModal) editModal.addEventListener('click', (e) => {
    if(e.target === editModal) closeEditModal();
  });

  // Handle Edit Form Submission
 if (editEntryForm) editEntryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if(!editingEntryId) return;

    let typeVal = editInputType.value.trim().toUpperCase();
    if (typeVal === 'C/IN') typeVal = 'CASHIN';
    if (typeVal === 'C/OUT') typeVal = 'CASHOUT';

    const updatedData = {
      datetime: editInputDateTime.value,
      cd: (editInputCD && editInputCD.value) ? editInputCD.value.toUpperCase() : 'CD-01',
      type: typeVal,
      amount: parseFloat(editInputAmount.value) || 0,
      cashier: (editInputCashier && editInputCashier.value) ? editInputCashier.value.trim().toUpperCase() : '-',
      guestname: editInputGuestName.value.trim().toUpperCase(),
      card: editInputCard.value.trim().toUpperCase(),
      otherinfo: editInputOtherInfo.value.trim().toUpperCase(),
      surv: editInputSurv.value.toUpperCase()
    };

    try {
      const resp = await fetch(`/api/entries?id=${editingEntryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedData, id: editingEntryId })
      });
      if (!resp.ok) throw new Error('Update failed.');
      
      closeEditModal();
      await fetchEntries(); // Re-render the view
    } catch (err) {
      alert(`Error updating entry: ${err.message}`);
    }
  });

  // ALL ENTRIES panel view update
  async function updateAllEntriesView() {
    if (!allEntriesDatePicker || !allEntriesSearch) return;

    const selectedDate = allEntriesDatePicker.value;
    const query = allEntriesSearch.value.toLowerCase().trim();

    let sourceEntries = allEntries;

    // Filter by selected date
    if (selectedDate) {
      sourceEntries = sourceEntries.filter(entry => {
        if (!entry.datetime) return false;
        return getBusinessDate(entry.datetime) === selectedDate;
      });
    }

    // Apply Search filter
    if (query) {
      sourceEntries = sourceEntries.filter(entry => {
        const nameMatch = entry.guestname && entry.guestname.toLowerCase().includes(query);
        const cashierMatch = entry.cashier && entry.cashier.toLowerCase().includes(query);
        const typeMatch = entry.type && entry.type.toLowerCase().includes(query);
        const survMatch = entry.surv && entry.surv.toLowerCase().includes(query);
        const cdMatch = entry.cd && entry.cd.toLowerCase().includes(query);
        const cardMatch = entry.card && entry.card.toLowerCase().includes(query);
        const otherInfoMatch = entry.otherinfo && entry.otherinfo.toLowerCase().includes(query);
        const amountMatch = entry.amount && String(entry.amount).includes(query);

        return nameMatch || cashierMatch || typeMatch || survMatch || cdMatch || cardMatch || otherInfoMatch || amountMatch;
      });
    }

    // Render sentences
    const allEntriesListContainer = document.getElementById('all-entries-list-container');
    const allEntriesTableBody = document.getElementById('all-entries-table-body');
    
    if (sourceEntries.length === 0) {
      if (allEntriesListContainer) {
        allEntriesListContainer.innerHTML = `
          <div class="empty-state">
            <p>No records found matching the filters.</p>
          </div>
        `;
      }
      if (allEntriesTableBody) {
        allEntriesTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:20px;">No records found.</td></tr>`;
      }
      return;
    }

    if (allEntriesListContainer) {
      allEntriesListContainer.innerHTML = `<ul class="sentence-list">` + 
        sourceEntries.map(e => `<li class="sentence-item ${(e.type||'').toLowerCase().replace('/', '-')}">${getEntrySentence(e)}</li>`).join('') +
        `</ul>`;
    }

    if (allEntriesTableBody) {
      let tableHtml = '';
      sourceEntries.forEach(entry => {
        const type = (entry.type || '').toUpperCase();
        let typeBadge = { cls: 'badge-synced', label: type };
        if (['CASHIN', 'C/IN', 'ISSUE', 'KEYIN'].includes(type)) typeBadge = { cls: 'badge-credit', label: type };
        if (['CASHOUT', 'C/OUT', 'DEPOSIT', 'KEYOUT'].includes(type)) typeBadge = { cls: 'badge-debit', label: type };
        
        const amtClass = ['CASHIN', 'C/IN', 'ISSUE', 'KEYIN'].includes(type) ? 'text-green' : 'text-red';
        const amtFormatted = formatCurrency(Number(entry.amount) || 0);
        const displayDate = entry.datetime ? entry.datetime.replace('T', ' ') : 'N/A';
        const cdText = escapeHTML(entry.cd || 'N/A');

        let actionButtons = `
          <div style="display:flex; gap:6px;">
            <button class="btn-edit-entry" data-id="${entry.id}" title="Edit" style="background:transparent;color:var(--accent);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px 8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
            </button>
            <button class="btn-delete-entry" data-id="${entry.id}" title="Delete" style="background:transparent;color:var(--danger,#ef4444);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:4px 8px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
              <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
            </button>
          </div>
        `;

          tableHtml += `
            <tr>
              <td class="checkbox-col">
                <input type="checkbox" class="entry-checkbox" data-id="${entry.id}">
              </td>
              <td><strong>${displayDate}</strong></td>
            <td><span style="color: #60a5fa; font-weight: bold;">${escapeHTML(entry.surv || '-')}</span></td>
            <td><span class="badge ${typeBadge.cls}">${typeBadge.label}</span></td>
            <td class="table-amount ${amtClass}">${amtFormatted}</td>
            <td>${escapeHTML(entry.guestname)}</td>
            <td>${(() => {
              const showCard = ['ISSUE','DEPOSIT'].includes(type);
              return showCard
                ? `<code>${entry.card ? escapeHTML(entry.card) : '—'}</code>`
                : `<span style="color:var(--text-muted)">—</span>`;
            })()}</td>
            <td title="${escapeHTML(entry.otherinfo || '')}">
              <div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">
                ${entry.otherinfo ? escapeHTML(entry.otherinfo) : '<span style="color:var(--text-muted)">—</span>'}
              </div>
            </td>
            <td>${actionButtons}</td>
          </tr>
        `;
      });
      allEntriesTableBody.innerHTML = tableHtml;
      lucide.createIcons();

      // Attach listeners
      allEntriesTableBody.querySelectorAll('.btn-edit-entry').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-id'));
          const entry = allEntries.find(e => e.id === id);
          if (entry) editEntry(entry);
        });
      });
      allEntriesTableBody.querySelectorAll('.btn-delete-entry').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-id'));
          try {
            const resp = await fetch(`/api/entries?id=${id}`, { method: 'DELETE' });
            if (!resp.ok) throw new Error('Delete failed.');
            await fetchEntries();
          } catch (err) {
            alert(`Error deleting entry: ${err.message}`);
          }
        });
      });
    }
  }

  // Switch App Views
  function showView(viewId) {
    if (viewId === 'main') {
      loginView.classList.remove('active');
      loginView.style.display = 'none';
      loginView.style.opacity = '0';
      mainView.style.display = 'flex';
      mainView.style.opacity = '1';
      mainView.style.transform = 'translateY(0)';
      mainView.classList.add('active');
    } else if (viewId === 'login') {
      mainView.classList.remove('active');
      mainView.style.display = 'none';
      mainView.style.opacity = '0';
      loginView.style.display = 'flex';
      loginView.style.opacity = '1';
      loginView.style.transform = 'translateY(0)';
      loginView.classList.add('active');
    }
  }

  // Dynamic Wallpaper Logic
  const wallpapers = [
    'assets/surveillance_bg.png',
    'assets/surveillance_bg_green.png',
    'assets/surveillance_bg_red.png',
    'assets/surveillance_bg_orange.png'
  ];

  function applyUserWallpaper(username) {
    if (!username) {
      document.body.style.background = '';
      return;
    }
    // Randomly pick a wallpaper
    const index = Math.floor(Math.random() * wallpapers.length);
    document.body.style.background = `linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.95)), url('${wallpapers[index]}') center/cover fixed no-repeat`;
  }

  // ==========================================================================
  // INACTIVITY AUTO-LOGOUT (30 MINUTES)
  // ==========================================================================
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  let lastActivityUpdate = 0;

  function recordUserActivity() {
    if (!currentUser) return;
    const now = Date.now();
    // Throttle writing to localStorage to once every 5 seconds
    if (now - lastActivityUpdate > 5000) {
      lastActivityUpdate = now;
      localStorage.setItem('surv_last_activity', String(now));
    }
  }

  function performLogout(reason) {
    localStorage.removeItem('surv_session');
    localStorage.removeItem('surv_last_activity');
    sessionStorage.removeItem('current_panel');
    currentUser = null;
    allEntries = [];
    applyUserWallpaper(null);
    updateSurvFieldState();
    hideAllPanels();
    if (btnAdminUsers) btnAdminUsers.style.display = 'none';
    if (btnSupervisorLog) btnSupervisorLog.style.display = 'none';

    showView('login');
    if (reason && loginErrorText && loginErrorContainer) {
      loginErrorText.textContent = reason;
      loginErrorContainer.style.display = 'flex';
    }
  }

  // Listen for user interactions to refresh inactivity timer
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    window.addEventListener(evt, recordUserActivity, { passive: true });
  });

  // Check every 10 seconds if 30 minutes of inactivity has passed
  setInterval(() => {
    if (!currentUser) return;
    const lastActive = Number(localStorage.getItem('surv_last_activity') || 0);
    if (lastActive && (Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS)) {
      console.warn('[Session] User inactive for 30 minutes. Auto-logging out.');
      performLogout('Logged out automatically due to 30 minutes of inactivity.');
    }
  }, 10000);

  // Verify and load active session
  function checkAuthSession() {
    const sessionData = localStorage.getItem('surv_session');
    if (sessionData) {
      const lastActive = Number(localStorage.getItem('surv_last_activity') || 0);
      if (lastActive && (Date.now() - lastActive >= INACTIVITY_TIMEOUT_MS)) {
        performLogout('Session expired due to 30 minutes of inactivity.');
        return;
      }
      localStorage.setItem('surv_last_activity', String(Date.now()));
      lastActivityUpdate = Date.now();

      let parsedSession = null;
      try {
        parsedSession = JSON.parse(sessionData);
      } catch (err) {
        console.error('Failed to parse session data:', err);
        performLogout();
        return;
      }
      
      if (parsedSession) {
        currentUser = parsedSession;
        userBadgeId.textContent = currentUser.name;
        inputSurv.value = currentUser.id;
        
        applyUserWallpaper(currentUser.name);
        
        showView('main');
        
        // Restore last active panel (AFTER REFRESH SAME PAGE)
        const lastPanel = sessionStorage.getItem('current_panel') || 'home';
        if (lastPanel === 'admin') {
          if (isAdmin()) showAdminPanel();
          else showHomePanel();
        }
        else if (lastPanel === 'major') showMajorPanel();
        else if (lastPanel === 'all_entries') showAllEntriesPanel();
        else if (lastPanel === 'barred') showBarredPanel();
        else if (lastPanel === 'staff') showStaffPanel();
        else showHomePanel();
        
        resetFormInputs();
        toggleAdminPanel();
        updateSurvFieldState();
        fetchArchiveMetadata();
        fetchEntries();
        fetchGlobalBarredList();
      }
    } else {
      showView('login');
    }
  }

  // Toggle SURV input editability based on admin status
  function updateSurvFieldState() {
    const wrapper = inputSurv.parentElement;
    if (currentUser && currentUser.id === 'admin') {
      inputSurv.removeAttribute('readonly');
      wrapper.classList.remove('read-only');
      inputSurv.placeholder = 'Enter SURV ID';
    } else {
      inputSurv.setAttribute('readonly', 'readonly');
      wrapper.classList.add('read-only');
      inputSurv.placeholder = 'SURV ID';
    }
  }

  // Reset entry form fields
  function resetFormInputs() {
    inputDateTime.value = getLocalTimeISOString();
    if (inputCD) inputCD.value = 'CD-01';
    inputType.value     = '';
    inputAmount.value   = '';
    if (inputCashier) inputCashier.value = '-';
    inputGuestName.value= '';
    inputCard.value     = '';
    inputOtherInfo.value= '';
    if (currentUser) inputSurv.value = currentUser.id;

    // Dispatch input events to sync quick entry widgets
    if (inputCD) inputCD.dispatchEvent(new Event('input', { bubbles: true }));
    if (inputCashier) inputCashier.dispatchEvent(new Event('input', { bubbles: true }));

    updateSurvFieldState();
    // Exit edit mode
    editingEntryId = null;
    if (saveBtnText)    saveBtnText.textContent    = 'SAVE';
    if (btnCancelEdit)  btnCancelEdit.style.display = 'none';
  }

  // Cancel edit mode
  if (btnCancelEdit) {
 if (btnCancelEdit) btnCancelEdit.addEventListener('click', () => { resetFormInputs(); });
  }

  // ==========================================================================
  // AUTHENTICATION LOGIC
  // ==========================================================================
 if (loginForm) loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErrorContainer.style.display = 'none';

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) return;

    // Show loading state
    loginBtn.classList.add('loading');

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed.');
      }

      // Save user to session
      currentUser = data.user;
      localStorage.setItem('surv_session', JSON.stringify(currentUser));
      localStorage.setItem('surv_last_activity', String(Date.now()));
      lastActivityUpdate = Date.now();
      
      // Update badge and field
      userBadgeId.textContent = currentUser.name;
      inputSurv.value = currentUser.id;
      
      applyUserWallpaper(currentUser.name);
      
      // Navigate to dashboard - AFTER LOGIN SHOW HOME PAGE
      sessionStorage.setItem('current_panel', 'home');
      showView('main');
      showHomePanel();
      resetFormInputs();
      toggleAdminPanel();
      updateSurvFieldState();
      fetchArchiveMetadata();
      fetchEntries();
      fetchGlobalBarredList();

      // Reset login form fields
      usernameInput.value = '';
      passwordInput.value = '';
    } catch (err) {
      loginErrorText.textContent = err.message || 'Authorization failed. Check details.';
      loginErrorContainer.style.display = 'flex';
    } finally {
      loginBtn.classList.remove('loading');
    }
  });

  // Logout action
  if (btnLogout) btnLogout.addEventListener('click', () => {
    performLogout();
  });

  // ==========================================================================
  // DATA AND API INTEGRATION
  // ==========================================================================

  // Fetch entries from Express backend
  async function fetchEntries() {
    try {
      const response = await fetch('/api/entries');
      if (!response.ok) throw new Error('Failed to retrieve entries.');
      const data = await response.json();
      allEntries = data.entries || [];
      if (data.currentBusinessDate) {
        currentBusinessDateStr = data.currentBusinessDate;
        const gamingDateEl = document.getElementById('all-entries-gaming-date');
        if (gamingDateEl) {
          gamingDateEl.textContent = `TODAY GAMING DATE: ${currentBusinessDateStr}`;
        }
        if (homeGamingDateDisplay) {
          homeGamingDateDisplay.textContent = currentBusinessDateStr;
        }
        // Refresh the hidden datetime input so future entries use the correct business date
        if (inputDateTime) inputDateTime.value = getLocalTimeISOString();
      }

      const currentDayEntries = allEntries.filter(isEntryForToday);
      renderEntries(allEntries, { limit: CURRENT_ENTRY_LIMIT, isArchive: false });
      calculateStatistics(currentDayEntries);
      populateDataLists(allEntries);
      if(allEntriesPanelCard && allEntriesPanelCard.style.display !== 'none') {
        updateAllEntriesView();
      }
      if(supervisorHomePanel && supervisorHomePanel.style.display !== 'none') {
        renderSupervisorHome();
      }
      if(majorPanelCard && majorPanelCard.style.display !== 'none') {
        renderMajor();
      }
      if(adminPanelCard && adminPanelCard.style.display !== 'none') {
        renderAdminSendList();
      }
    } catch (err) {
      console.error('Error fetching logs:', err);
      logsTableBody.innerHTML = `
        <tr>
          <td colspan="11" class="no-records-row">
            <div class="empty-state text-red">
              <i data-lucide="wifi-off"></i>
              <p>Unable to connect to server. Check server console.</p>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
    }
  }

  // Calculate stats based on fetched entries
  function calculateStatistics(entries) {
    const totalLogs = entries.length;
    let totalIn = 0;
    let totalOut = 0;

    entries.forEach(entry => {
      const t = (entry.type || '').toUpperCase();
      if (['CASHIN', 'C/IN', 'ISSUE', 'KEYIN'].includes(t)) {
        totalIn += Number(entry.amount) || 0;
      } else if (['CASHOUT', 'C/OUT', 'DEPOSIT', 'KEYOUT'].includes(t)) {
        totalOut += Number(entry.amount) || 0;
      }
    });

    const netBalance = totalIn - totalOut;

    if (statTotalLogs) statTotalLogs.textContent = totalLogs;
    if (statTotalIn) statTotalIn.textContent = formatCurrency(totalIn);
    if (statTotalOut) statTotalOut.textContent = formatCurrency(totalOut);

    // Net Flow Styling
    if (statNetBalance) {
      statNetBalance.textContent = formatCurrency(netBalance);
      if (netBalance > 0) {
        statNetBalance.className = 'stat-val text-green';
      } else if (netBalance < 0) {
        statNetBalance.className = 'stat-val text-red';
      } else {
        statNetBalance.className = 'stat-val';
      }
    }
  }

  // ==========================================================================
  // VIEW & PANEL SWITCHING
  // ==========================================================================
  
  // Hide all main content panels
  function hideAllPanels() {
    if (entryFormSection) {
      entryFormSection.style.setProperty('display', 'none', 'important');
      entryFormSection.classList.add('hidden-panel');
    }
    const logForm = document.getElementById('log-form-panel');
    if (logForm) {
      logForm.style.setProperty('display', 'none', 'important');
      logForm.classList.add('hidden-panel');
    }
    if (historyTableSection) {
      historyTableSection.style.setProperty('display', 'none', 'important');
      historyTableSection.classList.add('hidden-panel');
    }
    if (adminPanelCard) {
      adminPanelCard.style.setProperty('display', 'none', 'important');
      adminPanelCard.classList.add('hidden-panel');
    }
    if (majorPanelCard) {
      majorPanelCard.style.setProperty('display', 'none', 'important');
      majorPanelCard.classList.add('hidden-panel');
    }
    if (allEntriesPanelCard) {
      allEntriesPanelCard.style.setProperty('display', 'none', 'important');
      allEntriesPanelCard.classList.add('hidden-panel');
    }
    if (supervisorHomePanel) {
      supervisorHomePanel.style.setProperty('display', 'none', 'important');
      supervisorHomePanel.classList.add('hidden-panel');
    }
    if (barredGuestsPanel) {
      barredGuestsPanel.style.setProperty('display', 'none', 'important');
      barredGuestsPanel.classList.add('hidden-panel');
    }
    const staffPanel = document.getElementById('staff-panel-card');
    if (staffPanel) {
      staffPanel.style.setProperty('display', 'none', 'important');
      staffPanel.classList.add('hidden-panel');
    }
    
    // Close log modal if open
    closeLogModal();

    // De-activate all nav buttons
    document.querySelectorAll('.btn-nav').forEach(btn => btn.classList.remove('active'));

    // Keep wrapper locked inside single screen and auto-fit 100%
    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
    }
    
    // Lock outer viewport so no outer page scroller ever appears
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overflowY = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';
  }

  function showHomePanel() {
    sessionStorage.setItem('current_panel', 'home');
    hideAllPanels();
    resetFormInputs();
    if(tableSearchInput) tableSearchInput.value = '';

    // Auto-fit 100% in one page with zero page scrolling (Telegram layout on mobile & desktop)
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.overflowY = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';
    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
    }
    const appFooter = document.querySelector('.app-footer');
    if (appFooter) appFooter.style.display = 'none';
    
    // Toggle navigation buttons - ADD ENTRIES available for everyone
    if (btnSupervisorLog) btnSupervisorLog.style.display = 'flex';
    if (btnOpenLogModal) btnOpenLogModal.style.display = 'flex';

    if (currentUser && currentUser.role === 'supervisor') {
      // Supervisor View
      if (supervisorHomePanel) {
        supervisorHomePanel.classList.remove('hidden-panel');
        supervisorHomePanel.style.setProperty('display', 'flex', 'important');
      }
      renderSupervisorHome();
    } else {
      // Normal/Office View (Telegram layout: Table on top, Message Box fixed down)
      if (historyTableSection) {
        historyTableSection.classList.remove('hidden-panel');
        historyTableSection.style.setProperty('display', 'flex', 'important');
      }
      const logForm = document.getElementById('log-form-panel');
      if (logForm) {
        logForm.classList.remove('hidden-panel');
        logForm.style.setProperty('display', 'block', 'important');
      }
      if (entryFormSection) {
        entryFormSection.classList.remove('hidden-panel');
        entryFormSection.style.setProperty('display', 'block', 'important');
      }
    }
    
    if(btnHome) btnHome.classList.add('active');
    fetchEntries();
  }

  function showAdminPanel() {
    if (!isAdmin()) {
      alert('Access restricted: Only Admin can access Add Member / user management.');
      showHomePanel();
      return;
    }

    sessionStorage.setItem('current_panel', 'admin');
    hideAllPanels();

    const logForm = document.getElementById('log-form-panel');
    if (logForm) {
      logForm.style.setProperty('display', 'none', 'important');
      logForm.classList.add('hidden-panel');
    }
    if (historyTableSection) {
      historyTableSection.style.setProperty('display', 'none', 'important');
      historyTableSection.classList.add('hidden-panel');
    }

    // Auto-fit 100% screen size with zero outer window scrolling (ONLY ACTIVE MEMBERS MOVE UP/DOWN)
    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
      wrapper.style.padding = '0 16px 6px 16px';
    }

    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';

    if(adminPanelCard) {
      adminPanelCard.classList.remove('hidden-panel');
      adminPanelCard.style.setProperty('display', 'flex', 'important');
      if(btnAdminUsers) btnAdminUsers.classList.add('active');
      fetchUsers();
      if (window.lucide) lucide.createIcons();
    }
  }

  function showMajorPanel() {
    sessionStorage.setItem('current_panel', 'major');
    hideAllPanels();
    const logForm = document.getElementById('log-form-panel');
    if(logForm) {
      logForm.style.setProperty('display', 'none', 'important');
      logForm.classList.add('hidden-panel');
    }
    if(historyTableSection) {
      historyTableSection.style.setProperty('display', 'none', 'important');
      historyTableSection.classList.add('hidden-panel');
    }

    // Auto-fit 100% screen size with zero outer window scrolling and use full available space
    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
      wrapper.style.padding = '0 16px 6px 16px';
    }

    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';

    if(majorPanelCard) {
      majorPanelCard.classList.remove('hidden-panel');
      majorPanelCard.style.setProperty('display', 'flex', 'important');
      if(btnMajor) btnMajor.classList.add('active');
      if(majorSearch) majorSearch.value = ''; // Clear search to show all guests!
      majorViewMode = 'cards';
      renderMajor();
    }
  }

  function showAllEntriesPanel() {
    sessionStorage.setItem('current_panel', 'all_entries');
    hideAllPanels();

    const logForm = document.getElementById('log-form-panel');
    if (logForm) {
      logForm.style.setProperty('display', 'none', 'important');
      logForm.classList.add('hidden-panel');
    }
    if (historyTableSection) {
      historyTableSection.style.setProperty('display', 'none', 'important');
      historyTableSection.classList.add('hidden-panel');
    }

    // Auto-fit 100% screen size with zero outer window scrolling (ONLY ENTRIES MOVE UP/DOWN)
    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
      wrapper.style.padding = '0 16px 6px 16px';
    }

    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';

    if(allEntriesPanelCard) {
      allEntriesPanelCard.classList.remove('hidden-panel');
      allEntriesPanelCard.style.setProperty('display', 'flex', 'important');
      if(btnAllEntries) btnAllEntries.classList.add('active');
      
      const gamingDateEl = document.getElementById('all-entries-gaming-date');
      if (gamingDateEl) {
        gamingDateEl.textContent = `TODAY GAMING DAY: ${currentBusinessDateStr || getBusinessDate()}`;
      }

      // Always select the current business day
      const todayDate = currentBusinessDateStr || getBusinessDate();
      activeAllEntriesDay = Number(todayDate.split('-')[2]);
      
      if (gotoDayInput) gotoDayInput.value = activeAllEntriesDay;
      if (allEntriesDatePicker && !allEntriesDatePicker.value) {
        allEntriesDatePicker.value = todayDate;
      }
      renderDayPagination();
      updateAllEntriesView();
      if (window.lucide) lucide.createIcons();
    }
  }

  const btnBarredGlobal = document.getElementById('btn-barred-global');
  const btnStaffGlobal = document.getElementById('btn-staff-global');

  function showStaffPanel() {
    sessionStorage.setItem('current_panel', 'staff');
    hideAllPanels();

    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
      wrapper.style.padding = '0 16px 6px 16px';
    }

    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';

    const staffPanel = document.getElementById('staff-panel-card') || staffDirectoryPanelCard;
    if (staffPanel) {
      staffPanel.classList.remove('hidden-panel');
      staffPanel.style.setProperty('display', 'flex', 'important');
      if (btnStaffGlobal) btnStaffGlobal.classList.add('active');
      fetchAndRenderStaff();
      if (window.lucide) lucide.createIcons();
    }
  }

  if (btnStaffGlobal) {
    btnStaffGlobal.addEventListener('click', showStaffPanel);
  }

  if(btnHome) btnHome.addEventListener('click', () => {
    if(typeof hideAllPanels === 'function') hideAllPanels();
    if(typeof showHomePanel === 'function') showHomePanel();
  });
  function showBarredPanel() {
    sessionStorage.setItem('current_panel', 'barred');
    hideAllPanels();

    const logForm = document.getElementById('log-form-panel');
    if (logForm) {
      logForm.style.setProperty('display', 'none', 'important');
      logForm.classList.add('hidden-panel');
    }
    if (historyTableSection) {
      historyTableSection.style.setProperty('display', 'none', 'important');
      historyTableSection.classList.add('hidden-panel');
    }

    // Auto-fit 100% screen size with zero outer window scrolling (ONLY BARRED CARDS MOVE UP/DOWN)
    const wrapper = document.querySelector('.content-wrapper');
    if (wrapper) {
      wrapper.style.maxWidth = '100%';
      wrapper.style.width = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.height = '100%';
      wrapper.style.flex = '1 1 0';
      wrapper.style.padding = '0 16px 6px 16px';
    }

    document.body.style.overflow = 'hidden';
    document.body.style.overflowY = 'hidden';

    if (barredGuestsPanel) {
      barredGuestsPanel.classList.remove('hidden-panel');
      barredGuestsPanel.style.setProperty('display', 'flex', 'important');
      if (btnBarredGlobal) btnBarredGlobal.classList.add('active');
      fetchAndRenderBarredGuests();
      if (window.lucide) lucide.createIcons();
    }
  }

  if (btnBarredGlobal) btnBarredGlobal.addEventListener('click', showBarredPanel);
  if(btnAdminUsers) btnAdminUsers.addEventListener('click', showAdminPanel);
  if(btnMajor) btnMajor.addEventListener('click', showMajorPanel);
  if(btnAllEntries) btnAllEntries.addEventListener('click', showAllEntriesPanel);
  if(btnAllEntriesHome) btnAllEntriesHome.addEventListener('click', showHomePanel);

  // Add Entries (Log Modal) Event Listeners
  if (btnSupervisorLog) btnSupervisorLog.addEventListener('click', openLogModal);
  if (btnOpenLogModal) btnOpenLogModal.addEventListener('click', openLogModal);
  if (btnCloseLogModal) btnCloseLogModal.addEventListener('click', closeLogModal);
  if (supervisorLogModal) {
    supervisorLogModal.addEventListener('click', (e) => {
      if (e.target === supervisorLogModal) closeLogModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && supervisorLogModal && supervisorLogModal.style.display === 'flex') {
      closeLogModal();
    }
  });

  // ============================================================
  // BARRED GUESTS - Fetch global list and render panel
  // ============================================================

  async function fetchGlobalBarredList() {
    try {
      const res = await fetch('/api/barred');
      if (res.ok) {
        const data = await res.json();
        globalBarredList = data.barred || [];
      }
    } catch (e) {
      console.error('Failed to fetch global barred list:', e);
    }
  }

  // Check if a guest name matches the barred list (exact name / same spelling)
  function checkClientBarredGuest(guestName) {
    if (!guestName || !globalBarredList || !Array.isArray(globalBarredList) || globalBarredList.length === 0) return null;
    const query = String(guestName).trim().toUpperCase().replace(/\s+/g, ' ');
    if (!query) return null;
    for (const item of globalBarredList) {
      if (!item) continue;
      // 1. Direct property checks
      const directName = item.guestname || item.name || item.GuestName || item.Name || item.GUESTNAME;
      if (typeof directName === 'string') {
        const bName = directName.trim().toUpperCase().replace(/\s+/g, ' ');
        if (bName === query) return item;
      }
      // 2. Iterate keys looking for guest / name
      for (const [k, v] of Object.entries(item)) {
        if (typeof v === 'string') {
          const lk = k.toLowerCase();
          if (lk.includes('name') || lk === 'guest' || lk.includes('guest')) {
            const bName = v.trim().toUpperCase().replace(/\s+/g, ' ');
            if (bName === query) {
              return item;
            }
          }
        }
      }
    }
    return null;
  }

  async function ensureCheckBarredGuest(guestName) {
    if (!globalBarredList || !Array.isArray(globalBarredList) || globalBarredList.length === 0) {
      await fetchGlobalBarredList();
    }
    return checkClientBarredGuest(guestName);
  }

  // Display the Barred Warning Popup Modal and wait for user acknowledgment
  function showBarredWarningPopup(match, guestName) {
    return new Promise((resolve) => {
      const warningModal = document.getElementById('barred-warning-modal');
      const warningName = document.getElementById('barred-warning-name');
      const warningReason = document.getElementById('barred-warning-reason');
      const btnClose = document.getElementById('btn-close-barred-warning');
      if (!warningModal) {
        resolve(true);
        return;
      }

      const displayName = guestName || (match ? (match.guestname || match.name || match.Name || 'BARRED GUEST') : 'BARRED GUEST');
      if (warningName) {
        warningName.textContent = displayName;
      }

      let details = '';
      let reasonText = match ? (match.reason || match.Reason || match.REASON || '') : '';
      let dateText = match ? (match.date || match.Date || match.DATE || '') : '';
      let instText = match ? (match.inst || match.Inst || match.INST || match.instruction || match.Instruction || '') : '';
      let propText = match ? (match.property || match.Property || match.PROPERTY || '') : '';
      let photoUrl = match ? (match.photo || match.Photo || '') : '';

      if (photoUrl && (photoUrl.startsWith('data:image/') || photoUrl.startsWith('http') || photoUrl.startsWith('/'))) {
        details += `<div style="text-align:center; margin-bottom:12px;"><img src="${photoUrl}" style="max-height:160px; max-width:100%; border-radius:8px; border:2px solid #ef4444;" /></div>`;
      }

      details += `
        <div style="display:flex; flex-direction:column; gap:6px; text-align:left; font-size:0.95rem;">
          <div><strong style="color:#ef4444;">REASON:</strong> <span style="color:#fff;">${escapeHTML(reasonText || 'No reason specified')}</span></div>
          ${dateText ? `<div><strong style="color:#94a3b8;">DATE:</strong> <span style="color:#fff;">${escapeHTML(dateText)}</span></div>` : ''}
          ${instText ? `<div><strong style="color:#94a3b8;">INSTRUCTION:</strong> <span style="color:#fff;">${escapeHTML(instText)}</span></div>` : ''}
          ${propText ? `<div><strong style="color:#94a3b8;">PROPERTY:</strong> <span style="color:#fff;">${escapeHTML(propText)}</span></div>` : ''}
        </div>
      `;

      if (warningReason) {
        warningReason.innerHTML = details;
      }

      warningModal.style.display = 'flex';
      if (window.lucide) lucide.createIcons();

      function handleAcknowledge(e) {
        if (e) e.preventDefault();
        warningModal.style.display = 'none';
        if (btnClose) btnClose.removeEventListener('click', handleAcknowledge);
        resolve(true);
      }

      if (btnClose) {
        btnClose.onclick = handleAcknowledge;
      } else {
        resolve(true);
      }
    });
  }

  let barredEditMode = false;

  async function fetchAndRenderBarredGuests() {
    const container = document.getElementById('barred-list-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-weight:700;">Loading barred guests...</div>';

    try {
      const res = await fetch('/api/barred');
      const data = await res.json();
      globalBarredList = data.barred || [];
    } catch (e) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--danger);font-weight:700;">Failed to load barred guests.</div>';
      return;
    }

    const searchInput = document.getElementById('barred-search');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    const filtered = query
      ? globalBarredList.filter(g => Object.values(g).some(val => String(val).toLowerCase().includes(query)))
      : globalBarredList;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-weight:700;">No barred guests found.</div>';
      return;
    }

    let cardsHtml = '<div class="barred-cards-grid">';
    filtered.forEach(g => {
      let photoHtml = `
        <div class="barred-photo-placeholder">
          <i data-lucide="camera" style="width:28px;height:28px;color:#94a3b8;"></i>
          <span>PHOTO</span>
        </div>`;
      let nameVal = '', reasonVal = '', dateVal = '', instVal = '', propVal = '';
      
      for (const [k, v] of Object.entries(g)) {
        if (k === 'id' || k === 'timestamp') continue;
        const lowerK = k.toLowerCase();
        if (lowerK.includes('photo') || lowerK.includes('image')) {
          if (String(v).startsWith('data:image/') || String(v).startsWith('http')) {
            photoHtml = `<img src="${v}" class="barred-photo-img" alt="Guest Photo" />`;
          }
        } else if (lowerK.includes('name')) {
          nameVal = v;
        } else if (lowerK.includes('reason')) {
          reasonVal = v;
        } else if (lowerK.includes('date')) {
          dateVal = v;
        } else if (lowerK.includes('inst')) {
          instVal = v;
        } else if (lowerK.includes('prop')) {
          propVal = v;
        } else {
          if (!nameVal) nameVal = v;
          else if (!reasonVal) reasonVal = v;
          else if (!dateVal) dateVal = v;
          else if (!instVal) instVal = v;
          else if (!propVal) propVal = v;
        }
      }

      cardsHtml += `
        <div class="barred-guest-card-box" data-id="${g.id}">
          <div class="barred-card-header">
            <span class="barred-badge-title">BARRED GUEST</span>
            <div class="barred-card-actions">
              <button class="btn-card-action btn-card-edit" data-id="${g.id}" title="Edit Barred Guest">
                <i data-lucide="edit-2" style="width:13px;height:13px;"></i>
              </button>
              <button class="btn-card-action btn-card-delete" data-id="${g.id}" title="Delete Barred Guest">
                <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
              </button>
            </div>
          </div>
          <div class="barred-card-body">
            <div class="barred-photo-col" data-id="${g.id}" title="Click to upload/change photo">
              ${photoHtml}
              <input type="file" class="card-photo-file-input" data-id="${g.id}" accept="image/*" style="display:none;" />
            </div>
            <div class="barred-fields-col">
              <div class="barred-field-row">
                <span class="barred-field-label">GUESTNAME:</span>
                <span class="barred-field-value barred-field-name">${escapeHTML(String(nameVal || '-'))}</span>
              </div>
              <div class="barred-field-row">
                <span class="barred-field-label">DATE:</span>
                <span class="barred-field-value">${escapeHTML(String(dateVal || '-'))}</span>
              </div>
              <div class="barred-field-row">
                <span class="barred-field-label">REASON:</span>
                <span class="barred-field-value barred-field-reason">${escapeHTML(String(reasonVal || '-'))}</span>
              </div>
              <div class="barred-field-row">
                <span class="barred-field-label">INSTRUCTION:</span>
                <span class="barred-field-value">${escapeHTML(String(instVal || '-'))}</span>
              </div>
              <div class="barred-field-row">
                <span class="barred-field-label">PROPERTY:</span>
                <span class="barred-field-value">${escapeHTML(String(propVal || '-'))}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    cardsHtml += '</div>';

    container.innerHTML = cardsHtml;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    // Attach listeners for Edit
    container.querySelectorAll('.btn-card-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const g = filtered.find(x => String(x.id) === String(id));
        if(!g) return;
        
        editingBarredId = id;
        document.getElementById('barred-guestname').value = g.guestname || g.Name || g['Guest Name'] || g.GUESTNAME || g.name || '';
        document.getElementById('barred-reason').value = g.reason || g.Reason || g.REASON || '';
        document.getElementById('barred-date').value = g.date || g.Date || g.DATE || '';
        document.getElementById('barred-inst').value = g.inst || g.Inst || g.INST || '';
        document.getElementById('barred-property').value = g.property || g.Property || g.PROPERTY || '';
        document.getElementById('barred-otherinfo').value = g.otherinfo || g.Otherinfo || '';
        
        const photoPreview = document.getElementById('barred-photo-preview');
        const photoPh = document.getElementById('barred-photo-placeholder');
        if (g.photo && g.photo.startsWith('data:image/')) {
           barredPhotoBase64 = g.photo;
           if (photoPreview) { photoPreview.src = g.photo; photoPreview.style.display = 'block'; }
           if (photoPh) photoPh.style.display = 'none';
        } else {
           barredPhotoBase64 = null;
           if (photoPreview) { photoPreview.src = ''; photoPreview.style.display = 'none'; }
           if (photoPh) photoPh.style.display = '';
        }
        
        const barredGuestModal = document.getElementById('barred-guest-modal');
        const modalTitle = barredGuestModal ? barredGuestModal.querySelector('h3') : null;
        if (modalTitle) modalTitle.innerHTML = '<i data-lucide="edit" style="vertical-align: middle; margin-right: 8px;"></i>EDIT BARRED GUEST';
        if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
        if (barredGuestModal) barredGuestModal.style.display = 'flex';
      });
    });
    
    // Attach listeners for Delete
    container.querySelectorAll('.btn-card-delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (!confirm('Are you sure you want to delete this barred guest?')) return;
        try {
          const r = await fetch(`/api/barred?id=${id}`, { method: 'DELETE' });
          if (r.ok) {
            await fetchAndRenderBarredGuests();
            await fetchGlobalBarredList();
          } else {
            alert('Failed to remove barred guest.');
          }
        } catch (e) {
          alert('Error removing barred guest.');
        }
      });
    });

    // Attach listeners for direct photo upload by clicking on photo area
    container.querySelectorAll('.barred-photo-col').forEach(photoCol => {
      const fileInput = photoCol.querySelector('.card-photo-file-input');
      const guestId = photoCol.getAttribute('data-id');

      photoCol.addEventListener('click', (e) => {
        // Prevent if user clicked something else
        if (e.target !== fileInput && fileInput) fileInput.click();
      });

      if (fileInput) {
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;

          const reader = new FileReader();
          reader.onload = async (ev) => {
            const base64Img = ev.target.result;
            try {
              const res = await fetch(`/api/barred?id=${guestId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photo: base64Img })
              });
              if (res.ok) {
                await fetchAndRenderBarredGuests();
                await fetchGlobalBarredList();
              }
            } catch (err) {
              alert('Failed to update photo.');
            }
          };
          reader.readAsDataURL(file);
        });
      }
    });
  }

  // STAFF DIRECTORY
  async function fetchAndRenderStaff() {
    const tableHead = document.getElementById('staff-list-table-head');
    const tableBody = document.getElementById('staff-list-table-body');
    if (!tableHead || !tableBody) return;
    
    tableBody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>';

    let staffList = [];
    try {
      const res = await fetch('/api/staff');
      const data = await res.json();
      staffList = data.staff || [];
    } catch (e) {
      tableBody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:40px;color:var(--danger);">Failed to load staff.</td></tr>';
      return;
    }

    const searchInput = document.getElementById('staff-search');
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    
    const filtered = query
      ? staffList.filter(s => Object.values(s).some(val => String(val).toLowerCase().includes(query)))
      : staffList;

    if (filtered.length === 0) {
      tableHead.innerHTML = '';
      tableBody.innerHTML = '<tr><td colspan="100%" style="text-align:center;padding:40px;color:var(--text-muted);">No staff found.</td></tr>';
      return;
    }

    const firstItem = filtered[0];
    let keysSet = new Set();
    filtered.forEach(g => Object.keys(g).forEach(k => {
      if(k !== 'id' && k !== 'timestamp' && k !== 'content') keysSet.add(k);
    }));
    const keys = Array.from(keysSet).filter(k => filtered.some(g => g[k] && String(g[k]).trim() !== ''));
    tableHead.innerHTML = keys.map(k => `<th style="padding: 12px; font-weight: bold; color: var(--text-secondary);">${k.toUpperCase()}</th>`).join('') + '<th style="padding: 12px; font-weight: bold; color: var(--text-secondary);">ACTIONS</th>';

    tableBody.innerHTML = filtered.map(s => {
      const tds = keys.map(k => {
      let val = String(s[k] || '');
      let content = escapeHTML(val);
      if (k.toLowerCase().includes('photo') || k.toLowerCase().includes('image')) {
        if (val.startsWith('data:image/') || val.startsWith('http')) {
           content = `<img src="${val}" style="max-width: 80px; max-height: 80px; object-fit: cover; border-radius: 4px;" alt="photo" />`;
        }
      }
      return `<td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);">${content}</td>`;
    }).join('');
      const actionTd = `<td style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05);"><button class="btn btn-secondary btn-delete-staff" data-id="${s.id}" style="padding:6px 12px;font-size:0.75rem;color:var(--danger);background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i> REMOVE</button></td>`;
      return `<tr>${tds}${actionTd}</tr>`;
    }).join('');

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    tableBody.querySelectorAll('.btn-delete-staff').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        try {
          const r = await fetch(`/api/staff?id=${id}`, { method: 'DELETE' });
          if (r.ok) {
            await fetchAndRenderStaff();
          } else {
            alert('Failed to remove staff.');
          }
        } catch (e) {
          alert('Error removing staff.');
        }
      });
    });
  }

  // Barred Guest Panel UI Event Listeners
  const btnOpenBarredModal = document.getElementById('btn-open-barred-modal');
  const btnCloseBarredModal = document.getElementById('btn-close-barred-modal');
  const barredGuestModal = document.getElementById('barred-guest-modal');
  const barredGuestForm = document.getElementById('barred-guest-form');
  const barredSearch = document.getElementById('barred-search');
  const btnCloseBarredGuests = document.getElementById('btn-close-barred-guests');
  const barredPhotoInput = document.getElementById('barred-photo-input');
  const barredPhotoBox = document.getElementById('barred-photo-box');
  const barredPhotoPreview = document.getElementById('barred-photo-preview');
  const barredPhotoPh = document.getElementById('barred-photo-placeholder');
  const btnImportBarredDoc = document.getElementById('btn-import-barred-doc');
  const barredDocUpload = document.getElementById('barred-doc-upload');
  const btnDeleteAllBarred = document.getElementById('btn-delete-all-barred');
  const btnToggleBarredEdit = document.getElementById('btn-toggle-barred-edit');
  let editingBarredId = null;
  let barredPhotoBase64 = null;

  if (btnOpenBarredModal) {
    btnOpenBarredModal.addEventListener('click', () => {
      editingBarredId = null;
      barredPhotoBase64 = null;
      if (barredGuestForm) barredGuestForm.reset();
      if (barredPhotoPreview) { barredPhotoPreview.style.display = 'none'; barredPhotoPreview.src = ''; }
      if (barredPhotoPh) barredPhotoPh.style.display = '';
      const modalTitle = barredGuestModal ? barredGuestModal.querySelector('h3') : null;
      if (modalTitle) modalTitle.innerHTML = '<i data-lucide="ban" style="vertical-align:middle;margin-right:8px;"></i>ADD BARRED GUEST';
      if (barredGuestModal) barredGuestModal.style.display = 'flex';
      lucide.createIcons();
    });
  }

  if (btnCloseBarredModal) {
    btnCloseBarredModal.addEventListener('click', () => {
      if (barredGuestModal) barredGuestModal.style.display = 'none';
    });
  }

  if (btnCloseBarredGuests) {
    btnCloseBarredGuests.addEventListener('click', () => {
      if (barredGuestsPanel) barredGuestsPanel.style.display = 'none';
      showHomePanel();
    });
  }

  if (barredSearch) {
    barredSearch.addEventListener('input', fetchAndRenderBarredGuests);
  }

  if (barredPhotoBox && barredPhotoInput) {
    barredPhotoBox.addEventListener('click', () => barredPhotoInput.click());
    barredPhotoInput.addEventListener('change', () => {
      const file = barredPhotoInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        barredPhotoBase64 = ev.target.result;
        if (barredPhotoPreview) { barredPhotoPreview.src = barredPhotoBase64; barredPhotoPreview.style.display = 'block'; }
        if (barredPhotoPh) barredPhotoPh.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });
  }

  if (barredGuestForm) {
    barredGuestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const guestname = (document.getElementById('barred-guestname').value || '').trim();
      const reason = (document.getElementById('barred-reason').value || '').trim();
      const date = (document.getElementById('barred-date').value || '').trim();
      const inst = (document.getElementById('barred-inst').value || '').trim();
      const property = (document.getElementById('barred-property').value || '').trim();
      const otherinfo = (document.getElementById('barred-otherinfo').value || '').trim();
      if (!guestname) { alert('Guest Name is required.'); return; }

      const payload = { guestname, reason, date, inst, property, otherinfo, photo: barredPhotoBase64 || null };
      const url = editingBarredId ? `/api/barred?id=${editingBarredId}` : '/api/barred';
      const method = editingBarredId ? 'PUT' : 'POST';

      try {
        const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Failed to save.'); return; }
        if (barredGuestModal) barredGuestModal.style.display = 'none';
        barredGuestForm.reset();
        editingBarredId = null;
        barredPhotoBase64 = null;
        await fetchAndRenderBarredGuests();
        await fetchGlobalBarredList();
      } catch (err) {
        alert('Error saving barred guest.');
      }
    });

    barredGuestForm.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const submitBtn = barredGuestModal ? barredGuestModal.querySelector('button[type="submit"]') : null;
        if (submitBtn) {
          submitBtn.click();
        } else {
          barredGuestForm.requestSubmit();
        }
      }
    });
  }

  // Universal File Parser: Excel (.xlsx, .xls, .csv), Word (.docx), PDF (.pdf, .txt)
  async function parseBarredFile(file) {
    const name = file.name || '';
    const ext = name.split('.').pop().toLowerCase();
    
    // 1. EXCEL / CSV
    if (['xlsx', 'xls', 'csv'].includes(ext)) {
      const data = await file.arrayBuffer();
      const imgMap = (typeof extractExcelImages === 'function') ? await extractExcelImages(data) : {};
      const wb = XLSX.read(data);
      const ws = wb.Sheets[wb.SheetNames[0]];
      let rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      rows = rows.filter(s => {
        const vals = Object.values(s).map(v => String(v).toUpperCase().trim());
        return !(vals.includes('NAME') && vals.includes('REASON'));
      });
      const guests = [];
      rows.forEach(r => {
        const g = {};
        for (const [k, v] of Object.entries(r)) {
          const kLow = k.toLowerCase().trim();
          if (kLow.includes('name')) g.guestname = String(v).trim();
          else if (kLow.includes('reason')) g.reason = String(v).trim();
          else if (kLow.includes('date')) g.date = String(v).trim();
          else if (kLow.includes('inst')) g.inst = String(v).trim();
          else if (kLow.includes('prop')) g.property = String(v).trim();
          else if (kLow.includes('photo')) g.photo = v;
          else if (kLow.includes('other')) g.otherinfo = String(v).trim();
        }
        if (r.__rowNum__ !== undefined && imgMap[r.__rowNum__]) {
          g.photo = imgMap[r.__rowNum__];
        }
        if (g.guestname) guests.push(g);
      });
      return guests;
    }

    // 2. WORD (.docx)
    if (ext === 'docx') {
      const data = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(data);
      const docXml = zip.file('word/document.xml');
      if (!docXml) throw new Error('Invalid Word document: missing document.xml');
      const xmlStr = await docXml.async('text');
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
      
      const guests = [];
      const tables = xmlDoc.getElementsByTagName('w:tbl');
      if (tables && tables.length > 0) {
        for (let t = 0; t < tables.length; t++) {
          const rows = tables[t].getElementsByTagName('w:tr');
          if (rows.length < 2) continue;
          const headers = [];
          const headerCells = rows[0].getElementsByTagName('w:tc');
          for (let c = 0; c < headerCells.length; c++) {
            headers.push(headerCells[c].textContent.trim().toLowerCase());
          }
          for (let r = 1; r < rows.length; r++) {
            const cells = rows[r].getElementsByTagName('w:tc');
            if (cells.length === 0) continue;
            const g = {};
            for (let c = 0; c < cells.length; c++) {
              const val = cells[c].textContent.trim();
              const h = headers[c] || '';
              if (h.includes('name')) g.guestname = val;
              else if (h.includes('reason')) g.reason = val;
              else if (h.includes('date')) g.date = val;
              else if (h.includes('inst')) g.inst = val;
              else if (h.includes('prop')) g.property = val;
              else if (h.includes('other')) g.otherinfo = val;
            }
            if (g.guestname) guests.push(g);
          }
        }
      }
      
      if (guests.length === 0) {
        const paras = xmlDoc.getElementsByTagName('w:p');
        for (let i = 0; i < paras.length; i++) {
          const txt = paras[i].textContent.trim();
          if (!txt) continue;
          const parts = txt.split(/[,;\t|]+/);
          const g = {};
          parts.forEach(p => {
            const idx = p.indexOf(':');
            if (idx > -1) {
              const k = p.substring(0, idx).trim().toLowerCase();
              const v = p.substring(idx + 1).trim();
              if (k.includes('name')) g.guestname = v;
              else if (k.includes('reason')) g.reason = v;
              else if (k.includes('date')) g.date = v;
              else if (k.includes('inst')) g.inst = v;
              else if (k.includes('prop')) g.property = v;
            }
          });
          if (g.guestname) guests.push(g);
        }
      }
      return guests;
    }

    // 3. PDF (.pdf) or TEXT (.txt)
    if (ext === 'pdf' || ext === 'txt' || ext === 'doc') {
      const text = await file.text();
      const cleanLines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
      const guests = [];
      cleanLines.forEach(line => {
        const parts = line.split(/[,;\t|]+/);
        const g = {};
        parts.forEach(p => {
          const idx = p.indexOf(':');
          if (idx > -1) {
            const k = p.substring(0, idx).trim().toLowerCase();
            const v = p.substring(idx + 1).trim();
            if (k.includes('name')) g.guestname = v;
            else if (k.includes('reason')) g.reason = v;
            else if (k.includes('date')) g.date = v;
            else if (k.includes('inst')) g.inst = v;
            else if (k.includes('prop')) g.property = v;
          }
        });
        if (g.guestname) guests.push(g);
      });
      return guests;
    }

    throw new Error('Unsupported format. Please select an Excel (.xlsx, .xls, .csv), Word (.docx), or PDF (.pdf) file.');
  }

  // Import button listener (Excel, Word, PDF)
  if (btnImportBarredDoc && barredDocUpload) {
    btnImportBarredDoc.addEventListener('click', () => barredDocUpload.click());
    barredDocUpload.addEventListener('change', async () => {
      const file = barredDocUpload.files[0];
      if (!file) return;
      try {
        btnImportBarredDoc.disabled = true;
        btnImportBarredDoc.innerHTML = `<i data-lucide="loader" class="spin"></i> Importing...`;
        if (window.lucide) lucide.createIcons();

        const guests = await parseBarredFile(file);
        if (!guests || guests.length === 0) {
          alert('No valid barred guest records found in file. Make sure file contains Name/Guestname and Reason.');
          return;
        }

        const res = await fetch('/api/barred/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guests })
        });
        const result = await res.json();
        if (result.success) {
          alert(`Successfully imported ${result.count} barred guests!`);
          await fetchAndRenderBarredGuests();
          await fetchGlobalBarredList();
        } else {
          alert(result.error || 'Import failed.');
        }
      } catch (err) {
        alert('Failed to parse file: ' + err.message);
      } finally {
        barredDocUpload.value = '';
        btnImportBarredDoc.disabled = false;
        btnImportBarredDoc.innerHTML = `<i data-lucide="upload-cloud" style="width: 16px; height: 16px;"></i><span>IMPORT EXCEL / WORD / PDF</span>`;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Delete all barred guests
  if (btnDeleteAllBarred) {
    btnDeleteAllBarred.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete ALL barred guests?')) return;
      try {
        const res = await fetch('/api/barred?all=true', { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
          await fetchAndRenderBarredGuests();
          await fetchGlobalBarredList();
        } else {
          alert(data.error || 'Failed to delete all barred guests.');
        }
      } catch (err) {
        alert('Error deleting all barred guests.');
      }
    });
  }

  // Toggle Edit mode
  if (btnToggleBarredEdit) {
    btnToggleBarredEdit.addEventListener('click', () => {
      barredEditMode = !barredEditMode;
      btnToggleBarredEdit.classList.toggle('active', barredEditMode);
      const container = document.getElementById('barred-list-container');
      if (container) {
        container.querySelectorAll('.btn-card-edit').forEach(el => {
          el.style.transform = barredEditMode ? 'scale(1.2)' : '';
          el.style.borderColor = barredEditMode ? '#f59e0b' : '';
        });
      }
    });
  }

  const btnStaffPanel = document.getElementById('btn-staff-panel');
  const staffDirectoryPanelCard = document.getElementById('staff-directory-panel-card');
  const btnCloseStaffDirectory = document.getElementById('btn-close-staff-directory');
  const btnImportStaffExcel = document.getElementById('btn-import-staff-excel');
  const staffExcelUpload = document.getElementById('staff-excel-upload');
  const staffSearch = document.getElementById('staff-search');

  if (btnStaffPanel) {
    if (btnStaffPanel) btnStaffPanel.addEventListener('click', () => {
      barredGuestsPanel.style.display = 'none';
      staffDirectoryPanelCard.style.display = 'flex';
      fetchAndRenderStaff();
    });
  }
  
  if (btnCloseStaffDirectory) {
    if (btnCloseStaffDirectory) btnCloseStaffDirectory.addEventListener('click', () => {
      staffDirectoryPanelCard.style.display = 'none';
      barredGuestsPanel.style.display = 'flex';
      fetchAndRenderBarredGuests();
    });
  }

  if (staffSearch) {
    if (staffSearch) staffSearch.addEventListener('input', fetchAndRenderStaff);
  }

  if (btnImportStaffExcel && staffExcelUpload) {
    if (btnImportStaffExcel) btnImportStaffExcel.addEventListener('click', () => staffExcelUpload.click());
    if (staffExcelUpload) staffExcelUpload.addEventListener('change', async () => {
      const file = staffExcelUpload.files[0];
      if (!file) return;
      try {
        const data = await file.arrayBuffer();
        const imgMap = await extractExcelImages(data);
        const wb = XLSX.read(data);
        const ws = wb.Sheets[wb.SheetNames[0]];
        let staff = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
        // Filter out header rows that got interpreted as data
        staff = staff.filter(s => {
           const vals = Object.values(s).map(v => String(v).toUpperCase().trim());
           return !(vals.includes('NAME') && vals.includes('DEPARTMENT'));
        });
        staff.forEach(s => {
           if (s.__rowNum__ !== undefined && imgMap[s.__rowNum__]) {
              s.photo = imgMap[s.__rowNum__];
           }
        });
        if (staff.length === 0) { alert('No valid staff found in file.'); return; }
        const res = await fetch('/api/staff/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff }) });
        const result = await res.json();
        if (result.success) {
          alert(`Imported ${result.count} staff members.`);
          await fetchAndRenderStaff();
        } else {
          alert(result.error || 'Import failed.');
        }
      } catch (err) {
        alert('Failed to parse file. Ensure it is a valid Excel/CSV.');
      }
      staffExcelUpload.value = '';
    });
  }

  // Helper: Format amount to K (e.g. 500000 -> 500K)
  function formatKCurrency(value) {
    if (!value || isNaN(value)) return '0';
    if (value >= 1000) {
      let kValue = value / 1000;
      return (Number.isInteger(kValue) ? kValue : kValue.toFixed(1)) + 'K';
    }
    return value.toString();
  }

  // Helper: Entry to Sentence Form
  function getEntrySentence(entry) {
    const t = (entry.type || '').toUpperCase();
    const amt = formatKCurrency(Number(entry.amount) || 0);
    const guest = escapeHTML(entry.guestname || 'Unknown');
    const card = entry.card ? escapeHTML(entry.card) : '';
    const info = entry.otherinfo ? ` (${escapeHTML(entry.otherinfo)})` : '';

    // CASHIN/CASHOUT: include otherinfo if present
    if (t === 'CASHIN' || t === 'C/IN')   return `${amt} CASHIN BY ${guest}${info}`;
    if (t === 'CASHOUT' || t === 'C/OUT')  return `${amt} CASHOUT BY ${guest}${info}`;
    // ISSUE/DEPOSIT: card + otherinfo
    if (t === 'ISSUE')    return `${amt} ISSUE TO ${guest} FROM ${card} CARD${info}`;
    if (t === 'DEPOSIT')  return `${amt} DEPOSIT BY ${guest} ON ${card} CARD${info}`;
    // KEYIN/KEYOUT: otherinfo only (no card)
    if (t === 'KEYIN')    return `${amt} KEYIN BY ${guest}${info}`;
    if (t === 'KEYOUT')   return `${amt} KEYOUT BY ${guest}${info}`;
    
    return `${amt} ${t} BY ${guest}${info}`;
  }

  // Open Major Guest Details Modal
  function openMajorGuestModal(guest, netScore, inOut, entries) {
    const modal = document.getElementById('major-guest-details-modal');
    if (!modal) return;
    const nameEl = document.getElementById('major-modal-guest-name');
    const statsEl = document.getElementById('major-modal-stats');
    const listEl = document.getElementById('major-modal-entries-list');

    if (nameEl) nameEl.textContent = guest.toUpperCase();

    const totalIn = inOut ? inOut.in : 0;
    const totalOut = inOut ? inOut.out : 0;
    let resClass = 'text-neutral';
    let resStr = formatCurrency(Math.abs(netScore));
    if (netScore < 0) {
      resClass = 'text-red';
      resStr = '-' + resStr;
    } else if (netScore > 0) {
      resClass = 'text-green';
      resStr = '+' + resStr;
    } else {
      resStr = '₹0';
    }

    if (statsEl) {
      statsEl.innerHTML = `
        <div style="flex: 1; text-align: center; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; padding: 10px;">
          <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">TOTAL IN</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #38bdf8; font-family: monospace;">${formatCurrency(totalIn)}</div>
        </div>
        <div style="flex: 1; text-align: center; background: rgba(251, 146, 60, 0.08); border: 1px solid rgba(251, 146, 60, 0.2); border-radius: 8px; padding: 10px;">
          <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">TOTAL OUT</div>
          <div style="font-size: 1.15rem; font-weight: 800; color: #fb923c; font-family: monospace;">${formatCurrency(totalOut)}</div>
        </div>
        <div style="flex: 1; text-align: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 10px;">
          <div style="font-size: 0.72rem; color: #94a3b8; font-weight: 700; text-transform: uppercase;">RESULT</div>
          <div class="${resClass}" style="font-size: 1.15rem; font-weight: 800; font-family: monospace;">${resStr}</div>
        </div>
      `;
    }

    if (listEl) {
      if (!entries || entries.length === 0) {
        listEl.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px;">No entries today</div>';
      } else {
        listEl.innerHTML = entries.map(e => {
          const t = (e.type || '').toUpperCase();
          const isCredit = ['CASHIN', 'C/IN', 'ISSUE', 'KEYIN'].includes(t);
          const colorClass = isCredit ? 'text-green' : 'text-red';
          const typeBorder = isCredit ? '#10b981' : '#ef4444';
          const time = e.datetime ? e.datetime.replace('T', ' ').slice(11, 16) : '';
          return `
            <div style="background: rgba(255, 255, 255, 0.03); border-left: 3px solid ${typeBorder}; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem;">
              <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <span style="font-size: 0.8rem; color: #94a3b8; font-family: monospace;">${time}</span>
                <span style="font-weight: 700; color: #fff;">${escapeHTML(t)}</span>
                ${e.card ? `<span style="font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: #cbd5e1;">${escapeHTML(e.card)}</span>` : ''}
                ${e.otherinfo ? `<span style="font-size: 0.8rem; color: #94a3b8;">(${escapeHTML(e.otherinfo)})</span>` : ''}
              </div>
              <div class="${colorClass}" style="font-weight: 800; font-family: monospace; font-size: 1.05rem; white-space: nowrap; margin-left: 10px;">
                ${formatCurrency(e.amount)}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    modal.style.display = 'flex';
  }

  function closeMajorGuestModal() {
    const modal = document.getElementById('major-guest-details-modal');
    if (modal) modal.style.display = 'none';
  }

  const btnCloseMajorModal = document.getElementById('btn-close-major-modal');
  if (btnCloseMajorModal) {
    btnCloseMajorModal.addEventListener('click', closeMajorGuestModal);
  }
  const majorGuestModal = document.getElementById('major-guest-details-modal');
  if (majorGuestModal) {
    majorGuestModal.addEventListener('click', (e) => {
      if (e.target === majorGuestModal) closeMajorGuestModal();
    });
  }

  // Track view mode for Major Patron: 'cards' or 'entries_by_guest'
  let majorViewMode = 'cards';

  // Helper: check if type is TOTAL IN (CASHIN OR C/IN, ISSUE, KEY/IN)
  function isTotalInType(type) {
    if (!type) return false;
    const clean = String(type).trim().toUpperCase().replace(/[\s\-_]/g, '');
    const norm = clean.replace(/[\/\\]/g, '/');
    return (
      norm === 'CASHIN' ||
      norm === 'C/IN' ||
      norm === 'CIN' ||
      norm === 'ISSUE' ||
      norm === 'KEY/IN' ||
      norm === 'KEYIN'
    );
  }

  // Helper: check if type is TOTAL OUT (CASHOUT OR C/OUT, DEPOSIT, KY/OUT)
  function isTotalOutType(type) {
    if (!type) return false;
    const clean = String(type).trim().toUpperCase().replace(/[\s\-_]/g, '');
    const norm = clean.replace(/[\/\\]/g, '/');
    return (
      norm === 'CASHOUT' ||
      norm === 'C/OUT' ||
      norm === 'COUT' ||
      norm === 'DEPOSIT' ||
      norm === 'KEY/OUT' ||
      norm === 'KEYOUT' ||
      norm === 'KY/OUT' ||
      norm === 'KYOUT' ||
      norm === 'PAID'
    );
  }

  // Render Major
  function renderMajor() {
    if(!majorListContainer) return;
    majorListContainer.innerHTML = '';
    const query = majorSearch ? majorSearch.value.trim().toLowerCase() : '';

    // Update toggle button text & icon according to active view mode
    const btnToggleMajor = document.getElementById('btn-toggle-major-view');
    if (btnToggleMajor) {
      if (majorViewMode === 'entries_by_guest') {
        btnToggleMajor.className = 'btn btn-primary';
        btnToggleMajor.style.background = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
        btnToggleMajor.style.color = '#fff';
        btnToggleMajor.innerHTML = '<i data-lucide="layout-grid" style="width: 16px; height: 16px; color: #fff;"></i> <span id="btn-toggle-major-view-text">VIEW PATRON CARDS</span>';
      } else {
        btnToggleMajor.className = 'btn btn-secondary';
        btnToggleMajor.style.background = 'rgba(167, 139, 250, 0.12)';
        btnToggleMajor.style.color = '#c4b5fd';
        btnToggleMajor.innerHTML = '<i data-lucide="list" style="width: 16px; height: 16px; color: #a78bfa;"></i> <span id="btn-toggle-major-view-text">VIEW EACH ENTRIES BY GUEST NAME</span>';
      }
    }

    // Group strictly by Guest Name (case-insensitive deduplication, EXACTLY ONE box per guest name)
    const guestMap = {}; // key: UPPERCASE guest name

    const currentEntries = allEntries.filter(isEntryForToday);

    currentEntries.forEach(e => {
      const rawGuest = (e.guestname || '').trim();
      if (!rawGuest) return;
      const key = rawGuest.toUpperCase();

      if (!guestMap[key]) {
        guestMap[key] = {
          name: rawGuest.toUpperCase(),
          entries: [],
          totalIn: 0,
          totalOut: 0
        };
      }

      const amt = Number(e.amount) || 0;
      const t = e.type || '';

      if (isTotalInType(t)) {
        guestMap[key].totalIn += amt;
      } else if (isTotalOutType(t)) {
        guestMap[key].totalOut += amt;
      }

      guestMap[key].entries.push(e);
    });

    // Filter guests matching search query
    let guestList = Object.values(guestMap);
    if (query) {
      guestList = guestList.filter(g => g.name.toLowerCase().includes(query));
    }

    // -------------------------------------------------------------
    // MODE 1: ENTRIES BY GUEST NAME VIEW
    // -------------------------------------------------------------
    if (majorViewMode === 'entries_by_guest') {
      // Sort guests alphabetically by name
      guestList.sort((a, b) => a.name.localeCompare(b.name));

      if (guestList.length === 0) {
        majorListContainer.innerHTML = `
          <div class="mp-empty-state" style="margin: auto; width: 100%; max-width: 500px;">
            <i data-lucide="users" style="width:40px;height:40px;opacity:0.4;margin-bottom:8px;"></i>
            <p style="margin: 0; font-size: 1rem;">${query ? 'No matching guests found.' : 'No patron entries recorded today.'}</p>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      let groupsHtml = '';
      guestList.forEach(g => {
        // Result = Total Out minus Total In
        const netResult = g.totalOut - g.totalIn;
        const isNegative = netResult < 0;
        const resultColorClass = isNegative ? 'text-red' : 'text-green';
        let formattedResult = formatCurrency(Math.abs(netResult));
        if (isNegative) {
          formattedResult = '-' + formattedResult;
        } else if (netResult > 0) {
          formattedResult = '+' + formattedResult;
        } else {
          formattedResult = '₹0';
        }

        // Sort guest entries chronologically
        const sortedEntries = [...g.entries].sort((a, b) => (a.datetime || '').localeCompare(b.datetime || ''));

        const entriesRows = sortedEntries.map(e => {
          const t = (e.type || '').toUpperCase();
          const isCredit = isTotalInType(t);
          const colorClass = isCredit ? 'text-green' : 'text-red';
          const borderCol = isCredit ? '#10b981' : '#ef4444';
          const time = e.datetime ? e.datetime.replace('T', ' ').slice(11, 16) : '';
          return `
            <div style="background: rgba(255, 255, 255, 0.03); border-left: 3px solid ${borderCol}; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 0.95rem;">
              <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                <span style="font-size: 0.8rem; color: #94a3b8; font-family: monospace;">${time}</span>
                <span style="font-weight: 700; color: #fff; background: rgba(255,255,255,0.06); padding: 2px 8px; border-radius: 4px;">${escapeHTML(t)}</span>
                ${e.card ? `<span style="font-size: 0.8rem; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; color: #cbd5e1;">${escapeHTML(e.card)}</span>` : ''}
                ${e.otherinfo ? `<span style="font-size: 0.82rem; color: #a78bfa; font-weight: 500;">(${escapeHTML(e.otherinfo)})</span>` : ''}
              </div>
              <div class="${colorClass}" style="font-weight: 800; font-family: monospace; font-size: 1.05rem; white-space: nowrap; margin-left: 12px;">
                ${formatCurrency(e.amount)}
              </div>
            </div>
          `;
        }).join('');

        groupsHtml += `
          <div class="major-guest-group-card" style="flex: 0 0 auto !important; flex-shrink: 0 !important; min-height: 80px; display: flex; flex-direction: column;">
            <!-- Header: Guest Name and In/Out/Result -->
            <div style="padding: 14px 18px; background: rgba(0, 0, 0, 0.3); border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 1.2rem; font-weight: 800; color: #fff; letter-spacing: 0.5px;">${escapeHTML(g.name)}</span>
                <span style="font-size: 0.78rem; background: rgba(255,255,255,0.08); padding: 3px 8px; border-radius: 6px; color: #cbd5e1; font-weight: 600;">${g.entries.length} ${g.entries.length === 1 ? 'entry' : 'entries'}</span>
              </div>
              <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                <div style="font-size: 0.88rem;"><span style="color:#94a3b8; font-weight:600;">TOTAL IN:</span> <strong style="color:#38bdf8; font-family:monospace; margin-left:4px;">${formatCurrency(g.totalIn)}</strong></div>
                <div style="font-size: 0.88rem;"><span style="color:#94a3b8; font-weight:600;">TOTAL OUT:</span> <strong style="color:#fb923c; font-family:monospace; margin-left:4px;">${formatCurrency(g.totalOut)}</strong></div>
                <div style="font-size: 0.88rem;"><span style="color:#94a3b8; font-weight:600;">RESULT:</span> <strong class="${resultColorClass}" style="font-family:monospace; font-size: 1.05rem; margin-left:4px;">${formattedResult}</strong></div>
              </div>
            </div>

            <!-- List of All Entries For This Guest -->
            <div class="major-guest-entry-card-list" style="padding: 12px 16px; display: flex; flex-direction: column; gap: 8px; max-height: 280px; overflow-y: auto;">
              ${entriesRows}
            </div>
          </div>
        `;
      });

      majorListContainer.innerHTML = `
        <div class="major-guest-entries-view">
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 12px 18px; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <i data-lucide="users" style="width: 20px; height: 20px; color: #a78bfa;"></i>
              <span style="font-weight: 800; font-size: 1rem; color: #fff; letter-spacing: 0.5px;">ALL ENTRIES SORTED BY GUEST NAME</span>
              <span style="font-size: 0.8rem; background: rgba(167, 139, 250, 0.2); color: #c4b5fd; padding: 2px 10px; border-radius: 12px; font-weight: 700;">${guestList.length} Unique ${guestList.length === 1 ? 'Guest' : 'Guests'}</span>
            </div>
            <div style="font-size: 0.85rem; color: #94a3b8;">
              Each guest has one dedicated section with all transactions
            </div>
          </div>
          ${groupsHtml}
        </div>
      `;
      lucide.createIcons();
      return;
    }

    // -------------------------------------------------------------
    // MODE 2: 4-COLUMN CARDS GRID + ABOVE TOTAL 500000 (DEFAULT)
    // -------------------------------------------------------------

    // Sort guests by total turnover descending
    guestList.sort((a, b) => {
      const volA = a.totalIn + a.totalOut;
      const volB = b.totalIn + b.totalOut;
      return volB - volA;
    });

    let leftCardsHtml = '';
    let aboveCardsHtml = '';

    guestList.forEach(g => {
      const totalIn = g.totalIn;
      const totalOut = g.totalOut;
      // Result = Total Out minus Total In
      const netResult = totalOut - totalIn;
      const totalVolume = totalIn + totalOut;

      // If result is minus, make it RED, otherwise GREEN
      const isNegative = netResult < 0;
      const resultColorClass = isNegative ? 'text-red' : 'text-green';
      let formattedResult = formatCurrency(Math.abs(netResult));
      if (isNegative) {
        formattedResult = '-' + formattedResult;
      } else if (netResult > 0) {
        formattedResult = '+' + formattedResult;
      } else {
        formattedResult = '₹0';
      }

      // 4-Column Grid Card on Left (Exactly 1 box per guest name)
      leftCardsHtml += `
        <div class="mp-grid-card" data-guest="${escapeHTML(g.name)}" title="Click to view details for ${escapeHTML(g.name)}">
          <div class="mp-card-name">${escapeHTML(g.name)}</div>
          <div class="mp-card-line">
            <span class="mp-card-lbl">TOTAL IN</span>
            <span class="mp-card-val mp-in">${formatCurrency(totalIn)}</span>
          </div>
          <div class="mp-card-line">
            <span class="mp-card-lbl">TOTAL OUT</span>
            <span class="mp-card-val mp-out">${formatCurrency(totalOut)}</span>
          </div>
          <div class="mp-card-line mp-result-line">
            <span class="mp-card-lbl">RESULT</span>
            <span class="mp-card-val ${resultColorClass}">${formattedResult}</span>
          </div>
        </div>
      `;

      // Check if qualifies for ABOVE TOTAL 500000
      const isAbove500k = totalVolume >= 500000 || totalIn >= 500000 || totalOut >= 500000 || Math.abs(netResult) >= 500000;
      if (isAbove500k) {
        aboveCardsHtml += `
          <div class="mp-above-card" data-guest="${escapeHTML(g.name)}" title="Click to view details for ${escapeHTML(g.name)}">
            <div class="mp-above-name">${escapeHTML(g.name)}</div>
            <div class="mp-above-result-box">
              <span class="mp-above-lbl">RESULT</span>
              <span class="mp-above-val ${resultColorClass}">${formattedResult}</span>
            </div>
          </div>
        `;
      }
    });

    if (!leftCardsHtml) {
      leftCardsHtml = `
        <div class="mp-empty-state">
          <i data-lucide="user-x" style="width:36px;height:36px;opacity:0.4;margin-bottom:8px;"></i>
          <p style="margin: 0;">${query ? 'No matching patrons found.' : 'No transactions recorded today.'}</p>
        </div>
      `;
    }

    if (!aboveCardsHtml) {
      aboveCardsHtml = `
        <div class="mp-above-empty">
          <i data-lucide="shield-check" style="width:32px;height:32px;opacity:0.4;margin-bottom:6px;"></i>
          <p style="margin: 0; font-size: 0.85rem;">No patrons above 500,000</p>
        </div>
      `;
    }

    majorListContainer.innerHTML = `
      <div class="major-split-container">
        <!-- Left: 4-Column Grid (with independent scrollbar if many guests) -->
        <div class="major-left-section">
          <div class="major-cards-grid">
            ${leftCardsHtml}
          </div>
        </div>

        <!-- Center Divider -->
        <div class="major-divider"></div>

        <!-- Right: ABOVE TOTAL 500000 (with independent scrollbar if many guests) -->
        <div class="major-right-section">
          <div class="major-sidebar-header">
            <i data-lucide="trending-up" style="width: 18px; height: 18px; color: #fbbf24;"></i>
            <span>ABOVE TOTAL 500000</span>
          </div>
          <div class="major-sidebar-list">
            ${aboveCardsHtml}
          </div>
        </div>
      </div>
    `;

    // Click handler for all cards to open transaction details modal
    majorListContainer.querySelectorAll('.mp-grid-card, .mp-above-card').forEach(card => {
      card.addEventListener('click', () => {
        const guestName = card.getAttribute('data-guest');
        if (guestName && guestMap[guestName]) {
          const g = guestMap[guestName];
          const net = g.totalOut - g.totalIn;
          openMajorGuestModal(g.name, net, { in: g.totalIn, out: g.totalOut }, g.entries);
        }
      });
    });

    lucide.createIcons();
  }

  // Toggle Major Patron View Button (ONLY in Major Patron)
  const btnToggleMajorView = document.getElementById('btn-toggle-major-view');
  if (btnToggleMajorView) {
    btnToggleMajorView.addEventListener('click', () => {
      majorViewMode = majorViewMode === 'cards' ? 'entries_by_guest' : 'cards';
      renderMajor();
    });
  }

  if(majorSearch) {
    majorSearch.addEventListener('input', renderMajor);
    majorSearch.addEventListener('keydown', (e) => {
      if(e.key === 'Enter') {
        e.preventDefault();
        renderMajor();
      }
    });
  }

  const btnMajorSearchAction = document.getElementById('btn-major-search-action');
  if(btnMajorSearchAction) {
    btnMajorSearchAction.addEventListener('click', renderMajor);
  }

  const refreshMajorBtn = document.getElementById('refreshMajor');
  if(refreshMajorBtn) {
    refreshMajorBtn.addEventListener('click', () => {
      if(majorSearch) majorSearch.value = '';
      renderMajor();
    });
  }

  // Render All Entries
  function renderAllEntries() {
    updateAllEntriesView();
  }

  // Excel Export Helper using SheetJS
  function exportToExcel(entriesToExport, filename = 'Surveillance_Export') {
    if(!window.XLSX) {
      alert("Excel library not loaded yet.");
      return;
    }
    const exportData = entriesToExport.map(e => ({
      "Date & Time": e.datetime.replace('T', ' '),
      "SURV ID": e.surv,
      "C / D": e.cd,
      "Cashier": e.cashier,
      "Type": e.type,
      "Amount": e.amount,
      "Guest Name": e.guestname,
      "Card": e.card || '',
      "Other Info": e.otherinfo || '',
      "Sentence Format": getEntrySentence(e)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Surveillance Logs");
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // View Toggle Logic for Home Screen (Sentence vs Table)
  const btnHomeViewSentence = document.getElementById('btn-home-view-sentence');
  const btnHomeViewTable = document.getElementById('btn-home-view-table');
  const homeSentenceView = document.getElementById('home-entries-sentence-view');
  const homeTableView = document.getElementById('home-entries-table-view');

  if (btnHomeViewSentence && btnHomeViewTable) {
    btnHomeViewSentence.addEventListener('click', () => {
      btnHomeViewSentence.classList.add('active');
      btnHomeViewTable.classList.remove('active');
      btnHomeViewSentence.style.background = 'var(--primary)';
      btnHomeViewSentence.style.color = '#fff';
      btnHomeViewSentence.style.border = 'none';
      btnHomeViewTable.style.background = 'rgba(255,255,255,0.08)';
      btnHomeViewTable.style.color = '#94a3b8';
      btnHomeViewTable.style.border = '1px solid rgba(255,255,255,0.15)';
      if (homeSentenceView) homeSentenceView.style.setProperty('display', 'block', 'important');
      if (homeTableView) homeTableView.style.setProperty('display', 'none', 'important');
    });

    btnHomeViewTable.addEventListener('click', () => {
      btnHomeViewTable.classList.add('active');
      btnHomeViewSentence.classList.remove('active');
      btnHomeViewTable.style.background = 'var(--primary)';
      btnHomeViewTable.style.color = '#fff';
      btnHomeViewTable.style.border = 'none';
      btnHomeViewSentence.style.background = 'rgba(255,255,255,0.08)';
      btnHomeViewSentence.style.color = '#94a3b8';
      btnHomeViewSentence.style.border = '1px solid rgba(255,255,255,0.15)';
      if (homeTableView) homeTableView.style.setProperty('display', 'block', 'important');
      if (homeSentenceView) homeSentenceView.style.setProperty('display', 'none', 'important');
    });
  }

  // View Toggle Logic for All Entries Panel
  const btnViewNormal = document.getElementById('btn-view-normal');
  const btnViewSentence = document.getElementById('btn-view-sentence');
  const allEntriesNormalView = document.getElementById('all-entries-normal-view');

  if (btnViewNormal && btnViewSentence) {
    if (btnViewNormal) btnViewNormal.addEventListener('click', () => {
      btnViewNormal.classList.add('active');
      btnViewSentence.classList.remove('active');

      if (allEntriesNormalView) allEntriesNormalView.style.setProperty('display', 'block', 'important');
      if (allEntriesListContainer) allEntriesListContainer.style.setProperty('display', 'none', 'important');
    });
    if (btnViewSentence) btnViewSentence.addEventListener('click', () => {
      btnViewSentence.classList.add('active');
      btnViewNormal.classList.remove('active');

      if (allEntriesListContainer) allEntriesListContainer.style.setProperty('display', 'block', 'important');
      if (allEntriesNormalView) allEntriesNormalView.style.setProperty('display', 'none', 'important');
    });
  }

  if(btnExportAll) {
    btnExportAll.addEventListener('click', async () => {
      const dateVal = allEntriesDatePicker ? allEntriesDatePicker.value : '';
      const query = allEntriesSearch.value.toLowerCase().trim();

      let sourceEntries = allEntries;

      if (dateVal) {
        sourceEntries = sourceEntries.filter(entry => {
          if (!entry.datetime) return false;
          return getBusinessDate(entry.datetime) === dateVal;
        });
      }

      if (query) {
        sourceEntries = sourceEntries.filter(entry => {
          const nameMatch = entry.guestname && entry.guestname.toLowerCase().includes(query);
          const cashierMatch = entry.cashier && entry.cashier.toLowerCase().includes(query);
          const typeMatch = entry.type && entry.type.toLowerCase().includes(query);
          const survMatch = entry.surv && entry.surv.toLowerCase().includes(query);
          const cdMatch = entry.cd && entry.cd.toLowerCase().includes(query);
          const cardMatch = entry.card && entry.card.toLowerCase().includes(query);
          const otherInfoMatch = entry.otherinfo && entry.otherinfo.toLowerCase().includes(query);
          const amountMatch = entry.amount && String(entry.amount).includes(query);

          return nameMatch || cashierMatch || typeMatch || survMatch || cdMatch || cardMatch || otherInfoMatch || amountMatch;
        });
      }

      exportToExcel(sourceEntries, 'Surveillance_Filtered_Export');
    });
  }

  if(btnExportAdmin) {
 if (btnExportAdmin) btnExportAdmin.addEventListener('click', () => {
      exportToExcel(allEntries, 'Surveillance_Active_Export');
    });
  }

  // Admin Send List
  function renderAdminSendList() {
    if(!adminSendList) return;
    adminSendList.innerHTML = '';
    
    // Recalculate major entries
    const guestTotals = {};

    allEntries.forEach(e => {
      if(!isEntryForToday(e)) return;
      const g = (e.guestname || 'Unknown').trim();
      const t = (e.type || '').toUpperCase();
      let amt = Number(e.amount) || 0;
      
      if(guestTotals[g] === undefined) { guestTotals[g] = 0; }
      
      // Calculate RESULT = OUT - IN
      if (['CASHOUT', 'DEPOSIT', 'KEYOUT'].includes(t)) {
        guestTotals[g] += amt;
      } else if (['CASHIN', 'ISSUE', 'KEYIN'].includes(t)) {
        guestTotals[g] -= amt;
      }
    });

    for (const [g, result] of Object.entries(guestTotals)) {
      if (Math.abs(result) > 49000) {
        let resultStr = formatCurrency(Math.abs(result));
        if (result < 0) {
          resultStr = "-" + resultStr;
        } else if (result > 0) {
          resultStr = "+" + resultStr;
        }
        
        const row = document.createElement('div');
        row.className = 'send-item-row';
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        
        const textSpan = document.createElement('span');
        textSpan.className = 'send-item-text';
        textSpan.innerHTML = `<strong>${escapeHTML(g)}</strong>: <span class="${result < 0 ? 'text-red' : 'text-green'}">${resultStr}</span>`;
        
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete-item';
        delBtn.innerHTML = '<i data-lucide="x"></i>';
        delBtn.onclick = () => {
          row.remove();
        };

        row.appendChild(textSpan);
        row.appendChild(delBtn);
        adminSendList.appendChild(row);
      }
    }
    lucide.createIcons();
  }

  // Admin SEND copy logic
  if(btnAdminSend) {
 if (btnAdminSend) btnAdminSend.addEventListener('click', () => {
      const rows = adminSendList.querySelectorAll('.send-item-text');
      if(rows.length === 0) {
        alert("Nothing to send.");
        return;
      }
      let finalString = "MAJOR PATRON SUMMARY:\n";
      rows.forEach(r => {
        finalString += r.textContent + "\n";
      });
      navigator.clipboard.writeText(finalString).then(() => {
        alert("Summary copied to clipboard!");
      }).catch(err => {
        alert("Failed to copy to clipboard. Check permissions.");
        console.error(err);
      });
    });
  }

  // Populate datalists for Card, OtherInfo, and GuestName from existing entries (most recently used first)
  function populateDataLists(entries) {
    const guests = [];
    const cards = [];
    const others = [];

    // entries is sorted newest first, so iterating collects most recent unique values first
    entries.forEach(e => {
      const guestVal = (e.guestname || '').trim();
      const cardVal = (e.card || '').trim();
      const otherinfoVal = (e.otherinfo || '').trim();

      if (guestVal && !guests.includes(guestVal)) guests.push(guestVal);
      if (cardVal && !cards.includes(cardVal)) cards.push(cardVal);
      if (otherinfoVal && !others.includes(otherinfoVal)) others.push(otherinfoVal);
    });

    const guestnameList = document.getElementById('guestname-options-grid');
    const cardList = document.getElementById('card-options-grid');
    const otherInfoList = document.getElementById('otherinfo-options-grid');
    if (guestnameList) {
      guestnameList.innerHTML = guests.map(v => `<div class="inline-option-item">${escapeHTML(v)}</div>`).join('');
    }
    if (cardList) {
      cardList.innerHTML = cards.map(v => `<div class="inline-option-item">${escapeHTML(v)}</div>`).join('');
    }
    if (otherInfoList) {
      otherInfoList.innerHTML = others.map(v => `<div class="inline-option-item">${escapeHTML(v)}</div>`).join('');
    }

  }

  // Handle click on any inline-option-item to populate the corresponding input
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('inline-option-item')) {
      const value = e.target.getAttribute('data-value') || e.target.textContent;
      const formGroup = e.target.closest('.form-group');
      if (formGroup) {
        const input = formGroup.querySelector('input[type="text"]');
        if (input) {
          input.value = value;
          input.focus(); // Focus the input back so pressing Enter works immediately!
          // Trigger the 'input' event manually so things like checkBarredGuest can fire
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  });

  // Render entry rows in table
  function renderEntries(entries, options = {}) {
    try {
      const { limit, isArchive } = options;
      
      // Filter to today's business session (includes physical-date fallback for timing-bug entries)
      let processedEntries = Array.isArray(entries) ? entries.filter(isEntryForToday) : [];

      // Sort by latest first
      processedEntries.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

      const displayEntries = processedEntries.slice(0, limit || processedEntries.length);

      if (!isArchive) {
        if (recordCountBadge) {
          recordCountBadge.textContent = `${displayEntries.length} ${displayEntries.length === 1 ? 'Record' : 'Records'}`;
        }
      }

      const homeSentenceList = document.getElementById('home-sentence-list');

      if (displayEntries.length === 0) {
        if (logsTableBody) {
          logsTableBody.innerHTML = `
            <tr>
              <td colspan="10" class="no-records-row">
                <div class="empty-state">
                  <i data-lucide="inbox"></i>
                  <p>No records found for today matching the filter.</p>
                </div>
              </td>
            </tr>
          `;
        }
        if (homeSentenceList) {
          homeSentenceList.innerHTML = `
            <li class="empty-state" style="padding: 30px; text-align: center; color: var(--text-muted); list-style: none;">
              <i data-lucide="inbox" style="width: 32px; height: 32px; margin-bottom: 8px;"></i>
              <p style="margin-top: 8px; font-size: 1.05rem;">No records found for today. Enter a log below and click SEND.</p>
            </li>
          `;
        }
        lucide.createIcons();
        return;
      }

    // Determine badge class/label based on Type
    function getTypeBadge(type) {
      const t = (type || '').toUpperCase();
      if (CREDIT_TYPES.includes(t)) return { cls: 'badge-credit', label: type };
      if (DEBIT_TYPES.includes(t)) return { cls: 'badge-debit', label: type };
      return { cls: 'badge-synced', label: type };
    }

    let html = '';
    let sentenceHtml = '';

    displayEntries.forEach(entry => {
      const displayDate = entry.datetime ? entry.datetime.replace('T', ' ') : 'N/A';
      const timeStr = entry.datetime
        ? (entry.datetime.includes('T') ? entry.datetime.split('T')[1].slice(0, 5) : entry.datetime.slice(-5))
        : '—';
      const cdText = escapeHTML(entry.cd || '—');
      const typeBadge = getTypeBadge(entry.type);
      const amtClass = CREDIT_TYPES.includes((entry.type || '').toUpperCase()) ? 'text-green' : 'text-red';
      const amtFormatted = formatCurrency(Number(entry.amount) || 0);
      const sentence = getEntrySentence(entry);
      const typeKey = (entry.type || '').toLowerCase().replace('/', '-');

      const actionButtons = isArchive
        ? '<span class="archive-note">Archive read-only</span>'
        : `
            <div style="display:flex;gap:6px;">
              <button class="btn-edit-entry" data-id="${entry.id}" title="Edit this entry"
                style="background:var(--accent-blue,#3b82f6);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
                <i data-lucide="edit-2" style="width:13px;height:13px;"></i> Edit
              </button>
              <button class="btn-delete-entry" data-id="${entry.id}" title="Delete this entry"
                style="background:var(--danger,#ef4444);color:#fff;border:none;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:12px;display:inline-flex;align-items:center;gap:4px;">
                <i data-lucide="trash-2" style="width:13px;height:13px;"></i> Del
              </button>
            </div>
          `;

      const homeSentenceActions = isArchive
        ? ''
        : `
            <div class="home-sentence-actions">
              <button type="button" class="btn-edit-entry" data-id="${entry.id}" title="Edit this entry">
                <i data-lucide="edit-2" style="width:12px;height:12px;"></i> <span>Edit</span>
              </button>
              <button type="button" class="btn-delete-entry" data-id="${entry.id}" title="Delete this entry">
                <i data-lucide="trash-2" style="width:12px;height:12px;"></i> <span>Del</span>
              </button>
            </div>
          `;

      // Home sentence card item (Direct sentence form with increased readable size)
      sentenceHtml += `
        <li class="home-sentence-card ${typeKey}">
          <div class="home-sentence-left">
            <span class="home-sentence-time-badge">${timeStr}</span>
          </div>
          <div class="home-sentence-text">${sentence}</div>
          ${homeSentenceActions}
        </li>
      `;

      // Traditional Table Row
      html += `
        <tr>
          <td><strong>${displayDate}</strong></td>
          <td><span class="badge ${typeBadge.cls}">${typeBadge.label}</span></td>
          <td class="table-amount ${amtClass}">${amtFormatted}</td>
          <td>${escapeHTML(entry.guestname)}</td>
          <td>${(() => {
            const rowType = (entry.type||'').toUpperCase();
            const showCard = ['ISSUE','DEPOSIT'].includes(rowType);
            return showCard
              ? `<code>${entry.card ? escapeHTML(entry.card) : '—'}</code>`
              : `<span style="color:var(--text-muted)">—</span>`;
          })()}</td>
          <td title="${escapeHTML(entry.otherinfo || '')}">
            <div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">
              ${entry.otherinfo ? escapeHTML(entry.otherinfo) : '<span style="color:var(--text-muted)">—</span>'}
            </div>
          </td>
          <td>
            ${actionButtons}
          </td>
        </tr>
      `;
    });

    if (logsTableBody) logsTableBody.innerHTML = html;
    if (homeSentenceList) homeSentenceList.innerHTML = sentenceHtml;
    lucide.createIcons();

    // Helper to attach Edit and Delete listeners to any container
    const attachEntryListeners = (container) => {
      if (!container) return;
      container.querySelectorAll('.btn-edit-entry')?.forEach(btn => {
        btn.addEventListener('click', () => {
          const id = Number(btn.getAttribute('data-id'));
          const entry = allEntries.find(e => e.id === id);
          if (entry) editEntry(entry);
        });
      });
      container.querySelectorAll('.btn-delete-entry')?.forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = Number(btn.getAttribute('data-id'));
          if (!confirm('Are you sure you want to delete this entry?')) return;
          try {
            const resp = await fetch(`/api/entries?id=${id}`, { method: 'DELETE' });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Delete failed.');
            await fetchEntries();
          } catch (err) {
            alert(`Error deleting entry: ${err.message}`);
          }
        });
      });
    };

    attachEntryListeners(logsTableBody);
    attachEntryListeners(homeSentenceList);

    } catch (err) {
      console.error("renderEntries Error: ", err);
      logsTableBody.innerHTML = `
        <tr>
          <td colspan="9" class="no-records-row">
            <div class="empty-state">
              <i data-lucide="alert-triangle"></i>
              <p>Failed to render entries: ${err.message}</p>
            </div>
          </td>
        </tr>
      `;
      lucide.createIcons();
    }
  }

  // Named submission function to allow clean keyboard and click triggers
  async function handleEntrySubmit(e, skipQuickSave = false) {
    if (e) e.preventDefault();

    const datetime = inputDateTime.value;
    const cd = (inputCD && inputCD.value) ? inputCD.value.toUpperCase() : 'CD-01';
    const cashier = (inputCashier && inputCashier.value) ? inputCashier.value.trim().toUpperCase() : '-';
    let type = inputType.value.trim().toUpperCase();
    if (type === 'C/IN') type = 'CASHIN';
    if (type === 'C/OUT') type = 'CASHOUT';

    const amount = inputAmount.value;
    const guestname = inputGuestName.value.trim().toUpperCase();
    const card = inputCard.value.trim().toUpperCase();
    const otherinfo = inputOtherInfo.value.trim().toUpperCase();
    const surv = inputSurv.value.toUpperCase();

    if (!datetime || !type || !amount || !guestname || !surv) {
      alert('Please fill out all required fields.');
      return;
    }

    // Check if guest is barred before submitting
    if (guestname && !skipQuickSave) {
      const match = await ensureCheckBarredGuest(guestname);
      if (match) {
        await showBarredWarningPopup(match, guestname);
      }
    }

    btnSave.classList.add('loading');

    const entryPayload = {
      datetime,
      businessDate: currentBusinessDateStr || getBusinessDate(),
      cd: cd || 'CD-01',
      cashier: cashier || '-',
      type,
      amount: parseFloat(amount.replace(/,/g, '')),
      guestname,
      card,
      otherinfo,
      surv
    };

    try {
      let response;
      if (editingEntryId !== null) {
        // UPDATE existing entry
        response = await fetch(`/api/entries?id=${editingEntryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...entryPayload, id: editingEntryId })
        });
      } else {
        // CREATE new entry
        response = await fetch('/api/entries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entryPayload)
        });
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save entry.');

      // Save quick entry concurrently if there is text and skipQuickSave is false
      if (!skipQuickSave) {
        let activeQuickInput = null;
        let activeQuickFeedback = null;

        const offPanel = document.getElementById('officer-quick-entry-panel');
        if (offPanel && window.getComputedStyle(offPanel).display !== 'none') {
          activeQuickInput = document.getElementById('officer-quick-input');
          activeQuickFeedback = document.getElementById('officer-quick-feedback');
        }

        if (activeQuickInput && activeQuickInput.value.trim() && activeQuickFeedback) {
          const raw = activeQuickInput.value.trim();
          const parsed = parseQuickSentence(raw);
          if (parsed) {
            const cdFinal = cd || parsed.cd || 'CD-01';
            const quickPayload = {
              datetime: getLocalTimeISOString(),
              businessDate: currentBusinessDateStr || getBusinessDate(),
              cd: cdFinal,
              cashier: cashier || '',
              type: parsed.type,
              amount: parsed.amount,
              guestname: parsed.guestname,
              card: parsed.card,
              otherinfo: parsed.otherinfo,
              surv: surv
            };
            try {
              activeQuickFeedback.textContent = 'Saving quick entry...';
              activeQuickFeedback.style.color = '#a78bfa';
              const resp = await fetch('/api/entries', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(quickPayload)
              });
              const qdata = await resp.json();
              if (resp.ok) {
                activeQuickInput.value = '';
                activeQuickFeedback.textContent = `✓ Saved: ${parsed.amount.toLocaleString('en-IN')} ${parsed.type} – ${parsed.guestname}`;
                activeQuickFeedback.style.color = '#86efac';
              } else {
                activeQuickFeedback.textContent = `✗ Quick entry: ${qdata.error || 'Save failed'}`;
                activeQuickFeedback.style.color = '#fca5a5';
              }
            } catch (err) {
              activeQuickFeedback.textContent = `✗ Quick entry: ${err.message}`;
              activeQuickFeedback.style.color = '#fca5a5';
            }
          } else {
            activeQuickFeedback.textContent = '⚠ Quick entry cannot parse — check format.';
            activeQuickFeedback.style.color = '#fca5a5';
          }
        }
      }

      resetFormInputs();
      closeLogModal();
      await fetchEntries();
    } catch (err) {
      console.error(err);
      alert(`Error saving entry: ${err.message}`);
    } finally {
      btnSave.classList.remove('loading');
    }
  }

  // Submit and Save / Update Entry
  if (entryForm) entryForm.addEventListener('submit', handleEntrySubmit);

  // Directly attach Enter key down listeners to each input of the log box form
  const logBoxInputs = [inputCD, inputCashier, inputType, inputAmount, inputGuestName, inputCard, inputOtherInfo, inputSurv];
  logBoxInputs.forEach(input => {
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleEntrySubmit(e);
        }
      });
    }
  });

  // ==========================================================================
  // QUICK TEXT ENTRY – shared parsers + reusable widget mount
  // ==========================================================================

  // ── Amount parser: 50K→50000 | 1L→100000 | 1.5K→1500 | 500→500 ──────────
  function parseQuickAmt(s) {
    s = String(s).trim().toUpperCase().replace(/,/g, '');
    const m = s.match(/^(\d+(?:\.\d+)?)\s*([KL]?)$/);
    if (!m) return null;
    let n = parseFloat(m[1]);
    if (m[2] === 'K') n *= 1000;
    if (m[2] === 'L') n *= 100000;
    return Math.round(n);
  }

  function cleanOtherInfo(s) {
    if (!s) return '';
    let str = String(s).trim();
    // Strip leading '(' or '9' and trailing ')' e.g. "(INFO)" -> "INFO", "9INFO)" -> "INFO"
    str = str.replace(/^[\(9]\s*/, '').replace(/\s*\)$/, '').trim();
    return str;
  }

  // ── Sentence parser: returns { type, cd, amount, guestname, card, otherinfo } or null
  function parseQuickSentence(raw) {
    let t = raw.trim().toUpperCase();

    // Universal bracket extraction: anything in brackets (...) or ' 9...)' is otherinfo!
    let bracketInfo = '';
    // 1. Check for standard parentheses (...)
    let bMatch = t.match(/\(([^)]*)\)/);
    if (bMatch) {
      bracketInfo = cleanOtherInfo(bMatch[1]);
      t = t.replace(/\([^)]*\)/, ' ').replace(/\s+/g, ' ').trim();
    } else {
      // 2. Check for Shift+9 typo e.g. " 9JC)"
      bMatch = t.match(/(?:\s+|^)9([^)]+)\)/);
      if (bMatch) {
        bracketInfo = cleanOtherInfo(bMatch[1]);
        t = t.replace(/(?:\s+|^)9[^)]+\)/, ' ').replace(/\s+/g, ' ').trim();
      }
    }

    const amtMatch = t.match(/^(\d+(?:\.\d+)?\s*[KL]?)\s+(.+)$/);
    if (!amtMatch) return null;

    const a = parseQuickAmt(amtMatch[1]);
    if (!a) return null;
    const rest = amtMatch[2].trim();

    // CASHIN / C/IN / C\IN  →  <amt> CASHIN [BY] <guest>
    let m = rest.match(/^(?:CASHIN|C[\/\\]IN)(?:\s+BY)?\s+(.+)$/);
    if (m) {
      return { type: 'CASHIN', cd: 'CD-01', amount: a, guestname: m[1].trim(), card: '', otherinfo: bracketInfo };
    }

    // CASHOUT / C/OUT / C\OUT  →  <amt> CASHOUT [BY] <guest>
    m = rest.match(/^(?:CASHOUT|C[\/\\]OUT)(?:\s+BY)?\s+(.+)$/);
    if (m) {
      return { type: 'CASHOUT', cd: 'CD-01', amount: a, guestname: m[1].trim(), card: '', otherinfo: bracketInfo };
    }

    // Helper for ISSUE / DEPOSIT
    function parseCardAndGuest(sub) {
      let guestname = '';
      let card = '';
      let otherinfo = bracketInfo;

      const cardMatch = sub.match(/^(.*?)\s+CARD(?:\s+(.*))?$/);
      if (cardMatch) {
        const beforeCard = cardMatch[1].trim();
        const afterCard = cardMatch[2] ? cardMatch[2].trim() : '';
        if (!otherinfo && afterCard) {
          otherinfo = cleanOtherInfo(afterCard);
        }

        const connMatch = beforeCard.match(/^(.*?)\s+(?:FROM|C[\/\\]O|ON)\s+(.+)$/);
        if (connMatch) {
          guestname = connMatch[1].trim();
          card = connMatch[2].trim();
        } else {
          const lastSpace = beforeCard.lastIndexOf(' ');
          if (lastSpace !== -1) {
            guestname = beforeCard.slice(0, lastSpace).trim();
            card = beforeCard.slice(lastSpace + 1).trim();
          } else {
            guestname = beforeCard;
            card = 'SELF';
          }
        }
        return { guestname, card, otherinfo };
      }

      // Fallback if no 'CARD' keyword
      const connNoCard = sub.match(/^(.*?)\s+(?:FROM|C[\/\\]O|ON)\s+(.+)$/);
      if (connNoCard) {
        guestname = connNoCard[1].trim();
        card = connNoCard[2].trim();
        return { guestname, card, otherinfo };
      }

      return null;
    }

    // ISSUE  →  <amt> ISSUE [TO] <guest> [FROM|C/O|C\O|ON] <card> CARD [info]
    m = rest.match(/^ISSUE(?:\s+TO)?\s+(.+)$/);
    if (m) {
      const res = parseCardAndGuest(m[1].trim());
      if (res) return { type: 'ISSUE', cd: 'CD-01', amount: a, guestname: res.guestname, card: res.card, otherinfo: res.otherinfo };
    }

    // DEPOSIT  →  <amt> DEPOSIT [BY] <guest> [FROM|C/O|C\O|ON] <card> CARD [info]
    m = rest.match(/^DEPOSIT(?:\s+BY)?\s+(.+)$/);
    if (m) {
      const res = parseCardAndGuest(m[1].trim());
      if (res) return { type: 'DEPOSIT', cd: 'CD-01', amount: a, guestname: res.guestname, card: res.card, otherinfo: res.otherinfo };
    }

    // KEYIN  →  <amt> KEYIN [BY] <guest>
    m = rest.match(/^KEYIN(?:\s+BY)?\s+(.+)$/);
    if (m) {
      return { type: 'KEYIN', cd: 'CD-01', amount: a, guestname: m[1].trim(), card: '', otherinfo: bracketInfo };
    }

    // KEYOUT  →  <amt> KEYOUT [BY] <guest>
    m = rest.match(/^KEYOUT(?:\s+BY)?\s+(.+)$/);
    if (m) {
      return { type: 'KEYOUT', cd: 'CD-01', amount: a, guestname: m[1].trim(), card: '', otherinfo: bracketInfo };
    }

    return null;
  }

  // ── Generic widget mount: wire up any textarea/button/feedback trio ────────
  function mountQuickEntry(inputId, saveBtnId, feedbackId, opts) {
    const qInput    = document.getElementById(inputId);
    const qSaveBtn  = document.getElementById(saveBtnId);
    const qFeedback = document.getElementById(feedbackId);
    if (!qInput || !qSaveBtn) return;

    const o = opts || {};
    const qCDSelect = o.cdSelectId ? document.getElementById(o.cdSelectId) : null;
    const qCashier = o.cashierInputId ? document.getElementById(o.cashierInputId) : null;

    // Sync initial values from main form on mount
    if (qCDSelect && inputCD) {
      qCDSelect.value = inputCD.value || 'CD-01';
    }
    if (qCashier && inputCashier) {
      qCashier.value = inputCashier.value || '';
    }

    // Bidirectional sync for Cashier input
    if (qCashier) {
      qCashier.addEventListener('input', () => {
        qCashier.value = qCashier.value.toUpperCase();
        if (inputCashier && inputCashier.value !== qCashier.value) {
          inputCashier.value = qCashier.value;
        }
      });
      
      // Submit on Enter key inside Cashier quick input
      qCashier.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSave();
        }
      });
    }

    // Bidirectional sync for CD selection
    if (qCDSelect) {
      qCDSelect.addEventListener('change', () => {
        if (inputCD && inputCD.value !== qCDSelect.value) {
          inputCD.value = qCDSelect.value;
          inputCD.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      
      // Submit on Enter key inside CD select dropdown
      qCDSelect.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doSave();
        }
      });
    }

    // Main form listener syncs CD/Cashier to the active quick entry widget
    if (inputCD) {
      inputCD.addEventListener('input', () => {
        const val = inputCD.value.toUpperCase();
        if (qCDSelect && qCDSelect.value !== val) {
          if (['CD-01', 'CD-02', 'CD-03', 'CD-04', 'M-CD', 'F-CD'].includes(val)) {
            qCDSelect.value = val;
          }
        }
      });
    }
    if (inputCashier) {
      inputCashier.addEventListener('input', () => {
        const val = inputCashier.value.toUpperCase();
        if (qCashier && qCashier.value !== val) {
          qCashier.value = val;
        }
      });
    }

    function setFb(msg, color) {
      if (!qFeedback) return;
      qFeedback.textContent = msg;
      qFeedback.style.color = color || '#fff';
    }

    async function doSave() {
      // Force sync cashier and CD from quick entry fields before saving
      if (qCashier && inputCashier && qCashier.value) {
        inputCashier.value = qCashier.value.toUpperCase();
      }
      if (qCDSelect && inputCD) {
        inputCD.value = qCDSelect.value;
      }

      const raw = qInput.value.trim();
      const mainGuest = inputGuestName ? inputGuestName.value.trim() : '';

      if (!raw && !mainGuest) return;

      // Capture CD and Cashier values from log box at the very beginning
      const cashierVal = inputCashier ? inputCashier.value.trim().toUpperCase() : '';
      const cdVal      = inputCD ? inputCD.value.trim().toUpperCase() : '';

      // If main guest is present, save the main form
      let savedMain = false;
      if (mainGuest) {
        // Validate required fields for main form
        const datetime = inputDateTime ? inputDateTime.value : '';
        const type = inputType ? inputType.value.trim() : '';
        const amount = inputAmount ? inputAmount.value : '';
        const surv = inputSurv ? inputSurv.value.toUpperCase() : '';
        if (!datetime || !cdVal || !cashierVal || !type || !amount || !surv) {
          alert('Please fill out all required fields in the log box.');
          return;
        }

        // Check if main guest is barred before proceeding
        const mainMatch = await ensureCheckBarredGuest(mainGuest);
        if (mainMatch) {
          await showBarredWarningPopup(mainMatch, mainGuest);
        }

        await handleEntrySubmit(null, true);
        savedMain = true;

        // If there's no quick entry text, we are done
        if (!raw) {
          setFb('✓ Log box entry saved.', '#86efac');
          if (qCashier) qCashier.value = '';
          if (qCDSelect) qCDSelect.value = 'CD-01';
          if (inputCashier) inputCashier.value = '';
          if (inputCD) inputCD.value = 'CD-01';
          return;
        }
      }

      // MULTI-ENTRY PARSER: Allow typing/pasting as many entries at once as desired
      const lines = raw.split(/[\r\n;]+/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length === 0) return;

      const parsedEntries = [];
      const failedLines = [];

      lines.forEach((line, idx) => {
        const p = parseQuickSentence(line);
        if (p) {
          parsedEntries.push(p);
        } else {
          failedLines.push({ num: idx + 1, text: line });
        }
      });

      if (parsedEntries.length === 0) {
        setFb('⚠ Cannot parse — check format.', '#fca5a5');
        return;
      }

      if (failedLines.length > 0) {
        setFb(`⚠ Line ${failedLines[0].num} invalid: "${failedLines[0].text}"`, '#fca5a5');
        return;
      }

      // Check if any parsed quick entry is for a barred guest
      for (const item of parsedEntries) {
        if (item.guestname) {
          const match = await ensureCheckBarredGuest(item.guestname);
          if (match) {
            await showBarredWarningPopup(match, item.guestname);
          }
        }
      }

      const cdFinal = cdVal || 'CD-01';
      const cashierFinal = cashierVal || '-';
      const survVal = (currentUser ? currentUser.id : 'ADMIN').toUpperCase();

      setFb(parsedEntries.length === 1 ? 'Saving…' : `Saving ${parsedEntries.length} entries…`, '#a78bfa');
      qSaveBtn.disabled = true;

      try {
        let savedCount = 0;
        for (const item of parsedEntries) {
          const itemCd = (item.cd && item.cd !== 'C' && item.cd !== 'D') ? item.cd : cdFinal;
          const payload = {
            datetime : getLocalTimeISOString(),
            cd       : itemCd,
            cashier  : cashierFinal,
            type     : item.type,
            amount   : item.amount,
            guestname: item.guestname,
            card     : item.card,
            otherinfo: item.otherinfo,
            surv     : survVal
          };
          const resp = await fetch('/api/entries', {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify(payload)
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.error || 'Save failed');
          savedCount++;
        }

        if (savedCount === 1) {
          const p = parsedEntries[0];
          setFb(`✓ ${p.amount.toLocaleString('en-IN')} ${p.type} – ${p.guestname}${p.otherinfo ? ' ('+p.otherinfo+')' : ''}`, '#86efac');
        } else {
          setFb(`✓ Successfully saved ${savedCount} entries!`, '#86efac');
        }

        qInput.value = '';
        qInput.style.height = ''; // Reset auto-resize

        // AFTER SAVED CLEAR CD AND CASHIER in both forms
        if (qCashier) qCashier.value = '';
        if (qCDSelect) qCDSelect.value = 'CD-01';
        if (inputCashier) inputCashier.value = '';
        if (inputCD) inputCD.value = 'CD-01';

        qInput.focus();
        await fetchEntries();
      } catch (err) {
        setFb(`✗ ${err.message}`, '#fca5a5');
      } finally {
        qSaveBtn.disabled = false;
      }
    }

    if (qSaveBtn) qSaveBtn.addEventListener('click', doSave);

    // Enter = save (Shift+Enter = new line for typing as many entries as desired)
    if (qInput) qInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        doSave();
      }
    });

    // Live parse preview as user types & dynamic auto-grow
    if (qInput) qInput.addEventListener('input', () => {
      // Auto-grow height based on content
      qInput.style.height = 'auto';
      const newHeight = Math.min(Math.max(qInput.scrollHeight, 46), 140);
      qInput.style.height = newHeight + 'px';

      const raw = qInput.value.trim();
      if (!raw) { setFb(''); return; }

      const lines = raw.split(/[\r\n;]+/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length > 1) {
        let valid = 0;
        lines.forEach(l => { if (parseQuickSentence(l)) valid++; });
        if (valid === lines.length) {
          setFb(`→ Ready to add ${valid} entries (Click SEND or Enter)`, '#86efac');
        } else {
          setFb(`→ ${valid} of ${lines.length} entries parsed…`, '#fcd34d');
        }
        return;
      }

      const p = parseQuickSentence(lines[0] || raw);
      if (p) {
        setFb(
          `→ ${p.type}  ₹${p.amount.toLocaleString('en-IN')}  ${p.guestname}${p.card ? ' · '+p.card : ''}${p.otherinfo ? ' ('+p.otherinfo+')' : ''}`,
          '#a78bfa'
        );
      } else {
        setFb('…typing…', 'var(--text-muted)');
      }
    });
  } // end mountQuickEntry

  // Mount for home page message box (Telegram layout)
  mountQuickEntry('officer-quick-input', 'btn-officer-quick-save', 'officer-quick-feedback');

  // Real-time Search and Filter on Main Page (latest 20 active only)
  if (tableSearchInput) {
 if (tableSearchInput) tableSearchInput.addEventListener('input', () => {
      const query = tableSearchInput.value.toLowerCase().trim();

      if (!query) {
        renderEntries(allEntries, { limit: CURRENT_ENTRY_LIMIT, isArchive: false });
        return;
      }

      const filtered = allEntries.filter(entry => {
        const nameMatch = entry.guestname && entry.guestname.toLowerCase().includes(query);
        const cashierMatch = entry.cashier && entry.cashier.toLowerCase().includes(query);
        const typeMatch = entry.type && entry.type.toLowerCase().includes(query);
        const survMatch = entry.surv && entry.surv.toLowerCase().includes(query);
        const cdMatch = entry.cd && entry.cd.toLowerCase().includes(query);
        const cardMatch = entry.card && entry.card.toLowerCase().includes(query);
        const otherInfoMatch = entry.otherinfo && entry.otherinfo.toLowerCase().includes(query);
        const amountMatch = entry.amount && String(entry.amount).includes(query);

        return nameMatch || cashierMatch || typeMatch || survMatch || cdMatch || cardMatch || otherInfoMatch || amountMatch;
      });

      renderEntries(filtered, { limit: CURRENT_ENTRY_LIMIT, isArchive: false });
    });
  }

  // Manual Refresh Button
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      tableSearchInput.value = '';
      fetchEntries();
    });
  }

  // ==========================================================================
  // START NEW GAMING DAY (CHANGE DATE)
  // ==========================================================================
  if (btnStartNewDay) {
    btnStartNewDay.addEventListener('click', () => {
      const current = currentBusinessDateStr || getBusinessDate();
      if (modalCurrentDateDisplay) {
        modalCurrentDateDisplay.textContent = current || 'Not Set';
      }

      // Pre-fill with next day
      if (newDayDateInput) {
        if (current && current.includes('-')) {
          const parts = current.split('-').map(Number);
          const nextDate = new Date(parts[0], parts[1] - 1, parts[2] + 1);
          const ny = nextDate.getFullYear();
          const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
          const nd = String(nextDate.getDate()).padStart(2, '0');
          newDayDateInput.value = `${ny}-${nm}-${nd}`;
        } else {
          newDayDateInput.value = getLocalTimeISOString().split('T')[0];
        }
      }

      if (newDayModal) {
        newDayModal.style.display = 'flex';
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  // Cancel / NO button -> continue same gaming day
  if (btnCancelNewDay) {
    btnCancelNewDay.addEventListener('click', () => {
      if (newDayModal) {
        newDayModal.style.display = 'none';
      }
    });
  }

  // Confirm / YES button -> start new gaming day
  if (btnConfirmNewDay) {
    btnConfirmNewDay.addEventListener('click', async () => {
      const newDate = newDayDateInput ? newDayDateInput.value : '';
      if (!newDate) {
        alert('Please select a valid new gaming date.');
        return;
      }

      const origText = btnConfirmNewDay.innerHTML;
      btnConfirmNewDay.disabled = true;
      btnConfirmNewDay.innerHTML = '<span>Starting...</span>';

      try {
        const response = await fetch('/api/newday', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newDate })
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.error || 'Failed to start new gaming day.');
        }

        // Advance current business date
        currentBusinessDateStr = result.newDate || newDate;
        if (homeGamingDateDisplay) {
          homeGamingDateDisplay.textContent = currentBusinessDateStr;
        }
        const allGamingDateEl = document.getElementById('all-entries-gaming-date');
        if (allGamingDateEl) {
          allGamingDateEl.textContent = `TODAY GAMING DATE: ${currentBusinessDateStr}`;
        }

        // Update active day for All Entries navigation
        const dayNum = Number(currentBusinessDateStr.split('-')[2]);
        if (!isNaN(dayNum)) {
          activeAllEntriesDay = dayNum;
          if (gotoDayInput) gotoDayInput.value = activeAllEntriesDay;
        }
        if (allEntriesDatePicker) {
          allEntriesDatePicker.value = currentBusinessDateStr;
        }

        // Update datetime input
        if (inputDateTime) {
          inputDateTime.value = getLocalTimeISOString();
        }

        // Close modal
        if (newDayModal) {
          newDayModal.style.display = 'none';
        }

        // Re-fetch all entries from backend (previous ones will now be archived)
        await fetchEntries();

        // Sync day pagination UI
        renderDayPagination();

        alert(`New Gaming Day started: ${currentBusinessDateStr}\nPrevious entries have been archived.`);
      } catch (err) {
        console.error('Error starting new gaming day:', err);
        alert(`Failed to start new gaming day: ${err.message}`);
      } finally {
        btnConfirmNewDay.disabled = false;
        btnConfirmNewDay.innerHTML = origText;
        if (window.lucide) lucide.createIcons();
      }
    });
  }

  if (newDayModal) {
    newDayModal.addEventListener('click', (e) => {
      if (e.target === newDayModal) {
        newDayModal.style.display = 'none';
      }
    });
  }

  // Attach ALL ENTRIES filter listeners
  if (allEntriesDatePicker) {
    allEntriesDatePicker.addEventListener('change', () => {
      const val = allEntriesDatePicker.value;
      if (val) {
        const parts = val.split('-');
        if (parts.length === 3) {
          activeAllEntriesDay = Number(parts[2]);
          renderDayPagination();
        }
      }
      updateAllEntriesView();
    });
  }
  if (allEntriesSearch) {
 if (allEntriesSearch) allEntriesSearch.addEventListener('input', () => {
      updateAllEntriesView();
    });
  }

  // Auto-Refresh checking for 6:00 AM auto-archive clean
  const pageLoadTime = Date.now();
  // Periodic check to see if the date has changed (e.g. 06:00 AM reset)
  setInterval(async () => {
    try {
      const startFetch = Date.now();
      const response = await fetch('/api/status');
      if (response.ok) {
        const data = await response.json();
        if (data.serverTime) {
          const rtt = Date.now() - startFetch;
          timeOffset = data.serverTime + (rtt / 2) - Date.now();
        }
        if (data.currentBusinessDate && currentBusinessDateStr && data.currentBusinessDate !== currentBusinessDateStr) {
          console.log("Daily reset detected. Refreshing site...");
          location.reload();
        }
      }
    } catch (err) {
      console.error('Failed to query server status for daily reset:', err);
    }
  }, 30000);

  // Toggle the Admin Users button visibility based on active user (Admin only)
  function toggleAdminPanel() {
    if (btnAdminUsers) {
      if (isAdmin()) {
        btnAdminUsers.style.setProperty('display', 'flex', 'important');
      } else {
        btnAdminUsers.style.setProperty('display', 'none', 'important');
      }
    }
  }

  // Admin Account Management: Fetch all accounts
  async function fetchUsers() {
    if (!isAdmin()) return;
    try {
      const response = await fetch('/api/users?requester=admin');
      if (!response.ok) {
        throw new Error('Failed to retrieve user accounts.');
      }
      const data = await response.json();
      renderUsers(data.users || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  }

  // Render users matching wireframe
  function renderUsers(users) {
    const list = document.getElementById('users-list');
    if (!list) return;

    if (users.length === 0) {
      list.innerHTML = '<li style="text-align:center; padding:30px; color:var(--text-muted); font-weight:700;">No active accounts found.</li>';
      return;
    }

    let html = '';
    users.forEach(user => {
      const isSelf = user.username === 'admin';
      const roleUpper = (user.role || 'officer').toUpperCase();
      const roleColor = user.role === 'supervisor' ? '#c084fc' : '#60a5fa';

      html += `
        <li class="admin-user-card" data-user="${escapeHTML(user.username)}">
          <div class="user-card-left">
            <div class="user-card-row">
              <span class="user-card-label">USER ID:</span>
              <span class="user-card-value user-id-val">${escapeHTML(user.username)}</span>
              <span class="user-role-pill" style="color: ${roleColor}; border-color: ${roleColor};">${roleUpper}</span>
            </div>
            <div class="user-card-row">
              <span class="user-card-label">PASSWORD:</span>
              <span class="user-card-value user-pass-val">${escapeHTML(user.password)}</span>
            </div>
          </div>
          <div class="user-card-right">
            <button type="button" class="btn-user-action btn-delete-user" data-user="${escapeHTML(user.username)}" ${isSelf ? 'disabled' : ''} title="Delete Member">
              <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
              <span>DELETE</span>
            </button>
            <button type="button" class="btn-user-action btn-edit-user" data-user="${escapeHTML(user.username)}" data-pass="${escapeHTML(user.password)}" data-role="${escapeHTML(user.role || 'officer')}" title="Edit Member">
              <i data-lucide="edit-2" style="width: 14px; height: 14px;"></i>
              <span>EDIT</span>
            </button>
          </div>
        </li>
      `;
    });

    list.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    // Attach click listeners to delete buttons
    list.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const usernameToDelete = btn.getAttribute('data-user');
        if (usernameToDelete === 'admin') return;

        try {
          const response = await fetch(`/api/users?adminUser=admin&username=${encodeURIComponent(usernameToDelete)}`, {
            method: 'DELETE'
          });
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || 'Failed to delete user.');
          }

          fetchUsers();
        } catch (err) {
          alert(`Error deleting user: ${err.message}`);
        }
      });
    });

    // Attach click listeners to edit buttons
    list.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const username = btn.getAttribute('data-user');
        const pass = btn.getAttribute('data-pass');
        const role = btn.getAttribute('data-role') || 'officer';
        openEditMemberModal(username, pass, role);
      });
    });
  }

  // Role selector buttons in Add Member form
  const roleBtnOfficer = document.getElementById('role-btn-officer');
  const roleBtnSupervisor = document.getElementById('role-btn-supervisor');
  const newUserRoleInput = document.getElementById('new-user-role');

  if (roleBtnOfficer && roleBtnSupervisor) {
    roleBtnOfficer.addEventListener('click', () => {
      roleBtnOfficer.classList.add('active');
      roleBtnSupervisor.classList.remove('active');
      if (newUserRoleInput) newUserRoleInput.value = 'officer';
    });
    roleBtnSupervisor.addEventListener('click', () => {
      roleBtnSupervisor.classList.add('active');
      roleBtnOfficer.classList.remove('active');
      if (newUserRoleInput) newUserRoleInput.value = 'supervisor';
    });
  }

  // Edit Member Modal logic
  const editMemberModal = document.getElementById('edit-member-modal');
  const btnCloseEditMember = document.getElementById('btn-close-edit-member');
  const btnCancelEditMember = document.getElementById('btn-cancel-edit-member');
  const editMemberForm = document.getElementById('edit-member-form');
  const editMemberId = document.getElementById('edit-member-id');
  const editMemberPass = document.getElementById('edit-member-pass');
  const editMemberRole = document.getElementById('edit-member-role');
  const editRoleOfficer = document.getElementById('edit-role-officer');
  const editRoleSupervisor = document.getElementById('edit-role-supervisor');

  function openEditMemberModal(username, password, role) {
    if (!editMemberModal) return;
    if (editMemberId) editMemberId.value = username;
    if (editMemberPass) editMemberPass.value = password;
    if (editMemberRole) editMemberRole.value = role;

    if (role === 'supervisor') {
      if (editRoleSupervisor) editRoleSupervisor.classList.add('active');
      if (editRoleOfficer) editRoleOfficer.classList.remove('active');
    } else {
      if (editRoleOfficer) editRoleOfficer.classList.add('active');
      if (editRoleSupervisor) editRoleSupervisor.classList.remove('active');
    }

    editMemberModal.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }

  function closeEditMemberModal() {
    if (editMemberModal) editMemberModal.style.display = 'none';
  }

  if (btnCloseEditMember) btnCloseEditMember.addEventListener('click', closeEditMemberModal);
  if (btnCancelEditMember) btnCancelEditMember.addEventListener('click', closeEditMemberModal);
  if (editMemberModal) {
    editMemberModal.addEventListener('click', (e) => {
      if (e.target === editMemberModal) closeEditMemberModal();
    });
  }

  if (editRoleOfficer && editRoleSupervisor) {
    editRoleOfficer.addEventListener('click', () => {
      editRoleOfficer.classList.add('active');
      editRoleSupervisor.classList.remove('active');
      if (editMemberRole) editMemberRole.value = 'officer';
    });
    editRoleSupervisor.addEventListener('click', () => {
      editRoleSupervisor.classList.add('active');
      editRoleOfficer.classList.remove('active');
      if (editMemberRole) editMemberRole.value = 'supervisor';
    });
  }

  if (editMemberForm) {
    editMemberForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = editMemberId.value.trim();
      const password = editMemberPass.value;
      const role = editMemberRole ? editMemberRole.value : 'officer';

      if (!username || !password) return;

      try {
        const response = await fetch('/api/users', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminUser: 'admin',
            username,
            password,
            role
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update user.');
        }

        closeEditMemberModal();
        fetchUsers();
      } catch (err) {
        alert(`Error updating user: ${err.message}`);
      }
    });
  }

  // Submit handler for adding new user account
  const addUserForm = document.getElementById('add-user-form');
  const newUsernameInput = document.getElementById('new-user-id');
  const newPasswordInput = document.getElementById('new-user-pass');

  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!isAdmin()) {
        alert('Unauthorized: Only Admin can add members.');
        return;
      }
      const username = newUsernameInput.value.trim().toLowerCase();
      const password = newPasswordInput.value;
      const roleElement = document.getElementById('new-user-role');
      const role = roleElement ? roleElement.value : 'officer';

      if (!username || !password) return;

      try {
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminUser: 'admin',
            newUsername: username,
            newPassword: password,
            newRole: role
          })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to add user account.');
        }

        newUsernameInput.value = '';
        newPasswordInput.value = '';
        fetchUsers();
      } catch (err) {
        alert(`Error adding user: ${err.message}`);
      }
    });
  }

  // Helper: Secure HTML escape to avoid XSS
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Helper: Robust copy text to clipboard supporting insecure HTTP contexts
  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    
    // Fallback for non-HTTPS/insecure contexts (e.g. accessing via local IP http://192.168.x.x:3000)
    return new Promise((resolve, reject) => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          resolve();
        } else {
          reject(new Error('execCommand copy failed'));
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  // Initialize datepicker to current business date
  if (allEntriesDatePicker) {
    allEntriesDatePicker.value = getBusinessDate();
  }

  // Bulk Delete Logic
  const selectAllEntries = document.getElementById('select-all-entries');
  const btnDeleteSelected = document.getElementById('btn-delete-selected');

  function updateBulkActionButtonsVisibility() {
    const anyChecked = document.querySelectorAll('.entry-checkbox:checked').length > 0;
    if (btnDeleteSelected) btnDeleteSelected.style.display = anyChecked ? 'inline-block' : 'none';
  }

  if (selectAllEntries) {
 if (selectAllEntries) selectAllEntries.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.entry-checkbox:not([disabled])').forEach(cb => {
        cb.checked = isChecked;
      });
      updateBulkActionButtonsVisibility();
    });
  }

  if (btnDeleteSelected) {
 if (btnDeleteSelected) btnDeleteSelected.addEventListener('click', async () => {
      const selectedBoxes = document.querySelectorAll('.entry-checkbox:checked');
      if (selectedBoxes.length === 0) return;
      // Deletion confirmation removed by request
      
      const idsToDelete = Array.from(selectedBoxes).map(cb => Number(cb.getAttribute('data-id')));
      
      try {
        btnDeleteSelected.disabled = true;
        btnDeleteSelected.innerHTML = `<i data-lucide="loader" class="spin"></i> Deleting...`;
        lucide.createIcons();
        
        await Promise.all(idsToDelete.map(id => fetch(`/api/entries?id=${id}`, { method: 'DELETE' })));
        
        await fetchEntries(); // Re-render table
        
        // Reset select all
        if (selectAllEntries) selectAllEntries.checked = false;
        updateBulkActionButtonsVisibility();
      } catch (err) {
        alert('Error during bulk delete: ' + err.message);
      } finally {
        btnDeleteSelected.disabled = false;
        btnDeleteSelected.innerHTML = `<i data-lucide="trash-2"></i> Delete Selected`;
        lucide.createIcons();
      }
    });
  }

  // Delegate checkbox change to allEntriesTableBody since rows are re-rendered
  const allEntriesTableBodyRef = document.getElementById('all-entries-table-body');
  if (allEntriesTableBodyRef) {
 if (allEntriesTableBodyRef) allEntriesTableBodyRef.addEventListener('change', (e) => {
      if (e.target.classList.contains('entry-checkbox')) {
        updateBulkActionButtonsVisibility();
        
        // Update Select All state
        const total = document.querySelectorAll('.entry-checkbox:not([disabled])').length;
        const checked = document.querySelectorAll('.entry-checkbox:checked').length;
        if (selectAllEntries) {
          selectAllEntries.checked = (total > 0 && total === checked);
        }
      }
    });
  }

  // ==========================================================================
  // SUPERVISOR LOGIC
  // ==========================================================================
  let supHomeSearchQuery = '';

  function renderSupervisorHome() {
    if (!supervisorAllEntries || !supervisorSendBox) return;

    const searchInputEl = document.getElementById('sup-home-search-input');
    const isSearchFocused = searchInputEl && document.activeElement === searchInputEl;
    if (searchInputEl) {
      supHomeSearchQuery = searchInputEl.value;
    }
    
    // Filter to today's business session (includes physical-date fallback for timing-bug entries)
    const todayEntries = allEntries.filter(isEntryForToday);
    
    // 1. Render Left Table (Today's Entries Only)
    let entriesHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 10px;">
        <div style="background: var(--primary); color: white; padding: 8px 24px; border-radius: 8px; font-weight: bold; font-size: 1.1rem; letter-spacing: 1px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
          ALL ENTRIES
        </div>
        <div style="display: flex; gap: 10px;">
          <div style="position: relative; width: 250px;">
            <i data-lucide="search" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 16px; height: 16px; color: var(--text-muted);"></i>
            <input type="text" id="sup-home-search-input" value="${escapeHTML(supHomeSearchQuery)}" placeholder="Search entries..." style="width: 100%; border: 1px solid rgba(255,255,255,0.2); background: rgba(0,0,0,0.2); color: white; padding: 6px 12px 6px 36px; border-radius: 6px; font-size: 13px;">
          </div>
        </div>
      </div>
      <div style="flex:1; overflow-y:auto;">
        <table class="logs-table" style="width:100%; font-size:12px;">
          <thead>
            <tr>
              <th>Date & Time</th><th>Type</th><th>Amount</th><th>Guest Name</th><th>Surv</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    let sortedEntries = [...todayEntries].sort((a,b) => new Date(b.datetime) - new Date(a.datetime));
    
    const q = supHomeSearchQuery.toLowerCase().trim();
    if (q) {
      sortedEntries = sortedEntries.filter(entry => {
        const nameMatch = entry.guestname && entry.guestname.toLowerCase().includes(q);
        const typeMatch = entry.type && entry.type.toLowerCase().includes(q);
        const survMatch = entry.surv && entry.surv.toLowerCase().includes(q);
        const amountMatch = entry.amount && String(entry.amount).includes(q);
        return nameMatch || typeMatch || survMatch || amountMatch;
      });
    }
    
    if (sortedEntries.length === 0) {
      entriesHtml += `<tr><td colspan="5" class="text-center text-muted" style="padding:20px;">No entries found.</td></tr>`;
    } else {
      sortedEntries.forEach(entry => {
        const amt = entry.amount ? Number(entry.amount).toLocaleString('en-IN') : '0';
        entriesHtml += `
          <tr>
            <td>${entry.datetime || '-'}</td>
            <td>${entry.type || '-'}</td>
            <td>${amt}</td>
            <td>${entry.guestname || '-'}</td>
            <td>${entry.surv || '-'}</td>
          </tr>
        `;
      });
    }
    entriesHtml += `</tbody></table></div>`;
    supervisorAllEntries.innerHTML = entriesHtml;
    
    const newSearchInput = document.getElementById('sup-home-search-input');
    if (newSearchInput) {
 if (newSearchInput) newSearchInput.addEventListener('input', (e) => {
        supHomeSearchQuery = e.target.value;
        renderSupervisorHome();
      });
      if (isSearchFocused) {
        newSearchInput.focus();
        const valLen = newSearchInput.value.length;
        newSearchInput.setSelectionRange(valLen, valLen);
      }
    }
    
    // 2. Render SEND Box (Today's Entries Above 49000 Only)
    const sendEntries = todayEntries.filter(e => {
      const amt = Number(String(e.amount).replace(/,/g, '')) || 0;
      return amt > 49000;
    });
    
    const dismissedIdsStr = localStorage.getItem('dismissed_sends');
    const dismissedIds = dismissedIdsStr ? JSON.parse(dismissedIdsStr) : [];
    const visibleSends = sendEntries.filter(e => !dismissedIds.includes(e.id) && !e.sendBoxDismissed);
    
    let sendHtml = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; margin-bottom: 15px;">
        <h3 style="margin: 0; color: var(--accent); display: flex; align-items: center;">
          <i data-lucide="send" style="margin-right: 8px; width: 20px; height: 20px;"></i> SEND
        </h3>
        <button id="btn-copy-delete-sends" class="btn-primary" style="padding: 6px 12px; font-size: 12px; border: none; border-radius: 4px; color: white; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: bold;" title="Copy All">
          <i data-lucide="copy" style="width:14px;height:14px;"></i> COPY
        </button>
      </div>
      <div id="send-box-content" style="display: flex; flex-direction: column; gap: 10px;">
    `;

    let allSentencesText = '';

    if (visibleSends.length === 0) {
      sendHtml += `<div style="text-align:center; padding:20px; color:var(--text-muted);">No pending entries above 49,000.</div>`;
    } else {
      visibleSends.forEach(e => {
        const sentence = getEntrySentence(e);
        allSentencesText += sentence + '\n';
        
        sendHtml += `
          <div class="send-item" style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; position: relative;">
            <p style="margin: 0; font-size: 14px; line-height: 1.4;">${sentence}</p>
          </div>
        `;
      });
    }
    sendHtml += `</div>`; // Close send-box-content
    
    const sendsListContent = document.getElementById('supervisor-send-box');
    if (sendsListContent) {
      sendsListContent.innerHTML = sendHtml;
      
      // Add event listener to COPY button
      const btnCopySends = document.getElementById('btn-copy-delete-sends');
      if (btnCopySends) {
 if (btnCopySends) btnCopySends.addEventListener('click', async () => {
          if (!allSentencesText.trim()) {
            return;
          }
          try {
            await copyTextToClipboard(allSentencesText);
            
            // Permanently dismiss the copied entries on the server
            btnCopySends.disabled = true;
            btnCopySends.innerHTML = `<i data-lucide="loader" class="spin" style="width:14px;height:14px;"></i> Copying...`;
            lucide.createIcons();
            
            await Promise.all(visibleSends.map(e => {
              const updated = { ...e, sendBoxDismissed: true };
              return fetch(`/api/entries?id=${e.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
              });
            }));
            
            await fetchEntries(); // Re-render supervisor page and refresh entries from database
          } catch (err) {
            console.error('Failed to copy and dismiss: ', err);
          } finally {
            btnCopySends.disabled = false;
            btnCopySends.innerHTML = `<i data-lucide="copy" style="width:14px;height:14px;"></i> COPY`;
            lucide.createIcons();
          }
        });
      }
    }
    
    lucide.createIcons();
  }

  // Warning Modal Close Button Listener
  const btnCloseBarredWarning = document.getElementById('btn-close-barred-warning');
  const barredWarningModal = document.getElementById('barred-warning-modal');
  if (btnCloseBarredWarning && barredWarningModal) {
 if (btnCloseBarredWarning) btnCloseBarredWarning.addEventListener('click', () => {
      barredWarningModal.style.display = 'none';
    });
  }

  // EventSource listener for real-time barred guest notifications
  function startEventSource() {
    if (typeof EventSource === 'undefined') {
      console.warn('EventSource is not defined in this environment.');
      return;
    }
    const eventSource = new EventSource('/api/events');
    const recentlyWarnedGuests = {};
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'date-changed' && data.newDate) {
          console.log('[SSE] Business date changed to:', data.newDate);
          currentBusinessDateStr = data.newDate;
          if (homeGamingDateDisplay) {
            homeGamingDateDisplay.textContent = currentBusinessDateStr;
          }
          const allGamingDateEl = document.getElementById('all-entries-gaming-date');
          if (allGamingDateEl) {
            allGamingDateEl.textContent = `TODAY GAMING DATE: ${currentBusinessDateStr}`;
          }
          const dayNum = Number(currentBusinessDateStr.split('-')[2]);
          if (!isNaN(dayNum)) {
            activeAllEntriesDay = dayNum;
            if (gotoDayInput) gotoDayInput.value = activeAllEntriesDay;
          }
          if (allEntriesDatePicker) {
            allEntriesDatePicker.value = currentBusinessDateStr;
          }
          fetchEntries().then(() => {
            renderDayPagination();
          });
        }

        if (data.type === 'barred-match') {
          const now = Date.now();
          const guestKey = String(data.guestname || '').toLowerCase().trim();
          if (recentlyWarnedGuests[guestKey] && (now - recentlyWarnedGuests[guestKey] < 3000)) {
            // Throttle duplicate warning popups within 3 seconds
            return;
          }
          recentlyWarnedGuests[guestKey] = now;

          const warningModal = document.getElementById('barred-warning-modal');
          const warningName = document.getElementById('barred-warning-name');
          const warningReason = document.getElementById('barred-warning-reason');
          if (warningModal && warningName && warningReason) {
            warningName.textContent = data.guestname;
            let details = '';
            if (data.content) {
              for (const key in data.content) {
                if (key !== 'id' && key !== 'timestamp') {
                  
                  const kLow = key.toLowerCase();
                  const val = String(data.content[key] || '');
                  if (kLow.includes('photo') || kLow.includes('image')) {
                     if (val.startsWith('data:image/') || val.startsWith('http')) {
                        details += `<div style="margin-bottom:4px;"><strong style="color:#a78bfa;">${key}:</strong><br/><img src="${val}" style="max-width: 150px; border-radius: 4px; margin-top: 4px;" /></div>`;
                        continue;
                     }
                  }
                  details += `<div style="margin-bottom:4px;"><strong style="color:#a78bfa;">${key}:</strong> ${val}</div>`;

                }
              }
            }
            warningReason.innerHTML = details || (data.reason || 'No reason specified');
            warningModal.style.display = 'flex';
            if (window.lucide) lucide.createIcons();
          }
        }
      } catch (err) {
        console.error('Error processing event stream message:', err);
      }
    };
    
    eventSource.onerror = (err) => {
      console.error('SSE Connection error, retrying in 5 seconds...', err);
      eventSource.close();
      setTimeout(startEventSource, 5000);
    };
  }
  
  startEventSource();

  updateAllEntriesView();
  checkAuthSession();
});

async function extractExcelImages(arrayBuffer) {
  const imagesMap = {};
  try {
    if (typeof JSZip === 'undefined') return imagesMap;
    const zip = await JSZip.loadAsync(arrayBuffer);
    
    // Find all drawing XML files
    const drawingFiles = Object.keys(zip.files).filter(f => /^xl\/drawings\/drawing\d+\.xml$/.test(f));
    
    for (const dFilePath of drawingFiles) {
      // Find corresponding .rels file
      const dFileName = dFilePath.split('/').pop();
      const relsFilePath = "xl/drawings/_rels/" + dFileName + ".rels";
      
      const drawingsRelFile = zip.file(relsFilePath);
      if (!drawingsRelFile) continue;
      const relsXml = await drawingsRelFile.async("string");
      
      const rIdMap = {};
      const relsMatch = relsXml.matchAll(/<Relationship Id="([^"]+)"[^>]+Target="([^"]+)"/g);
      for (const match of relsMatch) {
         let target = match[2];
         if (target.startsWith('../')) target = target.substring(3);
         rIdMap[match[1]] = target;
      }
      
      const drawingsFile = zip.file(dFilePath);
      const drawingsXml = await drawingsFile.async("string");
      
      const anchors = drawingsXml.split(/<xdr:twoCellAnchor|<xdr:oneCellAnchor/);
      for (let i = 1; i < anchors.length; i++) {
         const anchor = anchors[i];
         const rowMatch = anchor.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/);
         const blipMatch = anchor.match(/<a:blip[\s\S]*?r:embed="([^"]+)"/);
         if (rowMatch && blipMatch) {
            const rowIdx = parseInt(rowMatch[1], 10);
            const rId = blipMatch[1];
            const mediaPath = rIdMap[rId];
            if (mediaPath) {
               const mediaFile = zip.file("xl/" + mediaPath);
               if (mediaFile) {
                  const base64 = await mediaFile.async("base64");
                  let ext = mediaPath.split('.').pop().toLowerCase();
                  if (ext === 'jpg') ext = 'jpeg';
                  imagesMap[rowIdx] = `data:image/${ext};base64,${base64}`;
               }
            }
         }
      }
    }
  } catch(err) {
    console.error("Image extraction error:", err);
  }
  return imagesMap;
}

document.addEventListener('DOMContentLoaded', () => {
  const directBarredInput = document.getElementById('direct-photo-barred');
  const directStaffInput = document.getElementById('direct-photo-staff');
  let currentPhotoId = null;

  document.body.addEventListener('click', (e) => {
    if (e.target.closest('.btn-photo-barred')) {
      currentPhotoId = e.target.closest('.btn-photo-barred').dataset.id;
      if(directBarredInput) directBarredInput.click();
    }
    if (e.target.closest('.btn-photo-staff')) {
      currentPhotoId = e.target.closest('.btn-photo-staff').dataset.id;
      if(directStaffInput) directStaffInput.click();
    }
  });

  if (directBarredInput) {
 if (directBarredInput) directBarredInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !currentPhotoId) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const photo = ev.target.result;
        await fetch(`/api/barred?id=${currentPhotoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo })
        });
        fetchAndRenderBarredGuests();
        directBarredInput.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  if (directStaffInput) {
    if (directStaffInput) directStaffInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file || !currentPhotoId) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const photo = ev.target.result;
        await fetch(`/api/staff?id=${currentPhotoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo })
        });
        fetchAndRenderStaff();
        directStaffInput.value = '';
      };
      reader.readAsDataURL(file);
    });
  }

  // Window resize handler: Dynamically auto-fit layout when page size increases or decreases
  let autoFitResizeTimer = null;
  window.addEventListener('resize', () => {
    if (autoFitResizeTimer) clearTimeout(autoFitResizeTimer);
    autoFitResizeTimer = setTimeout(() => {
      const wrapper = document.querySelector('.content-wrapper');
      if (wrapper) {
        wrapper.style.maxWidth = '100%';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        wrapper.style.flex = '1 1 0';
      }
      if (window.lucide) lucide.createIcons();
    }, 100);
  });
});


function saveActivePanel(panelId) {
  localStorage.setItem('activeSurveillancePanel', panelId);
}




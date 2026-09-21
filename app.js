/**
 * HDHomeRun Dashboard PWA
 */

const STORAGE_ACTIVE_IP = 'hdhr_active_ip';
const STORAGE_DEVICES = 'hdhr_saved_devices';
const STORAGE_THEME = 'hdhr_theme';
const STORAGE_CONFIRM_DELETE = 'hdhr_confirm_delete';
const DEFAULT_IP = '10.1.0.4';

// Immediately apply saved theme to documentElement to avoid flash
const initialTheme = localStorage.getItem(STORAGE_THEME) || 'dark';
document.documentElement.setAttribute('data-theme', initialTheme);

// Application State
const state = {
  currentIp: localStorage.getItem(STORAGE_ACTIVE_IP) || DEFAULT_IP,
  devices: JSON.parse(localStorage.getItem(STORAGE_DEVICES) || '[]'),
  deviceInfo: null,
  tuners: [],
  lineup: [],
  recordings: [],
  series: [],
  episodes: [],
  rules: [],
  dvrSubView: 'series', // 'series', 'episodes', 'rules'
  hasDvr: false,
  dvrStorageUrl: null,
  activeTab: 'tuners',
  isPolling: true,
  pollInterval: 2500,
  pollTimer: null,
  filterText: '',
  filterType: 'allowed', // 'allowed', 'all', 'favorites', 'hd', 'hidden'
};

// Global DOM Elements
const deviceSelect = document.getElementById('device-select');
const connectionDot = document.getElementById('connection-status-dot');
const btnTogglePoll = document.getElementById('btn-toggle-poll');
const pollBtnLabel = document.getElementById('poll-btn-label');
const pollIntervalSelect = document.getElementById('poll-interval-select');
const globalAlert = document.getElementById('global-alert');
const btnInstall = document.getElementById('btn-install');
const navTabs = document.querySelectorAll('.nav-tab');
const tabViews = document.querySelectorAll('.tab-view');

// Tuner Elements
const tunersGrid = document.getElementById('tuners-grid');
const tunerSummaryBadge = document.getElementById('tuner-summary-badge');
const btnRefreshTuners = document.getElementById('btn-refresh-tuners');

// Lineup Elements
const lineupSearch = document.getElementById('lineup-search');
const lineupFilterPills = document.querySelectorAll('#lineup-filter-pills .pill');
const lineupAllowedPill = document.getElementById('lineup-allowed-pill');
const lineupAllPill = document.getElementById('lineup-all-pill');
const lineupFavPill = document.getElementById('lineup-fav-pill');
const lineupAtsc3Pill = document.getElementById('lineup-atsc3-pill');
const lineupDrmPill = document.getElementById('lineup-drm-pill');
const lineupHdPill = document.getElementById('lineup-hd-pill');
const lineupHiddenPill = document.getElementById('lineup-hidden-pill');
const lineupTbody = document.getElementById('lineup-tbody');
const lineupCountBadge = document.getElementById('lineup-count-badge');
const btnRefreshLineup = document.getElementById('btn-refresh-lineup');
const btnExportM3u = document.getElementById('btn-export-m3u');

// DVR Elements
const dvrEngineInfo = document.getElementById('dvr-engine-info');
const dvrNotDetected = document.getElementById('dvr-not-detected');
const recordingsContainer = document.getElementById('recordings-container');
const recordingsCountBadge = document.getElementById('recordings-count-badge');
const btnRefreshRecordings = document.getElementById('btn-refresh-recordings');
const btnRecheckDvr = document.getElementById('btn-recheck-dvr');
const dvrStorageBarCard = document.getElementById('dvr-storage-bar-card');
const storageSpaceText = document.getElementById('storage-space-text');
const storageBarFill = document.getElementById('storage-bar-fill');
const dvrFilterBar = document.getElementById('dvr-filter-bar');
const dvrViewPills = document.querySelectorAll('#dvr-view-pills .pill');
const seriesCountPill = document.getElementById('series-count-pill');
const episodesCountPill = document.getElementById('episodes-count-pill');
const rulesCountPill = document.getElementById('rules-count-pill');

// System Elements
const infoModel = document.getElementById('info-model');
const infoId = document.getElementById('info-id');
const infoFirmware = document.getElementById('info-firmware');
const infoTuners = document.getElementById('info-tuners');
const infoIp = document.getElementById('info-ip');
const infoStorage = document.getElementById('info-storage');
const discoveredDevicesList = document.getElementById('discovered-devices-list');
const inputCustomIp = document.getElementById('input-custom-ip');
const btnAddDevice = document.getElementById('btn-add-device');
const btnRediscover = document.getElementById('btn-rediscover');
const prefConfirmDelete = document.getElementById('pref-confirm-delete');

// Confirm Delete Modal Elements
const modalConfirmDelete = document.getElementById('modal-confirm-delete');
const modalDeleteTitle = document.getElementById('modal-delete-title');
const confirmDeleteMsg = document.getElementById('confirm-delete-msg');
const confirmDeleteDontAsk = document.getElementById('confirm-delete-dont-ask');
const btnCancelDelete = document.getElementById('btn-cancel-delete');
const btnProceedDelete = document.getElementById('btn-proceed-delete');
const modalCloseBtn = document.getElementById('modal-close-btn');

/* ==========================================================================
   Initialization
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  setupTheme();
  setupNavigation();
  setupPollingControls();
  setupLineupFilters();
  setupDvrPills();
  setupDeviceManagement();
  setupDeleteModal();
  setupPwa();

  // Populate device dropdown
  renderDeviceDropdown();

  // Initial load
  await loadDeviceDetails();
  await refreshActiveTab();

  // Start polling
  startPolling();

  // Setup Firmware Check button
  const btnCheckFirmware = document.getElementById('btn-check-firmware');
  if (btnCheckFirmware) {
    btnCheckFirmware.addEventListener('click', async () => {
      btnCheckFirmware.textContent = '⏳';
      await loadDeviceDetails();
      setTimeout(() => (btnCheckFirmware.textContent = '🔄 Check'), 600);
    });
  }
});

/* ==========================================================================
   Theme Management
   ========================================================================== */

function setupTheme() {
  const savedTheme = localStorage.getItem(STORAGE_THEME) || 'dark';
  applyTheme(savedTheme);

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }

  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.themeVal);
    });
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_THEME, theme);

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect && themeSelect.value !== theme) {
    themeSelect.value = theme;
  }

  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach((btn) => {
    if (btn.dataset.themeVal === theme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    const themeColors = {
      dark: '#0b1120',
      light: '#f1f5f9',
      oled: '#000000',
      teal: '#041b1d',
      nord: '#242933',
    };
    metaThemeColor.setAttribute('content', themeColors[theme] || '#0b1120');
  }
}

/* ==========================================================================
   Navigation & Tabs
   ========================================================================== */

function setupNavigation() {
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
  });

  tabViews.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${tabId}`);
  });

  // Fetch tab data if needed
  refreshActiveTab();
}

async function refreshActiveTab() {
  switch (state.activeTab) {
    case 'tuners':
      await fetchTuners();
      break;
    case 'lineup':
      if (state.lineup.length === 0) await fetchLineup();
      break;
    case 'recordings':
      await fetchRecordings();
      break;
    case 'system':
      await loadDeviceDetails();
      break;
  }
}

/* ==========================================================================
   Device Management & Discovery
   ========================================================================== */

function renderDeviceDropdown() {
  deviceSelect.innerHTML = '';

  // Ensure current IP is in list
  const allIps = new Set([state.currentIp, ...state.devices.map((d) => d.ip || d.LocalIP)]);

  allIps.forEach((ip) => {
    if (!ip) return;
    const dev = state.devices.find((d) => (d.ip || d.LocalIP) === ip);
    const label = dev?.ModelNumber ? `${dev.ModelNumber} (${ip})` : `HDHomeRun (${ip})`;
    const opt = document.createElement('option');
    opt.value = ip;
    opt.textContent = label;
    if (ip === state.currentIp) opt.selected = true;
    deviceSelect.appendChild(opt);
  });

  deviceSelect.onchange = async () => {
    await switchDevice(deviceSelect.value);
  };
}

async function switchDevice(newIp) {
  state.currentIp = newIp;
  localStorage.setItem(STORAGE_ACTIVE_IP, newIp);
  state.lineup = [];
  state.recordings = [];
  state.hasDvr = false;
  state.dvrStorageUrl = null;

  hideAlert();
  await loadDeviceDetails();
  await refreshActiveTab();
}

async function loadDeviceDetails() {
  const ip = state.currentIp;
  try {
    const res = await fetch(`http://${ip}/discover.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.deviceInfo = data;
    connectionDot.className = 'status-dot connected';

    // Populate System view
    infoModel.textContent = data.ModelNumber || 'Unknown Model';
    infoId.textContent = data.DeviceID || '—';
    infoFirmware.textContent = data.FirmwareVersion || data.FirmwareName || '—';
    infoTuners.textContent = data.TunerCount ? `${data.TunerCount} Tuners` : '—';
    infoIp.textContent = ip;
    infoStorage.textContent = data.StorageURL || data.StorageID || 'None advertised';

    // Check for DVR / Storage engine in discover.json
    if (data.StorageURL) {
      state.hasDvr = true;
      state.dvrStorageUrl = data.StorageURL;
    } else if (data.StorageID) {
      state.hasDvr = true;
      state.dvrStorageUrl = `http://${ip}:4999`;
    }

    // Save device info to known list
    saveDevice({
      ip,
      ModelNumber: data.ModelNumber,
      DeviceID: data.DeviceID,
      StorageURL: data.StorageURL,
    });

    // Check for firmware updates
    checkFirmwareUpdate(data);
  } catch (err) {
    console.warn('Could not load discover.json:', err);
    connectionDot.className = 'status-dot error';
    showAlert(`Unable to connect to HDHomeRun at <code>${ip}</code>. Check your network or permissions.`, 'error');
  }
}

async function checkFirmwareUpdate(deviceData) {
  const badge = document.getElementById('firmware-status-badge');
  if (!badge) return;

  badge.className = 'badge';
  badge.textContent = 'Checking...';

  const currentVersion = deviceData?.FirmwareVersion || state.deviceInfo?.FirmwareVersion;

  // Check local discover.json for UpgradeURL or UpgradeAvailable
  const upgradeAvailable = !!(deviceData?.UpgradeURL || deviceData?.UpgradeAvailable);
  const upgradeVersion = deviceData?.UpgradeAvailable || '';

  if (upgradeAvailable) {
    badge.className = 'badge badge-update-available';
    badge.textContent = upgradeVersion ? `Update: v${upgradeVersion}` : 'Update Available';
    badge.title = 'A newer firmware is available. Click Open Device Web Admin to install.';
  } else {
    badge.className = 'badge badge-up-to-date';
    badge.textContent = '✓ Up to date';
    badge.title = `Firmware ${currentVersion || ''} is up to date`;
  }
}

async function discoverCloudDevices() {
  try {
    const res = await fetch('https://api.hdhomerun.com/discover');
    if (!res.ok) return;
    const list = await res.json();

    if (Array.isArray(list) && list.length > 0) {
      list.forEach((dev) => {
        saveDevice({
          ip: dev.LocalIP,
          ModelNumber: dev.ModelNumber,
          DeviceID: dev.DeviceID,
          StorageURL: dev.StorageURL,
        });
      });
      renderDeviceDropdown();
      renderDiscoveredList();
    }
  } catch (e) {
    console.log('Cloud discovery skipped or offline:', e.message);
  }
}

function saveDevice(dev) {
  const idx = state.devices.findIndex((d) => (d.ip || d.LocalIP) === dev.ip);
  if (idx >= 0) {
    state.devices[idx] = { ...state.devices[idx], ...dev };
  } else {
    state.devices.push(dev);
  }
  localStorage.setItem(STORAGE_DEVICES, JSON.stringify(state.devices));
}

function setupDeviceManagement() {
  btnAddDevice.addEventListener('click', () => {
    const ip = inputCustomIp.value.trim();
    if (ip) {
      inputCustomIp.value = '';
      saveDevice({ ip });
      renderDeviceDropdown();
      switchDevice(ip);
    }
  });

  btnRediscover.addEventListener('click', async () => {
    btnRediscover.disabled = true;
    btnRediscover.textContent = 'Discovering...';
    await discoverCloudDevices();
    btnRediscover.textContent = '🔍 Run Cloud Discovery (api.hdhomerun.com)';
    btnRediscover.disabled = false;
  });

  renderDiscoveredList();
}

function renderDiscoveredList() {
  discoveredDevicesList.innerHTML = '';
  if (state.devices.length === 0) {
    discoveredDevicesList.innerHTML = '<p class="text-sm text-muted">No other devices found.</p>';
    return;
  }

  state.devices.forEach((d) => {
    const ip = d.ip || d.LocalIP;
    const item = document.createElement('div');
    item.className = `device-item ${ip === state.currentIp ? 'active' : ''}`;
    item.innerHTML = `
      <div>
        <strong>${d.ModelNumber || 'HDHomeRun'}</strong>
        <span class="text-sm text-muted">(${ip})</span>
        ${d.DeviceID ? `<div class="text-sm font-mono text-muted">${d.DeviceID}</div>` : ''}
      </div>
      <div>
        ${
          ip === state.currentIp
            ? '<span class="badge">Active</span>'
            : `<button class="btn btn-sm btn-secondary btn-switch-ip" data-ip="${ip}">Switch</button>`
        }
      </div>
    `;
    discoveredDevicesList.appendChild(item);
  });

  document.querySelectorAll('.btn-switch-ip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ip = btn.getAttribute('data-ip');
      switchDevice(ip);
      renderDeviceDropdown();
      renderDiscoveredList();
    });
  });
}

/* ==========================================================================
   Tuner Monitoring & Status
   ========================================================================== */

async function fetchTuners() {
  const ip = state.currentIp;
  try {
    const res = await fetch(`http://${ip}/status.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tuners = await res.json();
    state.tuners = tuners;
    renderTuners(tuners);
    connectionDot.className = 'status-dot connected';
  } catch (err) {
    console.warn('Error fetching /status.json:', err);
    connectionDot.className = 'status-dot error';
    tunerSummaryBadge.textContent = 'Offline';
    tunerSummaryBadge.className = 'badge';
  }
}

function renderTuners(statusItems) {
  if (!Array.isArray(statusItems) || statusItems.length === 0) {
    tunersGrid.innerHTML = '<div class="loading-placeholder">No tuners reported by device.</div>';
    return;
  }

  // Separate physical tuners (tuner0, tuner1...) from outgoing live streaming sessions
  const physicalTuners = statusItems.filter((item) =>
    item.Resource && item.Resource.toLowerCase().startsWith('tuner')
  );
  const liveSessions = statusItems.filter((item) =>
    !item.Resource || !item.Resource.toLowerCase().startsWith('tuner')
  );

  let activeCount = 0;
  tunersGrid.innerHTML = '';

  physicalTuners.forEach((tuner, index) => {
    const isActive = Boolean(tuner.VctNumber || (tuner.TargetIP && tuner.TargetIP !== 'none'));
    if (isActive) activeCount++;

    const card = document.createElement('div');
    card.className = `tuner-card ${isActive ? 'active' : ''}`;

    const tunerName = tuner.Resource || `tuner${index}`;
    const statusText = isActive ? 'Streaming' : 'Idle';
    const statusClass = isActive ? 'streaming' : 'idle';

    let detailsHtml = '';
    let sharedBadge = '';

    if (isActive) {
      const strength = tuner.SignalStrengthPercent ?? 0;
      const quality = tuner.SignalQualityPercent ?? 0;
      const symbol = tuner.SymbolQualityPercent ?? 0;

      // Find all client sessions sharing this channel/tuner
      const clientSessions = [];

      // If the tuner itself has a direct external target IP
      if (tuner.TargetIP && tuner.TargetIP !== '[::1]' && tuner.TargetIP !== '::1' && tuner.TargetIP !== '127.0.0.1' && tuner.TargetIP !== 'none') {
        clientSessions.push({ type: 'client', ip: tuner.TargetIP });
      }

      // Check liveSessions (Resource: "live" or "record") from status.json
      const matchingSessions = liveSessions.filter((s) => {
        if (!s.Name) return false;
        return tuner.VctNumber && s.Name.includes(tuner.VctNumber);
      });

      matchingSessions.forEach((s) => {
        const isRecord = (s.Resource && s.Resource.toLowerCase().includes('record')) ||
                         (s.Name && s.Name.toLowerCase().includes('record'));
        if (!clientSessions.some((c) => c.ip === s.TargetIP && c.type === (isRecord ? 'record' : 'client'))) {
          clientSessions.push({
            type: isRecord ? 'record' : 'client',
            ip: s.TargetIP || 'Local',
            name: s.Name || '',
          });
        }
      });

      let clientsDisplay = '';
      if (clientSessions.length === 0) {
        clientsDisplay = '<span>Client: <code>Local</code></span>';
      } else if (clientSessions.length === 1) {
        const c = clientSessions[0];
        clientsDisplay = `<span>Client: <code>${c.type === 'record' ? '📼 DVR Record' : c.ip}</code></span>`;
      } else {
        clientsDisplay = `
          <div class="tuner-shared-clients">
            <span class="shared-clients-label">👥 Shared (${clientSessions.length} sessions):</span>
            <div class="shared-clients-tags">
              ${clientSessions.map((c) => `<span class="client-badge">${c.type === 'record' ? '📼 DVR' : c.ip}</span>`).join('')}
            </div>
          </div>
        `;
      }

      // Network bitrate
      let rateDisplay = '';
      if (tuner.NetworkRate) {
        rateDisplay = `<span>Rate: <strong>${(tuner.NetworkRate / 1000000).toFixed(2)} Mbps</strong></span>`;
      } else if (tuner.Frequency) {
        rateDisplay = `<span>Freq: ${(tuner.Frequency / 1000000).toFixed(3)} MHz</span>`;
      }

      if (clientSessions.length > 1) {
        sharedBadge = `<span class="badge badge-hd" title="Tuner Sharing active: ${clientSessions.length} clients sharing this tuner">Shared (${clientSessions.length})</span>`;
      }

      detailsHtml = `
        <div class="tuner-active-info">
          <div class="tuner-channel-row">
            <span class="tuner-channel-name">${tuner.VctName || 'Unknown Channel'}</span>
            <span class="tuner-channel-number">${tuner.VctNumber ? `Ch ${tuner.VctNumber}` : ''}</span>
          </div>
          <div class="tuner-meta-row">
            ${clientsDisplay}
            ${rateDisplay}
          </div>
        </div>

        <div class="metric-group">
          ${renderMetricBar('Signal Strength', strength)}
          ${renderMetricBar('SNR Quality', quality)}
          ${renderMetricBar('Symbol Quality', symbol)}
        </div>
      `;
    } else {
      detailsHtml = `
        <div class="tuner-idle-state">
          <span>Tuner available (Idle)</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="tuner-card-header">
        <span class="tuner-name">
          <span class="status-dot ${isActive ? 'connected' : ''}"></span>
          ${tunerName.toUpperCase()}
          ${sharedBadge || ''}
        </span>
        <span class="tuner-status-badge ${statusClass}">${statusText}</span>
      </div>
      ${detailsHtml}
    `;

    tunersGrid.appendChild(card);
  });

  tunerSummaryBadge.textContent = `${activeCount} / ${physicalTuners.length} Active`;
  tunerSummaryBadge.className = `badge ${activeCount > 0 ? 'badge-hd' : ''}`;
}

function renderMetricBar(label, percent) {
  let gradeClass = 'poor';
  if (percent >= 80) gradeClass = 'good';
  else if (percent >= 60) gradeClass = 'fair';

  return `
    <div class="metric-row">
      <div class="metric-label-group">
        <span>${label}</span>
        <span class="metric-value">${percent}%</span>
      </div>
      <div class="metric-bar-bg">
        <div class="metric-bar-fill ${gradeClass}" style="width: ${percent}%;"></div>
      </div>
    </div>
  `;
}

btnRefreshTuners.addEventListener('click', fetchTuners);

/* ==========================================================================
   Polling Controls
   ========================================================================== */

function setupPollingControls() {
  btnTogglePoll.addEventListener('click', () => {
    state.isPolling = !state.isPolling;
    updatePollUi();
    if (state.isPolling) {
      startPolling();
    } else {
      stopPolling();
    }
  });

  pollIntervalSelect.addEventListener('change', () => {
    const val = parseInt(pollIntervalSelect.value, 10);
    if (val === 0) {
      state.isPolling = false;
      stopPolling();
    } else {
      state.pollInterval = val;
      state.isPolling = true;
      startPolling();
    }
    updatePollUi();
  });
}

function updatePollUi() {
  const dot = btnTogglePoll.querySelector('.live-dot');
  if (state.isPolling) {
    dot.className = 'live-dot pulse';
    pollBtnLabel.textContent = 'Live';
  } else {
    dot.className = 'live-dot paused';
    pollBtnLabel.textContent = 'Paused';
  }
}

function startPolling() {
  stopPolling();
  if (!state.isPolling || state.pollInterval <= 0) return;

  state.pollTimer = setInterval(() => {
    // Only poll tuners actively if the tab is visible and on tuners tab
    if (document.visibilityState === 'visible' && state.activeTab === 'tuners') {
      fetchTuners();
    }
  }, state.pollInterval);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

/* ==========================================================================
   Channel Lineup
   ========================================================================== */

function isAtsc3Channel(ch) {
  return (
    ch.VideoCodec === 'HEVC' ||
    ch.AudioCodec === 'AC4' ||
    (ch.GuideNumber && parseFloat(ch.GuideNumber) >= 100)
  );
}

async function fetchLineup() {
  const ip = state.currentIp;
  lineupTbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading channels...</td></tr>';

  try {
    // Query with show=found to get all discovered channels including hidden/disabled ones
    const res = await fetch(`http://${ip}/lineup.json?show=found`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lineup = await res.json();
    state.lineup = Array.isArray(lineup) ? lineup : [];

    // Update count pill badges
    const allowedChannels = state.lineup.filter((ch) => ch.Enabled !== 0);
    const hiddenChannels = state.lineup.filter((ch) => ch.Enabled === 0);
    const favChannels = state.lineup.filter((ch) => ch.Favorite === 1);
    const atsc3Channels = state.lineup.filter((ch) => isAtsc3Channel(ch));
    const drmChannels = state.lineup.filter((ch) => ch.DRM === 1);
    const hdChannels = state.lineup.filter((ch) => ch.HD === 1 || (ch.VideoCodec && ch.VideoCodec.includes('HD')));

    lineupAllowedPill.textContent = allowedChannels.length;
    lineupAllPill.textContent = state.lineup.length;
    lineupFavPill.textContent = favChannels.length;
    lineupAtsc3Pill.textContent = atsc3Channels.length;
    lineupDrmPill.textContent = drmChannels.length;
    lineupHdPill.textContent = hdChannels.length;
    lineupHiddenPill.textContent = hiddenChannels.length;

    lineupCountBadge.textContent = allowedChannels.length;
    lineupCountBadge.classList.remove('hidden');

    renderLineup();
  } catch (err) {
    console.warn('Error fetching lineup:', err);
    lineupTbody.innerHTML = `<tr><td colspan="5" class="empty-state error">Failed to load lineup from ${ip}.</td></tr>`;
  }
}

function setupLineupFilters() {
  lineupSearch.addEventListener('input', (e) => {
    state.filterText = e.target.value.toLowerCase().trim();
    renderLineup();
  });

  lineupFilterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      lineupFilterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.filterType = pill.getAttribute('data-filter');
      renderLineup();
    });
  });

  btnRefreshLineup.addEventListener('click', fetchLineup);
  btnExportM3u.addEventListener('click', exportM3u);
}

function renderLineup() {
  const filtered = state.lineup.filter((ch) => {
    // Text search
    const matchesText =
      !state.filterText ||
      (ch.GuideName && ch.GuideName.toLowerCase().includes(state.filterText)) ||
      (ch.GuideNumber && ch.GuideNumber.toLowerCase().includes(state.filterText));

    if (!matchesText) return false;

    // Pill filters
    if (state.filterType === 'allowed') {
      return ch.Enabled !== 0;
    }
    if (state.filterType === 'favorites') {
      return ch.Favorite === 1;
    }
    if (state.filterType === 'atsc3') {
      return isAtsc3Channel(ch);
    }
    if (state.filterType === 'drm') {
      return ch.DRM === 1;
    }
    if (state.filterType === 'hd') {
      return ch.HD === 1 || (ch.VideoCodec && ch.VideoCodec.includes('HD'));
    }
    if (state.filterType === 'hidden') {
      return ch.Enabled === 0;
    }
    return true; // 'all'
  });

  if (filtered.length === 0) {
    lineupTbody.innerHTML = '<tr><td colspan="5" class="empty-state">No matching channels found.</td></tr>';
    return;
  }

  lineupTbody.innerHTML = '';
  filtered.forEach((ch) => {
    const tr = document.createElement('tr');
    const isHd = ch.HD === 1;
    const isHidden = ch.Enabled === 0;
    const isFav = ch.Favorite === 1;
    const isAtsc3 = isAtsc3Channel(ch);
    const isDrm = ch.DRM === 1;
    const streamUrl = ch.URL || `http://${state.currentIp}:5004/auto/v${ch.GuideNumber}`;

    if (isHidden) {
      tr.className = 'lineup-row-disabled';
    }

    let statusBadge = '';
    if (isHidden) {
      statusBadge = '<span class="badge badge-disabled">Hidden ❌</span>';
    } else if (isFav) {
      statusBadge = '<span class="badge badge-favorite">⭐ Fav</span>';
    } else {
      statusBadge = '<span class="badge">Allowed</span>';
    }

    const atscBadge = isAtsc3
      ? '<span class="badge badge-atsc3" title="ATSC 3.0 (NextGen TV)">ATSC3</span>'
      : '<span class="badge" title="ATSC 1.0 (Standard Digital)">ATSC1</span>';

    const drmBadge = isDrm
      ? '<span class="badge badge-drm" title="Encrypted with ATSC 3.0 DRM">🔒 DRM</span>'
      : '';

    // Signal Quality meter (colors with % in tooltip)
    let signalHtml = '<span class="text-muted">—</span>';
    if (ch.SignalQuality != null || ch.SignalStrength != null) {
      const sq = ch.SignalQuality ?? ch.SignalStrength;
      const ss = ch.SignalStrength;
      let gradeClass = 'poor';
      if (sq >= 80) gradeClass = 'good';
      else if (sq >= 60) gradeClass = 'fair';

      const tooltip = `${sq}% Signal Quality${ss != null ? ` (${ss}% Strength)` : ''}`;
      signalHtml = `
        <div class="signal-meter-wrapper" title="${tooltip}">
          <div class="signal-mini-bar">
            <div class="signal-mini-fill ${gradeClass}" style="width: ${sq}%;"></div>
          </div>
        </div>
      `;
    }

    // Actions for channel
    let actionsHtml = '';
    if (isDrm) {
      actionsHtml = `
        <button class="btn btn-sm btn-drm-locked" title="ATSC 3.0 DRM Encrypted: Playable only in official HDHomeRun app with active license, not in VLC or other players">
          🔒 DRM
        </button>
        <button class="btn btn-sm btn-secondary btn-copy-url" data-url="${streamUrl}" title="Copy Stream URL">
          📋 Copy URL
        </button>
      `;
    } else {
      actionsHtml = `
        <button class="btn btn-sm btn-primary btn-copy-url" data-url="${streamUrl}" title="Copy Stream URL to paste into VLC or media player">
          📋 Copy URL
        </button>
        <button class="btn btn-sm btn-secondary btn-download-m3u" data-num="${ch.GuideNumber}" data-name="${ch.GuideName || ''}" data-url="${streamUrl}" title="Download .m3u stream playlist to open directly in VLC / default player">
          📺 M3U
        </button>
      `;
    }

    tr.innerHTML = `
      <td class="channel-num-cell">${ch.GuideNumber}</td>
      <td class="channel-name-cell">
        ${ch.GuideName || 'Unknown'}
      </td>
      <td>
        <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
          ${statusBadge}
          ${atscBadge}
          ${isHd ? '<span class="badge badge-hd">HD</span>' : '<span class="badge">SD</span>'}
          ${drmBadge}
        </div>
      </td>
      <td>
        ${signalHtml}
      </td>
      <td class="table-actions">
        ${actionsHtml}
      </td>
    `;
    lineupTbody.appendChild(tr);
  });

  // Attach clipboard copy listeners
  document.querySelectorAll('.btn-copy-url').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      try {
        await navigator.clipboard.writeText(url);
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => (btn.innerHTML = originalText), 1500);
      } catch (err) {
        console.error('Failed to copy', err);
      }
    });
  });

  // Attach single-channel M3U download listeners
  document.querySelectorAll('.btn-download-m3u').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chNum = btn.getAttribute('data-num');
      const chName = btn.getAttribute('data-name') || `Channel ${chNum}`;
      const url = btn.getAttribute('data-url');
      const m3uContent = `#EXTM3U\n#EXTINF:-1 tvg-id="v${chNum}" tvg-name="${chName}",${chName}\n${url}\n`;
      const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanName = chName.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${cleanName}-${chNum}.m3u`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    });
  });
}

function exportM3u() {
  if (!state.lineup || state.lineup.length === 0) {
    alert('No channels in lineup to export.');
    return;
  }

  let m3u = '#EXTM3U\n';
  state.lineup.forEach((ch) => {
    const streamUrl = ch.URL || `http://${state.currentIp}:5004/auto/v${ch.GuideNumber}`;
    m3u += `#EXTINF:-1 tvg-id="${ch.GuideNumber}" tvg-name="${ch.GuideName}" tvg-chno="${ch.GuideNumber}", ${ch.GuideName}\n`;
    m3u += `${streamUrl}\n`;
  });

  const blob = new Blob([m3u], { type: 'application/x-mpegurl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hdhomerun_lineup_${state.currentIp}.m3u`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   DVR / Recordings
   ========================================================================== */

function setupDvrPills() {
  dvrViewPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      dvrViewPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.dvrSubView = pill.getAttribute('data-dvr-view');
      renderCurrentDvrSubView();
    });
  });
}

function updateStorageBar() {
  if (state.deviceInfo?.TotalSpace && state.deviceInfo?.FreeSpace) {
    dvrStorageBarCard.classList.remove('hidden');
    const totalGb = (state.deviceInfo.TotalSpace / (1024 * 1024 * 1024)).toFixed(1);
    const freeGb = (state.deviceInfo.FreeSpace / (1024 * 1024 * 1024)).toFixed(1);
    const usedBytes = state.deviceInfo.TotalSpace - state.deviceInfo.FreeSpace;
    const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(1);
    const usedPercent = Math.round((usedBytes / state.deviceInfo.TotalSpace) * 100);

    storageSpaceText.textContent = `${freeGb} GB free of ${totalGb} GB (${usedPercent}% used)`;
    storageBarFill.style.width = `${usedPercent}%`;
    if (usedPercent > 90) {
      storageBarFill.className = 'metric-bar-fill poor';
    } else if (usedPercent > 75) {
      storageBarFill.className = 'metric-bar-fill fair';
    } else {
      storageBarFill.className = 'metric-bar-fill good';
    }
  } else {
    dvrStorageBarCard.classList.add('hidden');
  }
}

async function fetchRecordings() {
  const ip = state.currentIp;
  recordingsContainer.innerHTML = '<div class="loading-placeholder">Loading DVR recordings and rules...</div>';
  dvrNotDetected.classList.add('hidden');

  // Correctly determine storage URL: do NOT duplicate /recorded_files.json
  let targetUrl = state.dvrStorageUrl || `http://${ip}/recorded_files.json`;
  if (!targetUrl.includes('.json')) {
    targetUrl = targetUrl.replace(/\/+$/, '') + '/recorded_files.json';
  }

  try {
    let res = await fetch(targetUrl);

    // Fallback: if port 80 failed and no explicit StorageURL was configured, try port 4999
    if (!res.ok && !state.dvrStorageUrl) {
      try {
        const altRes = await fetch(`http://${ip}:4999/recorded_files.json`);
        if (altRes.ok) {
          res = altRes;
          state.dvrStorageUrl = `http://${ip}:4999/recorded_files.json`;
        }
      } catch (e) {}
    }

    if (!res.ok) {
      throw new Error(`DVR endpoint returned HTTP ${res.status}`);
    }

    const seriesData = await res.json();
    if (!Array.isArray(seriesData)) {
      throw new Error('Unexpected DVR response format');
    }

    state.hasDvr = true;
    state.series = seriesData;
    seriesCountPill.textContent = seriesData.length;
    dvrEngineInfo.textContent = `Connected to recording engine (${state.deviceInfo?.FriendlyName || ip})`;
    updateStorageBar();

    // Concurrently fetch episodes for each series
    const episodePromises = seriesData.map(async (item) => {
      if (item.EpisodesURL) {
        try {
          const epRes = await fetch(item.EpisodesURL);
          if (epRes.ok) {
            const epJson = await epRes.json();
            return Array.isArray(epJson) ? epJson : [];
          }
        } catch (e) {
          console.warn('Could not fetch episodes for', item.Title, e);
        }
      } else if (item.PlayURL || item.CmdURL) {
        return [item];
      }
      return [];
    });

    const allEpisodesNested = await Promise.all(episodePromises);
    const allEpisodes = allEpisodesNested.flat();
    allEpisodes.sort((a, b) => (b.StartTime || 0) - (a.StartTime || 0));

    state.episodes = allEpisodes;
    episodesCountPill.textContent = allEpisodes.length;
    recordingsCountBadge.textContent = allEpisodes.length;
    recordingsCountBadge.classList.remove('hidden');

    // Also fetch scheduled recording rules from Cloud API using DeviceAuth
    await fetchScheduledRules();

    renderCurrentDvrSubView();
  } catch (err) {
    console.info('No DVR engine found or request failed:', err.message);
    state.hasDvr = false;
    recordingsCountBadge.classList.add('hidden');
    recordingsContainer.innerHTML = '';
    dvrNotDetected.classList.remove('hidden');
    dvrEngineInfo.textContent = 'No recording engine detected';
  }
}

async function fetchScheduledRules() {
  if (!state.deviceInfo?.DeviceAuth) return;
  try {
    const res = await fetch(`https://api.hdhomerun.com/api/recording_rules?DeviceAuth=${state.deviceInfo.DeviceAuth}`);
    if (res.ok) {
      const rules = await res.json();
      state.rules = Array.isArray(rules) ? rules : [];
      rulesCountPill.textContent = state.rules.length;
    }
  } catch (e) {
    console.warn('Could not load scheduled recording rules:', e);
  }
}

function renderCurrentDvrSubView() {
  if (!state.hasDvr) return;

  switch (state.dvrSubView) {
    case 'episodes':
      renderEpisodes(state.episodes);
      break;
    case 'series':
      renderSeries(state.series);
      break;
    case 'rules':
      renderRules(state.rules);
      break;
  }
}

function renderEpisodes(episodes) {
  if (!episodes || episodes.length === 0) {
    recordingsContainer.innerHTML = `
      <div class="card empty-card" style="grid-column: 1 / -1;">
        <div class="empty-icon">📂</div>
        <h3>No Recorded Episodes Found</h3>
        <p class="text-muted">No recorded episodes are currently stored on the drive.</p>
      </div>
    `;
    return;
  }

  recordingsContainer.innerHTML = '';
  episodes.forEach((ep) => {
    const card = document.createElement('div');
    card.className = 'recording-card';

    const recordedDate = ep.StartTime ? new Date(ep.StartTime * 1000).toLocaleDateString() : '—';
    const durationMin = ep.EndTime && ep.StartTime ? Math.round((ep.EndTime - ep.StartTime) / 60) + ' min' : (ep.Duration ? Math.round(ep.Duration / 60) + ' min' : '—');
    const playUrl = ep.PlayURL || ep.CmdURL;
    const posterUrl = ep.ImageURL || 'icon.svg';

    let channelDisplay = '';
    if (ep.ChannelName || ep.ChannelNumber) {
      channelDisplay = `
        <span class="channel-tag">
          ${ep.ChannelImageURL ? `<img src="${ep.ChannelImageURL}" class="channel-logo-img" alt="" />` : ''}
          ${ep.ChannelName || ''} ${ep.ChannelNumber || ''}
        </span>
      `;
    }

    const filenameParts = [ep.Title || 'Recording'];
    if (ep.EpisodeNumber) filenameParts.push(ep.EpisodeNumber);
    if (ep.EpisodeTitle) filenameParts.push(ep.EpisodeTitle);
    const suggestedFilename = filenameParts.join(' - ').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() + '.mpg';

    card.innerHTML = `
      <div class="recording-top">
        <img src="${posterUrl}" class="recording-poster" alt="${ep.Title || 'Show'}" loading="lazy" onerror="this.src='icon.svg'" />
        <div class="recording-body">
          <h4 class="recording-title">${ep.Title || 'Untitled Recording'}</h4>
          ${ep.EpisodeTitle ? `<p class="recording-episode">${ep.EpisodeNumber ? ep.EpisodeNumber + ': ' : ''}${ep.EpisodeTitle}</p>` : ''}
          ${ep.Synopsis ? `<p class="recording-synopsis" title="${ep.Synopsis}">${ep.Synopsis}</p>` : ''}
        </div>
      </div>

      <div class="recording-meta">
        <span class="recording-meta-item">📅 ${recordedDate}</span>
        <span class="recording-meta-item">⏱️ ${durationMin}</span>
        ${channelDisplay}
        ${ep.RecordSuccess === 1 ? '<span class="badge badge-hd">Complete</span>' : ''}
      </div>

      <div class="recording-actions">
        ${playUrl ? `
          <a href="${playUrl}" download="${suggestedFilename}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" title="Download the full recorded video file (${suggestedFilename})">
            ⬇️ Download (.mpg)
          </a>
          <button class="btn btn-sm btn-secondary btn-copy-url" data-url="${playUrl}" title="Copy direct download link (for curl, wget, or download managers)">
            📋 Copy Link
          </button>
          <button class="btn btn-sm btn-secondary btn-download-m3u" data-num="${ep.GuideNumber || ep.ChannelNumber || ''}" data-name="${suggestedFilename.replace(/\.mpg$/, '')}" data-url="${playUrl}" title="Stream immediately in VLC via .m3u without downloading the full file">
            📺 Stream (M3U)
          </button>
        ` : ''}
        ${ep.CmdURL ? `
          <button class="btn btn-sm btn-delete btn-delete-recording" data-cmd-url="${ep.CmdURL}" title="Delete this recording permanently from storage">
            🗑️ Delete
          </button>
        ` : ''}
      </div>
    `;

    recordingsContainer.appendChild(card);
  });

  // Attach clipboard copy listeners
  recordingsContainer.querySelectorAll('.btn-copy-url').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      try {
        await navigator.clipboard.writeText(url);
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => (btn.innerHTML = originalText), 1500);
      } catch (err) {
        console.error('Failed to copy', err);
      }
    });
  });

  // Attach single-episode M3U download listeners
  recordingsContainer.querySelectorAll('.btn-download-m3u').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chNum = btn.getAttribute('data-num');
      const name = btn.getAttribute('data-name') || 'Recording';
      const url = btn.getAttribute('data-url');
      const m3uContent = `#EXTM3U\n#EXTINF:-1 tvg-id="${chNum}" tvg-name="${name}",${name}\n${url}\n`;
      const blob = new Blob([m3uContent], { type: 'audio/x-mpegurl;charset=utf-8' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
      a.download = `${cleanName}.m3u`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    });
  });

  // Attach delete recording listeners
  recordingsContainer.querySelectorAll('.btn-delete-recording').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cmdUrl = btn.getAttribute('data-cmd-url');
      const ep = state.episodes.find((e) => e.CmdURL === cmdUrl);
      if (!ep) return;

      const title = ep.EpisodeTitle ? `${ep.Title}: ${ep.EpisodeTitle}` : (ep.Title || 'this recording');
      const needConfirm = localStorage.getItem(STORAGE_CONFIRM_DELETE) !== 'false';

      if (needConfirm) {
        showDeleteConfirmModal({
          title: 'Delete Recording',
          message: `Are you sure you want to permanently delete "${title}"? This cannot be undone and will remove the file from your storage drive.`,
          onConfirm: () => deleteEpisode(ep),
        });
      } else {
        deleteEpisode(ep);
      }
    });
  });
}

function renderSeries(seriesList) {
  if (!seriesList || seriesList.length === 0) {
    recordingsContainer.innerHTML = `
      <div class="card empty-card" style="grid-column: 1 / -1;">
        <div class="empty-icon">📂</div>
        <h3>No Series Found</h3>
        <p class="text-muted">No recorded series were found on the drive.</p>
      </div>
    `;
    return;
  }

  recordingsContainer.innerHTML = '';
  seriesList.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'recording-card';
    const posterUrl = s.ImageURL || 'icon.svg';
    const recordedDate = s.StartTime ? new Date(s.StartTime * 1000).toLocaleDateString() : '—';

    // Count matching episodes
    const matchCount = state.episodes.filter((ep) => ep.SeriesID === s.SeriesID).length;

    card.innerHTML = `
      <div class="recording-top">
        <img src="${posterUrl}" class="recording-poster" alt="${s.Title || 'Series'}" loading="lazy" onerror="this.src='icon.svg'" />
        <div class="recording-body">
          <h4 class="recording-title">${s.Title || 'Untitled Series'}</h4>
          <p class="text-sm text-muted">Category: <strong style="text-transform: capitalize;">${s.Category || 'General'}</strong></p>
          <div class="mt-6">
            <span class="badge badge-hd">${matchCount > 0 ? `${matchCount} Episode${matchCount > 1 ? 's' : ''}` : 'Series'}</span>
          </div>
        </div>
      </div>

      <div class="recording-meta">
        <span class="recording-meta-item">📅 Latest: ${recordedDate}</span>
      </div>

      <div class="recording-actions">
        <button class="btn btn-sm btn-secondary btn-view-series-episodes" data-series-id="${s.SeriesID}">
          View Episodes (${matchCount})
        </button>
        ${matchCount > 0 ? `
          <button class="btn btn-sm btn-delete btn-delete-series" data-series-id="${s.SeriesID}" title="Delete all recordings for this series permanently">
            🗑️ Delete Series
          </button>
        ` : ''}
      </div>
    `;

    recordingsContainer.appendChild(card);
  });

  recordingsContainer.querySelectorAll('.btn-view-series-episodes').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sId = btn.getAttribute('data-series-id');
      const filtered = state.episodes.filter((ep) => ep.SeriesID === sId);
      dvrViewPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-dvr-view') === 'episodes'));
      state.dvrSubView = 'episodes';
      renderEpisodes(filtered);
    });
  });

  recordingsContainer.querySelectorAll('.btn-delete-series').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sId = btn.getAttribute('data-series-id');
      const s = seriesList.find((item) => item.SeriesID === sId);
      const matching = state.episodes.filter((ep) => ep.SeriesID === sId);
      if (!s || matching.length === 0) return;

      const needConfirm = localStorage.getItem(STORAGE_CONFIRM_DELETE) !== 'false';

      if (needConfirm) {
        showDeleteConfirmModal({
          title: 'Delete Series Recordings',
          message: `Are you sure you want to permanently delete all ${matching.length} recorded episode(s) of "${s.Title || 'Series'}"? This cannot be undone and will remove the files from your storage drive.`,
          onConfirm: () => deleteSeries(s, matching),
        });
      } else {
        deleteSeries(s, matching);
      }
    });
  });
}

function renderRules(rulesList) {
  if (!rulesList || rulesList.length === 0) {
    recordingsContainer.innerHTML = `
      <div class="card empty-card" style="grid-column: 1 / -1;">
        <div class="empty-icon">📋</div>
        <h3>No Scheduled Recording Rules</h3>
        <p class="text-muted">No recording series or rules are currently configured.</p>
      </div>
    `;
    return;
  }

  recordingsContainer.innerHTML = '';
  rulesList.forEach((r) => {
    const card = document.createElement('div');
    card.className = 'rule-card';
    const posterUrl = r.ImageURL || 'icon.svg';

    let criteriaBadge = '';
    if (r.TeamOnly) {
      criteriaBadge = `<span class="badge badge-hd">🏈 Team: ${r.TeamOnly}</span>`;
    } else if (r.ChannelOnly) {
      criteriaBadge = `<span class="badge badge-hd">📺 Channel: ${r.ChannelOnly}</span>`;
    }

    card.innerHTML = `
      <div class="recording-top">
        <img src="${posterUrl}" class="recording-poster" alt="${r.Title || 'Rule'}" loading="lazy" onerror="this.src='icon.svg'" />
        <div class="recording-body">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <h4 class="recording-title">${r.Title || 'Recording Rule'}</h4>
            ${r.Priority ? `<span class="rule-priority-badge">Priority ${r.Priority}</span>` : ''}
          </div>
          ${criteriaBadge ? `<div class="mt-6">${criteriaBadge}</div>` : ''}
          ${r.Synopsis ? `<p class="recording-synopsis" title="${r.Synopsis}">${r.Synopsis}</p>` : ''}
        </div>
      </div>

      <div class="recording-meta">
        ${r.StartPadding ? `<span>Padding: +${r.StartPadding}s start</span>` : ''}
        ${r.EndPadding ? `<span>+${r.EndPadding}s end</span>` : ''}
      </div>
    `;

    recordingsContainer.appendChild(card);
  });
}

btnRefreshRecordings.addEventListener('click', fetchRecordings);
btnRecheckDvr.addEventListener('click', fetchRecordings);

/* ==========================================================================
   Recording Management (Delete Operations)
   ========================================================================== */

async function deleteEpisode(ep) {
  if (!ep || !ep.CmdURL) {
    showAlert('Unable to delete: No CmdURL provided for this recording.', 'error');
    return;
  }

  const deleteUrl = ep.CmdURL + (ep.CmdURL.includes('?') ? '&' : '?') + 'cmd=delete&rerecord=0';
  try {
    const res = await fetch(deleteUrl, { method: 'POST' });
    if (!res.ok) {
      throw new Error(`Device returned HTTP ${res.status}`);
    }
    showToast(`Deleted "${ep.Title || 'Recording'}"`);
    state.episodes = state.episodes.filter((e) => e.CmdURL !== ep.CmdURL && e.PlayURL !== ep.PlayURL);
    episodesCountPill.textContent = state.episodes.length;
    recordingsCountBadge.textContent = state.episodes.length;
    renderCurrentDvrSubView();
    // Refresh storage bar and list in background
    setTimeout(fetchRecordings, 1200);
  } catch (err) {
    console.error('Delete error:', err);
    showAlert(`Failed to delete recording: ${err.message}`, 'error');
  }
}

async function deleteSeries(series, matchingEpisodes) {
  if (!matchingEpisodes || matchingEpisodes.length === 0) {
    showAlert('No episodes found to delete for this series.', 'error');
    return;
  }

  showToast(`Deleting ${matchingEpisodes.length} episode(s)...`);
  let deletedCount = 0;
  for (const ep of matchingEpisodes) {
    if (ep.CmdURL) {
      try {
        const deleteUrl = ep.CmdURL + (ep.CmdURL.includes('?') ? '&' : '?') + 'cmd=delete&rerecord=0';
        const res = await fetch(deleteUrl, { method: 'POST' });
        if (res.ok) deletedCount++;
      } catch (e) {
        console.warn('Failed to delete episode', ep.Title, e);
      }
    }
  }

  showToast(`Deleted ${deletedCount} episode(s) of "${series.Title || 'Series'}"`);
  setTimeout(fetchRecordings, 1000);
}

/* ==========================================================================
   Delete Confirmation Modal & Preferences
   ========================================================================== */

let currentDeleteCallback = null;

function showDeleteConfirmModal({ title, message, onConfirm }) {
  if (modalDeleteTitle) modalDeleteTitle.textContent = title || '⚠️ Confirm Deletion';
  if (confirmDeleteMsg) confirmDeleteMsg.textContent = message || 'Are you sure you want to delete this recording?';
  if (confirmDeleteDontAsk) confirmDeleteDontAsk.checked = false;
  currentDeleteCallback = onConfirm;
  if (modalConfirmDelete) modalConfirmDelete.classList.remove('hidden');
}

function hideDeleteConfirmModal() {
  if (modalConfirmDelete) modalConfirmDelete.classList.add('hidden');
  currentDeleteCallback = null;
}

function setupDeleteModal() {
  if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', hideDeleteConfirmModal);
  }
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', hideDeleteConfirmModal);
  }
  if (modalConfirmDelete) {
    modalConfirmDelete.addEventListener('click', (e) => {
      if (e.target === modalConfirmDelete) hideDeleteConfirmModal();
    });
  }
  if (btnProceedDelete) {
    btnProceedDelete.addEventListener('click', async () => {
      if (confirmDeleteDontAsk && confirmDeleteDontAsk.checked) {
        localStorage.setItem(STORAGE_CONFIRM_DELETE, 'false');
        if (prefConfirmDelete) prefConfirmDelete.checked = false;
      }
      const cb = currentDeleteCallback;
      hideDeleteConfirmModal();
      if (cb) await cb();
    });
  }

  if (prefConfirmDelete) {
    const isConfirm = localStorage.getItem(STORAGE_CONFIRM_DELETE) !== 'false';
    prefConfirmDelete.checked = isConfirm;
    prefConfirmDelete.addEventListener('change', (e) => {
      localStorage.setItem(STORAGE_CONFIRM_DELETE, e.target.checked ? 'true' : 'false');
    });
  }
}

/* ==========================================================================
   Alerts & Utilities
   ========================================================================== */

function showAlert(html, type = 'info') {
  globalAlert.innerHTML = html;
  globalAlert.className = `alert-banner ${type}`;
  globalAlert.classList.remove('hidden');
}

function hideAlert() {
  globalAlert.classList.add('hidden');
}

function showToast(msg) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2500);
}

/* ==========================================================================
   PWA Installation
   ========================================================================== */

let deferredPrompt = null;

function setupPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => console.log('SW registered:', reg.scope))
        .catch((err) => console.warn('SW registration failed:', err));
    });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove('hidden');
  });

  btnInstall.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Install prompt outcome: ${outcome}`);
    deferredPrompt = null;
    btnInstall.classList.add('hidden');
  });

  window.addEventListener('appinstalled', () => {
    btnInstall.classList.add('hidden');
  });
}

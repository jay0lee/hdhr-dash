/**
 * HDHomeRun Dashboard PWA
 */

const STORAGE_ACTIVE_IP = 'hdhr_active_ip';
const STORAGE_DEVICES = 'hdhr_saved_devices';
const DEFAULT_IP = '10.1.0.4';

// Application State
const state = {
  currentIp: localStorage.getItem(STORAGE_ACTIVE_IP) || DEFAULT_IP,
  devices: JSON.parse(localStorage.getItem(STORAGE_DEVICES) || '[]'),
  deviceInfo: null,
  tuners: [],
  lineup: [],
  recordings: [],
  hasDvr: false,
  dvrStorageUrl: null,
  activeTab: 'tuners',
  isPolling: true,
  pollInterval: 2500,
  pollTimer: null,
  filterText: '',
  filterType: 'all', // 'all', 'hd', 'favorites'
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
const filterPills = document.querySelectorAll('.filter-pills .pill');
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

/* ==========================================================================
   Initialization
   ========================================================================== */

document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupPollingControls();
  setupLineupFilters();
  setupDeviceManagement();
  setupPwa();

  // Populate device dropdown
  renderDeviceDropdown();

  // Initial load
  await loadDeviceDetails();
  await refreshActiveTab();

  // Start polling
  startPolling();

  // Background Cloud Discovery
  discoverCloudDevices();
});

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
  } catch (err) {
    console.warn('Could not load discover.json:', err);
    connectionDot.className = 'status-dot error';
    showAlert(`Unable to connect to HDHomeRun at <code>${ip}</code>. Check your network or permissions.`, 'error');
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

function renderTuners(tuners) {
  if (!Array.isArray(tuners) || tuners.length === 0) {
    tunersGrid.innerHTML = '<div class="loading-placeholder">No tuners reported by device.</div>';
    return;
  }

  let activeCount = 0;
  tunersGrid.innerHTML = '';

  tuners.forEach((tuner, index) => {
    const isActive = Boolean(tuner.VctNumber || tuner.TargetIP);
    if (isActive) activeCount++;

    const card = document.createElement('div');
    card.className = `tuner-card ${isActive ? 'active' : ''}`;

    const tunerName = tuner.Resource || `tuner${index}`;
    const statusText = isActive ? 'Streaming' : 'Idle';
    const statusClass = isActive ? 'streaming' : 'idle';

    let detailsHtml = '';

    if (isActive) {
      const strength = tuner.SignalStrengthPercent ?? 0;
      const quality = tuner.SignalQualityPercent ?? 0;
      const symbol = tuner.SymbolQualityPercent ?? 0;

      detailsHtml = `
        <div class="tuner-active-info">
          <div class="tuner-channel-row">
            <span class="tuner-channel-name">${tuner.VctName || 'Unknown Channel'}</span>
            <span class="tuner-channel-number">${tuner.VctNumber ? `Ch ${tuner.VctNumber}` : ''}</span>
          </div>
          <div class="tuner-meta-row">
            <span>Client: <code>${tuner.TargetIP || 'Local'}</code></span>
            <span>Freq: ${tuner.Frequency ? (tuner.Frequency / 1000000).toFixed(3) + ' MHz' : '—'}</span>
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
        </span>
        <span class="tuner-status-badge ${statusClass}">${statusText}</span>
      </div>
      ${detailsHtml}
    `;

    tunersGrid.appendChild(card);
  });

  tunerSummaryBadge.textContent = `${activeCount} / ${tuners.length} Active`;
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

async function fetchLineup() {
  const ip = state.currentIp;
  lineupTbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading channels...</td></tr>';

  try {
    const res = await fetch(`http://${ip}/lineup.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const lineup = await res.json();
    state.lineup = Array.isArray(lineup) ? lineup : [];

    lineupCountBadge.textContent = state.lineup.length;
    lineupCountBadge.classList.remove('hidden');

    renderLineup();
  } catch (err) {
    console.warn('Error fetching lineup:', err);
    lineupTbody.innerHTML = `<tr><td colspan="4" class="empty-state error">Failed to load lineup from ${ip}.</td></tr>`;
  }
}

function setupLineupFilters() {
  lineupSearch.addEventListener('input', (e) => {
    state.filterText = e.target.value.toLowerCase().trim();
    renderLineup();
  });

  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
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
    if (state.filterType === 'hd') {
      return ch.HD === 1 || (ch.VideoCodec && ch.VideoCodec.includes('HD'));
    }
    if (state.filterType === 'favorites') {
      return ch.Favorite === 1;
    }
    return true;
  });

  if (filtered.length === 0) {
    lineupTbody.innerHTML = '<tr><td colspan="4" class="empty-state">No matching channels found.</td></tr>';
    return;
  }

  lineupTbody.innerHTML = '';
  filtered.forEach((ch) => {
    const tr = document.createElement('tr');
    const isHd = ch.HD === 1;
    const streamUrl = ch.URL || `http://${state.currentIp}:5004/auto/v${ch.GuideNumber}`;

    tr.innerHTML = `
      <td class="channel-num-cell">${ch.GuideNumber}</td>
      <td class="channel-name-cell">
        ${ch.GuideName || 'Unknown'}
        ${ch.Favorite === 1 ? ' ⭐' : ''}
      </td>
      <td>
        ${isHd ? '<span class="badge badge-hd">HD</span>' : '<span class="badge">SD</span>'}
      </td>
      <td class="table-actions">
        <a href="${streamUrl}" target="_blank" class="btn btn-sm btn-primary" title="Stream in Browser/VLC">
          ▶ Play
        </a>
        <button class="btn btn-sm btn-secondary btn-copy-url" data-url="${streamUrl}" title="Copy Stream URL">
          📋
        </button>
      </td>
    `;
    lineupTbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-copy-url').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      await navigator.clipboard.writeText(url);
      const originalText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => (btn.textContent = originalText), 1500);
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

async function fetchRecordings() {
  const ip = state.currentIp;
  recordingsContainer.innerHTML = '<div class="loading-placeholder">Searching for recordings...</div>';
  dvrNotDetected.classList.add('hidden');

  // Determine storage base URL (from discover.json or default port 4999 / device IP)
  const targetUrl = state.dvrStorageUrl
    ? `${state.dvrStorageUrl}/recorded_files.json`
    : `http://${ip}/recorded_files.json`;

  try {
    let res = await fetch(targetUrl);

    // If regular port 80 failed and no explicit StorageURL was provided, try port 4999 (HDHomeRun DVR default)
    if (!res.ok && !state.dvrStorageUrl) {
      try {
        const altRes = await fetch(`http://${ip}:4999/recorded_files.json`);
        if (altRes.ok) {
          res = altRes;
          state.dvrStorageUrl = `http://${ip}:4999`;
        }
      } catch (e) {
        // Continue with original response failure
      }
    }

    if (!res.ok) {
      throw new Error(`DVR endpoint returned HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Unexpected DVR response format');
    }

    state.hasDvr = true;
    state.recordings = data;
    recordingsCountBadge.textContent = data.length;
    recordingsCountBadge.classList.remove('hidden');
    dvrEngineInfo.textContent = `Connected to recording engine (${state.dvrStorageUrl || ip})`;

    renderRecordings(data);
  } catch (err) {
    console.info('No DVR engine found or request failed:', err.message);
    state.hasDvr = false;
    recordingsCountBadge.classList.add('hidden');
    recordingsContainer.innerHTML = '';
    dvrNotDetected.classList.remove('hidden');
    dvrEngineInfo.textContent = 'No recording engine detected';
  }
}

function renderRecordings(recordings) {
  if (recordings.length === 0) {
    recordingsContainer.innerHTML = `
      <div class="card empty-card" style="grid-column: 1 / -1;">
        <div class="empty-icon">📂</div>
        <h3>No Recordings Found</h3>
        <p class="text-muted">The recording storage is currently empty.</p>
      </div>
    `;
    return;
  }

  recordingsContainer.innerHTML = '';
  recordings.forEach((rec) => {
    const card = document.createElement('div');
    card.className = 'recording-card';

    const recordedDate = rec.StartTime ? new Date(rec.StartTime * 1000).toLocaleDateString() : '—';
    const durationMin = rec.Duration ? Math.round(rec.Duration / 60) + ' min' : '—';
    const fileSizeMb = rec.FileSize ? (rec.FileSize / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '—';
    const playUrl = rec.PlayURL || rec.CmdURL;

    card.innerHTML = `
      <div>
        <h4 class="recording-title">${rec.Title || 'Untitled Recording'}</h4>
        ${rec.EpisodeTitle ? `<p class="recording-episode">${rec.EpisodeTitle}</p>` : ''}
        ${rec.EpisodeNumber ? `<p class="text-sm text-muted">Episode: ${rec.EpisodeNumber}</p>` : ''}
      </div>

      <div class="recording-meta">
        <span class="recording-meta-item">📅 ${recordedDate}</span>
        <span class="recording-meta-item">⏱️ ${durationMin}</span>
        <span class="recording-meta-item">💾 ${fileSizeMb}</span>
        ${rec.ChannelName ? `<span class="recording-meta-item">📺 ${rec.ChannelName}</span>` : ''}
      </div>

      <div class="recording-actions">
        ${
          playUrl
            ? `<a href="${playUrl}" target="_blank" class="btn btn-sm btn-primary">▶ Play Recording</a>`
            : ''
        }
      </div>
    `;

    recordingsContainer.appendChild(card);
  });
}

btnRefreshRecordings.addEventListener('click', fetchRecordings);
btnRecheckDvr.addEventListener('click', fetchRecordings);

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

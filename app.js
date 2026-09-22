/**
 * HDHomeRun Dashboard PWA
 */

const STORAGE_ACTIVE_IP = 'hdhr_active_ip';
const STORAGE_DEVICES = 'hdhr_saved_devices';
const STORAGE_THEME = 'hdhr_theme';
const STORAGE_CONFIRM_DELETE = 'hdhr_confirm_delete';
const STORAGE_ACTIVE_TAB = 'hdhr_active_tab';
const APP_VERSION = '2.0.53';

// Affiliate Network Logos
const NETWORK_LOGOS = {
  ABC: 'assets/logos/abc.svg',
  CBS: 'assets/logos/cbs.svg',
  NBC: 'assets/logos/nbc.svg',
  FOX: 'assets/logos/fox.svg',
  CW: 'assets/logos/cw.svg',
  PBS: 'assets/logos/pbs.svg',
  CBC: 'assets/logos/cbc.svg',
  CTV: 'assets/logos/ctv.svg',
  Global: 'assets/logos/global.svg',
  Citytv: 'assets/logos/citytv.svg',
};

// Immediately apply saved theme to documentElement to avoid flash
const initialTheme = localStorage.getItem(STORAGE_THEME) || 'dark';
document.documentElement.setAttribute('data-theme', initialTheme);

// Application State
const state = {
  currentIp: localStorage.getItem(STORAGE_ACTIVE_IP) || null,
  devices: JSON.parse(localStorage.getItem(STORAGE_DEVICES) || '[]'),
  deviceInfo: null,
  tuners: [],
  lineup: [],
  recordings: [],
  series: [],
  episodes: [],
  rules: [],
  activePlaybacks: [],
  dvrSubView: 'series', // 'series', 'episodes', 'rules'
  selectedSeriesId: null,
  hasDvr: false,
  dvrStorageUrl: null,
  activeTab: 'tuners',
  isPolling: true,
  pollInterval: 2500,
  pollTimer: null,
  filterText: '',
  filterType: 'allowed', // 'allowed', 'all', 'favorites', 'hd', 'hidden'
  selectedTuner: null, // e.g. 'tuner0'
  tunerHistory: {},    // { tuner0: [ { timestamp, strength, quality, symbol, rate, isActive }, ... ] }
  tunerSampleInterval: 1000, // 1000, 5000, 10000, 60000
  tunerPollTimer: null,
  isGraphPaused: false,
  activeSeries: {
    strength: true,
    quality: true,
    symbol: true,
  },
  lastDiagnostics: null,
  stationMap: null,
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
const tunersOverview = document.getElementById('tuners-overview');
const tunersGrid = document.getElementById('tuners-grid');
const tunerSummaryBadge = document.getElementById('tuner-summary-badge');
const btnRefreshTuners = document.getElementById('btn-refresh-tuners');

// Tuner Detail & Chart Elements
const tunerDetailView = document.getElementById('tuner-detail-view');
const btnBackToTuners = document.getElementById('btn-back-to-tuners');
const detailStatusDot = document.getElementById('detail-status-dot');
const detailStatusText = document.getElementById('detail-status-text');
const detailTunerName = document.getElementById('detail-tuner-name');
const detailSharedBadge = document.getElementById('detail-shared-badge');
const detailChannelLogo = document.getElementById('detail-channel-logo');
const detailChannelName = document.getElementById('detail-channel-name');
const detailChannelLocality = document.getElementById('detail-channel-locality');
const detailChannelNumber = document.getElementById('detail-channel-number');
const detailClientsList = document.getElementById('detail-clients-list');
const detailNetworkRate = document.getElementById('detail-network-rate');
const sampleRatePills = document.querySelectorAll('#sample-rate-pills .pill');
const graphLiveIndicator = document.getElementById('graph-live-indicator');
const btnToggleGraphPause = document.getElementById('btn-toggle-graph-pause');
const detailIdleNotice = document.getElementById('detail-idle-notice');

const statCurrentStrength = document.getElementById('stat-current-strength');
const statMinStrength = document.getElementById('stat-min-strength');
const statAvgStrength = document.getElementById('stat-avg-strength');
const statMaxStrength = document.getElementById('stat-max-strength');

const statCurrentQuality = document.getElementById('stat-current-quality');
const statMinQuality = document.getElementById('stat-min-quality');
const statAvgQuality = document.getElementById('stat-avg-quality');
const statMaxQuality = document.getElementById('stat-max-quality');

const statCurrentSymbol = document.getElementById('stat-current-symbol');
const statMinSymbol = document.getElementById('stat-min-symbol');
const statAvgSymbol = document.getElementById('stat-avg-symbol');
const statMaxSymbol = document.getElementById('stat-max-symbol');

const chartSampleCount = document.getElementById('chart-sample-count');
const chartLegend = document.getElementById('chart-legend');
const chartContainer = document.getElementById('chart-container');
const tunerChartSvg = document.getElementById('tuner-chart-svg');
const chartGridGroup = document.getElementById('chart-grid-group');
const chartPathsGroup = document.getElementById('chart-paths-group');
const chartCrosshairGroup = document.getElementById('chart-crosshair-group');
const chartTooltip = document.getElementById('chart-tooltip');
const chartTimeStart = document.getElementById('chart-time-start');
const chartTimeMid = document.getElementById('chart-time-mid');
const chartTimeNow = document.getElementById('chart-time-now');

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
const infoChannels = document.getElementById('info-channels');
const infoIp = document.getElementById('info-ip');
const infoActiveClients = document.getElementById('info-active-clients');
const infoActiveRecordings = document.getElementById('info-active-recordings');
const infoStorage = document.getElementById('info-storage');
const infoStorageBarWrap = document.getElementById('info-storage-bar-wrap');
const infoStorageBarFill = document.getElementById('info-storage-bar-fill');
const btnRefreshSystemStatus = document.getElementById('btn-refresh-system-status');
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
  setupTunerDetailEvents();
  setupChartInteractions();
  setupLineupFilters();
  setupDvrPills();
  setupDeviceManagement();
  setupDeleteModal();
  setupDiagnostics();
  setupPwa();
  renderAppInfo();
  loadStationDatabase();

  // Populate device dropdown
  renderDeviceDropdown();

  // Initial load & discovery
  await initDeviceConnection();
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

async function loadStationDatabase() {
  try {
    const res = await fetch('./stations.json');
    if (res.ok) {
      state.stationMap = await res.json();
      if (state.lineup && state.lineup.length > 0) {
        renderLineup();
      }
      if (state.tuners && state.tuners.length > 0) {
        renderTuners(state.tuners);
      }
    }
  } catch (err) {
    console.warn('Could not load station database:', err);
  }
}

function getStationInfo(guideName) {
  if (!guideName || !state.stationMap) return null;
  const base = guideName.toUpperCase().replace(/[\.\-_]?(HD|DT\d*|TV|CD|LD|SD|\d+)$/i, '').trim();
  const data = state.stationMap[base];
  if (!data) return null;
  const [locality, network] = data;
  return {
    baseCall: base,
    locality,
    network,
    logo: (network && NETWORK_LOGOS[network]) || null,
  };
}

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

  const prefThemeSelect = document.getElementById('pref-theme-select');
  if (prefThemeSelect) {
    prefThemeSelect.addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_THEME, theme);

  const themeSelect = document.getElementById('theme-select');
  if (themeSelect && themeSelect.value !== theme) {
    themeSelect.value = theme;
  }

  const prefThemeSelect = document.getElementById('pref-theme-select');
  if (prefThemeSelect && prefThemeSelect.value !== theme) {
    prefThemeSelect.value = theme;
  }

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

  function handleHashNavigation() {
    const rawHash = window.location.hash.replace('#', '');
    if (!rawHash) return;

    const [tabPart, queryPart] = rawHash.split('?');
    const targetTab = (tabPart === 'channels' ? 'lineup' : tabPart).toLowerCase();

    if (['tuners', 'lineup', 'recordings', 'system'].includes(targetTab)) {
      if (state.activeTab !== targetTab) {
        switchTab(targetTab, false);
      }
      if (targetTab === 'recordings') {
        if (state.activePlaybacks && state.activePlaybacks.length > 0 && state.dvrSubView !== 'episodes') {
          state.selectedSeriesId = null;
          state.dvrSubView = 'episodes';
          dvrViewPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-dvr-view') === 'episodes'));
          renderCurrentDvrSubView();
        }
      }
      if (targetTab === 'tuners') {
        const params = new URLSearchParams(queryPart || '');
        const tunerId = params.get('tuner');
        if (tunerId) {
          openTunerDetail(tunerId, false);
        } else if (state.selectedTuner) {
          closeTunerDetail(false);
        }
      }
    }
  }

  window.addEventListener('hashchange', handleHashNavigation);

  if (infoActiveClients) {
    infoActiveClients.addEventListener('click', (e) => {
      const pbLink = e.target.closest('a[href="#recordings"]');
      if (pbLink) {
        if (state.dvrSubView !== 'episodes') {
          state.selectedSeriesId = null;
          state.dvrSubView = 'episodes';
          dvrViewPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-dvr-view') === 'episodes'));
          renderCurrentDvrSubView();
        }
      }
    });
  }

  // Read initial active tab from URL hash or localStorage
  const rawInitialHash = window.location.hash.replace('#', '');
  const [initTabPart, initQueryPart] = rawInitialHash.split('?');
  const savedTab = localStorage.getItem(STORAGE_ACTIVE_TAB);
  const initialTarget = (initTabPart === 'channels' ? 'lineup' : initTabPart).toLowerCase() || savedTab;

  if (initialTarget && ['tuners', 'lineup', 'recordings', 'system'].includes(initialTarget)) {
    state.activeTab = initialTarget;
    navTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-tab') === initialTarget);
    });
    tabViews.forEach((view) => {
      view.classList.toggle('active', view.id === `view-${initialTarget}`);
    });
    if (!window.location.hash) {
      const hashName = initialTarget === 'lineup' ? 'channels' : initialTarget;
      history.replaceState(null, '', `#${hashName}`);
    } else if (initialTarget === 'tuners') {
      const params = new URLSearchParams(initQueryPart || '');
      const tunerId = params.get('tuner');
      if (tunerId) {
        openTunerDetail(tunerId, false);
      }
    }
  }
}

function switchTab(tabId, updateHash = true) {
  if (tabId === 'channels') tabId = 'lineup';
  state.activeTab = tabId;
  localStorage.setItem(STORAGE_ACTIVE_TAB, tabId);

  // Stop tuner detail polling if switching away from tuners
  if (tabId !== 'tuners') {
    stopTunerDetailPolling();
  } else if (state.selectedTuner && !state.isGraphPaused) {
    startTunerDetailPolling();
  }

  navTabs.forEach((tab) => {
    tab.classList.toggle('active', tab.getAttribute('data-tab') === tabId);
  });

  tabViews.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${tabId}`);
  });

  if (updateHash) {
    let hash = tabId === 'lineup' ? 'channels' : tabId;
    if (tabId === 'tuners' && state.selectedTuner) {
      hash = `tuners?tuner=${state.selectedTuner}`;
    }
    if (window.location.hash !== `#${hash}`) {
      history.replaceState(null, '', `#${hash}`);
    }
  }

  // Fetch tab data if needed
  refreshActiveTab();
}

async function refreshActiveTab() {
  switch (state.activeTab) {
    case 'tuners':
      await fetchTuners();
      break;
    case 'lineup':
      if (state.lineup.length === 0) {
        await fetchLineup();
      } else {
        updateLineupStats();
        try {
          const statusRes = await fetch(`http://${state.currentIp}/status.json`);
          if (statusRes.ok) {
            const statusItems = await statusRes.json();
            if (Array.isArray(statusItems)) state.tuners = statusItems;
          }
        } catch (e) {}
        renderLineup();
      }
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

  const validIps = [
    ...(state.currentIp ? [state.currentIp] : []),
    ...state.devices.map((d) => d.ip || d.LocalIP).filter(Boolean)
  ];
  const allIps = Array.from(new Set(validIps));

  if (allIps.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No Device Connected';
    deviceSelect.appendChild(opt);
    return;
  }

  allIps.forEach((ip) => {
    const dev = state.devices.find((d) => (d.ip || d.LocalIP) === ip);
    const label = dev?.ModelNumber ? `${dev.ModelNumber} (${ip})` : `HDHomeRun (${ip})`;
    const opt = document.createElement('option');
    opt.value = ip;
    opt.textContent = label;
    if (ip === state.currentIp) opt.selected = true;
    deviceSelect.appendChild(opt);
  });

  deviceSelect.onchange = async () => {
    if (deviceSelect.value) {
      await switchDevice(deviceSelect.value);
    }
  };
}

async function switchDevice(newIp) {
  if (!newIp) return;
  state.currentIp = newIp;
  localStorage.setItem(STORAGE_ACTIVE_IP, newIp);
  state.lineup = [];
  state.recordings = [];
  state.hasDvr = false;
  state.dvrStorageUrl = null;

  hideAlert();
  const noticeEl = document.getElementById('no-device-notice');
  if (noticeEl) noticeEl.classList.add('hidden');

  await loadDeviceDetails();
  await refreshActiveTab();
}

async function loadDeviceDetails() {
  const ip = state.currentIp;
  if (!ip) {
    connectionDot.className = 'status-dot disconnected';
    infoModel.textContent = '—';
    infoId.textContent = '—';
    infoFirmware.textContent = '—';
    infoTuners.textContent = '—';
    infoIp.textContent = '—';
    if (typeof infoActiveClients !== 'undefined' && infoActiveClients) infoActiveClients.textContent = '—';
    if (typeof infoActiveRecordings !== 'undefined' && infoActiveRecordings) infoActiveRecordings.textContent = '—';
    if (typeof infoStorageUsed !== 'undefined' && infoStorageUsed) infoStorageUsed.textContent = '—';
    if (typeof infoChannelsCount !== 'undefined' && infoChannelsCount) infoChannelsCount.textContent = '—';
    return false;
  }

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

    // Update live HDHR status: active clients, active recordings, and storage (used/free)
    await updateSystemLiveStatus();
    loadChannelsCount();

    // Check for firmware updates
    checkFirmwareUpdate(data);
    return true;
  } catch (err) {
    console.warn('Could not load discover.json:', err);
    connectionDot.className = 'status-dot error';
    showAlert(`Unable to connect to HDHomeRun at <code>${ip}</code>. Check your network or permissions.`, 'error');
    return false;
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

function isEpisodeMatchingPlayback(ep, playbackSession) {
  if (!playbackSession || !playbackSession.name || !ep || !ep.Title) return false;

  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanPb = clean(playbackSession.name);
  const cleanTitle = clean(ep.Title);

  if (!cleanTitle || !cleanPb.includes(cleanTitle)) {
    return false;
  }

  const cleanEpNum = clean(ep.EpisodeNumber);
  const cleanEpTitle = clean(ep.EpisodeTitle);

  // 1. If episode has EpisodeNumber (e.g. S02E01)
  if (cleanEpNum) {
    if (cleanPb.includes(cleanEpNum)) {
      return true;
    }
    // If playback session name clearly has a different SxxExx episode number, it's definitely not this one
    const pbEpNumMatch = playbackSession.name.match(/\bS\d+E\d+\b/i);
    if (pbEpNumMatch && clean(pbEpNumMatch[0]) !== cleanEpNum) {
      return false;
    }
  }

  // 2. If episode has EpisodeTitle (e.g. "Philadelphia Eagles at Tennessee Titans")
  if (cleanEpTitle) {
    if (cleanPb.includes(cleanEpTitle)) {
      return true;
    }
  }

  // 3. Check recording dates and timestamps from StartTime and OriginalAirdate
  const dates = [];
  const timeStamps = [];
  [ep.StartTime, ep.OriginalAirdate].forEach((ts) => {
    if (!ts) return;
    const d = new Date(ts * 1000);
    if (isNaN(d.getTime())) return;

    // UTC
    const uY = d.getUTCFullYear();
    const uM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const uD = String(d.getUTCDate()).padStart(2, '0');
    const uH = String(d.getUTCHours()).padStart(2, '0');
    const uMin = String(d.getUTCMinutes()).padStart(2, '0');
    dates.push(`${uY}${uM}${uD}`);
    timeStamps.push(`${uY}${uM}${uD}-${uH}${uMin}`);

    // Local
    const lY = d.getFullYear();
    const lM = String(d.getMonth() + 1).padStart(2, '0');
    const lD = String(d.getDate()).padStart(2, '0');
    const lH = String(d.getHours()).padStart(2, '0');
    const lMin = String(d.getMinutes()).padStart(2, '0');
    dates.push(`${lY}${lM}${lD}`);
    timeStamps.push(`${lY}${lM}${lD}-${lH}${lMin}`);
  });

  const hasTimeStampMatch = timeStamps.some((ts) => cleanPb.includes(clean(ts)));
  if (hasTimeStampMatch) {
    return true;
  }

  const hasDateMatch = dates.some((dStr) => cleanPb.includes(dStr));
  if (hasDateMatch) {
    // If the episode has an EpisodeTitle, make sure cleanPb doesn't match a completely different episode's title
    if (!cleanEpTitle || cleanPb.includes(cleanEpTitle)) {
      return true;
    }
    // If cleanEpTitle didn't match, check if another episode of this series actually matches cleanPb's title
    const otherEpsWithSameTitle = (state.episodes || []).filter((e) => e !== ep && clean(e.Title) === cleanTitle);
    const anotherEpMatchesTitle = otherEpsWithSameTitle.some((other) => {
      const oEpTitle = clean(other.EpisodeTitle);
      return oEpTitle && cleanPb.includes(oEpTitle);
    });
    // If another episode's title is explicitly in the playback name, this episode is NOT the one playing!
    if (!anotherEpMatchesTitle) {
      return true;
    }
  }

  // 4. If there is NO EpisodeNumber, NO EpisodeTitle, and NO Date available on this episode
  if (!cleanEpNum && !cleanEpTitle && dates.length === 0) {
    // Only match if this is the only recording for this series title
    const sameTitleEps = (state.episodes || []).filter((e) => clean(e.Title) === cleanTitle);
    if (sameTitleEps.length === 1) {
      return true;
    }
  }

  return false;
}

function parseDeviceStatus(statusItems, ip) {
  if (!Array.isArray(statusItems)) {
    return { activeClients: [], activeRecordings: [], activePlaybacks: [] };
  }

  const physicalTuners = statusItems.filter((item) =>
    item.Resource && item.Resource.toLowerCase().startsWith('tuner')
  );
  const liveSessions = statusItems.filter((item) =>
    !item.Resource || !item.Resource.toLowerCase().startsWith('tuner')
  );

  const activeClients = [];
  const activeRecordings = [];
  const activePlaybacks = [];

  // Check physical tuners for direct external clients
  physicalTuners.forEach((tuner) => {
    const targetIp = tuner.TargetIP;
    const isExternalIp =
      targetIp &&
      targetIp !== 'none' &&
      targetIp !== '127.0.0.1' &&
      targetIp !== '::1' &&
      targetIp !== '[::1]' &&
      targetIp !== ip;

    const hasChannel = Boolean(tuner.VctNumber || tuner.VctName);

    if (hasChannel && isExternalIp) {
      const chLabel = tuner.VctNumber
        ? `Ch ${tuner.VctNumber}${tuner.VctName ? ' ' + tuner.VctName : ''}`
        : (tuner.VctName || tuner.Resource);

      activeClients.push({
        ip: targetIp,
        channel: chLabel,
        tuner: tuner.Resource,
      });
    }
  });

  // Check liveSessions (sessions from HTTP streaming, DVR record engines, or DVR playback)
  liveSessions.forEach((s) => {
    const isRecord =
      (s.Resource && s.Resource.toLowerCase().includes('record')) ||
      (s.Name && s.Name.toLowerCase().includes('record'));
    const isPlayback =
      (s.Resource && s.Resource.toLowerCase().includes('playback')) ||
      (s.Name && s.Name.toLowerCase().includes('playback'));

    if (isRecord) {
      const name = s.Name ? `Ch ${s.Name}` : 'DVR Recording';
      if (!activeRecordings.some((r) => r.channel === name)) {
        activeRecordings.push({
          channel: name,
          target: s.TargetIP || 'Local',
        });
      }
    } else if (isPlayback) {
      activePlaybacks.push({
        name: s.Name || 'Recorded Playback',
        ip: s.TargetIP || 'Client',
      });
    } else if (
      s.TargetIP &&
      s.TargetIP !== 'none' &&
      s.TargetIP !== ip &&
      s.TargetIP !== '127.0.0.1' &&
      s.TargetIP !== '::1' &&
      s.TargetIP !== '[::1]'
    ) {
      // Find matching tuner if available
      const matchingTuner = physicalTuners.find(
        (t) => t.VctNumber && s.Name && s.Name.includes(t.VctNumber)
      );

      // Do not duplicate if this exact tuner stream was already counted directly on physicalTuners
      const isAlreadyCounted = matchingTuner && activeClients.some(
        (c) => c.tuner === matchingTuner.Resource && c.ip === s.TargetIP
      );

      if (!isAlreadyCounted) {
        let chLabel = '';
        if (matchingTuner) {
          chLabel = `Ch ${matchingTuner.VctNumber}${matchingTuner.VctName ? ' ' + matchingTuner.VctName : ''}`;
        } else if (s.Name) {
          chLabel = s.Name.replace(/^Live channel\s+/i, 'Ch ');
          if (!chLabel.startsWith('Ch ')) chLabel = `Ch ${chLabel}`;
        }
        activeClients.push({
          ip: s.TargetIP,
          channel: chLabel,
          tuner: matchingTuner?.Resource,
        });
      }
    }
  });

  // Check if the HDHR itself is currently writing an in-progress recording to its storage drive
  const nowSec = Math.floor(Date.now() / 1000);
  if (Array.isArray(state.episodes)) {
    state.episodes.forEach((ep) => {
      if (ep.StartTime && ep.EndTime && ep.StartTime <= nowSec && ep.EndTime > nowSec && ep.RecordSuccess !== 1) {
        const epLabel = ep.EpisodeTitle ? `${ep.Title}: ${ep.EpisodeTitle}` : (ep.Title || 'DVR Recording');
        const fullLabel = ep.ChannelNumber ? `${epLabel} (Ch ${ep.ChannelNumber})` : epLabel;
        if (!activeRecordings.some((r) => r.channel === fullLabel)) {
          activeRecordings.push({
            channel: fullLabel,
            target: 'HDHR Storage',
          });
        }
      }
    });
  }

  state.activePlaybacks = activePlaybacks;
  return { activeClients, activeRecordings, activePlaybacks };
}

async function updateSystemLiveStatus() {
  const ip = state.currentIp;
  if (!ip) return;
  try {
    // 1. Fetch status.json for live tuner and session info
    let statusItems = [];
    try {
      const statusRes = await fetch(`http://${ip}/status.json`);
      if (statusRes.ok) {
        statusItems = await statusRes.json();
        if (Array.isArray(statusItems)) {
          state.tuners = statusItems;
        }
      }
    } catch (e) {
      console.warn('Could not fetch /status.json for system status:', e);
    }

    // 2. Parse active clients, active recordings, and active playbacks
    const { activeClients, activeRecordings, activePlaybacks } = parseDeviceStatus(statusItems, ip);

    // 3. Render Active Clients & Playbacks
    if (infoActiveClients) {
      if (activeClients.length === 0 && activePlaybacks.length === 0) {
        infoActiveClients.innerHTML = '<span class="text-muted" style="font-weight: normal;">None (Idle)</span>';
      } else {
        let html = '';
        if (activeClients.length > 0) {
          const countText = activeClients.length === 1 ? '1 Streaming' : `${activeClients.length} Streaming`;
          const clientDetails = activeClients.map((c) => `${c.ip} (${c.channel || 'Live'})`).join('\n');
          html += `
            <a href="#tuners" class="status-link" title="${clientDetails} • View details on Tuners tab">
              <span class="badge badge-active-client">📺 ${countText}</span>
              <span class="status-arrow">Tuners ↗</span>
            </a>
          `;
        }
        if (activePlaybacks.length > 0) {
          const countText = activePlaybacks.length === 1 ? '1 Playback' : `${activePlaybacks.length} Playbacks`;
          const pbDetails = activePlaybacks.map((p) => `${p.name} on ${p.ip}`).join('\n');
          html += `
            <a href="#recordings" class="status-link status-link-playback" title="${pbDetails} • View details on Recordings tab">
              <span class="badge badge-active-playback">▶️ ${countText}</span>
              <span class="status-arrow">Recordings ↗</span>
            </a>
          `;
        }
        infoActiveClients.innerHTML = html;
      }
    }

    // 4. Render Active Recordings
    if (infoActiveRecordings) {
      if (activeRecordings.length === 0) {
        infoActiveRecordings.innerHTML = '<span class="text-muted" style="font-weight: normal;">None (Idle)</span>';
      } else {
        const countText = activeRecordings.length === 1 ? '1 Active' : `${activeRecordings.length} Active`;
        infoActiveRecordings.innerHTML = `
          <a href="#recordings" class="status-link" title="View details on Recordings tab">
            <span class="badge badge-active-record">🔴 ${countText}</span>
            <span class="status-arrow">Recordings ↗</span>
          </a>
        `;
      }
    }

    // 5. Render Storage (Used / Free)
    if (infoStorage) {
      // Check if state.deviceInfo has space info, or if port 4999 has it
      if (!state.deviceInfo?.TotalSpace) {
        try {
          const dvrRes = await fetch(`http://${ip}:4999/discover.json`);
          if (dvrRes.ok) {
            const dvrData = await dvrRes.json();
            if (dvrData.TotalSpace) {
              state.deviceInfo = { ...state.deviceInfo, ...dvrData };
            }
          }
        } catch (e) {}
      }

      if (state.deviceInfo?.TotalSpace && state.deviceInfo?.FreeSpace) {
        const totalGb = (state.deviceInfo.TotalSpace / (1024 * 1024 * 1024)).toFixed(1);
        const freeGb = (state.deviceInfo.FreeSpace / (1024 * 1024 * 1024)).toFixed(1);
        const usedBytes = state.deviceInfo.TotalSpace - state.deviceInfo.FreeSpace;
        const usedGb = (usedBytes / (1024 * 1024 * 1024)).toFixed(1);
        const usedPercent = Math.round((usedBytes / state.deviceInfo.TotalSpace) * 100);

        infoStorage.innerHTML = `<span><strong>${freeGb} GB free</strong> of ${totalGb} GB (${usedPercent}% used)</span>`;
        if (infoStorageBarWrap && infoStorageBarFill) {
          infoStorageBarWrap.classList.remove('hidden');
          infoStorageBarFill.style.width = `${usedPercent}%`;
          if (usedPercent > 90) {
            infoStorageBarFill.style.backgroundColor = '#ef4444';
          } else if (usedPercent > 75) {
            infoStorageBarFill.style.backgroundColor = '#f59e0b';
          } else {
            infoStorageBarFill.style.backgroundColor = '#10b981';
          }
        }
      } else {
        infoStorage.innerHTML = '<span class="text-muted" style="font-weight: normal;">None detected</span>';
        if (infoStorageBarWrap) infoStorageBarWrap.classList.add('hidden');
      }
    }
  } catch (err) {
    console.warn('Error updating system live status:', err);
  }
}

function renderChannelsCount(allowed, total) {
  if (!infoChannels) return;
  if (total === 0) {
    infoChannels.textContent = '0 Channels';
  } else if (allowed === total) {
    infoChannels.textContent = `${total} Channels`;
  } else {
    infoChannels.innerHTML = `<span>${allowed} Accessible <span class="text-sm text-muted">(${total} Total)</span></span>`;
  }
}

async function loadChannelsCount() {
  if (state.lineup && state.lineup.length > 0) {
    updateLineupStats();
    return;
  }

  const ip = state.currentIp;
  try {
    const res = await fetch(`http://${ip}/lineup.json?show=found`);
    if (res.ok) {
      const lineup = await res.json();
      if (Array.isArray(lineup)) {
        state.lineup = lineup;
        updateLineupStats();
        if (state.activeTab === 'lineup') {
          renderLineup();
        }
      }
    }
  } catch (e) {
    console.warn('Could not load channels count for system view:', e);
  }
}

async function discoverCloudDevices() {
  try {
    const res = await fetch('https://api.hdhomerun.com/discover');
    if (!res.ok) return [];
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
      return list;
    }
    return [];
  } catch (e) {
    console.log('Cloud discovery skipped or offline:', e.message);
    return [];
  }
}

function goToManualIpEntry() {
  connectionDot.className = 'status-dot disconnected';
  renderDeviceDropdown();
  const noticeEl = document.getElementById('no-device-notice');
  if (noticeEl) noticeEl.classList.remove('hidden');
  switchTab('system');
  setTimeout(() => {
    if (inputCustomIp) {
      inputCustomIp.focus();
      inputCustomIp.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 200);
}

async function initDeviceConnection() {
  let connected = false;

  // 1. Try saved IP if present
  if (state.currentIp) {
    connected = await loadDeviceDetails();
    if (connected) {
      const noticeEl = document.getElementById('no-device-notice');
      if (noticeEl) noticeEl.classList.add('hidden');
      // Background cloud discovery to find other devices on network
      discoverCloudDevices().catch(() => {});
      return;
    }
  }

  // 2. If no saved IP or saved IP failed, run cloud discovery
  const discovered = await discoverCloudDevices();
  if (discovered && discovered.length > 0) {
    const primaryDev = discovered[0];
    const ip = primaryDev.LocalIP || primaryDev.ip;
    if (ip) {
      state.currentIp = ip;
      localStorage.setItem(STORAGE_ACTIVE_IP, ip);
      renderDeviceDropdown();
      connected = await loadDeviceDetails();
      if (connected) {
        const noticeEl = document.getElementById('no-device-notice');
        if (noticeEl) noticeEl.classList.add('hidden');
        return;
      }
    }
  }

  // 3. Neither worked: go to manual IP entry
  goToManualIpEntry();
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

  inputCustomIp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnAddDevice.click();
    }
  });

  btnRediscover.addEventListener('click', async () => {
    btnRediscover.disabled = true;
    btnRediscover.textContent = 'Discovering...';
    await discoverCloudDevices();
    btnRediscover.textContent = '🔍 Run Cloud Discovery (api.hdhomerun.com)';
    btnRediscover.disabled = false;
  });

  if (btnRefreshSystemStatus) {
    btnRefreshSystemStatus.addEventListener('click', async () => {
      btnRefreshSystemStatus.disabled = true;
      btnRefreshSystemStatus.textContent = 'Refreshing...';
      await loadDeviceDetails();
      btnRefreshSystemStatus.textContent = '🔄 Refresh';
      btnRefreshSystemStatus.disabled = false;
    });
  }

  const btnSystemLog = document.getElementById('btn-system-log');
  if (btnSystemLog) {
    btnSystemLog.addEventListener('click', () => {
      if (state.currentIp) {
        window.open(`http://${state.currentIp}/log.html`, '_blank');
      } else {
        showAlert('No device connected. Please enter a device IP above.', 'warning');
      }
    });
  }

  const btnRebootCheck = document.getElementById('btn-reboot-check');
  if (btnRebootCheck) {
    btnRebootCheck.addEventListener('click', () => {
      if (state.currentIp) {
        window.open(`http://${state.currentIp}`, '_blank');
      } else {
        showAlert('No device connected. Please enter a device IP above.', 'warning');
      }
    });
  }

  // Handle in-app navigation links from Device Details
  const deviceInfoList = document.getElementById('device-info-list');
  if (deviceInfoList) {
    deviceInfoList.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (link) {
        e.preventDefault();
        const hash = link.getAttribute('href').replace('#', '').toLowerCase();
        const target = hash === 'channels' ? 'lineup' : hash;
        if (['tuners', 'lineup', 'recordings', 'system'].includes(target)) {
          switchTab(target);
        }
      }
    });
  }

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
  if (!ip) {
    tunersGrid.innerHTML = `
      <div class="empty-state">
        <p>No HDHomeRun device connected.</p>
        <p class="text-sm text-muted">Please configure a device IP on the <a href="#system" onclick="switchTab('system'); return false;">System</a> tab.</p>
      </div>`;
    tunerSummaryBadge.textContent = 'Disconnected';
    tunerSummaryBadge.className = 'badge';
    return;
  }
  try {
    if (state.hasDvr && state.episodes.length === 0) {
      fetchRecordings(true);
    }
    const res = await fetch(`http://${ip}/status.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const tuners = await res.json();
    state.tuners = tuners;
    parseDeviceStatus(tuners, ip);
    renderTuners(tuners);
    connectionDot.className = 'status-dot connected';
  } catch (err) {
    console.warn('Error fetching /status.json:', err);
    connectionDot.className = 'status-dot error';
    tunerSummaryBadge.textContent = 'Offline';
    tunerSummaryBadge.className = 'badge';
  }
}

function formatTunerName(rawName) {
  if (!rawName) return 'Tuner';
  const match = String(rawName).match(/^tuner(\d+)$/i);
  if (match) {
    return `Tuner ${match[1]}`;
  }
  return String(rawName).charAt(0).toUpperCase() + String(rawName).slice(1);
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

    const tunerName = tuner.Resource || `tuner${index}`;

    const card = document.createElement('div');
    card.className = `tuner-card ${isActive ? 'active' : ''} clickable-tuner-card`;
    card.setAttribute('data-tuner-id', tunerName);
    card.setAttribute('title', `Click to view real-time diagnostics & signal graph for ${formatTunerName(tunerName)}`);

    let detailsHtml = '';
    let sharedBadge = '';
    let isRecording = false;
    let hasExternalClient = false;

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

      hasExternalClient = clientSessions.some((c) => c.type === 'client' && c.ip !== 'Local');

      // Check if tuner is recording:
      const nowSec = Math.floor(Date.now() / 1000);
      const hasRecordSession = clientSessions.some((c) => c.type === 'record');
      const hasEpisodeRecording = (state.episodes || []).some((ep) => {
        return ep.StartTime && ep.EndTime && ep.StartTime <= nowSec && ep.EndTime > nowSec && ep.RecordSuccess !== 1 &&
               (ep.ChannelNumber === tuner.VctNumber || (tuner.VctNumber && String(ep.ChannelNumber).includes(String(tuner.VctNumber))) || (ep.ChannelName && tuner.VctName && ep.ChannelName.toLowerCase() === tuner.VctName.toLowerCase()));
      });
      const isLocalOnly = !hasExternalClient && (clientSessions.length === 0 || clientSessions.every(c => c.ip === 'Local'));
      isRecording = hasRecordSession || hasEpisodeRecording || (isLocalOnly && state.hasDvr);

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

      const stationInfo = getStationInfo(tuner.VctName);
      let logoHtml = '';
      let localityHtml = '';
      if (stationInfo) {
        if (stationInfo.logo) {
          logoHtml = `<div class="channel-logo-wrap"><img src="${stationInfo.logo}" alt="${stationInfo.network}" class="affiliate-logo tuner-affiliate-logo" title="${stationInfo.network} • ${stationInfo.locality}" /></div>`;
        } else if (stationInfo.network) {
          logoHtml = `<div class="channel-logo-wrap"><span class="badge badge-affiliate">${stationInfo.network}</span></div>`;
        } else {
          logoHtml = `<div class="channel-logo-wrap"><img src="assets/logos/generic-tv.svg" alt="TV" class="affiliate-logo generic-tv-logo" title="Local Broadcast Channel" /></div>`;
        }
        if (stationInfo.locality) {
          localityHtml = `<span class="tuner-locality text-xs text-muted">(${stationInfo.locality})</span>`;
        }
      } else if (tuner.VctName) {
        logoHtml = `<div class="channel-logo-wrap"><img src="assets/logos/generic-tv.svg" alt="TV" class="affiliate-logo generic-tv-logo" title="Local Broadcast Channel" /></div>`;
      }

      detailsHtml = `
        <div class="tuner-active-info">
          <div class="tuner-channel-row">
            ${logoHtml}
            <div class="tuner-channel-title">
              <span class="tuner-channel-name">${tuner.VctName || 'Unknown Channel'}</span>
              ${localityHtml}
            </div>
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

    // Determine status badge and indicator dot
    let statusText = 'Idle';
    let statusClass = 'idle';
    let dotClass = '';

    if (isActive) {
      if (isRecording && hasExternalClient) {
        statusText = 'Streaming & Recording';
        statusClass = 'recording-streaming';
        dotClass = 'recording';
      } else if (isRecording) {
        statusText = 'Recording';
        statusClass = 'recording';
        dotClass = 'recording';
      } else {
        statusText = 'Streaming';
        statusClass = 'streaming';
        dotClass = 'connected';
      }
    }

    card.innerHTML = `
      <div class="tuner-card-header">
        <span class="tuner-name">
          <span class="status-dot ${dotClass}"></span>
          ${formatTunerName(tunerName)}
          ${sharedBadge || ''}
        </span>
        <span class="tuner-status-badge ${statusClass}">${statusText}</span>
      </div>
      ${detailsHtml}
      <div class="tuner-card-action-hint">
        📈 View Signal Graph →
      </div>
    `;

    card.addEventListener('click', () => {
      openTunerDetail(tunerName);
    });

    tunersGrid.appendChild(card);
  });

  tunerSummaryBadge.textContent = `${activeCount} / ${physicalTuners.length} Active`;
  tunerSummaryBadge.className = `badge ${activeCount > 0 ? 'badge-hd' : ''}`;

  // If tuner detail view is currently open, record sample and update it
  if (state.selectedTuner) {
    const activeTuner = physicalTuners.find((t) =>
      t.Resource && t.Resource.toLowerCase() === state.selectedTuner.toLowerCase()
    ) || { Resource: state.selectedTuner };
    recordTunerSample(activeTuner, liveSessions);
    updateTunerDetailView(activeTuner, liveSessions);
    renderTunerGraph();
  }

  updateDiagIdleWarning(statusItems);
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
   Tuner Detail & Real-Time Diagnostics Graphing
   ========================================================================== */

function setupTunerDetailEvents() {
  if (btnBackToTuners) {
    btnBackToTuners.addEventListener('click', () => {
      closeTunerDetail();
    });
  }

  sampleRatePills.forEach((pill) => {
    pill.addEventListener('click', () => {
      sampleRatePills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      const interval = parseInt(pill.getAttribute('data-interval'), 10) || 1000;
      state.tunerSampleInterval = interval;
      if (state.selectedTuner && !state.isGraphPaused) {
        startTunerDetailPolling();
      }
    });
  });

  if (btnToggleGraphPause) {
    btnToggleGraphPause.addEventListener('click', () => {
      state.isGraphPaused = !state.isGraphPaused;
      btnToggleGraphPause.textContent = state.isGraphPaused ? '▶ Resume' : '⏸ Pause';
      if (graphLiveIndicator) {
        graphLiveIndicator.classList.toggle('paused', state.isGraphPaused);
      }
      if (!state.isGraphPaused) {
        startTunerDetailPolling();
      } else {
        stopTunerDetailPolling();
      }
    });
  }

  document.querySelectorAll('#chart-legend .legend-item').forEach((item) => {
    item.addEventListener('click', () => {
      const series = item.getAttribute('data-series');
      if (series && state.activeSeries[series] !== undefined) {
        state.activeSeries[series] = !state.activeSeries[series];
        item.classList.toggle('active', state.activeSeries[series]);
        renderTunerGraph();
      }
    });
  });
}

function openTunerDetail(tunerId, updateHash = true) {
  state.selectedTuner = tunerId;
  tunersOverview.classList.add('hidden');
  tunerDetailView.classList.remove('hidden');

  if (updateHash) {
    history.pushState(null, '', `#tuners?tuner=${tunerId}`);
  }

  // Find existing tuner data
  const tuner = (state.tuners || []).find((item) =>
    item.Resource && item.Resource.toLowerCase() === tunerId.toLowerCase()
  ) || { Resource: tunerId };

  const liveSessions = (state.tuners || []).filter((item) =>
    !item.Resource || !item.Resource.toLowerCase().startsWith('tuner')
  );

  recordTunerSample(tuner, liveSessions);
  updateTunerDetailView(tuner, liveSessions);
  renderTunerGraph();

  startTunerDetailPolling();
}

function closeTunerDetail(updateHash = true) {
  state.selectedTuner = null;
  stopTunerDetailPolling();
  tunerDetailView.classList.add('hidden');
  tunersOverview.classList.remove('hidden');

  if (updateHash) {
    history.pushState(null, '', '#tuners');
  }
}

function startTunerDetailPolling() {
  stopTunerDetailPolling();
  if (state.isGraphPaused || !state.selectedTuner) return;

  // Poll immediately, then start interval
  pollTunerDetail();
  state.tunerPollTimer = setInterval(pollTunerDetail, state.tunerSampleInterval);
}

function stopTunerDetailPolling() {
  if (state.tunerPollTimer) {
    clearInterval(state.tunerPollTimer);
    state.tunerPollTimer = null;
  }
}

async function pollTunerDetail() {
  if (!state.selectedTuner || state.isGraphPaused) return;

  try {
    const ip = state.currentIp;
    const res = await fetch(`http://${ip}/status.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const statusItems = await res.json();
    state.tuners = statusItems;

    const physicalTuners = statusItems.filter((item) =>
      item.Resource && item.Resource.toLowerCase().startsWith('tuner')
    );
    const liveSessions = statusItems.filter((item) =>
      !item.Resource || !item.Resource.toLowerCase().startsWith('tuner')
    );

    const tuner = physicalTuners.find((item) =>
      item.Resource && item.Resource.toLowerCase() === state.selectedTuner.toLowerCase()
    ) || { Resource: state.selectedTuner };

    recordTunerSample(tuner, liveSessions);
    updateTunerDetailView(tuner, liveSessions);
    renderTunerGraph();
  } catch (err) {
    console.warn('Error polling tuner detail:', err);
  }
}

function recordTunerSample(tuner, liveSessions = []) {
  const tunerId = state.selectedTuner;
  if (!tunerId) return;

  if (!state.tunerHistory[tunerId]) {
    state.tunerHistory[tunerId] = [];
  }

  const history = state.tunerHistory[tunerId];
  const isActive = Boolean(tuner.VctNumber || (tuner.TargetIP && tuner.TargetIP !== 'none'));

  const sample = {
    timestamp: Date.now(),
    strength: tuner.SignalStrengthPercent ?? 0,
    quality: tuner.SignalQualityPercent ?? 0,
    symbol: tuner.SymbolQualityPercent ?? 0,
    rate: tuner.NetworkRate ?? 0,
    isActive,
  };

  history.push(sample);
  // Keep ring buffer of last 60 samples
  if (history.length > 60) {
    history.shift();
  }
}

function updateTunerDetailView(tunerData, liveSessions = []) {
  const tunerId = state.selectedTuner;
  if (!tunerId) return;

  const tuner = tunerData || (state.tuners || []).find((item) =>
    item.Resource && item.Resource.toLowerCase() === tunerId.toLowerCase()
  ) || { Resource: tunerId };

  const isActive = Boolean(tuner.VctNumber || (tuner.TargetIP && tuner.TargetIP !== 'none'));

  // Title
  detailTunerName.textContent = formatTunerName(tuner.Resource || tunerId);

  // Find all client sessions sharing this tuner
  const clientSessions = [];
  if (tuner.TargetIP && tuner.TargetIP !== '[::1]' && tuner.TargetIP !== '::1' && tuner.TargetIP !== '127.0.0.1' && tuner.TargetIP !== 'none') {
    clientSessions.push({ type: 'client', ip: tuner.TargetIP });
  }

  const matchingSessions = (liveSessions || []).filter((s) => {
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

  const hasExternalClient = clientSessions.some((c) => c.type === 'client' && c.ip !== 'Local');

  // Check recording
  const nowSec = Math.floor(Date.now() / 1000);
  const hasRecordSession = clientSessions.some((c) => c.type === 'record');
  const hasEpisodeRecording = (state.episodes || []).some((ep) => {
    return ep.StartTime && ep.EndTime && ep.StartTime <= nowSec && ep.EndTime > nowSec && ep.RecordSuccess !== 1 &&
           (ep.ChannelNumber === tuner.VctNumber || (tuner.VctNumber && String(ep.ChannelNumber).includes(String(tuner.VctNumber))) || (ep.ChannelName && tuner.VctName && ep.ChannelName.toLowerCase() === tuner.VctName.toLowerCase()));
  });
  const isLocalOnly = !hasExternalClient && (clientSessions.length === 0 || clientSessions.every((c) => c.ip === 'Local'));
  const isRecording = hasRecordSession || hasEpisodeRecording || (isLocalOnly && state.hasDvr);

  // Status Badge / Text
  let statusText = 'Idle';
  let dotClass = '';
  if (isActive) {
    if (isRecording && hasExternalClient) {
      statusText = 'Streaming & Recording';
      dotClass = 'recording';
    } else if (isRecording) {
      statusText = 'Recording';
      dotClass = 'recording';
    } else {
      statusText = 'Streaming';
      dotClass = 'connected';
    }
  }
  detailStatusText.textContent = statusText;
  detailStatusDot.className = `status-dot ${dotClass}`;

  // Shared Badge
  if (clientSessions.length > 1) {
    detailSharedBadge.innerHTML = `<span class="badge badge-hd">Shared (${clientSessions.length})</span>`;
  } else {
    detailSharedBadge.innerHTML = '';
  }

  // Channel Info & Logo
  if (isActive && (tuner.VctName || tuner.VctNumber)) {
    const stationInfo = getStationInfo(tuner.VctName);
    let logoHtml = '';
    let localityText = '';

    if (stationInfo && stationInfo.logo) {
      logoHtml = `<div class="channel-logo-wrap"><img src="${stationInfo.logo}" alt="${stationInfo.network}" class="affiliate-logo tuner-affiliate-logo" title="${stationInfo.network} • ${stationInfo.locality}" /></div>`;
    } else if (stationInfo && stationInfo.network) {
      logoHtml = `<div class="channel-logo-wrap"><span class="badge badge-affiliate">${stationInfo.network}</span></div>`;
    } else {
      logoHtml = `<div class="channel-logo-wrap"><img src="assets/logos/generic-tv.svg" alt="TV" class="affiliate-logo generic-tv-logo" title="Local Broadcast Channel" /></div>`;
    }

    if (stationInfo && stationInfo.locality) {
      localityText = `(${stationInfo.locality})`;
    }

    if (detailChannelLogo) detailChannelLogo.innerHTML = logoHtml;
    detailChannelName.textContent = tuner.VctName || 'Channel In Use';
    if (detailChannelLocality) detailChannelLocality.textContent = localityText;
    detailChannelNumber.textContent = tuner.VctNumber ? `Ch ${tuner.VctNumber}` : '';
  } else {
    if (detailChannelLogo) detailChannelLogo.innerHTML = '';
    detailChannelName.textContent = '—';
    if (detailChannelLocality) detailChannelLocality.textContent = '';
    detailChannelNumber.textContent = '';
  }

  // Client(s)
  if (clientSessions.length === 0) {
    detailClientsList.innerHTML = isActive ? '<code>Local</code>' : '<span class="text-muted">None</span>';
  } else {
    detailClientsList.innerHTML = clientSessions.map((c) =>
      `<span class="client-badge">${c.type === 'record' ? '📼 DVR' : c.ip}</span>`
    ).join(' ');
  }

  // Network Bitrate / Frequency
  if (tuner.NetworkRate) {
    detailNetworkRate.innerHTML = `<strong>${(tuner.NetworkRate / 1000000).toFixed(2)} Mbps</strong>`;
  } else if (tuner.Frequency) {
    detailNetworkRate.textContent = `${(tuner.Frequency / 1000000).toFixed(3)} MHz`;
  } else {
    detailNetworkRate.innerHTML = '<span class="text-muted">—</span>';
  }

  // Idle Notice
  if (isActive) {
    detailIdleNotice.classList.add('hidden');
  } else {
    detailIdleNotice.classList.remove('hidden');
  }

  // Metrics (Current, Min, Avg, Max)
  const history = state.tunerHistory[tunerId] || [];
  const currentStrength = tuner.SignalStrengthPercent ?? 0;
  const currentQuality = tuner.SignalQualityPercent ?? 0;
  const currentSymbol = tuner.SymbolQualityPercent ?? 0;

  statCurrentStrength.textContent = `${currentStrength}%`;
  statCurrentQuality.textContent = `${currentQuality}%`;
  statCurrentSymbol.textContent = `${currentSymbol}%`;

  if (history.length > 0) {
    const calcStats = (key) => {
      const vals = history.map((s) => s[key] ?? 0);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      return { min, max, avg };
    };

    const strStats = calcStats('strength');
    statMinStrength.textContent = `${strStats.min}%`;
    statAvgStrength.textContent = `${strStats.avg}%`;
    statMaxStrength.textContent = `${strStats.max}%`;

    const qStats = calcStats('quality');
    statMinQuality.textContent = `${qStats.min}%`;
    statAvgQuality.textContent = `${qStats.avg}%`;
    statMaxQuality.textContent = `${qStats.max}%`;

    const symStats = calcStats('symbol');
    statMinSymbol.textContent = `${symStats.min}%`;
    statAvgSymbol.textContent = `${symStats.avg}%`;
    statMaxSymbol.textContent = `${symStats.max}%`;
  } else {
    [statMinStrength, statAvgStrength, statMaxStrength,
     statMinQuality, statAvgQuality, statMaxQuality,
     statMinSymbol, statAvgSymbol, statMaxSymbol].forEach((el) => {
      if (el) el.textContent = '—';
    });
  }
}

function renderTunerGraph() {
  const tunerId = state.selectedTuner;
  if (!tunerId || !tunerChartSvg) return;

  const history = state.tunerHistory[tunerId] || [];
  if (chartSampleCount) {
    chartSampleCount.textContent = `${history.length} sample${history.length === 1 ? '' : 's'}`;
  }

  // 1. Grid & Y-Axis
  const gridPcts = [100, 75, 50, 25, 0];
  let gridHtml = '';
  gridPcts.forEach((pct) => {
    const y = 20 + (1 - pct / 100) * 230;
    gridHtml += `
      <line x1="45" y1="${y}" x2="780" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4,4" />
      <text x="40" y="${y + 4}" fill="#64748b" font-size="11" text-anchor="end" font-family="monospace">${pct}%</text>
    `;
  });
  chartGridGroup.innerHTML = gridHtml;

  // 2. Paths
  if (history.length === 0) {
    chartPathsGroup.innerHTML = `
      <text x="412" y="140" fill="#64748b" text-anchor="middle" font-size="13">
        Collecting signal metrics...
      </text>
    `;
    if (chartTimeStart) chartTimeStart.textContent = '—';
    if (chartTimeMid) chartTimeMid.textContent = '—';
    if (chartTimeNow) chartTimeNow.textContent = 'Now';
    return;
  }

  const paddingLeft = 45;
  const paddingRight = 20;
  const plotW = 800 - paddingLeft - paddingRight;
  const stepX = plotW / Math.max(history.length - 1, 1);

  let pathsHtml = '';

  const seriesMeta = [
    { key: 'strength', color: '#38bdf8', grad: 'grad-strength' },
    { key: 'quality', color: '#34d399', grad: 'grad-quality' },
    { key: 'symbol', color: '#a78bfa', grad: 'grad-symbol' },
  ];

  seriesMeta.forEach(({ key, color, grad }) => {
    if (!state.activeSeries[key]) return;

    const pts = history.map((s, idx) => {
      const x = paddingLeft + idx * stepX;
      const val = s[key] ?? 0;
      const y = 20 + (1 - val / 100) * 230;
      return { x, y, val };
    });

    if (pts.length === 1) {
      const pt = pts[0];
      pathsHtml += `
        <line x1="45" y1="${pt.y}" x2="780" y2="${pt.y}" stroke="${color}" stroke-width="1.5" stroke-dasharray="2,2" opacity="0.4" />
        <circle cx="${pt.x}" cy="${pt.y}" r="5" fill="${color}" stroke="#0b1120" stroke-width="2" />
      `;
    } else {
      const lineD = pts.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '');
      const areaD = `${lineD} L ${pts[pts.length - 1].x} 250 L ${pts[0].x} 250 Z`;

      pathsHtml += `<path d="${areaD}" fill="url(#${grad})" />`;
      pathsHtml += `<path d="${lineD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`;

      const lastPt = pts[pts.length - 1];
      pathsHtml += `<circle cx="${lastPt.x}" cy="${lastPt.y}" r="4.5" fill="${color}" stroke="#0b1120" stroke-width="2" />`;
    }
  });

  chartPathsGroup.innerHTML = pathsHtml;

  // 3. X-Axis Time Labels
  const firstSample = history[0];
  const lastSample = history[history.length - 1];
  const durationSec = Math.round((lastSample.timestamp - firstSample.timestamp) / 1000);

  if (chartTimeStart) {
    chartTimeStart.textContent = durationSec > 0 ? `-${durationSec}s` : '0s';
  }
  if (chartTimeMid) {
    chartTimeMid.textContent = durationSec > 0 ? `-${Math.round(durationSec / 2)}s` : '';
  }
  if (chartTimeNow) {
    chartTimeNow.textContent = 'Now (Live)';
  }
}

function setupChartInteractions() {
  if (!chartContainer) return;

  chartContainer.addEventListener('mousemove', (e) => {
    handleChartHover(e.clientX, e.clientY);
  });

  chartContainer.addEventListener('mouseleave', () => {
    chartCrosshairGroup.innerHTML = '';
    chartTooltip.classList.add('hidden');
  });

  chartContainer.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) {
      handleChartHover(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, { passive: true });

  chartContainer.addEventListener('touchend', () => {
    chartCrosshairGroup.innerHTML = '';
    chartTooltip.classList.add('hidden');
  });
}

function handleChartHover(clientX, clientY) {
  const tunerId = state.selectedTuner;
  if (!tunerId) return;
  const history = state.tunerHistory[tunerId] || [];
  if (history.length === 0) return;

  const rect = chartContainer.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;

  const svgX = (relX / rect.width) * 800;
  const paddingLeft = 45;
  const paddingRight = 20;
  const plotW = 800 - paddingLeft - paddingRight;

  if (svgX < paddingLeft || svgX > 800 - paddingRight) {
    chartCrosshairGroup.innerHTML = '';
    chartTooltip.classList.add('hidden');
    return;
  }

  const stepX = plotW / Math.max(history.length - 1, 1);
  const idx = Math.min(Math.max(Math.round((svgX - paddingLeft) / stepX), 0), history.length - 1);
  const sample = history[idx];
  if (!sample) return;

  const ptX = paddingLeft + idx * stepX;

  let crosshairHtml = `<line x1="${ptX}" y1="20" x2="${ptX}" y2="250" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-dasharray="3,3" />`;

  const seriesMeta = [
    { key: 'strength', color: '#38bdf8' },
    { key: 'quality', color: '#34d399' },
    { key: 'symbol', color: '#a78bfa' },
  ];

  seriesMeta.forEach(({ key, color }) => {
    if (state.activeSeries[key]) {
      const val = sample[key] ?? 0;
      const ptY = 20 + (1 - val / 100) * 230;
      crosshairHtml += `<circle cx="${ptX}" cy="${ptY}" r="4" fill="${color}" stroke="#0b1120" stroke-width="2" />`;
    }
  });

  chartCrosshairGroup.innerHTML = crosshairHtml;

  const timeStr = new Date(sample.timestamp).toLocaleTimeString();
  const rateMb = sample.rate ? (sample.rate / 1000000).toFixed(2) + ' Mbps' : '—';

  chartTooltip.innerHTML = `
    <div class="chart-tooltip-time">${timeStr}</div>
    ${state.activeSeries.strength ? `<div class="chart-tooltip-row"><span class="label" style="color: #38bdf8;">Strength:</span><span class="val">${sample.strength}%</span></div>` : ''}
    ${state.activeSeries.quality ? `<div class="chart-tooltip-row"><span class="label" style="color: #34d399;">SNR Quality:</span><span class="val">${sample.quality}%</span></div>` : ''}
    ${state.activeSeries.symbol ? `<div class="chart-tooltip-row"><span class="label" style="color: #a78bfa;">Symbol:</span><span class="val">${sample.symbol}%</span></div>` : ''}
    ${sample.rate ? `<div class="chart-tooltip-row"><span class="label">Rate:</span><span class="val">${rateMb}</span></div>` : ''}
  `;

  const tooltipX = relX > rect.width - 160 ? relX - 150 : relX + 15;
  const tooltipY = Math.min(Math.max(relY - 30, 10), rect.height - 120);
  chartTooltip.style.left = `${tooltipX}px`;
  chartTooltip.style.top = `${tooltipY}px`;
  chartTooltip.classList.remove('hidden');
}

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
    // Only poll actively if the tab is visible and a device is connected
    if (document.visibilityState === 'visible' && state.currentIp) {
      if (state.activeTab === 'tuners') {
        fetchTuners();
      } else if (state.activeTab === 'system') {
        updateSystemLiveStatus();
      } else if (state.activeTab === 'recordings') {
        updateRecordingsLiveStatus();
      } else if (state.activeTab === 'lineup') {
        updateLineupLiveStatus();
      }
    }
  }, state.pollInterval);
}

function stopPolling() {
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

async function updateRecordingsLiveStatus() {
  const ip = state.currentIp;
  if (!ip) return;
  try {
    const statusRes = await fetch(`http://${ip}/status.json`);
    if (!statusRes.ok) return;
    const statusItems = await statusRes.json();
    if (!Array.isArray(statusItems)) return;
    state.tuners = statusItems;
    parseDeviceStatus(statusItems, ip);
    updateEpisodePlaybackBadges();
  } catch (e) {
    // Non-critical, ignore polling errors
  }
}

async function updateLineupLiveStatus() {
  const ip = state.currentIp;
  if (!ip) return;
  try {
    const statusRes = await fetch(`http://${ip}/status.json`);
    if (!statusRes.ok) return;
    const statusItems = await statusRes.json();
    if (!Array.isArray(statusItems)) return;
    state.tuners = statusItems;
    updateLineupSignalMeters();
  } catch (e) {
    // Non-critical, ignore polling errors
  }
}

function getLineupSignalHtml(ch, activeTuner) {
  if (activeTuner && (activeTuner.SignalQualityPercent != null || activeTuner.SignalStrengthPercent != null)) {
    const sq = activeTuner.SignalQualityPercent ?? activeTuner.SignalStrengthPercent;
    const ss = activeTuner.SignalStrengthPercent;
    let gradeClass = 'poor';
    if (sq >= 80) gradeClass = 'good';
    else if (sq >= 60) gradeClass = 'fair';

    const tunerLabel = formatTunerName(activeTuner.Resource);
    const tooltip = `Live on ${tunerLabel}: ${sq}% SNR Quality${ss != null ? ` (${ss}% Strength)` : ''}`;
    return `
      <div class="signal-meter-wrapper" title="${tooltip}">
        <span class="live-dot-mini" title="Active live stream/recording"></span>
        <div class="signal-mini-bar">
          <div class="signal-mini-fill ${gradeClass}" style="width: ${sq}%;"></div>
        </div>
        <span class="signal-mini-val">${sq}%</span>
      </div>
    `;
  }

  if (ch && (ch.SignalQuality != null || ch.SignalStrength != null)) {
    const sq = ch.SignalQuality ?? ch.SignalStrength;
    const ss = ch.SignalStrength;
    let gradeClass = 'poor';
    if (sq >= 80) gradeClass = 'good';
    else if (sq >= 60) gradeClass = 'fair';

    const tooltip = `Last Scan: ${sq}% Signal Quality${ss != null ? ` (${ss}% Strength)` : ''} • Static value from last channel scan`;
    return `
      <div class="signal-meter-wrapper" title="${tooltip}">
        <div class="signal-mini-bar">
          <div class="signal-mini-fill ${gradeClass}" style="width: ${sq}%;"></div>
        </div>
        <span class="signal-mini-val">${sq}%</span>
      </div>
    `;
  }

  return '<span class="text-muted" title="No scan data. Signal is captured during channel scans or measured in real-time when actively tuned.">—</span>';
}

function updateLineupSignalMeters() {
  const rows = lineupTbody.querySelectorAll('tr[data-guide-num]');
  rows.forEach((tr) => {
    const guideNum = tr.getAttribute('data-guide-num');
    const cell = tr.querySelector('.signal-cell');
    if (!cell || !guideNum) return;

    const ch = (state.lineup || []).find(
      (c) => c.GuideNumber && (c.GuideNumber === guideNum || String(c.GuideNumber) === String(guideNum))
    );

    const activeTuner = (state.tuners || []).find(
      (t) => t.VctNumber && (t.VctNumber === guideNum || String(t.VctNumber) === String(guideNum))
    );

    cell.innerHTML = getLineupSignalHtml(ch, activeTuner);
  });
}

function updateEpisodePlaybackBadges() {
  if (!state.hasDvr) return;

  if (state.dvrSubView === 'episodes') {
    const cards = recordingsContainer.querySelectorAll('.recording-card');
    cards.forEach((card) => {
      const ep = card._episodeData;
      if (!ep) return;

      const matchingPlaybacks = (state.activePlaybacks || []).filter((pb) => isEpisodeMatchingPlayback(ep, pb));
      const isPlaying = matchingPlaybacks.length > 0;
      card.classList.toggle('is-playing', isPlaying);

      const metaEl = card.querySelector('.recording-meta');
      if (!metaEl) return;

      let badgeEl = metaEl.querySelector('.badge-playing');
      if (isPlaying) {
        const clientIps = matchingPlaybacks.map((p) => p.ip).join(', ');
        const badgeText = `▶️ Playing (${clientIps})`;
        if (badgeEl) {
          badgeEl.textContent = badgeText;
          badgeEl.title = `Streaming playback to ${clientIps}`;
        } else {
          badgeEl = document.createElement('span');
          badgeEl.className = 'badge badge-playing';
          badgeEl.textContent = badgeText;
          badgeEl.title = `Streaming playback to ${clientIps}`;
          metaEl.insertBefore(badgeEl, metaEl.firstChild);
        }
      } else if (badgeEl) {
        badgeEl.remove();
      }
    });
  } else if (state.dvrSubView === 'series') {
    const cards = recordingsContainer.querySelectorAll('.recording-card');
    cards.forEach((card) => {
      const seriesId = card.querySelector('.btn-view-series-episodes')?.getAttribute('data-series-id');
      if (!seriesId) return;

      const matchEpisodes = state.episodes.filter((ep) => ep.SeriesID === seriesId);
      const hasPlayingEp = matchEpisodes.some((ep) =>
        (state.activePlaybacks || []).some((pb) => isEpisodeMatchingPlayback(ep, pb))
      );

      card.classList.toggle('is-playing', hasPlayingEp);
      const metaEl = card.querySelector('.recording-meta');
      if (!metaEl) return;

      let badgeEl = metaEl.querySelector('.badge-playing');
      if (hasPlayingEp) {
        if (!badgeEl) {
          badgeEl = document.createElement('span');
          badgeEl.className = 'badge badge-playing';
          badgeEl.textContent = '▶️ Playing';
          badgeEl.title = 'An episode in this series is currently playing';
          metaEl.insertBefore(badgeEl, metaEl.firstChild);
        }
      } else if (badgeEl) {
        badgeEl.remove();
      }
    });
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

function updateLineupStats() {
  if (!Array.isArray(state.lineup)) return;

  const allowedChannels = state.lineup.filter((ch) => ch.Enabled !== 0);
  const hiddenChannels = state.lineup.filter((ch) => ch.Enabled === 0);
  const favChannels = state.lineup.filter((ch) => ch.Favorite === 1);
  const atsc3Channels = state.lineup.filter((ch) => isAtsc3Channel(ch));
  const drmChannels = state.lineup.filter((ch) => ch.DRM === 1);
  const hdChannels = state.lineup.filter((ch) => ch.HD === 1 || (ch.VideoCodec && ch.VideoCodec.includes('HD')));

  if (lineupAllowedPill) lineupAllowedPill.textContent = allowedChannels.length;
  if (lineupAllPill) lineupAllPill.textContent = state.lineup.length;
  if (lineupFavPill) lineupFavPill.textContent = favChannels.length;
  if (lineupAtsc3Pill) lineupAtsc3Pill.textContent = atsc3Channels.length;
  if (lineupDrmPill) lineupDrmPill.textContent = drmChannels.length;
  if (lineupHdPill) lineupHdPill.textContent = hdChannels.length;
  if (lineupHiddenPill) lineupHiddenPill.textContent = hiddenChannels.length;

  if (lineupCountBadge) {
    lineupCountBadge.textContent = allowedChannels.length;
    lineupCountBadge.classList.remove('hidden');
  }

  renderChannelsCount(allowedChannels.length, state.lineup.length);
}

async function fetchLineup() {
  const ip = state.currentIp;
  if (!ip) {
    lineupTbody.innerHTML = '<tr><td colspan="5" class="empty-state">No HDHomeRun device connected. Please configure a device IP on the <a href="#system" onclick="switchTab(\'system\'); return false;">System</a> tab.</td></tr>';
    return;
  }
  lineupTbody.innerHTML = '<tr><td colspan="5" class="empty-state">Loading channels...</td></tr>';

  try {
    // Concurrently fetch lineup and status so active tuner signal meters are available
    const [lineupRes, statusRes] = await Promise.all([
      fetch(`http://${ip}/lineup.json?show=found`),
      fetch(`http://${ip}/status.json`).catch(() => null)
    ]);

    if (!lineupRes.ok) throw new Error(`HTTP ${lineupRes.status}`);
    const lineup = await lineupRes.json();
    state.lineup = Array.isArray(lineup) ? lineup : [];

    if (statusRes && statusRes.ok) {
      const statusItems = await statusRes.json();
      if (Array.isArray(statusItems)) {
        state.tuners = statusItems;
      }
    }

    updateLineupStats();
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
  const hasAnyScanSignal = (state.lineup || []).some(
    (ch) => ch.SignalQuality != null || ch.SignalStrength != null
  );
  const signalNoticeEl = document.getElementById('lineup-signal-notice');
  if (signalNoticeEl) {
    if (!hasAnyScanSignal && state.lineup && state.lineup.length > 0) {
      signalNoticeEl.classList.remove('hidden');
      const lineupLink = document.getElementById('link-hdhr-web-lineup');
      if (lineupLink) {
        lineupLink.href = `http://${state.currentIp}/lineup.html`;
      }
    } else {
      signalNoticeEl.classList.add('hidden');
    }
  }

  const filtered = state.lineup.filter((ch) => {
    const station = getStationInfo(ch.GuideName);
    // Text search (matches GuideName, GuideNumber, Network, or City/State)
    const matchesText =
      !state.filterText ||
      (ch.GuideName && ch.GuideName.toLowerCase().includes(state.filterText)) ||
      (ch.GuideNumber && ch.GuideNumber.toLowerCase().includes(state.filterText)) ||
      (station && (
        station.network.toLowerCase().includes(state.filterText) ||
        station.locality.toLowerCase().includes(state.filterText)
      ));

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
    tr.setAttribute('data-guide-num', ch.GuideNumber);
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

    // Check if any physical tuner is currently tuned to this channel
    const activeTuner = (state.tuners || []).find(
      (t) => t.VctNumber && (t.VctNumber === ch.GuideNumber || String(t.VctNumber) === String(ch.GuideNumber))
    );

    // Signal Quality meter (live tuner signal takes precedence over static scan signal)
    const signalHtml = getLineupSignalHtml(ch, activeTuner);

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

    const stationInfo = getStationInfo(ch.GuideName);
    let logoHtml = '';
    let localityHtml = '';

    if (stationInfo && stationInfo.logo) {
      logoHtml = `<div class="channel-logo-wrap"><img src="${stationInfo.logo}" alt="${stationInfo.network}" class="affiliate-logo" title="${stationInfo.network} • ${stationInfo.locality}" /></div>`;
    } else if (stationInfo && stationInfo.network) {
      logoHtml = `<div class="channel-logo-wrap"><span class="badge badge-affiliate">${stationInfo.network}</span></div>`;
    } else {
      logoHtml = `<div class="channel-logo-wrap"><img src="assets/logos/generic-tv.svg" alt="TV" class="affiliate-logo generic-tv-logo" title="Local Broadcast Channel" /></div>`;
    }

    if (stationInfo && stationInfo.locality) {
      localityHtml = `<span class="channel-locality text-xs text-muted">${stationInfo.locality}</span>`;
    }

    const channelNameHtml = `
      <div class="channel-identity">
        ${logoHtml}
        <div class="channel-identity-text">
          <span class="channel-guide-name">${ch.GuideName || 'Unknown'}</span>
          ${localityHtml}
        </div>
      </div>
    `;

    tr.innerHTML = `
      <td class="channel-num-cell">${ch.GuideNumber}</td>
      <td class="channel-name-cell">
        ${channelNameHtml}
      </td>
      <td>
        <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
          ${statusBadge}
          ${atscBadge}
          ${isHd ? '<span class="badge badge-hd">HD</span>' : '<span class="badge">SD</span>'}
          ${drmBadge}
        </div>
      </td>
      <td class="signal-cell">
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
      state.selectedSeriesId = null;
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

async function fetchRecordings(isBackground = false) {
  const ip = state.currentIp;
  if (!ip) {
    if (!isBackground) {
      recordingsContainer.innerHTML = `
        <div class="empty-state">
          <p>No HDHomeRun device connected.</p>
          <p class="text-sm text-muted">Please configure a device IP on the <a href="#system" onclick="switchTab('system'); return false;">System</a> tab.</p>
        </div>`;
    }
    return;
  }
  if (!isBackground) {
    recordingsContainer.innerHTML = '<div class="loading-placeholder">Loading DVR recordings and rules...</div>';
  }
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

    // Fetch live status to identify any active playback sessions
    try {
      const statusRes = await fetch(`http://${ip}/status.json`);
      if (statusRes.ok) {
        const statusItems = await statusRes.json();
        if (Array.isArray(statusItems)) {
          state.tuners = statusItems;
          parseDeviceStatus(statusItems, ip);
        }
      }
    } catch (e) {
      console.warn('Could not fetch status for DVR playback info:', e);
    }

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
      const epsToRender = state.selectedSeriesId
        ? state.episodes.filter((ep) => ep.SeriesID === state.selectedSeriesId)
        : state.episodes;
      renderEpisodes(epsToRender);
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
    if (state.selectedSeriesId) {
      recordingsContainer.innerHTML = `
        <div class="card empty-card" style="grid-column: 1 / -1;">
          <div class="empty-icon">📂</div>
          <h3>No Recorded Episodes Remaining</h3>
          <p class="text-muted">All episodes for this series have been deleted.</p>
          <div class="mt-12">
            <button class="btn btn-primary btn-back-to-series">← Back to All Series</button>
          </div>
        </div>
      `;
      recordingsContainer.querySelector('.btn-back-to-series')?.addEventListener('click', () => {
        state.selectedSeriesId = null;
        dvrViewPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-dvr-view') === 'series'));
        state.dvrSubView = 'series';
        renderCurrentDvrSubView();
      });
      return;
    }
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

  if (state.selectedSeriesId) {
    const sObj = state.series.find((s) => s.SeriesID === state.selectedSeriesId);
    const seriesTitle = sObj?.Title || episodes[0]?.Title || 'Series';
    const headerBar = document.createElement('div');
    headerBar.className = 'dvr-series-header-bar';
    headerBar.innerHTML = `
      <button class="btn btn-sm btn-secondary btn-back-to-series">← All Series</button>
      <span style="font-weight: 600; font-size: 0.95rem;">Series: ${seriesTitle}</span>
      <span class="text-sm text-muted">(${episodes.length} episode${episodes.length === 1 ? '' : 's'})</span>
    `;
    headerBar.querySelector('.btn-back-to-series')?.addEventListener('click', () => {
      state.selectedSeriesId = null;
      dvrViewPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-dvr-view') === 'series'));
      state.dvrSubView = 'series';
      renderCurrentDvrSubView();
    });
    recordingsContainer.appendChild(headerBar);
  }
  episodes.forEach((ep, epIndex) => {
    const card = document.createElement('div');
    card._episodeData = ep;
    card.setAttribute('data-ep-index', epIndex);

    // Check if this episode is currently playing back
    const matchingPlaybacks = (state.activePlaybacks || []).filter((pb) => isEpisodeMatchingPlayback(ep, pb));
    const isPlaying = matchingPlaybacks.length > 0;
    card.className = `recording-card ${isPlaying ? 'is-playing' : ''}`;

    const recordedDate = ep.StartTime ? new Date(ep.StartTime * 1000).toLocaleDateString() : '—';
    const durationSec = (ep.EndTime && ep.StartTime) ? (ep.EndTime - ep.StartTime) : (ep.Duration || 0);
    const durationMin = durationSec > 0 ? Math.round(durationSec / 60) + ' min' : (ep.Duration ? Math.round(ep.Duration / 60) + ' min' : '—');
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

    // Determine initial file size display
    let sizeDisplay = '';
    const rawBytes = ep.FileSize || ep.FileSizeBytes || ep.Bytes || ep.Size || ep.RecordSize;
    if (rawBytes) {
      const gb = (rawBytes / (1024 * 1024 * 1024)).toFixed(2);
      sizeDisplay = `💾 ${gb} GB`;
    } else if (durationSec > 0) {
      const isAtsc3 = (ep.ChannelNumber && String(ep.ChannelNumber).startsWith('10')) || (ep.ChannelName && ep.ChannelName.includes('4K'));
      const estBitrate = isAtsc3 ? 6000000 : 12000000;
      const estBytes = (durationSec * estBitrate) / 8;
      const estGb = (estBytes / (1024 * 1024 * 1024)).toFixed(1);
      sizeDisplay = `💾 ~${estGb} GB`;
    }

    const filenameParts = [ep.Title || 'Recording'];
    if (ep.EpisodeNumber) filenameParts.push(ep.EpisodeNumber);
    if (ep.EpisodeTitle) filenameParts.push(ep.EpisodeTitle);
    const suggestedFilename = filenameParts.join(' - ').replace(/[^a-zA-Z0-9_\- ]/g, '_').trim() + '.mpg';

    let playingDisplay = '';
    if (isPlaying) {
      const clientIps = matchingPlaybacks.map((p) => p.ip).join(', ');
      playingDisplay = `
        <span class="badge badge-playing" title="Streaming playback to ${clientIps}">
          ▶️ Playing (${clientIps})
        </span>
      `;
    }

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
        ${playingDisplay}
        <span class="recording-meta-item">📅 ${recordedDate}</span>
        <span class="recording-meta-item">⏱️ ${durationMin}</span>
        ${sizeDisplay ? `<span class="recording-meta-item" id="ep-size-${epIndex}"><strong>${sizeDisplay}</strong></span>` : ''}
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

    // Asynchronously query HEAD on playUrl to get exact Content-Length if available
    if (!rawBytes && playUrl) {
      fetch(playUrl, { method: 'HEAD' })
        .then((res) => {
          const cl = res.headers.get('content-length');
          if (cl) {
            const bytes = parseInt(cl, 10);
            ep.FileSize = bytes;
            const gb = (bytes / (1024 * 1024 * 1024)).toFixed(2);
            const sizeEl = document.getElementById(`ep-size-${epIndex}`);
            if (sizeEl) {
              sizeEl.innerHTML = `<strong>💾 ${gb} GB</strong>`;
            }
          }
        })
        .catch(() => {});
    }
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

    // Count matching episodes
    const matchEpisodes = state.episodes.filter((ep) => ep.SeriesID === s.SeriesID);
    const matchCount = matchEpisodes.length;

    // Check if any episode in this series is currently playing
    const hasPlayingEp = matchEpisodes.some((ep) =>
      (state.activePlaybacks || []).some((pb) => isEpisodeMatchingPlayback(ep, pb))
    );
    card.className = `recording-card ${hasPlayingEp ? 'is-playing' : ''}`;
    const posterUrl = s.ImageURL || 'icon.svg';
    const recordedDate = s.StartTime ? new Date(s.StartTime * 1000).toLocaleDateString() : '—';

    // Calculate total size for series
    let seriesTotalGb = 0;
    matchEpisodes.forEach((ep) => {
      const b = ep.FileSize || ep.FileSizeBytes || ep.Bytes || ep.Size || ep.RecordSize;
      if (b) {
        seriesTotalGb += b / (1024 * 1024 * 1024);
      } else {
        const dSec = (ep.EndTime && ep.StartTime) ? (ep.EndTime - ep.StartTime) : (ep.Duration || 0);
        if (dSec > 0) {
          const isAtsc3 = (ep.ChannelNumber && String(ep.ChannelNumber).startsWith('10')) || (ep.ChannelName && ep.ChannelName.includes('4K'));
          const estBitrate = isAtsc3 ? 6000000 : 12000000;
          seriesTotalGb += (dSec * estBitrate) / 8 / (1024 * 1024 * 1024);
        }
      }
    });
    const sizeDisplay = seriesTotalGb > 0 ? `💾 ~${seriesTotalGb.toFixed(1)} GB` : '';

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
        ${hasPlayingEp ? '<span class="badge badge-playing" title="An episode in this series is currently playing">▶️ Playing</span>' : ''}
        <span class="recording-meta-item">📅 Latest: ${recordedDate}</span>
        ${sizeDisplay ? `<span class="recording-meta-item"><strong>${sizeDisplay}</strong></span>` : ''}
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
      state.selectedSeriesId = sId;
      dvrViewPills.forEach((p) => p.classList.toggle('active', p.getAttribute('data-dvr-view') === 'episodes'));
      state.dvrSubView = 'episodes';
      renderCurrentDvrSubView();
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
    setTimeout(() => fetchRecordings(true), 1200);
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
  state.selectedSeriesId = null;
  setTimeout(() => fetchRecordings(true), 1000);
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
    renderAppInfo();
  });
}

function renderAppInfo() {
  const infoAppVersion = document.getElementById('info-app-version');
  const appVersionBadge = document.getElementById('app-version-badge');
  const infoPwaMode = document.getElementById('info-pwa-mode');

  if (infoAppVersion) infoAppVersion.textContent = `v${APP_VERSION}`;
  if (appVersionBadge) appVersionBadge.textContent = `v${APP_VERSION}`;

  if (infoPwaMode) {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    infoPwaMode.innerHTML = isStandalone
      ? '<span class="badge badge-hd">Installed PWA</span>'
      : '<span class="text-muted">Browser Tab</span>';
  }
}

/* ==========================================================================
   Diagnostic Logs & Export
   ========================================================================== */

function isAnyTunerActive(statusItems) {
  if (!Array.isArray(statusItems) || statusItems.length === 0) return false;
  return statusItems.some((item) => {
    const isTuner = item.Resource && item.Resource.toLowerCase().startsWith('tuner');
    if (!isTuner) return false;
    return Boolean(
      item.VctNumber ||
      item.Vchannel ||
      (item.TargetIP && item.TargetIP !== 'none' && item.TargetIP !== '127.0.0.1' && item.TargetIP !== '[::1]') ||
      (item.SignalStrengthPercent && item.SignalStrengthPercent > 0) ||
      (item.SignalStrength && item.SignalStrength > 0)
    );
  });
}

function updateDiagIdleWarning(statusItems) {
  const diagIdleWarning = document.getElementById('diag-idle-warning');
  if (!diagIdleWarning) return;

  const tuners = statusItems || state.tuners;
  if (!Array.isArray(tuners) || tuners.length === 0) {
    diagIdleWarning.classList.add('hidden');
    return;
  }

  const anyActive = isAnyTunerActive(tuners);
  if (!anyActive) {
    diagIdleWarning.classList.remove('hidden');
  } else {
    diagIdleWarning.classList.add('hidden');
  }
}

function setupDiagnostics() {
  const btnGatherDiag = document.getElementById('btn-gather-diag');
  const btnCopyDiag = document.getElementById('btn-copy-diag');
  const btnDownloadDiag = document.getElementById('btn-download-diag');
  const btnGithubIssue = document.getElementById('btn-github-issue');
  const diagRedactAuth = document.getElementById('diag-redact-auth');

  if (btnGatherDiag) {
    btnGatherDiag.addEventListener('click', () => gatherDiagnostics());
  }

  if (btnCopyDiag) {
    btnCopyDiag.addEventListener('click', () => copyDiagnosticsToClipboard());
  }

  if (btnDownloadDiag) {
    btnDownloadDiag.addEventListener('click', () => downloadDiagnosticsJson());
  }

  if (btnGithubIssue) {
    btnGithubIssue.addEventListener('click', () => openGitHubIssue());
  }

  if (diagRedactAuth) {
    diagRedactAuth.addEventListener('change', () => {
      if (state.lastDiagnostics) {
        renderDiagnosticsOutput();
      }
    });
  }

  updateDiagIdleWarning();
}

async function fetchDiagnosticEndpoint(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return {
        available: false,
        status: res.status,
        statusText: res.statusText,
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }
    const data = await res.json();
    return {
      available: true,
      status: res.status,
      data: data,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      available: false,
      status: 'error',
      error: err.name === 'AbortError' ? `Request timed out after ${timeoutMs / 1000}s` : err.message,
    };
  }
}

async function gatherDiagnostics() {
  const btnGatherDiag = document.getElementById('btn-gather-diag');
  const btnCopyDiag = document.getElementById('btn-copy-diag');
  const btnDownloadDiag = document.getElementById('btn-download-diag');
  const diagStatusBanner = document.getElementById('diag-status-banner');
  const diagStatusIcon = document.getElementById('diag-status-icon');
  const diagStatusText = document.getElementById('diag-status-text');

  const ip = state.currentIp;
  if (!ip) {
    alert('No active device IP selected.');
    return;
  }

  // Update UI to loading state
  if (btnGatherDiag) {
    btnGatherDiag.disabled = true;
    btnGatherDiag.textContent = '⏳ Gathering...';
  }
  if (diagStatusBanner) {
    diagStatusBanner.className = 'diag-status-banner';
    diagStatusBanner.classList.remove('hidden', 'success', 'error');
    if (diagStatusIcon) diagStatusIcon.textContent = '⏳';
    if (diagStatusText) diagStatusText.textContent = `Gathering diagnostic feeds from HDHomeRun at ${ip}...`;
  }

  try {
    // Check if the device is a RECORD engine (StorageURL or StorageID or state.hasDvr)
    const isRecordDevice = Boolean(
      state.hasDvr ||
      state.dvrStorageUrl ||
      state.deviceInfo?.StorageURL ||
      state.deviceInfo?.StorageID
    );

    const dvrUrl = state.dvrStorageUrl
      ? `${state.dvrStorageUrl}/recorded_files.json`
      : (state.deviceInfo?.StorageURL ? `${state.deviceInfo.StorageURL}/recorded_files.json` : `http://${ip}/recorded_files.json`);

    // Base endpoints always expected on any HDHomeRun
    const endpointPromises = [
      fetchDiagnosticEndpoint(`http://${ip}/discover.json`),
      fetchDiagnosticEndpoint(`http://${ip}/status.json`),
      fetchDiagnosticEndpoint(`http://${ip}/lineup.json?show=found`),
      fetchDiagnosticEndpoint(`http://${ip}/lineup_status.json`),
    ];

    // Only query recorded_files.json if this device is an HDHomeRun RECORD engine
    if (isRecordDevice) {
      endpointPromises.push(fetchDiagnosticEndpoint(dvrUrl));
    }

    const results = await Promise.all(endpointPromises);
    const discoverRes = results[0];
    const statusRes = results[1];
    const lineupRes = results[2];
    const lineupStatusRes = results[3];
    const recordedRes = isRecordDevice ? results[4] : null;

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // Build raw diagnostics bundle
    const deviceObj = {
      discover: discoverRes.available ? discoverRes.data : { error: discoverRes.error, status: discoverRes.status },
      status: statusRes.available ? statusRes.data : { error: statusRes.error, status: statusRes.status },
      lineup_status: lineupStatusRes.available ? lineupStatusRes.data : { error: lineupStatusRes.error, status: lineupStatusRes.status },
      lineup: lineupRes.available ? lineupRes.data : { error: lineupRes.error, status: lineupRes.status },
    };

    if (isRecordDevice && recordedRes) {
      deviceObj.recorded_files = recordedRes.available ? recordedRes.data : { error: recordedRes.error, status: recordedRes.status };
    }

    const rawBundle = {
      dashboard: {
        app_version: `v${APP_VERSION}`,
        generated_at: new Date().toISOString(),
        user_agent: navigator.userAgent,
        pwa_mode: isStandalone ? 'standalone' : 'browser_tab',
        active_device_ip: ip,
        active_tab: state.activeTab,
      },
      device: deviceObj,
      tuner_history: state.tunerHistory && Object.keys(state.tunerHistory).length > 0 ? state.tunerHistory : null,
    };

    state.lastDiagnostics = rawBundle;

    // Count available feeds vs total expected (4 for standard tuners, 5 for RECORD engines)
    const allFeeds = [discoverRes, statusRes, lineupRes, lineupStatusRes];
    if (isRecordDevice && recordedRes) {
      allFeeds.push(recordedRes);
    }
    const availableCount = allFeeds.filter((f) => f.available).length;
    const totalExpected = allFeeds.length;

    renderDiagnosticsOutput();

    // Check tuner activity and update warning
    const anyActive = isAnyTunerActive(statusRes.available ? statusRes.data : state.tuners);
    updateDiagIdleWarning(statusRes.available ? statusRes.data : state.tuners);

    // Show copy, download & GitHub issue buttons
    if (btnCopyDiag) btnCopyDiag.classList.remove('hidden');
    if (btnDownloadDiag) btnDownloadDiag.classList.remove('hidden');
    const btnGithubIssue = document.getElementById('btn-github-issue');
    if (btnGithubIssue) btnGithubIssue.classList.remove('hidden');

    if (diagStatusBanner) {
      diagStatusBanner.classList.add('success');
      if (diagStatusIcon) diagStatusIcon.textContent = anyActive ? '✅' : '⚠️';
      if (diagStatusText) {
        let msg = `Successfully gathered ${availableCount} of ${totalExpected} diagnostic feeds from ${ip}.`;
        if (!anyActive) {
          msg += ` Note: All tuners are currently idle (stream a channel in the HDHomeRun app to test signal metrics).`;
        }
        diagStatusText.textContent = msg;
      }
    }
  } catch (err) {
    console.error('Error gathering diagnostics:', err);
    if (diagStatusBanner) {
      diagStatusBanner.classList.add('error');
      if (diagStatusIcon) diagStatusIcon.textContent = '⚠️';
      if (diagStatusText) diagStatusText.textContent = `Failed to gather diagnostics: ${err.message}`;
    }
  } finally {
    if (btnGatherDiag) {
      btnGatherDiag.disabled = false;
      btnGatherDiag.textContent = '📥 Refresh Diagnostics';
    }
  }
}

function anonymizeIp(str) {
  if (!str || typeof str !== 'string') return str;
  // Replace IPv4 last octet with NN: e.g. 192.168.1.100 -> 192.168.1.NN
  return str.replace(/\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}\b/g, '$1.NN');
}

function processDiagnostics(rawBundle, redact) {
  if (!rawBundle) return null;
  const cloned = JSON.parse(JSON.stringify(rawBundle));
  if (redact) {
    const redactValue = (val) => {
      if (typeof val === 'string') {
        // Anonymize any IPv4 addresses (including within URLs like http://192.168.1.100/lineup.json)
        let s = anonymizeIp(val);

        // Redact usernames in OS file paths (e.g. /Users/username/ or C:\Users\username\)
        s = s.replace(/(\/(?:Users|home)\/)[^\/]+/gi, '$1[USER]');
        s = s.replace(/(C:\\Users\\)[^\\]+/gi, '$1[USER]');

        return s;
      }
      return val;
    };

    const redactObject = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const lowerKey = key.toLowerCase();

        // Redact serial numbers, hardware IDs, and cloud authentication tokens
        if (
          lowerKey === 'deviceauth' ||
          lowerKey === 'deviceid' ||
          lowerKey === 'serial' ||
          lowerKey === 'serialnumber' ||
          lowerKey === 'storageid' ||
          lowerKey === 'mac' ||
          lowerKey === 'macaddress' ||
          lowerKey === 'accountid' ||
          lowerKey === 'accountemail' ||
          lowerKey === 'email' ||
          lowerKey === 'usercode' ||
          lowerKey === 'postalcode' ||
          lowerKey === 'zipcode' ||
          lowerKey === 'latitude' ||
          lowerKey === 'longitude'
        ) {
          obj[key] = '[REDACTED]';
        } else if (lowerKey === 'friendlyname') {
          // Redact user-customized device names that might contain personal names
          obj[key] = 'HDHomeRun';
        } else if (lowerKey === 'targetip' || lowerKey === 'ip' || lowerKey === 'active_device_ip') {
          // Anonymize IP address (e.g. 192.168.1.NN)
          if (typeof obj[key] === 'string') {
            obj[key] = anonymizeIp(obj[key]);
          }
        } else if (typeof obj[key] === 'string') {
          obj[key] = redactValue(obj[key]);
        } else if (typeof obj[key] === 'object') {
          redactObject(obj[key]);
        }
      }
    };

    redactObject(cloned);
  }
  return cloned;
}

function renderDiagnosticsOutput() {
  if (!state.lastDiagnostics) return;
  const diagRedactAuth = document.getElementById('diag-redact-auth');
  const diagOutputWrap = document.getElementById('diag-output-wrap');
  const diagOutputMeta = document.getElementById('diag-output-meta');
  const diagOutputPre = document.getElementById('diag-output-pre');

  const shouldRedact = diagRedactAuth ? diagRedactAuth.checked : true;
  const processed = processDiagnostics(state.lastDiagnostics, shouldRedact);
  const jsonStr = JSON.stringify(processed, null, 2);

  const bytes = new Blob([jsonStr]).size;
  const kbSize = (bytes / 1024).toFixed(1);

  const expectedKeys = ['discover', 'status', 'lineup', 'lineup_status'];
  if (processed.device?.recorded_files !== undefined) {
    expectedKeys.push('recorded_files');
  }

  let availableFeeds = 0;
  expectedKeys.forEach((k) => {
    if (processed.device?.[k] && !processed.device[k].error && processed.device[k].available !== false) {
      availableFeeds++;
    }
  });
  const totalFeeds = expectedKeys.length;
  const feedSummary = `${availableFeeds} of ${totalFeeds} feeds`;

  if (diagOutputMeta) {
    diagOutputMeta.textContent = `${kbSize} KB • ${feedSummary} • ${shouldRedact ? 'Anonymized & Redacted' : 'Full (Raw)'}`;
  }

  if (diagOutputPre) {
    const codeEl = diagOutputPre.querySelector('code') || diagOutputPre;
    codeEl.textContent = jsonStr;
  }

  if (diagOutputWrap) {
    diagOutputWrap.classList.remove('hidden');
  }
}

async function copyDiagnosticsToClipboard() {
  if (!state.lastDiagnostics) return;
  const diagRedactAuth = document.getElementById('diag-redact-auth');

  const shouldRedact = diagRedactAuth ? diagRedactAuth.checked : true;
  const processed = processDiagnostics(state.lastDiagnostics, shouldRedact);
  const jsonStr = JSON.stringify(processed, null, 2);

  try {
    await navigator.clipboard.writeText(jsonStr);
    showCopyFeedback();
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = jsonStr;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showCopyFeedback();
    } catch (fallbackErr) {
      alert('Failed to copy to clipboard: ' + fallbackErr.message);
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

function showCopyFeedback() {
  const diagCopyFeedback = document.getElementById('diag-copy-feedback');
  if (diagCopyFeedback) {
    diagCopyFeedback.classList.remove('hidden');
    setTimeout(() => {
      diagCopyFeedback.classList.add('hidden');
    }, 2500);
  }
}

function downloadDiagnosticsJson() {
  if (!state.lastDiagnostics) return;
  const diagRedactAuth = document.getElementById('diag-redact-auth');
  const shouldRedact = diagRedactAuth ? diagRedactAuth.checked : true;
  const processed = processDiagnostics(state.lastDiagnostics, shouldRedact);
  const jsonStr = JSON.stringify(processed, null, 2);

  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `hdhr-diagnostics-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openGitHubIssue() {
  const ip = state.currentIp;
  const dev = state.deviceInfo || {};
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  // Issue title is clean: no serial number, no IP address
  const title = `[Issue]: Problem with ${dev.ModelNumber || 'HDHomeRun'}`;

  const anonymizedIp = anonymizeIp(ip);
  let baseBody = `### 🚨 Problem Description (Required)\n`;
  baseBody += `> ✍️ **PLEASE DESCRIBE YOUR ISSUE HERE BEFORE SUBMITTING:**\n`;
  baseBody += `> - *What is happening? (e.g. video freezing, pixelation, channels failing to tune, tuner error)*\n`;
  baseBody += `> - *When did it start? Does it happen on specific channels or all channels?*\n\n`;
  baseBody += `[Type your problem description here]\n\n`;
  baseBody += `---\n\n`;

  // Get tuner data from lastDiagnostics or state.tuners
  const statusItems = Array.isArray(state.lastDiagnostics?.device?.status)
    ? state.lastDiagnostics.device.status
    : (Array.isArray(state.tuners) ? state.tuners : []);

  // Filter for actual physical tuners (exclude session objects like "live", "record")
  const physicalTuners = statusItems.filter((item) =>
    item.Resource && item.Resource.toLowerCase().startsWith('tuner')
  );

  // Active tuners are physical tuners currently tuning or streaming
  const activeTuners = physicalTuners.filter((t) =>
    Boolean(
      t.VctNumber ||
      t.Vchannel ||
      (t.Channel && t.Channel !== 'none') ||
      (t.TargetIP && t.TargetIP !== 'none' && t.TargetIP !== '127.0.0.1' && t.TargetIP !== '::1' && t.TargetIP !== '[::1]') ||
      (t.SignalStrengthPercent && t.SignalStrengthPercent > 0) ||
      (t.SignalStrength && t.SignalStrength > 0)
    )
  );

  const totalTunerCount = dev.TunerCount || (physicalTuners.length > 0 ? physicalTuners.length : 'Unknown');

  baseBody += `### Environment & Diagnostic Summary\n`;
  baseBody += `- **HDHR Dash Version:** v${APP_VERSION}\n`;
  baseBody += `- **Device Model:** ${dev.ModelNumber || 'HDHomeRun'}\n`;
  baseBody += `- **Device ID / Serial:** \`[REDACTED]\`\n`;
  baseBody += `- **Firmware Version:** \`${dev.FirmwareVersion || 'Unknown'}\`\n`;
  baseBody += `- **Device IP:** \`${anonymizedIp}\`\n`;
  baseBody += `- **PWA Mode:** ${isStandalone ? 'Installed PWA' : 'Browser Tab'}\n`;
  baseBody += `- **User Agent:** \`${navigator.userAgent}\`\n`;
  baseBody += `- **Total Tuners:** ${totalTunerCount}\n`;
  baseBody += `- **Active Tuners:** ${activeTuners.length} (${activeTuners.length === 0 ? 'All tuners idle' : `${activeTuners.length} of ${totalTunerCount} in use`})\n`;
  baseBody += `- **Lineup Channels:** ${state.lineup ? state.lineup.length : 'Unknown'}\n\n`;

  if (physicalTuners.length > 0) {
    baseBody += `### Current Tuner Status\n`;
    if (activeTuners.length > 0) {
      activeTuners.forEach((t) => {
        const name = formatTunerName(t.Resource || 'tuner');
        const station = getStationInfo(t.VctName || t.Vchannel);
        let stationMeta = '';
        if (station) {
          if (station.network && station.locality) {
            stationMeta = ` [${station.network} • ${station.locality}]`;
          } else if (station.network) {
            stationMeta = ` [${station.network}]`;
          } else if (station.locality) {
            stationMeta = ` [${station.locality}]`;
          }
        }
        const channelDisplay = t.VctNumber
          ? `${t.VctNumber}${t.VctName ? ` (${t.VctName}${stationMeta})` : stationMeta}`
          : (t.Vchannel || (t.Channel && t.Channel !== 'none' ? t.Channel : 'None'));
        const strength = t.SignalStrengthPercent ?? t.SignalStrength ?? 0;
        const snr = t.SignalQualityPercent ?? t.SignalQuality ?? 0;
        const sym = t.SymbolQualityPercent ?? t.SymbolQuality ?? 0;
        const clientTarget = (t.TargetIP && t.TargetIP !== 'none' && t.TargetIP !== '127.0.0.1' && t.TargetIP !== '::1' && t.TargetIP !== '[::1]')
          ? ` | Client: ${anonymizeIp(t.TargetIP)}`
          : '';
        baseBody += `- **${name}:** Channel ${channelDisplay} | Signal: ${strength}% | SNR: ${snr}% | Sym: ${sym}%${clientTarget}\n`;
      });
      baseBody += `\n`;
    } else {
      baseBody += `> ⚠️ **Notice:** All tuners were idle when diagnostics were gathered. The HDHomeRun powers down its demodulator when idle; RF signal metrics (Signal Strength, SNR, Symbol Quality) require an active live stream in the HDHomeRun app, Plex, Channels, or VLC.\n\n`;
    }
  }

  let fullUrl = '';
  const MAX_URL_LEN = 6500;

  if (state.lastDiagnostics) {
    const diagRedactAuth = document.getElementById('diag-redact-auth');
    const shouldRedact = diagRedactAuth ? diagRedactAuth.checked : true;
    const processed = processDiagnostics(state.lastDiagnostics, shouldRedact);

    // Also copy to clipboard in case user needs raw export
    copyDiagnosticsToClipboard();

    const makeUrl = (bodyText) =>
      `https://github.com/jay0lee/hdhr-dash/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(bodyText)}`;

    // 1. Try formatted JSON
    let jsonStr = JSON.stringify(processed, null, 2);
    let candidateBody = `${baseBody}### Diagnostic Logs\n<details open><summary>Diagnostic Logs (JSON)</summary>\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n</details>\n`;
    fullUrl = makeUrl(candidateBody);

    // 2. If too large for URL, try minified JSON
    if (fullUrl.length > MAX_URL_LEN) {
      jsonStr = JSON.stringify(processed);
      candidateBody = `${baseBody}### Diagnostic Logs\n<details open><summary>Diagnostic Logs (JSON)</summary>\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n</details>\n`;
      fullUrl = makeUrl(candidateBody);
    }

    // 3. If still too large, compact lineup and history
    if (fullUrl.length > MAX_URL_LEN) {
      const compacted = JSON.parse(JSON.stringify(processed));
      if (compacted.tuner_history) {
        const histKeys = Object.keys(compacted.tuner_history);
        for (const k of histKeys) {
          if (Array.isArray(compacted.tuner_history[k])) {
            compacted.tuner_history[k] = compacted.tuner_history[k].slice(-5);
          }
        }
      }
      if (compacted.device && Array.isArray(compacted.device.lineup)) {
        compacted.device.lineup = compacted.device.lineup.map((ch) => ({
          GuideNumber: ch.GuideNumber,
          GuideName: ch.GuideName,
          ...(ch.DRM ? { DRM: ch.DRM } : {}),
        }));
      }

      jsonStr = JSON.stringify(compacted);
      candidateBody = `${baseBody}### Diagnostic Logs\n<details open><summary>Diagnostic Logs (JSON)</summary>\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n</details>\n`;
      fullUrl = makeUrl(candidateBody);

      // If still too long, progressively slice lineup
      if (fullUrl.length > MAX_URL_LEN && compacted.device && Array.isArray(compacted.device.lineup)) {
        const totalCh = compacted.device.lineup.length;
        let sliceCount = Math.min(compacted.device.lineup.length, 50);
        while (sliceCount > 5 && fullUrl.length > MAX_URL_LEN) {
          compacted.device.lineup = compacted.device.lineup.slice(0, sliceCount);
          compacted.device._lineup_note = `Showing ${sliceCount} of ${totalCh} channels (compacted for GitHub URL limit).`;
          jsonStr = JSON.stringify(compacted);
          candidateBody = `${baseBody}### Diagnostic Logs\n<details open><summary>Diagnostic Logs (JSON)</summary>\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n</details>\n`;
          fullUrl = makeUrl(candidateBody);
          sliceCount = Math.floor(sliceCount * 0.7);
        }
      }
    }

    // 4. Absolute fallback if extreme URL length remains
    if (fullUrl.length > MAX_URL_LEN) {
      const trimmedBody = `${baseBody}### Diagnostic Logs\n> 📋 *Note: Diagnostic logs exceeded GitHub's URL length limit and were copied to your clipboard. Paste them below if desired:*\n\n\`\`\`json\n\n\`\`\`\n`;
      fullUrl = makeUrl(trimmedBody);
    }

    showCopyFeedback();
    const diagStatusText = document.getElementById('diag-status-text');
    const diagStatusBanner = document.getElementById('diag-status-banner');
    if (diagStatusBanner && diagStatusText) {
      diagStatusBanner.className = 'diag-status-banner success';
      diagStatusBanner.classList.remove('hidden');
      diagStatusText.textContent = 'Opening GitHub issue with pre-filled diagnostic logs!';
    }
  } else {
    baseBody += `### Diagnostic Logs\n<!-- Gather and attach diagnostic logs from the System tab -> Diagnostic Logs & Export -->\n`;
    fullUrl = `https://github.com/jay0lee/hdhr-dash/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(baseBody)}`;
  }

  window.open(fullUrl, '_blank', 'noopener,noreferrer');
}



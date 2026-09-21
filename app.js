const STORAGE_KEY = 'hdhr_device_ip';
const DEFAULT_IP = '10.1.0.4';

// Elements
const ipInput = document.getElementById('hdhr-ip');
const btnSaveIp = document.getElementById('btn-save-ip');
const btnStatus = document.getElementById('btn-status');
const btnDiscover = document.getElementById('btn-discover');
const btnLineup = document.getElementById('btn-lineup');
const outputJson = document.getElementById('output-json');
const diagnosticBanner = document.getElementById('diagnostic-banner');
const timingBadge = document.getElementById('timing-badge');
const btnInstall = document.getElementById('btn-install');
const pwaStatus = document.getElementById('pwa-status');
const currentOrigin = document.getElementById('current-origin');

// Display current origin
currentOrigin.textContent = window.location.origin;

// Load saved IP or default
const savedIp = localStorage.getItem(STORAGE_KEY) || DEFAULT_IP;
ipInput.value = savedIp;

btnSaveIp.addEventListener('click', () => {
  const ip = ipInput.value.trim();
  if (ip) {
    localStorage.setItem(STORAGE_KEY, ip);
    showDiagnostic(`Saved device IP: ${ip}`, 'success');
  }
});

// Fetch Helper
async function fetchHdhr(endpoint) {
  const ip = ipInput.value.trim() || DEFAULT_IP;
  const url = `http://${ip}${endpoint}`;

  setLoading(true);
  timingBadge.classList.remove('hidden');
  timingBadge.textContent = 'Loading...';
  hideDiagnostic();
  outputJson.textContent = `Requesting GET ${url}...`;

  const startTime = performance.now();

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    const elapsed = Math.round(performance.now() - startTime);
    timingBadge.textContent = `${elapsed} ms`;

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    outputJson.textContent = JSON.stringify(data, null, 2);
    showDiagnostic(`Successfully loaded ${endpoint} (${response.status} OK)`, 'success');
  } catch (err) {
    const elapsed = Math.round(performance.now() - startTime);
    timingBadge.textContent = `${elapsed} ms`;

    outputJson.textContent = `Error: ${err.message}\n\nStack:\n${err.stack || 'No stack available'}`;

    // Diagnose likely cause based on context
    let helpMsg = `<strong>Request to ${url} failed!</strong><br/>`;
    if (window.location.protocol === 'https:') {
      helpMsg += `Since this page is on <code>https://</code>, Chrome likely blocked this request due to <strong>Mixed Content</strong> or <strong>Private Network Access (PNA)</strong>.<br/><br/>
      • Ensure <em>Site Settings &gt; Insecure content</em> is set to <strong>Allow</strong>.<br/>
      • Ensure Chrome policy <code>InsecurePrivateNetworkRequestsAllowedForUrls</code> or the PNA flag is configured.`;
    } else {
      helpMsg += `Verify that <code>${ip}</code> is reachable on your local network and that the HDHomeRun is powered on.`;
    }

    showDiagnostic(helpMsg, 'error');
  } finally {
    setLoading(false);
  }
}

function showDiagnostic(html, type) {
  diagnosticBanner.innerHTML = html;
  diagnosticBanner.className = `diagnostic-banner ${type}`;
  diagnosticBanner.classList.remove('hidden');
}

function hideDiagnostic() {
  diagnosticBanner.classList.add('hidden');
}

function setLoading(isLoading) {
  btnStatus.disabled = isLoading;
  btnDiscover.disabled = isLoading;
  btnLineup.disabled = isLoading;
}

// Action button listeners
btnStatus.addEventListener('click', () => fetchHdhr('/status.json'));
btnDiscover.addEventListener('click', () => fetchHdhr('/discover.json'));
btnLineup.addEventListener('click', () => fetchHdhr('/lineup.json'));

// PWA: Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        console.log('Service Worker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
      });
  });
}

// PWA: Install Prompt handling
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  btnInstall.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  console.log(`User response to the install prompt: ${outcome}`);
  deferredPrompt = null;
  btnInstall.classList.add('hidden');
});

window.addEventListener('appinstalled', () => {
  pwaStatus.textContent = 'Installed PWA';
  pwaStatus.classList.add('pwa-installed');
  btnInstall.classList.add('hidden');
});

// Check if running in standalone mode (already installed PWA)
if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
  pwaStatus.textContent = 'Installed PWA';
  pwaStatus.classList.add('pwa-installed');
}

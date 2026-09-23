# HDHR Dash

[![GitHub Pages](https://img.shields.io/badge/Hosted%20On-GitHub%20Pages-blue?logo=github)](https://jay0lee.github.io/hdhr-dash/)
[![PWA Ready](https://img.shields.io/badge/PWA-Installable-success?logo=pwa)](https://jay0lee.github.io/hdhr-dash/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Version: v2.0.64](https://img.shields.io/badge/Version-v2.0.64-brightgreen.svg)](https://github.com/jay0lee/hdhr-dash/releases)

A modern, fast, and responsive web dashboard and **Progressive Web App (PWA)** for [SiliconDust HDHomeRun](https://www.silicondust.com/) network tuners and DVR recording engines. 

Zero setup, zero cloud accounts, and zero tracking — HDHR Dash connects directly to your HDHomeRun across your home network to give you live tuner gauges, channel streaming links, DVR library management, and hardware diagnostics.

👉 **Launch Live App:** [https://jay0lee.github.io/hdhr-dash/](https://jay0lee.github.io/hdhr-dash/)

---

## 🚀 Quick Start (Need-to-Know for New Users)

You do not need to install servers, sign up for an account, or configure background services. HDHR Dash runs 100% in your browser.

1. **Open the App:**  
   Navigate to [jay0lee.github.io/hdhr-dash](https://jay0lee.github.io/hdhr-dash/) on any computer, tablet, or phone connected to your home Wi-Fi or LAN.
2. **Allow Local Network Access:**  
   When prompted by your browser (e.g. Chrome, Edge, or Brave), click **Allow** to let the dashboard communicate with your HDHomeRun tuner on your local network. *(See [How Local Network Access Works](#-how-local-network-access-works) below).*
3. **Connect Your Tuner:**  
   HDHR Dash will automatically detect your HDHomeRun device via mDNS / UDP discovery. If auto-discovery is blocked by your browser or network, go to the **System** tab, enter your tuner's local IP (e.g., `192.168.1.100`) or mDNS hostname (e.g., `hdhr-10a1d769.local`), and click **Add / Switch**.
4. **(Optional) Install as an App:**  
   Install HDHR Dash to your desktop or home screen for a standalone, full-screen app experience. *(See [Installing as a PWA](#-installing-as-a-progressive-web-app-pwa) below).*

---

## 📸 App Tour & Features

### 📡 Tuner Activity & Status

Monitor physical tuners in real time with live polling, client IP resolution, network streaming bitrate, and signal gauges.

![Tuner Activity & Status](screenshots/tuners.png)

* **Live Tuner Cards:** View active stream status (`STREAMING` vs `IDLE`), current channel callsign, network logo, virtual channel number, and broadcast market location.
* **UHF / VHF & Frequency Details:** Clearly displays the broadcast band pill (**UHF** or **VHF**), broadcast frequency in MHz, and underlying physical **RF Channel** number.
* **Client IP & Bitrate:** See the exact client device streaming from each tuner (with IPv4 and IPv6 support) and the live network stream bitrate (e.g., `1.66 Mbps`).
* **Signal Quality Meters:** Real-time color-coded progress bars for **Signal Strength**, **SNR Quality**, and **Symbol Quality** (🟢 Green $\ge 80\%$, 🟡 Orange $\ge 60\%$, 🔴 Red $< 60\%$).
* **Signal Graphing & Antenna Alignment:** Click **"📈 View Signal Graph →"** on any tuner card to access dedicated real-time signal graphing, historical chart trends, and audio/visual assistance for aiming over-the-air antennas.
* **Tuner Sharing Detection:** Automatically flags when multiple client apps or background DVR tasks share a single physical tuner on the same broadcast frequency.
* **Configurable Refresh Rate:** Toggle live polling between `1s`, `2.5s`, `5s`, or `Paused`. Polling automatically sleeps when the tab is hidden to save battery and network bandwidth.

---

### 📺 Channels & Live Streaming

Browse your complete scanned channel lineup with broadcast format badges, reception meters, quick search, and one-click media playback.

![Channels](screenshots/channels.png)

* **Comprehensive Badges:**
  * **Broadcast Band:** `UHF` vs `VHF` pills to identify which frequencies your antenna needs to receive.
  * **Broadcast Standard:** `ATSC1` (standard digital broadcast) vs `ATSC3` (NextGen TV 4K/HEVC).
  * **DRM Protection:** Highlights encrypted ATSC 3.0 channels with `🔒 DRM`.
  * **Favorites & Format:** `⭐ Fav` favorite status, `HD` / `4K` / `SD` resolution tags.
* **Physical RF Sub-labels:** Virtual channel numbers (e.g. `10.1`, `106.1`) are paired directly with their physical RF channel number (`RF 28`, `RF 33`) so you always know the true transmission frequency.
* **Instant Search & Advanced Filters:** Search channels instantly by name, callsign, or channel number. Use the **⚡ Filters** dropdown to narrow down by *Favorites*, *Allowed*, *Hidden*, *ATSC 3.0*, *UHF*, *VHF*, *HD*, or *DRM*.
* **One-Click Playback & Copy:**
  * 📋 **Copy URL:** Copies the direct HTTP MPEG-TS stream URL directly to your clipboard.
  * 📺 **M3U:** Instantly launches or downloads a `.m3u` stream file for desktop players like VLC, IINA, or Infuse.
* **Playlist Export:** Click **📥 Export M3U** to generate a complete `#EXTM3U` playlist with channel names, numbers, and station logos for import into Plex, Channels DVR, Kodi, or IPTV clients.

---

### 📼 DVR & Recordings

Manage your connected HDHomeRun DVR storage engine, browse recorded media, and inspect scheduled series rules.

![DVR & Recordings](screenshots/recordings.png)

* **Storage Capacity Bar:** Visual disk space gauge displaying free storage, total storage, and percent used on your attached drive (e.g. USB drive on HDHomeRun FLEX 4K or network DVR storage).
* **Series Library:**
  * Visual cards featuring high-resolution broadcast poster art and genre tags (`Series`, `Sport`, `Movie`).
  * Total recorded episode count, latest recording date, and aggregate file size (e.g. `💾 ~22.6 GB`).
  * Quick-access **View Episodes** button and single-click series deletion 🗑️.
* **Episode Browser:**
  * Detailed episode list with season/episode numbers (`S01E02`), episode title, broadcast station logo, original air date, synopsis, and file size.
  * **⬇️ Download (.mpg):** Download raw, uncompressed `.mpg` broadcast recording files straight to your local computer.
  * **Direct Stream:** Watch recorded episodes directly in your browser or external player.
  * **Delete Episode:** Safely delete completed episodes to reclaim disk space.
* **Scheduled Recording Rules:**
  * View active series rules configured in your HDHomeRun Cloud DVR (`api.hdhomerun.com`).
  * **Clear Priority Rankings:** Displays numeric rule priorities with explicit `(highest)` and `(lowest)` precedence qualifiers so you can see exactly which rule wins during recording schedule conflicts.
  * View team/channel restrictions and start/end recording padding.

---

### ⚙️ System, Settings & Diagnostics

Centralized hardware management, multi-device switching, theme customization, and privacy-safe diagnostic logging.

![System & Settings](screenshots/system.png)

* **Hardware Overview:** View model number (`HDFX-4K`), Device ID, firmware version, tuner count, channel totals, mDNS hostname, active streaming clients, active recording tasks, and connected storage.
* **Firmware Update Checker:** Automatically compares your tuner's firmware against the latest SiliconDust release, displaying `✓ Up to date` or `Update Available` with direct links to the device web admin and official changelogs.
* **Multi-Device Support:** Save multiple HDHomeRun tuners on your network. Switch between units with a single click or run discovery anytime.
* **Theme Customization:** Choose from 5 themes designed for all environments:
  * 🌙 **Dark (Default):** Clean modern slate and cyan palette.
  * ☀️ **Light:** High-contrast daylight interface.
  * 🖤 **OLED Black:** Pitch-black background optimized for OLED displays and low power draw.
  * 🌊 **Teal:** Classic SiliconDust brand aesthetic.
  * ❄️ **Nord Frost:** Cool arctic blues and muted slate.
* **Preferences & Safety:**
  * **Confirm Recording Deletions:** Toggle confirmation dialogs when deleting episodes or series to prevent accidental file loss.
* **Privacy-Safe Diagnostic Export:**
  * One-click **Gather Diagnostic Logs** captures raw JSON feeds from your tuner (discovery, status, lineup, storage, and rules).
  * Automatically **redacts serial numbers, device auth tokens, and anonymizes local IP addresses** so you can safely paste diagnostic logs to forums, Reddit, or SiliconDust support.

---

## 💡 Need-to-Know Information for New Users

### 1. UHF vs. VHF & Physical RF Channels
Broadcast television channels use two numbers:
- **Virtual Channel Number (e.g., 6.1, 10.1):** The branded channel number you see on your TV guide.
- **Physical RF Channel Number (e.g., RF 13, RF 28):** The actual radio frequency band transmitting the signal over the air:
  - **VHF (Channels 2–13):** Longer wavelengths that require wider antenna elements. Signals can be prone to household electrical interference.
  - **UHF (Channels 14–36):** Shorter wavelengths that penetrate buildings better and use smaller, directional antenna elements.

HDHR Dash displays both numbers and a **UHF** / **VHF** pill for every channel. If you are experiencing weak reception on specific channels, checking the RF channel and band helps you determine whether your antenna has adequate VHF or UHF reception elements.

---

### 2. ATSC 1.0 vs. ATSC 3.0 (NextGen TV) & DRM
- **ATSC 1.0:** Standard digital television broadcast. HDHR Dash allows copying stream URLs, opening in VLC/IINA, and downloading recordings without restrictions.
- **ATSC 3.0 (NextGen TV):** Modern broadcast standard supporting 4K HDR, HEVC video, and AC-4 audio. Unencrypted ATSC 3.0 channels stream freely like ATSC 1.0.
- **`🔒 DRM`:** Broadcasters may encrypt their ATSC 3.0 broadcasts with DRM. For the latest status, discussion, and information regarding ATSC 3.0 DRM support and playback across platforms, refer to the [SiliconDust ATSC 3.0 DRM Forum](https://forum.silicondust.com/forum/viewforum.php?f=133).

---

### 3. Playing Streams in VLC or External Media Players
You can watch live TV from any channel on the **Channels** tab:
- **Copy Stream URL:** Click **Copy URL** on any channel row and paste it into VLC (**Media > Open Network Stream**), IINA, or Infuse.
- **M3U Launcher:** Click the **M3U** button to download a `.m3u` file configured for that channel. Opening the file will automatically start the stream in your default desktop video player.
- **Full Playlist Export:** Click **Export M3U** in the header to download a complete playlist of all non-hidden channels for IPTV apps or home media servers.

---

### 4. DVR Requirements
The **DVR & Recordings** tab automatically activates if your HDHomeRun has an attached recording engine:
- **HDHomeRun FLEX 4K:** Connect any compatible USB hard drive or flash drive to the USB port on the back of the tuner. The FLEX will automatically format and activate storage.
- **HDHomeRun DVR Service:** If you run the HDHomeRun DVR engine on a NAS, PC, or Raspberry Pi on your network, HDHR Dash will automatically detect the network storage engine.
- If no recording storage is attached, the DVR tab will inform you that storage is not detected, while tuner monitoring and live channel features remain fully functional.

---

## 🔒 Privacy & Security

* **100% Client-Side:** HDHR Dash contains no analytics, tracking scripts, or telemetry.
* **Direct LAN Communication:** All network requests travel directly between your web browser and your HDHomeRun tuner across your local home network. No video streams or tuner data pass through external servers.
* **No Accounts or Logins:** No registration, cookies, or subscriptions required.
* **Safe Diagnostic Sharing:** The built-in log collector includes an automatic redaction toggle to scrub private serial numbers, cloud auth tokens, and IP addresses before sharing logs online.

---

## 🌐 How Local Network Access Works

Modern web browsers enforce strict security controls when secure HTTPS sites communicate with private local network IP addresses (`192.168.x.x` or `10.x.x.x`).

HDHR Dash works seamlessly out of the box because:
1. **HDHomeRun CORS Support:** SiliconDust HDHomeRun firmware serves `Access-Control-Allow-Origin: *` headers on its JSON endpoints.
2. **Local Network Access (LNA) Permission:** When you first load the dashboard on Chrome or Chromium-based browsers, a browser permission banner appears:  
   > *"Allow this site to access devices on your local network?"*  
   Clicking **Allow** authorizes the browser to query your HDHomeRun tuner without security blocks.

---

## 📱 Installing as a Progressive Web App (PWA)

HDHR Dash is a certified PWA and can be installed as a standalone desktop or mobile application:

- **Google Chrome / Microsoft Edge (macOS, Windows, Linux):**  
  Click the **Install** icon in the address bar (or menu `⋮` > **Save and Share** > **Install HDHR Dash**).
- **Safari (iPhone & iPad):**  
  Tap the **Share** button in Safari > tap **Add to Home Screen**.
- **Android (Chrome):**  
  Tap the menu (`⋮`) > tap **Add to Home screen** or **Install app**.

Once installed, HDHR Dash opens in its own window without browser toolbars, runs with service-worker offline caching for the app shell, and persists your preferences across reboots.

---

## 💻 Running Locally (Self-Hosting)

If you prefer to host HDHR Dash yourself on a home server or run it completely disconnected from GitHub Pages:

```bash
# Clone the repository
git clone https://github.com/jay0lee/hdhr-dash.git
cd hdhr-dash

# Serve using any lightweight static web server
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your web browser.

---

## 📄 License

Distributed under the Apache License 2.0. See [LICENSE](LICENSE) for more details.

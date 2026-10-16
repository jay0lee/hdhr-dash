/**
 * HDHR Dash — ATSC 1.0 Dedicated Web Worker (atsc-worker.js)
 * High-performance WebAssembly FFmpeg ATSC 1.0 Decoder & Demuxer.
 *
 * Implements:
 *   - WebAssembly single-threaded FFmpeg libavcodec core (MPEG-2 Video & AC-3 Audio)
 *   - Fast zero-copy transfer of planar YUV420P video frames to WebGL Canvas
 *   - Fast zero-copy transfer of 48 kHz stereo Float32 PCM audio to Web Audio API
 *   - Multi-program PAT/PMT parsing and A/V clock telemetry
 */

/* global importScripts, createFFmpegCore, ATSCDemuxer */

self.importScripts('atsc-demuxer.js', 'ffmpeg/ffmpeg-core.js');

let core = null;
let corePromise = null;
let demuxer = null;
let streamBuffer = [];
let streamBufferBytes = 0;
let segmentIndex = 0;
let streamPts = null;
let videoWidth = 1920;
let videoHeight = 1080;
let isInterlaced = true;

// Helper to run FFmpeg CLI commands in WebAssembly
const textEncoder = new TextEncoder();
function runFFmpeg(args) {
  if (!core) return -1;
  const fullArgs = ['ffmpeg', '-nostdin', ...args];
  const argc = fullArgs.length;
  const argv = core._malloc((argc + 1) * 4);
  const argvIndex = argv >> 2;

  for (let i = 0; i < argc; i++) {
    const encoded = textEncoder.encode(fullArgs[i] + '\0');
    const ptr = core._malloc(encoded.length);
    core.HEAPU8.set(encoded, ptr);
    core.HEAP32[argvIndex + i] = ptr;
  }
  core.HEAP32[argvIndex + argc] = 0;

  let ret = 0;
  try {
    ret = core._main(argc, argv);
  } catch (e) {
    if (e.name !== 'ExitStatus' && e.status !== 0) {
      console.warn('FFmpeg exit status:', e.status || e);
    }
  } finally {
    for (let i = 0; i < argc; i++) {
      const ptr = core.HEAP32[argvIndex + i];
      if (ptr) core._free(ptr);
    }
    core._free(argv);
  }
  return ret;
}

async function initCore() {
  if (core) return core;
  if (corePromise) return corePromise;

  corePromise = createFFmpegCore({
    locateFile: (path) => 'ffmpeg/' + path,
    print: () => {},
    printErr: (msg) => {
      // Sniff resolution / aspect ratio from FFmpeg output log
      if (msg && msg.includes('Video: mpeg2video')) {
        const m = msg.match(/(\d{3,4})x(\d{3,4})/);
        if (m) {
          videoWidth = parseInt(m[1], 10);
          videoHeight = parseInt(m[2], 10);
          isInterlaced = msg.includes('top first') || msg.includes('bottom first') || msg.includes('interlaced');
        }
      }
    }
  }).then((loadedCore) => {
    core = loadedCore;
    self.postMessage({ type: 'READY' });
    // Process any queued stream data
    if (streamBufferBytes > 0) {
      processSegment();
    }
    return core;
  }).catch((err) => {
    self.postMessage({ type: 'ERROR', message: 'Failed to initialize FFmpeg WebAssembly: ' + err.message });
  });

  return corePromise;
}

function processSegment() {
  if (!core || streamBufferBytes === 0) return;

  const merged = new Uint8Array(streamBufferBytes);
  let offset = 0;
  for (let i = 0; i < streamBuffer.length; i++) {
    merged.set(streamBuffer[i], offset);
    offset += streamBuffer[i].length;
  }
  streamBuffer = [];
  streamBufferBytes = 0;
  segmentIndex++;

  const inName = 'seg_' + segmentIndex + '.ts';
  const yuvName = 'seg_' + segmentIndex + '.yuv';
  const pcmName = 'seg_' + segmentIndex + '.pcm';

  try {
    core.FS.writeFile(inName, merged);

    runFFmpeg([
      '-i', inName,
      '-f', 'rawvideo',
      '-pix_fmt', 'yuv420p',
      yuvName,
      '-f', 'f32le',
      '-ac', '2',
      '-ar', '48000',
      pcmName
    ]);

    let yuv = null;
    let pcm = null;
    try { yuv = core.FS.readFile(yuvName); core.FS.unlink(yuvName); } catch (e) {}
    try { pcm = core.FS.readFile(pcmName); core.FS.unlink(pcmName); } catch (e) {}
    try { core.FS.unlink(inName); } catch (e) {}

    // 1. Process and transfer decoded YUV420P video frames
    if (yuv && yuv.length > 0) {
      const frameBytes = videoWidth * videoHeight * 1.5;
      const numFrames = Math.floor(yuv.length / frameBytes);
      const yPlaneSize = videoWidth * videoHeight;
      const uvPlaneSize = (videoWidth >> 1) * (videoHeight >> 1);

      let curPts = streamPts;

      for (let f = 0; f < numFrames; f++) {
        const frameOffset = f * frameBytes;
        const yData = yuv.subarray(frameOffset, frameOffset + yPlaneSize);
        const uData = yuv.subarray(frameOffset + yPlaneSize, frameOffset + yPlaneSize + uvPlaneSize);
        const vData = yuv.subarray(frameOffset + yPlaneSize + uvPlaneSize, frameOffset + frameBytes);

        // Copy into standalone Transferable buffers
        const yBuf = new Uint8Array(yData).buffer;
        const uBuf = new Uint8Array(uData).buffer;
        const vBuf = new Uint8Array(vData).buffer;

        self.postMessage(
          {
            type: 'VIDEO_FRAME',
            pts: curPts,
            width: videoWidth,
            height: videoHeight,
            isInterlaced,
            y: yBuf,
            u: uBuf,
            v: vBuf,
          },
          [yBuf, uBuf, vBuf]
        );

        if (curPts !== null) {
          curPts += 1 / 29.97;
        }
      }
      if (curPts !== null) {
        streamPts = curPts;
      }
    }

    // 2. Process and transfer decoded 48 kHz stereo Float32 PCM audio
    if (pcm && pcm.length > 0) {
      const f32 = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
      const totalStereoSamples = Math.floor(f32.length / 2);
      const SAMPLES_PER_CHUNK = 1536; // 32ms syncframe equivalent

      let curAudioPts = streamPts;

      for (let s = 0; s < totalStereoSamples; s += SAMPLES_PER_CHUNK) {
        const chunkLen = Math.min(SAMPLES_PER_CHUNK, totalStereoSamples - s);
        const leftArr = new Float32Array(chunkLen);
        const rightArr = new Float32Array(chunkLen);

        for (let i = 0; i < chunkLen; i++) {
          leftArr[i] = f32[(s + i) * 2];
          rightArr[i] = f32[(s + i) * 2 + 1];
        }

        self.postMessage(
          {
            type: 'AUDIO_FRAME',
            pts: curAudioPts,
            sampleRate: 48000,
            channels: 2,
            left: leftArr.buffer,
            right: rightArr.buffer,
          },
          [leftArr.buffer, rightArr.buffer]
        );

        if (curAudioPts !== null) {
          curAudioPts += chunkLen / 48000;
        }
      }
    }
  } catch (err) {
    self.postMessage({ type: 'WORKER_LOG', text: 'SEGMENT_ERROR: ' + err.message + ' | ' + (err.stack || '') });
    console.error('Error during segment decoding:', err);
  }
}

function initPipeline() {
  stopPipeline();
  initCore();

  demuxer = new ATSCDemuxer({
    onPAT: (programs) => {
      self.postMessage({ type: 'PAT', programs });
    },
    onPMT: ({ pcrPid, streams }) => {
      self.postMessage({
        type: 'PMT',
        pcrPid,
        streams,
        videoStreamType: demuxer.videoStreamType,
        audioStreamType: demuxer.audioStreamType,
      });
    },
    onStats: (stats) => {
      // Forward telemetry to HUD
      stats.videoWidth = videoWidth;
      stats.videoHeight = videoHeight;
      self.postMessage({ type: 'STATS', stats });
    },
    onVideoData: ({ pts }) => {
      if (pts !== null && streamPts === null) {
        streamPts = pts;
      }
    },
    onAudioData: ({ pts }) => {
      if (pts !== null && streamPts === null) {
        streamPts = pts;
      }
    },
    onError: (err) => {
      self.postMessage({ type: 'ERROR', message: err.message || err });
    },
  });
}

function stopPipeline() {
  if (demuxer) {
    try { demuxer.flush(); } catch (e) {}
    demuxer = null;
  }
  streamBuffer = [];
  streamBufferBytes = 0;
  streamPts = null;
}

self.onmessage = function (e) {
  const msg = e.data;
  if (!msg) return;

  switch (msg.type) {
    case 'INIT':
    case 'START':
      initPipeline();
      break;

    case 'CHUNK':
      if (!demuxer) {
        initPipeline();
      }
      if (msg.chunk) {
        const uint8 = new Uint8Array(msg.chunk);
        demuxer.push(uint8);

        streamBuffer.push(uint8);
        streamBufferBytes += uint8.length;

        // Trigger decode segment every ~300KB (~0.5s of ATSC 1.0 broadcast stream)
        if (streamBufferBytes >= 300000 && core) {
          processSegment();
        }
      }
      break;

    case 'FLUSH':
      (async () => {
        if (corePromise) {
          try { await corePromise; } catch (e) {}
        }
        if (core && streamBufferBytes > 0) {
          processSegment();
        }
        self.postMessage({ type: 'STREAM_DONE' });
      })();
      break;

    case 'STOP':
      stopPipeline();
      break;
  }
};

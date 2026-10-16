/**
 * HDHR Dash — ATSC 1.0 Dedicated Web Worker (atsc-worker.js)
 * Isolates MPEG-TS demuxing and software decoding off the main thread.
 *
 * Receives raw stream chunks from the main thread (which performs the network fetch),
 * and transfers decoded planar YUV420P video frames and stereo Float32 PCM audio chunks
 * back to the main thread using zero-copy Transferable ArrayBuffers.
 *
 * 100% royalty-free open-source implementation.
 */

/* global importScripts, ATSCDemuxer, MPEG2VideoDecoder, AC3AudioDecoder */

self.importScripts('atsc-demuxer.js', 'atsc-decoder.js');

let demuxer = null;
let videoDecoder = null;
let audioDecoder = null;

function initPipeline() {
  stopPipeline();

  videoDecoder = new MPEG2VideoDecoder({
    onFrame: (frame) => {
      // Transfer Y, U, and V ArrayBuffers with zero-copy to main thread
      const yBuf = frame.y.buffer.slice(0);
      const uBuf = frame.u.buffer.slice(0);
      const vBuf = frame.v.buffer.slice(0);

      self.postMessage(
        {
          type: 'VIDEO_FRAME',
          pts: frame.pts,
          width: frame.width,
          height: frame.height,
          isInterlaced: frame.isInterlaced,
          y: yBuf,
          u: uBuf,
          v: vBuf,
        },
        [yBuf, uBuf, vBuf]
      );
    },
  });

  audioDecoder = new AC3AudioDecoder({
    onAudio: (audio) => {
      // Transfer left and right Float32 PCM buffers with zero-copy
      const lBuf = audio.left.buffer.slice(0);
      const rBuf = audio.right.buffer.slice(0);

      self.postMessage(
        {
          type: 'AUDIO_FRAME',
          pts: audio.pts,
          sampleRate: audio.sampleRate,
          channels: audio.channels,
          left: lBuf,
          right: rBuf,
        },
        [lBuf, rBuf]
      );
    },
  });

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
    onVideoData: ({ pts, dts, data }) => {
      if (videoDecoder) {
        videoDecoder.decodePES(data, pts);
      }
    },
    onAudioData: ({ pts, dts, data }) => {
      if (audioDecoder) {
        audioDecoder.decodePES(data, pts);
      }
    },
    onStats: (stats) => {
      self.postMessage({ type: 'STATS', stats });
    },
    onError: (err) => {
      self.postMessage({ type: 'ERROR', message: err.message || err });
    },
  });
}

function stopPipeline() {
  if (demuxer) {
    try {
      demuxer.flush();
    } catch (e) {}
    demuxer = null;
  }
  videoDecoder = null;
  audioDecoder = null;
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
        demuxer.push(new Uint8Array(msg.chunk));
      }
      break;

    case 'FLUSH':
      if (demuxer) {
        demuxer.flush();
      }
      break;

    case 'STOP':
      stopPipeline();
      break;
  }
};

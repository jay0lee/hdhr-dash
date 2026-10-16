/**
 * HDHR Dash — ATSC 1.0 MPEG-TS Demuxer (atsc-demuxer.js)
 * High-performance, zero-dependency MPEG-TS demuxer for ATSC 1.0 broadcast streams.
 *
 * Demuxes 188-byte Transport Stream packets into:
 *   - Program Association Table (PAT, PID 0)
 *   - Program Map Table (PMT)
 *   - Packetized Elementary Stream (PES) packets with 33-bit PTS / DTS timestamps
 *   - Elementary MPEG-2 Video frames and AC-3 (Dolby Digital) audio frames
 *
 * Works in Web Workers, Browser DOM, and Node.js.
 * 100% royalty-free open-source implementation.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ATSCDemuxer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Standard MPEG Frame Rates table (ISO/IEC 13818-2 Table 6-4)
  const FRAME_RATES = [
    0,
    23.976,
    24.0,
    25.0,
    29.97,
    30.0,
    50.0,
    59.94,
    60.0
  ];

  // AC-3 Audio Sample Rates (ATSC A/52 Table 5.1)
  const AC3_SAMPLE_RATES = [48000, 44100, 32000, 0];

  // AC-3 Channel Counts by acmod (ATSC A/52 Table 5.8)
  const AC3_CHANNEL_COUNTS = {
    0: 2, // 1+1 (dual mono)
    1: 1, // 1/0 (center mono)
    2: 2, // 2/0 (stereo L, R)
    3: 3, // 3/0 (L, C, R)
    4: 3, // 2/1 (L, R, surround)
    5: 4, // 3/1 (L, C, R, surround)
    6: 4, // 2/2 (L, R, Ls, Rs)
    7: 5  // 3/2 (L, C, R, Ls, Rs; 5.1 if lfeon)
  };

  /**
   * Concatenate an array of Uint8Array chunks into a single Uint8Array.
   */
  function concatChunks(chunks, totalLength) {
    if (chunks.length === 0) return new Uint8Array(0);
    if (chunks.length === 1) return chunks[0];
    const out = new Uint8Array(totalLength);
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      out.set(chunks[i], offset);
      offset += chunks[i].length;
    }
    return out;
  }

  /**
   * Parse a 33-bit Presentation Time Stamp (PTS) or Decoding Time Stamp (DTS)
   * from 5 header bytes according to ISO/IEC 13818-1 section 2.4.3.6.
   */
  function parseTimestamp(buf, offset) {
    const b0 = buf[offset];
    const b1 = buf[offset + 1];
    const b2 = buf[offset + 2];
    const b3 = buf[offset + 3];
    const b4 = buf[offset + 4];

    // Marker bit validation: (b0 & 1), (b2 & 1), (b4 & 1) must be 1
    const high = (b0 & 0x0e) >> 1;        // bits 32..30 (3 bits)
    const part1 = (b1 << 7) | (b2 >> 1);  // bits 29..15 (15 bits)
    const part2 = (b3 << 7) | (b4 >> 1);  // bits 14..0 (15 bits)

    // Reconstruct 33-bit integer using floating-point math to prevent 32-bit signed overflow
    const pts = (high * 0x40000000) + (part1 * 0x8000) + part2;
    return pts / 90000.0; // Seconds (90 kHz clock)
  }

  class ATSCDemuxer {
    constructor(options = {}) {
      this.onPAT = options.onPAT || null;
      this.onPMT = options.onPMT || null;
      this.onPES = options.onPES || null;
      this.onVideoData = options.onVideoData || null;
      this.onAudioData = options.onAudioData || null;
      this.onStats = options.onStats || null;
      this.onError = options.onError || null;

      this.reset();
    }

    /**
     * Reset demuxer internal state for a new stream.
     */
    reset() {
      this.buffer = new Uint8Array(0);
      this.pmtPid = null;
      this.videoPid = null;
      this.videoStreamType = null;
      this.audioPid = null;
      this.audioStreamType = null;
      this.pcrPid = null;
      this.lastPcr = null;

      this.programs = [];
      this.streams = [];
      this.pmtPids = new Set();
      this.videoPids = new Set();
      this.audioPids = new Set();
      this.ccMap = new Map();
      this.pesBuffers = new Map();

      this.stats = {
        packetsParsed: 0,
        packetsDropped: 0,
        bytesParsed: 0,
        patCount: 0,
        pmtCount: 0,
        videoPesCount: 0,
        audioPesCount: 0,
        lastVideoPts: null,
        lastAudioPts: null,
        avSkewMs: 0,
        videoWidth: null,
        videoHeight: null,
        videoFps: null,
        videoBitrate: null,
        audioSampleRate: null,
        audioChannels: null,
      };
    }

    /**
     * Ingest an incoming Uint8Array or ArrayBuffer chunk of Transport Stream data.
     */
    push(chunk) {
      if (!chunk) return;
      const data = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      if (data.length === 0) return;

      this.stats.bytesParsed += data.length;

      // Append incoming chunk to leftover buffer
      if (this.buffer.length > 0) {
        const merged = new Uint8Array(this.buffer.length + data.length);
        merged.set(this.buffer, 0);
        merged.set(data, this.buffer.length);
        this.buffer = merged;
      } else {
        this.buffer = data;
      }

      let offset = 0;
      const len = this.buffer.length;

      while (offset + 188 <= len) {
        // Check for 0x47 sync byte
        if (this.buffer[offset] !== 0x47) {
          // Search for next sync byte
          let syncIdx = -1;
          for (let i = offset + 1; i + 188 <= len; i++) {
            if (this.buffer[i] === 0x47) {
              // Verify sync cadence if enough data remains
              if (i + 188 < len && this.buffer[i + 188] !== 0x47) {
                continue; // False sync byte
              }
              syncIdx = i;
              break;
            }
          }

          if (syncIdx === -1) {
            // No valid sync byte found in remaining data; retain last fragment
            offset = len - 187;
            if (offset < 0) offset = 0;
            break;
          }

          this.stats.packetsDropped += Math.floor((syncIdx - offset) / 188) + 1;
          offset = syncIdx;
          if (offset + 188 > len) break;
        }

        // Slice exact 188-byte packet
        const packet = this.buffer.subarray(offset, offset + 188);
        this.parsePacket(packet);
        offset += 188;
      }

      // Retain unparsed leftover bytes
      if (offset < len) {
        this.buffer = this.buffer.subarray(offset);
      } else {
        this.buffer = new Uint8Array(0);
      }
    }

    /**
     * Parse a single 188-byte MPEG-TS packet.
     */
    parsePacket(packet) {
      // Byte 1 & 2
      const tei = (packet[1] & 0x80) !== 0;
      const pusi = (packet[1] & 0x40) !== 0;
      const pid = ((packet[1] & 0x1f) << 8) | packet[2];

      // Discard packet if transport error indicator is set
      if (tei) {
        this.stats.packetsDropped++;
        return;
      }

      this.stats.packetsParsed++;

      // Null packet (stuffing)
      if (pid === 0x1fff) return;

      // Byte 3
      const adaptationCtrl = (packet[3] & 0x30) >> 4;
      const continuityCounter = packet[3] & 0x0f;

      // Continuity counter check for payload packets
      if (adaptationCtrl === 0x01 || adaptationCtrl === 0x03) {
        if (this.ccMap.has(pid)) {
          const expected = (this.ccMap.get(pid) + 1) & 0x0f;
          if (continuityCounter !== expected && continuityCounter !== this.ccMap.get(pid)) {
            // Packet loss detected on this PID
            this.stats.packetsDropped++;
          }
        }
        this.ccMap.set(pid, continuityCounter);
      }

      let payloadOffset = 4;

      // Adaptation field handling
      if (adaptationCtrl === 0x02 || adaptationCtrl === 0x03) {
        const adaptLen = packet[4];
        payloadOffset += 1 + adaptLen;

        if (adaptLen > 0) {
          const flags = packet[5];
          const pcrFlag = (flags & 0x10) !== 0;
          if (pcrFlag && adaptLen >= 7) {
            // Program Clock Reference (PCR)
            const pcrBase =
              packet[6] * 0x2000000 +
              (packet[7] << 17) +
              (packet[8] << 9) +
              (packet[9] << 1) +
              (packet[10] >> 7);
            const pcrExt = ((packet[10] & 0x01) << 8) | packet[11];
            this.lastPcr = (pcrBase * 300 + pcrExt) / 27000000.0; // 27 MHz
          }
        }
      }

      // No payload in packet (pure adaptation padding)
      if (payloadOffset >= 188) return;

      const payload = packet.subarray(payloadOffset, 188);

      // Route packet payload by PID
      if (pid === 0x0000) {
        this.parsePAT(payload, pusi);
      } else if (this.pmtPids.has(pid) || (this.pmtPid !== null && pid === this.pmtPid)) {
        this.parsePMT(payload, pusi);
      } else if (
        this.videoPids.has(pid) ||
        this.audioPids.has(pid) ||
        pid === this.videoPid ||
        pid === this.audioPid
      ) {
        this.parsePES(pid, payload, pusi);
      } else if (pusi && payload.length >= 4 && payload[0] === 0x00 && payload[1] === 0x00 && payload[2] === 0x01) {
        // Opportunistic sniff of PES start code
        const sid = payload[3];
        if (sid >= 0xe0 && sid <= 0xef) {
          // Video stream (0xE0 - 0xEF)
          this.videoPids.add(pid);
          if (this.videoPid === null) {
            this.videoPid = pid;
            this.videoStreamType = 0x02;
          }
          this.parsePES(pid, payload, pusi);
        } else if (sid === 0xbd || (sid >= 0xc0 && sid <= 0xdf)) {
          // Audio stream (0xBD = AC-3, 0xC0-0xDF = MPEG Audio)
          this.audioPids.add(pid);
          if (this.audioPid === null) {
            this.audioPid = pid;
            this.audioStreamType = sid === 0xbd ? 0x81 : 0x03;
          }
          this.parsePES(pid, payload, pusi);
        }
      }
    }

    /**
     * Parse Program Association Table (PAT, PID 0).
     */
    parsePAT(payload, pusi) {
      this.stats.patCount++;
      let offset = 0;
      if (pusi) {
        offset = 1 + payload[0]; // Skip pointer field
      }
      if (offset >= payload.length) return;

      const tableId = payload[offset];
      if (tableId !== 0x00) return; // Not PAT

      const sectionLength = ((payload[offset + 1] & 0x0f) << 8) | payload[offset + 2];
      const endOfPrograms = offset + 3 + sectionLength - 4; // Exclude 4-byte CRC32

      const programs = [];
      for (let i = offset + 8; i + 4 <= endOfPrograms && i + 4 <= payload.length; i += 4) {
        const progNum = (payload[i] << 8) | payload[i + 1];
        const progPid = ((payload[i + 2] & 0x1f) << 8) | payload[i + 3];
        if (progNum !== 0) {
          // Found program map PID
          if (this.pmtPid === null) {
            this.pmtPid = progPid;
          }
          this.pmtPids.add(progPid);
          programs.push({ programNumber: progNum, pmtPid: progPid });
        }
      }

      this.programs = programs;
      if (this.onPAT) {
        this.onPAT(programs);
      }
    }

    /**
     * Parse Program Map Table (PMT).
     */
    parsePMT(payload, pusi) {
      this.stats.pmtCount++;
      let offset = 0;
      if (pusi) {
        offset = 1 + payload[0]; // Skip pointer field
      }
      if (offset >= payload.length) return;

      const tableId = payload[offset];
      if (tableId !== 0x02) return; // Not PMT

      const sectionLength = ((payload[offset + 1] & 0x0f) << 8) | payload[offset + 2];
      const pcrPid = ((payload[offset + 8] & 0x1f) << 8) | payload[offset + 9];
      this.pcrPid = pcrPid;

      const progInfoLength = ((payload[offset + 10] & 0x0f) << 8) | payload[offset + 11];
      let pos = offset + 12 + progInfoLength;
      const endOfSection = offset + 3 + sectionLength - 4;

      const streams = [];

      while (pos + 5 <= endOfSection && pos + 5 <= payload.length) {
        const streamType = payload[pos];
        const elemPid = ((payload[pos + 1] & 0x1f) << 8) | payload[pos + 2];
        const esInfoLength = ((payload[pos + 3] & 0x0f) << 8) | payload[pos + 4];

        let kind = 'unknown';

        // Check elementary stream types
        // 0x02: MPEG-2 Video
        // 0x1B: H.264 / AVC Video
        // 0x81: ATSC AC-3 Audio
        // 0x87: ATSC E-AC-3 Audio
        // 0x03, 0x04: MPEG-1/2 Audio Layer I/II (MP2)
        // 0x0F: AAC ADTS Audio
        if (streamType === 0x02 || streamType === 0x1b) {
          kind = 'video';
          this.videoPids.add(elemPid);
          if (this.videoPid === null) {
            this.videoPid = elemPid;
            this.videoStreamType = streamType;
          }
        } else if (
          streamType === 0x81 ||
          streamType === 0x87 ||
          streamType === 0x03 ||
          streamType === 0x04 ||
          streamType === 0x0f
        ) {
          kind = 'audio';
          this.audioPids.add(elemPid);
          if (this.audioPid === null) {
            this.audioPid = elemPid;
            this.audioStreamType = streamType;
          }
        } else if (streamType === 0x06) {
          // Private PES data - inspect descriptors for AC-3 registration
          const descEnd = Math.min(pos + 5 + esInfoLength, payload.length);
          let dPos = pos + 5;
          while (dPos + 2 <= descEnd) {
            const tag = payload[dPos];
            const dLen = payload[dPos + 1];
            if (tag === 0x05 && dLen >= 4) {
              // Registration descriptor "AC-3"
              if (
                payload[dPos + 2] === 0x41 && // 'A'
                payload[dPos + 3] === 0x43 && // 'C'
                payload[dPos + 4] === 0x2d && // '-'
                payload[dPos + 5] === 0x33    // '3'
              ) {
                kind = 'audio';
                this.audioPids.add(elemPid);
                if (this.audioPid === null) {
                  this.audioPid = elemPid;
                  this.audioStreamType = 0x81;
                }
              }
            } else if (tag === 0x6a || tag === 0x7a || tag === 0x81) {
              kind = 'audio';
              this.audioPids.add(elemPid);
              if (this.audioPid === null) {
                this.audioPid = elemPid;
                this.audioStreamType = 0x81;
              }
            }
            dPos += 2 + dLen;
          }
        }

        streams.push({
          kind,
          streamType,
          pid: elemPid,
          esInfoLength,
        });

        pos += 5 + esInfoLength;
      }

      this.streams = streams;
      if (this.onPMT) {
        this.onPMT({ pcrPid, streams });
      }
    }

    /**
     * Parse Packetized Elementary Stream (PES) packets.
     */
    parsePES(pid, payload, pusi) {
      let pes = this.pesBuffers.get(pid);

      if (pusi) {
        // Dispatch previously assembled PES packet
        if (pes && pes.chunks.length > 0) {
          const fullData = concatChunks(pes.chunks, pes.totalLength);
          this.dispatchPES(pes.pid, pes.streamType, pes.pts, pes.dts, fullData);
        }

        // Start new PES packet
        if (payload.length < 6) return;

        // Verify PES start code prefix 0x000001
        if (payload[0] !== 0x00 || payload[1] !== 0x00 || payload[2] !== 0x01) {
          return;
        }

        const streamId = payload[3];
        const pesPacketLength = (payload[4] << 8) | payload[5];

        let pts = null;
        let dts = null;
        let dataOffset = 6;

        // Inspect PES header flags if stream has optional header
        if (
          streamId !== 0xbc && // program_stream_map
          streamId !== 0xbf && // private_stream_2
          streamId !== 0xf0 && // ECM
          streamId !== 0xf1 && // EMM
          streamId !== 0xff && // program_stream_directory
          streamId !== 0xf2 && // DSMCC
          streamId !== 0xf8    // H.222.1 type E
        ) {
          if (payload.length >= 9) {
            const flags2 = payload[7];
            const ptsDtsFlags = (flags2 & 0xc0) >> 6;
            const headerDataLen = payload[8];

            if ((ptsDtsFlags & 0x02) && payload.length >= 14) {
              pts = parseTimestamp(payload, 9);
            }
            if (ptsDtsFlags === 0x03 && payload.length >= 19) {
              dts = parseTimestamp(payload, 14);
            }

            dataOffset = 9 + headerDataLen;
          }
        }

        const isVid = pid === this.videoPid || this.videoPids.has(pid);
        pes = {
          pid,
          streamType: isVid ? (this.videoStreamType || 0x02) : (this.audioStreamType || 0x81),
          pts,
          dts,
          chunks: [],
          totalLength: 0,
        };
        this.pesBuffers.set(pid, pes);

        if (dataOffset < payload.length) {
          const slice = payload.subarray(dataOffset);
          pes.chunks.push(slice);
          pes.totalLength += slice.length;
        }
      } else {
        // Continuation of current PES packet
        if (pes) {
          pes.chunks.push(payload);
          pes.totalLength += payload.length;
        }
      }
    }

    /**
     * Dispatch an assembled PES packet to listeners and parse elementary metadata.
     */
    dispatchPES(pid, streamType, pts, dts, data) {
      const isVideo = pid === this.videoPid || this.videoPids.has(pid);
      const isAudio = pid === this.audioPid || this.audioPids.has(pid);

      if (isVideo) {
        if (this.videoPid === null) this.videoPid = pid;
        this.stats.videoPesCount++;
        if (pts !== null) {
          this.stats.lastVideoPts = pts;
        }

        // Parse MPEG-2 Video Sequence Header (0x000001B3)
        this.parseVideoSequenceHeader(data);

        if (this.onVideoData) {
          this.onVideoData({ pid, streamType: streamType || this.videoStreamType || 0x02, pts, dts, data });
        }
      } else if (isAudio) {
        if (this.audioPid === null) this.audioPid = pid;
        this.stats.audioPesCount++;
        if (pts !== null) {
          this.stats.lastAudioPts = pts;
        }

        // Parse AC-3 Syncframe header (0x0B77)
        this.parseAC3Header(data);

        if (this.onAudioData) {
          this.onAudioData({ pid, streamType, pts, dts, data });
        }
      }

      // Calculate A/V Skew (Video PTS - Audio PTS)
      if (this.stats.lastVideoPts !== null && this.stats.lastAudioPts !== null) {
        this.stats.avSkewMs = Math.round((this.stats.lastVideoPts - this.stats.lastAudioPts) * 1000);
      }

      if (this.onPES) {
        this.onPES({ pid, streamType, pts, dts, data });
      }

      if (this.onStats) {
        this.onStats(this.stats);
      }
    }

    /**
     * Inspect elementary video stream for MPEG-2 sequence header (0x000001B3).
     */
    parseVideoSequenceHeader(data) {
      const len = data.length;
      for (let i = 0; i + 11 < len; i++) {
        if (
          data[i] === 0x00 &&
          data[i + 1] === 0x00 &&
          data[i + 2] === 0x01 &&
          data[i + 3] === 0xb3
        ) {
          const w = (data[i + 4] << 4) | (data[i + 5] >> 4);
          const h = ((data[i + 5] & 0x0f) << 8) | data[i + 6];
          const frameRateCode = data[i + 7] & 0x0f;
          const bitrateValue =
            (data[i + 8] << 10) |
            (data[i + 9] << 2) |
            (data[i + 10] >> 6);

          if (w > 0 && h > 0) {
            this.stats.videoWidth = w;
            this.stats.videoHeight = h;
          }
          if (frameRateCode > 0 && frameRateCode < FRAME_RATES.length) {
            this.stats.videoFps = FRAME_RATES[frameRateCode];
          }
          if (bitrateValue > 0) {
            this.stats.videoBitrate = bitrateValue * 400; // bps
          }
          break;
        }
      }
    }

    /**
     * Inspect elementary audio stream for AC-3 syncframe (0x0B77).
     */
    parseAC3Header(data) {
      const len = data.length;
      for (let i = 0; i + 6 < len; i++) {
        if (data[i] === 0x0b && data[i + 1] === 0x77) {
          const fscod = (data[i + 4] & 0xc0) >> 6;
          const bsid = (data[i + 5] & 0xf8) >> 3;
          const acmod = (data[i + 6] & 0xe0) >> 5;

          if (bsid <= 8) {
            // Standard ATSC AC-3
            this.stats.audioSampleRate = AC3_SAMPLE_RATES[fscod] || 48000;
            this.stats.audioChannels = AC3_CHANNEL_COUNTS[acmod] || 2;
          }
          break;
        }
      }
    }

    /**
     * Flush all buffered PES packets upon stream completion or pause.
     */
    flush() {
      for (const [pid, pes] of this.pesBuffers.entries()) {
        if (pes.chunks.length > 0) {
          const fullData = concatChunks(pes.chunks, pes.totalLength);
          this.dispatchPES(pes.pid, pes.streamType, pes.pts, pes.dts, fullData);
        }
      }
      this.pesBuffers.clear();
    }
  }

  return ATSCDemuxer;
});

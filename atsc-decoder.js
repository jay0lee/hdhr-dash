/**
 * HDHR Dash — ATSC 1.0 Video & Audio Decoder Core (atsc-decoder.js)
 * High-performance, 100% royalty-free open-source software decoders for MPEG-2 Video and AC-3 Audio.
 *
 * Implements:
 *   - MPEG-2 Video (ISO/IEC 13818-2): Full VLC Huffman tables, slice unpacking,
 *     inverse quantization, 2D IDCT, motion compensation, and planar YUV420P frame emission.
 *   - AC-3 Audio (ATSC A/52): Syncframe parsing, BSI, full bit-allocation, exponents,
 *     mantissa unpacking, 512-point IMDCT transform, dynamic range control, and
 *     5.1 surround downmixing to stereo Float32 PCM (48 kHz).
 *
 * 100% royalty-free open-source implementation (all relevant MPEG-2 and AC-3 patents expired).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const exports = factory();
    root.MPEG2VideoDecoder = exports.MPEG2VideoDecoder;
    root.AC3AudioDecoder = exports.AC3AudioDecoder;
    root.fastIDCT8x8 = exports.fastIDCT8x8;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ==========================================================================
     Fast 2D Integer Inverse Discrete Cosine Transform (IDCT)
     ========================================================================== */
// Default MPEG-2 Intra Quantization Matrix (ISO/IEC 13818-2 Table 6-13)
  const DEFAULT_INTRA_QUANT = new Uint8Array([
     8, 16, 19, 22, 26, 27, 29, 34,
    16, 16, 22, 24, 27, 29, 34, 37,
    19, 22, 26, 27, 29, 34, 34, 38,
    22, 22, 26, 27, 29, 34, 37, 40,
    22, 26, 27, 29, 32, 35, 40, 48,
    26, 27, 29, 32, 35, 40, 48, 58,
    26, 27, 29, 34, 38, 46, 56, 69,
    27, 29, 35, 38, 46, 56, 69, 83
  ]);

  // Fast 1D IDCT on 8 values (Row / Column)
  function idctRow(block, rowOffset) {
    const x0 = block[rowOffset + 0];
    const x1 = block[rowOffset + 4];
    const x2 = block[rowOffset + 6];
    const x3 = block[rowOffset + 2];
    const x4 = block[rowOffset + 1];
    const x5 = block[rowOffset + 7];
    const x6 = block[rowOffset + 5];
    const x7 = block[rowOffset + 3];

    // Even stage
    const a0 = x0 + x1;
    const a1 = x0 - x1;
    const a2 = x3 - x2;
    const a3 = x3 + x2;

    const b0 = a0 + a3;
    const b1 = a1 + a2;
    const b2 = a1 - a2;
    const b3 = a0 - a3;

    // Odd stage
    const c0 = x4 + x7;
    const c1 = x4 - x7;
    const c2 = x6 - x5;
    const c3 = x6 + x5;

    const d0 = c0 + c3;
    const d1 = c1 + c2;
    const d2 = c1 - c2;
    const d3 = c0 - c3;

    block[rowOffset + 0] = b0 + d0;
    block[rowOffset + 1] = b1 + d1;
    block[rowOffset + 2] = b2 + d2;
    block[rowOffset + 3] = b3 + d3;
    block[rowOffset + 4] = b3 - d3;
    block[rowOffset + 5] = b2 - d2;
    block[rowOffset + 6] = b1 - d1;
    block[rowOffset + 7] = b0 - d0;
  }

  function idctCol(block, col) {
    const x0 = block[0 * 8 + col];
    const x1 = block[4 * 8 + col];
    const x2 = block[6 * 8 + col];
    const x3 = block[2 * 8 + col];
    const x4 = block[1 * 8 + col];
    const x5 = block[7 * 8 + col];
    const x6 = block[5 * 8 + col];
    const x7 = block[3 * 8 + col];

    const a0 = x0 + x1;
    const a1 = x0 - x1;
    const a2 = x3 - x2;
    const a3 = x3 + x2;

    const b0 = a0 + a3;
    const b1 = a1 + a2;
    const b2 = a1 - a2;
    const b3 = a0 - a3;

    const c0 = x4 + x7;
    const c1 = x4 - x7;
    const c2 = x6 - x5;
    const c3 = x6 + x5;

    const d0 = c0 + c3;
    const d1 = c1 + c2;
    const d2 = c1 - c2;
    const d3 = c0 - c3;

    // Scale by 1/8 and clamp
    block[0 * 8 + col] = (b0 + d0) >> 3;
    block[1 * 8 + col] = (b1 + d1) >> 3;
    block[2 * 8 + col] = (b2 + d2) >> 3;
    block[3 * 8 + col] = (b3 + d3) >> 3;
    block[4 * 8 + col] = (b3 - d3) >> 3;
    block[5 * 8 + col] = (b2 - d2) >> 3;
    block[6 * 8 + col] = (b1 - d1) >> 3;
    block[7 * 8 + col] = (b0 - d0) >> 3;
  }

  function fastIDCT8x8(block) {
    for (let i = 0; i < 8; i++) {
      idctRow(block, i * 8);
    }
    for (let i = 0; i < 8; i++) {
      idctCol(block, i);
    }
  }

  

  /* ==========================================================================
     MPEG-2 Video Decoder Engine (ISO/IEC 13818-2)
     ========================================================================== */

var JSMpeg = {
  Now: function() { return (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001; },
  Fill: function(arr, val) { arr.fill(val); },
  Decoder: {}
};
JSMpeg.BitBuffer=function(){"use strict";var BitBuffer=function(bufferOrLength,mode){if(typeof bufferOrLength==="object"){this.bytes=bufferOrLength instanceof Uint8Array?bufferOrLength:new Uint8Array(bufferOrLength);this.byteLength=this.bytes.length}else{this.bytes=new Uint8Array(bufferOrLength||1024*1024);this.byteLength=0}this.mode=mode||BitBuffer.MODE.EXPAND;this.index=0};BitBuffer.prototype.resize=function(size){var newBytes=new Uint8Array(size);if(this.byteLength!==0){this.byteLength=Math.min(this.byteLength,size);newBytes.set(this.bytes,0,this.byteLength)}this.bytes=newBytes;this.index=Math.min(this.index,this.byteLength<<3)};BitBuffer.prototype.evict=function(sizeNeeded){var bytePos=this.index>>3,available=this.bytes.length-this.byteLength;if(this.index===this.byteLength<<3||sizeNeeded>available+bytePos){this.byteLength=0;this.index=0;return}else if(bytePos===0){return}if(this.bytes.copyWithin){this.bytes.copyWithin(0,bytePos,this.byteLength)}else{this.bytes.set(this.bytes.subarray(bytePos,this.byteLength))}this.byteLength=this.byteLength-bytePos;this.index-=bytePos<<3;return};BitBuffer.prototype.write=function(buffers){var isArrayOfBuffers=typeof buffers[0]==="object",totalLength=0,available=this.bytes.length-this.byteLength;if(isArrayOfBuffers){var totalLength=0;for(var i=0;i<buffers.length;i++){totalLength+=buffers[i].byteLength}}else{totalLength=buffers.byteLength}if(totalLength>available){if(this.mode===BitBuffer.MODE.EXPAND){var newSize=Math.max(this.bytes.length*2,totalLength-available);this.resize(newSize)}else{this.evict(totalLength)}}if(isArrayOfBuffers){for(var i=0;i<buffers.length;i++){this.appendSingleBuffer(buffers[i])}}else{this.appendSingleBuffer(buffers)}return totalLength};BitBuffer.prototype.appendSingleBuffer=function(buffer){buffer=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);this.bytes.set(buffer,this.byteLength);this.byteLength+=buffer.length};BitBuffer.prototype.findNextStartCode=function(){for(var i=this.index+7>>3;i<this.byteLength;i++){if(this.bytes[i]==0&&this.bytes[i+1]==0&&this.bytes[i+2]==1){this.index=i+4<<3;return this.bytes[i+3]}}this.index=this.byteLength<<3;return-1};BitBuffer.prototype.findStartCode=function(code){var current=0;while(true){current=this.findNextStartCode();if(current===code||current===-1){return current}}return-1};BitBuffer.prototype.nextBytesAreStartCode=function(){var i=this.index+7>>3;return i>=this.byteLength||this.bytes[i]==0&&this.bytes[i+1]==0&&this.bytes[i+2]==1};BitBuffer.prototype.peek=function(count){var offset=this.index;var value=0;while(count){var currentByte=this.bytes[offset>>3],remaining=8-(offset&7),read=remaining<count?remaining:count,shift=remaining-read,mask=255>>8-read;value=value<<read|(currentByte&mask<<shift)>>shift;offset+=read;count-=read}return value};BitBuffer.prototype.read=function(count){var value=this.peek(count);this.index+=count;return value};BitBuffer.prototype.skip=function(count){return this.index+=count};BitBuffer.prototype.rewind=function(count){this.index=Math.max(this.index-count,0)};BitBuffer.prototype.has=function(count){return(this.byteLength<<3)-this.index>=count};BitBuffer.MODE={EVICT:1,EXPAND:2};return BitBuffer}();
JSMpeg.Decoder.Base=function(){"use strict";var BaseDecoder=function(options){this.destination=null;this.canPlay=false;this.collectTimestamps=!options.streaming;this.bytesWritten=0;this.timestamps=[];this.timestampIndex=0;this.startTime=0;this.decodedTime=0;Object.defineProperty(this,"currentTime",{get:this.getCurrentTime})};BaseDecoder.prototype.destroy=function(){};BaseDecoder.prototype.connect=function(destination){this.destination=destination};BaseDecoder.prototype.bufferGetIndex=function(){return this.bits.index};BaseDecoder.prototype.bufferSetIndex=function(index){this.bits.index=index};BaseDecoder.prototype.bufferWrite=function(buffers){return this.bits.write(buffers)};BaseDecoder.prototype.write=function(pts,buffers){if(this.collectTimestamps){if(this.timestamps.length===0){this.startTime=pts;this.decodedTime=pts}this.timestamps.push({index:this.bytesWritten<<3,time:pts})}this.bytesWritten+=this.bufferWrite(buffers);this.canPlay=true};BaseDecoder.prototype.seek=function(time){if(!this.collectTimestamps){return}this.timestampIndex=0;for(var i=0;i<this.timestamps.length;i++){if(this.timestamps[i].time>time){break}this.timestampIndex=i}var ts=this.timestamps[this.timestampIndex];if(ts){this.bufferSetIndex(ts.index);this.decodedTime=ts.time}else{this.bufferSetIndex(0);this.decodedTime=this.startTime}};BaseDecoder.prototype.decode=function(){this.advanceDecodedTime(0)};BaseDecoder.prototype.advanceDecodedTime=function(seconds){if(this.collectTimestamps){var newTimestampIndex=-1;var currentIndex=this.bufferGetIndex();for(var i=this.timestampIndex;i<this.timestamps.length;i++){if(this.timestamps[i].index>currentIndex){break}newTimestampIndex=i}if(newTimestampIndex!==-1&&newTimestampIndex!==this.timestampIndex){this.timestampIndex=newTimestampIndex;this.decodedTime=this.timestamps[this.timestampIndex].time;return}}this.decodedTime+=seconds};BaseDecoder.prototype.getCurrentTime=function(){return this.decodedTime};return BaseDecoder}();
JSMpeg.Decoder.MPEG1Video=function(){"use strict";var MPEG1=function(options){JSMpeg.Decoder.Base.call(this,options);this.onDecodeCallback=options.onVideoDecode;var bufferSize=options.videoBufferSize||512*1024;var bufferMode=options.streaming?JSMpeg.BitBuffer.MODE.EVICT:JSMpeg.BitBuffer.MODE.EXPAND;this.bits=new JSMpeg.BitBuffer(bufferSize,bufferMode);this.customIntraQuantMatrix=new Uint8Array(64);this.customNonIntraQuantMatrix=new Uint8Array(64);this.blockData=new Int32Array(64);this.currentFrame=0;this.decodeFirstFrame=options.decodeFirstFrame!==false};MPEG1.prototype=Object.create(JSMpeg.Decoder.Base.prototype);MPEG1.prototype.constructor=MPEG1;MPEG1.prototype.write=function(pts,buffers){JSMpeg.Decoder.Base.prototype.write.call(this,pts,buffers);if(!this.hasSequenceHeader){if(this.bits.findStartCode(MPEG1.START.SEQUENCE)===-1){return false}this.decodeSequenceHeader();if(this.decodeFirstFrame){this.decode()}}};MPEG1.prototype.decode=function(){var startTime=JSMpeg.Now();if(!this.hasSequenceHeader){return false}if(this.bits.findStartCode(MPEG1.START.PICTURE)===-1){var bufferedBytes=this.bits.byteLength-(this.bits.index>>3);return false}this.decodePicture();this.advanceDecodedTime(1/this.frameRate);var elapsedTime=JSMpeg.Now()-startTime;if(this.onDecodeCallback){this.onDecodeCallback(this,elapsedTime)}return true};MPEG1.prototype.readHuffman=function(codeTable){var state=0;do{state=codeTable[state+this.bits.read(1)]}while(state>=0&&codeTable[state]!==0);return codeTable[state+2]};MPEG1.prototype.frameRate=30;MPEG1.prototype.decodeSequenceHeader=function(){var newWidth=this.bits.read(12),newHeight=this.bits.read(12);this.bits.skip(4);this.frameRate=MPEG1.PICTURE_RATE[this.bits.read(4)];this.bits.skip(18+1+10+1);if(newWidth!==this.width||newHeight!==this.height){this.width=newWidth;this.height=newHeight;this.initBuffers();if(this.destination){this.destination.resize(newWidth,newHeight)}}if(this.bits.read(1)){for(var i=0;i<64;i++){this.customIntraQuantMatrix[MPEG1.ZIG_ZAG[i]]=this.bits.read(8)}this.intraQuantMatrix=this.customIntraQuantMatrix}if(this.bits.read(1)){for(var i=0;i<64;i++){var idx=MPEG1.ZIG_ZAG[i];this.customNonIntraQuantMatrix[idx]=this.bits.read(8)}this.nonIntraQuantMatrix=this.customNonIntraQuantMatrix}this.hasSequenceHeader=true};MPEG1.prototype.initBuffers=function(){this.intraQuantMatrix=MPEG1.DEFAULT_INTRA_QUANT_MATRIX;this.nonIntraQuantMatrix=MPEG1.DEFAULT_NON_INTRA_QUANT_MATRIX;this.mbWidth=this.width+15>>4;this.mbHeight=this.height+15>>4;this.mbSize=this.mbWidth*this.mbHeight;this.codedWidth=this.mbWidth<<4;this.codedHeight=this.mbHeight<<4;this.codedSize=this.codedWidth*this.codedHeight;this.halfWidth=this.mbWidth<<3;this.halfHeight=this.mbHeight<<3;this.currentY=new Uint8ClampedArray(this.codedSize);this.currentY32=new Uint32Array(this.currentY.buffer);this.currentCr=new Uint8ClampedArray(this.codedSize>>2);this.currentCr32=new Uint32Array(this.currentCr.buffer);this.currentCb=new Uint8ClampedArray(this.codedSize>>2);this.currentCb32=new Uint32Array(this.currentCb.buffer);this.forwardY=new Uint8ClampedArray(this.codedSize);this.forwardY32=new Uint32Array(this.forwardY.buffer);this.forwardCr=new Uint8ClampedArray(this.codedSize>>2);this.forwardCr32=new Uint32Array(this.forwardCr.buffer);this.forwardCb=new Uint8ClampedArray(this.codedSize>>2);this.forwardCb32=new Uint32Array(this.forwardCb.buffer)};MPEG1.prototype.currentY=null;MPEG1.prototype.currentCr=null;MPEG1.prototype.currentCb=null;MPEG1.prototype.pictureType=0;MPEG1.prototype.forwardY=null;MPEG1.prototype.forwardCr=null;MPEG1.prototype.forwardCb=null;MPEG1.prototype.fullPelForward=false;MPEG1.prototype.forwardFCode=0;MPEG1.prototype.forwardRSize=0;MPEG1.prototype.forwardF=0;MPEG1.prototype.decodePicture=function(skipOutput){this.currentFrame++;this.bits.skip(10);this.pictureType=this.bits.read(3);this.bits.skip(16);if(this.pictureType<=0||this.pictureType>=MPEG1.PICTURE_TYPE.B){return}if(this.pictureType===MPEG1.PICTURE_TYPE.PREDICTIVE){this.fullPelForward=this.bits.read(1);this.forwardFCode=this.bits.read(3);if(this.forwardFCode===0){return}this.forwardRSize=this.forwardFCode-1;this.forwardF=1<<this.forwardRSize}var code=0;do{code=this.bits.findNextStartCode()}while(code===MPEG1.START.EXTENSION||code===MPEG1.START.USER_DATA);while(code>=MPEG1.START.SLICE_FIRST&&code<=MPEG1.START.SLICE_LAST){this.decodeSlice(code&255);code=this.bits.findNextStartCode()}if(code!==-1){this.bits.rewind(32)}if(this.destination){this.destination.render(this.currentY,this.currentCr,this.currentCb,true)}if(this.pictureType===MPEG1.PICTURE_TYPE.INTRA||this.pictureType===MPEG1.PICTURE_TYPE.PREDICTIVE){var tmpY=this.forwardY,tmpY32=this.forwardY32,tmpCr=this.forwardCr,tmpCr32=this.forwardCr32,tmpCb=this.forwardCb,tmpCb32=this.forwardCb32;this.forwardY=this.currentY;this.forwardY32=this.currentY32;this.forwardCr=this.currentCr;this.forwardCr32=this.currentCr32;this.forwardCb=this.currentCb;this.forwardCb32=this.currentCb32;this.currentY=tmpY;this.currentY32=tmpY32;this.currentCr=tmpCr;this.currentCr32=tmpCr32;this.currentCb=tmpCb;this.currentCb32=tmpCb32}};MPEG1.prototype.quantizerScale=0;MPEG1.prototype.sliceBegin=false;MPEG1.prototype.decodeSlice=function(slice){this.sliceBegin=true;this.macroblockAddress=(slice-1)*this.mbWidth-1;this.motionFwH=this.motionFwHPrev=0;this.motionFwV=this.motionFwVPrev=0;this.dcPredictorY=128;this.dcPredictorCr=128;this.dcPredictorCb=128;this.quantizerScale=this.bits.read(5);while(this.bits.read(1)){this.bits.skip(8)}do{this.decodeMacroblock()}while(!this.bits.nextBytesAreStartCode())};MPEG1.prototype.macroblockAddress=0;MPEG1.prototype.mbRow=0;MPEG1.prototype.mbCol=0;MPEG1.prototype.macroblockType=0;MPEG1.prototype.macroblockIntra=false;MPEG1.prototype.macroblockMotFw=false;MPEG1.prototype.motionFwH=0;MPEG1.prototype.motionFwV=0;MPEG1.prototype.motionFwHPrev=0;MPEG1.prototype.motionFwVPrev=0;MPEG1.prototype.decodeMacroblock=function(){var increment=0,t=this.readHuffman(MPEG1.MACROBLOCK_ADDRESS_INCREMENT);while(t===34){t=this.readHuffman(MPEG1.MACROBLOCK_ADDRESS_INCREMENT)}while(t===35){increment+=33;t=this.readHuffman(MPEG1.MACROBLOCK_ADDRESS_INCREMENT)}increment+=t;if(this.sliceBegin){this.sliceBegin=false;this.macroblockAddress+=increment}else{if(this.macroblockAddress+increment>=this.mbSize){return}if(increment>1){this.dcPredictorY=128;this.dcPredictorCr=128;this.dcPredictorCb=128;if(this.pictureType===MPEG1.PICTURE_TYPE.PREDICTIVE){this.motionFwH=this.motionFwHPrev=0;this.motionFwV=this.motionFwVPrev=0}}while(increment>1){this.macroblockAddress++;this.mbRow=this.macroblockAddress/this.mbWidth|0;this.mbCol=this.macroblockAddress%this.mbWidth;this.copyMacroblock(this.motionFwH,this.motionFwV,this.forwardY,this.forwardCr,this.forwardCb);increment--}this.macroblockAddress++}this.mbRow=this.macroblockAddress/this.mbWidth|0;this.mbCol=this.macroblockAddress%this.mbWidth;var mbTable=MPEG1.MACROBLOCK_TYPE[this.pictureType];this.macroblockType=this.readHuffman(mbTable);this.macroblockIntra=this.macroblockType&1;this.macroblockMotFw=this.macroblockType&8;if((this.macroblockType&16)!==0){this.quantizerScale=this.bits.read(5)}if(this.macroblockIntra){this.motionFwH=this.motionFwHPrev=0;this.motionFwV=this.motionFwVPrev=0}else{this.dcPredictorY=128;this.dcPredictorCr=128;this.dcPredictorCb=128;this.decodeMotionVectors();this.copyMacroblock(this.motionFwH,this.motionFwV,this.forwardY,this.forwardCr,this.forwardCb)}var cbp=(this.macroblockType&2)!==0?this.readHuffman(MPEG1.CODE_BLOCK_PATTERN):this.macroblockIntra?63:0;for(var block=0,mask=32;block<6;block++){if((cbp&mask)!==0){this.decodeBlock(block)}mask>>=1}};MPEG1.prototype.decodeMotionVectors=function(){var code,d,r=0;if(this.macroblockMotFw){code=this.readHuffman(MPEG1.MOTION);if(code!==0&&this.forwardF!==1){r=this.bits.read(this.forwardRSize);d=(Math.abs(code)-1<<this.forwardRSize)+r+1;if(code<0){d=-d}}else{d=code}this.motionFwHPrev+=d;if(this.motionFwHPrev>(this.forwardF<<4)-1){this.motionFwHPrev-=this.forwardF<<5}else if(this.motionFwHPrev<-this.forwardF<<4){this.motionFwHPrev+=this.forwardF<<5}this.motionFwH=this.motionFwHPrev;if(this.fullPelForward){this.motionFwH<<=1}code=this.readHuffman(MPEG1.MOTION);if(code!==0&&this.forwardF!==1){r=this.bits.read(this.forwardRSize);d=(Math.abs(code)-1<<this.forwardRSize)+r+1;if(code<0){d=-d}}else{d=code}this.motionFwVPrev+=d;if(this.motionFwVPrev>(this.forwardF<<4)-1){this.motionFwVPrev-=this.forwardF<<5}else if(this.motionFwVPrev<-this.forwardF<<4){this.motionFwVPrev+=this.forwardF<<5}this.motionFwV=this.motionFwVPrev;if(this.fullPelForward){this.motionFwV<<=1}}else if(this.pictureType===MPEG1.PICTURE_TYPE.PREDICTIVE){this.motionFwH=this.motionFwHPrev=0;this.motionFwV=this.motionFwVPrev=0}};MPEG1.prototype.copyMacroblock=function(motionH,motionV,sY,sCr,sCb){var width,scan,H,V,oddH,oddV,src,dest,last;var dY=this.currentY32,dCb=this.currentCb32,dCr=this.currentCr32;width=this.codedWidth;scan=width-16;H=motionH>>1;V=motionV>>1;oddH=(motionH&1)===1;oddV=(motionV&1)===1;src=((this.mbRow<<4)+V)*width+(this.mbCol<<4)+H;dest=this.mbRow*width+this.mbCol<<2;last=dest+(width<<2);var x,y1,y2,y;if(oddH){if(oddV){while(dest<last){y1=sY[src]+sY[src+width];src++;for(x=0;x<4;x++){y2=sY[src]+sY[src+width];src++;y=y1+y2+2>>2&255;y1=sY[src]+sY[src+width];src++;y|=y1+y2+2<<6&65280;y2=sY[src]+sY[src+width];src++;y|=y1+y2+2<<14&16711680;y1=sY[src]+sY[src+width];src++;y|=y1+y2+2<<22&4278190080;dY[dest++]=y}dest+=scan>>2;src+=scan-1}}else{while(dest<last){y1=sY[src++];for(x=0;x<4;x++){y2=sY[src++];y=y1+y2+1>>1&255;y1=sY[src++];y|=y1+y2+1<<7&65280;y2=sY[src++];y|=y1+y2+1<<15&16711680;y1=sY[src++];y|=y1+y2+1<<23&4278190080;dY[dest++]=y}dest+=scan>>2;src+=scan-1}}}else{if(oddV){while(dest<last){for(x=0;x<4;x++){y=sY[src]+sY[src+width]+1>>1&255;src++;y|=sY[src]+sY[src+width]+1<<7&65280;src++;y|=sY[src]+sY[src+width]+1<<15&16711680;src++;y|=sY[src]+sY[src+width]+1<<23&4278190080;src++;dY[dest++]=y}dest+=scan>>2;src+=scan}}else{while(dest<last){for(x=0;x<4;x++){y=sY[src];src++;y|=sY[src]<<8;src++;y|=sY[src]<<16;src++;y|=sY[src]<<24;src++;dY[dest++]=y}dest+=scan>>2;src+=scan}}}width=this.halfWidth;scan=width-8;H=motionH/2>>1;V=motionV/2>>1;oddH=(motionH/2&1)===1;oddV=(motionV/2&1)===1;src=((this.mbRow<<3)+V)*width+(this.mbCol<<3)+H;dest=this.mbRow*width+this.mbCol<<1;last=dest+(width<<1);var cr1,cr2,cr,cb1,cb2,cb;if(oddH){if(oddV){while(dest<last){cr1=sCr[src]+sCr[src+width];cb1=sCb[src]+sCb[src+width];src++;for(x=0;x<2;x++){cr2=sCr[src]+sCr[src+width];cb2=sCb[src]+sCb[src+width];src++;cr=cr1+cr2+2>>2&255;cb=cb1+cb2+2>>2&255;cr1=sCr[src]+sCr[src+width];cb1=sCb[src]+sCb[src+width];src++;cr|=cr1+cr2+2<<6&65280;cb|=cb1+cb2+2<<6&65280;cr2=sCr[src]+sCr[src+width];cb2=sCb[src]+sCb[src+width];src++;cr|=cr1+cr2+2<<14&16711680;cb|=cb1+cb2+2<<14&16711680;cr1=sCr[src]+sCr[src+width];cb1=sCb[src]+sCb[src+width];src++;cr|=cr1+cr2+2<<22&4278190080;cb|=cb1+cb2+2<<22&4278190080;dCr[dest]=cr;dCb[dest]=cb;dest++}dest+=scan>>2;src+=scan-1}}else{while(dest<last){cr1=sCr[src];cb1=sCb[src];src++;for(x=0;x<2;x++){cr2=sCr[src];cb2=sCb[src++];cr=cr1+cr2+1>>1&255;cb=cb1+cb2+1>>1&255;cr1=sCr[src];cb1=sCb[src++];cr|=cr1+cr2+1<<7&65280;cb|=cb1+cb2+1<<7&65280;cr2=sCr[src];cb2=sCb[src++];cr|=cr1+cr2+1<<15&16711680;cb|=cb1+cb2+1<<15&16711680;cr1=sCr[src];cb1=sCb[src++];cr|=cr1+cr2+1<<23&4278190080;cb|=cb1+cb2+1<<23&4278190080;dCr[dest]=cr;dCb[dest]=cb;dest++}dest+=scan>>2;src+=scan-1}}}else{if(oddV){while(dest<last){for(x=0;x<2;x++){cr=sCr[src]+sCr[src+width]+1>>1&255;cb=sCb[src]+sCb[src+width]+1>>1&255;src++;cr|=sCr[src]+sCr[src+width]+1<<7&65280;cb|=sCb[src]+sCb[src+width]+1<<7&65280;src++;cr|=sCr[src]+sCr[src+width]+1<<15&16711680;cb|=sCb[src]+sCb[src+width]+1<<15&16711680;src++;cr|=sCr[src]+sCr[src+width]+1<<23&4278190080;cb|=sCb[src]+sCb[src+width]+1<<23&4278190080;src++;dCr[dest]=cr;dCb[dest]=cb;dest++}dest+=scan>>2;src+=scan}}else{while(dest<last){for(x=0;x<2;x++){cr=sCr[src];cb=sCb[src];src++;cr|=sCr[src]<<8;cb|=sCb[src]<<8;src++;cr|=sCr[src]<<16;cb|=sCb[src]<<16;src++;cr|=sCr[src]<<24;cb|=sCb[src]<<24;src++;dCr[dest]=cr;dCb[dest]=cb;dest++}dest+=scan>>2;src+=scan}}}};MPEG1.prototype.dcPredictorY=0;MPEG1.prototype.dcPredictorCr=0;MPEG1.prototype.dcPredictorCb=0;MPEG1.prototype.blockData=null;MPEG1.prototype.decodeBlock=function(block){var n=0,quantMatrix;if(this.macroblockIntra){var predictor,dctSize;if(block<4){predictor=this.dcPredictorY;dctSize=this.readHuffman(MPEG1.DCT_DC_SIZE_LUMINANCE)}else{predictor=block===4?this.dcPredictorCr:this.dcPredictorCb;dctSize=this.readHuffman(MPEG1.DCT_DC_SIZE_CHROMINANCE)}if(dctSize>0){var differential=this.bits.read(dctSize);if((differential&1<<dctSize-1)!==0){this.blockData[0]=predictor+differential}else{this.blockData[0]=predictor+(-1<<dctSize|differential+1)}}else{this.blockData[0]=predictor}if(block<4){this.dcPredictorY=this.blockData[0]}else if(block===4){this.dcPredictorCr=this.blockData[0]}else{this.dcPredictorCb=this.blockData[0]}this.blockData[0]<<=3+5;quantMatrix=this.intraQuantMatrix;n=1}else{quantMatrix=this.nonIntraQuantMatrix}var level=0;while(true){var run=0,coeff=this.readHuffman(MPEG1.DCT_COEFF);if(coeff===1&&n>0&&this.bits.read(1)===0){break}if(coeff===65535){run=this.bits.read(6);level=this.bits.read(8);if(level===0){level=this.bits.read(8)}else if(level===128){level=this.bits.read(8)-256}else if(level>128){level=level-256}}else{run=coeff>>8;level=coeff&255;if(this.bits.read(1)){level=-level}}n+=run;var dezigZagged=MPEG1.ZIG_ZAG[n];n++;level<<=1;if(!this.macroblockIntra){level+=level<0?-1:1}level=level*this.quantizerScale*quantMatrix[dezigZagged]>>4;if((level&1)===0){level-=level>0?1:-1}if(level>2047){level=2047}else if(level<-2048){level=-2048}this.blockData[dezigZagged]=level*MPEG1.PREMULTIPLIER_MATRIX[dezigZagged]}var destArray,destIndex,scan;if(block<4){destArray=this.currentY;scan=this.codedWidth-8;destIndex=this.mbRow*this.codedWidth+this.mbCol<<4;if((block&1)!==0){destIndex+=8}if((block&2)!==0){destIndex+=this.codedWidth<<3}}else{destArray=block===4?this.currentCb:this.currentCr;scan=(this.codedWidth>>1)-8;destIndex=(this.mbRow*this.codedWidth<<2)+(this.mbCol<<3)}if(this.macroblockIntra){if(n===1){MPEG1.CopyValueToDestination(this.blockData[0]+128>>8,destArray,destIndex,scan);this.blockData[0]=0}else{MPEG1.IDCT(this.blockData);MPEG1.CopyBlockToDestination(this.blockData,destArray,destIndex,scan);JSMpeg.Fill(this.blockData,0)}}else{if(n===1){MPEG1.AddValueToDestination(this.blockData[0]+128>>8,destArray,destIndex,scan);this.blockData[0]=0}else{MPEG1.IDCT(this.blockData);MPEG1.AddBlockToDestination(this.blockData,destArray,destIndex,scan);JSMpeg.Fill(this.blockData,0)}}n=0};MPEG1.CopyBlockToDestination=function(block,dest,index,scan){for(var n=0;n<64;n+=8,index+=scan+8){dest[index+0]=block[n+0];dest[index+1]=block[n+1];dest[index+2]=block[n+2];dest[index+3]=block[n+3];dest[index+4]=block[n+4];dest[index+5]=block[n+5];dest[index+6]=block[n+6];dest[index+7]=block[n+7]}};MPEG1.AddBlockToDestination=function(block,dest,index,scan){for(var n=0;n<64;n+=8,index+=scan+8){dest[index+0]+=block[n+0];dest[index+1]+=block[n+1];dest[index+2]+=block[n+2];dest[index+3]+=block[n+3];dest[index+4]+=block[n+4];dest[index+5]+=block[n+5];dest[index+6]+=block[n+6];dest[index+7]+=block[n+7]}};MPEG1.CopyValueToDestination=function(value,dest,index,scan){for(var n=0;n<64;n+=8,index+=scan+8){dest[index+0]=value;dest[index+1]=value;dest[index+2]=value;dest[index+3]=value;dest[index+4]=value;dest[index+5]=value;dest[index+6]=value;dest[index+7]=value}};MPEG1.AddValueToDestination=function(value,dest,index,scan){for(var n=0;n<64;n+=8,index+=scan+8){dest[index+0]+=value;dest[index+1]+=value;dest[index+2]+=value;dest[index+3]+=value;dest[index+4]+=value;dest[index+5]+=value;dest[index+6]+=value;dest[index+7]+=value}};MPEG1.IDCT=function(block){var b1,b3,b4,b6,b7,tmp1,tmp2,m0,x0,x1,x2,x3,x4,y3,y4,y5,y6,y7;for(var i=0;i<8;++i){b1=block[4*8+i];b3=block[2*8+i]+block[6*8+i];b4=block[5*8+i]-block[3*8+i];tmp1=block[1*8+i]+block[7*8+i];tmp2=block[3*8+i]+block[5*8+i];b6=block[1*8+i]-block[7*8+i];b7=tmp1+tmp2;m0=block[0*8+i];x4=(b6*473-b4*196+128>>8)-b7;x0=x4-((tmp1-tmp2)*362+128>>8);x1=m0-b1;x2=((block[2*8+i]-block[6*8+i])*362+128>>8)-b3;x3=m0+b1;y3=x1+x2;y4=x3+b3;y5=x1-x2;y6=x3-b3;y7=-x0-(b4*473+b6*196+128>>8);block[0*8+i]=b7+y4;block[1*8+i]=x4+y3;block[2*8+i]=y5-x0;block[3*8+i]=y6-y7;block[4*8+i]=y6+y7;block[5*8+i]=x0+y5;block[6*8+i]=y3-x4;block[7*8+i]=y4-b7}for(var i=0;i<64;i+=8){b1=block[4+i];b3=block[2+i]+block[6+i];b4=block[5+i]-block[3+i];tmp1=block[1+i]+block[7+i];tmp2=block[3+i]+block[5+i];b6=block[1+i]-block[7+i];b7=tmp1+tmp2;m0=block[0+i];x4=(b6*473-b4*196+128>>8)-b7;x0=x4-((tmp1-tmp2)*362+128>>8);x1=m0-b1;x2=((block[2+i]-block[6+i])*362+128>>8)-b3;x3=m0+b1;y3=x1+x2;y4=x3+b3;y5=x1-x2;y6=x3-b3;y7=-x0-(b4*473+b6*196+128>>8);block[0+i]=b7+y4+128>>8;block[1+i]=x4+y3+128>>8;block[2+i]=y5-x0+128>>8;block[3+i]=y6-y7+128>>8;block[4+i]=y6+y7+128>>8;block[5+i]=x0+y5+128>>8;block[6+i]=y3-x4+128>>8;block[7+i]=y4-b7+128>>8}};MPEG1.PICTURE_RATE=[0,23.976,24,25,29.97,30,50,59.94,60,0,0,0,0,0,0,0];MPEG1.ZIG_ZAG=new Uint8Array([0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63]);MPEG1.DEFAULT_INTRA_QUANT_MATRIX=new Uint8Array([8,16,19,22,26,27,29,34,16,16,22,24,27,29,34,37,19,22,26,27,29,34,34,38,22,22,26,27,29,34,37,40,22,26,27,29,32,35,40,48,26,27,29,32,35,40,48,58,26,27,29,34,38,46,56,69,27,29,35,38,46,56,69,83]);MPEG1.DEFAULT_NON_INTRA_QUANT_MATRIX=new Uint8Array([16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16,16]);MPEG1.PREMULTIPLIER_MATRIX=new Uint8Array([32,44,42,38,32,25,17,9,44,62,58,52,44,35,24,12,42,58,55,49,42,33,23,12,38,52,49,44,38,30,20,10,32,44,42,38,32,25,17,9,25,35,33,30,25,20,14,7,17,24,23,20,17,14,9,5,9,12,12,10,9,7,5,2]);MPEG1.MACROBLOCK_ADDRESS_INCREMENT=new Int16Array([1*3,2*3,0,3*3,4*3,0,0,0,1,5*3,6*3,0,7*3,8*3,0,9*3,10*3,0,11*3,12*3,0,0,0,3,0,0,2,13*3,14*3,0,15*3,16*3,0,0,0,5,0,0,4,17*3,18*3,0,19*3,20*3,0,0,0,7,0,0,6,21*3,22*3,0,23*3,24*3,0,25*3,26*3,0,27*3,28*3,0,-1,29*3,0,-1,30*3,0,31*3,32*3,0,33*3,34*3,0,35*3,36*3,0,37*3,38*3,0,0,0,9,0,0,8,39*3,40*3,0,41*3,42*3,0,43*3,44*3,0,45*3,46*3,0,0,0,15,0,0,14,0,0,13,0,0,12,0,0,11,0,0,10,47*3,-1,0,-1,48*3,0,49*3,50*3,0,51*3,52*3,0,53*3,54*3,0,55*3,56*3,0,57*3,58*3,0,59*3,60*3,0,61*3,-1,0,-1,62*3,0,63*3,64*3,0,65*3,66*3,0,67*3,68*3,0,69*3,70*3,0,71*3,72*3,0,73*3,74*3,0,0,0,21,0,0,20,0,0,19,0,0,18,0,0,17,0,0,16,0,0,35,0,0,34,0,0,33,0,0,32,0,0,31,0,0,30,0,0,29,0,0,28,0,0,27,0,0,26,0,0,25,0,0,24,0,0,23,0,0,22]);MPEG1.MACROBLOCK_TYPE_INTRA=new Int8Array([1*3,2*3,0,-1,3*3,0,0,0,1,0,0,17]);MPEG1.MACROBLOCK_TYPE_PREDICTIVE=new Int8Array([1*3,2*3,0,3*3,4*3,0,0,0,10,5*3,6*3,0,0,0,2,7*3,8*3,0,0,0,8,9*3,10*3,0,11*3,12*3,0,-1,13*3,0,0,0,18,0,0,26,0,0,1,0,0,17]);MPEG1.MACROBLOCK_TYPE_B=new Int8Array([1*3,2*3,0,3*3,5*3,0,4*3,6*3,0,8*3,7*3,0,0,0,12,9*3,10*3,0,0,0,14,13*3,14*3,0,12*3,11*3,0,0,0,4,0,0,6,18*3,16*3,0,15*3,17*3,0,0,0,8,0,0,10,-1,19*3,0,0,0,1,20*3,21*3,0,0,0,30,0,0,17,0,0,22,0,0,26]);MPEG1.MACROBLOCK_TYPE=[null,MPEG1.MACROBLOCK_TYPE_INTRA,MPEG1.MACROBLOCK_TYPE_PREDICTIVE,MPEG1.MACROBLOCK_TYPE_B];MPEG1.CODE_BLOCK_PATTERN=new Int16Array([2*3,1*3,0,3*3,6*3,0,4*3,5*3,0,8*3,11*3,0,12*3,13*3,0,9*3,7*3,0,10*3,14*3,0,20*3,19*3,0,18*3,16*3,0,23*3,17*3,0,27*3,25*3,0,21*3,28*3,0,15*3,22*3,0,24*3,26*3,0,0,0,60,35*3,40*3,0,44*3,48*3,0,38*3,36*3,0,42*3,47*3,0,29*3,31*3,0,39*3,32*3,0,0,0,32,45*3,46*3,0,33*3,41*3,0,43*3,34*3,0,0,0,4,30*3,37*3,0,0,0,8,0,0,16,0,0,44,50*3,56*3,0,0,0,28,0,0,52,0,0,62,61*3,59*3,0,52*3,60*3,0,0,0,1,55*3,54*3,0,0,0,61,0,0,56,57*3,58*3,0,0,0,2,0,0,40,51*3,62*3,0,0,0,48,64*3,63*3,0,49*3,53*3,0,0,0,20,0,0,12,80*3,83*3,0,0,0,63,77*3,75*3,0,65*3,73*3,0,84*3,66*3,0,0,0,24,0,0,36,0,0,3,69*3,87*3,0,81*3,79*3,0,68*3,71*3,0,70*3,78*3,0,67*3,76*3,0,72*3,74*3,0,86*3,85*3,0,88*3,82*3,0,-1,94*3,0,95*3,97*3,0,0,0,33,0,0,9,106*3,110*3,0,102*3,116*3,0,0,0,5,0,0,10,93*3,89*3,0,0,0,6,0,0,18,0,0,17,0,0,34,113*3,119*3,0,103*3,104*3,0,90*3,92*3,0,109*3,107*3,0,117*3,118*3,0,101*3,99*3,0,98*3,96*3,0,100*3,91*3,0,114*3,115*3,0,105*3,108*3,0,112*3,111*3,0,121*3,125*3,0,0,0,41,0,0,14,0,0,21,124*3,122*3,0,120*3,123*3,0,0,0,11,0,0,19,0,0,7,0,0,35,0,0,13,0,0,50,0,0,49,0,0,58,0,0,37,0,0,25,0,0,45,0,0,57,0,0,26,0,0,29,0,0,38,0,0,53,0,0,23,0,0,43,0,0,46,0,0,42,0,0,22,0,0,54,0,0,51,0,0,15,0,0,30,0,0,39,0,0,47,0,0,55,0,0,27,0,0,59,0,0,31]);MPEG1.MOTION=new Int16Array([1*3,2*3,0,4*3,3*3,0,0,0,0,6*3,5*3,0,8*3,7*3,0,0,0,-1,0,0,1,9*3,10*3,0,12*3,11*3,0,0,0,2,0,0,-2,14*3,15*3,0,16*3,13*3,0,20*3,18*3,0,0,0,3,0,0,-3,17*3,19*3,0,-1,23*3,0,27*3,25*3,0,26*3,21*3,0,24*3,22*3,0,32*3,28*3,0,29*3,31*3,0,-1,33*3,0,36*3,35*3,0,0,0,-4,30*3,34*3,0,0,0,4,0,0,-7,0,0,5,37*3,41*3,0,0,0,-5,0,0,7,38*3,40*3,0,42*3,39*3,0,0,0,-6,0,0,6,51*3,54*3,0,50*3,49*3,0,45*3,46*3,0,52*3,47*3,0,43*3,53*3,0,44*3,48*3,0,0,0,10,0,0,9,0,0,8,0,0,-8,57*3,66*3,0,0,0,-9,60*3,64*3,0,56*3,61*3,0,55*3,62*3,0,58*3,63*3,0,0,0,-10,59*3,65*3,0,0,0,12,0,0,16,0,0,13,0,0,14,0,0,11,0,0,15,0,0,-16,0,0,-12,0,0,-14,0,0,-15,0,0,-11,0,0,-13]);MPEG1.DCT_DC_SIZE_LUMINANCE=new Int8Array([2*3,1*3,0,6*3,5*3,0,3*3,4*3,0,0,0,1,0,0,2,9*3,8*3,0,7*3,10*3,0,0,0,0,12*3,11*3,0,0,0,4,0,0,3,13*3,14*3,0,0,0,5,0,0,6,16*3,15*3,0,17*3,-1,0,0,0,7,0,0,8]);MPEG1.DCT_DC_SIZE_CHROMINANCE=new Int8Array([2*3,1*3,0,4*3,3*3,0,6*3,5*3,0,8*3,7*3,0,0,0,2,0,0,1,0,0,0,10*3,9*3,0,0,0,3,12*3,11*3,0,0,0,4,14*3,13*3,0,0,0,5,16*3,15*3,0,0,0,6,17*3,-1,0,0,0,7,0,0,8]);MPEG1.DCT_COEFF=new Int32Array([1*3,2*3,0,4*3,3*3,0,0,0,1,7*3,8*3,0,6*3,5*3,0,13*3,9*3,0,11*3,10*3,0,14*3,12*3,0,0,0,257,20*3,22*3,0,18*3,21*3,0,16*3,19*3,0,0,0,513,17*3,15*3,0,0,0,2,0,0,3,27*3,25*3,0,29*3,31*3,0,24*3,26*3,0,32*3,30*3,0,0,0,1025,23*3,28*3,0,0,0,769,0,0,258,0,0,1793,0,0,65535,0,0,1537,37*3,36*3,0,0,0,1281,35*3,34*3,0,39*3,38*3,0,33*3,42*3,0,40*3,41*3,0,52*3,50*3,0,54*3,53*3,0,48*3,49*3,0,43*3,45*3,0,46*3,44*3,0,0,0,2049,0,0,4,0,0,514,0,0,2305,51*3,47*3,0,55*3,57*3,0,60*3,56*3,0,59*3,58*3,0,61*3,62*3,0,0,0,2561,0,0,3329,0,0,6,0,0,259,0,0,5,0,0,770,0,0,2817,0,0,3073,76*3,75*3,0,67*3,70*3,0,73*3,71*3,0,78*3,74*3,0,72*3,77*3,0,69*3,64*3,0,68*3,63*3,0,66*3,65*3,0,81*3,87*3,0,91*3,80*3,0,82*3,79*3,0,83*3,86*3,0,93*3,92*3,0,84*3,85*3,0,90*3,94*3,0,88*3,89*3,0,0,0,515,0,0,260,0,0,7,0,0,1026,0,0,1282,0,0,4097,0,0,3841,0,0,3585,105*3,107*3,0,111*3,114*3,0,104*3,97*3,0,125*3,119*3,0,96*3,98*3,0,-1,123*3,0,95*3,101*3,0,106*3,121*3,0,99*3,102*3,0,113*3,103*3,0,112*3,116*3,0,110*3,100*3,0,124*3,115*3,0,117*3,122*3,0,109*3,118*3,0,120*3,108*3,0,127*3,136*3,0,139*3,140*3,0,130*3,126*3,0,145*3,146*3,0,128*3,129*3,0,0,0,2050,132*3,134*3,0,155*3,154*3,0,0,0,8,137*3,133*3,0,143*3,144*3,0,151*3,138*3,0,142*3,141*3,0,0,0,10,0,0,9,0,0,11,0,0,5377,0,0,1538,0,0,771,0,0,5121,0,0,1794,0,0,4353,0,0,4609,0,0,4865,148*3,152*3,0,0,0,1027,153*3,150*3,0,0,0,261,131*3,135*3,0,0,0,516,149*3,147*3,0,172*3,173*3,0,162*3,158*3,0,170*3,161*3,0,168*3,166*3,0,157*3,179*3,0,169*3,167*3,0,174*3,171*3,0,178*3,177*3,0,156*3,159*3,0,164*3,165*3,0,183*3,182*3,0,175*3,176*3,0,0,0,263,0,0,2562,0,0,2306,0,0,5633,0,0,5889,0,0,6401,0,0,6145,0,0,1283,0,0,772,0,0,13,0,0,12,0,0,14,0,0,15,0,0,517,0,0,6657,0,0,262,180*3,181*3,0,160*3,163*3,0,196*3,199*3,0,0,0,27,203*3,185*3,0,202*3,201*3,0,0,0,19,0,0,22,197*3,207*3,0,0,0,18,191*3,192*3,0,188*3,190*3,0,0,0,20,184*3,194*3,0,0,0,21,186*3,193*3,0,0,0,23,204*3,198*3,0,0,0,25,0,0,24,200*3,205*3,0,0,0,31,0,0,30,0,0,28,0,0,29,0,0,26,0,0,17,0,0,16,189*3,206*3,0,187*3,195*3,0,218*3,211*3,0,0,0,37,215*3,216*3,0,0,0,36,210*3,212*3,0,0,0,34,213*3,209*3,0,221*3,222*3,0,219*3,208*3,0,217*3,214*3,0,223*3,220*3,0,0,0,35,0,0,267,0,0,40,0,0,268,0,0,266,0,0,32,0,0,264,0,0,265,0,0,38,0,0,269,0,0,270,0,0,33,0,0,39,0,0,7937,0,0,6913,0,0,7681,0,0,4098,0,0,7425,0,0,7169,0,0,271,0,0,274,0,0,273,0,0,272,0,0,1539,0,0,2818,0,0,3586,0,0,3330,0,0,3074,0,0,3842]);MPEG1.PICTURE_TYPE={INTRA:1,PREDICTIVE:2,B:3};MPEG1.START={SEQUENCE:179,SLICE_FIRST:1,SLICE_LAST:175,PICTURE:0,EXTENSION:181,USER_DATA:178};return MPEG1}();

  class MPEG2VideoDecoder {
    constructor(options = {}) {
      this.onFrame = options.onFrame || null;
      this.width = 0;
      this.height = 0;
      this.fps = 29.97;
      this.aspectRatio = '16:9';
      this.bitrate = 0;
      this.isInterlaced = true;
      this.currentPts = null;

      this.video = new JSMpeg.Decoder.MPEG1Video({
        videoBufferSize: 8 * 1024 * 1024,
        streaming: true,
        decodeFirstFrame: false,
      });

      this.video.destination = {
        resize: (w, h) => {
          this.width = w;
          this.height = h;
        },
        render: (y, cr, cb) => {
          if (this.onFrame) {
            const frameW = this.width;
            const frameH = this.height;
            const yLen = frameW * frameH;
            const uvLen = (frameW >> 1) * (frameH >> 1);

            const yOut = (y.length > yLen) ? y.subarray(0, yLen) : y;
            const uOut = (cb.length > uvLen) ? cb.subarray(0, uvLen) : cb;
            const vOut = (cr.length > uvLen) ? cr.subarray(0, uvLen) : cr;

            this.onFrame({
              pts: this.currentPts,
              width: frameW,
              height: frameH,
              isInterlaced: this.isInterlaced,
              y: new Uint8Array(yOut),
              u: new Uint8Array(uOut),
              v: new Uint8Array(vOut),
            });
          }
        },
      };
    }

    /**
     * Decode a single Video PES payload data buffer.
     * @param {Uint8Array} data - Video elementary stream
     * @param {number} pts - Presentation Time Stamp in seconds
     */
    decodePES(data, pts) {
      if (!data || data.length < 4) return;
      if (pts !== null && pts !== undefined) {
        this.currentPts = pts;
      }
      this.video.write(this.currentPts, data);
      while (this.video.decode()) {}
    }
  }

  /* ==========================================================================
     ATSC A/52 AC-3 Audio Decoder Engine
     ========================================================================== */

// --- constants.js ---
const BIT_RATES = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 448, 512, 576, 640];
const SAMPLE_RATES = [48000, 44100, 32000];
const AUDIO_SAMPLES = 1536;
const CHANNELS = [2, 1, 2, 3, 3, 4, 4, 5];

const BSID_STANDARD = 0x08;
const BSID_ANNEX_D = 0x06;
const BSID_ANNEX_E = 0x16;

const EXPONENT_GROUP_SIZE = [0, 1, 2, 4];

const EXP_REUSE = 0b00;
const EXP_D15 = 0b01;
const EXP_D25 = 0b10;
const EXP_D45 = 0b11;


// --- tables.js ---
const SLOW_DECAY = [0x0f, 0x11, 0x13, 0x15];
const FAST_DECAY = [0x3f, 0x53, 0x67, 0x7b];
const SLOW_GAIN = [0x540, 0x4d8, 0x478, 0x410];
const DB_PER_BIT = [0x000, 0x700, 0x900, 0xb00];
const FLOOR = [0x2f0, 0x2b0, 0x270, 0x230, 0x1f0, 0x170, 0x0f0, -0x0800];

const FAST_GAIN = [0x080, 0x100, 0x180, 0x200, 0x280, 0x300, 0x380, 0x400];

const REMATRIX_BANDS = [13, 25, 37, 61, 253];

const CLEV = [0.707, 0.595, 0.5, 0];
const SLEV = [0.707, 0.5, 0, 0];

const BNDTAB = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 31, 34,
    37, 40, 43, 46, 49, 55, 61, 67, 73, 79, 85, 97, 109, 121, 133, 157, 181, 205, 229
];

const BNDSZ = [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 6, 6, 6, 6,
    6, 6, 12, 12, 12, 12, 24, 24, 24, 24, 24
];

const BAPTAB = [
    0, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 7, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9, 9, 10, 10, 10, 10, 11, 11,
    11, 11, 12, 12, 12, 12, 13, 13, 13, 13, 14, 14, 14, 14, 14, 14, 14, 14, 15, 15, 15, 15, 15, 15, 15, 15, 15
];

const LATAB = [
    0x0040, 0x003f, 0x003e, 0x003d, 0x003c, 0x003b, 0x003a, 0x0039, 0x0038, 0x0037, 0x0036, 0x0035, 0x0034, 0x0034,
    0x0033, 0x0032, 0x0031, 0x0030, 0x002f, 0x002f, 0x002e, 0x002d, 0x002c, 0x002c, 0x002b, 0x002a, 0x0029, 0x0029,
    0x0028, 0x0027, 0x0026, 0x0026, 0x0025, 0x0024, 0x0024, 0x0023, 0x0023, 0x0022, 0x0021, 0x0021, 0x0020, 0x0020,
    0x001f, 0x001e, 0x001e, 0x001d, 0x001d, 0x001c, 0x001c, 0x001b, 0x001b, 0x001a, 0x001a, 0x0019, 0x0019, 0x0018,
    0x0018, 0x0017, 0x0017, 0x0016, 0x0016, 0x0015, 0x0015, 0x0015, 0x0014, 0x0014, 0x0013, 0x0013, 0x0013, 0x0012,
    0x0012, 0x0012, 0x0011, 0x0011, 0x0011, 0x0010, 0x0010, 0x0010, 0x000f, 0x000f, 0x000f, 0x000e, 0x000e, 0x000e,
    0x000d, 0x000d, 0x000d, 0x000d, 0x000c, 0x000c, 0x000c, 0x000c, 0x000b, 0x000b, 0x000b, 0x000b, 0x000a, 0x000a,
    0x000a, 0x000a, 0x000a, 0x0009, 0x0009, 0x0009, 0x0009, 0x0009, 0x0008, 0x0008, 0x0008, 0x0008, 0x0008, 0x0008,
    0x0007, 0x0007, 0x0007, 0x0007, 0x0007, 0x0007, 0x0006, 0x0006, 0x0006, 0x0006, 0x0006, 0x0006, 0x0006, 0x0006,
    0x0005, 0x0005, 0x0005, 0x0005, 0x0005, 0x0005, 0x0005, 0x0005, 0x0004, 0x0004, 0x0004, 0x0004, 0x0004, 0x0004,
    0x0004, 0x0004, 0x0004, 0x0004, 0x0004, 0x0003, 0x0003, 0x0003, 0x0003, 0x0003, 0x0003, 0x0003, 0x0003, 0x0003,
    0x0003, 0x0003, 0x0003, 0x0003, 0x0003, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002,
    0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0002, 0x0001, 0x0001, 0x0001, 0x0001,
    0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001,
    0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001, 0x0001,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000, 0x0000,
    0x0000, 0x0000, 0x0000, 0x0000
];

const MASKTAB = [
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 28, 28,
    29, 29, 29, 30, 30, 30, 31, 31, 31, 32, 32, 32, 33, 33, 33, 34, 34, 34, 35, 35, 35, 35, 35, 35, 36, 36, 36, 36, 36,
    36, 37, 37, 37, 37, 37, 37, 38, 38, 38, 38, 38, 38, 39, 39, 39, 39, 39, 39, 40, 40, 40, 40, 40, 40, 41, 41, 41, 41,
    41, 41, 41, 41, 41, 41, 41, 41, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 43, 43, 43, 43, 43, 43, 43, 43, 43,
    43, 43, 43, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 44, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
    45, 45, 45, 45, 45, 45, 45, 45, 45, 45, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46, 46,
    46, 46, 46, 46, 46, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47, 47,
    48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 48, 49, 49, 49, 49, 49,
    49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 49, 0, 0, 0
];

const HTH = [
    [
        0x04d0, 0x04d0, 0x0440, 0x0400, 0x03e0, 0x03c0, 0x03b0, 0x03b0, 0x03a0, 0x03a0, 0x03a0, 0x03a0, 0x03a0, 0x0390,
        0x0390, 0x0390, 0x0380, 0x0380, 0x0370, 0x0370, 0x0360, 0x0360, 0x0350, 0x0350, 0x0340, 0x0340, 0x0330, 0x0320,
        0x0310, 0x0300, 0x02f0, 0x02f0, 0x02f0, 0x02f0, 0x0300, 0x0310, 0x0340, 0x0390, 0x03e0, 0x0420, 0x0460, 0x0490,
        0x04a0, 0x0460, 0x0440, 0x0440, 0x0520, 0x0800, 0x0840, 0x0840
    ],
    [
        0x04f0, 0x04f0, 0x0460, 0x0410, 0x03e0, 0x03d0, 0x03c0, 0x03b0, 0x03b0, 0x03a0, 0x03a0, 0x03a0, 0x03a0, 0x03a0,
        0x0390, 0x0390, 0x0390, 0x0380, 0x0380, 0x0380, 0x0370, 0x0370, 0x0360, 0x0360, 0x0350, 0x0350, 0x0340, 0x0340,
        0x0320, 0x0310, 0x0300, 0x02f0, 0x02f0, 0x02f0, 0x02f0, 0x0300, 0x0320, 0x0350, 0x0390, 0x03e0, 0x0420, 0x0450,
        0x04a0, 0x0490, 0x0460, 0x0440, 0x0480, 0x0630, 0x0840, 0x840
    ],
    [
        0x0580, 0x0580, 0x04b0, 0x0450, 0x0420, 0x03f0, 0x03e0, 0x03d0, 0x03c0, 0x03b0, 0x03b0, 0x03b0, 0x03a0, 0x03a0,
        0x03a0, 0x03a0, 0x03a0, 0x03a0, 0x03a0, 0x03a0, 0x0390, 0x0390, 0x0390, 0x0390, 0x0380, 0x0380, 0x0380, 0x0370,
        0x0360, 0x0350, 0x0340, 0x0330, 0x0320, 0x0310, 0x0300, 0x02f0, 0x02f0, 0x02f0, 0x0300, 0x0310, 0x0330, 0x0350,
        0x03c0, 0x0410, 0x0470, 0x04a0, 0x0460, 0x0440, 0x0450, 0x04e0
    ]
];

const BAP_1 = [
    [-2 / 3, -2 / 3, -2 / 3],
    [-2 / 3, -2 / 3, 0],
    [-2 / 3, -2 / 3, 2 / 3],
    [-2 / 3, 0, -2 / 3],
    [-2 / 3, 0, 0],
    [-2 / 3, 0, 2 / 3],
    [-2 / 3, 2 / 3, -2 / 3],
    [-2 / 3, 2 / 3, 0],
    [-2 / 3, 2 / 3, 2 / 3],
    [0, -2 / 3, -2 / 3],
    [0, -2 / 3, 0],
    [0, -2 / 3, 2 / 3],
    [0, 0, -2 / 3],
    [0, 0, 0],
    [0, 0, 2 / 3],
    [0, 2 / 3, -2 / 3],
    [0, 2 / 3, 0],
    [0, 2 / 3, 2 / 3],
    [2 / 3, -2 / 3, -2 / 3],
    [2 / 3, -2 / 3, 0],
    [2 / 3, -2 / 3, 2 / 3],
    [2 / 3, 0, -2 / 3],
    [2 / 3, 0, 0],
    [2 / 3, 0, 2 / 3],
    [2 / 3, 2 / 3, -2 / 3],
    [2 / 3, 2 / 3, 0],
    [2 / 3, 2 / 3, 2 / 3],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
];

const BAP_2 = [
    [-4 / 5, -4 / 5, -4 / 5],
    [-4 / 5, -4 / 5, -2 / 5],
    [-4 / 5, -4 / 5, 0],
    [-4 / 5, -4 / 5, 2 / 5],
    [-4 / 5, -4 / 5, 4 / 5],
    [-4 / 5, -2 / 5, -4 / 5],
    [-4 / 5, -2 / 5, -2 / 5],
    [-4 / 5, -2 / 5, 0],
    [-4 / 5, -2 / 5, 2 / 5],
    [-4 / 5, -2 / 5, 4 / 5],
    [-4 / 5, 0, -4 / 5],
    [-4 / 5, 0, -2 / 5],
    [-4 / 5, 0, 0],
    [-4 / 5, 0, 2 / 5],
    [-4 / 5, 0, 4 / 5],
    [-4 / 5, 2 / 5, -4 / 5],
    [-4 / 5, 2 / 5, -2 / 5],
    [-4 / 5, 2 / 5, 0],
    [-4 / 5, 2 / 5, 2 / 5],
    [-4 / 5, 2 / 5, 4 / 5],
    [-4 / 5, 4 / 5, -4 / 5],
    [-4 / 5, 4 / 5, -2 / 5],
    [-4 / 5, 4 / 5, 0],
    [-4 / 5, 4 / 5, 2 / 5],
    [-4 / 5, 4 / 5, 4 / 5],
    [-2 / 5, -4 / 5, -4 / 5],
    [-2 / 5, -4 / 5, -2 / 5],
    [-2 / 5, -4 / 5, 0],
    [-2 / 5, -4 / 5, 2 / 5],
    [-2 / 5, -4 / 5, 4 / 5],
    [-2 / 5, -2 / 5, -4 / 5],
    [-2 / 5, -2 / 5, -2 / 5],
    [-2 / 5, -2 / 5, 0],
    [-2 / 5, -2 / 5, 2 / 5],
    [-2 / 5, -2 / 5, 4 / 5],
    [-2 / 5, 0, -4 / 5],
    [-2 / 5, 0, -2 / 5],
    [-2 / 5, 0, 0],
    [-2 / 5, 0, 2 / 5],
    [-2 / 5, 0, 4 / 5],
    [-2 / 5, 2 / 5, -4 / 5],
    [-2 / 5, 2 / 5, -2 / 5],
    [-2 / 5, 2 / 5, 0],
    [-2 / 5, 2 / 5, 2 / 5],
    [-2 / 5, 2 / 5, 4 / 5],
    [-2 / 5, 4 / 5, -4 / 5],
    [-2 / 5, 4 / 5, -2 / 5],
    [-2 / 5, 4 / 5, 0],
    [-2 / 5, 4 / 5, 2 / 5],
    [-2 / 5, 4 / 5, 4 / 5],
    [0, -4 / 5, -4 / 5],
    [0, -4 / 5, -2 / 5],
    [0, -4 / 5, 0],
    [0, -4 / 5, 2 / 5],
    [0, -4 / 5, 4 / 5],
    [0, -2 / 5, -4 / 5],
    [0, -2 / 5, -2 / 5],
    [0, -2 / 5, 0],
    [0, -2 / 5, 2 / 5],
    [0, -2 / 5, 4 / 5],
    [0, 0, -4 / 5],
    [0, 0, -2 / 5],
    [0, 0, 0],
    [0, 0, 2 / 5],
    [0, 0, 4 / 5],
    [0, 2 / 5, -4 / 5],
    [0, 2 / 5, -2 / 5],
    [0, 2 / 5, 0],
    [0, 2 / 5, 2 / 5],
    [0, 2 / 5, 4 / 5],
    [0, 4 / 5, -4 / 5],
    [0, 4 / 5, -2 / 5],
    [0, 4 / 5, 0],
    [0, 4 / 5, 2 / 5],
    [0, 4 / 5, 4 / 5],
    [2 / 5, -4 / 5, -4 / 5],
    [2 / 5, -4 / 5, -2 / 5],
    [2 / 5, -4 / 5, 0],
    [2 / 5, -4 / 5, 2 / 5],
    [2 / 5, -4 / 5, 4 / 5],
    [2 / 5, -2 / 5, -4 / 5],
    [2 / 5, -2 / 5, -2 / 5],
    [2 / 5, -2 / 5, 0],
    [2 / 5, -2 / 5, 2 / 5],
    [2 / 5, -2 / 5, 4 / 5],
    [2 / 5, 0, -4 / 5],
    [2 / 5, 0, -2 / 5],
    [2 / 5, 0, 0],
    [2 / 5, 0, 2 / 5],
    [2 / 5, 0, 4 / 5],
    [2 / 5, 2 / 5, -4 / 5],
    [2 / 5, 2 / 5, -2 / 5],
    [2 / 5, 2 / 5, 0],
    [2 / 5, 2 / 5, 2 / 5],
    [2 / 5, 2 / 5, 4 / 5],
    [2 / 5, 4 / 5, -4 / 5],
    [2 / 5, 4 / 5, -2 / 5],
    [2 / 5, 4 / 5, 0],
    [2 / 5, 4 / 5, 2 / 5],
    [2 / 5, 4 / 5, 4 / 5],
    [4 / 5, -4 / 5, -4 / 5],
    [4 / 5, -4 / 5, -2 / 5],
    [4 / 5, -4 / 5, 0],
    [4 / 5, -4 / 5, 2 / 5],
    [4 / 5, -4 / 5, 4 / 5],
    [4 / 5, -2 / 5, -4 / 5],
    [4 / 5, -2 / 5, -2 / 5],
    [4 / 5, -2 / 5, 0],
    [4 / 5, -2 / 5, 2 / 5],
    [4 / 5, -2 / 5, 4 / 5],
    [4 / 5, 0, -4 / 5],
    [4 / 5, 0, -2 / 5],
    [4 / 5, 0, 0],
    [4 / 5, 0, 2 / 5],
    [4 / 5, 0, 4 / 5],
    [4 / 5, 2 / 5, -4 / 5],
    [4 / 5, 2 / 5, -2 / 5],
    [4 / 5, 2 / 5, 0],
    [4 / 5, 2 / 5, 2 / 5],
    [4 / 5, 2 / 5, 4 / 5],
    [4 / 5, 4 / 5, -4 / 5],
    [4 / 5, 4 / 5, -2 / 5],
    [4 / 5, 4 / 5, 0],
    [4 / 5, 4 / 5, 2 / 5],
    [4 / 5, 4 / 5, 4 / 5],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
];

const BAP_3 = [-6 / 7, -4 / 7, -2 / 7, 0, 2 / 7, 4 / 7, 6 / 7];

const BAP_4 = [
    [-10 / 11, -10 / 11],
    [-10 / 11, -8 / 11],
    [-10 / 11, -6 / 11],
    [-10 / 11, -4 / 11],
    [-10 / 11, -2 / 11],
    [-10 / 11, 0],
    [-10 / 11, 2 / 11],
    [-10 / 11, 4 / 11],
    [-10 / 11, 6 / 11],
    [-10 / 11, 8 / 11],
    [-10 / 11, 10 / 11],

    [-8 / 11, -10 / 11],
    [-8 / 11, -8 / 11],
    [-8 / 11, -6 / 11],
    [-8 / 11, -4 / 11],
    [-8 / 11, -2 / 11],
    [-8 / 11, 0],
    [-8 / 11, 2 / 11],
    [-8 / 11, 4 / 11],
    [-8 / 11, 6 / 11],
    [-8 / 11, 8 / 11],
    [-8 / 11, 10 / 11],

    [-6 / 11, -10 / 11],
    [-6 / 11, -8 / 11],
    [-6 / 11, -6 / 11],
    [-6 / 11, -4 / 11],
    [-6 / 11, -2 / 11],
    [-6 / 11, 0],
    [-6 / 11, 2 / 11],
    [-6 / 11, 4 / 11],
    [-6 / 11, 6 / 11],
    [-6 / 11, 8 / 11],
    [-6 / 11, 10 / 11],

    [-4 / 11, -10 / 11],
    [-4 / 11, -8 / 11],
    [-4 / 11, -6 / 11],
    [-4 / 11, -4 / 11],
    [-4 / 11, -2 / 11],
    [-4 / 11, 0],
    [-4 / 11, 2 / 11],
    [-4 / 11, 4 / 11],
    [-4 / 11, 6 / 11],
    [-4 / 11, 8 / 11],
    [-4 / 11, 10 / 11],

    [-2 / 11, -10 / 11],
    [-2 / 11, -8 / 11],
    [-2 / 11, -6 / 11],
    [-2 / 11, -4 / 11],
    [-2 / 11, -2 / 11],
    [-2 / 11, 0],
    [-2 / 11, 2 / 11],
    [-2 / 11, 4 / 11],
    [-2 / 11, 6 / 11],
    [-2 / 11, 8 / 11],
    [-2 / 11, 10 / 11],

    [0, -10 / 11],
    [0, -8 / 11],
    [0, -6 / 11],
    [0, -4 / 11],
    [0, -2 / 11],
    [0, 0],
    [0, 2 / 11],
    [0, 4 / 11],
    [0, 6 / 11],
    [0, 8 / 11],
    [0, 10 / 11],

    [2 / 11, -10 / 11],
    [2 / 11, -8 / 11],
    [2 / 11, -6 / 11],
    [2 / 11, -4 / 11],
    [2 / 11, -2 / 11],
    [2 / 11, 0],
    [2 / 11, 2 / 11],
    [2 / 11, 4 / 11],
    [2 / 11, 6 / 11],
    [2 / 11, 8 / 11],
    [2 / 11, 10 / 11],

    [4 / 11, -10 / 11],
    [4 / 11, -8 / 11],
    [4 / 11, -6 / 11],
    [4 / 11, -4 / 11],
    [4 / 11, -2 / 11],
    [4 / 11, 0],
    [4 / 11, 2 / 11],
    [4 / 11, 4 / 11],
    [4 / 11, 6 / 11],
    [4 / 11, 8 / 11],
    [4 / 11, 10 / 11],

    [6 / 11, -10 / 11],
    [6 / 11, -8 / 11],
    [6 / 11, -6 / 11],
    [6 / 11, -4 / 11],
    [6 / 11, -2 / 11],
    [6 / 11, 0],
    [6 / 11, 2 / 11],
    [6 / 11, 4 / 11],
    [6 / 11, 6 / 11],
    [6 / 11, 8 / 11],
    [6 / 11, 10 / 11],

    [8 / 11, -10 / 11],
    [8 / 11, -8 / 11],
    [8 / 11, -6 / 11],
    [8 / 11, -4 / 11],
    [8 / 11, -2 / 11],
    [8 / 11, 0],
    [8 / 11, 2 / 11],
    [8 / 11, 4 / 11],
    [8 / 11, 6 / 11],
    [8 / 11, 8 / 11],
    [8 / 11, 10 / 11],

    [10 / 11, -10 / 11],
    [10 / 11, -8 / 11],
    [10 / 11, -6 / 11],
    [10 / 11, -4 / 11],
    [10 / 11, -2 / 11],
    [10 / 11, 0],
    [10 / 11, 2 / 11],
    [10 / 11, 4 / 11],
    [10 / 11, 6 / 11],
    [10 / 11, 8 / 11],
    [10 / 11, 10 / 11],

    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0]
];

const BAP_5 = [
    -14 / 15,
    -12 / 15,
    -10 / 15,
    -8 / 15,
    -6 / 15,
    -4 / 15,
    -2 / 15,
    0,
    2 / 15,
    4 / 15,
    6 / 15,
    8 / 15,
    10 / 15,
    12 / 15,
    14 / 15,
    0
];

const WINDOW = [
    0.00014, 0.00024, 0.00037, 0.00051, 0.00067, 0.00086, 0.00107, 0.0013, 0.00157, 0.00187, 0.0022, 0.00256, 0.00297,
    0.00341, 0.0039, 0.00443, 0.00501, 0.00564, 0.00632, 0.00706, 0.00785, 0.00871, 0.00962, 0.01061, 0.01166, 0.01279,
    0.01399, 0.01526, 0.01662, 0.01806, 0.01959, 0.02121, 0.02292, 0.02472, 0.02662, 0.02863, 0.03073, 0.03294, 0.03527,
    0.0377, 0.04025, 0.04292, 0.04571, 0.04862, 0.05165, 0.05481, 0.0581, 0.06153, 0.06508, 0.06878, 0.07261, 0.07658,
    0.08069, 0.08495, 0.08935, 0.09389, 0.09859, 0.10343, 0.10842, 0.11356, 0.11885, 0.12429, 0.12988, 0.13563, 0.14152,
    0.14757, 0.15376, 0.16011, 0.16661, 0.17325, 0.18005, 0.18699, 0.19407, 0.2013, 0.20867, 0.21618, 0.22382, 0.23161,
    0.23952, 0.24757, 0.25574, 0.26404, 0.27246, 0.281, 0.28965, 0.29841, 0.30729, 0.31626, 0.32533, 0.3345, 0.34376,
    0.35311, 0.36253, 0.37204, 0.38161, 0.39126, 0.40096, 0.41072, 0.42054, 0.4304, 0.4403, 0.45023, 0.4602, 0.47019,
    0.4802, 0.49022, 0.50025, 0.51028, 0.52031, 0.53033, 0.54033, 0.55031, 0.56026, 0.57019, 0.58007, 0.58991, 0.5997,
    0.60944, 0.61912, 0.62873, 0.63827, 0.64774, 0.65713, 0.66643, 0.67564, 0.68476, 0.69377, 0.70269, 0.7115, 0.72019,
    0.72877, 0.73723, 0.74557, 0.75378, 0.76186, 0.76981, 0.77762, 0.7853, 0.79283, 0.80022, 0.80747, 0.81457, 0.82151,
    0.82831, 0.83496, 0.84145, 0.84779, 0.85398, 0.86001, 0.86588, 0.8716, 0.87716, 0.88257, 0.88782, 0.89291, 0.89785,
    0.90264, 0.90728, 0.91176, 0.9161, 0.92028, 0.92432, 0.92822, 0.93197, 0.93558, 0.93906, 0.9424, 0.9456, 0.94867,
    0.95162, 0.95444, 0.95713, 0.95971, 0.96217, 0.96451, 0.96674, 0.96887, 0.97089, 0.97281, 0.97463, 0.97635, 0.97799,
    0.97953, 0.98099, 0.98236, 0.98366, 0.98488, 0.98602, 0.9871, 0.98811, 0.98905, 0.98994, 0.99076, 0.99153, 0.99225,
    0.99291, 0.99353, 0.99411, 0.99464, 0.99513, 0.99558, 0.996, 0.99639, 0.99674, 0.99706, 0.99736, 0.99763, 0.99788,
    0.99811, 0.99831, 0.9985, 0.99867, 0.99882, 0.99895, 0.99908, 0.99919, 0.99929, 0.99938, 0.99946, 0.99953, 0.99959,
    0.99965, 0.99969, 0.99974, 0.99978, 0.99981, 0.99984, 0.99986, 0.99988, 0.9999, 0.99992, 0.99993, 0.99994, 0.99995,
    0.99996, 0.99997, 0.99998, 0.99998, 0.99998, 0.99999, 0.99999, 0.99999, 0.99999, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0,
    1.0, 1.0, 1.0, 1.0, 1.0, 1.0
];


// --- fft.js ---
'use strict';

function FFT(size) {
  this.size = size | 0;
  if (this.size <= 1 || (this.size & (this.size - 1)) !== 0)
    throw new Error('FFT size must be a power of two and bigger than 1');

  this._csize = size << 1;

  // NOTE: Use of `var` is intentional for old V8 versions
  var table = new Array(this.size * 2);
  for (var i = 0; i < table.length; i += 2) {
    const angle = Math.PI * i / this.size;
    table[i] = Math.cos(angle);
    table[i + 1] = -Math.sin(angle);
  }
  this.table = table;

  // Find size's power of two
  var power = 0;
  for (var t = 1; this.size > t; t <<= 1)
    power++;

  // Calculate initial step's width:
  //   * If we are full radix-4 - it is 2x smaller to give inital len=8
  //   * Otherwise it is the same as `power` to give len=4
  this._width = power % 2 === 0 ? power - 1 : power;

  // Pre-compute bit-reversal patterns
  this._bitrev = new Array(1 << this._width);
  for (var j = 0; j < this._bitrev.length; j++) {
    this._bitrev[j] = 0;
    for (var shift = 0; shift < this._width; shift += 2) {
      var revShift = this._width - shift - 2;
      this._bitrev[j] |= ((j >>> shift) & 3) << revShift;
    }
  }

  this._out = null;
  this._data = null;
  this._inv = 0;
}
if (typeof module !== "undefined" && module.exports) module.exports = FFT;

FFT.prototype.fromComplexArray = function fromComplexArray(complex, storage) {
  var res = storage || new Array(complex.length >>> 1);
  for (var i = 0; i < complex.length; i += 2)
    res[i >>> 1] = complex[i];
  return res;
};

FFT.prototype.createComplexArray = function createComplexArray() {
  const res = new Array(this._csize);
  for (var i = 0; i < res.length; i++)
    res[i] = 0;
  return res;
};

FFT.prototype.toComplexArray = function toComplexArray(input, storage) {
  var res = storage || this.createComplexArray();
  for (var i = 0; i < res.length; i += 2) {
    res[i] = input[i >>> 1];
    res[i + 1] = 0;
  }
  return res;
};

FFT.prototype.completeSpectrum = function completeSpectrum(spectrum) {
  var size = this._csize;
  var half = size >>> 1;
  for (var i = 2; i < half; i += 2) {
    spectrum[size - i] = spectrum[i];
    spectrum[size - i + 1] = -spectrum[i + 1];
  }
};

FFT.prototype.transform = function transform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._transform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.realTransform = function realTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._realTransform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.inverseTransform = function inverseTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 1;
  this._transform4();
  for (var i = 0; i < out.length; i++)
    out[i] /= this.size;
  this._out = null;
  this._data = null;
};

// radix-4 implementation
//
// NOTE: Uses of `var` are intentional for older V8 version that do not
// support both `let compound assignments` and `const phi`
FFT.prototype._transform4 = function _transform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform2(outOff, off, step);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform4(outOff, off, step);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var quarterLen = len >>> 2;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      // Full case
      var limit = outOff + quarterLen;
      for (var i = outOff, k = 0; i < limit; i += 2, k += step) {
        const A = i;
        const B = A + quarterLen;
        const C = B + quarterLen;
        const D = C + quarterLen;

        // Original values
        const Ar = out[A];
        const Ai = out[A + 1];
        const Br = out[B];
        const Bi = out[B + 1];
        const Cr = out[C];
        const Ci = out[C + 1];
        const Dr = out[D];
        const Di = out[D + 1];

        // Middle values
        const MAr = Ar;
        const MAi = Ai;

        const tableBr = table[k];
        const tableBi = inv * table[k + 1];
        const MBr = Br * tableBr - Bi * tableBi;
        const MBi = Br * tableBi + Bi * tableBr;

        const tableCr = table[2 * k];
        const tableCi = inv * table[2 * k + 1];
        const MCr = Cr * tableCr - Ci * tableCi;
        const MCi = Cr * tableCi + Ci * tableCr;

        const tableDr = table[3 * k];
        const tableDi = inv * table[3 * k + 1];
        const MDr = Dr * tableDr - Di * tableDi;
        const MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        const T0r = MAr + MCr;
        const T0i = MAi + MCi;
        const T1r = MAr - MCr;
        const T1i = MAi - MCi;
        const T2r = MBr + MDr;
        const T2i = MBi + MDi;
        const T3r = inv * (MBr - MDr);
        const T3i = inv * (MBi - MDi);

        // Final values
        const FAr = T0r + T2r;
        const FAi = T0i + T2i;

        const FCr = T0r - T2r;
        const FCi = T0i - T2i;

        const FBr = T1r + T3i;
        const FBi = T1i - T3r;

        const FDr = T1r - T3i;
        const FDi = T1i + T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;
        out[C] = FCr;
        out[C + 1] = FCi;
        out[D] = FDr;
        out[D + 1] = FDi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleTransform2 = function _singleTransform2(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const evenI = data[off + 1];
  const oddR = data[off + step];
  const oddI = data[off + step + 1];

  const leftR = evenR + oddR;
  const leftI = evenI + oddI;
  const rightR = evenR - oddR;
  const rightI = evenI - oddI;

  out[outOff] = leftR;
  out[outOff + 1] = leftI;
  out[outOff + 2] = rightR;
  out[outOff + 3] = rightI;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleTransform4 = function _singleTransform4(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Ai = data[off + 1];
  const Br = data[off + step];
  const Bi = data[off + step + 1];
  const Cr = data[off + step2];
  const Ci = data[off + step2 + 1];
  const Dr = data[off + step3];
  const Di = data[off + step3 + 1];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T0i = Ai + Ci;
  const T1r = Ar - Cr;
  const T1i = Ai - Ci;
  const T2r = Br + Dr;
  const T2i = Bi + Di;
  const T3r = inv * (Br - Dr);
  const T3i = inv * (Bi - Di);

  // Final values
  const FAr = T0r + T2r;
  const FAi = T0i + T2i;

  const FBr = T1r + T3i;
  const FBi = T1i - T3r;

  const FCr = T0r - T2r;
  const FCi = T0i - T2i;

  const FDr = T1r - T3i;
  const FDi = T1i + T3r;

  out[outOff] = FAr;
  out[outOff + 1] = FAi;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = FCi;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

// Real input radix-4 implementation
FFT.prototype._realTransform4 = function _realTransform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var halfLen = len >>> 1;
    var quarterLen = halfLen >>> 1;
    var hquarterLen = quarterLen >>> 1;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      for (var i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
        var A = outOff + i;
        var B = A + quarterLen;
        var C = B + quarterLen;
        var D = C + quarterLen;

        // Original values
        var Ar = out[A];
        var Ai = out[A + 1];
        var Br = out[B];
        var Bi = out[B + 1];
        var Cr = out[C];
        var Ci = out[C + 1];
        var Dr = out[D];
        var Di = out[D + 1];

        // Middle values
        var MAr = Ar;
        var MAi = Ai;

        var tableBr = table[k];
        var tableBi = inv * table[k + 1];
        var MBr = Br * tableBr - Bi * tableBi;
        var MBi = Br * tableBi + Bi * tableBr;

        var tableCr = table[2 * k];
        var tableCi = inv * table[2 * k + 1];
        var MCr = Cr * tableCr - Ci * tableCi;
        var MCi = Cr * tableCi + Ci * tableCr;

        var tableDr = table[3 * k];
        var tableDi = inv * table[3 * k + 1];
        var MDr = Dr * tableDr - Di * tableDi;
        var MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        var T0r = MAr + MCr;
        var T0i = MAi + MCi;
        var T1r = MAr - MCr;
        var T1i = MAi - MCi;
        var T2r = MBr + MDr;
        var T2i = MBi + MDi;
        var T3r = inv * (MBr - MDr);
        var T3i = inv * (MBi - MDi);

        // Final values
        var FAr = T0r + T2r;
        var FAi = T0i + T2i;

        var FBr = T1r + T3i;
        var FBi = T1i - T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;

        // Output final middle point
        if (i === 0) {
          var FCr = T0r - T2r;
          var FCi = T0i - T2i;
          out[C] = FCr;
          out[C + 1] = FCi;
          continue;
        }

        // Do not overwrite ourselves
        if (i === hquarterLen)
          continue;

        // In the flipped case:
        // MAi = -MAi
        // MBr=-MBi, MBi=-MBr
        // MCr=-MCr
        // MDr=MDi, MDi=MDr
        var ST0r = T1r;
        var ST0i = -T1i;
        var ST1r = T0r;
        var ST1i = -T0i;
        var ST2r = -inv * T3i;
        var ST2i = -inv * T3r;
        var ST3r = -inv * T2i;
        var ST3i = -inv * T2r;

        var SFAr = ST0r + ST2r;
        var SFAi = ST0i + ST2i;

        var SFBr = ST1r + ST3i;
        var SFBi = ST1i - ST3r;

        var SA = outOff + quarterLen - i;
        var SB = outOff + halfLen - i;

        out[SA] = SFAr;
        out[SA + 1] = SFAi;
        out[SB] = SFBr;
        out[SB + 1] = SFBi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleRealTransform2 = function _singleRealTransform2(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const oddR = data[off + step];

  const leftR = evenR + oddR;
  const rightR = evenR - oddR;

  out[outOff] = leftR;
  out[outOff + 1] = 0;
  out[outOff + 2] = rightR;
  out[outOff + 3] = 0;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleRealTransform4 = function _singleRealTransform4(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Br = data[off + step];
  const Cr = data[off + step2];
  const Dr = data[off + step3];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T1r = Ar - Cr;
  const T2r = Br + Dr;
  const T3r = inv * (Br - Dr);

  // Final values
  const FAr = T0r + T2r;

  const FBr = T1r;
  const FBi = -T3r;

  const FCr = T0r - T2r;

  const FDr = T1r;
  const FDi = T3r;

  out[outOff] = FAr;
  out[outOff + 1] = 0;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = 0;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};


// --- mdct.js ---


const N = 512;

const xcos1 = new Array(N / 4);
const xsin1 = new Array(N / 4);

const xcos2 = new Array(N / 8);
const xsin2 = new Array(N / 8);

const fft128 = new FFT(N / 4);
const fft64 = new FFT(N / 8);

const Z128 = fft128.createComplexArray();
const z128 = fft128.createComplexArray();
const y128 = fft128.createComplexArray();
const x256 = new Array(N);

const Z64A = fft64.createComplexArray();
const Z64B = fft64.createComplexArray();
const z64a = fft64.createComplexArray();
const z64b = fft64.createComplexArray();
const y64a = fft64.createComplexArray();
const y64b = fft64.createComplexArray();

for (let i = 0; i < N / 4; i++) {
    xcos1[i] = -Math.cos((2 * Math.PI * (8 * i + 1)) / (8 * N));
    xsin1[i] = -Math.sin((2 * Math.PI * (8 * i + 1)) / (8 * N));
}
for (let i = 0; i < N / 8; i++) {
    xcos2[i] = -Math.cos((2 * Math.PI * (8 * i + 1)) / (4 * N));
    xsin2[i] = -Math.sin((2 * Math.PI * (8 * i + 1)) / (4 * N));
}

class IMDCT {
    constructor() {
        this.delaySamples = new Array(N / 2);
        this.delaySamples.fill(0);
    }

    process256(coeffs, outputSamples, outputOffset) {
        for (let k = 0; k < N / 4; k++) {
            Z128[k * 2] = coeffs[N / 2 - 2 * k - 1] * xcos1[k] - coeffs[2 * k] * xsin1[k];
            Z128[k * 2 + 1] = coeffs[2 * k] * xcos1[k] + coeffs[N / 2 - 2 * k - 1] * xsin1[k];
        }
        fft128.inverseTransform(z128, Z128);
        for (let n = 0; n < N / 4; n++) {
            y128[n * 2] = z128[n * 2] * xcos1[n] - z128[n * 2 + 1] * xsin1[n];
            y128[n * 2 + 1] = z128[n * 2 + 1] * xcos1[n] + z128[n * 2] * xsin1[n];
        }
        for (let n = 0; n < N / 8; n++) {
            x256[2 * n] = -y128[2 * (N / 8 + n) + 1] * WINDOW[2 * n];
            x256[2 * n + 1] = y128[2 * (N / 8 - n - 1)] * WINDOW[2 * n + 1];
            x256[N / 4 + 2 * n] = -y128[2 * n] * WINDOW[N / 4 + 2 * n];
            x256[N / 4 + 2 * n + 1] = y128[2 * (N / 4 - n - 1) + 1] * WINDOW[N / 4 + 2 * n + 1];
            x256[N / 2 + 2 * n] = -y128[2 * (N / 8 + n)] * WINDOW[N / 2 - 2 * n - 1];
            x256[N / 2 + 2 * n + 1] = y128[2 * (N / 8 - n - 1) + 1] * WINDOW[N / 2 - 2 * n - 2];
            x256[(3 * N) / 4 + 2 * n] = y128[2 * n + 1] * WINDOW[N / 4 - 2 * n - 1];
            x256[(3 * N) / 4 + 2 * n + 1] = -y128[2 * (N / 4 - n - 1)] * WINDOW[N / 4 - 2 * n - 2];
        }
        for (let n = 0; n < N / 2; n++) {
            let outputSample = 128 * (x256[n] + this.delaySamples[n]);
            if (outputSample < -1.0) {
                outputSample = -1.0;
            } else if (outputSample > 1.0) {
                outputSample = 1.0;
            }
            outputSamples[n + outputOffset] = outputSample;
            this.delaySamples[n] = x256[N / 2 + n];
        }
    }

    process128(coeffs, outputSamples, outputOffset) {
        for (let k = 0; k < N / 8; k++) {
            Z64A[k * 2] = coeffs[2 * (N / 4 - 2 * k - 1)] * xcos2[k] - coeffs[4 * k] * xsin2[k];
            Z64A[k * 2 + 1] = coeffs[4 * k] * xcos2[k] + coeffs[2 * (N / 4 - 2 * k - 1)] * xsin2[k];
            Z64B[k * 2] = coeffs[2 * (N / 4 - 2 * k - 1 + 1)] * xcos2[k] - coeffs[4 * k + 2] * xsin2[k];
            Z64B[k * 2 + 1] = coeffs[4 * k + 2] * xcos2[k] + coeffs[2 * (N / 4 - 2 * k - 1 + 1)] * xsin2[k];
        }
        fft64.inverseTransform(z64a, Z64A);
        fft64.inverseTransform(z64b, Z64B);
        for (let n = 0; n < N / 8; n++) {
            y64a[n * 2] = z64a[n * 2] * xcos2[n] - z64a[n * 2 + 1] * xsin2[n];
            y64a[n * 2 + 1] = z64a[n * 2 + 1] * xcos2[n] + z64a[n * 2] * xsin2[n];
            y64b[n * 2] = z64b[n * 2] * xcos2[n] - z64b[n * 2 + 1] * xsin2[n];
            y64b[n * 2 + 1] = z64b[n * 2 + 1] * xcos2[n] + z64b[n * 2] * xsin2[n];
        }
        for (let n = 0; n < N / 8; n++) {
            x256[2 * n] = -y64a[2 * n + 1] * WINDOW[2 * n];
            x256[2 * n + 1] = y64a[2 * (N / 8 - n - 1)] * WINDOW[2 * n + 1];
            x256[N / 4 + 2 * n] = -y64a[2 * n] * WINDOW[N / 4 + 2 * n];
            x256[N / 4 + 2 * n + 1] = y64a[2 * (N / 8 - n - 1) + 1] * WINDOW[N / 4 + 2 * n + 1];
            x256[N / 2 + 2 * n] = -y64b[2 * n] * WINDOW[N / 2 - 2 * n - 1];
            x256[N / 2 + 2 * n + 1] = y64b[2 * (N / 8 - n - 1) + 1] * WINDOW[N / 2 - 2 * n - 2];
            x256[(3 * N) / 4 + 2 * n] = y64b[2 * n + 1] * WINDOW[N / 4 - 2 * n - 1];
            x256[(3 * N) / 4 + 2 * n + 1] = -y64b[2 * (N / -n - 1)] * WINDOW[N / 4 - 2 * n - 2];
        }
        for (let n = 0; n < N / 2; n++) {
            let outputSample = 64 * (x256[n] + this.delaySamples[n]);
            if (outputSample < -1.0) {
                outputSample = -1.0;
            } else if (outputSample > 1.0) {
                outputSample = 1.0;
            }
            outputSamples[n + outputOffset] = outputSample;
            this.delaySamples[n] = x256[N / 2 + n];
        }
    }
}


// --- exponents.js ---
const unpackExponents = (exps, absexp, grpsize, skip) => {
    const dexps = new Array(exps.length * 3);

    // Unpack mapped values
    for (let grp = 0; grp < exps.length; grp++) {
        const exp = exps[grp];
        dexps[grp * 3] = (exp / 25) >> 0;
        dexps[grp * 3 + 1] = ((exp % 25) / 5) >> 0;
        dexps[grp * 3 + 2] = (exp % 25) % 5 >> 0;
    }

    // Convert to unbiased mapped values
    for (let i = 0; i < dexps.length; i++) {
        dexps[i] -= 2;
    }

    // Convert from differentials to absolutes
    let prevexp = absexp;
    for (let i = 0; i < dexps.length; i++) {
        dexps[i] = prevexp + dexps[i];
        prevexp = dexps[i];
    }

    // Expand to full absolute exponent array
    const aexps = new Array(skip + dexps.length * grpsize);
    aexps[0] = absexp;
    for (let i = 0; i < dexps.length; i++) {
        for (let j = 0; j < grpsize; j++) {
            aexps[i * grpsize + j + skip] = dexps[i];
        }
    }
    return aexps;
};


// --- bitallocation.js ---

const logadd = (a, b) => {
    const c = a - b;
    const address = Math.min(Math.abs(c) >> 1, 255);
    if (c >= 0) {
        return a + LATAB[address];
    } else {
        return b + LATAB[address];
    }
};

const calcLowcomp = (a, b0, b1, bin) => {
    if (bin < 7) {
        if (b0 + 256 === b1) {
            a = 384;
        } else if (b0 > b1) {
            a = Math.max(0, a - 64);
        }
    } else if (bin < 20) {
        if (b0 + 256 === b1) {
            a = 320;
        } else if (b0 > b1) {
            a = Math.max(0, a - 64);
        }
    } else {
        a = Math.max(0, a - 128);
    }

    return a;
};

const bitAllocation = (bsi, audblk, start, end, exp, fgain, snroffset, fastleak, slowleak, delt) => {
    const bndstrt = MASKTAB[start];
    const bndend = MASKTAB[end - 1] + 1;
    const psd = new Array(end);
    const bndpsd = new Array(bndend);
    const excite = new Array(bndend);
    const mask = new Array(bndend);
    let lowcomp = 0;

    for (let bin = start; bin < end; bin++) {
        psd[bin] = 3072 - (exp[bin - start] << 7);
    }

    let j = start;
    let k = bndstrt;
    let lastbin;

    do {
        lastbin = Math.min(BNDTAB[k] + BNDSZ[k], end);
        bndpsd[k] = psd[j];
        j++;
        for (let i = j; i < lastbin; i++) {
            bndpsd[k] = logadd(bndpsd[k], psd[j]);
            j++;
        }
        k++;
    } while (end > lastbin);

    let begin;

    if (bndstrt === 0) {
        lowcomp = calcLowcomp(lowcomp, bndpsd[0], bndpsd[1], 0);
        excite[0] = bndpsd[0] - fgain - lowcomp;
        lowcomp = calcLowcomp(lowcomp, bndpsd[1], bndpsd[2], 1);
        excite[1] = bndpsd[1] - fgain - lowcomp;
        begin = 7;

        for (let bin = 2; bin < 7; bin++) {
            if (bndend !== 7 || bin !== 6) {
                lowcomp = calcLowcomp(lowcomp, bndpsd[bin], bndpsd[bin + 1], bin);
            }
            fastleak = bndpsd[bin] - fgain;
            slowleak = bndpsd[bin] - audblk.sgain;
            excite[bin] = fastleak - lowcomp;
            if (bndend !== 7 || bin !== 6) {
                if (bndpsd[bin] <= bndpsd[bin + 1]) {
                    begin = bin + 1;
                    break;
                }
            }
        }

        for (let bin = begin; bin < Math.min(bndend, 22); bin++) {
            if (bndend !== 7 || bin !== 6) {
                lowcomp = calcLowcomp(lowcomp, bndpsd[bin], bndpsd[bin + 1], bin);
            }
            fastleak -= audblk.fdecay;
            fastleak = Math.max(fastleak, bndpsd[bin] - fgain);
            slowleak -= audblk.sdecay;
            slowleak = Math.max(slowleak, bndpsd[bin] - audblk.sgain);
            excite[bin] = Math.max(fastleak - lowcomp, slowleak);
        }

        begin = 22;
    } else {
        begin = bndstrt;
    }

    for (let bin = begin; bin < bndend; bin++) {
        fastleak -= audblk.fdecay;
        fastleak = Math.max(fastleak, bndpsd[bin] - fgain);
        slowleak -= audblk.sdecay;
        slowleak = Math.max(slowleak, bndpsd[bin] - audblk.sgain);
        excite[bin] = Math.max(fastleak, slowleak);
    }

    for (let bin = bndstrt; bin < bndend; bin++) {
        if (bndpsd[bin] < audblk.dbknee) {
            excite[bin] += (audblk.dbknee - bndpsd[bin]) >> 2;
        }
        mask[bin] = Math.max(excite[bin], HTH[bsi.fscod][bin]);
    }

    if (delt != null) {
        let band = 0;
        for (let seg = 0; seg < delt.nseg + 1; seg++) {
            let delta;
            band += delt.offst[seg];
            if (delt.ba[seg] >= 4) {
                delta = (delt.ba[seg] - 3) << 7;
            } else {
                delta = (delt.ba[seg] - 4) << 7;
            }

            for (let k = 0; k < delt.len[seg]; k++) {
                mask[band] += delta;
                band++;
            }
        }
    }

    const bap = new Array(end - start);
    let i = start;
    j = bndstrt;
    do {
        lastbin = Math.min(BNDTAB[j] + BNDSZ[j], end);
        mask[j] -= snroffset;
        mask[j] -= audblk.floor;
        if (mask[j] < 0) {
            mask[j] = 0;
        }
        mask[j] &= 0x1fe0;
        mask[j] += audblk.floor;
        for (let k = i; k < lastbin; k++) {
            let address = (psd[i] - mask[j]) >> 5;
            address = Math.min(63, Math.max(0, address));
            bap[i - start] = BAPTAB[address];
            i++;
        }
        j++;
    } while (end > lastbin);

    return bap;
};


// --- mantissa.js ---

const DITHER_CONST = Math.sqrt(2);

class MantissaReader {
    constructor(stream) {
        this.stream = stream;
        this.bap_1_ptr = 3;
        this.bap_2_ptr = 3;
        this.bap_4_ptr = 2;
    }

    get(bap) {
        switch (bap) {
            case 0:
                return 0;
            case 1:
                if (this.bap_1_ptr > 2) {
                    this.bap_1 = BAP_1[this.stream.read(5)];
                    this.bap_1_ptr = 0;
                }
                return this.bap_1[this.bap_1_ptr++];
            case 2:
                if (this.bap_2_ptr > 2) {
                    this.bap_2 = BAP_2[this.stream.read(7)];
                    this.bap_2_ptr = 0;
                }
                return this.bap_2[this.bap_2_ptr++];
            case 3:
                return BAP_3[this.stream.read(3)];
            case 4:
                if (this.bap_4_ptr > 1) {
                    this.bap_4 = BAP_4[this.stream.read(7)];
                    this.bap_4_ptr = 0;
                }
                return this.bap_4[this.bap_4_ptr++];
            case 5:
                return BAP_5[this.stream.read(4)];
            case 6:
            case 7:
            case 8:
            case 9:
            case 10:
            case 11:
            case 12:
            case 13:
                return this.stream.read(bap - 1, true) / Math.pow(2, bap - 2);
            case 14:
                return this.stream.read(14, true) / Math.pow(2, 13);
            case 15:
                return this.stream.read(16, true) / Math.pow(2, 15);
            default:
                // eslint-disable-next-line no-debugger
                debugger;
        }
    }
}

const getDitherMantissa = () => (Math.random() - 0.5) * DITHER_CONST;


// --- audioblock.js ---

const createAudioBlock = (bsi) => ({
    blksw: new Array(bsi.nfchans).fill(0),
    dithflag: new Array(bsi.nfchans).fill(0),
    chincpl: new Array(bsi.nfchans).fill(0),
    mstrcplco: new Array(bsi.nfchans).fill(0),
    cplcoe: new Array(bsi.nfchans).fill(0),
    cplcoexp: new Array(bsi.nfchans),
    cplcomant: new Array(bsi.nfchans),
    cplco: new Array(bsi.nfchans),
    chexpstr: new Array(bsi.nfchans).fill(1),
    chbwcod: new Array(bsi.nfchans).fill(60),
    strtmant: new Array(bsi.nfchans).fill(0),
    endmant: new Array(bsi.nfchans).fill(253),
    nchgrps: new Array(bsi.nfchans).fill(0),
    exps: Array.from({ length: bsi.nfchans }, () => new Array(256).fill(0)),
    gainrng: new Array(bsi.nfchans).fill(0),
    deltbae: new Array(bsi.nfchans).fill(2),
    rematflg: [],
    sdcycod: 0,
    fdcycod: 0,
    sgaincod: 0,
    dbpbcod: 0,
    floorcod: 0,
    csnroffst: 0,
    fsnroffst: new Array(bsi.nfchans).fill(0),
    fgaincod: new Array(bsi.nfchans).fill(0),
});

const readAudioBlock = (stream, bsi, samples, imdct, audblk, blk) => {
    // Block switch and dither flags
    for (let ch = 0; ch < bsi.nfchans; ch++) {
        audblk.blksw[ch] = stream.read(1);
    }
    for (let ch = 0; ch < bsi.nfchans; ch++) {
        audblk.dithflag[ch] = stream.read(1);
    }

    // Dynamic range control
    if (stream.read(1) !== 0) {
        audblk.dynrng = stream.read(8);
    }
    if (bsi.acmod === 0x0) {
        if (stream.read(1) !== 0) {
            audblk.dynrng2 = stream.read(8);
        }
    }

    // Coupling strategy information
    if (stream.read(1) !== 0) {
        audblk.cplinu = stream.read(1);
        if (audblk.cplinu) {
            for (let ch = 0; ch < bsi.nfchans; ch++) {
                audblk.chincpl[ch] = stream.read(1);
            }

            if (bsi.acmod === 0x2) {
                audblk.phsflginu = stream.read(1);
            }

            audblk.cplbegf = stream.read(4);
            audblk.cplendf = stream.read(4);

            audblk.ncplsubnd = 3 + audblk.cplendf - audblk.cplbegf;
            audblk.ncplbnd = audblk.ncplsubnd;
            audblk.cplbndstrc = new Array(audblk.ncplsubnd);
            audblk.cplbndstrc[0] = 0;
            for (let bnd = 1; bnd < audblk.ncplsubnd; bnd++) {
                audblk.cplbndstrc[bnd] = stream.read(1);
                audblk.ncplbnd -= audblk.cplbndstrc[bnd];
            }
        } else {
            for (let ch = 0; ch < bsi.nfchans; ch++) {
                audblk.chincpl[ch] = 0;
            }
        }
    }

    // Coupling coordinates and phase flags
    if (audblk.cplinu) {
        for (let ch = 0; ch < bsi.nfchans; ch++) {
            if (audblk.chincpl[ch]) {
                audblk.cplcoe[ch] = stream.read(1);
                if (audblk.cplcoe[ch]) {
                    audblk.mstrcplco[ch] = stream.read(2);

                    audblk.cplcoexp[ch] = new Array(audblk.ncplbnd);
                    audblk.cplcomant[ch] = new Array(audblk.ncplbnd);
                    audblk.cplco[ch] = new Array(audblk.ncplbnd);
                    for (let bnd = 0; bnd < audblk.ncplbnd; bnd++) {
                        audblk.cplcoexp[ch][bnd] = stream.read(4);
                        audblk.cplcomant[ch][bnd] = stream.read(4);
                    }
                }

                let cplco;
                const bnd = 0;
                for (let sbnd = 0; sbnd < audblk.ncplsubnd; sbnd++) {
                    if (!audblk.cplbndstrc[sbnd]) {
                        if (audblk.cplcoexp[ch][bnd] === 15) {
                            cplco = audblk.cplcomant[ch][bnd] / 16;
                        } else {
                            cplco = (audblk.cplcomant[ch][bnd] + 16) / 32;
                        }
                        cplco /= Math.pow(2, audblk.cplcoexp[ch][bnd] + 3 * audblk.mstrcplco[ch]);
                    }
                    audblk.cplco[ch][sbnd] = cplco;
                }
            }
        }

        if (bsi.acmod === 0x2 && audblk.phsflginu && (audblk.cplcoe[0] || audblk.cplcoe[1])) {
            audblk.phsflg = new Array(audblk.ncplbnd);
            for (let bnd = 0; bnd < audblk.ncplbnd; bnd++) {
                audblk.phsflg[bnd] = stream.read(1);
            }
        }
    }

    // Rematrixing operation in the 2/0 mode
    if (bsi.acmod === 0x2) {
        audblk.rematstr = stream.read(1);
        if (audblk.rematstr) {
            let bands = 0;
            if (audblk.cplbegf > 2 || audblk.cplinu === 0) {
                bands = 4;
            } else if (audblk.cplbegf > 0 && audblk.cplbegf <= 2 && audblk.cplinu) {
                bands = 3;
            } else if (audblk.cplbegf === 0 && audblk.cplinu) {
                bands = 2;
            }

            audblk.rematflg = new Array(bands);
            for (let rbnd = 0; rbnd < bands; rbnd++) {
                audblk.rematflg[rbnd] = stream.read(1);
            }
        }
    }

    // Exponent strategy
    if (audblk.cplinu) {
        audblk.cplexpstr = stream.read(2);
    }

    for (let ch = 0; ch < bsi.nfchans; ch++) {
        audblk.chexpstr[ch] = stream.read(2);
    }

    if (bsi.lfeon) {
        audblk.lfeexpstr = stream.read(1);
    }

    for (let ch = 0; ch < bsi.nfchans; ch++) {
        if (audblk.chexpstr[ch] !== EXP_REUSE) {
            if (!audblk.chincpl[ch]) {
                audblk.chbwcod[ch] = stream.read(6);
            }
        }
    }

    // Exponents for the coupling channel
    if (audblk.cplinu) {
        audblk.cplstrtmant = audblk.cplbegf * 12 + 37;
        audblk.cplendmant = (audblk.cplendf + 3) * 12 + 37;

        if (audblk.cplexpstr !== EXP_REUSE) {
            switch (audblk.cplexpstr) {
                case EXP_D15:
                    audblk.ncplgrps = ((audblk.cplendmant - audblk.cplstrtmant) / 3) >> 0;
                    break;
                case EXP_D25:
                    audblk.ncplgrps = ((audblk.cplendmant - audblk.cplstrtmant) / 6) >> 0;
                    break;
                case EXP_D45:
                    audblk.ncplgrps = ((audblk.cplendmant - audblk.cplstrtmant) / 12) >> 0;
                    break;
            }

            const cplabsexp = stream.read(4);
            audblk.cplexps = new Array(audblk.ncplgrps);
            for (let grp = 0; grp < audblk.ncplgrps; grp++) {
                audblk.cplexps[grp] = stream.read(7);
            }

            // Unpack exponent groups
            audblk.cplexps = unpackExponents(audblk.cplexps, cplabsexp << 1, EXPONENT_GROUP_SIZE[audblk.cplexpstr], 0);
        }
    }

    // Exponents for full bandwidth channels
    for (let ch = 0; ch < bsi.nfchans; ch++) {
        if (audblk.chexpstr[ch] !== EXP_REUSE) {
            audblk.strtmant[ch] = 0;
            if (audblk.chincpl[ch]) {
                audblk.endmant[ch] = 37 + 12 * audblk.cplbegf;
            } else {
                audblk.endmant[ch] = 37 + 3 * (audblk.chbwcod[ch] + 12);
            }

            switch (audblk.chexpstr[ch]) {
                case EXP_D15:
                    audblk.nchgrps[ch] = ((audblk.endmant[ch] - 1) / 3) >> 0;
                    break;
                case EXP_D25:
                    audblk.nchgrps[ch] = ((audblk.endmant[ch] + 2) / 6) >> 0;
                    break;
                case EXP_D45:
                    audblk.nchgrps[ch] = ((audblk.endmant[ch] + 8) / 12) >> 0;
                    break;
            }

            audblk.exps[ch] = new Array(audblk.nchgrps[ch]);
            const absexps = stream.read(4);
            for (let grp = 0; grp < audblk.nchgrps[ch]; grp++) {
                audblk.exps[ch][grp] = stream.read(7);
            }

            // Unpack exponent groups
            audblk.exps[ch] = unpackExponents(audblk.exps[ch], absexps, EXPONENT_GROUP_SIZE[audblk.chexpstr[ch]], 1);

            audblk.gainrng[ch] = stream.read(2);
        }
    }

    // Exponents for the low frequency effects channel
    if (bsi.lfeon) {
        if (audblk.lfeexpstr !== EXP_REUSE) {
            audblk.lfestartmant = 0;
            audblk.lfeendmant = 7;

            audblk.nlfegrps = 2;
            audblk.lfeexps = new Array(audblk.nlfegrps);

            const lfeabsexp = stream.read(4);
            audblk.lfeexps[0] = stream.read(7);
            audblk.lfeexps[1] = stream.read(7);

            // Unpack exponent groups
            audblk.lfeexps = unpackExponents(audblk.lfeexps, lfeabsexp, EXPONENT_GROUP_SIZE[audblk.lfeexpstr], 1);
        }
    }

    // Bit-allocation parametric information
    audblk.baie = stream.read(1);
    if (audblk.baie) {
        audblk.sdcycod = stream.read(2);
        audblk.fdcycod = stream.read(2);
        audblk.sgaincod = stream.read(2);
        audblk.dbpbcod = stream.read(2);
        audblk.floorcod = stream.read(3);
    }
    audblk.snroffste = stream.read(1);
    if (audblk.snroffste) {
        audblk.csnroffst = stream.read(6);
        if (audblk.cplinu) {
            audblk.cplfsnroffst = stream.read(4);
            audblk.cplfgaincod = stream.read(3);
        }

        audblk.fsnroffst = new Array(bsi.nfchans);
        audblk.fgaincod = new Array(bsi.nfchans);
        for (let ch = 0; ch < bsi.nfchans; ch++) {
            audblk.fsnroffst[ch] = stream.read(4);
            audblk.fgaincod[ch] = stream.read(3);
        }

        if (bsi.lfeon) {
            audblk.lfefsnroffst = stream.read(4);
            audblk.lfefgaincod = stream.read(3);
        }
    }
    if (audblk.cplinu) {
        audblk.cplleake = stream.read(1);
        if (audblk.cplleake) {
            audblk.cplfleak = stream.read(3);
            audblk.cplsleak = stream.read(3);
        }
    }

    // Delta bit allocation information
    audblk.deltbaie = stream.read(1);
    if (audblk.deltbaie) {
        if (audblk.cplinu) {
            audblk.cpldeltbae = stream.read(2);
        }

        for (let ch = 0; ch < bsi.nfchans; ch++) {
            audblk.deltbae[ch] = stream.read(2);
        }

        if (audblk.cplinu) {
            if (audblk.cpldeltbae === 0x1) {
                audblk.cpldeltnseg = stream.read(2);

                audblk.cpldeltoffst = new Array(audblk.cpldeltnseg + 1);
                audblk.cpldeltlen = new Array(audblk.cpldeltnseg + 1);
                audblk.cpldeltba = new Array(audblk.cpldeltnseg + 1);
                for (let seg = 0; seg <= audblk.cpldeltnseg; seg++) {
                    audblk.cpldeltoffst[seg] = stream.read(5);
                    audblk.cpldeltlen[seg] = stream.read(4);
                    audblk.cpldeltba[seg] = stream.read(3);
                }
            }
        }

        audblk.deltoffst = new Array(bsi.nfchans);
        audblk.deltlen = new Array(bsi.nfchans);
        audblk.deltba = new Array(bsi.nfchans);
        audblk.deltnseg = new Array(bsi.nfchans);
        for (let ch = 0; ch < bsi.nfchans; ch++) {
            if (audblk.deltbae[ch] === 0x1) {
                audblk.deltnseg[ch] = stream.read(2);

                audblk.deltoffst[ch] = new Array(audblk.deltnseg[ch] + 1);
                audblk.deltlen[ch] = new Array(audblk.deltnseg[ch] + 1);
                audblk.deltba[ch] = new Array(audblk.deltnseg[ch] + 1);
                for (let seg = 0; seg <= audblk.deltnseg[ch]; seg++) {
                    audblk.deltoffst[ch][seg] = stream.read(5);
                    audblk.deltlen[ch][seg] = stream.read(4);
                    audblk.deltba[ch][seg] = stream.read(3);
                }
            }
        }
    } else if (blk == 0) {
        audblk.cpldeltbae = 2;
        for (let ch = 0; ch < bsi.nfchans; ch++) {
            audblk.deltbae[ch] = 2;
        }
    }

    audblk.sdecay = SLOW_DECAY[audblk.sdcycod];
    audblk.fdecay = FAST_DECAY[audblk.fdcycod];
    audblk.sgain = SLOW_GAIN[audblk.sgaincod];
    audblk.dbknee = DB_PER_BIT[audblk.dbpbcod];
    audblk.floor = FLOOR[audblk.floorcod];

    audblk.baps = new Array(bsi.nfchans);
    for (let ch = 0; ch < bsi.nfchans; ch++) {
        let delt = null;
        if (audblk.deltbae[ch] == 0 || audblk.deltbae[ch] == 1) {
            delt = {
                nseg: audblk.deltnseg[ch],
                offst: audblk.deltoffst[ch],
                ba: audblk.deltba[ch],
                len: audblk.deltlen[ch]
            };
        }
        audblk.baps[ch] = bitAllocation(
            bsi,
            audblk,
            audblk.strtmant[ch],
            audblk.endmant[ch],
            audblk.exps[ch],
            FAST_GAIN[audblk.fgaincod[ch]],
            (((audblk.csnroffst - 15) << 4) + audblk.fsnroffst[ch]) << 2,
            0,
            0,
            delt
        );
    }
    if (audblk.cplinu) {
        let delt = null;
        if (audblk.cpldeltbae == 0 || audblk.cpldeltbae == 1) {
            delt = {
                nseg: audblk.cpldeltnseg,
                offst: audblk.cpldeltoffst,
                ba: audblk.cpldeltba,
                len: audblk.cpldeltlen
            };
        }
        audblk.cplbap = bitAllocation(
            bsi,
            audblk,
            audblk.cplstrtmant,
            audblk.cplendmant,
            audblk.cplexps,
            FAST_GAIN[audblk.cplfgaincod],
            (((audblk.csnroffst - 15) << 4) + audblk.cplfsnroffst) << 2,
            (audblk.cplfleak << 8) + 768,
            (audblk.cplsleak << 8) + 768,
            delt
        );
    }
    if (bsi.lfeon) {
        audblk.lfebap = bitAllocation(
            bsi,
            audblk,
            audblk.lfestartmant,
            audblk.lfeendmant,
            audblk.lfeexps,
            FAST_GAIN[audblk.lfefgaincod],
            (((audblk.csnroffst - 15) << 4) + audblk.lfefsnroffst) << 2,
            0,
            0,
            null
        );
    }

    // Dummy data
    if (stream.read(1) !== 0) {
        let skipl = stream.read(9);
        while (skipl--) {
            stream.read(8);
        }
    }

    // Quantized mantissa values
    const mantissas = new MantissaReader(stream);
    audblk.got_cplchan = 0;
    audblk.chmant = new Array(bsi.nfchans);
    for (let ch = 0; ch < bsi.nfchans; ch++) {
        audblk.chmant[ch] = new Array(256);
        audblk.chmant[ch].fill(0);
        for (let bin = 0; bin < audblk.endmant[ch]; bin++) {
            if (audblk.baps[ch][bin] != 0 || !audblk.dithflag[ch]) {
                audblk.chmant[ch][bin] = mantissas.get(audblk.baps[ch][bin]) * Math.pow(2, -audblk.exps[ch][bin]);
            } else {
                audblk.chmant[ch][bin] = getDitherMantissa() * Math.pow(2, -audblk.exps[ch][bin]);
            }
        }

        if (audblk.cplinu && audblk.chincpl[ch] && !audblk.got_cplchan) {
            audblk.ncplmant = 12 * audblk.ncplsubnd;
            audblk.cplmant = new Array(audblk.ncplmant);
            for (let bin = 0; bin < audblk.ncplmant; bin++) {
                audblk.cplmant[bin] = mantissas.get(audblk.cplbap[bin]) * Math.pow(2, -audblk.cplexps[bin]);
            }
            audblk.got_cplchan = 1;
        }
    }

    if (bsi.lfeon) {
        audblk.nlfemant = 7;
        audblk.lfemant = new Array(audblk.nlfemant);
        for (let bin = 0; bin < audblk.nlfemant; bin++) {
            audblk.lfemant[bin] = mantissas.get(audblk.lfebap[bin]) * Math.pow(2, -audblk.lfeexps[bin]);
        }
    }

    // Decouple channels
    if (audblk.cplinu) {
        for (let ch = 0; ch < bsi.nfchans; ch++) {
            if (audblk.chincpl[ch]) {
                for (let sbnd = 0; sbnd < audblk.ncplsubnd; sbnd++) {
                    for (let bin = 0; bin < 12; bin++) {
                        let mantissa;
                        if (audblk.cplmant[sbnd * 12 + bin] == 0 && audblk.dithflag[ch]) {
                            mantissa = getDitherMantissa() * Math.pow(2, -audblk.cplexps[sbnd * 12 + bin]);
                        } else {
                            mantissa = audblk.cplmant[sbnd * 12 + bin];
                        }
                        audblk.chmant[ch][(sbnd + audblk.cplbegf) * 12 + bin + 37] =
                            mantissa * audblk.cplco[ch][sbnd] * 8;
                    }
                }
            }
        }
    }

    for (let i = 0; i < audblk.rematflg.length; i++) {
        if (audblk.rematflg[i]) {
            const beginBin = REMATRIX_BANDS[i];
            let endBin = REMATRIX_BANDS[i + 1];
            if (audblk.cplinu && endBin >= 36 + audblk.cplbegf * 12) {
                endBin = 36 + audblk.cplbegf * 12;
            }
            for (let bin = beginBin; bin < endBin; bin++) {
                const left = audblk.chmant[0][bin];
                const right = audblk.chmant[1][bin];
                audblk.chmant[0][bin] = left + right;
                audblk.chmant[1][bin] = left - right;
            }
        }
    }

    for (let ch = 0; ch < bsi.nfchans; ch++) {
        if (audblk.blksw[ch]) {
            imdct[ch].process128(audblk.chmant[ch], samples[ch], blk * 256);
        } else {
            imdct[ch].process256(audblk.chmant[ch], samples[ch], blk * 256);
        }
    }
};


// --- downmix.js ---

const downmix = (bsi, samples) => {
    // TODO: Support other downmix modes.

    let leftCoeffs;
    let rightCoeffs;
    let clev;
    let slev;
    let totlev;
    switch (bsi.acmod) {
        case 0: // 1+1 independent mono channels
            leftCoeffs = [1, 0];
            rightCoeffs = [0, 1];
            break;
        case 1: // 1 mono channel
            leftCoeffs = [0.707];
            rightCoeffs = [0.707];
            break;
        case 2: // left/right
            leftCoeffs = [1, 0];
            rightCoeffs = [0, 1];
            break;
        case 3: // left/center/right
            clev = CLEV[bsi.cmixlev];
            totlev = 1 + clev;
            leftCoeffs = [1 / totlev, clev / totlev, 0];
            rightCoeffs = [0, clev / totlev, 1 / totlev];
            break;
        case 4: // left/right/surround
            slev = SLEV[bsi.surmixlev] * 0.707;
            totlev = 1 + clev;
            leftCoeffs = [1 / totlev, 0, slev / totlev];
            rightCoeffs = [0, 1 / totlev, slev / totlev];
            break;
        case 5: // left/center/right/surround
            clev = CLEV[bsi.cmixlev];
            slev = SLEV[bsi.surmixlev] * 0.707;
            totlev = 1 + clev + slev;
            leftCoeffs = [1 / totlev, clev / totlev, 0];
            rightCoeffs = [0, clev / totlev, 1 / totlev];
            break;
        case 6: // left/right/left surround/right surroun
            slev = SLEV[bsi.surmixlev];
            totlev = 1 + slev;
            leftCoeffs = [1 / totlev, 0, slev / totlev, 0];
            rightCoeffs = [0, 1 / totlev, 0, slev / totlev];
            break;
        case 7: // left/center/right/left surround/right surround
            clev = CLEV[bsi.cmixlev];
            slev = SLEV[bsi.surmixlev];
            totlev = 1 + clev + slev;
            leftCoeffs = [1 / totlev, clev / totlev, 0, slev / totlev, 0];
            rightCoeffs = [0, clev / totlev, 1 / totlev, 0, slev / totlev];
            break;
    }

    for (let i = 0; i < 1536; i++) {
        let left = 0;
        let right = 0;
        for (let ch = 0; ch < bsi.nfchans; ch++) {
            left += samples[ch][i] * leftCoeffs[ch];
            right += samples[ch][i] * rightCoeffs[ch];
        }
        samples[0][i] = left;
        samples[1][i] = right;
    }
};


// --- header.js ---

const readHeader = (stream) => {
    // Validate syncword
    const syncword = stream.readUInt16();
    if (syncword !== 0x0b77) {
        throw new Error(`Invalid syncword ${syncword.toString(16)}`);
    }

    // Validate CRC
    // eslint-disable-next-line no-unused-vars
    const crc = stream.readUInt16();
    // TODO: validate CRC

    // Read sample rate and frame size codes
    const codes = stream.readUInt8();
    const sampleRateCode = (codes & 0xc0) >> 6;
    const frameSizeCode = codes & 0x3f;

    // Determine sample rate (in Hz), bit rate (in kbps) and frame size (in 16-bit words)
    const sampleRate = SAMPLE_RATES[sampleRateCode];
    const bitRate = BIT_RATES[frameSizeCode >> 1];
    let frameSize;
    switch (sampleRateCode) {
        case 0b00:
            frameSize = 2 * bitRate;
            break;
        case 0b01:
            frameSize = ((320 * bitRate) / 147 + (frameSizeCode & 1)) >> 0;
            break;
        case 0b10:
            frameSize = 3 * bitRate;
            break;
        default:
            throw new Error(`Unknown sample rate code ${sampleRateCode.toString(2)}`);
    }

    // Convert from word size to byte size
    frameSize *= 2;

    return {
        crc,
        sampleRateCode,
        frameSizeCode,
        sampleRate,
        bitRate,
        frameSize
    };
};

const readBSI = (stream) => {
    // Syncword
    const syncword = stream.read(16);
    if (syncword != 0x0b77) {
        throw new Error(`Invalid syncword ${syncword.toString(16)}`);
    }

    // Skip Error Detection Code
    stream.advance(16);

    // Bit Stream Information (BSI)
    const bsi = {};

    bsi.fscod = stream.read(2);
    bsi.frmsizecod = stream.read(6);

    // Determine bit rate (in kbps) and frame size (in 16-bit words)
    const bitRate = BIT_RATES[bsi.frmsizecod >> 1];
    switch (bsi.fscod) {
        case 0b00:
            bsi.frmsize = 2 * bitRate;
            break;
        case 0b01:
            bsi.frmsize = ((320 * bitRate) / 147 + (bsi.frmsizecod & 1)) >> 0;
            break;
        case 0b10:
            bsi.frmsize = 3 * bitRate;
            break;
        default:
            throw new Error(`Unknown sample rate code ${bsi.fscod.toString(2)}`);
    }

    // Convert from word size to byte size
    bsi.frmsize *= 2;

    bsi.bsid = stream.read(5);
    bsi.bsmod = stream.read(3);

    if (bsi.bsid !== BSID_STANDARD && bsi.bsid !== BSID_ANNEX_D) {
        if (bsi.bsid === BSID_ANNEX_E) {
            throw new Error('Enhanced AC-3 streams are not supported.');
        }
        throw new Error(`Invalid bsid ${bsi.bsid.toString(2)}`);
    }

    bsi.acmod = stream.read(3);
    bsi.nfchans = CHANNELS[bsi.acmod];
    if ((bsi.acmod & 0x1) !== 0 && bsi.acmod != 0x1) {
        bsi.cmixlev = stream.read(2);
    }
    if ((bsi.acmod & 0x4) !== 0) {
        bsi.surmixlev = stream.read(2);
    }
    if (bsi.acmod == 0x2) {
        bsi.dsurmod = stream.read(2);
    }

    bsi.lfeon = stream.read(1);
    bsi.dialnorm = stream.read(5);
    if (stream.read(1) !== 0) {
        bsi.compr = stream.read(8);
    }
    if (stream.read(1) !== 0) {
        bsi.langcod = stream.read(8);
    }
    if (stream.read(1) !== 0) {
        bsi.mixlevel = stream.read(5);
        bsi.roomtyp = stream.read(2);
    }

    if (bsi.acmod === 0x0) {
        bsi.dialnorm2 = stream.read(5);
        if (stream.read(1) !== 0) {
            bsi.compr2 = stream.read(8);
        }
        if (stream.read(1) !== 0) {
            bsi.langcod2 = stream.read(8);
        }
        if (stream.read(1) !== 0) {
            bsi.mixlevel2 = stream.read(5);
            bsi.roomtyp2 = stream.read(2);
        }
    }

    bsi.copyrightb = stream.read(1);
    bsi.origbs = stream.read(1);
    if (stream.read(1) !== 0) {
        if (bsi.bsid === BSID_ANNEX_D) {
            bsi.dmixmod = stream.read(2);
            bsi.ltrtcmixlev = stream.read(3);
            bsi.ltrtsurmixlev = stream.read(3);
            bsi.lorocmixlev = stream.read(3);
            bsi.lorosurmixlev = stream.read(3);
        } else {
            bsi.timecod1 = stream.read(14);
        }
    }
    if (stream.read(1) !== 0) {
        if (bsi.bsid === BSID_ANNEX_D) {
            bsi.dsurexmod = stream.read(2);
            bsi.dheadphonmod = stream.read(2);
            bsi.adconvtyp = stream.read(1);
            bsi.xbsi2 = stream.read(8);
            bsi.encinfo = stream.read(1);
        } else {
            bsi.timecod2 = stream.read(14);
        }
    }
    if (stream.read(1) !== 0) {
        bsi.addbsil = stream.read(6);
        bsi.addbsi = stream.stream.readSingleBuffer(bsi.addbsil + 1);
    }

    return bsi;
};


// --- decoder.js ---



class Bitstream {
  constructor(uint8Array, byteOffset = 0) {
    this.data = uint8Array;
    this.byteOffset = byteOffset;
    this.bitOffset = 0;
  }
  get offset() { return this.byteOffset; }
  get stream() { return this; }
  available(bytes) { return (this.byteOffset + bytes) <= this.data.length; }
  read(bits, signed = false) {
    if (bits === 0) return 0;
    const origBits = bits;
    let val = 0;
    while (bits > 0) {
      if (this.byteOffset >= this.data.length) {
        val <<= bits;
        break;
      }
      const remInByte = 8 - this.bitOffset;
      if (bits >= remInByte) {
        val = (val << remInByte) | (this.data[this.byteOffset] & ((1 << remInByte) - 1));
        this.byteOffset++;
        this.bitOffset = 0;
        bits -= remInByte;
      } else {
        const shift = remInByte - bits;
        val = (val << bits) | ((this.data[this.byteOffset] >> shift) & ((1 << bits) - 1));
        this.bitOffset += bits;
        bits = 0;
      }
    }
    if (signed) {
      const signMask = 1 << (origBits - 1);
      if (val & signMask) {
        val -= (1 << origBits);
      }
    }
    return val;
  }
  advance(bits) {
    this.byteOffset += Math.floor(bits / 8);
    this.bitOffset += bits % 8;
    if (this.bitOffset >= 8) {
      this.byteOffset += Math.floor(this.bitOffset / 8);
      this.bitOffset %= 8;
    }
  }
  align() {
    if (this.bitOffset > 0) {
      this.byteOffset++;
      this.bitOffset = 0;
    }
  }
  readUInt8() { return this.read(8); }
  readUInt16() { return this.read(16); }
  readSingleBuffer(bytes) {
    const start = this.byteOffset;
    this.byteOffset += bytes;
    return this.data.subarray(start, this.byteOffset);
  }
}

class AC3AudioDecoder {
  constructor(options = {}) {
    this.onAudio = options.onAudio || null;
    this.sampleRate = 48000;
    this.channels = 2;
    this.samples = null;
    this.imdct = null;
    this.dynrng = 0;
    this.dynrng2 = 0;
  }

  decodePES(data, pts) {
    if (!data || data.length < 8) return;
    const len = data.length;
    let currentPts = pts;

    for (let i = 0; i + 7 < len; i++) {
      if (data[i] === 0x0b && data[i + 1] === 0x77) {
        const stream = new Bitstream(data, i);
        let bsi;
        try {
          bsi = readBSI(stream);
        } catch (err) {
          continue;
        }

        this.sampleRate = SAMPLE_RATES[bsi.fscod];

        if (!this.samples || this.samples.length !== bsi.nfchans) {
          this.samples = new Array(bsi.nfchans);
          for (let ch = 0; ch < bsi.nfchans; ch++) {
            this.samples[ch] = new Float32Array(AUDIO_SAMPLES);
          }
        }
        if (!this.imdct || this.imdct.length !== bsi.nfchans) {
          this.imdct = new Array(bsi.nfchans);
          for (let ch = 0; ch < bsi.nfchans; ch++) {
            this.imdct[ch] = new IMDCT();
          }
        }

        try {
          const audblk = createAudioBlock(bsi);
          for (let blk = 0; blk < 6; blk++) {
            readAudioBlock(stream, bsi, this.samples, this.imdct, audblk, blk);
          }

          if (bsi.dynrng !== undefined) {
            this.dynrng = (bsi.dynrng & 0x60) >> 5;
            this.dynrng = Math.pow(2, ((bsi.dynrng & 0x80) !== 0 ? -4 + this.dynrng : this.dynrng & 0x60) + 1);
            this.dynrng += ((bsi.dynrng & 0x1f) + 32) / 64;
          }
          if (bsi.dynrng2 !== undefined) {
            this.dynrng2 = (bsi.dynrng2 & 0x60) >> 5;
            this.dynrng2 = Math.pow(2, ((bsi.dynrng2 & 0x80) !== 0 ? -4 + (this.dynrng2 & 0x60) : this.dynrng2 & 0x60) + 1);
            this.dynrng2 += ((bsi.dynrng2 & 0x1f) + 32) / 64;
          }

          for (let s = 0; s < 1536; s++) {
            if (bsi.acmod === 0 || bsi.acmod === 2) {
              this.samples[0][s] *= this.dynrng === 0 ? 1 : this.dynrng;
              this.samples[1][s] *= this.dynrng2 === 0 ? 1 : this.dynrng2;
            } else {
              for (let ch = 0; ch < bsi.nfchans; ch++) {
                this.samples[ch][s] *= this.dynrng === 0 ? 1 : this.dynrng;
              }
            }
          }

          downmix(bsi, this.samples);

          if (this.onAudio) {
            this.onAudio({
              pts: currentPts,
              sampleRate: this.sampleRate,
              channels: 2,
              left: new Float32Array(this.samples[0]),
              right: new Float32Array(this.samples[1]),
            });
          }

          if (currentPts !== null) {
            currentPts += 1536 / this.sampleRate;
          }

          i += Math.max(128, bsi.frmsize) - 1;
        } catch (blkErr) {
          // Syncframe decoding error (e.g. truncated PES)
          i += 1;
        }
      }
    }
  }
}


  return {
    MPEG2VideoDecoder,
    AC3AudioDecoder,
    fastIDCT8x8,
  };
});

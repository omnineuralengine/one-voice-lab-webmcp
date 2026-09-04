class FluxPcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requestedMs = Number(options?.processorOptions?.targetFrameMs ?? 80);
    const boundedMs = Math.max(20, Math.min(250, requestedMs));
    this.frameSize = Math.max(128, Math.round(sampleRate * boundedMs / 1000));
    this.frame = new Float32Array(this.frameSize);
    this.offset = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel?.length) return true;

    let readOffset = 0;
    while (readOffset < channel.length) {
      const available = this.frameSize - this.offset;
      const count = Math.min(available, channel.length - readOffset);
      this.frame.set(channel.subarray(readOffset, readOffset + count), this.offset);
      this.offset += count;
      readOffset += count;

      if (this.offset === this.frameSize) {
        let sumSquares = 0;
        for (let index = 0; index < this.frame.length; index += 1) {
          sumSquares += this.frame[index] * this.frame[index];
        }
        const payload = this.frame.buffer;
        this.port.postMessage({ type: "pcm-frame", samples: payload, rms: Math.sqrt(sumSquares / this.frame.length) }, [payload]);
        this.frame = new Float32Array(this.frameSize);
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor("flux-pcm-capture", FluxPcmCaptureProcessor);

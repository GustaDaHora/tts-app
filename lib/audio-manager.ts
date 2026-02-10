export class AudioManager {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;

  constructor() {
    if (typeof window !== "undefined") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
  }

  public getContext(): AudioContext | null {
    return this.audioContext;
  }

  public async ensureRunning() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  public reset() {
    this.nextStartTime = 0;
    // We don't close the context, just reset the scheduling time.
    // However, if we want to stop currently playing audio, we might need to suspend or close.
    // For simplicity in this app, we can close and recreate if needed, but keeping it simple for now.
    if (this.audioContext) {
        // Simple way to stop: suspend (but that pauses) or close. 
        // Let's just reset the time reference. Actual stop happens by not scheduling more chunks.
        // For immediate stop, we'd need to track source nodes.
    }
  }

  public async stop() {
      if (this.audioContext) {
          await this.audioContext.close();
          this.audioContext = null; // Force recreation on next use
          this.nextStartTime = 0;
      }
  }

  public scheduleChunk(samples: Float32Array, sampleRate: number) {
    if (!this.audioContext) {
         const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }

    const ctx = this.audioContext;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    // Fix: Create a new Float32Array to ensure it's treated as a standard ArrayBuffer-backed array
    // This resolves the mismatch between ArrayBufferLike (which includes SharedArrayBuffer) and ArrayBuffer
    const standardSamples = new Float32Array(samples);
    buffer.copyToChannel(standardSamples, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Schedule
    const currentTime = ctx.currentTime;
    // If nextStartTime is in the past, reset it to current + small buffer
    const startTime = Math.max(currentTime, this.nextStartTime);
    
    source.start(startTime);

    this.nextStartTime = startTime + buffer.duration;
    
    return source;
  }
}

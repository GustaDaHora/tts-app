export class AudioManager {
  private audioContext: AudioContext | null = null;
  private activeSource: AudioBufferSourceNode | null = null;

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
    this.stop();
  }

  public stop() {
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
      this.activeSource = null;
    }
  }

  public setPlaybackRate(rate: number) {
      if (this.activeSource) {
          this.activeSource.playbackRate.value = rate;
      }
  }

  /**
   * Plays a specific audio buffer immediately.
   * @param buffer The AudioBuffer to play.
   * @param onEnded Callback when playback finishes.
   * @returns The created AudioBufferSourceNode.
   */
  public playBuffer(buffer: AudioBuffer, onEnded?: () => void) {
    if (!this.audioContext) {
         const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }

    // Stop any currently playing audio before starting new one (if strictly sequential)
    // For this app, we want to replace the current chunk if the user skips, so stopping is good.
    this.stop();

    const ctx = this.audioContext;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    source.onended = () => {
        if (this.activeSource === source) {
            this.activeSource = null;
        }
        if (onEnded) onEnded();
    };

    source.start(0);
    this.activeSource = source;
    
    return source;
  }

  public createBuffer(samples: Float32Array, sampleRate: number): AudioBuffer {
     if (!this.audioContext) {
         const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioContextClass();
    }
    const ctx = this.audioContext;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);
    const standardSamples = new Float32Array(samples);
    buffer.copyToChannel(standardSamples, 0);
    return buffer;
  }
}

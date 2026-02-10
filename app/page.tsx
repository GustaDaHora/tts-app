"use client";

import { useState, useRef, useEffect } from "react";
import Script from "next/script";
import { useSherpaTTS } from "../hooks/use-sherpa-tts";
import { AudioManager } from "../lib/audio-manager";
import { audioBufferToWav, mergeAudioBuffers } from "../lib/wav-encoder";

export default function Home() {
  const [text, setText] = useState<string>(
    "Olá! Este é um teste da Sherpa ONNX rodando localmente no seu navegador. O processamento de textos longos agora é feito em pedaços para reduzir a latência e começar a falar mais rápido.",
  );

  // No prefix needed for Vercel/Root deployment
  const prefix = "./";

  const { ttsRef, status, isReady } = useSherpaTTS();

  // New State Management
  interface TTSChunk {
    id: number;
    text: string;
    audioBuffer: AudioBuffer | null;
    duration: number;
    isGenerating: boolean;
  }

  const [chunks, setChunks] = useState<TTSChunk[]>([]);
  const [activeChunkIndex, setActiveChunkIndex] = useState<number | null>(null);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [totalChunks, setTotalChunks] = useState(0); // Legacy, can derive from chunks.length
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio Manager
  const audioManagerRef = useRef<AudioManager | null>(null);
  const isCancelledRef = useRef<boolean>(false);
  const playbackIndexRef = useRef<number | null>(null); // To track current playback for async loops

  // --- Helper: Text Segmentation ---
  const splitTextIntoChunks = (text: string, maxChunkSize = 200): string[] => {
    // Split by sentence terminators, keeping the terminator
    const sentences = text.match(/[^.!?;\n]+[.!?;\n]*/g) || [text];

    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize) {
        if (currentChunk.trim()) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    if (currentChunk.trim()) chunks.push(currentChunk.trim());

    return chunks;
  };

  const getAudioManager = () => {
    if (!audioManagerRef.current) {
      audioManagerRef.current = new AudioManager();
    }
    return audioManagerRef.current;
  };

  const stopPlayback = () => {
    const mgr = getAudioManager();
    mgr.stop();
    setIsPlaying(false);
    setActiveChunkIndex(null);
    playbackIndexRef.current = null;
  };

  // To solve state staleness in async loops, we'll use a ref for chunks
  const chunksRef = useRef<TTSChunk[]>([]);
  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  // Auto-scroll to active chunk
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (activeChunkIndex !== null && chunkRefs.current[activeChunkIndex]) {
      chunkRefs.current[activeChunkIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [activeChunkIndex]);

  // Sync playback rate in real-time
  useEffect(() => {
    if (audioManagerRef.current) {
      audioManagerRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  const handleDownloadChunk = (chunk: TTSChunk) => {
    if (!chunk.audioBuffer) return;
    const blob = audioBufferToWav(chunk.audioBuffer);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chunk-${chunk.id + 1}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    const buffers = chunks
      .map((c) => c.audioBuffer)
      .filter((b): b is AudioBuffer => !!b);
    if (buffers.length === 0) return;

    const mgr = getAudioManager();
    if (!mgr) return;
    const ctx = mgr.getContext();
    if (!ctx) return; // Should be init if we have buffers

    const merged = mergeAudioBuffers(buffers, ctx);
    if (!merged) return;

    const blob = audioBufferToWav(merged);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "full-speech.wav";
    a.click();
    URL.revokeObjectURL(url);
  };

  const internalPlayChunk = async (index: number) => {
    if (isCancelledRef.current) return;

    const currentChunks = chunksRef.current;
    if (index >= currentChunks.length) {
      setIsPlaying(false);
      setActiveChunkIndex(null);
      return;
    }

    // Wait for buffer availability
    let chunk = currentChunks[index];
    let attempts = 0;
    while (!chunk.audioBuffer && chunk.isGenerating && attempts < 1000) {
      if (isCancelledRef.current) return;
      await new Promise((r) => setTimeout(r, 50));
      chunk = chunksRef.current[index]; // Update local ref
      attempts++;
    }

    if (!chunk.audioBuffer) {
      console.error("Chunk buffer missing or generation failed", index);
      // Skip or stop? Let's skip to next
      internalPlayChunk(index + 1);
      return;
    }

    const mgr = getAudioManager();

    // Play
    setActiveChunkIndex(index);
    playbackIndexRef.current = index;

    // Create callback for when this chunk ends
    const onEnded = () => {
      if (!isCancelledRef.current && playbackIndexRef.current === index) {
        internalPlayChunk(index + 1);
      }
    };

    const source = mgr.playBuffer(chunk.audioBuffer, onEnded);
    // Apply speed if supported (source.playbackRate.value = playbackRate)
    source.playbackRate.value = playbackRate;
  };

  const handleSpeak = async () => {
    if (!ttsRef.current || !text) return;

    // Reset logic
    isCancelledRef.current = false;
    stopPlayback();

    const textChunks = splitTextIntoChunks(text);
    const initialChunks: TTSChunk[] = textChunks.map((c, i) => ({
      id: i,
      text: c,
      audioBuffer: null,
      duration: 0,
      isGenerating: true,
    }));

    setChunks(initialChunks);
    // chunksRef will update via effect, but for immediate local use:
    chunksRef.current = initialChunks;
    setTotalChunks(initialChunks.length);
    setIsSynthesizing(true);
    setIsPlaying(true); // Auto-start

    const mgr = getAudioManager();
    await mgr.ensureRunning();

    // Start Playback Loop independently (fire and forget, it will wait for data)
    internalPlayChunk(0);

    // Start Generation Loop
    try {
      for (let i = 0; i < textChunks.length; i++) {
        if (isCancelledRef.current) break;

        // Yield for UI
        await new Promise((r) => setTimeout(r, 20));

        const chunkText = textChunks[i];

        // Generate
        const audioData = ttsRef.current.generate({
          text: chunkText,
          sid: 0,
          speed: 1.0, // Always generate at 1.0x, handle speed in playback
        });

        // Create Buffer
        const buffer = mgr.createBuffer(
          audioData.samples,
          audioData.sampleRate,
        );

        // Update State
        setChunks((prev) => {
          const newChunks = [...prev];
          newChunks[i] = {
            ...newChunks[i],
            audioBuffer: buffer,
            duration: buffer.duration,
            isGenerating: false,
          };
          return newChunks;
        });
      }
    } catch (e) {
      console.error("Generation error", e);
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleStop = () => {
    isCancelledRef.current = true;
    stopPlayback();
    setIsSynthesizing(false);
  };

  // Handlers for controls
  const handleManualPlay = (index: number) => {
    isCancelledRef.current = false; // Reset cancel state if we are just jumping around (but safeguard generation?)
    // Actually if we jump, we shouldn't stop generation, just playback.
    // But `internalPlayChunk` checks isCancelledRef.
    // Let's separate "User Stop" from "Playback Jump".
    // For now, if generating, we can't easily jump without complex flags.
    // Let's assume manual play is only safe if we update the playback index ref.

    const mgr = getAudioManager();
    mgr.stop(); // Stop current

    setIsPlaying(true);
    internalPlayChunk(index);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-900 to-black text-white selection:bg-green-500 selection:text-black">
      <Script
        src={`${prefix}/sherpa-onnx-wasm-main-tts.js`}
        strategy="afterInteractive"
        onLoad={() => console.log("Script onLoad fired.")}
        onError={(e) => console.error("Script load error", e)}
      />

      <div className="w-full max-w-4xl bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-2xl shadow-2xl ring-1 ring-white/20">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <div
              className={`w-3 h-3 rounded-full mr-2 ${status.startsWith("Pronto") ? "bg-green-500 animate-pulse" : "bg-yellow-500 animate-bounce"}`}
            ></div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
              Sherpa ONNX TTS
            </h1>
          </div>
          <div className="text-xs font-mono text-gray-400">
            {isSynthesizing ? "Synthesizing..." : "Idle"}
          </div>
        </div>

        {/* Text Input */}
        <div className="relative mb-8 group">
          <textarea
            className="w-full p-6 h-32 rounded-lg bg-gray-900 border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 text-gray-100 resize-none font-light leading-relaxed placeholder-gray-600 shadow-inner"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite seu texto aqui..."
            disabled={isSynthesizing || isPlaying}
          />
        </div>

        {/* Global Progress & Synthesis Status */}
        {chunks.length > 0 && (
          <div className="mb-6 space-y-2">
            <div className="flex justify-between text-xs font-mono text-gray-400">
              <span>
                {isSynthesizing
                  ? `Generating: ${chunks.filter((c) => !c.isGenerating).length}/${chunks.length}`
                  : "Synthesis Complete"}
              </span>
              <span>
                {activeChunkIndex !== null
                  ? `Playing: ${activeChunkIndex + 1}/${chunks.length}`
                  : "Playback Idle"}
              </span>
            </div>
            <div className="w-full bg-gray-700/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-1.5 transition-all duration-300"
                style={{
                  width: `${((activeChunkIndex !== null ? activeChunkIndex + 1 : 0) / chunks.length) * 100}%`,
                }}
              />
            </div>
            {isSynthesizing && (
              <div className="w-full bg-gray-700/30 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-yellow-500/50 h-1 animate-pulse"
                  style={{
                    width: `${(chunks.filter((c) => !c.isGenerating).length / chunks.length) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-between mb-6 bg-gray-800/50 p-4 rounded-xl border border-white/5">
          <div className="flex space-x-2">
            <button
              onClick={() =>
                handleManualPlay(Math.max(0, (activeChunkIndex || 0) - 1))
              }
              disabled={activeChunkIndex === null || activeChunkIndex <= 0}
              className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={() =>
                isPlaying
                  ? stopPlayback()
                  : handleManualPlay(activeChunkIndex || 0)
              }
              className={`px-6 py-2 rounded-lg font-bold ${isPlaying ? "bg-red-500/20 text-red-400" : "bg-green-500 text-black"}`}
            >
              {isPlaying ? "Pause/Stop" : "Play"}
            </button>
            <button
              onClick={() =>
                handleManualPlay(
                  Math.min(chunks.length - 1, (activeChunkIndex || 0) + 1),
                )
              }
              disabled={
                activeChunkIndex === null ||
                activeChunkIndex >= chunks.length - 1
              }
              className="p-2 rounded-full hover:bg-white/10 disabled:opacity-30"
            >
              Next
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <select
              value={playbackRate.toString()}
              onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
              className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm"
            >
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          </div>
        </div>

        {/* Generate Button (Main Action) */}
        {!isSynthesizing && chunks.length === 0 && (
          <button
            onClick={handleSpeak}
            disabled={!isReady}
            className={`w-full py-4 mb-6 rounded-xl font-bold uppercase tracking-wider transition-all transform duration-200 flex items-center justify-center space-x-2 ${
              !isReady
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-400 text-black hover:scale-[1.02]"
            }`}
          >
            {isReady ? "Gerar e Reproduzir" : "Carregando Modelo..."}
          </button>
        )}

        {(isSynthesizing || chunks.length > 0) && (
          <div className="mb-6 flex space-x-2">
            <button
              onClick={handleSpeak}
              className="flex-1 bg-gray-700 hover:bg-gray-600 py-3 rounded-lg text-sm font-bold"
            >
              Regenerate
            </button>
            <button
              onClick={handleStop}
              className="flex-1 bg-red-500/20 hover:bg-red-500/40 text-red-400 py-3 rounded-lg text-sm font-bold"
            >
              Stop All
            </button>
            {!isSynthesizing &&
              chunks.length > 0 &&
              chunks.every((c) => !c.isGenerating) && (
                <button
                  onClick={handleDownloadAll}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 py-3 rounded-lg text-sm font-bold"
                >
                  Download All
                </button>
              )}
          </div>
        )}

        {/* Chunk List */}
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {chunks.map((chunk, idx) => (
            <div
              key={chunk.id}
              ref={(el) => {
                chunkRefs.current[idx] = el;
              }}
              onClick={() => handleManualPlay(idx)}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${
                activeChunkIndex === idx
                  ? "bg-green-500/20 border-green-500/50 text-green-100 scale-[1.01]"
                  : "bg-gray-800/40 border-gray-700/30 text-gray-400 hover:bg-white/5"
              } flex flex-col`}
            >
              <div className="flex justify-between items-center mb-1 w-full">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono opacity-50">
                    #{idx + 1}
                  </span>
                  <span className="text-xs font-mono opacity-50">
                    {chunk.isGenerating
                      ? "..."
                      : (chunk.duration || 0).toFixed(1) + "s"}
                  </span>
                </div>
                {chunk.audioBuffer && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadChunk(chunk);
                    }}
                    className="text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-white"
                    title="Download Chunk"
                  >
                    ↓
                  </button>
                )}
              </div>
              <p className="text-sm leading-relaxed">{chunk.text}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

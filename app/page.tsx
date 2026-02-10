"use client";

import { useState, useRef } from "react";
import Script from "next/script";
import { useSherpaTTS } from "../hooks/use-sherpa-tts";
import { AudioManager } from "../lib/audio-manager";

export default function Home() {
  const [text, setText] = useState<string>(
    "Olá! Este é um teste da Sherpa ONNX rodando localmente no seu navegador. O processamento de textos longos agora é feito em pedaços para reduzir a latência e começar a falar mais rápido.",
  );

  // No prefix needed for Vercel/Root deployment
  const prefix = "./";

  const { ttsRef, status, isReady } = useSherpaTTS();
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Progress tracking
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  // Audio Manager
  const audioManagerRef = useRef<AudioManager | null>(null);
  const isCancelledRef = useRef<boolean>(false);

  // --- Helper: Text Segmentation ---
  const splitTextIntoChunks = (text: string, maxChunkSize = 200): string[] => {
    // Split by sentence terminators, keeping the terminator
    // This regex looks for punctuation followed by space or end of string
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

  const handleSpeak = async () => {
    if (!ttsRef.current || !text) return;

    // Initialize Audio Manager if not exists
    if (!audioManagerRef.current) {
      audioManagerRef.current = new AudioManager();
    }

    const audioMgr = audioManagerRef.current;

    if (isSpeaking) {
      // Cancel logic
      isCancelledRef.current = true;
      audioMgr.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    isCancelledRef.current = false;

    audioMgr.reset();
    await audioMgr.ensureRunning();

    const chunks = splitTextIntoChunks(text);
    setTotalChunks(chunks.length);
    setCurrentChunkIndex(0);

    // Initial small delay to let UI update
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      for (let i = 0; i < chunks.length; i++) {
        if (isCancelledRef.current) break;

        const chunk = chunks[i];
        setCurrentChunkIndex(i + 1);

        // Yield to main thread to prevent UI freezing
        // Increasing delay slightly to ensure UI updates render
        await new Promise((resolve) => setTimeout(resolve, 20));

        const audioData = ttsRef.current.generate({
          text: chunk,
          sid: 0,
          speed: 1.0,
        });

        if (isCancelledRef.current) break;

        // Schedule playback
        audioMgr.scheduleChunk(audioData.samples, audioData.sampleRate);
      }
    } catch (error) {
      console.error("Speak error:", error);
    } finally {
      setIsSpeaking(false);
      if (isCancelledRef.current) {
        console.log("Playback cancelled via user interaction.");
      }
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-gray-900 to-black text-white selection:bg-green-500 selection:text-black">
      {/* Script loading strategy */}
      <Script
        src={`${prefix}/sherpa-onnx-wasm-main-tts.js`}
        strategy="afterInteractive"
        onLoad={() => console.log("Script onLoad fired.")}
        onError={(e) => console.error("Script load error", e)}
      />

      <div className="w-full max-w-2xl bg-white/5 backdrop-blur-lg border border-white/10 p-8 rounded-2xl shadow-2xl ring-1 ring-white/20">
        <div className="flex items-center justify-center mb-6">
          <div
            className={`w-3 h-3 rounded-full mr-2 ${status.startsWith("Pronto") ? "bg-green-500 animate-pulse" : "bg-yellow-500 animate-bounce"}`}
          ></div>
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
            Sherpa ONNX TTS
          </h1>
        </div>

        <p className="text-center text-gray-400 mb-8 text-sm font-medium tracking-wide">
          STATUS:{" "}
          <span
            className={`${status.startsWith("Pronto") ? "text-green-400" : "text-yellow-400"}`}
          >
            {status.toUpperCase()}
          </span>
        </p>

        <div className="relative mb-8 group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-green-400 to-blue-600 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
          <textarea
            className="relative w-full p-6 h-48 rounded-lg bg-gray-900 border border-gray-700/50 focus:outline-none focus:ring-2 focus:ring-green-500/50 text-gray-100 resize-none font-light leading-relaxed placeholder-gray-600 shadow-inner"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite seu texto aqui..."
          />
        </div>

        {/* Progress Bar */}
        {totalChunks > 0 && isSpeaking && (
          <div className="w-full bg-gray-700 rounded-full h-2.5 mb-6 overflow-hidden">
            <div
              className="bg-gradient-to-r from-green-500 to-blue-500 h-2.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${(currentChunkIndex / totalChunks) * 100}%` }}
            ></div>
          </div>
        )}

        <button
          onClick={handleSpeak}
          disabled={!isReady}
          className={`w-full py-4 px-6 rounded-xl font-bold uppercase tracking-wider transition-all transform duration-200 flex items-center justify-center space-x-2 ${
            !isReady
              ? "bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700"
              : isSpeaking
                ? "bg-red-500/10 border border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white hover:scale-[1.02]"
                : "bg-green-500 hover:bg-green-400 text-black hover:scale-[1.02] shadow-[0_0_20px_rgba(34,197,94,0.3)]"
          }`}
        >
          {!isReady ? (
            <span>Carregando Modelo...</span>
          ) : isSpeaking ? (
            <>
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping mr-2"></span>
              <span>
                Parar / Cancelar ({currentChunkIndex}/{totalChunks})
              </span>
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 mr-2"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clipRule="evenodd"
                />
              </svg>
              <span>Gerar Áudio</span>
            </>
          )}
        </button>

        <p className="mt-6 text-xs text-center text-gray-500 font-mono">
          Powered by Next.js 16 + Sherpa ONNX (WASM)
        </p>
      </div>
    </main>
  );
}

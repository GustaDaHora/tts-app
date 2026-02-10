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

        // Generate audio for this chunk
        // This is a blocking operation on the main thread (WASM), but since chunks are smaller, it shouldn't freeze UI for too long.
        // We can wrap in another setTimeout to yield to main thread if needed
        await new Promise((resolve) => setTimeout(resolve, 0));

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
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
      {/* Simplest script loading strategy */}
      <Script
        src={`${prefix}/sherpa-onnx-wasm-main-tts.js`}
        strategy="afterInteractive"
        onLoad={() => console.log("Script onLoad fired.")}
        onError={(e) => console.error("Script load error", e)}
      />

      <div className="w-full max-w-2xl bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700">
        <h1 className="text-3xl font-bold mb-2 text-center text-green-400">
          Sherpa ONNX (WASM)
        </h1>
        <p className="text-center text-gray-400 mb-6 text-sm">
          Status: <span className="font-mono text-yellow-300">{status}</span>
        </p>

        <div className="mb-6">
          <textarea
            className="w-full p-4 h-40 rounded-lg bg-gray-700 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 text-white resize-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <button
          onClick={handleSpeak}
          disabled={!isReady}
          className={`w-full py-4 px-6 rounded-lg font-bold transition-all text-lg ${
            !isReady
              ? "bg-gray-600 cursor-not-allowed"
              : isSpeaking
                ? "bg-red-600 hover:bg-red-500 hover:scale-105 shadow-lg shadow-red-500/20"
                : "bg-green-600 hover:bg-green-500 hover:scale-105 shadow-lg shadow-green-500/20"
          } ${!isReady ? "text-gray-400" : "text-white"}`}
        >
          {isSpeaking ? (
            <span>
              Parar / Cancelar ({currentChunkIndex}/{totalChunks})
            </span>
          ) : (
            "Gerar Áudio (Streaming)"
          )}
        </button>

        <p className="mt-4 text-xs text-center text-gray-500">
          Nota: O texto é dividido em segmentos para reprodução rápida. O áudio
          continua tocando enquanto o próximo trecho é gerado.
        </p>
      </div>
    </main>
  );
}

"use client";

import { useState, useEffect } from "react";
import Script from "next/script";
import { useSherpaTTS } from "../hooks/use-sherpa-tts";

export default function Home() {
  const [text, setText] = useState<string>(
    "Olá! Este é um teste da Sherpa ONNX rodando localmente no seu navegador. Agora com suporte a textos longos e segmentação automática.",
  );

  // No prefix needed for Vercel/Root deployment
  const prefix = "./";

  // Hydration check
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { status, isReady, isSpeaking, progress, speak, cancel } =
    useSherpaTTS();

  const handleSpeak = () => {
    speak(text);
  };

  const handleStop = () => {
    cancel();
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
        <div className="text-gray-400">Carregando interface...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
      {/* Script loading strategy */}
      <Script
        src={`${prefix}/sherpa-onnx-wasm-main-tts.js`}
        strategy="afterInteractive"
        onLoad={() => {
          console.log("Script onLoad fired.");
        }}
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

        <div className="flex gap-4">
          <button
            onClick={handleSpeak}
            disabled={!isReady || (isSpeaking && !progress && progress !== "")}
            className={`flex-1 py-4 px-6 rounded-lg font-bold transition-all text-lg ${
              !isReady
                ? "bg-gray-600 cursor-not-allowed"
                : isSpeaking && !progress // processing but no progress text? usually won't happen
                  ? "bg-green-700 cursor-wait"
                  : "bg-green-600 hover:bg-green-500 hover:scale-105 shadow-lg shadow-green-500/20"
            } ${!isReady ? "text-gray-400" : "text-white"}`}
          >
            {isSpeaking
              ? progress
                ? progress
                : "Processando..."
              : "Gerar Áudio Neural"}
          </button>

          {isSpeaking && (
            <button
              onClick={handleStop}
              className="py-4 px-6 rounded-lg font-bold transition-all text-lg bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20"
            >
              Parar
            </button>
          )}
        </div>

        <p className="mt-4 text-xs text-center text-gray-500">
          Nota: O processamento é todo local (CPU). Textos longos serão
          segmentados automaticamente.
        </p>
      </div>
    </main>
  );
}

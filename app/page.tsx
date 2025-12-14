"use client";

import { useState, useEffect, useRef } from "react";
import Script from "next/script";

// Type definitions for the wrapper
interface OfflineTts {
  sampleRate: number;
  numSpeakers: number;
  generate: (config: { text: string; sid: number; speed: number }) => {
    samples: Float32Array;
    sampleRate: number;
  };
  free: () => void;
}

interface OfflineTtsFactory {
  init: (config: any) => OfflineTts | undefined;
}

declare global {
  interface Window {
    Module: any;
    SherpaOnnx: any;
    createOfflineTts: (module: any) => OfflineTtsFactory;
  }
}

export default function Home() {
  const [text, setText] = useState<string>(
    "Olá! Este é um teste da Sherpa ONNX rodando localmente no seu navegador."
  );
  const [status, setStatus] = useState<string>("Aguardando carregamento...");
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Initialize Module with LocateFile to handle paths correctly on GitHub Pages
    if (!window.Module) {
      window.Module = {
        print: (text: string) => console.log("[WASM-STDOUT]", text),
        printErr: (text: string) => console.error("[WASM-STDERR]", text),
        locateFile: (path: string, prefix: string) => {
          console.log(`[WASM-LOCATE] Asking for: ${path} (prefix: ${prefix})`);
          if (path.endsWith(".data") || path.endsWith(".wasm")) {
            // Adjust this path if your repo name is different or using custom domain
            // Ensuring we look in the right place relative to public/
            return `/tts-app/${path}`;
          }
          return prefix + path;
        },
      };
    }

    // Manual script injection to ensure Module is configured FIRST
    const scriptId = "sherpa-wasm-main-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.src = "/tts-app/sherpa-onnx-wasm-main-tts.js";
      script.id = scriptId;
      script.async = true;
      document.body.appendChild(script);
      console.log("Injected Sherpa WASM script manually.");
    }
  }, []);

  // Refs
  const ttsRef = useRef<OfflineTts | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const initializedRef = useRef(false);

  // Initialize Sherpa Engine
  const initSherpa = async () => {
    if (initializedRef.current) return;

    // Wait for both Module and the wrapper function to be available
    if (!window.Module || !window.createOfflineTts) {
      console.log("initSherpa called but scripts not ready. Waiting...");
      return;
    }

    initializedRef.current = true; // Mark as started

    // Fallback: Check if FS is globally available in Module
    const fs = window.Module.FS;
    if (!fs) {
      setStatus("Aguardando sistema de arquivos WASM...");
      initializedRef.current = false; // Retry later
      return;
    }

    try {
      setStatus("Baixando modelos para a memória...");
      const modelName = "model.onnx";
      const tokensName = "tokens.txt";

      // 1. Helper to fetch and write files to WASM FS
      const fetchAndWrite = async (
        srcPath: string,
        destPath: string = srcPath
      ) => {
        // Explicitly include base path to avoid 404s on GitHub Pages
        const response = await fetch(`/tts-app/${srcPath}`);
        if (!response.ok)
          throw new Error(`Failed to fetch ${srcPath}: ${response.statusText}`);
        const buffer = await response.arrayBuffer();

        // Ensure directories exist
        const parts = destPath.split("/");
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath += (currentPath ? "/" : "") + parts[i];
          if (currentPath && !fs.analyzePath(currentPath).exists) {
            fs.mkdir(currentPath);
          }
        }

        fs.writeFile(destPath, new Uint8Array(buffer));
        console.log(`Saved ${destPath} to WASM FS`);
      };

      // 2. Download Model Files
      const modelPromises = [
        fetchAndWrite(modelName),
        fetchAndWrite(tokensName),
      ];

      // 3. Download eSpeak-NG Data (Required for VITS/Piper models)
      const espeakFiles = [
        "phondata",
        "phonindex",
        "phontab",
        "intonations",
        "pt_dict",
      ];
      const espeakPromises = espeakFiles.map((f) =>
        fetchAndWrite(`espeak-ng-data/${f}`, `espeak-ng-data/${f}`)
      );

      await Promise.all([...modelPromises, ...espeakPromises]);

      setStatus("Inicializando motor TTS...");

      // 4. Configure and Create TTS Instance using the Wrapper
      // The wrapper expects a nested structure matching the C structs
      const config = {
        offlineTtsConfig: {
          offlineTtsModelConfig: {
            offlineTtsVitsModelConfig: {
              model: modelName,
              tokens: tokensName,
              dataDir: "espeak-ng-data",
              noiseScale: 0.667,
              noiseScaleW: 0.8,
              lengthScale: 1.0,
            },
            numThreads: 1,
            debug: 1,
            provider: "cpu",
          },
          maxNumSentences: 1,
          ruleFsts: "",
          ruleFars: "",
          silenceScale: 0.2,
        },
      };

      const factory = window.createOfflineTts(window.Module);
      const tts = factory.init(config);

      if (!tts) {
        throw new Error("Falha ao criar instância TTS (Wrapper retornou null)");
      }

      ttsRef.current = tts;

      setStatus("Pronto! Modelo PT-BR (Dionisio) carregado.");
      setIsReady(true);
    } catch (e) {
      console.error(e);
      setStatus("Erro ao carregar modelos: " + e);
      initializedRef.current = false;
    }
  };

  // Poll for Module readiness
  useEffect(() => {
    if (!mounted) return;

    const intervalId = setInterval(() => {
      if (initializedRef.current) {
        clearInterval(intervalId);
        return;
      }

      // Check if WASM runtime is initialized and Wrapper function is present
      if (
        window.Module &&
        // Check for specific Emscripten runtime symbol to ensure it's fully loaded
        // _SherpaOnnxCreateOfflineTts comes from WASM, createOfflineTts comes from JS wrapper
        window.Module._SherpaOnnxCreateOfflineTts &&
        typeof window.createOfflineTts === "function"
      ) {
        console.log("Dependencies ready. Initializing...");
        initSherpa();
        clearInterval(intervalId);
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [mounted]);

  const handleSpeak = () => {
    if (!ttsRef.current || !text) return;

    setIsSpeaking(true);

    // Yield to UI
    setTimeout(() => {
      try {
        const audioData = ttsRef.current!.generate({
          text: text,
          sid: 0,
          speed: 1.0,
        });

        playAudio(audioData.samples, audioData.sampleRate);
      } catch (error) {
        console.error("Speak error:", error);
        setIsSpeaking(false);
      }
    }, 50);
  };

  const playAudio = (samples: Float32Array, sampleRate: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    }

    const ctx = audioContextRef.current;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);

    // Make a copy to match Type requirements (Float32Array)
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    source.onended = () => setIsSpeaking(false);
    source.start(0);
  };

  if (!mounted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
        <div className="text-gray-400">Carregando interface...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
      {/* Load Wrapper First */}
      <Script
        src="/tts-app/sherpa-onnx-tts.js"
        strategy="beforeInteractive"
        onLoad={() => console.log("Wrapper Loaded")}
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
          disabled={!isReady || isSpeaking}
          className={`w-full py-4 px-6 rounded-lg font-bold transition-all text-lg ${
            !isReady
              ? "bg-gray-600 cursor-not-allowed"
              : isSpeaking
              ? "bg-green-700 cursor-wait"
              : "bg-green-600 hover:bg-green-500 hover:scale-105 shadow-lg shadow-green-500/20"
          } ${!isReady ? "text-gray-400" : "text-white"}`}
        >
          {isSpeaking ? "Gerando e Falando..." : "Gerar Áudio Neural"}
        </button>

        <p className="mt-4 text-xs text-center text-gray-500">
          Nota: A primeira vez que você clica, pode haver um leve atraso. O
          processamento é todo local (CPU).
        </p>
      </div>
    </main>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Script from "next/script";

// Definição de Tipos para o Módulo WASM da Sherpa (simplificado)
interface SherpaVitsConfig {
  model: string;
  tokens: string;
  noiseScale?: number;
  noiseScaleW?: number;
  lengthScale?: number;
}

interface SherpaConfig {
  vits: SherpaVitsConfig;
  numThreads?: number;
  debug?: number;
  provider?: string;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Module: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SherpaOnnx: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initSherpaCallback?: () => any;
  }
}

export default function Home() {
  const [text, setText] = useState<string>(
    "Olá! Este é um teste da Sherpa ONNX rodando localmente no seu navegador. O processamento de textos longos agora é feito em pedaços para reduzir a latência e começar a falar mais rápido.",
  );

  // No prefix needed for Vercel/Root deployment
  const prefix = "./";
  const [status, setStatus] = useState<string>("Aguardando carregamento...");
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Progress tracking
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  // Hydration check using ref to avoid SSR/client mismatch
  const [mounted, setMounted] = useState(() => {
    // Initialize as true only on client-side
    return typeof window !== "undefined";
  });

  // Referências para o motor TTS e o Módulo WASM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ttsRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const isCancelledRef = useRef<boolean>(false);

  // Use a ref to track if we've already initialized to strictly prevent double-init
  const initializedRef = useRef(false);

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

  // --- Wrapper Manual para Sherpa ONNX (Ponte para o C-API) ---
  const createOfflineTts = (configObj: SherpaConfig) => {
    const Module = window.Module;

    // Funções auxiliares de memória
    const _malloc = Module._malloc;
    const _free = Module._free;
    const stringToUTF8 = Module.stringToUTF8;
    const lengthBytesUTF8 = Module.lengthBytesUTF8;
    const setValue = Module.setValue;
    const getValue = Module.getValue;

    const allocString = (str: string) => {
      if (!str) return 0; // NULL
      const len = lengthBytesUTF8(str) + 1;
      const ptr = _malloc(len);
      stringToUTF8(str, ptr, len);
      return ptr;
    };

    // 1. Alocar e Preencher a Struct de Configuração (SherpaOnnxOfflineTtsConfig)
    // Tamanho aproximado: ~200 bytes (Vamos alocar 512 para segurança e zerar tudo)
    const configSize = 512;
    const configPtr = _malloc(configSize);
    Module.HEAPU8.fill(0, configPtr, configPtr + configSize); // Zerar memória

    const vits = configObj.vits;

    // Escreve VITS Config
    setValue(configPtr + 0, allocString(vits.model), "i32");
    setValue(configPtr + 4, allocString(""), "i32"); // lexicon unused
    setValue(configPtr + 8, allocString(vits.tokens), "i32");
    setValue(configPtr + 12, allocString("espeak-ng-data"), "i32"); // data_dir: point to our espeak folder
    setValue(configPtr + 16, vits.noiseScale || 0.667, "float");
    setValue(configPtr + 20, vits.noiseScaleW || 0.8, "float");
    setValue(configPtr + 24, vits.lengthScale || 1.0, "float");
    setValue(configPtr + 28, allocString(""), "i32"); // dict_dir unused

    // Escreve Model Config (Outer)
    setValue(configPtr + 32, configObj.numThreads || 1, "i32");
    setValue(configPtr + 36, configObj.debug || 1, "i32");
    setValue(configPtr + 40, allocString(configObj.provider || "cpu"), "i32");

    // 2. Chama a função C para criar o TTS
    console.log("Calling _SherpaOnnxCreateOfflineTts...");
    const handle = Module._SherpaOnnxCreateOfflineTts(configPtr);
    console.log("TTS Handle created:", handle);

    // Limpeza da config
    _free(configPtr);

    if (handle === 0) {
      throw new Error(
        "Failed to create SherpaOnnx OfflineTts instance (Handle is 0)",
      );
    }

    return {
      handle: handle,
      generate: (params: { text: string; sid: number; speed: number }) => {
        const textPtr = allocString(params.text);
        // Chama C function: Generate
        const audioResPtr = Module._SherpaOnnxOfflineTtsGenerate(
          handle,
          textPtr,
          params.sid || 0,
          params.speed || 1.0,
        );

        _free(textPtr); // Libera string do texto

        if (audioResPtr === 0) {
          throw new Error("TtsGenerate returned NULL");
        }

        // Lê resultado da struct SherpaOnnxGeneratedAudio
        const samplesPtr = getValue(audioResPtr + 0, "i32");
        const n = getValue(audioResPtr + 4, "i32");
        const sampleRate = getValue(audioResPtr + 8, "i32");

        // Copia samples do Heap para JS Float32Array
        if (!Module.HEAPF32 || !Module.HEAPF32.buffer) {
          throw new Error("WASM memory (HEAPF32) not initialized");
        }
        const samples = new Float32Array(
          Module.HEAPF32.buffer,
          samplesPtr,
          n,
        ).slice(0); // slice faz uma cópia segura

        // Libera o resultado de áudio do C
        Module._SherpaOnnxDestroyOfflineTtsGeneratedAudio(audioResPtr);

        return {
          samples: samples,
          sampleRate: sampleRate,
        };
      },
      free: () => {
        Module._SherpaOnnxDestroyOfflineTts(handle);
      },
    };
  };

  // Função para inicializar o motor Sherpa - wrapped in useCallback for useEffect dependency
  const initSherpa = useCallback(async () => {
    if (initializedRef.current) return;

    // Check minimal exports availability
    if (!window.Module || !window.Module._SherpaOnnxCreateOfflineTts) {
      console.log("initSherpa called but C-API symbols missing. Waiting...");
      return;
    }

    initializedRef.current = true; // Mark as started

    // Fallback: Check if FS is globally available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fs = window.Module.FS || (window as any).FS;

    if (!fs) {
      setStatus("Erro crítico: FS não encontrado.");
      return;
    }

    try {
      setStatus("Inicializando motor TTS (Native Wrapper)...");

      const config = {
        vits: {
          model: "pt_BR-jeff-medium.onnx",
          tokens: "tokens.txt",
          lengthScale: 1.0,
          noiseScale: 0.667,
          noiseScaleW: 0.8,
        },
        numThreads: 1,
        debug: 1,
        provider: "cpu",
      };

      // Cria instância usando nosso wrapper manual
      ttsRef.current = createOfflineTts(config);

      setStatus("Pronto! Modelo PT-BR (Dionisio) carregado.");
      setIsReady(true);
    } catch (e) {
      console.error(e);
      setStatus("Erro ao carregar modelos: " + e);
      initializedRef.current = false; // Allow retry on error
    }
  }, []);

  // Poll for Module readiness
  useEffect(() => {
    if (!mounted) return;

    const intervalId = setInterval(() => {
      if (initializedRef.current) {
        clearInterval(intervalId);
        return;
      }

      // Check for the C function symbol instead of the Class
      if (window.Module && window.Module._SherpaOnnxCreateOfflineTts) {
        console.log("Polling success: C-API symbols found. Initializing...");
        initSherpa();
        clearInterval(intervalId);
      } else if (window.Module) {
        console.log("Polling: Module loaded, waiting for WASM symbols...");
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [mounted, initSherpa]);

  const scheduleAudio = (samples: Float32Array, sampleRate: number) => {
    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }

    const ctx = audioContextRef.current;

    // Ensure context is running (sometimes needed after user interaction)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const buffer = ctx.createBuffer(1, samples.length, sampleRate);

    // Fix TypeScript error by ensuring the type matches exactly what copyToChannel expects
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    // Calculate start time:
    // If nextStartTime is in the past (e.g. first chunk or after a pause), start immediately (currentTime + small offset)
    // Otherwise, schedule for nextStartTime.
    const startTime = Math.max(ctx.currentTime, nextStartTimeRef.current);
    source.start(startTime);

    // Update next start time
    nextStartTimeRef.current = startTime + buffer.duration;

    // We can add onended to the source to detect when *this specific chunk* finishes,
    // but detecting when *all* audio finishes is trickier with this streaming approach.
    // For now, we rely on the generation loop to finish.
    return source;
  };

  const handleSpeak = async () => {
    if (!ttsRef.current || !text) return;
    if (isSpeaking) {
      // If already speaking, treat this click as a Cancel/Stop
      isCancelledRef.current = true;
      if (audioContextRef.current) {
        audioContextRef.current.close().then(() => {
          audioContextRef.current = null;
        });
      }
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    isCancelledRef.current = false;

    // Reset audio context scheduling time
    if (audioContextRef.current) {
      // It's safer to close/re-open or just rely on currentTime logic.
      // Let's reset the ref counter.
      nextStartTimeRef.current = 0;
    }

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
        scheduleAudio(audioData.samples, audioData.sampleRate);
      }
    } catch (error) {
      console.error("Speak error:", error);
    } finally {
      // We only set isSpeaking to false after we've *processed* all chunks.
      // Ideally we'd wait for playback to finish too, but that requires tracking all sources.
      // For 'Streaming' UX, the button usually turns back to 'Speak' when generation is done,
      // even if audio is still playing from the buffer.
      setIsSpeaking(false);
      if (isCancelledRef.current) {
        console.log("Playback cancelled via user interaction.");
      }
    }
  };

  // Prevent hydration mismatch by only rendering content after mount
  if (!mounted) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
        <div className="text-gray-400">Carregando interface...</div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-950 text-white">
      {/* Simplest script loading strategy */}
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

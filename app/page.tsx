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
    "Olá! Este é um teste da Sherpa ONNX rodando localmente no seu navegador. (Versão GitHub Pages)"
  );

  // No prefix needed for Vercel/Root deployment
  const prefix = "./";
  const [status, setStatus] = useState<string>("Aguardando carregamento...");
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Hydration check using ref to avoid SSR/client mismatch
  const [mounted, setMounted] = useState(() => {
    // Initialize as true only on client-side
    return typeof window !== "undefined";
  });

  // Referências para o motor TTS e o Módulo WASM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ttsRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Use a ref to track if we've already initialized to strictly prevent double-init
  const initializedRef = useRef(false);

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

    // Offset map based on c-api.h:
    // VitsConfig at offset 0
    // - model: 0
    // - lexicon: 4
    // - tokens: 8
    // - data_dir: 12
    // - noise_scale: 16 (float)
    // - noise_scale_w: 20 (float)
    // - length_scale: 24 (float)
    // - dict_dir: 28

    // ModelConfig continues
    // - num_threads: 32 (int)
    // - debug: 36 (int)
    // - provider: 40 (string)

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

    // Limpeza da config (Poderiamos limpar as strings alocadas também, mas para simplify deixamos vazar esses poucos bytes na init única)
    _free(configPtr);

    if (handle === 0) {
      throw new Error(
        "Failed to create SherpaOnnx OfflineTts instance (Handle is 0)"
      );
    }

    return {
      handle: handle,
      generate: (params: { text: string; sid: number; speed: number }) => {
        const textPtr = allocString(params.text);
        const start = performance.now();

        // Chama C function: Generate
        const audioResPtr = Module._SherpaOnnxOfflineTtsGenerate(
          handle,
          textPtr,
          params.sid || 0,
          params.speed || 1.0
        );

        _free(textPtr); // Libera string do texto

        if (audioResPtr === 0) {
          throw new Error("TtsGenerate returned NULL");
        }

        // Lê resultado da struct SherpaOnnxGeneratedAudio
        // - samples: 0 (float*)
        // - n: 4 (int)
        // - sample_rate: 8 (int)
        const samplesPtr = getValue(audioResPtr + 0, "i32");
        const n = getValue(audioResPtr + 4, "i32");
        const sampleRate = getValue(audioResPtr + 8, "i32");

        console.log(
          `Generated ${n} samples at ${sampleRate}Hz in ${
            performance.now() - start
          }ms`
        );

        // Copia samples do Heap para JS Float32Array
        // HEAPF32 é uma view, precisamos calcular o offset em floats (bytes / 4)
        if (!Module.HEAPF32 || !Module.HEAPF32.buffer) {
          throw new Error("WASM memory (HEAPF32) not initialized");
        }
        const samples = new Float32Array(
          Module.HEAPF32.buffer,
          samplesPtr,
          n
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
      // As of the custom WASM build, models are embedded in the .data file.
      // We no longer need to fetch them manually.
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

  const handleSpeak = () => {
    if (!ttsRef.current || !text) return;

    setIsSpeaking(true);

    // Pequeno delay para a UI atualizar antes do processamento pesado travar a thread
    setTimeout(() => {
      try {
        // Gera o áudio (retorna um objeto com samples e sampleRate)
        const audioData = ttsRef.current.generate({
          text: text,
          sid: 0, // Speaker ID (0 para single speaker)
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
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }

    const ctx = audioContextRef.current;
    const buffer = ctx.createBuffer(1, samples.length, sampleRate);

    // Fix TypeScript error by ensuring the type matches exactly what copyToChannel expects
    // Creating a new Float32Array from the existing one usually solves the ArrayBufferLike mismatch
    buffer.copyToChannel(new Float32Array(samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    source.onended = () => setIsSpeaking(false);
    source.start(0);
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
      {/* Module Init moved to layout.tsx */}

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

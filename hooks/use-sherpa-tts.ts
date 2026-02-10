import { useState, useEffect, useRef, useCallback } from "react";
import { splitTextIntoChunks } from "../lib/text-processing";

// Interfaces mirroring the C-API config
export interface SherpaVitsConfig {
  model: string;
  tokens: string;
  noiseScale?: number;
  noiseScaleW?: number;
  lengthScale?: number;
}

export interface SherpaConfig {
  vits: SherpaVitsConfig;
  numThreads?: number;
  debug?: number;
  provider?: string;
}

// Global window extension
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Module: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SherpaOnnx: any;
  }
}

interface AudioChunk {
  samples: Float32Array;
  sampleRate: number;
}

export function useSherpaTTS() {
  const [status, setStatus] = useState<string>("Aguardando carregamento...");
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const ttsRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const initializedRef = useRef(false);

  // Queue State
  const textQueueRef = useRef<string[]>([]);
  const audioQueueRef = useRef<AudioChunk[]>([]);
  const isGeneratingRef = useRef(false);
  const isPlayingRef = useRef(false);
  
  // To stop playback
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const shouldStopRef = useRef(false);

  // --- Wrapper Manual for Sherpa ONNX ---
  const createOfflineTts = (configObj: SherpaConfig) => {
    const Module = window.Module;
    if (!Module || !Module._malloc) {
        throw new Error("Module not initialized or _malloc missing");
    }

    const _malloc = Module._malloc;
    const _free = Module._free;
    const stringToUTF8 = Module.stringToUTF8;
    const lengthBytesUTF8 = Module.lengthBytesUTF8;
    const setValue = Module.setValue;
    const getValue = Module.getValue;

    const allocString = (str: string) => {
      if (!str) return 0;
      const len = lengthBytesUTF8(str) + 1;
      const ptr = _malloc(len);
      stringToUTF8(str, ptr, len);
      return ptr;
    };

    const configSize = 512;
    const configPtr = _malloc(configSize);
    Module.HEAPU8.fill(0, configPtr, configPtr + configSize);

    const vits = configObj.vits;

    setValue(configPtr + 0, allocString(vits.model), "i32");
    setValue(configPtr + 4, allocString(""), "i32");
    setValue(configPtr + 8, allocString(vits.tokens), "i32");
    setValue(configPtr + 12, allocString("espeak-ng-data"), "i32");
    setValue(configPtr + 16, vits.noiseScale || 0.667, "float");
    setValue(configPtr + 20, vits.noiseScaleW || 0.8, "float");
    setValue(configPtr + 24, vits.lengthScale || 1.0, "float");
    setValue(configPtr + 28, allocString(""), "i32");

    setValue(configPtr + 32, configObj.numThreads || 1, "i32");
    setValue(configPtr + 36, configObj.debug || 1, "i32");
    setValue(configPtr + 40, allocString(configObj.provider || "cpu"), "i32");

    const handle = Module._SherpaOnnxCreateOfflineTts(configPtr);
    _free(configPtr);

    if (handle === 0) {
      throw new Error("Failed to create SherpaOnnx OfflineTts instance");
    }

    return {
      handle: handle,
      generate: (params: { text: string; sid: number; speed: number }) => {
        const textPtr = allocString(params.text);
        
        const audioResPtr = Module._SherpaOnnxOfflineTtsGenerate(
          handle,
          textPtr,
          params.sid || 0,
          params.speed || 1.0
        );

        _free(textPtr);

        if (audioResPtr === 0) {
          throw new Error("TtsGenerate returned NULL");
        }

        const samplesPtr = getValue(audioResPtr + 0, "i32");
        const n = getValue(audioResPtr + 4, "i32");
        const sampleRate = getValue(audioResPtr + 8, "i32");

        if (!Module.HEAPF32 || !Module.HEAPF32.buffer) {
           throw new Error("WASM memory (HEAPF32) not initialized");
        }

        const samples = new Float32Array(
          Module.HEAPF32.buffer,
          samplesPtr,
          n
        ).slice(0);

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

  const initSherpa = useCallback(async () => {
    if (initializedRef.current) return;

    // Strict check for required C-API symbols
    if (!window.Module || !window.Module._SherpaOnnxCreateOfflineTts || !window.Module._malloc) {
      return;
    }
    
    // Double check FS
    const fs = window.Module.FS || (window as any).FS;
    if (!fs) {
       console.log("FS not ready yet");
       return; 
    }

    initializedRef.current = true;

    try {
      setStatus("Inicializando motor TTS...");

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

      ttsRef.current = createOfflineTts(config);

      setStatus("Pronto! Modelo PT-BR carregado.");
      setIsReady(true);
    } catch (e) {
      console.error(e);
      setStatus("Erro ao carregar modelos: " + e);
      initializedRef.current = false;
    }
  }, []);

  // Poll for Module
  useEffect(() => {
    if (typeof window === "undefined") return;

    const intervalId = setInterval(() => {
      if (initializedRef.current) {
        clearInterval(intervalId);
        return;
      }

      // We wait until both the Module exists AND the specific C function we need is exported
      // This ensures WASM is compiled and Runtime initialized
      if (window.Module && window.Module._SherpaOnnxCreateOfflineTts && window.Module._malloc) {
        initSherpa();
        clearInterval(intervalId);
      }
    }, 500);

    return () => clearInterval(intervalId);
  }, [initSherpa]);


  // --- Playback Logic ---

  const playNextInQueue = async () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      // If generation is also done, we are truly done
      if (!isGeneratingRef.current) {
         setIsSpeaking(false);
         setProgress("");
      }
      return;
    }

    isPlayingRef.current = true;
    const chunk = audioQueueRef.current.shift();
    if (!chunk) return;

    if (!audioContextRef.current) {
      const AudioContextClass =
        window.AudioContext ||
        (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }

    const ctx = audioContextRef.current;
    
    // Ensure context is running (sometimes needed for browsers)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const buffer = ctx.createBuffer(1, chunk.samples.length, chunk.sampleRate);
    buffer.copyToChannel(new Float32Array(chunk.samples), 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    sourceRef.current = source;

    source.onended = () => {
        if (!shouldStopRef.current) {
           playNextInQueue();
        }
    };

    source.start(0);
  };

  const processTextQueue = async (totalChunks: number) => {
    if (shouldStopRef.current) {
        isGeneratingRef.current = false;
        return;
    }

    if (textQueueRef.current.length === 0) {
        isGeneratingRef.current = false;
        return;
    }

    isGeneratingRef.current = true;
    const textChunk = textQueueRef.current.shift();
    const currentChunkIndex = totalChunks - textQueueRef.current.length; // 1-based index roughly
    
    setProgress(`Gerando parte ${currentChunkIndex}/${totalChunks}...`);

    if (textChunk && ttsRef.current) {
        try {
            // Yield to UI thread implies requestAnimationFrame or setTimeout
             await new Promise(resolve => setTimeout(resolve, 0));

             const audioData = ttsRef.current.generate({
                text: textChunk,
                sid: 0,
                speed: 1.0,
            });
            
            audioQueueRef.current.push({
                samples: audioData.samples,
                sampleRate: audioData.sampleRate,
            });

            // If not playing, start playing immediately
            if (!isPlayingRef.current) {
                playNextInQueue();
            }

            processTextQueue(totalChunks);

        } catch(e) {
            console.error("Generation error", e);
            isGeneratingRef.current = false;
        }
    }
  };

  const speak = (text: string) => {
    if (!ttsRef.current || !text) return;

    // Reset state
    cancel();
    shouldStopRef.current = false;
    setIsSpeaking(true);
    
    const chunks = splitTextIntoChunks(text, 200); // chunk size ~200 chars
    textQueueRef.current = [...chunks];
    const totalChunks = chunks.length;

    processTextQueue(totalChunks);
  };

  const cancel = () => {
    shouldStopRef.current = true;
    setIsSpeaking(false);
    setProgress("");
    
    // Stop audio
    if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch(e) {}
        sourceRef.current = null;
    }
    
    // Clear queues
    textQueueRef.current = [];
    audioQueueRef.current = [];
    isGeneratingRef.current = false;
    isPlayingRef.current = false;
  };

  return {
    status,
    isReady,
    isSpeaking,
    progress,
    speak,
    cancel,
  };
}

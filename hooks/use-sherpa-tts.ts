import { useState, useEffect, useRef, useCallback } from "react";

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

export interface TTSGenerator {
  handle: number;
  generate: (params: { text: string; sid: number; speed: number }) => {
    samples: Float32Array;
    sampleRate: number;
  };
  free: () => void;
}

export function useSherpaTTS() {
  const [status, setStatus] = useState<string>("Aguardando carregamento...");
  const [isReady, setIsReady] = useState(false);
  const ttsRef = useRef<TTSGenerator | null>(null);
  const initializedRef = useRef(false);

  // Define createOfflineTts first to be used in init
  const createOfflineTts = useCallback((configObj: SherpaConfig): TTSGenerator => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Module = (window as any).Module;

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

    // Config struct mapping based on c-api.h
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

    console.log("Calling _SherpaOnnxCreateOfflineTts...");
    const handle = Module._SherpaOnnxCreateOfflineTts(configPtr);
    console.log("TTS Handle created:", handle);

    _free(configPtr);

    if (handle === 0) {
      throw new Error(
        "Failed to create SherpaOnnx OfflineTts instance (Handle is 0). Check model filename and paths."
      );
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
        ).slice(0); // Safe copy

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
  }, []);

  const init = useCallback(() => {
    if (initializedRef.current) return;
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;

    if (!win.Module || !win.Module._SherpaOnnxCreateOfflineTts) {
       // Symbols not yet ready
       return;
    }

    initializedRef.current = true;
    
    try {
        setStatus("Inicializando motor TTS...");
        
        // Use generic filenames as they are in public/ folder
        const config: SherpaConfig = {
            vits: {
                model: "model.onnx", // CHANGED from pt_BR-jeff-medium.onnx
                tokens: "tokens.txt",
                lengthScale: 1.0,
                noiseScale: 0.667,
                noiseScaleW: 0.8,
            },
            numThreads: 1,
            debug: 1,
            provider: "cpu"
        };
        
        ttsRef.current = createOfflineTts(config);
        setStatus("Pronto! Modelo carregado.");
        setIsReady(true);
    } catch (e) {
        console.error(e);
        setStatus("Erro: " + e);
        initializedRef.current = false; // Retry?
    }

  }, [createOfflineTts]);

  // Polling effect
  useEffect(() => {
    if (typeof window === "undefined") return;

    const interval = setInterval(() => {
        if (initializedRef.current) {
            clearInterval(interval);
            return;
        }
        init();
    }, 500);

    return () => clearInterval(interval);
  }, [init]);

  return {
    ttsRef: ttsRef,
    status,
    isReady
  };
}

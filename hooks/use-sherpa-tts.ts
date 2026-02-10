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
    if (typeof _malloc !== 'function') {
        console.error("Module._malloc is not a function", Module);
        throw new Error("WASM Initialization Error: _malloc is missing");
    }
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

    if (!win.Module) {
        return;
    }

    console.log("Checking Module status...");
    if (win.Module.FS) {
         try {
             console.log("FS Root files:", win.Module.FS.readdir("/"));
             console.log("FS espeak-ng-data:", win.Module.FS.readdir("/espeak-ng-data"));
         } catch(e) {
             console.log("FS check error:", e);
         }
    } else {
        console.log("Module.FS not available yet");
    }

    if (!win.Module._SherpaOnnxCreateOfflineTts) {
       console.log("C-API symbols (SherpaOnnxCreateOfflineTts) missing.");
       return;
    }

    console.log("All symbols ready. Initializing...");

    initializedRef.current = true;
    
    try {
        setStatus("Inicializando motor TTS...");
        
        // Correct filename from WASM data package analysis
        const modelPath = "/pt_BR-jeff-medium.onnx";
        const tokensPath = "/tokens.txt";

        // Verify files exist in MEMFS before attempting initialization
        if (win.Module.FS) {
            const modelExists = win.Module.FS.analyzePath(modelPath).exists;
            const tokensExists = win.Module.FS.analyzePath(tokensPath).exists;
            console.log(`FS Check: Model exists? ${modelExists}, Tokens exist? ${tokensExists}`);
            
            if (!modelExists) {
                throw new Error(`Model file not found in WASM FS: ${modelPath}`);
            }
        }

        const config: SherpaConfig = {
            vits: {
                model: modelPath, 
                tokens: tokensPath,
                lengthScale: 1.0,
                noiseScale: 0.667,
                noiseScaleW: 0.8,
            },
            numThreads: 1,
            debug: 1,
            provider: "cpu"
        };
        
        ttsRef.current = createOfflineTts(config);
        
        // Additional check for the handle
        if ((ttsRef.current as any) === 0) {
             throw new Error("SherpaOnnx creation returned 0 handle (Initialization failed).");
        }

        setStatus("Pronto! Modelo carregado.");
        setIsReady(true);
    } catch (e) {
        console.error(e);
        const err = e as Error;
        setStatus("Erro: " + err.message);
        initializedRef.current = false; // Allow retry
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

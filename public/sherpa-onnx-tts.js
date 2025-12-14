function freeConfig(config, Module) {
  if ("buffer" in config) {
    Module._free(config.buffer);
  }

  if ("config" in config) {
    freeConfig(config.config, Module);
  }

  if ("matcha" in config) {
    freeConfig(config.matcha, Module);
  }

  if ("kokoro" in config) {
    freeConfig(config.kokoro, Module);
  }

  if ("kitten" in config) {
    freeConfig(config.kitten, Module);
  }

  if ("zipvoice" in config) {
    freeConfig(config.zipvoice, Module);
  }

  Module._free(config.ptr);
}

// The user should free the returned pointers
function initSherpaOnnxOfflineTtsVitsModelConfig(config, Module) {
  const modelLen = Module.lengthBytesUTF8(config.model || "") + 1;
  const lexiconLen = Module.lengthBytesUTF8(config.lexicon || "") + 1;
  const tokensLen = Module.lengthBytesUTF8(config.tokens || "") + 1;
  const dataDirLen = Module.lengthBytesUTF8(config.dataDir || "") + 1;
  const dictDir = "";
  const dictDirLen = Module.lengthBytesUTF8(dictDir) + 1;

  const n = modelLen + lexiconLen + tokensLen + dataDirLen + dictDirLen;

  const buffer = Module._malloc(n);

  const len = 8 * 4;
  const ptr = Module._malloc(len);

  let offset = 0;
  Module.stringToUTF8(config.model || "", buffer + offset, modelLen);
  offset += modelLen;

  Module.stringToUTF8(config.lexicon || "", buffer + offset, lexiconLen);
  offset += lexiconLen;

  Module.stringToUTF8(config.tokens || "", buffer + offset, tokensLen);
  offset += tokensLen;

  Module.stringToUTF8(config.dataDir || "", buffer + offset, dataDirLen);
  offset += dataDirLen;

  Module.stringToUTF8(dictDir, buffer + offset, dictDirLen);
  offset += dictDirLen;

  offset = 0;
  Module.setValue(ptr, buffer + offset, "i8*");
  offset += modelLen;

  Module.setValue(ptr + 4, buffer + offset, "i8*");
  offset += lexiconLen;

  Module.setValue(ptr + 8, buffer + offset, "i8*");
  offset += tokensLen;

  Module.setValue(ptr + 12, buffer + offset, "i8*");
  offset += dataDirLen;

  Module.setValue(ptr + 16, config.noiseScale || 0.667, "float");
  Module.setValue(ptr + 20, config.noiseScaleW || 0.8, "float");
  Module.setValue(ptr + 24, config.lengthScale || 1.0, "float");
  Module.setValue(ptr + 28, buffer + offset, "i8*");
  offset += dictDirLen;

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
  };
}

function initSherpaOnnxOfflineTtsMatchaModelConfig(config, Module) {
  const acousticModelLen = Module.lengthBytesUTF8(config.acousticModel) + 1;
  const vocoderLen = Module.lengthBytesUTF8(config.vocoder) + 1;
  const lexiconLen = Module.lengthBytesUTF8(config.lexicon || "") + 1;
  const tokensLen = Module.lengthBytesUTF8(config.tokens || "") + 1;
  const dataDirLen = Module.lengthBytesUTF8(config.dataDir || "") + 1;

  const dictDir = "";
  const dictDirLen = Module.lengthBytesUTF8(dictDir) + 1;

  const n =
    acousticModelLen +
    vocoderLen +
    lexiconLen +
    tokensLen +
    dataDirLen +
    dictDirLen;

  const buffer = Module._malloc(n);

  const len = 8 * 4;
  const ptr = Module._malloc(len);

  let offset = 0;
  Module.stringToUTF8(
    config.acousticModel || "",
    buffer + offset,
    acousticModelLen
  );
  offset += acousticModelLen;

  Module.stringToUTF8(config.vocoder || "", buffer + offset, vocoderLen);
  offset += vocoderLen;

  Module.stringToUTF8(config.lexicon || "", buffer + offset, lexiconLen);
  offset += lexiconLen;

  Module.stringToUTF8(config.tokens || "", buffer + offset, tokensLen);
  offset += tokensLen;

  Module.stringToUTF8(config.dataDir || "", buffer + offset, dataDirLen);
  offset += dataDirLen;

  Module.stringToUTF8(dictDir, buffer + offset, dictDirLen);
  offset += dictDirLen;

  offset = 0;
  Module.setValue(ptr, buffer + offset, "i8*");
  offset += acousticModelLen;

  Module.setValue(ptr + 4, buffer + offset, "i8*");
  offset += vocoderLen;

  Module.setValue(ptr + 8, buffer + offset, "i8*");
  offset += lexiconLen;

  Module.setValue(ptr + 12, buffer + offset, "i8*");
  offset += tokensLen;

  Module.setValue(ptr + 16, buffer + offset, "i8*");
  offset += dataDirLen;

  Module.setValue(ptr + 20, config.noiseScale || 0.667, "float");
  Module.setValue(ptr + 24, config.lengthScale || 1.0, "float");
  Module.setValue(ptr + 28, buffer + offset, "i8*");
  offset += dictDirLen;

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
  };
}

function initSherpaOnnxOfflineTtsKokoroModelConfig(config, Module) {
  const modelLen = Module.lengthBytesUTF8(config.model) + 1;
  const voicesLen = Module.lengthBytesUTF8(config.voices) + 1;
  const tokensLen = Module.lengthBytesUTF8(config.tokens) + 1;
  const dataDirLen = Module.lengthBytesUTF8(config.dataDir) + 1;
  const dictDirLen = Module.lengthBytesUTF8(config.dictDir || "") + 1;
  const lexiconLen = Module.lengthBytesUTF8(config.lexicon || "") + 1;
  const langLen = Module.lengthBytesUTF8(config.lang || "") + 1;

  const n =
    modelLen +
    voicesLen +
    tokensLen +
    dataDirLen +
    dictDirLen +
    lexiconLen +
    langLen;
  const buffer = Module._malloc(n);

  const len = 8 * 4;
  const ptr = Module._malloc(len);

  let offset = 0;
  Module.stringToUTF8(config.model, buffer + offset, modelLen);
  offset += modelLen;

  Module.stringToUTF8(config.voices, buffer + offset, voicesLen);
  offset += voicesLen;

  Module.stringToUTF8(config.tokens, buffer + offset, tokensLen);
  offset += tokensLen;

  Module.stringToUTF8(config.dataDir, buffer + offset, dataDirLen);
  offset += dataDirLen;

  Module.stringToUTF8(config.dictDir || "", buffer + offset, dictDirLen);
  offset += dictDirLen;

  Module.stringToUTF8(config.lexicon || "", buffer + offset, lexiconLen);
  offset += lexiconLen;

  Module.stringToUTF8(config.lang || "", buffer + offset, langLen);
  offset += langLen;

  offset = 0;
  Module.setValue(ptr, buffer + offset, "i8*");
  offset += modelLen;

  Module.setValue(ptr + 4, buffer + offset, "i8*");
  offset += voicesLen;

  Module.setValue(ptr + 8, buffer + offset, "i8*");
  offset += tokensLen;

  Module.setValue(ptr + 12, buffer + offset, "i8*");
  offset += dataDirLen;

  Module.setValue(ptr + 16, config.lengthScale || 1.0, "float");

  Module.setValue(ptr + 20, buffer + offset, "i8*");
  offset += dictDirLen;

  Module.setValue(ptr + 24, buffer + offset, "i8*");
  offset += lexiconLen;

  Module.setValue(ptr + 28, buffer + offset, "i8*");
  offset += langLen;

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
  };
}

function initSherpaOnnxOfflineTtsKittenModelConfig(config, Module) {
  const modelLen = Module.lengthBytesUTF8(config.model) + 1;
  const voicesLen = Module.lengthBytesUTF8(config.voices) + 1;
  const tokensLen = Module.lengthBytesUTF8(config.tokens) + 1;
  const dataDirLen = Module.lengthBytesUTF8(config.dataDir) + 1;

  const n = modelLen + voicesLen + tokensLen + dataDirLen;
  const buffer = Module._malloc(n);

  const len = 5 * 4;
  const ptr = Module._malloc(len);

  let offset = 0;
  Module.stringToUTF8(config.model, buffer + offset, modelLen);
  offset += modelLen;

  Module.stringToUTF8(config.voices, buffer + offset, voicesLen);
  offset += voicesLen;

  Module.stringToUTF8(config.tokens, buffer + offset, tokensLen);
  offset += tokensLen;

  Module.stringToUTF8(config.dataDir, buffer + offset, dataDirLen);
  offset += dataDirLen;

  offset = 0;
  Module.setValue(ptr, buffer + offset, "i8*");
  offset += modelLen;

  Module.setValue(ptr + 4, buffer + offset, "i8*");
  offset += voicesLen;

  Module.setValue(ptr + 8, buffer + offset, "i8*");
  offset += tokensLen;

  Module.setValue(ptr + 12, buffer + offset, "i8*");
  offset += dataDirLen;

  Module.setValue(ptr + 16, config.lengthScale || 1.0, "float");

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
  };
}

function initSherpaOnnxOfflineTtsZipVoiceModelConfig(config, Module) {
  const tokensLen = Module.lengthBytesUTF8(config.tokens) + 1;
  const textModelLen = Module.lengthBytesUTF8(config.textModel) + 1;
  const flowMatchingModelLen =
    Module.lengthBytesUTF8(config.flowMatchingModel) + 1;
  const vocoderLen = Module.lengthBytesUTF8(config.vocoder) + 1;
  const dataDirLen = Module.lengthBytesUTF8(config.dataDir) + 1;
  const pinyinDictLen = Module.lengthBytesUTF8(config.pinyinDict || "") + 1;

  const n =
    tokensLen +
    textModelLen +
    flowMatchingModelLen +
    vocoderLen +
    dataDirLen +
    pinyinDictLen;

  const buffer = Module._malloc(n);

  const len = 10 * 4;
  const ptr = Module._malloc(len);

  let offset = 0;
  Module.stringToUTF8(config.tokens || "", buffer + offset, tokensLen);
  offset += tokensLen;

  Module.stringToUTF8(config.textModel || "", buffer + offset, textModelLen);
  offset += textModelLen;

  Module.stringToUTF8(
    config.flowMatchingModel || "",
    buffer + offset,
    flowMatchingModelLen
  );
  offset += flowMatchingModelLen;

  Module.stringToUTF8(config.vocoder || "", buffer + offset, vocoderLen);
  offset += vocoderLen;

  Module.stringToUTF8(config.dataDir || "", buffer + offset, dataDirLen);
  offset += dataDirLen;

  Module.stringToUTF8(config.pinyinDict || "", buffer + offset, pinyinDictLen);
  offset += pinyinDictLen;

  offset = 0;
  Module.setValue(ptr, buffer + offset, "i8*");
  offset += tokensLen;

  Module.setValue(ptr + 4, buffer + offset, "i8*");
  offset += textModelLen;

  Module.setValue(ptr + 8, buffer + offset, "i8*");
  offset += flowMatchingModelLen;

  Module.setValue(ptr + 12, buffer + offset, "i8*");
  offset += vocoderLen;

  Module.setValue(ptr + 16, buffer + offset, "i8*");
  offset += dataDirLen;

  Module.setValue(ptr + 20, buffer + offset, "i8*");
  offset += pinyinDictLen;

  Module.setValue(ptr + 24, config.featScale || 0.1, "float");
  Module.setValue(ptr + 28, config.tShift || 0.5, "float");
  Module.setValue(ptr + 32, config.targetRMS || 0.1, "float");
  Module.setValue(ptr + 36, config.guidanceScale || 1.0, "float");

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
  };
}

function initSherpaOnnxOfflineTtsModelConfig(config, Module) {
  if (!("offlineTtsVitsModelConfig" in config)) {
    config.offlineTtsVitsModelConfig = {
      model: "",
      lexicon: "",
      tokens: "",
      noiseScale: 0.667,
      noiseScaleW: 0.8,
      lengthScale: 1.0,
      dataDir: "",
    };
  }

  if (!("offlineTtsMatchaModelConfig" in config)) {
    config.offlineTtsMatchaModelConfig = {
      acousticModel: "",
      vocoder: "",
      lexicon: "",
      tokens: "",
      noiseScale: 0.667,
      lengthScale: 1.0,
      dataDir: "",
    };
  }

  if (!("offlineTtsKokoroModelConfig" in config)) {
    config.offlineTtsKokoroModelConfig = {
      model: "",
      voices: "",
      tokens: "",
      lengthScale: 1.0,
      dataDir: "",
      lexicon: "",
      lang: "",
    };
  }

  if (!("offlineTtsKittenModelConfig" in config)) {
    config.offlineTtsKittenModelConfig = {
      model: "",
      voices: "",
      tokens: "",
      lengthScale: 1.0,
    };
  }

  if (!("offlineTtsZipVoiceModelConfig" in config)) {
    config.offlineTtsZipVoiceModelConfig = {
      tokens: "",
      textModel: "",
      flowMatchingModel: "",
      vocoder: "",
      dataDir: "",
      pinyinDict: "",
      featScale: 0.1,
      tShift: 0.5,
      targetRMS: 0.1,
      guidanceScale: 1.0,
    };
  }

  const vitsModelConfig = initSherpaOnnxOfflineTtsVitsModelConfig(
    config.offlineTtsVitsModelConfig,
    Module
  );

  const matchaModelConfig = initSherpaOnnxOfflineTtsMatchaModelConfig(
    config.offlineTtsMatchaModelConfig,
    Module
  );

  const kokoroModelConfig = initSherpaOnnxOfflineTtsKokoroModelConfig(
    config.offlineTtsKokoroModelConfig,
    Module
  );

  const kittenModelConfig = initSherpaOnnxOfflineTtsKittenModelConfig(
    config.offlineTtsKittenModelConfig,
    Module
  );

  const zipVoiceModelConfig = initSherpaOnnxOfflineTtsZipVoiceModelConfig(
    config.offlineTtsZipVoiceModelConfig,
    Module
  );

  const len =
    vitsModelConfig.len +
    matchaModelConfig.len +
    kokoroModelConfig.len +
    kittenModelConfig.len +
    zipVoiceModelConfig.len +
    3 * 4;

  const ptr = Module._malloc(len);

  let offset = 0;
  Module._CopyHeap(vitsModelConfig.ptr, vitsModelConfig.len, ptr + offset);
  offset += vitsModelConfig.len;

  Module.setValue(ptr + offset, config.numThreads || 1, "i32");
  offset += 4;

  Module.setValue(ptr + offset, config.debug || 0, "i32");
  offset += 4;

  const providerLen = Module.lengthBytesUTF8(config.provider || "cpu") + 1;
  const buffer = Module._malloc(providerLen);
  Module.stringToUTF8(config.provider || "cpu", buffer, providerLen);
  Module.setValue(ptr + offset, buffer, "i8*");
  offset += 4;

  Module._CopyHeap(matchaModelConfig.ptr, matchaModelConfig.len, ptr + offset);
  offset += matchaModelConfig.len;

  Module._CopyHeap(kokoroModelConfig.ptr, kokoroModelConfig.len, ptr + offset);
  offset += kokoroModelConfig.len;

  Module._CopyHeap(kittenModelConfig.ptr, kittenModelConfig.len, ptr + offset);
  offset += kittenModelConfig.len;

  Module._CopyHeap(
    zipVoiceModelConfig.ptr,
    zipVoiceModelConfig.len,
    ptr + offset
  );
  offset += zipVoiceModelConfig.len;

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
    config: vitsModelConfig,
    matcha: matchaModelConfig,
    kokoro: kokoroModelConfig,
    kitten: kittenModelConfig,
    zipvoice: zipVoiceModelConfig,
  };
}

function initSherpaOnnxOfflineTtsConfig(config, Module) {
  const modelConfig = initSherpaOnnxOfflineTtsModelConfig(
    config.offlineTtsModelConfig,
    Module
  );
  const len = modelConfig.len + 4 * 4;

  const ptr = Module._malloc(len);
  let offset = 0;
  Module._CopyHeap(modelConfig.ptr, modelConfig.len, ptr + offset);
  offset += modelConfig.len;

  const ruleFstsLen = Module.lengthBytesUTF8(config.ruleFsts || "") + 1;
  const ruleFarsLen = Module.lengthBytesUTF8(config.ruleFars || "") + 1;

  const buffer = Module._malloc(ruleFstsLen + ruleFarsLen);
  Module.stringToUTF8(config.ruleFsts || "", buffer, ruleFstsLen);
  Module.stringToUTF8(config.ruleFars || "", buffer + ruleFstsLen, ruleFarsLen);

  Module.setValue(ptr + offset, buffer, "i8*");
  offset += 4;

  Module.setValue(ptr + offset, config.maxNumSentences || 1, "i32");
  offset += 4;

  Module.setValue(ptr + offset, buffer + ruleFstsLen, "i8*");
  offset += 4;

  Module.setValue(ptr + offset, config.silenceScale || 0.2, "float");
  offset += 4;

  return {
    buffer: buffer,
    ptr: ptr,
    len: len,
    config: modelConfig,
  };
}

function createOfflineTts(Module) {
  let offlineTts = null;
  return {
    init: function (config) {
      const offlineTtsConfig = initSherpaOnnxOfflineTtsConfig(
        config.offlineTtsConfig,
        Module
      );
      const handle = Module._SherpaOnnxCreateOfflineTts(offlineTtsConfig.ptr);
      freeConfig(offlineTtsConfig, Module);

      if (handle == 0) {
        return;
      }

      offlineTts = {
        handle: handle,
        sampleRate: Module._SherpaOnnxOfflineTtsSampleRate(handle),
        numSpeakers: Module._SherpaOnnxOfflineTtsNumSpeakers(handle),
        generate: function (config) {
          const text = config.text || "";
          const textLen = Module.lengthBytesUTF8(text) + 1;

          const sid = config.sid || 0;
          const speed = config.speed || 1.0;
          const buffer = Module._malloc(textLen);
          Module.stringToUTF8(text, buffer, textLen);

          const h = Module._SherpaOnnxOfflineTtsGenerate(
            this.handle,
            buffer,
            sid,
            speed
          );

          Module._free(buffer);

          const samplesPtr = Module.getValue(h, "i8*"); // it is actually float*
          const numSamples = Module.getValue(h + 4, "i32"); // number of samples
          const sampleRate = Module.getValue(h + 8, "i32");

          const samples = new Float32Array(numSamples);
          for (let i = 0; i < numSamples; ++i) {
            samples[i] = Module.HEAPF32[samplesPtr / 4 + i];
          }

          Module._SherpaOnnxDestroyOfflineTtsGeneratedAudio(h);
          return {
            samples: samples,
            sampleRate: sampleRate,
          };
        },
        free: function () {
          Module._SherpaOnnxDestroyOfflineTts(this.handle);
          this.handle = 0;
        },
      };
      return offlineTts;
    },
  };
}

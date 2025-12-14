# Client-Side Neural TTS (Sherpa-ONNX WASM)

A purely client-side Text-to-Speech application using [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) WebAssembly.
This project demonstrates how to run next-gen Kaldi speech synthesis models (VITS/Piper) directly in the browser without any backend server.

## Features

- **Zero Latency**: Processed locally on your CPU using WebAssembly.
- **Privacy First**: No text or audio is sent to the cloud.
- **MIT Licensed**: Free to use and modify.

## Technologies

- **Next.js 16**: (React 19)
- **Sherpa-ONNX**: C++ inference engine compiled to WASM.
- **Emscripten**: For WASM bindings.
- **TailwindCSS**: For styling.

## Getting Started

1. **Install Dependencies**

   ```bash
   npm install
   # or
   bun install
   ```

2. **Run Development Server**

   ```bash
   npm run dev
   # or
   bun run dev
   ```

3. **Open Browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## How It Works

The application loads a `.wasm` binary that contains the Sherpa-ONNX inference engine. It fetches the model (`model.onnx`, `tokens.txt`) and essential eSpeak-NG data from the public directory into the browser's virtual filesystem (MEMFS).

We utilize a custom JavaScript wrapper to bridge the C-API exports (`_SherpaOnnxCreateOfflineTts`, etc.) to React, enabling high-performance audio generation.

## License

MIT License

import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TTS App",
  description: "Text to Speech App",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Script id="sherpa-module-init" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined') {
              console.log("Injecting Custom Module configuration...");
              window.Module = window.Module || {};
              
              // Fix file location for both WASM and data files
              window.Module.locateFile = function(path, prefix) {
                console.log("locateFile called for:", path, "prefix:", prefix);
                // Always serve from root for static export
                if (path.endsWith(".wasm")) {
                  return "./sherpa-onnx-wasm-main-tts.wasm";
                }
                if (path.endsWith(".data")) {
                  return "./sherpa-onnx-wasm-main-tts.data";
                }
                console.log("locateFile returning default:", prefix + path);
                return prefix + path;
              };
              
              // Debug logging for WASM output
              window.Module.print = function(text) { console.log("[WASM]: " + text); };
              window.Module.printErr = function(text) { console.error("[WASM ERR]: " + text); };
              
              // Track module initialization
              window.Module.onRuntimeInitialized = function() {
                console.log("WASM Runtime Initialized Successfully!");
              };
            }
          `}
        </Script>
      </body>
    </html>
  );
}

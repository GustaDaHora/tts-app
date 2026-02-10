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
              
              // Handle locateFile to ensure correct paths in Vercel/GitHub Pages
              window.Module.locateFile = function(path, prefix) {
                console.log("locateFile called for:", path, "prefix:", prefix);
                
                // If prefix is empty or just "/", we might want to be explicit
                // But generally, for files in public/, relative paths "./" or simple filenames work if base is root
                
                if (path.endsWith(".wasm")) {
                  return "sherpa-onnx-wasm-main-tts.wasm"; 
                }
                if (path.endsWith(".data")) {
                  return "sherpa-onnx-wasm-main-tts.data";
                }
                
                return prefix + path;
              };
              
              // Debug logging for WASM output
              window.Module.print = function(text) { console.log("[WASM]: " + text); };
              window.Module.printErr = function(text) { console.error("[WASM ERR]: " + text); };
              
              // Track module initialization
              window.Module.onRuntimeInitialized = function() {
                console.log("WASM Runtime Initialized Successfully!");
                window.Module.isReady = true;
              };
            }
          `}
        </Script>
      </body>
    </html>
  );
}

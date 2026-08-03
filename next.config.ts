import type { NextConfig } from "next";

const isElectron = process.env.ELECTRON_BUILD === "1";

const nextConfig: NextConfig = {
  // standalone genera un server portable que Electron embebe.
  // Lo activamos solo durante el build de Electron para no afectar el deploy en Vercel.
  ...(isElectron ? { output: "standalone" as const } : {}),
};

export default nextConfig;

import type { NextConfig } from "next";
import { resolve } from "path";
import { config } from "dotenv";

// Load .env from monorepo root
config({ path: resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;

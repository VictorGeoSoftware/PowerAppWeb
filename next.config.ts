import type { NextConfig } from "next";

/** BmApp format: `APP_DEPLOY_VERSION` or `v` + ddMM_HHmm of the build. */
function buildVersion() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `v${p(d.getDate())}${p(d.getMonth() + 1)}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || buildVersion(),
  },
};

export default nextConfig;

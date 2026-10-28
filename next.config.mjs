/** @type {import('next').NextConfig} */
const githubPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  output: githubPages ? "export" : undefined,
  basePath: githubPages ? "/salary-smart-budget" : undefined,
  trailingSlash: githubPages,
  images: { unoptimized: true },
};
export default nextConfig;

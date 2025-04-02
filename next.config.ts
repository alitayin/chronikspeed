import type { NextConfig } from "next";
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const CopyPlugin = require('copy-webpack-plugin');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  
  // 禁用预渲染，避免服务器端加载 WASM
  experimental: {
    serverComponentsExternalPackages: ['ecash-lib', 'ecash-agora', 'ecashaddrjs'],
  },

  // NextJS wasm support
  webpack: function (config, { isServer }) {
    // 添加 WASM 支持
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // 设置 WebAssembly 模块文件名
    if (isServer) {
      config.output.webassemblyModuleFilename = './../static/wasm/[modulehash].wasm';
    } else {
      config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';
    }

    // 确保 WASM 文件被正确处理
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // 复制 WebAssembly 文件到可能需要的各个位置
    config.plugins.push(
      new CopyPlugin({
        patterns: [
          // ecash-lib WASM 文件
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm",
            to: "./.next/server/app/",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm",
            to: "./server/app/",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm",
            to: "./app/",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm",
            to: "./",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm",
            to: "./vendor-chunks/",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm",
            to: "./../static/wasm/",
          },
          // 浏览器版本的 WASM 文件
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_browser.wasm",
            to: "./static/wasm/",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_browser.wasm",
            to: "./.next/static/wasm/",
          },
          {
            from: "node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_browser.wasm",
            to: "./public/",
          },
        ],
      }),
    );

    return config;
  },
};

export default nextConfig;

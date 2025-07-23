const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: './src/extension.ts',
  target: 'node',
  output: {
    path: path.resolve(__dirname, 'out'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    assetModuleFilename: '[name][ext]'
  },
  resolve: { extensions: ['.ts', '.js'] },
  module: {
    rules: [
      { test: /\.ts$/, exclude: /node_modules/, use: 'ts-loader' },
      { test: /\.wasm$/, type: 'asset/resource' }
    ]
  },
  externals: { vscode: 'commonjs vscode' },
  plugins: [
    new CopyPlugin({
        patterns: [
          { from: 'node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_nodejs.wasm', to: 'ecash_lib_wasm_bg_nodejs.wasm' },
          { from: 'node_modules/ecash-lib/dist/ffi/ecash_lib_wasm_bg_browser.wasm', to: 'ecash_lib_wasm_bg_browser.wasm' },
          { from: 'node_modules/ecash-lib/dist/ffi/*.wasm', to: 'wasm/[name][ext]' }
        ]
    }),
    new webpack.IgnorePlugin({ resourceRegExp: /^bufferutil$|^utf-8-validate$/ })
  ]
};

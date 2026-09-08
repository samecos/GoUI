# 第三方组件与字体

本项目自有代码采用 [Unlicense](LICENSE)。第三方组件保留各自的许可证，不因本项目采用 Unlicense 而改变。

## 构建依赖

应用源码没有 npm 运行时依赖。构建工具由 `npm ci` 安装，不随源码仓库提交。以下为当前 `package-lock.json` 的主要组件；完整版本与平台依赖见锁文件，完整授权文本见安装后各包中的 `LICENSE` 文件及其上游仓库。

| 组件 | 锁定版本 | 许可证 | 用途 / 来源 |
| --- | --- | --- | --- |
| Vite | 7.3.6 | MIT（其工具包还包含其他授权的依赖） | [开发与构建工具](https://github.com/vitejs/vite) |
| esbuild | 0.28.2 | MIT | [代码转换](https://github.com/evanw/esbuild) |
| Rollup | 4.63.1 | MIT | [模块打包](https://github.com/rollup/rollup) |
| PostCSS | 8.5.28 | MIT | [CSS 处理](https://github.com/postcss/postcss) |
| picocolors | 1.1.1 | ISC | [终端输出](https://github.com/alexeyraspopov/picocolors) |
| source-map-js | 1.2.1 | BSD-3-Clause | [Source map 支持](https://github.com/7rulnik/source-map-js) |

锁文件记录的其余 npm 依赖许可证为 MIT。锁文件元数据不包含工具内部打包的所有组件；例如 Vite 的 `node_modules/vite/LICENSE.md` 还列出 BSD-2-Clause、CC0-1.0、ISC、MIT 等授权。如果重新分发构建工具本身或 `node_modules`，请同时保留对应包的完整授权与版权声明。

Vite 会在浏览器构建中加入模块预加载兼容代码。下文保留其 MIT 版权与授权文本。`npm run build` 会将本文件与项目 `LICENSE` 一起复制到 `dist/`，便于随静态产物分发。

## 在线字体

`src/style.css` 通过 Google Fonts 加载 Noto Sans SC 与 Noto Serif SC；本仓库和默认构建产物不包含字体二进制文件。浏览器会向 `fonts.googleapis.com` 和 `fonts.gstatic.com` 请求字体资源；网络不可用时使用 CSS 中声明的系统字体回退。

- [Noto Sans SC：OFL-1.1 及版权声明](https://github.com/google/fonts/blob/main/ofl/notosanssc/OFL.txt)
- [Noto Serif SC：OFL-1.1 及版权声明](https://github.com/google/fonts/blob/main/ofl/notoserifsc/OFL.txt)

如改为自行托管或重新分发字体，请随字体保留对应的版权声明和 OFL 授权文本。移除 CSS 第一行的远程字体导入即可改用系统字体；项目没有对保留该字体或样式作要求。

## 可选浏览器测试工具

Python Playwright 是单独安装的测试工具，不属于浏览器应用产物，采用 [Apache-2.0](https://github.com/microsoft/playwright-python/blob/main/LICENSE)。本仓库不分发 Playwright 或 Chrome 安装包。

## Vite core license

MIT License

Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Local media export dependencies

Pinned version: 1.61.3. Downloaded from the npm registry and verified against its SHA-512 integrity metadata before extraction. No runtime CDN or internet requests.

- mediabunny.mjs: mediabunny browser ES-module bundle (unmodified). Source: https://github.com/Vanilagy/mediabunny/tree/v1.61.3 ; npm: https://www.npmjs.com/package/mediabunny/v/1.61.3
- aac-encoder.mjs: @mediabunny/aac-encoder browser ES-module bundle, including embedded WebAssembly. Only modification: 2 bare peer imports rewritten to ./mediabunny.mjs for local browser loading. Source: https://github.com/Vanilagy/mediabunny/tree/v1.61.3/packages/aac-encoder ; npm: https://www.npmjs.com/package/@mediabunny/aac-encoder/v/1.61.3
- Both package MPL-2.0 license notices are retained alongside these files. The AAC extension includes a size-optimized FFmpeg AAC encoder; its LGPL-2.1 notice is also retained here. FFmpeg source: https://github.com/FFmpeg/FFmpeg ; the extension build/source is provided by the pinned Mediabunny source above.

Usage: dynamically imported only when exporting MP4, by src/engine/VideoRecorder.mjs.

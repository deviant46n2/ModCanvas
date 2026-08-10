# Third-Party Notices

This file lists third-party software that is redistributed (bundled) with the
ModCanvas application and its dependency licenses.

## Bundled frontend dependencies

| Package | Version | License |
|---------|---------|---------|
| `@xyflow/react` | ^12 | MIT |
| `@tauri-apps/api` | ^2 | Apache-2.0 OR MIT |
| `@tauri-apps/plugin-dialog` | ^2 | MIT OR Apache-2.0 |
| `react` | ^19 | MIT |
| `react-dom` | ^19 | MIT |
| `react-window` | ^2 | MIT |
| `reactflow` | ^11 | MIT |

Packages licensed `Apache-2.0 OR MIT` / `MIT OR Apache-2.0` are used under the
MIT option; the MIT License text below applies.

### Development / test-only tooling (not shipped in the app bundle)

- `playwright` — Apache-2.0 — used for end-to-end browser automation only.
- `vite` and other contents of `frontend/package.json` `devDependencies` —
  build-time only, not redistributed.

## MIT License

Copyright (c) the respective contributors of the packages listed above.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## The curve-math note (`@xyflow/react` `getBezierPath`)

`frontend/src/core/quest/edge-geometry.ts` reuses the control-offset formula
from `@xyflow/react` (MIT, Copyright (c) 2019-2025 webkid GmbH) so the editor's
default bezier curve matches the rendered edge pixel-for-pixel. The full MIT
notice is reproduced in a comment directly above that code.

---

## Explicitly NOT bundled (launched externally — no redistribution)

- **Prism Launcher** (GPL-3.0) is **not** included or copied. The application
  only launches the user's separately-installed Prism Launcher as an external
  child process via `LauncherDriver` (IPC). Launching an external program is
  interoperability, not a combined/derivative work, so no GPL notice is
  required and no Prism code is distributed here.
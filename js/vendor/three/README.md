# three.js r160 (vendored)

`three.module.min.js` and the addons in `addons/` are copied unchanged from the npm package `three@0.160.1` (MIT, see LICENSE),
except that each addon's `import ... from 'three'` (and its `../shaders/`, `../lines/` paths) is rewritten to a relative path so the
browser can load them as plain ES modules with no import map or bundler.

Used only by the Jarvis hologram views (js/terminal/jarvisGL.js), which load it lazily the first time such a view opens.
To upgrade: `npm pack three@<ver>`, copy the same files, re-run the same sed (see git history of this folder).

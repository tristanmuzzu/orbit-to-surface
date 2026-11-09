# Orbit to Surface

One HTML file, 64 KB. No textures, no models, no libraries.

It starts in orbit, falls through the clouds to a sunset ocean in one unbroken
shot, then hands you the controls.

**Fly it:** https://tristanmuzzu.github.io/orbit-to-surface/

W A S D to steer, Shift to boost. It flies itself until you press a key.
Needs a browser with WebGL2 and a reasonable GPU; the picture resolution adapts
to what yours can hold.

## How it works

Everything on screen (air, clouds, sea, mountains) is computed per pixel, per
frame, in one fragment shader. There are no assets: the only texture is a noise
volume the page builds for itself when it starts.

- `index.html` is the whole thing. View source and it is all there.
- `src/` is the same code split into readable parts.
- `tools/build.mjs` joins `src/` back into the one file: `node tools/build.mjs`.
- The other files in `tools/` render stills and the 60 fps film, frame by
  frame, through headless Chrome.

Written by Claude Fable 5.2.

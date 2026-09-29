# Morph3D

> [Russian version](README_RU.md)

**Morph3D** is a real-time 3D animation of a morphing dot-cloud figure. A single object made of several hundred small dots continuously rotates, drifts across the screen, and smoothly transforms between three geometric shapes - a sphere, a cube, and a torus. The project ships with two color themes: **Light** (default) renders the dots in black and gray on a white background, while **Dark** renders them in a soft neon color on a black background, with the color slowly morphing between palette entries. In both themes each dot's shade is determined by its depth, so the flat point cloud reads as a solid three-dimensional form.

The project is a dependency-free JavaScript / HTML5 Canvas 2D port of an original Windows OpenGL screensaver written in C. The port preserves the original animation logic - shape generation, the morphing state machine, rotation, screen motion, and perspective projection - while replacing the native OpenGL rendering with a pure Canvas 2D implementation that runs in any modern browser.

## Features

- **Three morphing shapes** - sphere, cube, and torus. The figure continuously and smoothly transforms from one shape to another.
- **Uniform point count** - every shape is built from exactly the same number of points (384), so a morph is a clean one-to-one point interpolation with no popping, stretching artifacts, or missing dots.
- **Depth-based shading** - each dot's shade is computed from its distance to the camera. In the Light theme the closer a point is, the darker it appears (near-black), and the farther it is, the lighter (light gray); in the Dark theme the closer a point is, the brighter its neon color, and the farther it is, the darker. This single cue produces a convincing sense of volume without any lighting model.
- **Minimalist look** - no shadows, no glow, no motion trails. Just clean dots on a light or black background.
- **Two color themes** - Light (default, gray dots on white) and Dark (neon dots on black). A toggle button in the top-left corner of the page switches between them at any time.
- **Neon color morphing (Dark theme)** - all dots share a single soft-neon color taken from an 8-color palette (the same palette as the original C screensaver); during each shape morph the color smoothly transitions to a new palette entry that differs from both the current and the previous one.
- **Continuous rotation** - the figure spins around a fixed tilted axis at a constant speed.
- **Spiral screen motion** - the figure's center travels across the screen along an asymmetric elliptical spiral whose radius slowly pulses, so the path never repeats exactly.
- **"Presence" depth breathing** - on a long (~30 s) period the figure drifts toward and away from the camera, adding a subtle sense of presence.
- **True perspective** - points are projected with a fixed field of view and scale with depth, so nearer points are drawn larger.
- **Crisp on any display** - the canvas follows the window size and renders at the device pixel ratio, keeping dots sharp on high-DPI / retina screens.
- **Zero dependencies** - no libraries, no frameworks, no build step. It runs by simply opening the page in a browser.

## Technologies

- **JavaScript (ES6)** - modern syntax, strict mode, fully self-contained.
- **HTML5 Canvas 2D** - all drawing uses the 2D canvas context (filled circles); no WebGL.
- **requestAnimationFrame** - the animation loop is driven by the browser's frame callback.
- **Delta-time updates** - motion and morphing advance by real elapsed time, so the speed is identical on 60 Hz and 144 Hz displays.
- **devicePixelRatio scaling** - the canvas backing store is scaled to the display density for sharp rendering.
- **No external dependencies** - no npm packages, no Three.js, no build tooling.

## Methodology

### Point-cloud shape generation
Each shape is produced as a set of 3D points placed on (or around) its surface. All shapes use the same point count so they can be morphed into one another:

- **Sphere** - points are spread uniformly over the surface with a Fibonacci (golden-angle) spiral, which avoids the polar clustering that a naive latitude/longitude grid would produce.
- **Cube** - points sit at the intersections of an 8×8 grid drawn on each of the six faces. The grid spans the full face, so the cube's corners (vertices) are covered as well.
- **Torus** - points are laid out on a 32×12 parametric grid over the tube surface.

### Size normalization
After generation, each shape is uniformly scaled so that its circumscribed sphere has the same radius. This makes all three figures the same apparent size on screen and keeps the morph visually balanced.

### Morphing state machine
A two-state machine controls the transformation:

- **Stable** - the figure holds its current shape for a random 2-6 seconds.
- **Morph** - the figure interpolates toward the next shape for a random 2-6 seconds.

During a morph, every point travels along a straight line between its position in the current shape and its position in the target shape. The progress is eased with a smoothstep curve (smooth ease-in and ease-out), which makes the transition feel organic instead of linear. The next shape is always chosen to be different from the current one. In the Dark theme the color morphs in sync with the shape: the current neon color is interpolated toward a new palette entry with the same smoothstep curve, and the new entry is always different from both the current and the previous color.

### Rotation
The figure rotates about a fixed tilted axis using **Rodrigues' rotation formula**, which rotates each point by the current angle around an arbitrary unit axis. The rotation speed is constant (40°/s).

### Screen motion and depth breathing
- The figure's center follows an **asymmetric elliptical spiral** in screen space. The spiral's radius is modulated by a slow sine wave, producing a pulsing, non-repeating trajectory.
- A separate slow oscillation moves the figure along the depth (Z) axis - the **"presence" effect** - bringing it closer to and farther from the camera on a ~30-second period. The approach is limited so the figure never passes the camera.

### Perspective projection
Each point is projected with a standard **perspective projection** using a fixed focal length derived from a 45° field of view. The projected dot size scales inversely with depth, so nearer points are drawn larger and farther points smaller.

### Depth shading
Rather than a lighting model, each dot's shade is derived from its **distance to the camera**. The distance is normalized against the expected near/far range and mapped onto a ramp: in the Light theme onto a gray ramp from near-black (closest points) to light gray (farthest points); in the Dark theme onto a brightness ramp applied to the current neon color, from full brightness (closest points) down to a dimmed level (farthest points). This single depth cue is enough for the eye to perceive the shape as three-dimensional.

### Color themes
The page supports two themes, switched by a toggle button in the top-left corner:

- **Light** (default) - white background, dots shaded in gray by depth.
- **Dark** - black background, all dots share a single soft-neon color from an 8-color palette (cyan, magenta, green, blue, pink, yellow, purple, orange - the same palette as the original C screensaver). The color changes with every shape morph and is dimmed with depth, so farther points appear darker.

The theme can be switched at any time without restarting the animation; the background and dot colors update on the next frame.

### Timing
The whole animation is driven by **real elapsed time** (delta time) rather than a fixed frame count, so the speed is consistent across refresh rates. Delta time is clamped to a maximum to avoid large jumps after the tab is paused or throttled.

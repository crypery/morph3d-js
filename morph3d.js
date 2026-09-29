/*
 * Git: https://github.com/crypery
 * Author: https://crypery.com
 * License: GNU AGPL v3 (Affero GPL)
 */

// =====================================================================
//  Morph3D - morphing point-cloud outline shapes (sphere / cube / torus)
//  Themes: Light (black-gray dots on a light background, depth gradient)
//  and Dark (black background, neon dots with color morphing, as in morph3d.c).
//  Rotation, spiral motion, morphing. No shadow, no glow.
//  Canvas 2D analog of morph3d.c.
// =====================================================================

(function () {
    'use strict';

    // ---------- Constants ----------
    let THEME = 'Light';         // theme style: 'Light' or 'Dark'
    const NUM_POINTS = 384;      // same number of points in all shapes (cube: 6 faces x 8x8 grid)
    const SHAPE_SIZE = 2.0;      // unified size: diameter / largest face
    const POINT_SIZE = 3.0;      // point diameter (pixels)
    const NUM_SHAPES = 3;
    const CAM_DIST = 5.0;        // camera distance to the scene
    const FOV_DEG = 45.0;
    const SPIRAL_SPEED = 0.6;    // elliptical spiral phase speed (rad/s)
    const ROT_SPEED_DEG = 40.0;  // rotation speed (deg/s), direction is fixed

    // ---------- Timings (seconds) ----------
    const STABLE_MIN = 2.0;      // min. stable state duration
    const STABLE_MAX = 6.0;      // max. stable state duration
    const MORPH_MIN = 2.0;       // min. morphing duration
    const MORPH_MAX = 6.0;       // max. morphing duration
    const PRESENCE_PERIOD = 30.0; // presence effect period (s)

    const SHAPE_SPHERE = 0, SHAPE_CUBE = 1, SHAPE_TORUS = 2;
    const STATE_STABLE = 0, STATE_MORPH = 1;

    // Point color by depth: the closer to the camera, the darker
    const GRAY_NEAR = 0.05;  // nearest point (almost black)
    const GRAY_FAR = 0.85;   // farthest point (light gray)
    const D_MIN = CAM_DIST * 0.5 - 1.0;  // min. distance to a point
    const D_MAX = CAM_DIST + 1.0;        // max. distance to a point

    // ---------- Themes ----------
    const THEMES = {
        Light: { bg: '#ffffff' },  // light background, gray dots by depth
        Dark:  { bg: '#000000' },  // black background, neon dots (as in morph3d.c)
    };

    // "Soft neon" palette (as in morph3d.c) - for the Dark theme
    const NEON_COLORS = [
        [0.45, 0.90, 1.00],  // cyan
        [1.00, 0.45, 0.90],  // magenta
        [0.45, 1.00, 0.65],  // green
        [0.45, 0.65, 1.00],  // blue
        [1.00, 0.55, 0.85],  // pink
        [1.00, 0.90, 0.45],  // yellow
        [0.75, 0.45, 1.00],  // purple
        [1.00, 0.65, 0.35],  // orange
    ];
    const NUM_COLORS = NEON_COLORS.length;
    const DARK_BRIGHTNESS = 0.6;      // brightness of the nearest point in the Dark theme
    const DARK_FAR_BRIGHTNESS = 0.15; // brightness of the farthest point (the farther, the darker)

    const canvas = document.getElementById('morph3d');
    const ctx = canvas.getContext('2d');
    let winW = 1, winH = 1;

    // ---------- Shape generation (shared) ----------
    // Sphere: uniform distribution (Fibonacci spiral)
    function genSphere() {
        const pts = new Float32Array(NUM_POINTS * 3);
        const radius = SHAPE_SIZE * 0.5;
        const golden = (1 + Math.sqrt(5)) * 0.5;
        const step = 2 * Math.PI / golden;
        for (let i = 0; i < NUM_POINTS; i++) {
            const y = 1 - 2 * i / (NUM_POINTS - 1);
            const rad = Math.sqrt(1 - y * y);
            const th = step * i;
            pts[i * 3] = radius * rad * Math.cos(th);
            pts[i * 3 + 1] = radius * y;
            pts[i * 3 + 2] = radius * rad * Math.sin(th);
        }
        return pts;
    }

    // Cube: points at the intersections of an N x N grid on each of the 6 faces.
    // The grid covers the whole face, including the corners (cube vertices).
    function genCube() {
        const pts = new Float32Array(NUM_POINTS * 3);
        const h = SHAPE_SIZE * 0.5;
        const N = Math.round(Math.sqrt(NUM_POINTS / 6)); // grid points per side (8)
        // 6 faces: center, two tangents (normal not needed)
        const faces = [
            { c: [ h, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
            { c: [-h, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
            { c: [0,  h, 0], u: [1, 0, 0], v: [0, 0, 1] },
            { c: [0, -h, 0], u: [1, 0, 0], v: [0, 0, 1] },
            { c: [0, 0,  h], u: [1, 0, 0], v: [0, 1, 0] },
            { c: [0, 0, -h], u: [1, 0, 0], v: [0, 1, 0] },
        ];
        let idx = 0;
        for (let f = 0; f < 6 && idx < NUM_POINTS; f++) {
            const fc = faces[f].c, fu = faces[f].u, fv = faces[f].v;
            for (let i = 0; i < N && idx < NUM_POINTS; i++) {
                for (let j = 0; j < N && idx < NUM_POINTS; j++) {
                    // Grid intersections: edge to edge of the face (including corners)
                    const lx = (i / (N - 1) - 0.5) * 2 * h;
                    const ly = (j / (N - 1) - 0.5) * 2 * h;
                    pts[idx * 3]     = fc[0] + fu[0] * lx + fv[0] * ly;
                    pts[idx * 3 + 1] = fc[1] + fu[1] * lx + fv[1] * ly;
                    pts[idx * 3 + 2] = fc[2] + fu[2] * lx + fv[2] * ly;
                    idx++;
                }
            }
        }
        while (idx < NUM_POINTS) {
            pts[idx * 3] = pts[0];
            pts[idx * 3 + 1] = pts[1];
            pts[idx * 3 + 2] = pts[2];
            idx++;
        }
        return pts;
    }

    // Torus: points on the surface, lying in the XZ plane
    function genTorus() {
        const pts = new Float32Array(NUM_POINTS * 3);
        const R = SHAPE_SIZE * 0.32;
        const r = SHAPE_SIZE * 0.18;
        const nu = 32;
        const nv = NUM_POINTS / nu;
        let idx = 0;
        for (let i = 0; i < nu && idx < NUM_POINTS; i++) {
            const u = 2 * Math.PI * i / nu;
            for (let j = 0; j < nv && idx < NUM_POINTS; j++) {
                const v = 2 * Math.PI * j / nv;
                const cu = Math.cos(u), su = Math.sin(u);
                const cv = Math.cos(v), sv = Math.sin(v);
                pts[idx * 3] = (R + r * cv) * cu;
                pts[idx * 3 + 1] = r * sv;
                pts[idx * 3 + 2] = (R + r * cv) * su;
                idx++;
            }
        }
        while (idx < NUM_POINTS) {
            pts[idx * 3] = pts[0];
            pts[idx * 3 + 1] = pts[1];
            pts[idx * 3 + 2] = pts[2];
            idx++;
        }
        return pts;
    }

    // Normalization: circumscribed sphere radius = 1 (unified visible shape size)
    function normalizeShape(pts) {
        let maxR = 0;
        for (let i = 0; i < NUM_POINTS; i++) {
            const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
            const r = Math.sqrt(x * x + y * y + z * z);
            if (r > maxR) maxR = r;
        }
        if (maxR > 0) {
            const k = 1.0 / maxR;
            for (let i = 0; i < NUM_POINTS * 3; i++) pts[i] *= k;
        }
        return pts;
    }

    const shapePts = [
        normalizeShape(genSphere()),
        normalizeShape(genCube()),
        normalizeShape(genTorus()),
    ];

    // ---------- Scene state ----------
    const scene = {
        center: [0, 0, 0],
        bounds: [0, 0, 0],
        spiralPhase: 0,
        rotAxis: [0, 0, 0],
        rotAngle: 0,
        rotSpeed: 0,
        curShape: 0, nextShape: 0, prevShape: -1,
        curColorIdx: 0, prevColorIdx: -1, nextColorIdx: 0,
        colorA: [0, 0, 0], colorB: [0, 0, 0], curColor: [0, 0, 0],
        state: STATE_STABLE,
        stateTime: 0,
        stateDuration: 0,
        curPos: new Float32Array(NUM_POINTS * 3),
        scrX: new Float32Array(NUM_POINTS),
        scrY: new Float32Array(NUM_POINTS),
        scrSize: new Float32Array(NUM_POINTS),
    };

    function randRange(a, b) {
        return a + Math.random() * (b - a);
    }

    // ---------- Motion ----------
    // Motion bounds: the shape does not leave the screen (the center is limited
    // so that the whole shape stays within the window).
    function computeBounds() {
        const fovRad = FOV_DEG * Math.PI / 180;
        const focal = (winH * 0.5) / Math.tan(fovRad * 0.5);
        let maxR = 0;
        for (let i = 0; i < NUM_POINTS; i++) {
            const x = shapePts[0][i * 3], y = shapePts[0][i * 3 + 1], z = shapePts[0][i * 3 + 2];
            const r = Math.sqrt(x * x + y * y + z * z);
            if (r > maxR) maxR = r;
        }
        const screenR = maxR * focal / CAM_DIST;
        scene.bounds[0] = Math.max(0, winW * 0.5 - screenR);
        scene.bounds[1] = Math.max(0, winH * 0.5 - screenR);
    }

    // Motion: centered asymmetric elliptical spiral.
    // The shape center traces an ellipse around the screen center; the radius
    // slowly pulses (rf), so the trajectory is spiral-like and asymmetric.
    // Presence effect: oscillation along Z (into the depth / toward the camera).
    function updateMotion(dt) {
        scene.spiralPhase += SPIRAL_SPEED * dt;
        const rf = 0.5 + 0.5 * Math.sin(scene.spiralPhase * 0.31);
        scene.center[0] = scene.bounds[0] * 0.65 * rf * Math.cos(scene.spiralPhase);
        scene.center[1] = scene.bounds[1] * 0.40 * rf * Math.sin(scene.spiralPhase);
        const zFreq = 2 * Math.PI / (SPIRAL_SPEED * PRESENCE_PERIOD);
        // Approach is limited (down to -CAM_DIST*0.5): the shape does not "explode" off screen
        scene.center[2] = -CAM_DIST + CAM_DIST * 0.5 * (0.5 + 0.5 * Math.sin(scene.spiralPhase * zFreq));
        scene.rotAngle += scene.rotSpeed * dt;
    }

    function initMotion() {
        scene.spiralPhase = Math.random() * 2 * Math.PI;
    }

    function initRotation() {
        let ax = 0.35, ay = 1.0, az = 0.25;
        const len = Math.sqrt(ax * ax + ay * ay + az * az);
        scene.rotAxis[0] = ax / len;
        scene.rotAxis[1] = ay / len;
        scene.rotAxis[2] = az / len;
        scene.rotAngle = 0;
        scene.rotSpeed = ROT_SPEED_DEG * Math.PI / 180;
    }

    // ---------- Morphing ----------
    function startMorph() {
        scene.prevShape = scene.curShape;
        let candShape;
        do {
            candShape = Math.floor(Math.random() * NUM_SHAPES);
        } while (candShape === scene.curShape || candShape === scene.prevShape);
        scene.nextShape = candShape;
        // New color: does not match the current or the previous one
        let candColor;
        do {
            candColor = Math.floor(Math.random() * NUM_COLORS);
        } while (candColor === scene.curColorIdx || candColor === scene.prevColorIdx);
        scene.nextColorIdx = candColor;
        scene.colorA[0] = scene.curColor[0]; scene.colorA[1] = scene.curColor[1]; scene.colorA[2] = scene.curColor[2];
        scene.colorB[0] = NEON_COLORS[scene.nextColorIdx][0];
        scene.colorB[1] = NEON_COLORS[scene.nextColorIdx][1];
        scene.colorB[2] = NEON_COLORS[scene.nextColorIdx][2];
    }

    // State machine: STABLE (2-6 s) -> MORPH (2-6 s) -> STABLE -> ...
    function updateState(dt) {
        scene.stateTime += dt;
        if (scene.stateTime >= scene.stateDuration) {
            if (scene.state === STATE_STABLE) {
                scene.state = STATE_MORPH;
                scene.stateTime = 0;
                scene.stateDuration = randRange(MORPH_MIN, MORPH_MAX);
                startMorph();
            } else {
                scene.prevColorIdx = scene.curColorIdx;
                scene.curColorIdx = scene.nextColorIdx;
                scene.prevShape = scene.curShape;
                scene.curShape = scene.nextShape;
                scene.state = STATE_STABLE;
                scene.stateTime = 0;
                scene.stateDuration = randRange(STABLE_MIN, STABLE_MAX);
            }
        }

        if (scene.state === STATE_MORPH) {
            let f = scene.stateTime / scene.stateDuration;
            if (f > 1) f = 1;
            const e = f * f * (3 - 2 * f); // smoothstep
            const a = shapePts[scene.curShape], b = shapePts[scene.nextShape];
            for (let i = 0; i < NUM_POINTS; i++) {
                scene.curPos[i * 3] = a[i * 3] + (b[i * 3] - a[i * 3]) * e;
                scene.curPos[i * 3 + 1] = a[i * 3 + 1] + (b[i * 3 + 1] - a[i * 3 + 1]) * e;
                scene.curPos[i * 3 + 2] = a[i * 3 + 2] + (b[i * 3 + 2] - a[i * 3 + 2]) * e;
            }
            scene.curColor[0] = scene.colorA[0] + (scene.colorB[0] - scene.colorA[0]) * e;
            scene.curColor[1] = scene.colorA[1] + (scene.colorB[1] - scene.colorA[1]) * e;
            scene.curColor[2] = scene.colorA[2] + (scene.colorB[2] - scene.colorA[2]) * e;
        } else {
            const a = shapePts[scene.curShape];
            for (let i = 0; i < NUM_POINTS * 3; i++) scene.curPos[i] = a[i];
            scene.curColor[0] = NEON_COLORS[scene.curColorIdx][0];
            scene.curColor[1] = NEON_COLORS[scene.curColorIdx][1];
            scene.curColor[2] = NEON_COLORS[scene.curColorIdx][2];
        }
    }

    function initMorph() {
        scene.curShape = Math.floor(Math.random() * NUM_SHAPES);
        scene.prevShape = -1;
        startMorph();
        scene.curColorIdx = scene.nextColorIdx;
        scene.prevColorIdx = -1;
        scene.colorA[0] = NEON_COLORS[scene.curColorIdx][0];
        scene.colorA[1] = NEON_COLORS[scene.curColorIdx][1];
        scene.colorA[2] = NEON_COLORS[scene.curColorIdx][2];
        scene.colorB[0] = scene.colorA[0]; scene.colorB[1] = scene.colorA[1]; scene.colorB[2] = scene.colorA[2];
        scene.curColor[0] = scene.colorA[0]; scene.curColor[1] = scene.colorA[1]; scene.curColor[2] = scene.colorA[2];
        scene.state = STATE_STABLE;
        scene.stateTime = 0;
        scene.stateDuration = randRange(STABLE_MIN, STABLE_MAX);
        const a = shapePts[scene.curShape];
        for (let i = 0; i < NUM_POINTS * 3; i++) scene.curPos[i] = a[i];
    }

    // ---------- Render ----------
    function render() {
        ctx.fillStyle = THEMES[THEME].bg;
        ctx.fillRect(0, 0, winW, winH);

        // Dark theme: neon color (as in morph3d.c), the farther the point, the darker
        const isDark = THEME === 'Dark';
        const cr = scene.curColor[0], cg = scene.curColor[1], cb = scene.curColor[2];

        const fovRad = FOV_DEG * Math.PI / 180;
        const focal = (winH * 0.5) / Math.tan(fovRad * 0.5);

        const c = Math.cos(scene.rotAngle), sf = Math.sin(scene.rotAngle);
        const ax = scene.rotAxis[0], ay = scene.rotAxis[1], az = scene.rotAxis[2];

        for (let p = 0; p < NUM_POINTS; p++) {
            const x = scene.curPos[p * 3];
            const y = scene.curPos[p * 3 + 1];
            const z = scene.curPos[p * 3 + 2];
            // Rotation (Rodrigues' formula)
            const dot = ax * x + ay * y + az * z;
            const cx = ay * z - az * y;
            const cy = az * x - ax * z;
            const cz = ax * y - ay * x;
            const rx = x * c + cx * sf + ax * dot * (1 - c);
            const ry = y * c + cy * sf + ay * dot * (1 - c);
            const rz = z * c + cz * sf + az * dot * (1 - c);
            // Depth: shape at the center, Z offset (presence effect) in world coordinates
            const ez = rz + scene.center[2];
            if (ez >= -0.1) { scene.scrSize[p] = 0; continue; }
            const d = -ez;
            // Projection (shape at the center), then X/Y offset in screen pixels
            const sx = winW * 0.5 + (rx / d) * focal + scene.center[0];
            const sy = winH * 0.5 - (ry / d) * focal + scene.center[1];
            let sz = POINT_SIZE * (CAM_DIST / d);
            if (sz < 0.5) sz = 0.5;
            scene.scrX[p] = sx;
            scene.scrY[p] = sy;
            scene.scrSize[p] = sz;
            let t = (d - D_MIN) / (D_MAX - D_MIN);
            if (t < 0) t = 0;
            if (t > 1) t = 1;
            if (isDark) {
                // The farther the point (larger d), the darker
                const k = DARK_BRIGHTNESS + (DARK_FAR_BRIGHTNESS - DARK_BRIGHTNESS) * t;
                ctx.fillStyle = 'rgb(' + Math.round(cr * k * 255) + ',' +
                    Math.round(cg * k * 255) + ',' + Math.round(cb * k * 255) + ')';
            } else {
                // Color by depth: the closer the point (smaller d), the darker
                const g = Math.round((GRAY_NEAR + (GRAY_FAR - GRAY_NEAR) * t) * 255);
                ctx.fillStyle = 'rgb(' + g + ',' + g + ',' + g + ')';
            }
            ctx.beginPath();
            ctx.arc(sx, sy, sz * 0.5, 0, 6.283185307179586);
            ctx.fill();
        }
    }

    // ---------- Theme switching ----------
    function setTheme(name) {
        if (!THEMES[name]) return;
        THEME = name;
        document.body.style.background = THEMES[name].bg;
    }
    window.morph3dSetTheme = setTheme;
    window.morph3dGetTheme = function () { return THEME; };

    // ---------- Main loop ----------
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        winW = window.innerWidth;
        winH = window.innerHeight;
        canvas.width = Math.round(winW * dpr);
        canvas.height = Math.round(winH * dpr);
        canvas.style.width = winW + 'px';
        canvas.style.height = winH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        computeBounds();
    }

    let lastTime = performance.now();
    function frame(now) {
        let dt = (now - lastTime) / 1000;
        lastTime = now;
        if (dt > 0.1) dt = 0.1;
        if (dt < 0) dt = 0;
        updateMotion(dt);
        updateState(dt);
        render();
        requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);

    resize();
    initMotion();
    initRotation();
    initMorph();
    requestAnimationFrame(frame);
})();

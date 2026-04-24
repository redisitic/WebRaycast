import React, { useEffect, useRef, useState } from "react";

const BASE_WIDTH = 640;
const BASE_HEIGHT = 400;
const FOV = 0.66;

// Infinite Procedural Maze with Memory Caching
// A flat 2048x2048 array allows caching coordinates from -1024 to 1024
const CACHE_OFFSET = 1024;
const MAX_CACHE = 2048;
const wallCache = new Int8Array(MAX_CACHE * MAX_CACHE).fill(-1);

const tileLights = new Array(MAX_CACHE * MAX_CACHE).fill(null);
const activeTileIndices = [];

const getWall = (x, y) => {
  x = Math.floor(x);
  y = Math.floor(y);

  if (x < -1000 || x > 1000 || y < -1000 || y > 1000) return 1;

  const cacheIdx = (y + CACHE_OFFSET) * MAX_CACHE + (x + CACHE_OFFSET);
  if (wallCache[cacheIdx] !== -1) return wallCache[cacheIdx];

  const modX = x & 1;
  const modY = y & 1;

  if (Math.abs(x - 13) <= 1 && Math.abs(y - 13) <= 1) {
    const val = modX === 0 && modY === 0 ? 1 : 0;
    wallCache[cacheIdx] = val;
    return val;
  }

  if (modX === 0 && modY === 0) {
    wallCache[cacheIdx] = 1;
    return 1;
  }
  if (modX === 1 && modY === 1) {
    wallCache[cacheIdx] = 0;
    return 0;
  }
  const dot = x * 12.9898 + y * 78.233;
  const sin = Math.sin(dot) * 43758.5453;
  const val = sin - Math.floor(sin) > 0.55 ? 1 : 0;

  wallCache[cacheIdx] = val;
  return val;
};

const Raycaster = () => {
  const canvasRef = useRef(null);
  const fpsRef = useRef(null);
  const textureDataRef = useRef(null);
  const torchFramesRef = useRef([]);
  const torchFrameIndexRef = useRef(0);
  const wallTextureRef = useRef(null);

  const [settings, setSettings] = useState({
    fogDistance: 8,
    ambientLight: 0.5,
    lightMultiplier: 0.1,
    renderDistance: 10,
    moveSpeed: 0.06,
    rotSpeed: 0.05,
    resolutionScale: 1.0,
    colorBits: 8,
    maxFps: 60,
  });

  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const player = useRef({
    x: 13.5,
    y: 13.5,
    dirX: -1,
    dirY: 0,
    planeX: 0,
    planeY: FOV,
    moveSpeed: 0.1,
    rotSpeed: 0.05,
  });

  const lights = useRef([]);
  const keys = useRef({});
  const workersRef = useRef([]);

  useEffect(() => {
    // Initialize Web Workers
    const numWorkers = navigator.hardwareConcurrency || 4;
    for (let i = 0; i < numWorkers; i++) {
      workersRef.current.push(
        new Worker(new URL("./renderWorker.js", import.meta.url), {
          type: "module",
        }),
      );
    }

    const loadTorchFrame = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const offscreen = document.createElement("canvas");
          offscreen.width = img.width;
          offscreen.height = img.height;
          const ctx = offscreen.getContext("2d");
          ctx.drawImage(img, 0, 0);
          resolve({
            width: img.width,
            height: img.height,
            data: ctx.getImageData(0, 0, img.width, img.height).data,
          });
        };
      });

    Promise.all([
      loadTorchFrame("./assets/torch-0.png"),
      loadTorchFrame("./assets/torch-1.png"),
    ]).then((frames) => {
      torchFramesRef.current = frames;
      textureDataRef.current = frames[0];
    });

    const torchAnimInterval = setInterval(() => {
      if (torchFramesRef.current.length === 2) {
        torchFrameIndexRef.current = (torchFrameIndexRef.current + 1) % 2;
        textureDataRef.current = torchFramesRef.current[torchFrameIndexRef.current];
      }
    }, 250);

    const wallImg = new Image();
    wallImg.src = "./assets/Wall.png";
    wallImg.onload = () => {
      const offscreen = document.createElement("canvas");
      offscreen.width = wallImg.width;
      offscreen.height = wallImg.height;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(wallImg, 0, 0);
      wallTextureRef.current = {
        width: wallImg.width,
        height: wallImg.height,
        data: ctx.getImageData(0, 0, wallImg.width, wallImg.height).data,
      };
    };

    const handleKeyDown = (e) => (keys.current[e.code] = true);
    const handleKeyUp = (e) => (keys.current[e.code] = false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    const update = (dt) => {
      const p = player.current;
      const oldX = p.x;
      const oldY = p.y;

      // Normalize movement to 60fps (16.66ms per frame) so sliders feel consistent
      // Cap dt to 100ms to prevent tunneling through walls during lag spikes
      const dtMultiplier = Math.min(dt, 100) / 16.6666;

      const currentMoveSpeed = settingsRef.current.moveSpeed * dtMultiplier;
      const currentRotSpeed = settingsRef.current.rotSpeed * dtMultiplier;

      if (keys.current["KeyW"]) {
        p.x += p.dirX * currentMoveSpeed;
        if (getWall(p.x, Math.floor(p.y))) p.x = oldX;
        p.y += p.dirY * currentMoveSpeed;
        if (getWall(Math.floor(p.x), p.y)) p.y = oldY;
      }
      if (keys.current["KeyS"]) {
        p.x -= p.dirX * currentMoveSpeed;
        if (getWall(p.x, Math.floor(p.y))) p.x = oldX;
        p.y -= p.dirY * currentMoveSpeed;
        if (getWall(Math.floor(p.x), p.y)) p.y = oldY;
      }

      if (keys.current["KeyA"]) {
        const oldDirX = p.dirX;
        p.dirX =
          p.dirX * Math.cos(currentRotSpeed) -
          p.dirY * Math.sin(currentRotSpeed);
        p.dirY =
          oldDirX * Math.sin(currentRotSpeed) +
          p.dirY * Math.cos(currentRotSpeed);
        const oldPlaneX = p.planeX;
        p.planeX =
          p.planeX * Math.cos(currentRotSpeed) -
          p.planeY * Math.sin(currentRotSpeed);
        p.planeY =
          oldPlaneX * Math.sin(currentRotSpeed) +
          p.planeY * Math.cos(currentRotSpeed);
      }
      if (keys.current["KeyD"]) {
        const oldDirX = p.dirX;
        p.dirX =
          p.dirX * Math.cos(-currentRotSpeed) -
          p.dirY * Math.sin(-currentRotSpeed);
        p.dirY =
          oldDirX * Math.sin(-currentRotSpeed) +
          p.dirY * Math.cos(-currentRotSpeed);
        const oldPlaneX = p.planeX;
        p.planeX =
          p.planeX * Math.cos(-currentRotSpeed) -
          p.planeY * Math.sin(-currentRotSpeed);
        p.planeY =
          oldPlaneX * Math.sin(-currentRotSpeed) +
          p.planeY * Math.cos(-currentRotSpeed);
      }

      const currentLights = [];
      const radius = Math.ceil(settingsRef.current.renderDistance);
      const px = Math.floor(p.x);
      const py = Math.floor(p.y);

      for (let y = py - radius; y <= py + radius; y++) {
        for (let x = px - radius; x <= px + radius; x++) {
          // Only spawn in cell centers
          if ((x & 1) === 1 && (y & 1) === 1) {
            const dot = x * 13.333 + y * 77.777;
            const sin = Math.sin(dot) * 43758.5453;
            if (sin - Math.floor(sin) < 0.1) {
              const light = {
                x: x + 0.5,
                y: y + 0.5,
                r: 255,
                g: 120,
                b: 20,
                intensity: 8,
              };
              currentLights.push(light);
            }
          }
        }
      }
      lights.current = currentLights;

      // Clear previous frame's active tiles
      for (let i = 0; i < activeTileIndices.length; i++) {
        tileLights[activeTileIndices[i]] = null;
      }
      activeTileIndices.length = 0;

      // Assign lights to tiles (Shadows are pre-computed using a single ray per tile)
      for (let i = 0; i < currentLights.length; i++) {
        const light = currentLights[i];
        const lightRadius = 10;
        const startY = Math.floor(light.y) - lightRadius;
        const endY = Math.floor(light.y) + lightRadius;
        const startX = Math.floor(light.x) - lightRadius;
        const endX = Math.floor(light.x) + lightRadius;

        for (let gy = startY; gy <= endY; gy++) {
          for (let gx = startX; gx <= endX; gx++) {
            const dx = gx + 0.5 - light.x;
            const dy = gy + 0.5 - light.y;
            if (dx * dx + dy * dy <= 100) {
              const bias = 0.01;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;

              // Raycast from the center of the tile to the light
              // We do this to cull ENTIRE TILES that are hidden by walls
              if (
                castShadowRay(
                  gx + 0.5 + (dx / d) * bias,
                  gy + 0.5 + (dy / d) * bias,
                  light.x,
                  light.y,
                )
              ) {
                const idx =
                  (gy + CACHE_OFFSET) * MAX_CACHE + (gx + CACHE_OFFSET);
                if (idx >= 0 && idx < tileLights.length) {
                  if (tileLights[idx] === null) {
                    tileLights[idx] = [];
                    activeTileIndices.push(idx);
                  }
                  tileLights[idx].push(light);
                }
              }
            }
          }
        }
      }
    };

    const castShadowRay = (startX, startY, lightX, lightY) => {
      let dx = lightX - startX;
      let dy = lightY - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      dx /= dist;
      dy /= dist;

      let mapX = Math.floor(startX);
      let mapY = Math.floor(startY);
      const deltaDistX = Math.abs(1 / dx);
      const deltaDistY = Math.abs(1 / dy);

      let stepX, stepY, sideDistX, sideDistY;
      if (dx < 0) {
        stepX = -1;
        sideDistX = (startX - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - startX) * deltaDistX;
      }
      if (dy < 0) {
        stepY = -1;
        sideDistY = (startY - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - startY) * deltaDistY;
      }

      let distTraveled = 0;
      while (distTraveled < dist) {
        if (sideDistX < sideDistY) {
          distTraveled = sideDistX;
          sideDistX += deltaDistX;
          mapX += stepX;
        } else {
          distTraveled = sideDistY;
          sideDistY += deltaDistY;
          mapY += stepY;
        }
        if (distTraveled < dist - 0.1) {
          if (getWall(mapX, mapY)) return false;
        }
      }
      return true;
    };

    let isRendering = false;

    const render = () => {
      if (isRendering || workersRef.current.length === 0) return;
      isRendering = true;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const p = player.current;

      const WIDTH = Math.floor(
        BASE_WIDTH * settingsRef.current.resolutionScale,
      );
      const HEIGHT = Math.floor(
        BASE_HEIGHT * settingsRef.current.resolutionScale,
      );

      if (canvas.width !== WIDTH) canvas.width = WIDTH;
      if (canvas.height !== HEIGHT) canvas.height = HEIGHT;

      const colorMask = 256 - (1 << (8 - settingsRef.current.colorBits));

      const numWorkers = workersRef.current.length;
      const chunkWidth = Math.ceil(WIDTH / numWorkers);
      let completed = 0;
      const pendingChunks = [];

      for (let i = 0; i < numWorkers; i++) {
        const startX = i * chunkWidth;
        let curChunkWidth = chunkWidth;
        if (startX + curChunkWidth > WIDTH) curChunkWidth = WIDTH - startX;

        if (curChunkWidth <= 0) {
          completed++;
          continue;
        }

        workersRef.current[i].onmessage = (e) => {
          const { buffer, startX: sx, chunkWidth: cw } = e.data;
          pendingChunks.push({ buffer, sx, cw });

          completed++;
          if (completed === numWorkers) {
            // Flush all strips to the canvas in one atomic batch so the
            // browser never composites a mix of old and new frame strips,
            // which would cause the "vertical jello" on floor/ceiling.
            for (const chunk of pendingChunks) {
              ctx.putImageData(
                new ImageData(new Uint8ClampedArray(chunk.buffer), chunk.cw, HEIGHT),
                chunk.sx,
                0,
              );
            }
            isRendering = false;
          }
        };

        workersRef.current[i].postMessage({
          chunkWidth: curChunkWidth,
          startX,
          WIDTH,
          HEIGHT,
          player: p,
          lights: lights.current,
          settings: settingsRef.current,
          colorMask,
          textureData: textureDataRef.current,
          wallTexture: wallTextureRef.current,
        });
      }
    };

    let timeoutId;
    let then = performance.now();
    let framesThisSecond = 0;
    let lastFpsUpdate = performance.now();

    const loop = () => {
      try {
        const now = performance.now();
        const fpsInterval = 1000 / settingsRef.current.maxFps;
        const elapsed = now - then;

        if (elapsed >= fpsInterval) {
          then = now - (elapsed % fpsInterval);

          update(elapsed);
          render();

          framesThisSecond++;
          if (now - lastFpsUpdate >= 1000) {
            if (fpsRef.current) {
              fpsRef.current.innerText = `FPS: ${framesThisSecond}`;
            }
            framesThisSecond = 0;
            lastFpsUpdate = now;
          }
        }

        const timeToNext = Math.max(
          0,
          fpsInterval - (performance.now() - then),
        );
        timeoutId = setTimeout(loop, timeToNext);
      } catch (e) {
        console.error("Renderer Error:", e);
      }
    };

    loop();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      clearTimeout(timeoutId);
      clearInterval(torchAnimInterval);
    };
  }, []);

  return (
    <div
      style={{
        background: "#000",
        height: "100vh",
        width: "100vw",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      {/* Sidebar containing Title, FPS, and Controls */}
      <div
        style={{
          width: "300px",
          minWidth: "300px",
          background: "#111",
          borderRight: "1px solid #333",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "15px",
          color: "#fff",
          fontFamily: "sans-serif",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {/* Header section */}
        <div style={{ fontFamily: "monospace", color: "#fff" }}>
          <h1
            style={{
              fontSize: "22px",
              margin: "0 0 10px 0",
              borderBottom: "1px solid #333",
              paddingBottom: "5px",
            }}
          >
            RAYCAST WITH SHADOWS
          </h1>
          <p style={{ margin: "0 0 5px 0" }}>W/S: Move | A/D: Rotate</p>
          <p
            ref={fpsRef}
            style={{ margin: "0", color: "#fff", fontWeight: "bold" }}
          >
            FPS: 0
          </p>
        </div>

        {/* Controls section */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <h3
            style={{
              margin: "0",
              fontSize: "18px",
              color: "#fff",
              borderBottom: "1px solid #333",
              paddingBottom: "10px",
            }}
          >
            Engine Controls
          </h3>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
            }}
          >
            <span>
              Fog Distance: <b>{settings.fogDistance}</b>
            </span>
            <input
              type="range"
              min="3"
              max="50"
              step="1"
              value={settings.fogDistance}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  fogDistance: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
            }}
          >
            <span>
              Render Distance: <b>{settings.renderDistance}</b>
            </span>
            <input
              type="range"
              min="5"
              max="50"
              step="1"
              value={settings.renderDistance}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  renderDistance: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
            }}
          >
            <span>
              Ambient Light: <b>{settings.ambientLight.toFixed(2)}</b>
            </span>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.01"
              value={settings.ambientLight}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  ambientLight: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
            }}
          >
            <span>
              Point Light Intensity:{" "}
              <b>{settings.lightMultiplier.toFixed(1)}x</b>
            </span>
            <input
              type="range"
              min="0"
              max="5"
              step="0.1"
              value={settings.lightMultiplier}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  lightMultiplier: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
              marginTop: "10px",
              paddingTop: "10px",
              borderTop: "1px solid #333",
            }}
          >
            <span>
              Walk Speed: <b>{settings.moveSpeed.toFixed(3)}</b>
            </span>
            <input
              type="range"
              min="0.01"
              max="0.3"
              step="0.01"
              value={settings.moveSpeed}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  moveSpeed: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
            }}
          >
            <span>
              Turn Speed: <b>{settings.rotSpeed.toFixed(3)}</b>
            </span>
            <input
              type="range"
              min="0.01"
              max="0.15"
              step="0.01"
              value={settings.rotSpeed}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  rotSpeed: parseFloat(e.target.value),
                })
              }
            />
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
              marginTop: "10px",
              paddingTop: "10px",
              borderTop: "1px solid #333",
            }}
          >
            <span>
              Resolution Scale:{" "}
              <b>{Math.round(settings.resolutionScale * 100)}%</b>
            </span>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={settings.resolutionScale}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  resolutionScale: parseFloat(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
            }}
          >
            <span>
              Color Bits (Quantization): <b>{settings.colorBits}-bit</b>
            </span>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={settings.colorBits}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  colorBits: parseInt(e.target.value),
                })
              }
            />
          </label>

          <label
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: "14px",
              gap: "5px",
              marginTop: "10px",
              paddingTop: "10px",
              borderTop: "1px solid #333",
            }}
          >
            <span>
              Max FPS Limit: <b>{settings.maxFps}</b>
            </span>
            <input
              type="range"
              min="1"
              max="240"
              step="1"
              value={settings.maxFps}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  maxFps: parseInt(e.target.value),
                })
              }
            />
          </label>
        </div>
      </div>

      {/* Game Canvas */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: "pixelated",
            width: "100%",
            maxWidth: "1200px",
            maxHeight: "100vh",
            objectFit: "contain",
          }}
        />
      </div>
    </div>
  );
};

export default Raycaster;

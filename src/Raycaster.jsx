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

  useEffect(() => {
    const img = new Image();
    img.src = "/assets/torch.png";
    img.onload = () => {
      const offscreen = document.createElement("canvas");
      offscreen.width = img.width;
      offscreen.height = img.height;
      const ctx = offscreen.getContext("2d");
      ctx.drawImage(img, 0, 0);
      textureDataRef.current = {
        width: img.width,
        height: img.height,
        data: ctx.getImageData(0, 0, img.width, img.height).data,
      };
    };

    const wallImg = new Image();
    wallImg.src = "/assets/Wall.png";
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

      for (let i = 0; i < activeTileIndices.length; i++) {
        tileLights[activeTileIndices[i]] = null;
      }
      activeTileIndices.length = 0;

      // Pre-compute shadows per tile (O(Tiles * Lights) instead of O(Pixels * Lights))
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

    const render = () => {
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

      const buffer = ctx.createImageData(WIDTH, HEIGHT);
      const buffer32 = new Uint32Array(buffer.data.buffer);
      const zBuffer = new Float32Array(WIDTH);

      for (let y = 0; y < HEIGHT; y++) {
        const rayDirX0 = p.dirX - p.planeX;
        const rayDirY0 = p.dirY - p.planeY;
        const rayDirX1 = p.dirX + p.planeX;
        const rayDirY1 = p.dirY + p.planeY;

        const isFloor = y > HEIGHT / 2;
        const horizonPos = isFloor ? y - HEIGHT / 2 : HEIGHT / 2 - y;

        if (horizonPos === 0) continue;

        const camZ = 0.5 * HEIGHT;
        const rowDistance = camZ / horizonPos;

        const floorStepX = (rowDistance * (rayDirX1 - rayDirX0)) / WIDTH;
        const floorStepY = (rowDistance * (rayDirY1 - rayDirY0)) / WIDTH;

        let floorX = p.x + rowDistance * rayDirX0;
        let floorY = p.y + rowDistance * rayDirY0;

        for (let x = 0; x < WIDTH; x++) {
          const cellX = Math.floor(floorX);
          const cellY = Math.floor(floorY);

          let r = 0,
            g = 0,
            b = 0;
          let baseR = 50,
            baseG = 50,
            baseB = 50;

          if (isFloor) {
            const tileScale = 3;
            const isDark =
              (Math.floor(floorX * tileScale) +
                Math.floor(floorY * tileScale)) %
                2 ===
              0;
            const val = isDark ? 20 : 200;
            baseR = val;
            baseG = val;
            baseB = val;
          } else {
            baseR = 50;
            baseG = 50;
            baseB = 50;
          }

          const idxCell =
            (cellY + CACHE_OFFSET) * MAX_CACHE + (cellX + CACHE_OFFSET);
          if (idxCell >= 0 && idxCell < tileLights.length) {
            const cellLights = tileLights[idxCell];
            if (cellLights !== null) {
              for (let i = 0; i < cellLights.length; i++) {
                const light = cellLights[i];
                const dx = light.x - floorX;
                const dy = light.y - floorY;
                const distSq = dx * dx + dy * dy;
                const falloff =
                  (light.intensity * settingsRef.current.lightMultiplier) /
                  (distSq + 1);
                r += light.r * falloff;
                g += light.g * falloff;
                b += light.b * falloff;
              }
            }
          }

          r += baseR * settingsRef.current.ambientLight;
          g += baseG * settingsRef.current.ambientLight;
          b += baseB * settingsRef.current.ambientLight;

          const depthFog = Math.max(
            0,
            1 - rowDistance / settingsRef.current.fogDistance,
          );

          const finalR =
            (Math.min(255, Math.max(0, r * depthFog)) & colorMask) | 0;
          const finalG =
            (Math.min(255, Math.max(0, g * depthFog)) & colorMask) | 0;
          const finalB =
            (Math.min(255, Math.max(0, b * depthFog)) & colorMask) | 0;

          buffer32[y * WIDTH + x] =
            (255 << 24) | (finalB << 16) | (finalG << 8) | finalR;

          floorX += floorStepX;
          floorY += floorStepY;
        }
      }

      for (let x = 0; x < WIDTH; x++) {
        const cameraX = (2 * x) / WIDTH - 1;
        const rayDirX = p.dirX + p.planeX * cameraX;
        const rayDirY = p.dirY + p.planeY * cameraX;

        let mapX = Math.floor(p.x);
        let mapY = Math.floor(p.y);
        const deltaDistX = Math.abs(1 / rayDirX);
        const deltaDistY = Math.abs(1 / rayDirY);

        let stepX, stepY, sideDistX, sideDistY;
        if (rayDirX < 0) {
          stepX = -1;
          sideDistX = (p.x - mapX) * deltaDistX;
        } else {
          stepX = 1;
          sideDistX = (mapX + 1.0 - p.x) * deltaDistX;
        }
        if (rayDirY < 0) {
          stepY = -1;
          sideDistY = (p.y - mapY) * deltaDistY;
        } else {
          stepY = 1;
          sideDistY = (mapY + 1.0 - p.y) * deltaDistY;
        }

        let hit = 0,
          side;
        let distanceTraveled = 0;
        while (
          hit === 0 &&
          distanceTraveled < settingsRef.current.renderDistance
        ) {
          if (sideDistX < sideDistY) {
            sideDistX += deltaDistX;
            mapX += stepX;
            side = 0;
            distanceTraveled = sideDistX - deltaDistX;
          } else {
            sideDistY += deltaDistY;
            mapY += stepY;
            side = 1;
            distanceTraveled = sideDistY - deltaDistY;
          }
          if (getWall(mapX, mapY)) hit = 1;
        }

        if (hit === 0) continue;

        const perpWallDist =
          side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
        zBuffer[x] = perpWallDist;

        const lineHeight = Math.floor(HEIGHT / perpWallDist);
        const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + HEIGHT / 2));
        const drawEnd = Math.min(
          HEIGHT - 1,
          Math.floor(lineHeight / 2 + HEIGHT / 2) + 1,
        );

        const hitX = p.x + perpWallDist * rayDirX;
        const hitY = p.y + perpWallDist * rayDirY;

        const normX = side === 0 ? -stepX : 0;
        const normY = side === 1 ? -stepY : 0;

        let texX = 0;
        let wallX = 0;
        let wallTex = null;

        if (wallTextureRef.current) {
          wallTex = wallTextureRef.current;
          if (side === 0) wallX = p.y + perpWallDist * rayDirY;
          else wallX = p.x + perpWallDist * rayDirX;
          wallX -= Math.floor(wallX);

          texX = Math.floor(wallX * wallTex.width);
          if (side === 0 && rayDirX > 0) texX = wallTex.width - texX - 1;
          if (side === 1 && rayDirY < 0) texX = wallTex.width - texX - 1;
        }

        let l_r = 0,
          l_g = 0,
          l_b = 0;
        for (const light of lights.current) {
          const lx = light.x - hitX;
          const ly = light.y - hitY;
          const lDist = Math.sqrt(lx * lx + ly * ly);

          if (lDist === 0) continue;

          const lDirX = lx / lDist;
          const lDirY = ly / lDist;

          const nDotL = Math.max(0, lDirX * normX + lDirY * normY);

          if (nDotL > 0) {
            if (
              castShadowRay(
                hitX + normX * 0.001,
                hitY + normY * 0.001,
                light.x,
                light.y,
              )
            ) {
              const falloff =
                (light.intensity * settingsRef.current.lightMultiplier) /
                (lDist * lDist + 1);
              l_r += light.r * falloff * nDotL;
              l_g += light.g * falloff * nDotL;
              l_b += light.b * falloff * nDotL;
            }
          }
        }

        l_r += 255 * settingsRef.current.ambientLight;
        l_g += 255 * settingsRef.current.ambientLight;
        l_b += 255 * settingsRef.current.ambientLight;

        const depthFog = Math.max(
          0,
          1 - perpWallDist / settingsRef.current.fogDistance,
        );

        const step = (wallTex ? wallTex.height : 1.0) / lineHeight;
        let texPos = (drawStart - HEIGHT / 2 + lineHeight / 2) * step;

        for (let y = drawStart; y <= drawEnd; y++) {
          if (y >= HEIGHT) continue;

          let baseR = 150,
            baseG = 150,
            baseB = 150;
          if (wallTex) {
            const texY = Math.floor(texPos) & (wallTex.height - 1);
            texPos += step;

            const texIdx = (texY * wallTex.width + texX) * 4;
            baseR = wallTex.data[texIdx];
            baseG = wallTex.data[texIdx + 1];
            baseB = wallTex.data[texIdx + 2];
          }

          const finalR =
            (Math.min(255, Math.max(0, ((baseR * l_r) / 255) * depthFog)) &
              colorMask) |
            0;
          const finalG =
            (Math.min(255, Math.max(0, ((baseG * l_g) / 255) * depthFog)) &
              colorMask) |
            0;
          const finalB =
            (Math.min(255, Math.max(0, ((baseB * l_b) / 255) * depthFog)) &
              colorMask) |
            0;

          buffer32[y * WIDTH + x] =
            (255 << 24) | (finalB << 16) | (finalG << 8) | finalR;
        }
      }

      if (textureDataRef.current) {
        const tex = textureDataRef.current;

        const spriteOrder = [];
        const spriteDistance = [];

        for (let i = 0; i < lights.current.length; i++) {
          spriteOrder[i] = i;
          spriteDistance[i] =
            (p.x - lights.current[i].x) ** 2 + (p.y - lights.current[i].y) ** 2;
        }

        spriteOrder.sort((a, b) => spriteDistance[b] - spriteDistance[a]);

        for (let i = 0; i < lights.current.length; i++) {
          const light = lights.current[spriteOrder[i]];

          if (
            Math.sqrt(spriteDistance[spriteOrder[i]]) >
            settingsRef.current.renderDistance
          )
            continue;

          const spriteX = light.x - p.x;
          const spriteY = light.y - p.y;

          // Transform sprite with the inverse camera matrix
          // [ planeX   dirX ] -1                                       [ dirY      -dirX ]
          // [               ]       =  1/(planeX*dirY-dirX*planeY) *   [                 ]
          // [ planeY   dirY ]                                          [ -planeY  planeX ]

          const invDet = 1.0 / (p.planeX * p.dirY - p.dirX * p.planeY);

          const transformX = invDet * (p.dirY * spriteX - p.dirX * spriteY);
          const transformY =
            invDet * (-p.planeY * spriteX + p.planeX * spriteY);

          if (transformY <= 0) continue;
          const spriteScreenX = Math.floor(
            (WIDTH / 2) * (1 + transformX / transformY),
          );

          // Sprite sizing (respecting texture aspect ratio)
          const aspectRatio = tex.height / tex.width;

          const wallHeight = Math.abs(Math.floor(HEIGHT / transformY));

          const scale = 0.6;
          const spriteHeight = Math.floor(wallHeight * scale);
          const spriteWidth = Math.floor(spriteHeight / aspectRatio);

          const floorY = Math.floor(HEIGHT / 2 + wallHeight / 2);

          let drawStartY = floorY - spriteHeight;
          if (drawStartY < 0) drawStartY = 0;
          let drawEndY = floorY;
          if (drawEndY >= HEIGHT) drawEndY = HEIGHT - 1;

          let drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
          if (drawStartX < 0) drawStartX = 0;
          let drawEndX = Math.floor(spriteWidth / 2 + spriteScreenX);
          if (drawEndX >= WIDTH) drawEndX = WIDTH - 1;

          for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
            const texX = Math.floor(
              ((stripe - (-spriteWidth / 2 + spriteScreenX)) * tex.width) /
                spriteWidth,
            );

            if (
              transformY > 0 &&
              stripe > 0 &&
              stripe < WIDTH &&
              transformY < zBuffer[stripe]
            ) {
              for (let y = drawStartY; y < drawEndY; y++) {
                const dy = y - (floorY - spriteHeight);
                const texY = Math.floor((dy * tex.height) / spriteHeight);

                if (
                  texY < 0 ||
                  texY >= tex.height ||
                  texX < 0 ||
                  texX >= tex.width
                )
                  continue;

                const texIdx =
                  (Math.floor(texY) * tex.width + Math.floor(texX)) * 4;

                const a = tex.data[texIdx + 3];
                if (a > 0) {
                  const baseR = tex.data[texIdx];
                  const baseG = tex.data[texIdx + 1];
                  const baseB = tex.data[texIdx + 2];

                  const fogScale = Math.max(
                    0,
                    1 - transformY / settingsRef.current.fogDistance,
                  );

                  const lightMult = settingsRef.current.lightMultiplier;
                  const r =
                    (Math.min(
                      255,
                      Math.max(0, baseR * fogScale + light.r * 0.8 * lightMult),
                    ) &
                      colorMask) |
                    0;
                  const g =
                    (Math.min(
                      255,
                      Math.max(0, baseG * fogScale + light.g * 0.8 * lightMult),
                    ) &
                      colorMask) |
                    0;
                  const b =
                    (Math.min(
                      255,
                      Math.max(0, baseB * fogScale + light.b * 0.8 * lightMult),
                    ) &
                      colorMask) |
                    0;

                  buffer32[y * WIDTH + stripe] =
                    (255 << 24) | (b << 16) | (g << 8) | r;
                }
              }
            }
          }
        }
      }

      ctx.putImageData(buffer, 0, 0);
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

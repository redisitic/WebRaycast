const CACHE_OFFSET = 1024;
const MAX_CACHE = 2048;
const wallCache = new Int8Array(MAX_CACHE * MAX_CACHE).fill(-1);

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

self.onmessage = function (e) {
  const {
    chunkWidth,
    startX,
    WIDTH,
    HEIGHT,
    player: p,
    lights,
    settings,
    colorMask,
    textureData,
    wallTexture,
  } = e.data;

  // We allocate an ArrayBuffer and a Uint32 view. We return the underlying buffer so we can make an ImageData.
  const buffer = new ArrayBuffer(chunkWidth * HEIGHT * 4);
  const buffer32 = new Uint32Array(buffer);
  // Initialize Z-Buffer to Infinity to prevent culled walls from blocking sprites
  const zBuffer = new Float32Array(chunkWidth).fill(Infinity);

  // 1. FLOOR & CEILING RENDERING
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

    let floorX = p.x + rowDistance * rayDirX0 + floorStepX * startX;
    let floorY = p.y + rowDistance * rayDirY0 + floorStepY * startX;

    for (let x = 0; x < chunkWidth; x++) {
      const cellX = Math.floor(floorX);
      const cellY = Math.floor(floorY);

      let baseR = 50, baseG = 50, baseB = 50;

      if (isFloor) {
        const tileScale = 3;
        const isDark = (Math.floor(floorX * tileScale) + Math.floor(floorY * tileScale)) % 2 === 0;
        const val = isDark ? 20 : 200;
        baseR = val;
        baseG = val;
        baseB = val;
      } else {
        baseR = 50;
        baseG = 50;
        baseB = 50;
      }

      let l_r = 0, l_g = 0, l_b = 0;

      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        const dx = light.x - floorX;
        const dy = light.y - floorY;
        const distSq = dx * dx + dy * dy;

        // Using precise per-pixel shadow ray, checking only close lights
        if (distSq < 100) {
          // OPTIMIZATION: Only cast shadow rays if we are within 2.5 grid cells of a wall edge.
          let isNearWall = false;
          for (let wy = cellY - 2; wy <= cellY + 2 && !isNearWall; wy++) {
            for (let wx = cellX - 2; wx <= cellX + 2 && !isNearWall; wx++) {
               if (getWall(wx, wy) === 1) isNearWall = true;
            }
          }

          let isLit = true;
          if (isNearWall) {
            const bias = 0.01;
            const d = Math.sqrt(distSq) || 1;
            isLit = castShadowRay(floorX + (dx / d) * bias, floorY + (dy / d) * bias, light.x, light.y);
          }

          if (isLit) {
            const falloff = (light.intensity * settings.lightMultiplier) / (distSq + 1);
            l_r += light.r * falloff;
            l_g += light.g * falloff;
            l_b += light.b * falloff;
          }
        }
      }

      l_r += 255 * settings.ambientLight;
      l_g += 255 * settings.ambientLight;
      l_b += 255 * settings.ambientLight;

      const depthFog = Math.max(0, 1 - rowDistance / settings.fogDistance);

      const finalR = (Math.min(255, Math.max(0, ((baseR * l_r) / 255) * depthFog)) & colorMask) | 0;
      const finalG = (Math.min(255, Math.max(0, ((baseG * l_g) / 255) * depthFog)) & colorMask) | 0;
      const finalB = (Math.min(255, Math.max(0, ((baseB * l_b) / 255) * depthFog)) & colorMask) | 0;

      buffer32[y * chunkWidth + x] = (255 << 24) | (finalB << 16) | (finalG << 8) | finalR;

      floorX += floorStepX;
      floorY += floorStepY;
    }
  }

  // 2. WALL RENDERING
  for (let x = 0; x < chunkWidth; x++) {
    const realX = startX + x;
    const cameraX = (2 * realX) / WIDTH - 1;
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

    let hit = 0, side;
    let distanceTraveled = 0;
    while (hit === 0 && distanceTraveled < settings.renderDistance) {
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

    const perpWallDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
    zBuffer[x] = perpWallDist;

    const lineHeight = Math.floor(HEIGHT / perpWallDist);
    const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + HEIGHT / 2));
    const drawEnd = Math.min(HEIGHT - 1, Math.floor(lineHeight / 2 + HEIGHT / 2));

    const hitX = p.x + perpWallDist * rayDirX;
    const hitY = p.y + perpWallDist * rayDirY;

    const normX = side === 0 ? -stepX : 0;
    const normY = side === 1 ? -stepY : 0;

    let texX = 0;
    let wallX = 0;
    
    if (wallTexture) {
      if (side === 0) wallX = p.y + perpWallDist * rayDirY;
      else wallX = p.x + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);

      texX = Math.floor(wallX * wallTexture.width);
      if (side === 0 && rayDirX > 0) texX = wallTexture.width - texX - 1;
      if (side === 1 && rayDirY < 0) texX = wallTexture.width - texX - 1;
    }

    let l_r = 0, l_g = 0, l_b = 0;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i];
      const lx = light.x - hitX;
      const ly = light.y - hitY;
      const lDist = Math.sqrt(lx * lx + ly * ly);

      if (lDist === 0) continue;

      const lDirX = lx / lDist;
      const lDirY = ly / lDist;
      const nDotL = Math.max(0, lDirX * normX + lDirY * normY);

      if (nDotL > 0) {
        if (castShadowRay(hitX + normX * 0.001, hitY + normY * 0.001, light.x, light.y)) {
          const falloff = (light.intensity * settings.lightMultiplier) / (lDist * lDist + 1);
          l_r += light.r * falloff * nDotL;
          l_g += light.g * falloff * nDotL;
          l_b += light.b * falloff * nDotL;
        }
      }
    }

    l_r += 255 * settings.ambientLight;
    l_g += 255 * settings.ambientLight;
    l_b += 255 * settings.ambientLight;

    const depthFog = Math.max(0, 1 - perpWallDist / settings.fogDistance);
    const step = (wallTexture ? wallTexture.height : 1.0) / lineHeight;
    let texPos = (drawStart - HEIGHT / 2 + lineHeight / 2) * step;

    for (let y = drawStart; y <= drawEnd; y++) {
      if (y >= HEIGHT) continue;

      let baseR = 150, baseG = 150, baseB = 150;

      if (wallTexture) {
        const texY = Math.min(Math.floor(texPos), wallTexture.height - 1);
        texPos += step;
        const texIdx = (texY * wallTexture.width + texX) * 4;
        baseR = wallTexture.data[texIdx];
        baseG = wallTexture.data[texIdx + 1];
        baseB = wallTexture.data[texIdx + 2];
      }

      const finalR = (Math.min(255, Math.max(0, ((baseR * l_r) / 255) * depthFog)) & colorMask) | 0;
      const finalG = (Math.min(255, Math.max(0, ((baseG * l_g) / 255) * depthFog)) & colorMask) | 0;
      const finalB = (Math.min(255, Math.max(0, ((baseB * l_b) / 255) * depthFog)) & colorMask) | 0;

      buffer32[y * chunkWidth + x] = (255 << 24) | (finalB << 16) | (finalG << 8) | finalR;
    }
  }

  // 3. SPRITE RENDERING
  if (textureData) {
    const spriteOrder = [];
    const spriteDistance = [];

    for (let i = 0; i < lights.length; i++) {
      spriteOrder[i] = i;
      spriteDistance[i] = (p.x - lights[i].x) ** 2 + (p.y - lights[i].y) ** 2;
    }
    spriteOrder.sort((a, b) => spriteDistance[b] - spriteDistance[a]);

    for (let i = 0; i < lights.length; i++) {
      const light = lights[spriteOrder[i]];

      if (Math.sqrt(spriteDistance[spriteOrder[i]]) > settings.renderDistance) continue;

      const spriteX = light.x - p.x;
      const spriteY = light.y - p.y;
      const invDet = 1.0 / (p.planeX * p.dirY - p.dirX * p.planeY);
      const transformX = invDet * (p.dirY * spriteX - p.dirX * spriteY);
      const transformY = invDet * (-p.planeY * spriteX + p.planeX * spriteY);

      if (transformY <= 0) continue;

      const spriteScreenX = Math.floor((WIDTH / 2) * (1 + transformX / transformY));
      const aspectRatio = textureData.height / textureData.width;
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
        if (stripe >= startX && stripe < startX + chunkWidth) {
          const localStripe = stripe - startX;
          const texX = Math.floor(((stripe - (-spriteWidth / 2 + spriteScreenX)) * textureData.width) / spriteWidth);

          if (transformY > 0 && localStripe >= 0 && localStripe < chunkWidth && transformY < zBuffer[localStripe]) {
            for (let y = drawStartY; y < drawEndY; y++) {
              const dy = y - (floorY - spriteHeight);
              const texY = Math.floor((dy * textureData.height) / spriteHeight);

              if (texY < 0 || texY >= textureData.height || texX < 0 || texX >= textureData.width) continue;

              const texIdx = (Math.floor(texY) * textureData.width + Math.floor(texX)) * 4;
              const a = textureData.data[texIdx + 3];
              
              if (a > 0) {
                const baseR = textureData.data[texIdx];
                const baseG = textureData.data[texIdx + 1];
                const baseB = textureData.data[texIdx + 2];
                const fogScale = Math.max(0, 1 - transformY / settings.fogDistance);
                const lightMult = settings.lightMultiplier;

                const r = (Math.min(255, Math.max(0, baseR * fogScale + light.r * 0.8 * lightMult)) & colorMask) | 0;
                const g = (Math.min(255, Math.max(0, baseG * fogScale + light.g * 0.8 * lightMult)) & colorMask) | 0;
                const b = (Math.min(255, Math.max(0, baseB * fogScale + light.b * 0.8 * lightMult)) & colorMask) | 0;

                buffer32[y * chunkWidth + localStripe] = (255 << 24) | (b << 16) | (g << 8) | r;
              }
            }
          }
        }
      }
    }
  }

  self.postMessage({ buffer, startX, chunkWidth }, [buffer]);
};
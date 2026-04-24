const fs = require('fs');

const WIDTH = 640;
const HEIGHT = 400;
const MAP_SIZE = 24;
const FOV = 0.66;
const AMBIENT = 0.08;

const generateMap = () => {
  const map = Array(MAP_SIZE).fill(0).map(() => Array(MAP_SIZE).fill(1));
  let x = Math.floor(MAP_SIZE / 2);
  let y = Math.floor(MAP_SIZE / 2);
  
  for (let i = 0; i < 400; i++) {
    map[y][x] = 0;
    const dir = Math.floor(Math.random() * 4);
    if (dir === 0 && x > 1) x--;
    else if (dir === 1 && x < MAP_SIZE - 2) x++;
    else if (dir === 2 && y > 1) y--;
    else if (dir === 3 && y < MAP_SIZE - 2) y++;
  }
  return map;
};

const worldMap = generateMap();
const p = {
  x: 12, y: 12,
  dirX: -1, dirY: 0,
  planeX: 0, planeY: FOV,
  moveSpeed: 0.1,
  rotSpeed: 0.05
};

const lights = [
  { x: 12.5, y: 12.5, r: 255, g: 150, b: 50, intensity: 8 },
  { x: 5.5, y: 5.5, r: 50, g: 100, b: 255, intensity: 7 },
  { x: 18.5, y: 18.5, r: 100, g: 255, b: 100, intensity: 6 }
];

const castShadowRay = (startX, startY, lightX, lightY) => {
  let dx = lightX - startX;
  let dy = lightY - startY;
  const dist = Math.sqrt(dx*dx + dy*dy);
  dx /= dist; dy /= dist;

  let mapX = Math.floor(startX);
  let mapY = Math.floor(startY);
  const deltaDistX = Math.abs(1 / dx);
  const deltaDistY = Math.abs(1 / dy);

  let stepX, stepY, sideDistX, sideDistY;
  if (dx < 0) { stepX = -1; sideDistX = (startX - mapX) * deltaDistX; }
  else { stepX = 1; sideDistX = (mapX + 1.0 - startX) * deltaDistX; }
  if (dy < 0) { stepY = -1; sideDistY = (startY - mapY) * deltaDistY; }
  else { stepY = 1; sideDistY = (mapY + 1.0 - startY) * deltaDistY; }

  let distTraveled = 0;
  const map = worldMap;
  while (distTraveled < dist) {
    if (sideDistX < sideDistY) { distTraveled = sideDistX; sideDistX += deltaDistX; mapX += stepX; }
    else { distTraveled = sideDistY; sideDistY += deltaDistY; mapY += stepY; }
    if (distTraveled < dist - 0.1) {
      if (map[mapY] && map[mapY][mapX]) return false;
    }
  }
  return true;
};

try {
  console.log("Starting render test...");
  
  // 1. FLOOR & CEILING RENDERING
  for (let y = 0; y < HEIGHT; y++) {
    const rayDirX0 = p.dirX - p.planeX;
    const rayDirY0 = p.dirY - p.planeY;
    const rayDirX1 = p.dirX + p.planeX;
    const rayDirY1 = p.dirY + p.planeY;

    const isFloor = y >= HEIGHT / 2;
    const horizonPos = isFloor ? (y - HEIGHT / 2) : (HEIGHT / 2 - y);
    
    const camZ = 0.5 * HEIGHT;
    const rowDistance = (horizonPos === 0) ? 100 : (camZ / horizonPos);

    const floorStepX = rowDistance * (rayDirX1 - rayDirX0) / WIDTH;
    const floorStepY = rowDistance * (rayDirY1 - rayDirY0) / WIDTH;

    let floorX = p.x + rowDistance * rayDirX0;
    let floorY = p.y + rowDistance * rayDirY0;

    for (let x = 0; x < WIDTH; x++) {
      const cellX = Math.floor(floorX);
      const cellY = Math.floor(floorY);

      const isDark = (cellX + cellY) % 2 === 0;
      const baseColor = isFloor ? (isDark ? 100 : 130) : (isDark ? 40 : 60);

      let r = 0, g = 0, b = 0;
      for (const light of lights) {
        const dx = light.x - floorX;
        const dy = light.y - floorY;
        const distSq = dx * dx + dy * dy;
        
        if (distSq < 100) {
          const d = Math.sqrt(distSq);
          const falloff = light.intensity / (d * d + 1);
          r += light.r * falloff;
          g += light.g * falloff;
          b += light.b * falloff;
        }
      }

      r += baseColor * AMBIENT;
      g += baseColor * AMBIENT;
      b += baseColor * AMBIENT;

      floorX += floorStepX;
      floorY += floorStepY;
    }
  }
  
  console.log("Floor done.");

  // 2. WALL RENDERING
  for (let x = 0; x < WIDTH; x++) {
    const cameraX = 2 * x / WIDTH - 1;
    const rayDirX = p.dirX + p.planeX * cameraX;
    const rayDirY = p.dirY + p.planeY * cameraX;

    let mapX = Math.floor(p.x);
    let mapY = Math.floor(p.y);
    const deltaDistX = Math.abs(1 / rayDirX);
    const deltaDistY = Math.abs(1 / rayDirY);

    let stepX, stepY, sideDistX, sideDistY;
    if (rayDirX < 0) { stepX = -1; sideDistX = (p.x - mapX) * deltaDistX; }
    else { stepX = 1; sideDistX = (mapX + 1.0 - p.x) * deltaDistX; }
    if (rayDirY < 0) { stepY = -1; sideDistY = (p.y - mapY) * deltaDistY; }
    else { stepY = 1; sideDistY = (mapY + 1.0 - p.y) * deltaDistY; }

    let hit = 0, side;
    while (hit === 0) {
      if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
      else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
      if (worldMap[mapY][mapX]) hit = 1;
    }

    const perpWallDist = (side === 0) ? (sideDistX - deltaDistX) : (sideDistY - deltaDistY);
    const lineHeight = Math.floor(HEIGHT / perpWallDist);
    let drawStart = Math.max(0, Math.floor(-lineHeight / 2 + HEIGHT / 2));
    let drawEnd = Math.min(HEIGHT - 1, Math.ceil(lineHeight / 2 + HEIGHT / 2));

    const hitX = p.x + perpWallDist * rayDirX;
    const hitY = p.y + perpWallDist * rayDirY;

    const normX = (side === 0) ? -stepX : 0;
    const normY = (side === 1) ? -stepY : 0;

    let r = 0, g = 0, b = 0;
    for (const light of lights) {
      const lx = light.x - hitX;
      const ly = light.y - hitY;
      const lDist = Math.sqrt(lx*lx + ly*ly);
      
      if (lDist === 0) continue;
      
      const lDirX = lx / lDist;
      const lDirY = ly / lDist;

      const nDotL = Math.max(0, lDirX * normX + lDirY * normY);

      if (nDotL > 0) {
        if (castShadowRay(hitX + normX * 0.001, hitY + normY * 0.001, light.x, light.y)) {
          const falloff = light.intensity / (lDist * lDist + 1);
          r += light.r * falloff * nDotL;
          g += light.g * falloff * nDotL;
          b += light.b * falloff * nDotL;
        }
      }
    }
  }
  
  console.log("Walls done. Success!");
} catch (e) {
  console.error(e);
}

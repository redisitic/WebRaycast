import fs from 'fs';

let content = fs.readFileSync('src/Raycaster.jsx', 'utf-8');

const commentsToRemove = [
  "// Bounds check for the cache",
  "// Safe spawn zone",
  "// Pillars",
  "// Centers",
  "// Random walls between pillars",
  "// Load torch sprite",
  "// Load wall texture",
  "// Procedural Torch Generation & Tile-Based Shadow Culling",
  "// 10% chance to spawn a torch",
  "// Fire colored!",
  "// Clear previous frame's active tiles",
  "// 1. FLOOR & CEILING RENDERING",
  "// rayDir for leftmost ray (x = 0) and rightmost ray (x = WIDTH)",
  "// Current y position compared to the center of the screen (the horizon)",
  "// Vertical distance from the camera to the floor/ceiling",
  "// High contrast marble checkerboard",
  "// Flat gray ceiling",
  "// Lighting affects both floor and ceiling",
  "// 2. WALL RENDERING (Overwrites floor/ceiling buffer)",
  "// Wall Normal: points away from the wall into the empty space",
  "// Texture Mapping Data",
  "// Calculate exactly where the wall was hit",
  "// X coordinate on the texture",
  "// Flip texture X if facing negative direction to prevent mirroring",
  "// Light accumulation",
  "// Lambertian reflectance (N dot L)",
  "// Offset shadow ray start to avoid self-shadowing",
  "// Add ambient light and apply global depth fog",
  "// How much to increase the texture coordinate per screen pixel",
  "// Starting texture coordinate",
  "// Default gray",
  "// Cast the texture coordinate to integer, and mask with (texHeight - 1) in case of overflow",
  "// 3. SPRITE RENDERING",
  "// Sort sprites by distance",
  "// Cull sprites beyond render distance",
  "// Translate sprite position to relative to camera",
  "// Behind camera",
  "// Calculate the height of a full 1x1 wall block at this distance",
  "// Scale the torch to be 60% the height of a wall",
  "// The floor is located at exactly half the wall height below the horizon",
  "// Anchor the sprite so its bottom touches the floorY",
  "// Linear mapping for X",
  "// Z-Buffer check",
  "// Linear mapping for Y, starting exactly from the top of the calculated sprite bounds",
  "// Safety bound",
  "// Skip transparent pixels",
  "// Torch is the light source, so it illuminates itself highly",
  "// We add distance fog based on the sprite's distance to camera",
  "// Calculate true FPS over a 1-second rolling window",
  "// Sidebar containing Title, FPS, and Controls",
  "// Header section",
  "// Controls section",
  "// Game Canvas"
];

commentsToRemove.forEach(comment => {
  content = content.split('  ' + comment + '\n').join('');
  content = content.split('          ' + comment + '\n').join('');
  content = content.split('        ' + comment + '\n').join('');
  content = content.split('      ' + comment + '\n').join('');
  content = content.split('    ' + comment + '\n').join('');
  content = content.split(comment + '\n').join('');
});

content = content.replace(/ \/\/ Pillars/g, '');
content = content.replace(/ \/\/ Centers/g, '');
content = content.replace(/ \/\/ Fire colored!/g, '');
content = content.replace(/ \/\/ Light accumulation/g, '');
content = content.replace(/ \/\/ Behind camera/g, '');
content = content.replace(/ \/\/ Default gray/g, '');
content = content.replace(/ \/\/ Skip rendering if wall is beyond render distance/g, '');

// More manual cleanup for specific lines
content = content.split('          // Get ONLY the lights that affect this specific tile, using fast 1D array lookup\n').join('');

fs.writeFileSync('src/Raycaster.jsx', content);

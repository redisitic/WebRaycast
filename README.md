# Software Web RayCast Renderer

A high-performance, retro-style software raycasting engine built entirely in JavaScript, React, and HTML5 Canvas. It implements classic pseudo-3D rendering techniques (similar to Wolfenstein 3D and early Doom) augmented with modern tile-based procedural lighting and shadow casting.

## Features

*   **Software Raycasting:** True DDA (Digital Differential Analyzer) algorithm for lightning-fast wall collision and rendering.
*   **Procedural Infinite Maze:** A deterministic, math-based generator creates an endless dungeon to explore without memory leaks.
*   **Clustered Forward Shading:** Point lights and shadows are pre-computed per-tile on the CPU, allowing for hundreds of lights without stalling the render loop.
*   **Dynamic Soft Shadows:** Walls cast accurate shadows based on Lambertian reflectance (N dot L) calculations.
*   **Volumetric Distance Fog:** Calculates true Z-depth (avoiding fish-eye distortion) to simulate atmospheric depth.
*   **Sprite Billboarding:** 2D sprites (torches) automatically orient to face the camera and properly scale and clip using a 1D Z-Buffer.
*   **Texture Mapping:** Affine texture mapping for walls and procedural marble checkerboards for the floor.
*   **Delta-Time Physics:** Movement and rotation speeds remain constant regardless of the frame rate.
*   **Real-time Engine Controls:** An interactive UI allows you to tweak the engine's internal rendering pipeline on the fly.

## Engine Controls

The built-in control panel exposes several low-level engine variables:

*   **Fog Distance:** Controls how quickly the light falls off into total darkness.
*   **Render Distance (Culling):** Sets the maximum number of grid cells the DDA algorithm will traverse before bailing out, heavily impacting performance and visibility.
*   **Ambient Light:** The baseline global illumination applied to all pixels before point lights are calculated.
*   **Point Light Intensity:** A global multiplier for the brightness of the procedural torches.
*   **Walk / Turn Speed:** Delta-time normalized player physics.
*   **Resolution Scale:** Dynamically resizes the underlying pixel buffer. Lowering this value creates a pixelated, retro PS1/DOS aesthetic while drastically improving performance.
*   **Color Bits (Quantization):** A bitwise mask applied to the output buffer to restrict the color palette. Lowering this (e.g., to 3-bit or 4-bit) creates intense, nostalgic color banding.
*   **Max FPS Limit:** A custom setTimeout loop that bypasses standard monitor refresh rate caps, allowing the engine to run anywhere from 1 to 240 FPS.

## Technical Details

This engine relies on direct memory manipulation to achieve its frame rates in JavaScript:

*   **Int8Array Caching:** Procedural maze generation uses expensive trig functions. An Int8Array acts as a flat memory map, caching the results of getWall so the DDA loop only calculates map data once per cell.
*   **Little Endian ABGR Packing:** Instead of using the slow ImageData.data array which performs clamping on four separate channels per pixel, the engine casts the buffer to a Uint32Array. Colors are bit-shifted (A << 24 | B << 16 | G << 8 | R) and written directly into memory in a single instruction.

## Installation and Usage

Ensure you have Node.js and npm installed.

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Open the provided local URL in your browser.

## Controls

*   **W**: Move Forward
*   **S**: Move Backward
*   **A**: Rotate Left
*   **D**: Rotate Right

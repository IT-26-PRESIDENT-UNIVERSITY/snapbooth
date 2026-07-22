const Jimp = require('jimp');

async function removeBlack() {
  const image = await Jimp.read('public/templates/photostrip-pixel.png');
  
  const width = image.bitmap.width;
  const height = image.bitmap.height;
  
  console.log(`Processing image: ${width}x${height}`);

  // Create visited array for flood fill
  const visited = new Uint8Array(width * height);
  const MIN_SLOT_SIZE = 10000;
  
  const isBlack = (x, y) => {
    const hex = image.getPixelColor(x, y);
    const rgba = Jimp.intToRGBA(hex);
    return rgba.r < 15 && rgba.g < 15 && rgba.b < 15;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pos = y * width + x;
      if (!visited[pos] && isBlack(x, y)) {
        const region = [];
        const stack = [pos];
        visited[pos] = 1;

        while (stack.length > 0) {
          const p = stack.pop();
          region.push(p);
          const px = p % width;
          const py = Math.floor(p / width);

          if (px > 0 && !visited[p - 1] && isBlack(px - 1, py)) { visited[p - 1] = 1; stack.push(p - 1); }
          if (px < width - 1 && !visited[p + 1] && isBlack(px + 1, py)) { visited[p + 1] = 1; stack.push(p + 1); }
          if (py > 0 && !visited[p - width] && isBlack(px, py - 1)) { visited[p - width] = 1; stack.push(p - width); }
          if (py < height - 1 && !visited[p + width] && isBlack(px, py + 1)) { visited[p + width] = 1; stack.push(p + width); }
        }

        if (region.length >= MIN_SLOT_SIZE) {
          for (const rp of region) {
            const rx = rp % width;
            const ry = Math.floor(rp / width);
            image.setPixelColor(0x00000000, rx, ry); // Transparent
          }
        }
      }
    }
  }

  await image.writeAsync('public/templates/photostrip-pixel.png');
  console.log('Done removing black background!');
}

removeBlack().catch(console.error);

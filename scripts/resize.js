const Jimp = require('jimp');

async function resizeImage() {
  console.log("Loading image...");
  const image = await Jimp.read('public/templates/photostrip-pixel-v2.png');
  console.log(`Original size: ${image.bitmap.width}x${image.bitmap.height}`);
  
  const scale = 1080 / image.bitmap.width;
  image.resize(1080, Jimp.AUTO);
  
  console.log(`New size: ${image.bitmap.width}x${image.bitmap.height}`);
  await image.writeAsync('public/templates/photostrip-pixel-v3.png');
  
  console.log("Scale factor:", scale);
  console.log("Done!");
}

resizeImage().catch(console.error);

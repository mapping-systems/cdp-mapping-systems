const fs = require("fs");
const path = require("path");
const sharp = require(
  "C:/Users/kgoya/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
);

const inputDirectory = "C:/Users/kgoya/Desktop/MAPS IMAGES";
const outputDirectory = path.resolve(__dirname, "../web/images");

const imageMap = {
  "1095 6th Ave.png": "M050060.jpg",
  "1114 sixth ave.png": "M050057.jpg",
  "1133 sixth ave.png": "M050055.jpg",
  "1155 sixth ave.png": "M050054.jpg",
  "1166 SIXTH AVENUE.png": "M050052.jpg",
  "1185 sixth ave.png": "M050048.jpg",
  "1211 SIXTH AVENUE.png": "M050047.jpg",
  "1221 SIXTH AVENUE.png": "M050043.jpg",
  "1251 SIXTH AVENUE.png": "M050042.jpg",
  "1285 SIXTH AVENUE.png": "M050037.jpg",
  "1301 SIXTH AVENUE.png": "M050030.jpg",
  "1330 SIXTH AVENUE.png": "M050026.jpg",
  "1345 SIXTH AVENUE.png": "M050021.jpg",
  "1350 sixth ave.png": "M050022.jpg",
  "1370 SIXTH AVENUE.png": "M050019.jpg",
};

async function processImages() {
  fs.mkdirSync(outputDirectory, { recursive: true });

  for (const [inputName, outputName] of Object.entries(imageMap)) {
    const inputPath = path.join(inputDirectory, inputName);
    const outputPath = path.join(outputDirectory, outputName);

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Missing image: ${inputName}`);
    }

    await sharp(inputPath)
      .flatten({ background: "#f1eee6" })
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(outputPath);

    const sizeKb = Math.round(fs.statSync(outputPath).size / 1024);
    console.log(`${inputName} -> ${outputName} (${sizeKb} KB)`);
  }
}

processImages().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

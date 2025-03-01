import { chromium } from 'playwright';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Definir __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ruta del archivo links.json
const linksFilePath = path.join(__dirname, "links.json");

// **Verificar si links.json existe antes de continuar**
if (!fs.existsSync(linksFilePath)) {
    console.error("❌ Error: links.json no encontrado. Ejecuta primero 'node VuelosHotel.mjs' para generarlo.");
    process.exit(1);
}

// Leer los enlaces desde links.json
const urls = JSON.parse(fs.readFileSync(linksFilePath, "utf-8"));

console.log(`📌 Scraping en ${urls.length} enlaces encontrados en links.json...`);

// **Función para descargar imágenes**
const downloadImage = (imageUrl, folderPath) => {
    const fileName = path.basename(new URL(imageUrl).pathname);
    const filePath = path.join(folderPath, fileName);

    if (fs.existsSync(filePath)) {
        console.log(`⚠️ Imagen ya descargada: ${fileName}`);
        return;
    }

    const file = fs.createWriteStream(filePath);
    https.get(imageUrl, (response) => response.pipe(file))
        .on('error', (err) => console.error(`❌ Error al descargar ${fileName}:`, err));
};

// **Función para scrapear cada enlace**
const scrapePage = async (url) => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(5000);

    // Capturar imágenes del CDN en tiempo real
    let cdnImages = new Set();
    page.on('response', async (response) => {
        const imageUrl = response.url();
        if (imageUrl.startsWith("https://cdn5.travelconline.com/images/")) {
            cdnImages.add(imageUrl);
        }
    });

    // Extraer título y descripción
    const data = await page.evaluate(() => {
        const title = document.querySelector(".title")?.innerText.trim() || null;
        const description = document.querySelector(".description")?.innerText.trim() || null;
        const compania = document.querySelector(".tc-tooltip")?.innerText.trim() || null;

        return { title, description, compania};
    });

    await browser.close();

    // Crear carpeta de imágenes si no existe
    const folderPath = path.join(__dirname, "images");
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // Descargar imágenes filtradas
    cdnImages.forEach(imgUrl => downloadImage(imgUrl, folderPath));

    return { url, ...data, cdnImages: Array.from(cdnImages) };
};

// **Ejecutar scraping en cada URL**
const runScraping = async () => {
    const results = [];

    for (const url of urls) {
        console.log(`🔎 Scrapeando: ${url}`);
        const scrapedData = await scrapePage(url);
        
        // **Filtrar solo datos válidos (sin null)**
        const filteredData = Object.fromEntries(
            Object.entries(scrapedData).filter(([_, value]) => value !== null && value.length !== 0)
        );

        results.push(filteredData);
    }

    // Guardar los resultados en un JSON
    const resultsFilePath = path.join(__dirname, "scraped-data.json");
    fs.writeFileSync(resultsFilePath, JSON.stringify(results, null, 2));

    console.log(`✅ Datos guardados en: ${resultsFilePath}`);
};

// Ejecutar la función
runScraping();

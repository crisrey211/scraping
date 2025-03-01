import { chromium } from 'playwright';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Definir __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// URLs a scrapear
const urls = [
    "https://www.viajes.carrefour.es/vuelo-hotel",
];

const scrapeData = async (url) => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    let imageUrls = new Set();

    // Interceptar imágenes del CDN
    page.on('response', async (response) => {
        const imageUrl = response.url();
        if (imageUrl.includes("tr2storage.blob.core.windows.net/imagenes/")) {
            imageUrls.add(imageUrl);
        }
    });

    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(5000);

    console.log(`📌 Imágenes del CDN encontradas en ${url}`, Array.from(imageUrls));

    // Extraer el nombre de la carpeta desde el pathname
    const pathname = new URL(url).pathname.replace(/\//g, ""); // Quitar barras "/"
    const folderPath = path.join(__dirname, pathname);

    // Crear carpeta si no existe
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // Descargar imágenes en la carpeta correcta
    imageUrls.forEach((imageUrl) => {
        const fileName = path.basename(new URL(imageUrl).pathname);
        const filePath = path.join(folderPath, fileName);

        const file = fs.createWriteStream(filePath);
        https.get(imageUrl, (response) => response.pipe(file))
            .on('error', (err) => console.error("❌ Error al descargar ${fileName}:", err));
    });

    // **Scraping de textos**
    const products = await page.$$eval('.owl-item', all_products => {
        return all_products.map(product => {
            const titleEl = product.querySelector('.offer-header');
            const priceEl = product.querySelector('.offer-price-amount');
            const nightsEl = product.querySelector('.counters-night');

            return {
                title: titleEl ? titleEl.innerText.trim() : "No disponible",
                price: priceEl ? priceEl.innerText.trim() : "No disponible",
                rating: nightsEl ? nightsEl.innerText.trim() : "No disponible"
            };
        });
    });

    console.log(`📌 Productos extraídos en ${url}`, products);

    // Guardar datos en JSON
    const jsonFilePath = path.join(folderPath, "data.json");
    fs.writeFileSync(jsonFilePath, JSON.stringify(products, null, 2));

    console.log(`✅ Datos guardados en: ${jsonFilePath}`);

    await browser.close();
};

// Ejecutar scraping en todas las URLs
const runScraping = async () => {
    for (const url of urls) {
        await scrapeData(url);
    }
};

runScraping();
import { chromium } from 'playwright';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Definir __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// URLs principales a scrapear
const urls = [
    "https://www.viajes.carrefour.es/vuelo-hotel",
    "https://www.viajes.carrefour.es/hoteles",
    "https://www.viajes.carrefour.es/paquetes"
];

/**
 * Función para descargar imágenes
 */
const downloadImage = (imageUrl, folderPath) => {
    const fileName = path.basename(new URL(imageUrl).pathname);
    const filePath = path.join(folderPath, fileName);

    const file = fs.createWriteStream(filePath);
    https.get(imageUrl, (response) => response.pipe(file))
        .on('error', (err) => console.error(`❌ Error al descargar ${fileName}:`, err));
};

/**
 * Función principal de scraping
 */
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

    console.log(`📌 Imágenes del CDN encontradas en ${url}:`, Array.from(imageUrls));

    // Extraer el nombre de la carpeta desde el pathname
    const pathname = new URL(url).pathname.replace(/\//g, ""); // Quitar barras "/"
    const folderPath = path.join(__dirname, pathname);

    // Crear carpeta si no existe
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    // Descargar imágenes en la carpeta correcta
    imageUrls.forEach((imageUrl) => downloadImage(imageUrl, folderPath));

    // **Scraping de textos y enlaces**
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

    console.log(`📌 Productos extraídos en ${url}:`, products);

    // **Extraer todos los enlaces (href)**
    const links = await page.$$eval('a', anchors =>
        anchors
            .map(anchor => anchor.href)
            .filter(href => href.startsWith('https://www.viajes.carrefour.es')) // Filtrar solo enlaces internos
    );

    console.log(`🔗 Enlaces encontrados en ${url}:`, links);

    // Guardar datos en JSON
    const jsonFilePath = path.join(folderPath, "data.json");
    fs.writeFileSync(jsonFilePath, JSON.stringify({ products, links }, null, 2));

    console.log(`✅ Datos guardados en: ${jsonFilePath}`);

    // **Ahora hacer scraping de cada enlace**
    for (const link of links) {
        await scrapeSubPage(link);
    }

    await browser.close();
};

/**
 * Scraping de las páginas enlazadas
 */
const scrapeSubPage = async (url) => {
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(3000);

    console.log(`📌 Scrapear subpágina: ${url}`);

    // Extraer datos de la página
    const title = await page.$eval('h1.title', el => el.textContent?.trim() || "Sin título").catch(() => "Sin título");
    const description = await page.$eval('span.description', el => el.textContent?.trim() || "Sin descripción").catch(() => "Sin descripción");

    // Extraer imágenes (que no sean del CDN)
    const images = await page.$$eval('img', imgs =>
        imgs
            .map(img => img.src)
            .filter(src => !src.includes("tr2storage.blob.core.windows.net/imagenes/")) // Excluir imágenes del CDN
    );

    console.log(`🖼 Imágenes encontradas en ${url}:`, images);

    // Guardar datos de la subpágina
    const subpageData = {
        url,
        title,
        description,
        images
    };

    // Guardar en JSON
    const pathname = new URL(url).pathname.replace(/\//g, ""); // Quitar barras "/"
    const folderPath = path.join(__dirname, pathname);

    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }

    const jsonFilePath = path.join(folderPath, "data.json");
    fs.writeFileSync(jsonFilePath, JSON.stringify(subpageData, null, 2));

    console.log(`✅ Subpágina guardada en: ${jsonFilePath}`);

    await browser.close();
};

/**
 * Ejecutar scraping en todas las URLs principales
 */
const runScraping = async () => {
    for (const url of urls) {
        await scrapeData(url);
    }
};

runScraping();

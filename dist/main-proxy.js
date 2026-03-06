"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const crawlee_1 = require("crawlee");
const tiktok_1 = require("./platforms/tiktok");
// import { instagramRouter, instagramSetup } from "./platforms/instagram";
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// interface CLI
const args = process.argv.slice(2);
const platform = args[0];
const action = args[1];
const query = args[2];
if (!platform || !action || !query) {
    console.error('❌ Usage: npm start <platform> <action> "<query>"');
    console.error('Example: npm start tiktok search "kucing lucu"');
    process.exit(1);
}
;
async function fetchFreeProxies() {
    console.log('[INFO] Fetching free proxies from ProxyScrape...');
    try {
        const url = 'https://api.proxyscrape.com/v4/free-proxy-list/get?request=displayproxies&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all&skip=0&limit=2000';
        const response = await fetch(url);
        if (!response.ok)
            throw new Error(`[ERROR!] HTTP error! status: ${response.status}`);
        const text = await response.text();
        const rawProxies = text.split(/\r?\n/).filter(line => line.trim() !== '');
        const formattedProxies = rawProxies.map(proxy => `http://${proxy.trim()}`);
        console.log(`[INFO] Successfully fetched ${formattedProxies.length} proxies.`);
        return formattedProxies;
    }
    catch (error) {
        console.warn('[ERROR!] Failed to fetch proxies. Running without proxy.');
        return [];
    }
}
// config crawler default
const crawlerConfig = {
    headless: false,
    browserPoolOptions: { useFingerprints: true },
};
(async () => {
    console.log(`Executing ${platform} scraper...`);
    console.log(`   Action: ${action}`);
    console.log(`   Query: ${query}`);
    const exportFolder = 'results';
    const folderPath = path.join(process.cwd(), exportFolder);
    if (!fs.existsSync(folderPath)) {
        console.log(`[WARNING!] Folder '${exportFolder}' does not exist. Creating folder...`);
        fs.mkdirSync(folderPath);
    }
    let router;
    let startUrls = [];
    // dispatcher logic
    switch (platform.toLowerCase()) {
        case 'tiktok':
            router = tiktok_1.tiktokRouter;
            startUrls = (0, tiktok_1.tiktokSetup)(action, query);
            break;
        case 'instagram':
            // router = instagramRouter;
            // startUrls = instagramSetup(action, query);
            break;
        default:
            console.error(`Platform "${platform}" is not available yet.`);
            process.exit(1);
    }
    const proxyList = await fetchFreeProxies();
    let proxyConfiguration;
    if (proxyList.length > 0) {
        proxyConfiguration = new crawlee_1.ProxyConfiguration({ proxyUrls: proxyList });
    }
    // run crawler
    const crawler = new crawlee_1.PlaywrightCrawler({
        ...crawlerConfig,
        proxyConfiguration,
        requestHandler: router,
        maxConcurrency: proxyList.length > 0 ? 3 : 1,
        requestHandlerTimeoutSecs: 60,
    });
    await crawler.run(startUrls);
    // export data to CSV
    console.log(['[DONE] Crawling finished. Exporting data...']);
    const { items } = await crawlee_1.Dataset.getData();
    if (items.length === 0) {
        console.log('[FAILED!] No data found to save.');
        return;
    }
    const timestamp = new Date().toLocaleString('sv-SE', {
        timeZone: 'Asia/Jakarta', // <--- INI KUNCI STANDARNYA
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(' ', '_').replace(/:/g, '-');
    const ssafeQuery = query.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${platform}-${action}-${ssafeQuery}-${timestamp}.csv`;
    const fullFilePath = path.join(folderPath, fileName);
    const headers = Object.keys(items[0]);
    const csvRows = items.map(row => {
        return headers.map(fieldName => {
            const cell = String(row[fieldName] || '').replace(/"/g, '""');
            return `"${cell}"`;
        }).join(',');
    });
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    try {
        fs.writeFileSync(fullFilePath, csvContent, 'utf-8');
        console.log(`[SUCCESS] File saved as: ${fileName}`);
    }
    catch (e) {
        console.error(`[ERROR] Failed to save file: ${e}`);
    }
})();

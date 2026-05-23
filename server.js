import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load .env.local
try {
    dotenv.config({ path: '.env.local' });
    const envPath = path.resolve('.env.local');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const parts = trimmed.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim();
                    if (!process.env[key]) process.env[key] = value;
                }
            }
        });
    }
} catch (e) {
    console.error("Error reading .env.local:", e);
}

// Import Vercel-style handlers and wrap them for Express
import weatherTrafficHandler from './api/weather-traffic.js';
import optimizeHandler from './api/optimize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from the project root
app.use(express.static(__dirname));

// Mount API routes — handlers use same (req, res) signature as Express
app.get('/api/weather-traffic', weatherTrafficHandler);
app.post('/api/optimize', optimizeHandler);

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

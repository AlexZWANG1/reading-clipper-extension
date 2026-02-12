
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listCards, reloadCards } from './src/services/cards.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CARDS_FILE = path.join(__dirname, 'data/cards.json');

console.log("=== Deep Debugging Cards ===");

// 1. Raw JSON check
const rawContent = fs.readFileSync(CARDS_FILE, 'utf-8');
const rawData = JSON.parse(rawContent);
console.log(`Raw JSON count: ${rawData.length}`);
const rawMatch = rawData.find(c => c.source_id === 'src_the_information');
console.log("Raw JSON match:", rawMatch ? `Found (${rawMatch.id})` : "Not Found");
if (rawMatch) {
    console.log("Raw source_id:", rawMatch.source_id);
    console.log("Raw deleted:", rawMatch.deleted);
}

// 2. Service check
reloadCards(); // Force reload
const serviceCards = listCards({ includeDeleted: true });
console.log(`Service listCards (all) count: ${serviceCards.length}`);

const serviceMatch = serviceCards.find(c => c.id === (rawMatch?.id));
console.log("Service match by ID:", serviceMatch ? "Found" : "Not Found");

if (serviceMatch) {
    console.log("Service source_id:", serviceMatch.source_id);
    console.log("Service source_name:", serviceMatch.source_name);
} else {
    // Check if any card has source_id
    const anySourceId = serviceCards.find(c => c.source_id);
    console.log("Any card with source_id in service?", anySourceId ? "Yes" : "No");
}

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cardsPath = path.join(__dirname, '../data/cards.json');

const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

let updatedCount = 0;

cards.forEach(card => {
    if (card.source_url && card.source_url.includes('theinformation.com')) {
        card.source_id = 'src_the_information';
        updatedCount++;
        console.log(`Matched card ${card.id} to src_the_information`);
    }
});

if (updatedCount > 0) {
    fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2), 'utf8');
    console.log(`Updated ${updatedCount} cards.`);
} else {
    console.log("No cards found to match.");
}

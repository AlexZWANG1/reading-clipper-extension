
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cardsPath = path.join(__dirname, '../data/cards.json');

const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

let restoredCount = 0;

cards.forEach(card => {
    if (card.source_id === 'src_the_information' && card.deleted) {
        card.deleted = false;
        restoredCount++;
        console.log(`Restoring card ${card.id}`);
    }
});

if (restoredCount > 0) {
    fs.writeFileSync(cardsPath, JSON.stringify(cards, null, 2), 'utf8');
    console.log(`Restored ${restoredCount} cards.`);
} else {
    console.log("No cards needing restoration found.");
}

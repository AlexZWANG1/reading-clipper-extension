
import { listCards } from './src/services/cards.mjs';
import { findSourceById, reloadSources, getAllSources } from './src/services/sources.mjs';

console.log("=== Debugging Source Lookup ===");

// 1. Check loaded sources
console.log("Sources in memory:", getAllSources().length);
const theInfoSource = findSourceById('src_the_information');
console.log("Lookup 'src_the_information':", theInfoSource ? 'Found' : 'Not Found');

// 2. Check cards
const cards = listCards();
console.log("Cards in memory:", cards.length);

const targetCard = cards.find(c => c.source_id === 'src_the_information');
if (targetCard) {
    console.log("Target Card:", targetCard.id);
    console.log("Target Card Source ID:", targetCard.source_id);

    // 3. Simulate mapping
    const lookupResult = findSourceById(targetCard.source_id);
    console.log("Mapping Result:", lookupResult ? "Success" : "Failed");
} else {
    console.log("No card with src_the_information found in listCards()");
}

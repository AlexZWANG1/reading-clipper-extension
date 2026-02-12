
import { listCards } from './src/services/cards.mjs';

// No filters = only active cards by default
const cards = listCards();
console.log(`Active Cards: ${cards.length}`);

cards.forEach(c => {
    console.log(`[${c.id}] SourceURL: ${c.source_url || 'N/A'} | SourceName: ${c.source_name || 'N/A'}`);
});

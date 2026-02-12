
import { matchSourceForCard } from './src/services/sourceMatcher.mjs';

// Mock listSources via the module (it loads from file)

console.log("=== Testing AI Source Matching (Fallback) ===");

async function test() {
    // Case 1: Rule Match (Should be fast and correct)
    console.log("\n--- Test 1: Exact Rule Match ---");
    const id1 = await matchSourceForCard({
        sourceUrl: "https://openai.com/news/gpt-4",
        sourceName: "OpenAI",
        summary: "GPT-4 release news."
    });
    console.log(`Result 1 (Expect src_openai_news or similar): ${id1}`);

    // Case 2: AI Match (Unknown URL, but clear Source Name)
    console.log("\n--- Test 2: AI Fallback (Valid Source) ---");
    // Use a URL that definitely won't match, but content that strongly suggests OpenAI
    const id2 = await matchSourceForCard({
        sourceUrl: "https://unknown-aggregator.com/article/123",
        sourceName: "OpenAI Blog",
        summary: "Recent updates on GPT-5 safety research and model capabilities from the OpenAI team."
    });
    console.log(`Result 2 (Expect src_openai_news or similar): ${id2}`);

    // Case 3: AI Match (No Source Name, inferred from content - harder)
    console.log("\n--- Test 3: AI Fallback (Inferred) ---");
    const id3 = await matchSourceForCard({
        sourceUrl: "https://random-site.org",
        sourceName: "Tech News Daily",
        summary: "Anthropic released Claude 3.5 Sonnet, significantly outperforming GPT-4o in coding benchmarks."
    });
    console.log(`Result 3 (Expect src_anthropic): ${id3}`);
}

test().catch(console.error);

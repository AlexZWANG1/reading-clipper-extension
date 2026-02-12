import { createAIClientConfig, callChatAPI } from "./aiClient.mjs";

/**
 * Agent: Root Question Analysis & Tree Generation
 * 
 * Role: Strategic Consultant
 * Task: Decompose a root question into MECE sub-questions and hypotheses.
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID for config loading
 * @param {string} params.rootQuestion - The core issue to analyze
 * @param {Object} [params.supabase] - Supabase client for accessing user settings
 * @returns {Promise<Object>} The generated tree structure
 */
export async function runRootAnalysis({ userId, rootQuestion, supabase }) {
    const config = await createAIClientConfig(userId, supabase);

    const systemPrompt = `You are a top-tier Strategic Consultant (McKinsey/BCG style). 
Your task is to structure a problem space using the MECE (Mutually Exclusive, Collectively Exhaustive) principle.

Input: A Root Question (Core Issue).

Output Requirement:
1. Break down the Root Question into 3-5 distinct, MECE Sub-Questions (Dimensions).
2. For EACH Sub-Question, generate 2-3 plausible Hypotheses that answer the sub-question.
3. Return STRICT JSON format.

JSON Structure:
{
  "sub_questions": [
    {
      "text": "Sub-Question 1",
      "hypotheses": [
        { "text": "Hypothesis 1.1" },
        { "text": "Hypothesis 1.2" }
      ]
    }
  ]
}
`;

    const userMessage = `Root Question: "${rootQuestion}"\n\nPlease generate the issue tree.`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
    ];

    try {
        const response = await callChatAPI(config, messages, {
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);

    } catch (error) {
        console.error("Root Analysis Agent Failed:", error);
        throw new Error(`AI Analysis Failed: ${error.message}`);
    }
}

/**
 * Agent: Evidence Verification
 * 
 * Task: Determine if a piece of evidence supports or refutes a hypothesis.
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.hypothesis
 * @param {string} params.evidence
 * @param {Object} [params.supabase]
 * @returns {Promise<Object>} Verification result
 */
export async function runEvidenceVerification({ userId, hypothesis, evidence, supabase }) {
    const config = await createAIClientConfig(userId, supabase);

    const systemPrompt = `You are an impartial logic analyzer.
Task: Evaluate the relationship between the provided Evidence and Hypothesis.

Determine if the Evidence:
- SUPPORTS the Hypothesis (confirms it is likely true)
- REFUTES the Hypothesis (suggests it is likely false)
- NEUTRAL / IRRELEVANT (does not significantly affect the validty)

Output Requirement:
Return STRICT JSON format:
{
  "status": "support" | "refute" | "neutral",
  "explanation": "A single concise sentence explaining why."
}
`;

    const userMessage = `Hypothesis: "${hypothesis}"\nEvidence: "${evidence}"\n\nAnalyze the relationship.`;

    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
    ];

    try {
        const response = await callChatAPI(config, messages, {
            response_format: { type: "json_object" }
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);

    } catch (error) {
        console.error("Verification Agent Failed:", error);
        // Fallback if AI fails
        return { status: "neutral", explanation: "AI verification failed." };
    }
}

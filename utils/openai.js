const OpenAI = require('openai');
const logger = require('./logger');
const config = require('./config');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: config.openai.apiKey || ''
});

/**
 * Generate AI response for chatbot conversation
 * @param {Array} messages - Array of message objects with role and content
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response with content and token usage
 */
const generateChatResponse = async (messages, options = {}) => {
    try {
        if (!config.openai.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const model = options.model || config.openai.model;
        const temperature = options.temperature || 0.7;
        const maxTokens = options.maxTokens || 1000;

        const systemPrompt = `You are Nexa, a specialized patent novelty assessment assistant for EuProximaX, an innovation services company. Your primary role is to help users evaluate the novelty of their ideas for patent registration.

Your responsibilities:
1. Help users articulate and refine their patent ideas clearly
2. Ask probing questions to understand the technical details, unique features, and innovations
3. Guide users through the patent novelty assessment process
4. Provide constructive feedback on patentability aspects
5. Help identify potential prior art concerns
6. Encourage users to describe their invention's unique technical contributions
7. Always introduce yourself as "Nexa" when appropriate

Focus on:
- Understanding the technical problem being solved
- Identifying unique features and innovations
- Clarifying technical specifications and implementations
- Assessing potential novelty and non-obviousness
- Preparing ideas for patent novelty analysis

Keep responses professional, technical when needed, and always end with a relevant question to help gather more information about their patent idea.`;

        const chatMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        const response = await openai.chat.completions.create({
            model,
            messages: chatMessages,
            temperature,
            max_tokens: maxTokens
        });

        const assistantMessage = response.choices[0].message.content;
        const tokenUsage = {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
        };

        return {
            content: assistantMessage,
            model: model,
            tokenUsage
        };
    } catch (error) {
        logger.error('OpenAI API error:', {
            error: error.message,
            stack: error.stack
        });
        throw new Error(`AI service error: ${error.message}`);
    }
};

/**
 * Analyze idea novelty using AI
 * @param {String} idea - The idea to analyze
 * @param {String} conversationHistory - Full conversation history as context
 * @returns {Promise<Object>} Novelty analysis with score and feedback
 */
const analyzeNovelty = async (idea, conversationHistory = '') => {
    try {
        if (!config.openai.apiKey) {
            throw new Error('OpenAI API key not configured');
        }

        const prompt = `You are a patent novelty expert analyzing an invention idea for patent registration potential. 

INVENTION IDEA TO ANALYZE:
${idea}

${conversationHistory ? `CONVERSATION CONTEXT:\n${conversationHistory}\n` : ''}

Please analyze this invention idea for patent novelty and provide:
1. A novelty score from 0-100 (where 100 is highly novel with strong patent potential, 0 is likely not patentable due to existing prior art)
2. A confidence level from 0-100 (how confident you are in your assessment based on available information)
3. A detailed patent novelty analysis (2-3 paragraphs) explaining:
   - Patent novelty assessment: What makes this invention novel or potentially non-novel
   - Prior art considerations: Similar existing patents, technologies, or solutions
   - Unique technical contributions: Key differentiating features and innovations
   - Patentability factors: Novelty, non-obviousness, and utility considerations
   - Recommendations: Suggestions for strengthening patentability or areas of concern

Focus on patent-specific criteria: novelty (new), non-obviousness (inventive step), and utility (usefulness).

Respond in JSON format:
{
  "score": <number 0-100>,
  "confidence": <number 0-100>,
  "analysis": "<detailed patent novelty analysis>"
}`;

        const response = await openai.chat.completions.create({
            model: config.openai.model,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert patent novelty analyst specializing in patent registration. Always respond with valid JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            temperature: 0.3,
            max_tokens: 1500,
            response_format: { type: 'json_object' }
        });

        const content = response.choices[0].message.content;
        let analysis;
        
        try {
            analysis = JSON.parse(content);
        } catch (parseError) {
            // Fallback if JSON parsing fails
            logger.warn('Failed to parse AI novelty analysis as JSON, using fallback');
            analysis = {
                score: 50,
                confidence: 50,
                analysis: content || 'Unable to analyze novelty at this time.'
            };
        }

        // Validate and normalize scores
        analysis.score = Math.max(0, Math.min(100, Math.round(analysis.score || 50)));
        analysis.confidence = Math.max(0, Math.min(100, Math.round(analysis.confidence || 50)));

        return {
            score: analysis.score,
            confidence: analysis.confidence,
            aiAnalysis: analysis.analysis || analysis.analysis || 'Analysis completed.',
            tokenUsage: {
                promptTokens: response.usage.prompt_tokens,
                completionTokens: response.usage.completion_tokens,
                totalTokens: response.usage.total_tokens
            }
        };
    } catch (error) {
        logger.error('OpenAI novelty analysis error:', {
            error: error.message,
            stack: error.stack
        });
        throw new Error(`Novelty analysis error: ${error.message}`);
    }
};

module.exports = {
    generateChatResponse,
    analyzeNovelty
};


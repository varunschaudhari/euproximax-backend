const ChatConversation = require('../models/ChatConversation');
const logger = require('./logger');

/**
 * Search for similar patent ideas in the database (prior art check)
 * @param {String} idea - The invention idea to search for
 * @param {Number} limit - Maximum number of similar ideas to return
 * @returns {Promise<Array>} Array of similar conversations with similarity scores (potential prior art)
 */
const findSimilarIdeas = async (idea, limit = 5) => {
    try {
        if (!idea || idea.trim().length < 10) {
            return [];
        }

        // Extract keywords from the idea
        const keywords = extractKeywords(idea);
        
        if (keywords.length === 0) {
            return [];
        }

        // Search for conversations with similar main ideas or keywords
        const searchRegex = new RegExp(keywords.join('|'), 'i');
        
        const similarConversations = await ChatConversation.find({
            $or: [
                { mainIdea: searchRegex },
                { 'noveltyAnalysis.aiAnalysis': searchRegex }
            ],
            status: { $in: ['active', 'completed'] }
        })
        .select('_id mainIdea noveltyAnalysis.score createdAt')
        .limit(limit * 2) // Get more to calculate similarity
        .lean();

        // Calculate similarity scores
        const similarIdeas = similarConversations
            .map(conv => {
                const similarity = calculateSimilarity(idea, conv.mainIdea || '');
                return {
                    conversationId: conv._id,
                    similarityScore: similarity,
                    matchedText: conv.mainIdea || ''
                };
            })
            .filter(item => item.similarityScore > 20) // Only include if similarity > 20%
            .sort((a, b) => b.similarityScore - a.similarityScore)
            .slice(0, limit);

        return similarIdeas;
    } catch (error) {
        logger.error('Error finding similar ideas:', {
            error: error.message,
            stack: error.stack
        });
        return [];
    }
};

/**
 * Extract keywords from text
 * @param {String} text - Text to extract keywords from
 * @returns {Array<String>} Array of keywords
 */
const extractKeywords = (text) => {
    if (!text) return [];
    
    // Remove common stop words
    const stopWords = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how'
    ]);

    // Extract words (alphanumeric, at least 3 characters)
    const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stopWords.has(word));

    // Get unique words and return top keywords
    const uniqueWords = [...new Set(words)];
    
    // Return most relevant keywords (limit to 10)
    return uniqueWords.slice(0, 10);
};

/**
 * Calculate similarity between two texts using simple word overlap
 * @param {String} text1 - First text
 * @param {String} text2 - Second text
 * @returns {Number} Similarity score (0-100)
 */
const calculateSimilarity = (text1, text2) => {
    if (!text1 || !text2) return 0;

    const words1 = new Set(extractKeywords(text1));
    const words2 = new Set(extractKeywords(text2));

    if (words1.size === 0 || words2.size === 0) return 0;

    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    if (union.size === 0) return 0;

    const similarity = (intersection.size / union.size) * 100;
    return Math.round(similarity);
};

module.exports = {
    findSimilarIdeas,
    extractKeywords,
    calculateSimilarity
};


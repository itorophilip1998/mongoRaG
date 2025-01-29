const express = require('express');
const { MongoClient } = require('mongodb');
const { OpenAI } = require('openai');
const app = express();
require("dotenv").config();

// MongoDB Connection  
const client = new MongoClient(process.env.MONGO_URI);

async function connectToMongo() {
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db(process.env.DB_NAME);

    // Ensure all collections have a text index on all fields
    const collections = await db.listCollections().toArray();
    for (const collection of collections) {
        const col = db.collection(collection.name);
        await col.createIndex({ "$**": "text" }); // Creating text index on all fields
    }
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Middleware for JSON parsing
app.use(express.json());

// Route to search across all collections and documents
app.post('/search', async (req, res) => {
    const { query } = req.body;

    // Step 1: Validate query
    if (!query || typeof query !== 'string' || query.trim() === '') {
        return res.status(400).json({ message: 'Query must be a non-empty string' });
    }

    const db = client.db(process.env.DB_NAME);

    // Step 2: Search across all collections dynamically
    const collections = await db.listCollections().toArray();
    let results = [];

    for (let collection of collections) {
        const col = db.collection(collection.name);
        try {
            const searchResults = await col.find({
                $text: { $search: query }
            }).toArray();
            results = [...results, ...searchResults];
        } catch (err) {
            console.error(`Error searching collection ${collection.name}:`, err);
        }
    }

    if (results.length === 0) {
        return res.status(404).json({ message: 'No documents found' });
    }

    // Step 3: Use LLM for more insightful, augmented response
    const augmentedResponse = await getLLMResponse(query, results);

    // Step 4: Return the LLM generated response
    res.json({ response: augmentedResponse });
});

// Function to interact with LLM (GPT)
async function getLLMResponse(query, documents) {
    const documentsText = documents.map(doc => JSON.stringify(doc)).join('\n');
    const prompt = `Given the following documents, answer the query: ${query}\n\nDocuments:\n${documentsText}\nAnswer:`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: prompt },
            ],
        });

        return response.choices[0].message.content;
    } catch (error) {
        console.error('Error with LLM response:', error);
        return 'Sorry, I couldn\'t generate a response.';
    }
}

// Connect to MongoDB and start the server
connectToMongo().then(() => {
    app.listen(process.env.PORT, () => {
        console.log(`Server running at http://localhost:${process.env.PORT}`);
    });
});

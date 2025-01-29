const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { OpenAIEmbeddings } = require('langchain/embeddings/openai');
const { RetrievalQAChain } = require('langchain/chains');
const { ChatOpenAI } = require('langchain/chat_models/openai');

dotenv.config();

const app = express();
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

db.once('open', () => {
    console.log('Connected to MongoDB');
});

// Define a Schema & Model for storing documents
const DocumentSchema = new mongoose.Schema({
    model: String,
    content: String,
});
const Document = mongoose.model('Document', DocumentSchema);

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Setup Langchain Vector Store
const vectorStore = new MemoryVectorStore(new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY }));

// Function to add documents to vector store
async function storeDocuments() {
    const documents = await Document.find();
    await vectorStore.addDocuments(documents.map(doc => ({ pageContent: doc.content, metadata: { model: doc.model } })));
    console.log('Documents stored in vector store');
}
storeDocuments();

// Search and Generate API with Langchain RAG
app.post('/search', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Query is required' });

        // Retrieve relevant documents using vector search
        const retriever = vectorStore.asRetriever();
        const retrievedDocs = await retriever.getRelevantDocuments(query);
        const context = retrievedDocs.map(doc => `Model: ${doc.metadata.model}\nContent: ${doc.pageContent}`).join('\n');

        // Use OpenAI for response generation
        const chatModel = new ChatOpenAI({ openAIApiKey: process.env.OPENAI_API_KEY });
        const chain = RetrievalQAChain.fromLLM(chatModel, retriever);
        const response = await chain.call({ query });

        res.json({ answer: response.text, documents: retrievedDocs });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

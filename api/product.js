const express = require("express");
const router = express.Router();
/**
 * GET a specific workflow by shortId.
 *
 * @param shortId the unique identifier of the workflow.
 * @return workflow data | not found message.
 */

const { MongoClient } = require('mongodb');

// Connection URL and Database Name
const url = 'mongodb+srv://dylan:43VFMVJVJUFAII9g@cluster0.8phbhhb.mongodb.net/?retryWrites=true&w=majority';
const dbName = 'test';

router.get('/workflows', async (req, res) => {
    try {
        // Create a new MongoClient
        const client = new MongoClient(url);
        
        // Connect to the server
        await client.connect();
        console.log('Connected successfully to server');

        const db = client.db(dbName);
        const workflowRepository = db.collection('workflow');

        // Fetch only the workflows without aggregation
        const workflows = await workflowRepository.find().toArray();

        return res.json(workflows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});


module.exports = router;

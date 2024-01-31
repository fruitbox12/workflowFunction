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
router.post('/workflows', async (req, res) => {
  const client = new MongoClient(url);
  try {
      await client.connect();
      console.log('Connected successfully to server');

      const db = client.db(dbName);
      const workflowCollection = db.collection('workflow');

      // Use the request body directly as the workflow document
      const workflowData = req.body;

      // Insert the new workflow
      const insertResult = await workflowCollection.insertOne(workflowData);
      const createdWorkflowId = insertResult.insertedId;

      // Perform aggregation to include execution count and other required data
      const returnWorkflows = await workflowCollection.aggregate([
          { $match: { _id: createdWorkflowId } },
          {
              $lookup: {
                  from: 'execution',
                  localField: 'shortId',
                  foreignField: 'workflowShortId',
                  as: 'execution'
              }
          },
          {
              $addFields: {
                  executionCount: {
                      $size: '$execution'
                  }
              }
          }
      ]).toArray();

      if (returnWorkflows.length) {
          return res.json(returnWorkflows[0]);
      } else {
          return res.status(404).send(`Workflow not found`);
      }
  } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
  } finally {
      await client.close();
  }
});

router.get('/workflows/:shortId', async (req, res) => {
  try {
    const client = new MongoClient(url);
    await client.connect();
  
    const db = client.db(dbName);
    const workflowRepository = db.collection('workflow');
  
    const workflows = await workflowRepository.aggregate([
      {
          $match: {
              shortId: req.params.shortId
          }
      },
      {
          $lookup: {
              from: 'execution',
              localField: 'shortId',
              foreignField: 'workflowShortId',
              as: 'execution'
          }
      },
      {
          $addFields: {
              executionCount: {
                  $size: '$execution'
              }
          }
      }
  ])
  .toArray()
  
  
    if (workflows.length) {
        return res.json(workflows[0]);
    } else {
        return res.status(404).send(`Workflow ${req.params.shortId} not found`);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
  
});


module.exports = router;

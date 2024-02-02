const express = require("express");
const router = express.Router();
const axios = require("axios");

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
        const executionRepository = db.collection('execution'); // Assuming the executions are stored in this collection

        // Perform an aggregation to fetch workflows along with their execution count
        const workflows = await workflowRepository.aggregate([
            {
                $lookup: {
                    from: "execution", // The collection to join
                    localField: "shortId", // Field from the workflow collection
                    foreignField: "workflowShortId", // Field from the execution collection that matches localField
                    as: "executions" // The array field name where the joined data will be placed
                }
            },
            {
                $addFields: {
                    executionCount: { $size: "$executions" } // Add a new field that counts the number of executions
                }
            },
            {
                $project: {
                    _id: 1,
                    shortId: 1,
                    name: 1,
                    executionCount: 1,
                    executions: 1 // Include this if you want to return the execution details as well
                }
            }
        ]).toArray();

        return res.json(workflows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    } finally {
        // Ensure the client is closed when done
        await client.close();
    }
});

router.get('/workflows2', async (req, res) => {
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

    // First query to get workflow
    const workflow = await workflowRepository.findOne({ shortId: req.params.shortId });

    if (!workflow) {
      return res.status(404).send(`Workflow ${req.params.shortId} not found`);
    }

    // Second query to get execution data
    const executionRepository = db.collection('execution');
    const executionData = await executionRepository.find({ workflowShortId: req.params.shortId })

    // Add execution data and count to the workflow object
    workflow.execution = executionData;
    workflow.executionCount = executionData.length;

    return res.json(workflow);
  } catch (error) {
    console.error(error);
    res.status(500).send('Server error');
  }
});

 
// Function to execute an HTTP node
async function executeHttpNode(node) {
  const { method, url, headers, body } = node.data.inputParameters;
  try {
      const response = await axios({
          method,
          url,
          headers,
          data: body
      });
      console.log(response.data)
      return response.data;
  } catch (error) {
      console.error('Error executing HTTP node:', error);
      throw error;
  }
}

// Function to resolve node dependencies based on edges
function resolveNodeDependencies(nodes, edges) {
  const nodeDependencies = {};
  edges.forEach(edge => {
      if (!nodeDependencies[edge.target]) {
          nodeDependencies[edge.target] = [];
      }
      nodeDependencies[edge.target].push(edge.source);
  });
  return nodeDependencies;
}

// Main route to execute the workflow
// Define a function to generate a short ID (mimicking your 'shortId' utility function)
function generateShortId(prefix) {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

// Main route to execute the workflow
router.post('/execute/workflow', async (req, res) => {
  let execution = {
      _id: null, // This would normally be set by your database
      shortId: generateShortId('E'),
      executionData: "",
      state: "RUNNING", // Assuming you have predefined states
      workflowShortId: req.body.workflowShortId, // Assuming this is passed in the request
      createdDate: new Date(),
      stoppedDate: new Date()
  };

  try {
    const { nodes, edges } = req.body;
    const nodeDependencies = resolveNodeDependencies(nodes, edges);
    const nodeResults = {};

    for (const node of nodes) {
        if (nodeDependencies[node.id]) {
            await Promise.all(nodeDependencies[node.id].map(depId => nodeResults[depId]));
        }
        nodeResults[node.id] = await executeHttpNode(node);
    }

    await Promise.all(Object.values(nodeResults));

    // Update execution data and state
    execution.executionData = JSON.stringify(nodeResults);
    execution.state = "COMPLETED";
    execution.stoppedDate = new Date();

    res.json(execution);
} catch (error) {
    console.error(error);
    execution.state = "FAILED";
    execution.stoppedDate = new Date();
    res.status(500).send('An error occurred while executing the workflow');
}
});


module.exports = router;

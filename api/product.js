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

function extractTenantId(req, res, next) {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) {
        return res.status(400).send('Tenant ID header (X-Tenant-ID) is missing');
    }
    req.tenantId = tenantId; // Attach tenantId to the request
    next();
}

router.use(extractTenantId); 
router.get('/workflow', async (req, res) => {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);

        const workflowCollectionName = `workflow_${req.tenantId}`; // Adjust collection name based on tenant ID
        const executionCollectionName = `execution_${req.tenantId}`; // Adjust collection name based on tenant ID

        const workflows = await db.collection(workflowCollectionName).aggregate([
            {
                $lookup: {
                    from: executionCollectionName, // Use tenant-specific collection
                    localField: "shortId",
                    foreignField: "workflowShortId",
                    as: executionCollectionName
                }
            },
          {
                $addFields: {
                    executionCount: { $size: "$executionCollectionName" }
                }
            },
            {
                $project: {
                    executionCollectionName: 0 // Optionally remove the executions array if you only need the count
                }
            }
        ]).toArray();

        res.json(workflows);
    } catch (error) {
        console.error('Failed to retrieve workflows:', error);
        res.status(500).send('Server error');
    } finally {
        await client.close();
    }
});

router.get('/workflows', async (req, res) => {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        // Connect to the MongoDB client
        await client.connect();
        const db = client.db(dbName);

        // Perform the aggregation
        const workflows = await db.collection('workflow').aggregate([
            {
                $lookup: {
                    from: "execution", // The collection to join
                    localField: "shortId", // Field from the workflow collection
                    foreignField: "workflowShortId", // Field from the execution collection that references workflow
                    as: "execution" // The array to add to the workflow documents; contains the joined execution documents
                }
            },
            {
                $addFields: {
                    executionCount: { $size: "$execution" }
                }
            },
            {
                $project: {
                    execution: 0 // Optionally remove the executions array if you only need the count
                }
            }
        ]).toArray();

        res.json(workflows);
    } catch (error) {
        console.error('Failed to retrieve workflows:', error);
        res.status(500).send('Server error');
    } finally {
        // Ensure the client is closed when the operation is complete
        await client.close();
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
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);

        const { shortId } = req.params;

        // First, find the workflow by shortId
        const workflow = await db.collection('workflow').findOne({ shortId: shortId });

        if (!workflow) {
            return res.status(404).send('Workflow not found');
        }
        // Then, count the executions for this workflow
        const executionCount = await db.collection('execution').countDocuments({ workflowShortId: shortId });

        // Fetch all execution data for this workflow
        const execution = await db.collection('execution').find({ workflowShortId: shortId }).toArray(); // Ensure 'executions' matches your collection name
          const response = {
            ...workflow,
            executionCount,
            execution // Contains all execution data
        };
       

        res.json(response);
    } catch (error) {
        console.error('Failed to retrieve workflow and executions:', error);
        res.status(500).send('Server error');
    } finally {
        await client.close();
    }
});


router.get('/workflows2/:shortId', async (req, res) => {
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


        const workflows = await db.collection('workflow').aggregate([
            {
                $lookup: {
                    from: "execution", // The collection to join
                    localField: "shortId", // Field from the workflow collection
                    foreignField: "workflowShortId", // Field from the execution collection that references workflow
                    as: "execution" // The array to add to the workflow documents; contains the joined execution documents
                }
            },
            {
                $addFields: {
                    executionCount: { $size: "$execution" }
                }
            },
            {
                $project: {
                    execution: 0 // Optionally remove the executions array if you only need the count
                }
            }
        ]).toArray();

        res.json(workflows);
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

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

// Define a function to generate a short ID (mimicking your 'shortId' utility function)
function generateShortId(prefix) {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}
function formatDateComponent(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'short' }).toUpperCase();
    const year = date.getFullYear().toString().slice(-2); // Get last two digits of the year
    return `${day}${month}${year}`;
}

function generateRandomSequence(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }
    return result;
}
function generateShortIds() {
    const prefix = "W";
    const dateComponent = formatDateComponent(new Date());
    const randomSequence = generateRandomSequence(8); // Length of the sequence
    const shortId = `${prefix}${dateComponent}-${randomSequence}`;
    return shortId.toUpperCase(); // Ensure the ID is in all caps
}

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
router.get('/workflows', async (req, res) => {
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
                    as: "execution"
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
        await client.close();
    }
});

router.get('/workflow', async (req, res) => {
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

router.post('/workflows/deploy/:shortId', async (req, res) => {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        const db = client.db(dbName);
        const workflowCollection = db.collection(`workflow_${req.tenantId}`);

        // Fetch the workflow with its shortId
        const workflow = await workflowCollection.findOne({ shortId: req.params.shortId });

        if (!workflow) {
            res.status(404).send(`Workflow ${req.params.shortId} not found`);
            return;
        }

        // Determine the deployment status based on the halt property in the request body
        const isDeploying = !req.body.halt;

        // Update the workflow's deployed field in the database
        await workflowCollection.updateOne(
            { shortId: req.params.shortId },
            { $set: { deployed: isDeploying } }
        );

        // Here, you would include any additional logic for deploying or halting the workflow
        // This might involve interacting with other systems or services to start or stop the workflow execution

        // Send a response indicating the operation's success
        res.json({ message: `Workflow ${req.params.shortId} has been ${isDeploying ? 'deployed' : 'halted'}.` });
    } catch (e) {
        console.error(e);
        res.status(500).send(`Workflow ${req.params.shortId} deploy error: ${e.message}`);
    } finally {
        await client.close();
    }
});
// Assuming `url`, `dbName` are defined elsewhere in your code

router.put('/workflows/:shortId', async (req, res) => {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        console.log('Connected successfully to server');

        const db = client.db(dbName);
        const workflowCollection = db.collection(`workflow_${req.tenantId}`);

        // Extract the shortId from the request parameters
        const { shortId } = req.params;

        // Use the request body for the update
        const updateData = req.body;

        // Get the current date in ISO format for the updatedDate
        const updatedDate = new Date().toISOString();

        // Prepare the update document
        const updateDocument = {
            $set: {
                ...updateData,
                updatedDate: updatedDate // Update the updatedDate field
            }
        };

        // Update the workflow
        const updateResult = await workflowCollection.updateOne({ shortId: shortId }, updateDocument);

        if (updateResult.matchedCount === 0) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        // Optionally, fetch updated data from an external API
        try {
            const response = await axios.get(`https://workflow-function.vercel.app/api/v1/workflows/${shortId}`, {
                headers: {
                    'X-Tenant-ID': req.tenantId
                }
            });
            // If you want to send back the axios response data
            return res.status(200).json(response.data);
        } catch (axiosError) {
            console.error(axiosError);
            // Handle axios error differently or send a custom response
            return res.status(500).json({ message: 'Error fetching updated workflow data.' });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).send('Server error');
    } finally {
        await client.close();
    }
});

router.post('/webhook/:shortId', async (req, res) => {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    
    try {
        await client.connect();
        const db = client.db(dbName);
        const workflowCollection = db.collection(`workflow_dylanwong007@gmail.com`);
        
        // Fetch the workflow by its shortId
const workflow = await workflowCollection.findOne(
  { shortId: req.params.shortId },
  { projection: { _id: 0, flowData: 1 } }
);

// Check if the workflow and flowData exist
if (!workflow || !workflow.flowData) {
    return res.status(404).send('Workflow not found or workflow data is incomplete');
}

// Parse the flowData JSON string to an object
let flowDataObj;
try {
    flowDataObj = JSON.parse(workflow.flowData);
} catch (error) {
    return res.status(500).send('Failed to parse workflow data');
}

// Check if flowDataObj.nodes is an array and not empty
if (!Array.isArray(flowDataObj.nodes) || flowDataObj.nodes.length === 0) {
    return res.status(404).send('Workflow data is incomplete');
}

// Calculate the length of the flowData.nodes array
const stepEndValue = flowDataObj.nodes.length;

        // Construct the webhook URL with the dynamic stepEnd query parameter
        const webhookUrl = `https://deployworkflow.vercel.app/api/step/1?stepEnd=${stepEndValue}`;
        
        // Prepare the body data for the webhook
        // This is just an example, adjust according to your actual data structure and needs
        const bodyData = JSON.parse(workflow); // Assuming you want to send the entire flowData object
       

        // Execute the webhook using axios
    axios.post(webhookUrl, JSON.stringify(bodyData.flowData)) .then(webhookResponse => {
    // Log the response data from the webhook

    // Respond with success and the data received from the webhook
    res.json({ message: 'Webhook executed successfully', data: webhookResponse });
  })
        
        // Respond with success and the data received from the webhook
    } catch (error) {
        console.error('Failed to execute webhook:', error);
        res.status(500).send('Server error');
    } finally {
        await client.close();
    }
});


router.post('/workflows', async (req, res) => {
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
    try {
        await client.connect();
        console.log('Connected successfully to server');

        const db = client.db(dbName);
        const workflowCollection = db.collection(`workflow_${req.tenantId}`);

        // Use the request body directly as the workflow document
        const workflowData = req.body;

        // Generate shortId - Implement this function based on your ID generation logic
        const shortId = generateShortIds(); // Assuming you have this function

        // Get the current date in ISO format
        const currentDate = new Date().toISOString();

        // Add shortId, createdDate, and updatedDate to the workflow document
        Object.assign(workflowData, {
            shortId: shortId,
            createdDate: currentDate,
            updatedDate: currentDate // Initially the same as createdDate
        });

        // Insert the new workflow
        const insertResult = await workflowCollection.insertOne(workflowData);
        const createdWorkflowId = insertResult.insertedId;

        // After inserting the workflow, fetch additional data with axios
        try {
            const response = await axios.get(`https://workflow-function.vercel.app/api/v1/workflows/${workflowData.shortId}`, {
                headers: {
                    'X-Tenant-ID': req.tenantId
                }
            });
            // If you want to send back the axios response data
            return res.status(200).json(response.data);
        } catch (axiosError) {
            console.error(axiosError);
            // Handle axios error differently or send a custom response
            return res.status(500).json({ message: 'Error fetching workflow data after creation.' });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).send('Server error');
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

        const workflowCollectionName = `workflow_${req.tenantId}`; // Adjust collection name based on tenant ID
        const executionCollectionName = `execution_${req.tenantId}`; // Adjust collection name based on tenant ID

        // First, find the workflow by shortId
        const workflow = await  db.collection(workflowCollectionName).findOne({ shortId: shortId });

        if (!workflow) {
            return res.status(404).send('Workflow not found');
        }
        // Then, count the executions for this workflow
        const executionCount = await db.collection(executionCollectionName).countDocuments({ workflowShortId: shortId });

        // Fetch all execution data for this workflow
        const execution = await db.collection(executionCollectionName).find({ workflowShortId: shortId }).toArray(); // Ensure 'executions' matches your collection name
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

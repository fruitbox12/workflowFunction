#!/bin/bash

# Define project name
PROJECT_NAME="my-nextjs-app"

# Create a new Next.js project
npx create-next-app $PROJECT_NAME

# Navigate into the project directory
cd $PROJECT_NAME

# Install dependencies
npm install react-flow-renderer axios

# Create a components directory
mkdir -p components

# Create the React Flow component file
cat <<EOT > components/WorkflowCanvas.js
import React, { useState } from 'react';
import ReactFlow, { addEdge, MiniMap, Controls } from 'react-flow-renderer';
import axios from 'axios';

const initialElements = [
  // Define your initial nodes and edges here
];

const WorkflowCanvas = () => {
  const [elements, setElements] = useState(initialElements);

  const onConnect = (params) => setElements((els) => addEdge(params, els));

  const executeWorkflow = async () => {
    try {
      const response = await axios.post('http://localhost:8080/api/v1/execute/workflows', {
        nodes: elements.filter((el) => !el.source),
        edges: elements.filter((el) => el.source),
      });
      console.log(response.data);
    } catch (error) {
      console.error('Error executing workflow:', error);
    }
  };

  // Add button or other triggers to call executeWorkflow

  return (
    <ReactFlow
      elements={elements}
      onConnect={onConnect}
      onLoad={(reactFlowInstance) => reactFlowInstance.fitView()}
    >
      <MiniMap />
      <Controls />
    </ReactFlow>
  );
};

export default WorkflowCanvas;
EOT

# Create a new page file
cat <<EOT > pages/workflow.js
import React from 'react';
import WorkflowCanvas from '../components/WorkflowCanvas';

const WorkflowPage = () => {
  return (
    <div style={{ height: '100vh' }}>
      <WorkflowCanvas />
    </div>
  );
};

export default WorkflowPage;
EOT

echo "Project setup complete. Navigate into the project directory and run 'npm run dev' to start the development server."

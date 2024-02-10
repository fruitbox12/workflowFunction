const express = require("express");
const app = express();
const cors = require("cors");

const product = require("./api/product");
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allow these methods
    allowedHeaders: ['X-Tenant-ID','Content-Type', 'Authorization'] // Allow these headers
  }));
app.use(express.json({ extended: false }));

app.use("/api/v1", product);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server is running in port ${PORT}`));

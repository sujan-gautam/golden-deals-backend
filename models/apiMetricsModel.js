// models/apiMetricsModel.js
const mongoose = require('mongoose');

const apiMetricsSchema = new mongoose.Schema({
  endpoint: {
    type: String,
    required: true,
    index: true, // Add index for faster queries on endpoint
  },
  method: {
    type: String,
    required: true,
    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], // Restrict to common HTTP methods
  },
  status: {
    type: Number,
    required: true,
    index: true, // Add index for status-based queries
  },
  responseTime: {
    type: Number,
    required: true, // Response time in milliseconds
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true, // Add index for time-based queries
  },
});

// Compound index for efficient querying by endpoint and timestamp
apiMetricsSchema.index({ endpoint: 1, timestamp: -1 });

module.exports = mongoose.model('ApiMetrics', apiMetricsSchema);
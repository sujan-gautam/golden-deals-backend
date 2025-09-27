// config/connectDB.js
const mongoose = require("mongoose");

const connectDB = async () => {
  const mongoUri = process.env.CONNECTION_STRING;

  if (!mongoUri) {
    console.error("❌ CONNECTION_STRING is not set in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      autoIndex: true, // build indexes automatically
      serverSelectionTimeoutMS: 10000, // 10s timeout
    });

    console.log("✅ MongoDB connected successfully.");
  } catch (err) {
    console.error("❌ Initial MongoDB connection error:", err.message);
    // Retry after 5 seconds instead of exiting
    setTimeout(connectDB, 5000);
  }
};

// Handle runtime disconnects
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected. Retrying...");
  connectDB();
});

mongoose.connection.on("reconnected", () => {
  console.log("🔄 MongoDB reconnected.");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err.message);
});

module.exports = connectDB;

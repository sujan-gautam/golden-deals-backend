const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

const verifyToken = asyncHandler(async (req, res, next) => {
    let token;
    const authorizationHeader = req.headers.authorization || req.headers.Authorization;
  
    console.log("Authorization Header Received:", authorizationHeader);
  
    if (authorizationHeader && authorizationHeader.startsWith("Bearer ")) {
      token = authorizationHeader.split(" ")[1];
      console.log("Extracted Token:", token);
  
      jwt.verify(token, process.env.SECRECT_KEY, (err, decoded) => {
        if (err) {
          console.log("Token verification failed:", err);
          return res.status(401).json({ message: "Token Unauthorized" });
        }
        console.log("Decoded User:", decoded);
        req.user = decoded.user;
        next();
      });
    } else {
      console.log("Token Not Provided!");
      return res.status(401).json({ message: "Token Not Provided!" });
    }
  });
  

module.exports = verifyToken;

const jwt = require('jsonwebtoken');
require('dotenv').config();

// This checks if the user is logged in
const authenticate = (req, res, next) => {
    // Tokens usually come in the header as "Bearer <token>"
    const authHeader = req.header('Authorization');
    if (!authHeader) return res.status(401).json({ error: "Access denied. No token provided." });

    const token = authHeader.split(" ")[1]; // Grab just the token part

    try {
        // Verify the token using your secret key from .env
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Attach the user info to the request
        next(); // Let them pass to the route
    } catch (error) {
        res.status(400).json({ error: "Invalid token." });
    }
};

// This checks if the logged-in user is specifically an ADMIN
const authorizeAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: "Access denied. Admin permissions required." });
    }
    next(); // Let them pass
};

module.exports = { authenticate, authorizeAdmin };
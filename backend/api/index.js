// Vercel serverless entry point.
// Vercel looks for files inside /api and treats each as a serverless function.
// Our Express app already knows how to handle every route, so we just export it.
const app = require("../app");

module.exports = app;

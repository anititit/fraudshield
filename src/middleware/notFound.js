function notFound(req, res) {
  res.status(404).json({ error: { message: `Route ${req.originalUrl} not found` } });
}

module.exports = notFound;

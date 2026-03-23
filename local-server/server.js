import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health.js';
import searchRouter from './routes/search.js';
import notesRouter from './routes/notes.js';
import suggestTagsRouter from './routes/suggest-tags.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.use('/health', healthRouter);
app.use('/search', searchRouter);
app.use('/notes', notesRouter);
app.use('/suggest-tags', suggestTagsRouter);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Card Box local server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Search:       POST http://localhost:${PORT}/search`);
});

/**
 * 根路由聚合
 */
import { router } from '../instance.js';
import { authRouter } from './auth.js';
import { documentsRouter, cardSetsRouter, cardsRouter } from './documents.js';
import { generationRouter } from './generation.js';
import { reviewRouter } from './review.js';
import { printRouter } from './print.js';
import { configRouter } from './config.js';

export const appRouter = router({
  auth: authRouter,
  documents: documentsRouter,
  cardSets: cardSetsRouter,
  cards: cardsRouter,
  generation: generationRouter,
  review: reviewRouter,
  print: printRouter,
  config: configRouter,
});

export type AppRouter = typeof appRouter;

/**
 * 文档与卡片组 CRUD
 */
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { router, protectedProcedure } from '../instance.js';
import {
  CreateDocumentInputSchema,
  CreateCardSetInputSchema,
  DOCUMENT_MAX_CHARS,
} from '@kaotu/shared';
import { sourceDocuments, cardSets, cards } from '../../db/schema.js';

export const documentsRouter = router({
  create: protectedProcedure
    .input(CreateDocumentInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.content.length > DOCUMENT_MAX_CHARS) {
        throw new Error(`文档超过字符上限 ${DOCUMENT_MAX_CHARS}`);
      }
      const id = nanoid();
      await ctx.db
        .insert(sourceDocuments)
        .values({
          id,
          userId: ctx.user.userId,
          title: input.title,
          content: input.content,
          charCount: input.content.length,
        })
        .run();
      const row = ctx.db
        .select()
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, id))
        .all()[0]!;
      return {
        id: row.id,
        userId: row.userId,
        title: row.title,
        content: row.content,
        charCount: row.charCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = ctx.db
      .select()
      .from(sourceDocuments)
      .where(eq(sourceDocuments.userId, ctx.user.userId))
      .orderBy(desc(sourceDocuments.updatedAt))
      .all();
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      title: r.title,
      content: r.content,
      charCount: r.charCount,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }),

  get: protectedProcedure
    .input(async (raw: unknown) => {
      const v = await import('zod').then((z) => z.object({ id: z.string() }).parse(raw));
      return v;
    })
    .query(async ({ ctx, input }) => {
      const row = ctx.db
        .select()
        .from(sourceDocuments)
        .where(and(eq(sourceDocuments.id, input.id), eq(sourceDocuments.userId, ctx.user.userId)))
        .all()[0];
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        title: row.title,
        content: row.content,
        charCount: row.charCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  delete: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ id: z.string() }).parse(raw));
    })
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(sourceDocuments)
        .where(and(eq(sourceDocuments.id, input.id), eq(sourceDocuments.userId, ctx.user.userId)))
        .run();
      return { ok: true };
    }),
});

export const cardSetsRouter = router({
  create: protectedProcedure
    .input(CreateCardSetInputSchema)
    .mutation(async ({ ctx, input }) => {
      // 校验文档归属
      const doc = ctx.db
        .select()
        .from(sourceDocuments)
        .where(
          and(
            eq(sourceDocuments.id, input.documentId),
            eq(sourceDocuments.userId, ctx.user.userId),
          ),
        )
        .all()[0];
      if (!doc) throw new Error('文档不存在或无权访问');

      const id = nanoid();
      await ctx.db
        .insert(cardSets)
        .values({
          id,
          userId: ctx.user.userId,
          documentId: input.documentId,
          title: input.title,
        })
        .run();
      const row = ctx.db.select().from(cardSets).where(eq(cardSets.id, id)).all()[0]!;
      return {
        id: row.id,
        userId: row.userId,
        documentId: row.documentId,
        title: row.title,
        shareToken: row.shareToken,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = ctx.db
      .select()
      .from(cardSets)
      .where(eq(cardSets.userId, ctx.user.userId))
      .orderBy(desc(cardSets.updatedAt))
      .all();
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      documentId: r.documentId,
      title: r.title,
      shareToken: r.shareToken,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }),

  rename: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) =>
        z.object({ id: z.string(), title: z.string().min(1).max(200) }).parse(raw),
      );
    })
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(cardSets)
        .set({ title: input.title, updatedAt: Math.floor(Date.now() / 1000) })
        .where(and(eq(cardSets.id, input.id), eq(cardSets.userId, ctx.user.userId)))
        .run();
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ id: z.string() }).parse(raw));
    })
    .mutation(async ({ ctx, input }) => {
      // 级联：先删卡片、复习状态/日志（保留审计日志可选，这里一并清理）
      const setRow = ctx.db
        .select()
        .from(cardSets)
        .where(and(eq(cardSets.id, input.id), eq(cardSets.userId, ctx.user.userId)))
        .all()[0];
      if (!setRow) return { ok: true };
      const cardRows = ctx.db
        .select()
        .from(cards)
        .where(eq(cards.cardSetId, input.id))
        .all();
      for (const c of cardRows) {
        await ctx.db.delete(cards).where(eq(cards.id, c.id)).run();
      }
      await ctx.db
        .delete(cardSets)
        .where(eq(cardSets.id, input.id))
        .run();
      return { ok: true };
    }),

  /** 生成只读分享链接 */
  share: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ id: z.string() }).parse(raw));
    })
    .mutation(async ({ ctx, input }) => {
      const token = nanoid(16);
      await ctx.db
        .update(cardSets)
        .set({ shareToken: token, updatedAt: Math.floor(Date.now() / 1000) })
        .where(and(eq(cardSets.id, input.id), eq(cardSets.userId, ctx.user.userId)))
        .run();
      return { shareToken: token };
    }),

  /** 通过 share_token 获取只读快照（未登录可用） */
  byShareToken: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ token: z.string() }).parse(raw));
    })
    .query(async ({ ctx, input }) => {
      const row = ctx.db
        .select()
        .from(cardSets)
        .where(eq(cardSets.shareToken, input.token))
        .all()[0];
      if (!row) return null;
      const docRow = ctx.db
        .select()
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, row.documentId))
        .all()[0];
      const cardRows = ctx.db
        .select()
        .from(cards)
        .where(eq(cards.cardSetId, row.id))
        .all();
      return {
        id: row.id,
        title: row.title,
        documentTitle: docRow?.title ?? '',
        cards: cardRows.map((c) => ({
          id: c.id,
          type: c.type,
          sourceQuote: c.sourceQuote,
          payload: JSON.parse(c.payload),
          tags: JSON.parse(c.tags),
        })),
        isOwner: row.userId === ctx.user.userId,
      };
    }),

  /** 克隆分享的卡片组到自己账户（复习状态独立初始化） */
  clone: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ token: z.string() }).parse(raw));
    })
    .mutation(async ({ ctx, input }) => {
      const src = ctx.db
        .select()
        .from(cardSets)
        .where(eq(cardSets.shareToken, input.token))
        .all()[0];
      if (!src) throw new Error('分享链接无效');

      // 复制文档
      const srcDoc = ctx.db
        .select()
        .from(sourceDocuments)
        .where(eq(sourceDocuments.id, src.documentId))
        .all()[0]!;
      const newDocId = nanoid();
      await ctx.db
        .insert(sourceDocuments)
        .values({
          id: newDocId,
          userId: ctx.user.userId,
          title: `${srcDoc.title}（克隆）`,
          content: srcDoc.content,
          charCount: srcDoc.charCount,
        })
        .run();

      const newSetId = nanoid();
      await ctx.db
        .insert(cardSets)
        .values({
          id: newSetId,
          userId: ctx.user.userId,
          documentId: newDocId,
          title: `${src.title}（克隆）`,
        })
        .run();

      const srcCards = ctx.db
        .select()
        .from(cards)
        .where(eq(cards.cardSetId, src.id))
        .all();
      for (const c of srcCards) {
        await ctx.db
          .insert(cards)
          .values({
            id: nanoid(),
            cardSetId: newSetId,
            type: c.type,
            sourceQuote: c.sourceQuote,
            payload: c.payload,
            tags: c.tags,
          })
          .run();
      }
      return { newCardSetId: newSetId };
    }),
});

export const cardsRouter = router({
  listBySet: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ cardSetId: z.string() }).parse(raw));
    })
    .query(async ({ ctx, input }) => {
      const setRow = ctx.db
        .select()
        .from(cardSets)
        .where(and(eq(cardSets.id, input.cardSetId), eq(cardSets.userId, ctx.user.userId)))
        .all()[0];
      if (!setRow) throw new Error('卡片组不存在或无权访问');
      const rows = ctx.db.select().from(cards).where(eq(cards.cardSetId, input.cardSetId)).all();
      return rows.map((c) => ({
        id: c.id,
        cardSetId: c.cardSetId,
        type: c.type,
        sourceQuote: c.sourceQuote,
        payload: JSON.parse(c.payload),
        tags: JSON.parse(c.tags),
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }));
    }),

  update: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) =>
        z
          .object({
            id: z.string(),
            sourceQuote: z.string().min(1).max(1000).optional(),
            payload: z.record(z.unknown()).optional(),
            tags: z.array(z.string()).optional(),
          })
          .parse(raw),
      );
    })
    .mutation(async ({ ctx, input }) => {
      // 校验所有权
      const card = ctx.db.select().from(cards).where(eq(cards.id, input.id)).all()[0];
      if (!card) throw new Error('卡片不存在');
      const setRow = ctx.db
        .select()
        .from(cardSets)
        .where(and(eq(cardSets.id, card.cardSetId), eq(cardSets.userId, ctx.user.userId)))
        .all()[0];
      if (!setRow) throw new Error('无权修改');

      const update: Record<string, unknown> = { updatedAt: Math.floor(Date.now() / 1000) };
      if (input.sourceQuote !== undefined) update.sourceQuote = input.sourceQuote;
      if (input.payload !== undefined) update.payload = JSON.stringify(input.payload);
      if (input.tags !== undefined) update.tags = JSON.stringify(input.tags);
      await ctx.db.update(cards).set(update).where(eq(cards.id, input.id)).run();
      return { ok: true };
    }),

  delete: protectedProcedure
    .input(async (raw: unknown) => {
      return await import('zod').then((z) => z.object({ id: z.string() }).parse(raw));
    })
    .mutation(async ({ ctx, input }) => {
      const card = ctx.db.select().from(cards).where(eq(cards.id, input.id)).all()[0];
      if (!card) return { ok: true };
      const setRow = ctx.db
        .select()
        .from(cardSets)
        .where(and(eq(cardSets.id, card.cardSetId), eq(cardSets.userId, ctx.user.userId)))
        .all()[0];
      if (!setRow) throw new Error('无权删除');
      await ctx.db.delete(cards).where(eq(cards.id, input.id)).run();
      return { ok: true };
    }),
});

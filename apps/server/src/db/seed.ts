/**
 * seed - 演示用户与示例文档
 * 可重复执行（已存在则跳过）
 */
import { nanoid } from 'nanoid';
import { eq } from 'drizzle-orm';
import { getDb } from './client.js';
import { users, sourceDocuments, cardSets, cards } from './schema.js';
import { migrateSqlite } from './migrate.js';

async function seed() {
  migrateSqlite();
  const db = getDb();

  const demoEmail = 'demo@kaotu.dev';
  const existing = db.select().from(users).where(eq(users.email, demoEmail)).all();
  let userId: string;
  if (existing.length > 0) {
    userId = existing[0]!.id;
    console.log(`[seed] demo user exists: ${userId}`);
  } else {
    userId = nanoid();
    db.insert(users)
      .values({ id: userId, email: demoEmail, plan: 'free' })
      .run();
    console.log(`[seed] created demo user: ${userId} (${demoEmail})`);
  }

  const docId = nanoid();
  const sampleContent = `OSI 七层模型是国际标准化组织提出的网络通信参考模型，自下而上分为：物理层、数据链路层、网络层、传输层、会话层、表示层、应用层。物理层负责比特流的透明传输，定义了电气、机械、过程和功能规范。数据链路层在物理层基础上提供点到点的可靠传输，将比特组装成帧，并通过 MAC 地址寻址。网络层负责数据包的路由和转发，核心协议是 IP，实现逻辑寻址与路径选择。传输层提供端到端的通信，TCP 提供面向连接的可靠传输，UDP 提供无连接的快速传输。会话层管理不同应用之间的会话建立、维护和终止。表示层处理数据的表示形式，包括加密、压缩和编码转换。应用层直接为用户的应用进程提供网络服务，常见协议有 HTTP、FTP、SMTP 等。`;

  const existingDocs = db
    .select()
    .from(sourceDocuments)
    .where(eq(sourceDocuments.userId, userId))
    .all();
  if (existingDocs.length === 0) {
    db.insert(sourceDocuments)
      .values({
        id: docId,
        userId,
        title: 'OSI 七层模型（示例）',
        content: sampleContent,
        charCount: sampleContent.length,
      })
      .run();

    const setId = nanoid();
    db.insert(cardSets)
      .values({
        id: setId,
        userId,
        documentId: docId,
        title: 'OSI 模型速记（示例）',
      })
      .run();

    // 预置两张示例卡片
    const c1: typeof cards.$inferInsert = {
      id: nanoid(),
      cardSetId: setId,
      type: 'qa',
      sourceQuote: 'OSI 七层模型是国际标准化组织提出的网络通信参考模型',
      payload: JSON.stringify({
        type: 'qa',
        question: 'OSI 七层模型是什么？',
        answer: '国际标准化组织提出的网络通信参考模型，共分七层',
      }),
      tags: JSON.stringify(['网络']),
    };
    const c2: typeof cards.$inferInsert = {
      id: nanoid(),
      cardSetId: setId,
      type: 'cloze',
      sourceQuote: '传输层提供端到端的通信，TCP 提供面向连接的可靠传输',
      payload: JSON.stringify({
        type: 'cloze',
        text: '传输层提供端到端的通信，TCP 提供面向连接的___传输',
        blanks: [{ token: '可靠' }],
      }),
      tags: JSON.stringify(['网络']),
    };
    db.insert(cards).values([c1, c2]).run();
    console.log(`[seed] inserted sample document, card set, 2 cards`);
  } else {
    console.log(`[seed] sample docs already exist, skipping`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  });

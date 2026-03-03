/* eslint-disable no-console */
import dataSource from '../src/database/data-source';

async function run(): Promise<void> {
  await dataSource.initialize();

  const patterns = [
    "smoke-%@example.com",
    "integration-%@example.com",
    "demo-%@example.com",
    "mock-%@example.com",
    "test-%@example.com",
  ];

  const deletedUsers = await dataSource.query(
    `
      DELETE FROM users
      WHERE ${patterns.map((_, index) => `email ILIKE $${index + 1}`).join(' OR ')}
      RETURNING id
    `,
    patterns,
  );

  const deletedIssues = await dataSource.query(
    `
      DELETE FROM issues
      WHERE title ILIKE 'Smoke issue %'
         OR title ILIKE 'Integration issue %'
         OR title ILIKE 'Demo issue %'
         OR title ILIKE 'Mock issue %'
      RETURNING id
    `,
  );

  const deletedClaims = await dataSource.query(
    `
      DELETE FROM claims
      WHERE organization ILIKE 'Smoke Organization%'
         OR organization ILIKE 'Integration Organization%'
         OR organization ILIKE 'Demo Organization%'
      RETURNING id
    `,
  );

  console.log(`[cleanup] deleted users: ${deletedUsers.length}`);
  console.log(`[cleanup] deleted issues: ${deletedIssues.length}`);
  console.log(`[cleanup] deleted claims: ${deletedClaims.length}`);
}

run()
  .then(async () => {
    await dataSource.destroy();
    console.log('[cleanup] done');
  })
  .catch(async (error) => {
    console.error(`[cleanup] failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
    process.exit(1);
  });

import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { migrate } from 'drizzle-orm/mysql2/migrator';

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL || process.env.MYSQL_URL || process.env.MYSQL_PRIVATE_URL;

  if (!databaseUrl) {
    console.warn('⚠️  No database URL found (checked DATABASE_URL, MYSQL_URL, MYSQL_PRIVATE_URL). Skipping migration.');
    return;
  }

  const connection = await mysql.createConnection(databaseUrl);
  const db = drizzle(connection);

  console.log('Running database migration...');

  try {
    // Use drizzle-kit to apply all migrations
    await migrate(db, { migrationsFolder: './drizzle' });

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();

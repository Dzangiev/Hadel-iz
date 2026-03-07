import Dexie, { type Table } from 'dexie';

export interface Task {
    id?: string;
    title: string;
    description: string;
    rewardCoins: number; // 1 to 5
    date: string; // ISO format YYYY-MM-DD
    status: 'pending' | 'done' | 'transferred' | 'failed' | 'skipped';
    transferReason?: string;
    createdAt: number;
}

export interface Habit {
    id?: string;
    title: string;
    description: string;
    rewardCoins: number; // 1 to 5
    history: string[]; // array of ISO dates the habit was completed
    createdAt: number;
}

export interface Reward {
    id?: string;
    title: string;
    description: string;
    durationMinutes: number; // always multiple of 30
    costCoins: number; // always derived from durationMinutes
    dateConsumed: string; // ISO format
    createdAt: number;
}

export interface User {
    id: number; // always 1, singleton
    balance: number;
}

export class AppDB extends Dexie {
    tasks!: Table<Task>;
    habits!: Table<Habit>;
    rewards!: Table<Reward>;
    user!: Table<User>;

    constructor() {
        super('HabitCoinsDB');

        // v1 — старая схема с автоинкрементом (++id)
        this.version(1).stores({
            tasks: '++id, date, status',
            habits: '++id',
            rewards: '++id, dateConsumed',
            user: 'id'
        });

        // v2 — строковые UUID вместо автоинкремента
        this.version(2).stores({
            tasks: 'id, date, status',
            habits: 'id',
            rewards: 'id, dateConsumed',
            user: 'id'
        }).upgrade(tx => {
            // Конвертируем числовые id в строковые UUID
            const migrateTable = async (table: Table) => {
                const items = await table.toArray();
                for (const item of items) {
                    if (typeof item.id === 'number') {
                        const oldId = item.id;
                        const newId = crypto.randomUUID();
                        await table.delete(oldId as any);
                        await table.add({ ...item, id: newId });
                    }
                }
            };
            return Promise.all([
                migrateTable(tx.table('tasks')),
                migrateTable(tx.table('habits')),
                migrateTable(tx.table('rewards')),
            ]);
        });
    }
}

export const db = new AppDB();

// Initialize user if not exists
db.on('populate', () => {
    db.user.add({ id: 1, balance: 0 });
});

// Генерация уникального ID
export function generateId(): string {
    return crypto.randomUUID();
}

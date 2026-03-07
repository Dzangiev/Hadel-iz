/**
 * Firebase Firestore sync layer — Firestore-first.
 *
 * Стратегия:
 *   Залогинен → все записи идут напрямую в Firestore.
 *               Firestore SDK кэширует их оффлайн и отправляет при восстановлении сети.
 *               onSnapshot обновляет Dexie → useLiveQuery обновляет UI.
 *   Не залогинен → записи идут в Dexie напрямую (без Firestore).
 *
 *   initSyncData — при входе: если в Firestore есть данные → заменить Dexie.
 *                              если Firestore пуст → загрузить локальные данные вверх.
 */

import {
    collection,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    onSnapshot,
    type Unsubscribe,
    serverTimestamp,
    writeBatch,
    getDocs,
    increment,
} from 'firebase/firestore';
import { dbFirestore } from './firebase';
import { db, generateId } from './db';
import type { Task, Habit, Reward } from './db';

// ─── helpers ────────────────────────────────────────────────────────────────

function userCol(uid: string, colName: string) {
    return collection(dbFirestore, 'users', uid, colName);
}

function userDoc(uid: string) {
    return doc(dbFirestore, 'users', uid);
}

// ─── Firestore write operations (Firestore-first) ────────────────────────────
// Эти функции пишут ТОЛЬКО в Firestore. Dexie обновится через onSnapshot.
// Благодаря persistence SDK, запись кэшируется оффлайн автоматически.

/** Создать или обновить задачу в Firestore */
export async function writeTask(uid: string, task: Task): Promise<void> {
    if (!task.id) return;
    try {
        await setDoc(doc(userCol(uid, 'tasks'), task.id), {
            ...task,
            _syncedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('writeTask error:', err);
    }
}

/** Создать или обновить привычку в Firestore */
export async function writeHabit(uid: string, habit: Habit): Promise<void> {
    if (!habit.id) return;
    try {
        await setDoc(doc(userCol(uid, 'habits'), habit.id), {
            ...habit,
            _syncedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('writeHabit error:', err);
    }
}

/** Создать или обновить отдых в Firestore */
export async function writeReward(uid: string, reward: Reward): Promise<void> {
    if (!reward.id) return;
    try {
        await setDoc(doc(userCol(uid, 'rewards'), reward.id), {
            ...reward,
            _syncedAt: serverTimestamp(),
        });
    } catch (err) {
        console.warn('writeReward error:', err);
    }
}

/**
 * Изменить баланс на delta (±).
 * Использует increment() из Firestore — защита от race condition при
 * одновременном использовании нескольких устройств.
 */
export async function updateBalance(uid: string, delta: number): Promise<void> {
    try {
        await setDoc(userDoc(uid), {
            balance: increment(delta),
            _syncedAt: serverTimestamp(),
        }, { merge: true });
    } catch (err) {
        console.warn('updateBalance error:', err);
    }
}

/** Установить баланс в абсолютное значение (используется только при initSync и reset) */
export async function setAbsoluteBalance(uid: string, balance: number): Promise<void> {
    try {
        await setDoc(userDoc(uid), {
            balance,
            _syncedAt: serverTimestamp(),
        }, { merge: true });
    } catch (err) {
        console.warn('setAbsoluteBalance error:', err);
    }
}

/** Удалить задачу из Firestore */
export async function removeTask(uid: string, id: string): Promise<void> {
    try {
        await deleteDoc(doc(userCol(uid, 'tasks'), id));
    } catch (err) {
        console.warn('removeTask error:', err);
    }
}

/** Удалить привычку из Firestore */
export async function removeHabit(uid: string, id: string): Promise<void> {
    try {
        await deleteDoc(doc(userCol(uid, 'habits'), id));
    } catch (err) {
        console.warn('removeHabit error:', err);
    }
}

/** Удалить отдых из Firestore */
export async function removeReward(uid: string, id: string): Promise<void> {
    try {
        await deleteDoc(doc(userCol(uid, 'rewards'), id));
    } catch (err) {
        console.warn('removeReward error:', err);
    }
}


// ─── Initial full push (upload all local data to Firestore on first login) ────

export async function pushAllLocalData(uid: string) {
    const batch = writeBatch(dbFirestore);

    const tasks = await db.tasks.toArray();
    for (const t of tasks) {
        // Если у локальной задачи числовой id (от старой схемы) — генерируем UUID
        const docId = t.id || generateId();
        batch.set(doc(userCol(uid, 'tasks'), docId), {
            ...t,
            id: docId,
            _syncedAt: serverTimestamp(),
        });
    }

    const habits = await db.habits.toArray();
    for (const h of habits) {
        const docId = h.id || generateId();
        batch.set(doc(userCol(uid, 'habits'), docId), {
            ...h,
            id: docId,
            _syncedAt: serverTimestamp(),
        });
    }

    const rewards = await db.rewards.toArray();
    for (const r of rewards) {
        const docId = r.id || generateId();
        batch.set(doc(userCol(uid, 'rewards'), docId), {
            ...r,
            id: docId,
            _syncedAt: serverTimestamp(),
        });
    }

    const user = await db.user.get(1);
    if (user) {
        batch.set(userDoc(uid), { balance: user.balance, _syncedAt: serverTimestamp() }, { merge: true } as any);
    }

    await batch.commit();
}

// ─── Smart initialization: Firestore is source of truth ───────────────────────

export async function initSyncData(uid: string): Promise<void> {
    try {
        const [remoteTasks, remoteHabits, remoteRewards, userSnap] = await Promise.all([
            getDocs(userCol(uid, 'tasks')),
            getDocs(userCol(uid, 'habits')),
            getDocs(userCol(uid, 'rewards')),
            getDoc(userDoc(uid)),
        ]);

        const hasRemoteData =
            remoteTasks.size > 0 || remoteHabits.size > 0 || remoteRewards.size > 0;
        const wasReset = userSnap.exists() && userSnap.data()?.reset_at;

        if (hasRemoteData) {
            // ── Remote wins: overwrite local completely ────────────────────────
            await db.tasks.clear();
            await db.habits.clear();
            await db.rewards.clear();

            for (const snap of remoteTasks.docs) {
                const { _syncedAt, ...data } = snap.data() as Task & { _syncedAt?: unknown };
                await db.tasks.put({ ...data, id: snap.id });
            }
            for (const snap of remoteHabits.docs) {
                const { _syncedAt, ...data } = snap.data() as Habit & { _syncedAt?: unknown };
                await db.habits.put({ ...data, id: snap.id });
            }
            for (const snap of remoteRewards.docs) {
                const { _syncedAt, ...data } = snap.data() as Reward & { _syncedAt?: unknown };
                await db.rewards.put({ ...data, id: snap.id });
            }

            // Синхронно восстанавливаем баланс
            if (userSnap.exists() && typeof userSnap.data().balance === 'number') {
                const remoteBalance = userSnap.data().balance as number;
                const localUser = await db.user.get(1);
                if (localUser) {
                    await db.user.update(1, { balance: remoteBalance });
                } else {
                    await db.user.put({ id: 1, balance: remoteBalance });
                }
            }

        } else if (wasReset) {
            // ── Another device triggered a reset: clear local data too ─────────
            await db.tasks.clear();
            await db.habits.clear();
            await db.rewards.clear();
            const localUser = await db.user.get(1);
            if (localUser) {
                await db.user.update(1, { balance: 0 });
            } else {
                await db.user.put({ id: 1, balance: 0 });
            }

        } else {
            // ── Firestore is empty, no reset flag → first login, upload local ──
            await pushAllLocalData(uid);
        }
    } catch (err) {
        console.warn('initSyncData error (offline?):', err);
        // При ошибке — работаем с локальными данными. Sync подхватится через onSnapshot.
    }
}

export async function markReset(uid: string): Promise<void> {
    await setDoc(userDoc(uid), { balance: 0, reset_at: serverTimestamp() }, { merge: true });
}

// Keep old name as thin wrapper for compatibility
export async function pullAllRemoteData(uid: string): Promise<void> {
    await initSyncData(uid);
}


// ─── Real-time Firestore → Dexie listener ─────────────────────────────────────

let _unsubs: Unsubscribe[] = [];

export function stopSync() {
    _unsubs.forEach(u => u());
    _unsubs = [];
}

export function startSync(uid: string): void {
    stopSync();

    // Listen to tasks
    _unsubs.push(
        onSnapshot(userCol(uid, 'tasks'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'removed') {
                    await db.tasks.delete(change.doc.id);
                } else {
                    const { _syncedAt, ...data } = change.doc.data() as Task & { _syncedAt?: unknown };
                    await db.tasks.put({ ...data, id: change.doc.id });
                }
            });
        })
    );

    // Listen to habits
    _unsubs.push(
        onSnapshot(userCol(uid, 'habits'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'removed') {
                    await db.habits.delete(change.doc.id);
                } else {
                    const { _syncedAt, ...data } = change.doc.data() as Habit & { _syncedAt?: unknown };
                    await db.habits.put({ ...data, id: change.doc.id });
                }
            });
        })
    );

    // Listen to rewards
    _unsubs.push(
        onSnapshot(userCol(uid, 'rewards'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'removed') {
                    await db.rewards.delete(change.doc.id);
                } else {
                    const { _syncedAt, ...data } = change.doc.data() as Reward & { _syncedAt?: unknown };
                    await db.rewards.put({ ...data, id: change.doc.id });
                }
            });
        })
    );

    // Listen to user balance
    _unsubs.push(
        onSnapshot(userDoc(uid), async snap => {
            if (snap.exists()) {
                const remoteBalance = snap.data().balance as number;
                const localUser = await db.user.get(1);
                if (localUser && localUser.balance !== remoteBalance) {
                    await db.user.update(1, { balance: remoteBalance });
                } else if (!localUser) {
                    await db.user.put({ id: 1, balance: remoteBalance });
                }
            }
        })
    );
}

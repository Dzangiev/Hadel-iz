/**
 * Firebase Firestore sync layer.
 *
 * Strategy: Local-first. All writes go to Dexie first, then are pushed to
 * Firestore as sub-collections under the user's UID document. On login / app
 * start, we subscribe to Firestore real-time listeners and merge remote data
 * into Dexie (last-write-wins on updatedAt).
 */

import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    type Unsubscribe,
    serverTimestamp,
    writeBatch,
    getDocs,
} from 'firebase/firestore';
import { dbFirestore } from './firebase';
import { db } from './db';
import type { Task, Habit, Reward } from './db';

// ─── helpers ────────────────────────────────────────────────────────────────

function userCol(uid: string, colName: string) {
    return collection(dbFirestore, 'users', uid, colName);
}

function userDoc(uid: string) {
    return doc(dbFirestore, 'users', uid);
}

// ─── Push a single item to Firestore ─────────────────────────────────────────

export async function pushTask(uid: string, task: Task) {
    if (!task.id) return;
    await setDoc(doc(userCol(uid, 'tasks'), String(task.id)), {
        ...task,
        _syncedAt: serverTimestamp(),
    });
}

export async function pushHabit(uid: string, habit: Habit) {
    if (!habit.id) return;
    await setDoc(doc(userCol(uid, 'habits'), String(habit.id)), {
        ...habit,
        _syncedAt: serverTimestamp(),
    });
}

export async function pushReward(uid: string, reward: Reward) {
    if (!reward.id) return;
    await setDoc(doc(userCol(uid, 'rewards'), String(reward.id)), {
        ...reward,
        _syncedAt: serverTimestamp(),
    });
}

export async function pushBalance(uid: string, balance: number) {
    await setDoc(userDoc(uid), { balance, _syncedAt: serverTimestamp() }, { merge: true });
}

export async function deleteRemoteTask(uid: string, id: number) {
    await deleteDoc(doc(userCol(uid, 'tasks'), String(id)));
}

export async function deleteRemoteHabit(uid: string, id: number) {
    await deleteDoc(doc(userCol(uid, 'habits'), String(id)));
}

export async function deleteRemoteReward(uid: string, id: number) {
    await deleteDoc(doc(userCol(uid, 'rewards'), String(id)));
}

// ─── Initial full push (upload all local data to Firestore on first login) ────

export async function pushAllLocalData(uid: string) {
    const batch = writeBatch(dbFirestore);

    const tasks = await db.tasks.toArray();
    for (const t of tasks) {
        if (t.id) {
            batch.set(doc(userCol(uid, 'tasks'), String(t.id)), {
                ...t,
                _syncedAt: serverTimestamp(),
            });
        }
    }

    const habits = await db.habits.toArray();
    for (const h of habits) {
        if (h.id) {
            batch.set(doc(userCol(uid, 'habits'), String(h.id)), {
                ...h,
                _syncedAt: serverTimestamp(),
            });
        }
    }

    const rewards = await db.rewards.toArray();
    for (const r of rewards) {
        if (r.id) {
            batch.set(doc(userCol(uid, 'rewards'), String(r.id)), {
                ...r,
                _syncedAt: serverTimestamp(),
            });
        }
    }

    const user = await db.user.get(1);
    if (user) {
        batch.set(userDoc(uid), { balance: user.balance, _syncedAt: serverTimestamp() }, { merge: true } as any);
    }

    await batch.commit();
}

// ─── Pull: fetch remote data and merge into Dexie ─────────────────────────────

export async function pullAllRemoteData(uid: string) {
    // Tasks
    const remoteTasks = await getDocs(userCol(uid, 'tasks'));
    for (const snap of remoteTasks.docs) {
        const remote = snap.data() as Task & { _syncedAt?: unknown };
        const { _syncedAt, ...taskData } = remote;
        const local = await db.tasks.get(Number(snap.id));
        if (!local || (taskData.createdAt ?? 0) > (local.createdAt ?? 0)) {
            await db.tasks.put({ ...taskData, id: Number(snap.id) });
        }
    }

    // Habits
    const remoteHabits = await getDocs(userCol(uid, 'habits'));
    for (const snap of remoteHabits.docs) {
        const remote = snap.data() as Habit & { _syncedAt?: unknown };
        const { _syncedAt, ...habitData } = remote;
        const local = await db.habits.get(Number(snap.id));
        if (!local || (habitData.createdAt ?? 0) > (local.createdAt ?? 0)) {
            await db.habits.put({ ...habitData, id: Number(snap.id) });
        }
    }

    // Rewards
    const remoteRewards = await getDocs(userCol(uid, 'rewards'));
    for (const snap of remoteRewards.docs) {
        const remote = snap.data() as Reward & { _syncedAt?: unknown };
        const { _syncedAt, ...rewardData } = remote;
        const local = await db.rewards.get(Number(snap.id));
        if (!local || (rewardData.createdAt ?? 0) > (local.createdAt ?? 0)) {
            await db.rewards.put({ ...rewardData, id: Number(snap.id) });
        }
    }

    // Balance (merge: take max or remote if no local data)
    // ...handled by real-time listener below
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
                    await db.tasks.delete(Number(change.doc.id));
                } else {
                    const { _syncedAt, ...data } = change.doc.data() as Task & { _syncedAt?: unknown };
                    await db.tasks.put({ ...data, id: Number(change.doc.id) });
                }
            });
        })
    );

    // Listen to habits
    _unsubs.push(
        onSnapshot(userCol(uid, 'habits'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'removed') {
                    await db.habits.delete(Number(change.doc.id));
                } else {
                    const { _syncedAt, ...data } = change.doc.data() as Habit & { _syncedAt?: unknown };
                    await db.habits.put({ ...data, id: Number(change.doc.id) });
                }
            });
        })
    );

    // Listen to rewards
    _unsubs.push(
        onSnapshot(userCol(uid, 'rewards'), snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'removed') {
                    await db.rewards.delete(Number(change.doc.id));
                } else {
                    const { _syncedAt, ...data } = change.doc.data() as Reward & { _syncedAt?: unknown };
                    await db.rewards.put({ ...data, id: Number(change.doc.id) });
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
                // Remote wins (last-write-wins via Firestore)
                if (localUser && localUser.balance !== remoteBalance) {
                    await db.user.update(1, { balance: remoteBalance });
                }
            }
        })
    );
}

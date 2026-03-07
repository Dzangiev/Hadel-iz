import { useState, useEffect } from 'react';
import { Settings, Calendar as CalendarIcon, Globe, Plus, RefreshCw, Bell } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateId } from './db/db';
import { useAuth } from './db/useAuth';
import { startSync, stopSync, pullAllRemoteData, writeTask, writeHabit, writeReward, updateBalance, removeTask, removeHabit, removeReward } from './db/sync';
import { DateSelector } from './components/DateSelector';
import { TaskItem, HabitItem, RewardItem } from './components/ListItems';
import { CreateItemModal } from './components/CreateItemModal';
import { NotificationsSheet } from './components/NotificationsSheet';
import { SettingsModal } from './components/SettingsModal';

function App() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'global'>('calendar');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isExtraMode, setIsExtraMode] = useState(() => localStorage.getItem('extra-mode') !== 'false');
  const [editItem, setEditItem] = useState<{ type: 'task' | 'habit' | 'reward', id: string, data: any } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { user: firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  // Start / stop Firestore sync on auth change
  useEffect(() => {
    if (firebaseUser) {
      setSyncing(true);
      pullAllRemoteData(firebaseUser.uid)
        .then(() => startSync(firebaseUser.uid))
        .finally(() => setSyncing(false));
    } else {
      stopSync();
    }
    return () => stopSync();
  }, [firebaseUser?.uid]);

  const toggleExtraMode = (val: boolean) => {
    setIsExtraMode(val);
    localStorage.setItem('extra-mode', String(val));
  };

  const user = useLiveQuery(() => db.user.get(1));
  const balance = user?.balance ?? 0;

  const dateStr = format(selectedDate, 'yyyy-MM-dd');

  const tasks = useLiveQuery(
    () => db.tasks.where('date').equals(dateStr)
      .filter(t => t.status !== 'transferred' && t.status !== 'skipped')
      .toArray(),
    [dateStr]
  ) ?? [];
  const habits = useLiveQuery(() => db.habits.toArray(), []) ?? [];
  const rewards = useLiveQuery(() => db.rewards.where('dateConsumed').equals(dateStr).toArray(), [dateStr]) ?? [];

  // Get overdue tasks (status pending and date < today)
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const overdueTasks = useLiveQuery(
    () => db.tasks
      .where('status').equals('pending')
      .filter(t => t.date < todayStr)
      .toArray(),
    [todayStr]
  ) ?? [];

  // ─── Helpers for Firestore-first writes ────────────────────────────────────

  /**
   * Записать задачу: если залогинен → Firestore (Dexie обновится через onSnapshot),
   * если нет → Dexie напрямую.
   */
  const saveTask = async (task: import('./db/db').Task) => {
    if (uid) {
      await writeTask(uid, task);
    } else {
      await db.tasks.put(task);
    }
  };

  const saveHabit = async (habit: import('./db/db').Habit) => {
    if (uid) {
      await writeHabit(uid, habit);
    } else {
      await db.habits.put(habit);
    }
  };

  const saveReward = async (reward: import('./db/db').Reward) => {
    if (uid) {
      await writeReward(uid, reward);
    } else {
      await db.rewards.put(reward);
    }
  };

  /**
   * Изменить баланс на delta.
   * Залогинен → increment в Firestore (атомарно, без race condition).
   * Не залогинен → прямая запись в Dexie.
   */
  const changeBalance = async (delta: number) => {
    if (uid) {
      await updateBalance(uid, delta);
    } else {
      const cur = (await db.user.get(1))?.balance ?? 0;
      const newBal = isExtraMode ? cur + delta : Math.max(0, cur + delta);
      await db.user.update(1, { balance: newBal });
    }
  };

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleToggleTask = async (id: string) => {
    const task = await db.tasks.get(id);
    if (!task) return;

    if (task.status === 'pending') {
      const updated = { ...task, status: 'done' as const };
      await saveTask(updated);
      await changeBalance(task.rewardCoins);
      // Если не залогинен, Dexie уже обновлён через saveTask
      // Если залогинен, Dexie обновится через onSnapshot
    } else if (task.status === 'done') {
      const updated = { ...task, status: 'pending' as const };
      await saveTask(updated);
      await changeBalance(-Math.abs(task.rewardCoins));
    }
  };

  const handleToggleHabit = async (id: string) => {
    const habit = await db.habits.get(id);
    if (!habit) return;

    const isDone = habit.history.includes(dateStr);

    if (isDone) {
      const updated = { ...habit, history: habit.history.filter(d => d !== dateStr) };
      await saveHabit(updated);
      await changeBalance(-habit.rewardCoins);
    } else {
      const updated = { ...habit, history: [...habit.history, dateStr] };
      await saveHabit(updated);
      await changeBalance(habit.rewardCoins);
    }
  };


  const handleCreate = async (type: 'task' | 'habit' | 'reward', data: Record<string, unknown>, editId?: string) => {
    if (type === 'task') {
      if (editId) {
        const existing = await db.tasks.get(editId);
        if (existing) {
          await saveTask({ ...existing, ...data as any });
        }
      } else {
        const taskDate = (data.date as string) || dateStr;
        const newTask: import('./db/db').Task = {
          id: generateId(),
          ...(data as { title: string; description: string; rewardCoins: number }),
          date: taskDate,
          status: 'pending',
          createdAt: Date.now(),
        };
        await saveTask(newTask);
      }
    } else if (type === 'habit') {
      if (editId) {
        const existing = await db.habits.get(editId);
        if (existing) {
          await saveHabit({ ...existing, ...data as any });
        }
      } else {
        const newHabit: import('./db/db').Habit = {
          id: generateId(),
          ...(data as { title: string; description: string; rewardCoins: number }),
          history: [],
          createdAt: Date.now(),
        };
        await saveHabit(newHabit);
      }
    } else if (type === 'reward') {
      const costCoins = (data as { costCoins: number }).costCoins;
      const rewardDate = (data.date as string) || dateStr;

      if (editId) {
        const old = await db.rewards.get(editId);
        if (old) {
          const diff = old.costCoins - costCoins;
          const updatePayload: any = { ...old, ...data };
          if (updatePayload.date) {
            updatePayload.dateConsumed = updatePayload.date;
            delete updatePayload.date;
          }
          await saveReward(updatePayload);
          if (diff !== 0) {
            await changeBalance(diff);
          }
        }
      } else {
        const newReward: import('./db/db').Reward = {
          id: generateId(),
          ...(data as { title: string; description: string; durationMinutes: number; costCoins: number }),
          dateConsumed: rewardDate,
          createdAt: Date.now(),
        };
        await saveReward(newReward);
        await changeBalance(-costCoins);
      }
    }
  };

  // ── Overdue task actions ─────────────────────────────────────────────────────

  const handleTransferOverdue = async (taskId: string) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;

    // Помечаем старую задачу как перенесённую
    const transferred = { ...task, status: 'transferred' as const };
    await saveTask(transferred);

    // Создаём новую задачу на сегодня
    const newTask: import('./db/db').Task = {
      id: generateId(),
      title: task.title,
      description: task.description,
      rewardCoins: Math.abs(task.rewardCoins),
      date: todayStr,
      status: 'pending',
      createdAt: Date.now(),
    };
    await saveTask(newTask);
  };

  const handleSkipOverdue = async (taskId: string) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    await saveTask({ ...task, status: 'skipped' as const });
  };

  const handleFailOverdue = async (taskId: string) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;

    // Помечаем старую задачу как проваленную
    const failed = { ...task, status: 'failed' as const };
    await saveTask(failed);

    // Создаём задачу-штраф
    const penaltyTask: import('./db/db').Task = {
      id: generateId(),
      title: `Штраф: ${task.title}`,
      description: 'Не выполнено в срок',
      rewardCoins: -Math.abs(task.rewardCoins),
      date: todayStr,
      status: 'done',
      createdAt: Date.now(),
    };
    await saveTask(penaltyTask);
    await changeBalance(-Math.abs(task.rewardCoins));
  };

  const handleDelete = async (type: 'task' | 'habit' | 'reward', id: string) => {
    if (type === 'task') {
      const task = await db.tasks.get(id);
      if (task?.status === 'done') {
        await changeBalance(-task.rewardCoins);
      }
      if (uid) {
        await removeTask(uid, id);
      } else {
        await db.tasks.delete(id);
      }
    } else if (type === 'habit') {
      if (uid) {
        await removeHabit(uid, id);
      } else {
        await db.habits.delete(id);
      }
    } else if (type === 'reward') {
      const rew = await db.rewards.get(id);
      if (rew) {
        await changeBalance(rew.costCoins);
        if (uid) {
          await removeReward(uid, id);
        } else {
          await db.rewards.delete(id);
        }
      }
    }
  };



  return (
    <>
      <header className="header">
        <DateSelector date={selectedDate} onChange={setSelectedDate} />
        <div className="header-right">
          {syncing && (
            <RefreshCw size={14} style={{ opacity: 0.5, animation: 'spin 1s linear infinite' }} />
          )}
          <div className="coin-display">
            <img src={`${import.meta.env.BASE_URL}Coin.png`} alt="Монетки" style={{ width: 22, height: 22, objectFit: 'contain' }} />
            <span>{balance}</span>
          </div>
          <button
            className="icon-btn bell-btn"
            aria-label="Уведомления"
            onClick={() => setIsNotifOpen(true)}
            style={{ position: 'relative' }}
          >
            <Bell size={20} />
            {overdueTasks.length > 0 && (
              <span className="bell-badge">{overdueTasks.length}</span>
            )}
          </button>
          <button className="icon-btn" aria-label="Настройки" onClick={() => setIsSettingsOpen(true)}>
            <Settings size={20} />
          </button>
        </div>
      </header>


      <main className="main-content">
        {activeTab === 'calendar' ? (
          <div className="scroll-list seamless-list">
            {tasks.length === 0 && rewards.length === 0 && habits.length === 0 && (
              <div className="empty-state">Пока ничего нет. Жми <strong>+</strong></div>
            )}

            {tasks.map(task => (
              <TaskItem
                key={task.id}
                item={task}
                onToggle={handleToggleTask}
                onItemClick={id => { setEditItem({ type: 'task', id, data: task }); setIsModalOpen(true); }}
              />
            ))}

            {rewards.map(reward => (
              <RewardItem key={`reward-${reward.id}`} item={reward} onItemClick={id => { setEditItem({ type: 'reward', id, data: reward }); setIsModalOpen(true); }} />
            ))}

            {habits.map(habit => (
              <HabitItem
                key={habit.id}
                item={habit}
                selectedDate={dateStr}
                onToggle={handleToggleHabit}
                onItemClick={id => { setEditItem({ type: 'habit', id, data: habit }); setIsModalOpen(true); }}
              />
            ))}
          </div>
        ) : (
          <div className="global-placeholder">
            <div className="emoji-icon">🌍</div>
            <h2>Мир привычек</h2>
            <p>Здесь будут собираться все твои достижения и глобальная статистика.</p>
          </div>
        )}
      </main>

      {/* strictly iOS 26 tab bar */}
      <div className="tab-bar-wrapper">
        <div className="tab-pill">
          <button
            className={clsx('tab-btn', activeTab === 'global' && 'active')}
            onClick={() => setActiveTab('global')}
          >
            <Globe size={22} strokeWidth={2.5} />
            {activeTab === 'global' && <span>Глобальные</span>}
          </button>

          <button
            className={clsx('tab-btn', activeTab === 'calendar' && 'active')}
            onClick={() => setActiveTab('calendar')}
          >
            <CalendarIcon size={22} strokeWidth={2.5} />
            {activeTab === 'calendar' && <span>Календарь</span>}
          </button>
        </div>

        <button
          className="tab-add-btn"
          onClick={() => setIsModalOpen(true)}
          aria-label="Создать"
        >
          <Plus size={28} strokeWidth={3} />
        </button>
      </div>

      <CreateItemModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditItem(null); }}
        onSave={handleCreate}
        onDelete={handleDelete}
        editItem={editItem}
        defaultDate={dateStr}
      />

      <NotificationsSheet
        isOpen={isNotifOpen}
        onClose={() => setIsNotifOpen(false)}
        overdueTasks={overdueTasks}
        onTransfer={handleTransferOverdue}
        onSkip={handleSkipOverdue}
        onFail={handleFailOverdue}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isExtraMode={isExtraMode}
        onExtraModeChange={toggleExtraMode}
      />
    </>
  );
}

export default App;

import { useState, useEffect } from 'react';
import { Settings, Calendar as CalendarIcon, Globe, Plus, RefreshCw, Bell } from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { useAuth } from './db/useAuth';
import { startSync, stopSync, pullAllRemoteData, pushTask, pushHabit, pushReward, pushBalance, deleteRemoteTask, deleteRemoteHabit, deleteRemoteReward } from './db/sync';
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
  const [editItem, setEditItem] = useState<{ type: 'task' | 'habit' | 'reward', id: number, data: any } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const { user: firebaseUser } = useAuth();

  // Start / stop Firestore sync on auth change
  useEffect(() => {
    if (firebaseUser) {
      setSyncing(true);
      // pullAllRemoteData уже содержит логику: если Firebase пустой — сам вызывает pushAllLocalData.
      // Вызывать pushAllLocalData снаружи НЕЛЬЗЯ — при заходе со второго устройства
      // Dexie ещё не получил баланс из Firebase, и pushAllLocalData перепишет его нулём.
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

  const tasks = useLiveQuery(() => db.tasks.where('date').equals(dateStr).toArray(), [dateStr]) ?? [];
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

  const handleToggleTask = async (id: number) => {
    const task = await db.tasks.get(id);
    if (!task) return;

    let finalBalance: number | null = null;

    if (task.status === 'pending') {
      await db.transaction('rw', db.tasks, db.user, async () => {
        await db.tasks.update(id, { status: 'done' });
        // Читаем актуальный баланс из Dexie, а не из замыкания React state
        const cur = (await db.user.get(1))?.balance ?? 0;
        finalBalance = isExtraMode ? cur + task.rewardCoins : Math.max(0, cur + task.rewardCoins);
        await db.user.update(1, { balance: finalBalance });
      });
      const updated = await db.tasks.get(id);
      if (firebaseUser && updated && finalBalance !== null) {
        pushTask(firebaseUser.uid, updated);
        pushBalance(firebaseUser.uid, finalBalance);
      }
    } else if (task.status === 'done') {
      await db.transaction('rw', db.tasks, db.user, async () => {
        await db.tasks.update(id, { status: 'pending' });
        const cur = (await db.user.get(1))?.balance ?? 0;
        finalBalance = isExtraMode ? cur - Math.abs(task.rewardCoins) : Math.max(0, cur - Math.abs(task.rewardCoins));
        await db.user.update(1, { balance: finalBalance });
      });
      const updated = await db.tasks.get(id);
      if (firebaseUser && updated && finalBalance !== null) {
        pushTask(firebaseUser.uid, updated);
        pushBalance(firebaseUser.uid, finalBalance);
      }
    }
  };

  const handleToggleHabit = async (id: number) => {
    const habit = await db.habits.get(id);
    if (!habit) return;

    const isDone = habit.history.includes(dateStr);
    let finalBalance: number | null = null;

    await db.transaction('rw', db.habits, db.user, async () => {
      // Читаем актуальный баланс из Dexie, а не из замыкания React state
      const cur = (await db.user.get(1))?.balance ?? 0;
      if (isDone) {
        await db.habits.update(id, { history: habit.history.filter(d => d !== dateStr) });
        finalBalance = isExtraMode ? cur - habit.rewardCoins : Math.max(0, cur - habit.rewardCoins);
      } else {
        await db.habits.update(id, { history: [...habit.history, dateStr] });
        finalBalance = cur + habit.rewardCoins;
      }
      await db.user.update(1, { balance: finalBalance! });
    });
    const updated = await db.habits.get(id);
    if (firebaseUser && updated && finalBalance !== null) {
      pushHabit(firebaseUser.uid, updated);
      pushBalance(firebaseUser.uid, finalBalance);
    }
  };


  const handleCreate = async (type: 'task' | 'habit' | 'reward', data: Record<string, unknown>, editId?: number) => {
    if (type === 'task') {
      if (editId) {
        await db.tasks.update(editId, data as any);
        const updated = await db.tasks.get(editId);
        if (firebaseUser && updated) pushTask(firebaseUser.uid, updated);
      } else {
        const taskDate = (data.date as string) || dateStr;
        const id = await db.tasks.add({
          ...(data as { title: string; description: string; rewardCoins: number }),
          date: taskDate,
          status: 'pending',
          createdAt: Date.now(),
        });
        const added = await db.tasks.get(id);
        if (firebaseUser && added) pushTask(firebaseUser.uid, added);
      }
    } else if (type === 'habit') {
      if (editId) {
        await db.habits.update(editId, data as any);
        const updated = await db.habits.get(editId);
        if (firebaseUser && updated) pushHabit(firebaseUser.uid, updated);
      } else {
        const id = await db.habits.add({
          ...(data as { title: string; description: string; rewardCoins: number }),
          history: [],
          createdAt: Date.now(),
        });
        const added = await db.habits.get(id);
        if (firebaseUser && added) pushHabit(firebaseUser.uid, added);
      }
    } else if (type === 'reward') {
      const costCoins = (data as { costCoins: number }).costCoins;
      const rewardDate = (data.date as string) || dateStr;
      await db.transaction('rw', db.rewards, db.user, async () => {
        if (editId) {
          const old = await db.rewards.get(editId);
          if (old) {
            const diff = old.costCoins - costCoins;
            const updatePayload: any = { ...data };
            if (updatePayload.date) {
              updatePayload.dateConsumed = updatePayload.date;
              delete updatePayload.date;
            }
            await db.rewards.update(editId, updatePayload);
            const newBalance = isExtraMode ? (balance + diff) : Math.max(0, balance + diff);
            await db.user.update(1, { balance: newBalance });
          }
        } else {
          await db.rewards.add({
            ...(data as { title: string; description: string; durationMinutes: number; costCoins: number }),
            dateConsumed: rewardDate,
            createdAt: Date.now(),
          });
          const newBalance = isExtraMode ? (balance - costCoins) : Math.max(0, balance - costCoins);
          await db.user.update(1, { balance: newBalance });
        }
      });
      if (editId) {
        const updated = await db.rewards.get(editId);
        if (firebaseUser && updated) { pushReward(firebaseUser.uid, updated); pushBalance(firebaseUser.uid, isExtraMode ? (balance + updated.costCoins) : Math.max(0, balance)); }
      } else {
        const all = await db.rewards.orderBy('createdAt').last();
        if (firebaseUser && all) { pushReward(firebaseUser.uid, all); pushBalance(firebaseUser.uid, isExtraMode ? (balance - costCoins) : Math.max(0, balance - costCoins)); }
      }
    }
  };

  // ── Overdue task actions ─────────────────────────────────────────────────────

  const handleTransferOverdue = async (taskId: number) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    const newCreatedAt = Date.now();
    await db.transaction('rw', db.tasks, async () => {
      await db.tasks.update(taskId, { status: 'transferred' });
      await db.tasks.add({
        title: task.title,
        description: task.description,
        rewardCoins: Math.abs(task.rewardCoins),
        date: todayStr,
        status: 'pending',
        createdAt: newCreatedAt,
      });
    });
    const updated = await db.tasks.get(taskId);
    if (firebaseUser && updated) pushTask(firebaseUser.uid, updated);
    // Пушим новую (перенесённую) задачу тоже
    const newTask = await db.tasks.where('createdAt').equals(newCreatedAt).first();
    if (firebaseUser && newTask) pushTask(firebaseUser.uid, newTask);
  };

  const handleSkipOverdue = async (taskId: number) => {
    await db.tasks.update(taskId, { status: 'skipped' });
    const updated = await db.tasks.get(taskId);
    if (firebaseUser && updated) pushTask(firebaseUser.uid, updated);
  };

  const handleFailOverdue = async (taskId: number) => {
    const task = await db.tasks.get(taskId);
    if (!task) return;
    await db.transaction('rw', db.tasks, db.user, async () => {
      await db.tasks.update(taskId, { status: 'failed' });
      await db.tasks.add({
        title: `Штраф: ${task.title}`,
        description: 'Не выполнено в срок',
        rewardCoins: -Math.abs(task.rewardCoins),
        date: todayStr,
        status: 'done',
        createdAt: Date.now(),
      });
      const newBalance = isExtraMode
        ? balance - Math.abs(task.rewardCoins)
        : Math.max(0, balance - Math.abs(task.rewardCoins));
      await db.user.update(1, { balance: newBalance });
      if (firebaseUser) pushBalance(firebaseUser.uid, newBalance);
    });
    const updated = await db.tasks.get(taskId);
    if (firebaseUser && updated) pushTask(firebaseUser.uid, updated);
  };

  const handleDelete = async (type: 'task' | 'habit' | 'reward', id: number) => {
    if (type === 'task') {
      const task = await db.tasks.get(id);
      if (task?.status === 'done') {
        const newBalance = isExtraMode ? (balance - task.rewardCoins) : Math.max(0, balance - task.rewardCoins);
        await db.user.update(1, { balance: newBalance });
        if (firebaseUser) pushBalance(firebaseUser.uid, newBalance);
      }
      await db.tasks.delete(id);
      if (firebaseUser) deleteRemoteTask(firebaseUser.uid, id);
    } else if (type === 'habit') {
      await db.habits.delete(id);
      if (firebaseUser) deleteRemoteHabit(firebaseUser.uid, id);
    } else if (type === 'reward') {
      const rew = await db.rewards.get(id);
      if (rew) {
        await db.user.update(1, { balance: balance + rew.costCoins });
        await db.rewards.delete(id);
        if (firebaseUser) { pushBalance(firebaseUser.uid, balance + rew.costCoins); deleteRemoteReward(firebaseUser.uid, id); }
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

import { CheckCircle2, Circle } from 'lucide-react';
import { format, subDays, parseISO } from 'date-fns';
import { useState } from 'react';
import type { Task, Habit, Reward } from '../db/db';

interface ListSectionProps {
    title: string;
    icon?: string;
    children: React.ReactNode;
}

export function ListSection({ title, icon, children }: ListSectionProps) {
    return (
        <div className="list-section">
            <div className="section-header">
                <div className="section-pill">
                    {icon && <span>{icon}</span>}
                    <span>{title}</span>
                </div>
            </div>
            <div className="list-container">{children}</div>
        </div>
    );
}

// ============== TASK ==============
interface TaskItemProps {
    item: Task;
    onToggle: (id: number) => void;
    onItemClick: (id: number) => void;
}

export function TaskItem({ item, onToggle, onItemClick }: TaskItemProps) {
    const isDone = item.status === 'done';
    const isPenalty = item.rewardCoins < 0;
    const [clickCount, setClickCount] = useState(0);

    const handleCheckClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDone) {
            onToggle(item.id!);
            return;
        }

        setClickCount(prev => prev + 1);
        if (clickCount === 0) {
            setTimeout(() => setClickCount(0), 400); // 400ms window for second tap
        } else {
            onToggle(item.id!);
            setClickCount(0);
        }
    };

    return (
        <div className="list-item task-item" onClick={() => item.id && onItemClick(item.id)}>
            <div className="item-left-content">
                <div className="item-texts">
                    <span className={`item-title ${isDone ? 'done' : ''} ${isPenalty ? 'penalty' : ''}`}>
                        {isPenalty ? '⚠️ ' : ''}{item.title}
                    </span>
                    {item.description && <span className="item-sub">{item.description}</span>}
                </div>
            </div>

            <div className="item-right">
                <div className={`badge ${isPenalty ? 'badge-red' : 'badge-gold'}`}>
                    <img src="/Coin.png" alt="Coin" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    <span>{item.rewardCoins > 0 ? '+' : ''}{item.rewardCoins}</span>
                </div>
                <div className="item-action">
                    <button
                        className={`habit-check-btn ${isDone ? 'done' : ''} ${clickCount === 1 ? 'pre-clicked' : ''}`}
                        onClick={handleCheckClick}
                        title={isDone ? 'Отменить' : 'Нажми дважды'}
                    >
                        {isDone ? <CheckCircle2 size={24} color="#A855F7" /> : <Circle size={24} />}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============== HABIT ==============
interface HabitItemProps {
    item: Habit;
    selectedDate: string;
    onToggle: (id: number) => void;
    onItemClick: (id: number) => void;
}

export function HabitItem({ item, selectedDate, onToggle, onItemClick }: HabitItemProps) {
    const isDoneToday = item.history.includes(selectedDate);
    const [clickCount, setClickCount] = useState(0);

    // Generate last 27 days ending at selectedDate
    const baseDate = parseISO(selectedDate);
    const totalDays = 27;
    const heatmapDates = Array.from({ length: totalDays }).map((_, i) => {
        return format(subDays(baseDate, (totalDays - 1) - i), 'yyyy-MM-dd');
    });

    const completedCount = item.history.length;

    const handleCheckClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isDoneToday) {
            onToggle(item.id!);
            return;
        }

        setClickCount(prev => prev + 1);
        if (clickCount === 0) {
            setTimeout(() => setClickCount(0), 400); // 400ms window
        } else {
            onToggle(item.id!);
            setClickCount(0);
        }
    };

    return (
        <div className="habit-card" onClick={() => item.id && onItemClick(item.id)}>
            <div className="habit-card-header">
                <div className="habit-info">
                    <span className="habit-title">{item.title}</span>
                    <span className="habit-sub">
                        {item.description || `Выполнено раз: ${completedCount}`}
                    </span>
                </div>
                <div className="item-right">
                    <div className="badge badge-gold">
                        <img src="/Coin.png" alt="Coin" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                        <span>+{item.rewardCoins}</span>
                    </div>
                    <div className="habit-action">
                        <button
                            className={`habit-check-btn ${isDoneToday ? 'done' : ''} ${clickCount === 1 ? 'pre-clicked' : ''}`}
                            onClick={handleCheckClick}
                        >
                            {isDoneToday ? <CheckCircle2 size={24} color="#A855F7" /> : <Circle size={24} />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="habit-heatmap-grid">
                {heatmapDates.map(date => {
                    const isCompleted = item.history.includes(date);
                    return (
                        <div
                            key={date}
                            className={`habit-heatmap-cell ${isCompleted ? 'active' : ''}`}
                            title={date}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// ============== REWARD (ОТДЫХ) ==============
interface RewardItemProps {
    item: Reward;
    onItemClick: (id: number) => void;
}

export function RewardItem({ item, onItemClick }: RewardItemProps) {
    return (
        <div className="list-item reward-item" onClick={() => item.id && onItemClick(item.id)}>
            <div className="item-left-content">
                <div className="item-texts">
                    <span className="item-title">{item.title}</span>
                    <span className="item-sub">
                        {item.durationMinutes < 60
                            ? `${item.durationMinutes} мин`
                            : `${item.durationMinutes / 60} ч`}
                    </span>
                </div>
            </div>
            <div className="item-right">
                <div className="badge badge-red">
                    <img src="/Coin.png" alt="Coin" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                    <span>−{item.costCoins}</span>
                </div>
            </div>
        </div>
    );
}

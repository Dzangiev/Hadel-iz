import { useState } from 'react';
import { X, Calendar, Slash, AlertTriangle, ChevronRight } from 'lucide-react';
import type { Task } from '../db/db';
import { useSheetClose } from './useSheetClose';

interface NotificationsSheetProps {
    isOpen: boolean;
    onClose: () => void;
    overdueTasks: Task[];
    onTransfer: (taskId: number) => void;
    onSkip: (taskId: number) => void;
    onFail: (taskId: number) => void;
}

type ConfirmAction = {
    taskId: number;
    action: 'transfer' | 'skip' | 'fail';
    title: string;
} | null;

export function NotificationsSheet({
    isOpen,
    onClose,
    overdueTasks,
    onTransfer,
    onSkip,
    onFail,
}: NotificationsSheetProps) {
    const [confirm, setConfirm] = useState<ConfirmAction>(null);

    // Анимация закрытия главного шита
    const main = useSheetClose(isOpen, onClose);

    // Анимация закрытия экрана подтверждения
    const conf = useSheetClose(!!confirm, () => setConfirm(null));

    if (!isOpen) return null;

    const handleConfirm = () => {
        if (!confirm) return;
        if (confirm.action === 'transfer') onTransfer(confirm.taskId);
        else if (confirm.action === 'skip') onSkip(confirm.taskId);
        else if (confirm.action === 'fail') onFail(confirm.taskId);
        conf.requestClose();
    };

    const actionLabel = (action: 'transfer' | 'skip' | 'fail') => {
        if (action === 'transfer') return 'Перенести на сегодня';
        if (action === 'skip') return 'Оставить без штрафа';
        return 'Применить штраф';
    };

    const actionDesc = (action: 'transfer' | 'skip' | 'fail', coins: number) => {
        if (action === 'transfer') return 'Задача появится в сегодняшнем списке.';
        if (action === 'skip') return 'Задача будет закрыта без последствий.';
        return `С баланса спишется ${Math.abs(coins)} монет.`;
    };

    if (confirm) {
        return (
            <div
                className={`modal-overlay${conf.isClosing ? ' closing' : ''}`}
                onClick={conf.requestClose}
                onAnimationEnd={conf.handleAnimationEnd}
            >
                <div className="sheet-confirm-card" onClick={e => e.stopPropagation()}>
                    <div className="modal-handle" />
                    <div className="sheet-confirm-content">
                        <div className={`sheet-confirm-icon ${confirm.action}`}>
                            {confirm.action === 'transfer' && <Calendar size={28} />}
                            {confirm.action === 'skip' && <Slash size={28} />}
                            {confirm.action === 'fail' && <AlertTriangle size={28} />}
                        </div>
                        <h3 className="sheet-confirm-title">{actionLabel(confirm.action)}</h3>
                        <p className="sheet-confirm-desc">
                            «{confirm.title}»
                        </p>
                        <p className="sheet-confirm-subdesc">
                            {actionDesc(confirm.action, overdueTasks.find(t => t.id === confirm.taskId)?.rewardCoins ?? 0)}
                        </p>
                        <div className="sheet-confirm-actions">
                            <button
                                className="sheet-confirm-btn cancel"
                                onClick={conf.requestClose}
                            >
                                Отмена
                            </button>
                            <button
                                className={`sheet-confirm-btn confirm ${confirm.action}`}
                                onClick={handleConfirm}
                            >
                                Подтвердить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`modal-overlay${main.isClosing ? ' closing' : ''}`}
            onClick={main.requestClose}
            onAnimationEnd={main.handleAnimationEnd}
        >
            <div className="modal-content notif-sheet" onClick={e => e.stopPropagation()}>
                <div className="modal-handle" />

                {/* Nav bar */}
                <div className="modal-title-row">
                    <span className="modal-title">Уведомления</span>
                    <button className="icon-btn modal-close" onClick={main.requestClose} aria-label="Закрыть">
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="modal-body notif-body">
                    {overdueTasks.length === 0 ? (
                        <div className="notif-empty">
                            <span className="notif-empty-icon">🎉</span>
                            <p>Нет пропущенных дел</p>
                        </div>
                    ) : (
                        <>
                            <p className="notif-header-desc">
                                Невыполненные дела за прошлые дни. Выберите действие для каждого.
                            </p>
                            <div className="notif-list">
                                {overdueTasks.map(task => (
                                    <div key={task.id} className="notif-task-card">
                                        <div className="notif-task-info">
                                            <span className="notif-task-title">{task.title}</span>
                                            <div className="notif-task-meta">
                                                <span className="notif-task-date">{task.date}</span>
                                                <div className="badge badge-gold notif-task-coins">
                                                    <img
                                                        src={`${import.meta.env.BASE_URL}Coin.png`}
                                                        alt="Монеты"
                                                        style={{ width: 16, height: 16, objectFit: 'contain' }}
                                                    />
                                                    <span>{task.rewardCoins}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="notif-task-actions">
                                            <button
                                                className="notif-action-btn transfer"
                                                onClick={() => setConfirm({ taskId: task.id!, action: 'transfer', title: task.title })}
                                            >
                                                <Calendar size={14} />
                                                Перенести
                                                <ChevronRight size={13} style={{ opacity: 0.5, marginLeft: 'auto' }} />
                                            </button>
                                            <button
                                                className="notif-action-btn skip"
                                                onClick={() => setConfirm({ taskId: task.id!, action: 'skip', title: task.title })}
                                            >
                                                <Slash size={14} />
                                                Без штрафа
                                                <ChevronRight size={13} style={{ opacity: 0.5, marginLeft: 'auto' }} />
                                            </button>
                                            <button
                                                className="notif-action-btn fail"
                                                onClick={() => setConfirm({ taskId: task.id!, action: 'fail', title: task.title })}
                                            >
                                                <AlertTriangle size={14} />
                                                Со штрафом
                                                <ChevronRight size={13} style={{ opacity: 0.5, marginLeft: 'auto' }} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

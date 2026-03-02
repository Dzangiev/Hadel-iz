import { useState } from 'react';
import type { Task } from '../db/db';

interface PendingTasksModalProps {
    overdueTasks: Task[];
    onProcessTask: (taskId: number, action: 'transfer' | 'fail', reason?: string) => void;
}

export function PendingTasksModal({ overdueTasks, onProcessTask }: PendingTasksModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [reason, setReason] = useState('');

    if (overdueTasks.length === 0 || currentIndex >= overdueTasks.length) return null;

    const currentTask = overdueTasks[currentIndex];

    const handleNextTask = (action: 'transfer' | 'fail') => {
        onProcessTask(currentTask.id!, action, action === 'transfer' ? reason : undefined);
        setReason('');
        setCurrentIndex(prev => prev + 1);
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-handle" />
                <div className="modal-title-row">
                    <span className="modal-title">Вчерашние дела</span>
                </div>
                <div className="modal-body">
                    <p style={{ textAlign: 'center', fontSize: 15, color: 'var(--label-secondary)' }}>
                        У вас есть невыполненные дела с прошлых дней. Укажите причину для переноса или получите штраф.
                    </p>

                    <div style={{ background: 'var(--fill-secondary)', padding: '20px', borderRadius: '16px', marginTop: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <h3 style={{ fontSize: 19, marginBottom: 8 }}>{currentTask.title}</h3>
                        {currentTask.description && <p style={{ color: 'var(--label-secondary)', marginBottom: 12 }}>{currentTask.description}</p>}
                        <div className="badge badge-gold" style={{ marginBottom: 16 }}>
                            <img src="/Coin.png" alt="Coin" style={{ width: 22, height: 22, objectFit: 'contain' }} />
                            <span style={{ fontSize: 18 }}>{Math.abs(currentTask.rewardCoins)}</span>
                        </div>

                        <div className="input-group" style={{ width: '100%', textAlign: 'left' }}>
                            <label className="input-label">ПРИЧИНА НЕВЫПОЛНЕНИЯ</label>
                            <textarea
                                className="form-input"
                                placeholder="Почему не успели?"
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                style={{ minHeight: 80 }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                        <button
                            className="submit-btn"
                            onClick={() => handleNextTask('transfer')}
                            disabled={reason.trim().length === 0}
                            style={{ padding: '14px', borderRadius: '12px', opacity: reason.trim().length === 0 ? 0.5 : 1 }}
                        >
                            Перенести на сегодня
                        </button>
                        <button
                            onClick={() => handleNextTask('fail')}
                            style={{
                                padding: '14px', borderRadius: '12px', background: 'var(--ios-gray6)',
                                color: 'var(--ios-red)', fontSize: '16px', fontWeight: '600', border: 'none'
                            }}
                        >
                            Не выполнено (Штраф -{Math.abs(currentTask.rewardCoins)})
                        </button>
                    </div>

                    <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--label-tertiary)', marginTop: 8 }}>
                        Осталось разобрать: {overdueTasks.length - currentIndex}
                    </div>
                </div>
            </div>
        </div>
    );
}

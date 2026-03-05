import { useState } from 'react';
import { X, Check, CalendarDays } from 'lucide-react';
import { clsx } from 'clsx';
import { useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useSheetClose } from './useSheetClose';
import { CustomCalendar } from './CustomCalendar';

type ItemType = 'task' | 'habit' | 'reward';

interface CreateItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (type: ItemType, data: Record<string, unknown>, editId?: number) => void;
    onDelete?: (type: ItemType, id: number) => void;
    editItem?: { type: ItemType; id: number; data: any } | null;
    defaultDate: string; // ISO: yyyy-MM-dd
}

const DURATION_STEPS = [30, 60, 90, 120, 180, 240];

function formatDuration(minutes: number) {
    if (minutes < 60) return `${minutes} мин`;
    const h = minutes / 60;
    return `${h} ${h === 1 ? 'час' : h < 5 ? 'часа' : 'часов'}`;
}

export function CreateItemModal({ isOpen, onClose, onSave, editItem, onDelete, defaultDate }: CreateItemModalProps) {
    const [type, setType] = useState<ItemType>('task');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [rewardCoins, setRewardCoins] = useState(2);
    const [duration, setDuration] = useState(30);
    const [selectedDate, setSelectedDate] = useState(defaultDate);
    const [isCalOpen, setIsCalOpen] = useState(false);

    const { isClosing, requestClose, handleAnimationEnd } = useSheetClose(isOpen, onClose);

    useEffect(() => {
        if (isOpen && editItem) {
            setType(editItem.type);
            setTitle((editItem.data.title as string) || '');
            setDescription((editItem.data.description as string) || '');
            setRewardCoins((editItem.data.rewardCoins as number) || Math.abs((editItem.data.costCoins as number) || 2));
            if (editItem.type === 'reward') {
                setDuration((editItem.data.durationMinutes as number) || 30);
            }
        } else if (isOpen && !editItem) {
            setType('task');
            setTitle('');
            setDescription('');
            setRewardCoins(2);
            setDuration(30);
            setSelectedDate(defaultDate);
        }
    }, [isOpen, editItem, defaultDate]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        if (type === 'reward') {
            onSave(type, { title, description, durationMinutes: duration, costCoins: (duration / 30) * 10, date: selectedDate }, editItem ? editItem.id : undefined);
        } else if (type === 'task') {
            onSave(type, { title, description, rewardCoins, date: selectedDate }, editItem ? editItem.id : undefined);
        } else {
            onSave(type, { title, description, rewardCoins }, editItem ? editItem.id : undefined);
        }

        setTitle('');
        setDescription('');
        setRewardCoins(2);
        setDuration(30);
        onClose();
    };

    // For slider progress track tinting
    const sliderProgress = ((DURATION_STEPS.indexOf(duration)) / (DURATION_STEPS.length - 1)) * 100;

    return (
        <div
            className={`modal-overlay${isClosing ? ' closing' : ''}`}
            onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }}
            onAnimationEnd={handleAnimationEnd}
        >
            <div className="modal-content">
                <div className="modal-handle" />

                {/* iOS NavBar-style modal header */}
                <div className="modal-title-row">
                    <span className="modal-title">{editItem ? 'Редактировать' : 'Новое'}</span>
                    <button
                        className="icon-btn modal-close"
                        onClick={requestClose}
                        aria-label="Закрыть"
                    >
                        <X size={16} strokeWidth={2.5} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* iOS Segmented Control */}
                    {!editItem && (
                        <div className="type-selector">
                            {(['task', 'habit', 'reward'] as ItemType[]).map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    className={clsx('type-btn', type === t && `active-${t}`)}
                                    onClick={() => setType(t)}
                                >
                                    {t === 'task' ? '✅ Дело' : t === 'habit' ? '⚡ Привычка' : '🌙 Отдых'}
                                </button>
                            ))}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div className="input-group">
                            <label className="input-label">Название</label>
                            <input
                                type="text"
                                className="form-input"
                                placeholder={
                                    type === 'task' ? 'Например: Сходить в спортзал'
                                        : type === 'habit' ? 'Например: Выпить воды'
                                            : 'Например: Посмотреть кино'
                                }
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="input-group">
                            <label className="input-label">Описание</label>
                            <textarea
                                className="form-input"
                                placeholder="Необязательно"
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        {type !== 'reward' ? (
                            <div className="input-group">
                                <label className="input-label">Монетки за выполнение</label>
                                <div className="coins-selector">
                                    {[1, 2, 3, 4, 5].map(coin => (
                                        <button
                                            key={coin}
                                            type="button"
                                            className={clsx('coin-select-btn', rewardCoins === coin && 'active')}
                                            onClick={() => setRewardCoins(coin)}
                                        >
                                            {coin}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="input-group">
                                <label className="input-label">Длительность (10 монет / 30 мин)</label>
                                <div className="slider-container">
                                    <div className="slider-val">
                                        {formatDuration(duration)} — {(duration / 30) * 10} монет
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max={DURATION_STEPS.length - 1}
                                        step="1"
                                        className="form-slider"
                                        style={{ '--progress': `${sliderProgress}%` } as React.CSSProperties}
                                        value={DURATION_STEPS.indexOf(duration)}
                                        onChange={e => setDuration(DURATION_STEPS[Number(e.target.value)])}
                                    />
                                    {/* Tick marks */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingInline: 2 }}>
                                        {DURATION_STEPS.map(d => (
                                            <span key={d} style={{ fontSize: 11, color: 'var(--label-tertiary)' }}>
                                                {d < 60 ? `${d}м` : `${d / 60}ч`}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Дата — только для нового дела/отдыха */}
                        {!editItem && (type === 'task' || type === 'reward') && (
                            <div className="input-group">
                                <label className="input-label">Дата</label>
                                <button
                                    type="button"
                                    className="date-pick-btn"
                                    onClick={() => setIsCalOpen(true)}
                                >
                                    <CalendarDays size={16} strokeWidth={2} />
                                    <span>
                                        {format(parseISO(selectedDate), 'd MMMM, EEEEEE', { locale: ru }).replace(/^./, c => c.toUpperCase())}
                                    </span>
                                </button>
                                {isCalOpen && (
                                    <CustomCalendar
                                        value={selectedDate}
                                        onChange={(d) => { setSelectedDate(format(d, 'yyyy-MM-dd')); setIsCalOpen(false); }}
                                        onClose={() => setIsCalOpen(false)}
                                    />
                                )}
                            </div>
                        )}

                        <button type="submit" className="submit-btn" style={{ marginTop: 8 }}>
                            <Check size={18} strokeWidth={3} />
                            <span>Сохранить</span>
                        </button>
                        {editItem && onDelete && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (window.confirm('Вы уверены, что хотите удалить этот блок?')) {
                                        onDelete(editItem.type, editItem.id);
                                        requestClose();
                                    }
                                }}
                                style={{ padding: '14px', borderRadius: '12px', background: 'var(--fill-primary)', color: 'var(--ios-red)', fontSize: '16px', fontWeight: '500', border: 'none', transition: 'all 0.2s', marginTop: -8 }}
                            >
                                Удалить
                            </button>
                        )}
                    </form>
                </div>
            </div>
        </div>
    );
}
